import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

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
