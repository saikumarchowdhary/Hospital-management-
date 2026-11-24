import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { startTestServer } from './helpers.js';

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(String(data)));
      } catch {
        messages.push(String(data));
      }
    });
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

function waitForWsEvent(wsObj, predicate, timeoutMs = 4000) {
  const existing = wsObj.messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for WebSocket event'));
    }, timeoutMs);
    const handler = (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (predicate(msg)) {
          clearTimeout(timer);
          wsObj.ws.off('message', handler);
          resolve(msg);
        }
      } catch {}
    };
    wsObj.ws.on('message', handler);
  });
}

test('Pharmacy & Billing: medicine/batch, dispense stock reduction, insufficient stock block, payment, idempotency, refund, CSV', async () => {
  const ctx = await startTestServer();
  try {
    const phm = ctx.createClient();
    await phm.login('pharmacy@demo.com', 'Pharmacy@123');
    const doc = ctx.createClient();
    await doc.login('doctor@demo.com', 'Doctor@123');
    const acc = ctx.createClient();
    await acc.login('accounts@demo.com', 'Accounts@123');

    // Add new medicine & batch (initial qty = 5)
    const medRes = await phm.post('/api/pharmacy/medicines', {
      sku: 'MED-TEST-99',
      name: 'Cefixime 200mg',
      generic_name: 'Cefixime',
      unit_price: 4.5,
      reorder_level: 10
    });
    assert.equal(medRes.status, 201);
    const med = medRes.data.medicine;

    const batchRes = await phm.post('/api/pharmacy/batches', {
      medicine_id: med.id,
      batch_number: 'BCH-TEST-01',
      expiry_date: '2028-01-31',
      quantity: 5,
      cost_price: 2.0
    });
    assert.equal(batchRes.status, 201);

    const pat = (await doc.get('/api/patients')).data.patients.find((p) => p.patient_code === 'MRN-1001');

    // Doctor prescribes quantity 10 (exceeds stock 5) -> Pharmacy dispense must reject (409)
    const cOver = await doc.post('/api/clinical/consultations', {
      patient_id: pat.id,
      chief_complaint: 'Bacterial infection',
      diagnosis_text: 'Acute sinusitis',
      prescription_items: [{ medicine_id: med.id, medicine_name: med.name, dosage: '200mg', frequency: 'BID', duration: '5 days', quantity: 10 }]
    });
    assert.equal(cOver.status, 201);

    const overDisp = await phm.post(`/api/pharmacy/prescriptions/${cOver.data.rxId}/dispense`, {});
    assert.equal(overDisp.status, 409);

    // Doctor prescribes quantity 3 -> Dispense succeeds and reduces stock from 5 to 2 + creates invoice
    const cOk = await doc.post('/api/clinical/consultations', {
      patient_id: pat.id,
      chief_complaint: 'Follow-up infection',
      diagnosis_text: 'Resolving sinusitis',
      prescription_items: [{ medicine_id: med.id, medicine_name: med.name, dosage: '200mg', frequency: 'OD', duration: '3 days', quantity: 3 }]
    });
    assert.equal(cOk.status, 201);

    const dispOk = await phm.post(`/api/pharmacy/prescriptions/${cOk.data.rxId}/dispense`, {});
    assert.equal(dispOk.status, 200);
    assert.ok(dispOk.data.invoice.id);

    const invAfter = (await phm.get('/api/pharmacy/inventory')).data.medicines.find((m) => m.id === med.id);
    assert.equal(invAfter.total_quantity, 2);

    // Billing: record simulated payment with idempotency key, test duplicate block, then refund + CSV export
    const rxInvoice = dispOk.data.invoice;
    const pay1 = await acc.post('/api/billing/payments', {
      invoice_id: rxInvoice.id,
      amount: rxInvoice.balance_due,
      method: 'Demo Simulation Card',
      idempotency_key: 'idem-test-001'
    });
    assert.equal(pay1.status, 201);
    assert.ok(pay1.data.payment.receipt_number);

    // Duplicate idempotency key blocked (409)
    const payDup = await acc.post('/api/billing/payments', {
      invoice_id: rxInvoice.id,
      amount: rxInvoice.balance_due,
      idempotency_key: 'idem-test-001'
    });
    assert.equal(payDup.status, 409);

    // Refund payment
    const ref = await acc.post('/api/billing/refunds', {
      payment_id: pay1.data.payment.id,
      reason: 'Customer return'
    });
    assert.equal(ref.status, 201);

    // Financial CSV report export
    const csv = await acc.get('/api/reports/export.csv?type=revenue');
    assert.equal(csv.status, 200);
    assert.ok(csv.data.includes('invoice_number'));
  } finally {
    await ctx.close();
  }
});

