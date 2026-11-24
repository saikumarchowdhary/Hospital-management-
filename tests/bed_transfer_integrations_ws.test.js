import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import WebSocket from 'ws';
import { transferBedTx } from '../services/admissions.js';
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

test('Bed Transfer Verification: valid transfer, occupied bed, invalid reason/same-bed, concurrent race, and DB rollback', async () => {
  const ctx = await startTestServer();
  try {
    const cm = ctx.createClient();
    await cm.login('case@demo.com', 'Case@123');
    const adm = ctx.createClient();
    await adm.login('admin@demo.com', 'Admin@123');

    const pats = (await cm.get('/api/patients')).data.patients;
    const pat1 = pats[0];
    const pat2 = pats[1];
    const docs = (await cm.get('/api/doctors')).data.doctors;
    const beds = (await cm.get('/api/beds')).data.beds;
    const availBeds = beds.filter((b) => b.status === 'Available');
    assert.ok(availBeds.length >= 3, 'Need at least 3 available beds for transfer tests');

    const bedOrigin1 = availBeds[0];
    const bedTarget = availBeds[1];
    const bedOrigin2 = availBeds[2];

    // Setup admission 1 on bedOrigin1
    let adm1 = (await cm.get('/api/admissions')).data.admissions.find((a) => a.patient_id === pat1.id && a.status !== 'Discharged');
    if (!adm1) {
      adm1 = (await cm.post('/api/admissions', {
        patient_id: pat1.id,
        department_id: docs[0].department_id,
        doctor_id: docs[0].id,
        admission_type: 'Emergency',
        reason: 'Bed transfer workflow test 1'
      })).data.admission;
    }
    const alloc1 = await cm.post(`/api/admissions/${adm1.id}/allocate-bed`, { bed_id: bedOrigin1.id });
    assert.equal(alloc1.status, 200);

    // Setup admission 2 on bedOrigin2
    let adm2 = (await cm.get('/api/admissions')).data.admissions.find((a) => a.patient_id === pat2.id && a.status !== 'Discharged');
    if (!adm2) {
      adm2 = (await cm.post('/api/admissions', {
        patient_id: pat2.id,
        department_id: docs[0].department_id,
        doctor_id: docs[0].id,
        admission_type: 'Elective',
        reason: 'Bed transfer workflow test 2'
      })).data.admission;
    }
    const alloc2 = await cm.post(`/api/admissions/${adm2.id}/allocate-bed`, { bed_id: bedOrigin2.id });
    assert.equal(alloc2.status, 200);

    // 1. Missing/empty reason rejected (400)
    const missingReason = await cm.post('/api/admissions/transfer', {
      from_bed_id: bedOrigin1.id,
      to_bed_id: bedTarget.id,
      reason: '   '
    });
    assert.equal(missingReason.status, 400);

    // 2. Same origin and destination rejected (400)
    const sameBed = await cm.post('/api/admissions/transfer', {
      from_bed_id: bedOrigin1.id,
      to_bed_id: bedOrigin1.id,
      reason: 'Invalid same bed'
    });
    assert.equal(sameBed.status, 400);

    // 3. Missing bed ID rejected (404)
    const missingBed = await cm.post('/api/admissions/transfer', {
      from_bed_id: bedOrigin1.id,
      to_bed_id: 999999,
      reason: 'Non-existent bed'
    });
    assert.equal(missingBed.status, 404);

    // 4. Occupied destination bed rejected (409)
    const occupiedDest = await cm.post('/api/admissions/transfer', {
      from_bed_id: bedOrigin1.id,
      to_bed_id: bedOrigin2.id,
      reason: 'Attempt move into occupied bed'
    });
    assert.equal(occupiedDest.status, 409);

    // 5. Database rollback verification when transaction aborts mid-way
    const beforeBeds = ctx.db.all('SELECT id, status FROM beds WHERE id IN (?, ?)', [bedOrigin1.id, bedTarget.id]);
    const throwingBroker = {
      publish() {
        throw new Error('Simulated downstream failure forcing rollback');
      }
    };
    assert.throws(() => {
      transferBedTx(ctx.db, throwingBroker, {
        fromBedId: bedOrigin1.id,
        toBedId: bedTarget.id,
        reason: 'Rollback check transfer',
        actor: { id: 1, role: 'admin' }
      });
    }, /Simulated downstream failure/);
    const afterRollbackBeds = ctx.db.all('SELECT id, status FROM beds WHERE id IN (?, ?)', [bedOrigin1.id, bedTarget.id]);
    assert.deepEqual(afterRollbackBeds, beforeBeds, 'Transaction rollback must preserve original bed statuses');
    assert.equal(ctx.db.get('SELECT COUNT(*) as c FROM bed_transfers').c, 0, 'Transaction rollback must not persist bed_transfers');

    // 6. Concurrent transfer race test: pat1 and pat2 simultaneously target bedTarget
    const [race1, race2] = await Promise.all([
      cm.post('/api/admissions/transfer', {
        from_bed_id: bedOrigin1.id,
        to_bed_id: bedTarget.id,
        reason: 'Concurrent race transfer A'
      }),
      cm.post('/api/admissions/transfer', {
        from_bed_id: bedOrigin2.id,
        to_bed_id: bedTarget.id,
        reason: 'Concurrent race transfer B'
      })
    ]);

    const statuses = [race1.status, race2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409], 'Exactly one concurrent transfer must succeed (201) and the other must conflict (409)');

    // Verify history + audit diff recorded cleanly
    const transfersRes = await cm.get('/api/admissions/transfers');
    assert.equal(transfersRes.status, 200);
    assert.equal(transfersRes.data.transfers.length, 1);
    const auditRow = ctx.db.get("SELECT * FROM audit_logs WHERE action = 'bed.transferred' ORDER BY id DESC LIMIT 1");
    assert.ok(auditRow);
    const parsedDetails = JSON.parse(auditRow.details);
    assert.ok(parsedDetails.before && parsedDetails.after);
    assert.equal(parsedDetails.after.bed_code, bedTarget.bed_code);
  } finally {
    await ctx.close();
  }
});