test('Pharmacy Real-Time WebSockets: stock levels, batch receipt, physical count adjustment, critical low-stock alerting', async () => {
  const ctx = await startTestServer();
  let wsPharmacist = null;
  try {
    const phm = ctx.createClient();
    const loginRes = await phm.login('pharmacy@demo.com', 'Pharmacy@123');
    assert.equal(loginRes.status, 200);
    const token = loginRes.data.token;

    // Connect WebSocket
    wsPharmacist = await connectWs(`${ctx.wsBaseUrl}/ws?token=${encodeURIComponent(token)}`);
    const connEv = await waitForWsEvent(wsPharmacist, (m) => m.eventType === 'connected');
    assert.equal(connEv.role, 'pharmacist');

    // 1. Add new medicine with reorder level 15
    const medRes = await phm.post('/api/pharmacy/medicines', {
      sku: 'MED-WS-CRIT',
      name: 'Epinephrine 1mg/ml',
      generic_name: 'Adrenaline',
      unit_price: 12.0,
      reorder_level: 15,
      unit: 'Ampoule'
    });
    assert.equal(medRes.status, 201);
    const med = medRes.data.medicine;

    // 2. Inbound batch receipt (quantity = 20) -> should trigger pharmacy:stock_updated
    const batchPromise = waitForWsEvent(wsPharmacist, (m) => m.eventType === 'pharmacy:stock_updated' && m.medicineId === med.id);
    const batchRes = await phm.post('/api/pharmacy/batches', {
      medicine_id: med.id,
      batch_number: 'BCH-EPI-001',
      expiry_date: '2028-06-30',
      quantity: 20,
      cost_price: 6.0
    });
    assert.equal(batchRes.status, 201);
    const batchEvent = await batchPromise;
    assert.equal(batchEvent.totalQuantity, 20);
    assert.equal(batchEvent.isLowStock, false);

    // 3. Stock Adjustment down to 3 units (below reorder 15 AND critical <=5)
    // -> should trigger both pharmacy:stock_updated AND pharmacy:low_stock with isCritical: true
    const stockUpdatePromise = waitForWsEvent(
      wsPharmacist,
      (m) => m.eventType === 'pharmacy:stock_updated' && m.medicineId === med.id && m.action === 'adjusted'
    );
    const lowStockPromise = waitForWsEvent(
      wsPharmacist,
      (m) => (m.eventType === 'low-stock' || m.eventType === 'pharmacy:low_stock') && m.medicineId === med.id
    );

    const adjRes = await phm.post('/api/pharmacy/adjust-stock', {
      medicine_id: med.id,
      quantity_delta: -17, // 20 - 17 = 3
      reason: 'Physical Inventory Count',
      notes: 'Emergency cart restocking reconciliation'
    });
    assert.equal(adjRes.status, 200);
    assert.equal(adjRes.data.newTotal, 3);

    const [stockEv, lowStockEv] = await Promise.all([stockUpdatePromise, lowStockPromise]);
    assert.equal(stockEv.totalQuantity, 3);
    assert.equal(stockEv.isCritical, true);
    assert.equal(stockEv.isLowStock, true);

    assert.equal(lowStockEv.totalQuantity, 3);
    assert.equal(lowStockEv.isCritical, true);
    assert.ok(lowStockEv.message.includes('CRITICAL'));

    // 4. Verify inventory endpoint provides summary metrics
    const inv = await phm.get('/api/pharmacy/inventory');
    assert.equal(inv.status, 200);
    assert.ok(inv.data.summary);
    assert.ok(inv.data.summary.totalMedicines > 0);
    assert.ok(inv.data.summary.criticalCount >= 1);
    assert.ok(inv.data.summary.lowStockCount >= 1);

    // 5. Verify movements ledger recorded adjustment
    const movs = await phm.get('/api/pharmacy/movements');
    assert.equal(movs.status, 200);
    assert.ok(movs.data.movements.length > 0);
    const targetMov = movs.data.movements.find((m) => m.medicine_id === med.id);
    assert.ok(targetMov);
    assert.equal(targetMov.quantity_delta, -17);
  } finally {
    if (wsPharmacist?.ws) wsPharmacist.ws.close();
    await ctx.close();
  }
});