test('Integrations: status reporting (NOT CONFIGURED), HMAC webhook payment reconciliation & idempotency, SMS/Email/WhatsApp sandbox', async () => {
  const ctx = await startTestServer();
  try {
    const adm = ctx.createClient();
    await adm.login('admin@demo.com', 'Admin@123');
    const doc = ctx.createClient();
    await doc.login('doctor@demo.com', 'Doctor@123');

    // 1. Live credentials absent -> accurately reports NOT CONFIGURED
    const statusRes = await adm.get('/api/integrations/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.status.paymentGateway.status, 'NOT CONFIGURED');
    assert.equal(statusRes.data.status.sms.status, 'NOT CONFIGURED');
    assert.equal(statusRes.data.status.email.status, 'NOT CONFIGURED');
    assert.equal(statusRes.data.status.whatsapp.status, 'NOT CONFIGURED');
    assert.equal(statusRes.data.status.pacsDicom.status, 'NOT CONFIGURED');

    // 2. Payment Webhook HMAC verification & invoice reconciliation
    const invRes = await adm.get('/api/billing/invoices');
    const pendingInv = invRes.data.invoices.find((i) => Number(i.balance_due) > 0);
    assert.ok(pendingInv, 'Need a pending invoice for webhook reconciliation');
    const initialBalance = Number(pendingInv.balance_due);
    const payAmount = Math.min(25, initialBalance);

    const payloadObj = {
      id: `evt_test_${Date.now()}`,
      type: 'payment.succeeded',
      provider: 'stripe_sandbox',
      data: {
        invoice_id: pendingInv.id,
        amount: payAmount,
        method: 'Sandbox Card Webhook'
      }
    };
    const rawPayload = JSON.stringify(payloadObj);

    // Invalid signature -> 401
    const badSigRes = await fetch(`${ctx.baseUrl}/api/integrations/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sandbox-Mode': 'true',
        'X-Webhook-Signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
      },
      body: rawPayload
    });
    assert.equal(badSigRes.status, 401);

    // Valid HMAC-SHA256 signature -> 200
    const sig = crypto.createHmac('sha256', 'medicore-sandbox-webhook-key').update(rawPayload).digest('hex');
    const okSigRes = await fetch(`${ctx.baseUrl}/api/integrations/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sandbox-Mode': 'true',
        'X-Webhook-Signature': `sha256=${sig}`
      },
      body: rawPayload
    });
    assert.equal(okSigRes.status, 200);
    const okData = await okSigRes.json();
    assert.equal(okData.ok, true);
    assert.equal(okData.duplicate, false);

    // Duplicate webhook -> idempotent, no double payment
    const dupSigRes = await fetch(`${ctx.baseUrl}/api/integrations/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sandbox-Mode': 'true',
        'X-Webhook-Signature': `sha256=${sig}`
      },
      body: rawPayload
    });
    assert.equal(dupSigRes.status, 200);
    const dupData = await dupSigRes.json();
    assert.equal(dupData.duplicate, true);

    const updatedInv = (await adm.get('/api/billing/invoices')).data.invoices.find((i) => i.id === pendingInv.id);
    assert.equal(Number(updatedInv.balance_due), Number((initialBalance - payAmount).toFixed(2)));

    // 3. SMS, Email, WhatsApp sandbox & live block tests
    const smsRes = await adm.post('/api/integrations/notify/test', {
      channel: 'sms',
      recipient: '+15550199',
      message: 'Appointment reminder sandbox check',
      sandbox: true
    });
    assert.equal(smsRes.status, 201);
    assert.equal(smsRes.data.delivery.mode, 'Sandbox');

    const emailRes = await adm.post('/api/integrations/notify/test', {
      channel: 'email',
      recipient: 'patient@demo.com',
      subject: 'Lab Report Ready',
      message: 'Your lab report has been released.',
      sandbox: true
    });
    assert.equal(emailRes.status, 201);

    const waRes = await adm.post('/api/integrations/notify/test', {
      channel: 'whatsapp',
      recipient: '+15550188',
      message: 'Discharge instructions delivered',
      sandbox: true
    });
    assert.equal(waRes.status, 201);

    // Invalid email blocked (400)
    const badEmail = await adm.post('/api/integrations/notify/test', {
      channel: 'email',
      recipient: 'not-an-email',
      message: 'Test',
      sandbox: true
    });
    assert.equal(badEmail.status, 400);

    // Non-admin live mode blocked (403), Admin live mode without credentials -> 503 NOT CONFIGURED
    const nonAdmLive = await doc.post('/api/integrations/notify/test', {
      channel: 'sms',
      recipient: '+15550199',
      message: 'Test',
      sandbox: false
    });
    assert.equal(nonAdmLive.status, 403);

    const admLive = await adm.post('/api/integrations/notify/test', {
      channel: 'sms',
      recipient: '+15550199',
      message: 'Test',
      sandbox: false
    });
    assert.equal(admLive.status, 503);
  } finally {
    await ctx.close();
  }
});

test('WebSocket Multi-User Sync & RBAC Matrix: live broadcasts across multiple authenticated users', async () => {
  const ctx = await startTestServer();
  let wsNurse;
  let wsAdmin;
  try {
    // 1. Unauthenticated WebSocket upgrade must fail
    await assert.rejects(() => connectWs(`${ctx.wsBaseUrl}/ws`), /401|Unexpected server response/);

    // 2. Authenticate Nurse & Admin and open concurrent WebSocket connections
    const nurseClient = ctx.createClient();
    const nurseLogin = await nurseClient.login('nurse@demo.com', 'Nurse@123');
    const adminClient = ctx.createClient();
    const adminLogin = await adminClient.login('admin@demo.com', 'Admin@123');
    const patClient = ctx.createClient();
    await patClient.login('patient@demo.com', 'Patient@123');
    const pharmClient = ctx.createClient();
    await pharmClient.login('pharmacy@demo.com', 'Pharmacy@123');

    wsNurse = await connectWs(`${ctx.wsBaseUrl}/ws?token=${encodeURIComponent(nurseLogin.data.token)}`);
    wsAdmin = await connectWs(`${ctx.wsBaseUrl}/ws?token=${encodeURIComponent(adminLogin.data.token)}`);

    const nurseConnMsg = await waitForWsEvent(wsNurse, (m) => m.eventType === 'connected');
    assert.equal(nurseConnMsg.role, 'nurse');
    const adminConnMsg = await waitForWsEvent(wsAdmin, (m) => m.eventType === 'connected');
    assert.equal(adminConnMsg.role, 'admin');

    // Ping/pong heartbeat
    wsNurse.ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await waitForWsEvent(wsNurse, (m) => m.eventType === 'pong');
    assert.ok(pong.ts);

    // 3. Perform bed transfer as Admin -> both Nurse and Admin WS receive bed:transferred
    const cm = ctx.createClient();
    await cm.login('case@demo.com', 'Case@123');
    const pats = (await cm.get('/api/patients')).data.patients;
    const docs = (await cm.get('/api/doctors')).data.doctors;
    const availBeds = (await cm.get('/api/beds')).data.beds.filter((b) => b.status === 'Available');
    let adm = (await cm.get('/api/admissions')).data.admissions.find((a) => a.patient_id === pats[0].id && a.status !== 'Discharged');
    if (!adm) {
      adm = (await cm.post('/api/admissions', {
        patient_id: pats[0].id,
        department_id: docs[0].department_id,
        doctor_id: docs[0].id,
        admission_type: 'Elective',
        reason: 'WS sync test'
      })).data.admission;
    }
    await cm.post(`/api/admissions/${adm.id}/allocate-bed`, { bed_id: availBeds[0].id });

    const transferPromiseNurse = waitForWsEvent(wsNurse, (m) => m.eventType === 'bed:transferred');
    const transferPromiseAdmin = waitForWsEvent(wsAdmin, (m) => m.eventType === 'bed:transferred');

    const trRes = await cm.post('/api/admissions/transfer', {
      from_bed_id: availBeds[0].id,
      to_bed_id: availBeds[1].id,
      reason: 'WS multi-user sync verification'
    });
    assert.equal(trRes.status, 201);

    const [evNurse, evAdmin] = await Promise.all([transferPromiseNurse, transferPromiseAdmin]);
    assert.equal(evNurse.toBedCode, availBeds[1].bed_code);
    assert.equal(evAdmin.toBedCode, availBeds[1].bed_code);

    // 4. RBAC Enforcement Checks
    assert.equal((await patClient.get('/api/admin/overview')).status, 403);
    assert.equal((await patClient.get('/api/admissions')).status, 403);
    assert.equal((await patClient.get('/api/integrations/status')).status, 403);
    assert.equal((await pharmClient.get('/api/hr/employees')).status, 403);
    assert.equal((await pharmClient.post('/api/admissions/transfer', { from_bed_id: 1, to_bed_id: 2, reason: 'Unauthorized' })).status, 403);
    assert.equal((await nurseClient.get('/api/billing/ledger')).status, 403);
  } finally {
    if (wsNurse?.ws) wsNurse.ws.close();
    if (wsAdmin?.ws) wsAdmin.ws.close();
    await ctx.close();
  }
});
