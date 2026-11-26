import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Prescriptions PDF metadata, QR Verification, UPI QR Bills, Razorpay HMAC, and Admin Filters', async () => {
  const ctx = await startTestServer();
  try {
    const doc = ctx.createClient();
    await doc.login('doctor@demo.com', 'Doctor@123');

    const pat = ctx.createClient();
    await pat.login('patient@demo.com', 'Patient@123');

    const staff = ctx.createClient();
    await staff.login('accounts@demo.com', 'Accounts@123');

    const admin = ctx.createClient();
    await admin.login('admin@demo.com', 'Admin@123');

    // Find seeded patient profile id for patient@demo.com and create a second patient to test isolation
    const patientsRes = await doc.get('/api/patients');
    assert.equal(patientsRes.status, 200);
    const demoPat = patientsRes.data.patients.find((p) => p.email === 'patient@demo.com');
    assert.ok(demoPat, 'Demo patient profile should exist');

    const regOther = await ctx.createClient().post('/api/auth/register', {
      account_type: 'patient',
      full_name: 'Other Isolated Patient',
      email: `other.pat.${Date.now()}@example.com`,
      mobile: '+1-555-8811',
      password: 'Password@123',
      consent: true
    });
    assert.equal(regOther.status, 201);
    const otherPat = ctx.createClient();
    await otherPat.login(regOther.data.user.email, 'Password@123');

    // 1. Doctor writes multi-medicine prescription
    const rxRes = await doc.post('/api/clinical/prescriptions', {
      patient_id: demoPat.id,
      diagnosis: 'Acute Bacterial Sinusitis',
      symptoms: 'Facial pressure, nasal congestion',
      medicines: [
        { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: '1-0-1', duration: '7 days', instructions: 'After meals' },
        { name: 'Paracetamol 650mg', dosage: '650mg', frequency: 'SOS', duration: '3 days', instructions: 'If fever > 100F' }
      ],
      tests_recommended: ['CBC', 'Sinus X-Ray'],
      advice: 'Steam inhalation twice daily and warm fluids',
      follow_up_date: '2026-12-15'
    });
    assert.equal(rxRes.status, 201);
    const createdRx = rxRes.data.prescription;
    assert.ok(createdRx.prescription_ref.startsWith('RX-'));
    assert.equal(createdRx.medicines.length, 2);
    assert.equal(createdRx.tests_recommended.length, 2);

    // 2. Patient views own prescription; other patient is blocked
    const patRxList = await pat.get('/api/clinical/prescriptions');
    assert.equal(patRxList.status, 200);
    assert.ok(patRxList.data.prescriptions.some((r) => r.id === createdRx.id));

    const otherSingleRx = await otherPat.get(`/api/clinical/prescriptions/${createdRx.id}`);
    assert.equal(otherSingleRx.status, 403);

    // 3. Public QR verification endpoint (unauthenticated, no PHI)
    const anon = ctx.createClient();
    const verifyRes = await anon.get(`/api/prescriptions/verify/${encodeURIComponent(createdRx.prescription_ref)}`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.valid, true);
    assert.equal(verifyRes.data.verification.prescription_ref, createdRx.prescription_ref);
    assert.ok(verifyRes.data.verification.doctor_name);
    assert.equal(verifyRes.data.verification.patient_name, undefined);

    // 4. Staff creates a bill for demo patient (patient cannot create bills -> 403)
    const patCreateBill = await pat.post('/api/billing/bills', {
      patient_id: demoPat.id,
      bill_type: 'consultation',
      description: 'Unauthorized self bill',
      amount: 100
    });
    assert.equal(patCreateBill.status, 403);

    const createBill = await staff.post('/api/billing/bills', {
      patient_id: demoPat.id,
      bill_type: 'lab test',
      description: 'CBC & Sinus X-Ray Panel',
      amount: 1250
    });
    assert.equal(createBill.status, 201);
    const bill = createBill.data.bill;
    assert.equal(bill.status, 'pending');
    assert.equal(bill.bill_type, 'lab test');

    // Other patient cannot view or submit UPI for demo patient's bill
    const otherSubmit = await otherPat.post(`/api/billing/bills/${bill.id}/submit-upi`, {
      transaction_id: 'UTR999999999'
    });
    assert.equal(otherSubmit.status, 403);

    // 5. Patient submits UPI Transaction ID -> verification_pending (never auto-paid)
    const subUpi = await pat.post(`/api/billing/bills/${bill.id}/submit-upi`, {
      transaction_id: '432819045612'
    });
    assert.equal(subUpi.status, 200);
    assert.equal(subUpi.data.bill.status, 'verification_pending');
    assert.equal(subUpi.data.bill.transaction_id, '432819045612');

    // Patient cannot confirm own bill as paid
    const patConfirm = await pat.post(`/api/billing/bills/${bill.id}/confirm`, { decision: 'paid' });
    assert.equal(patConfirm.status, 403);

    // 6. Staff confirms payment -> paid + RCPT generated
    const staffConfirm = await staff.post(`/api/billing/bills/${bill.id}/confirm`, { decision: 'paid' });
    assert.equal(staffConfirm.status, 200);
    assert.equal(staffConfirm.data.bill.status, 'paid');
    assert.ok(staffConfirm.data.bill.receipt_number.startsWith('RCPT-'));
    assert.ok(staffConfirm.data.bill.paid_at);

    // 7. Razorpay server-side HMAC-SHA256 verification
    const bill2Res = await staff.post('/api/billing/bills', {
      patient_id: demoPat.id,
      bill_type: 'consultation',
      description: 'Follow-up Consultation',
      amount: 600
    });
    assert.equal(bill2Res.status, 201);
    const bill2 = bill2Res.data.bill;

    const prevSecret = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_SECRET = 'test_rzp_secret_12345';
    try {
      const badVerify = await pat.post(`/api/billing/bills/${bill2.id}/verify-razorpay`, {
        razorpay_order_id: 'order_test_001',
        razorpay_payment_id: 'pay_test_001',
        razorpay_signature: 'invalid_signature_hex'
      });
      assert.equal(badVerify.status, 400);

      const goodSig = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update('order_test_001|pay_test_001')
        .digest('hex');

      const goodVerify = await pat.post(`/api/billing/bills/${bill2.id}/verify-razorpay`, {
        razorpay_order_id: 'order_test_001',
        razorpay_payment_id: 'pay_test_001',
        razorpay_signature: goodSig
      });
      assert.equal(goodVerify.status, 200);
      assert.equal(goodVerify.data.bill.status, 'paid');
      assert.equal(goodVerify.data.bill.payment_method, 'Razorpay');
    } finally {
      if (prevSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
      else process.env.RAZORPAY_KEY_SECRET = prevSecret;
    }

    // 8. Admin filterable prescriptions & payments endpoints (blocked for non-admins)
    const patAdminRx = await pat.get('/api/admin/prescriptions');
    assert.equal(patAdminRx.status, 403);

    const adminRx = await admin.get(`/api/admin/prescriptions?q=${encodeURIComponent(createdRx.prescription_ref)}`);
    assert.equal(adminRx.status, 200);
    assert.equal(adminRx.data.prescriptions.length, 1);

    const adminPay = await admin.get('/api/admin/payments?status=paid');
    assert.equal(adminPay.status, 200);
    assert.ok(adminPay.data.payments.some((p) => p.id === bill.id));
    assert.ok(adminPay.data.summary.paidTotal >= 1850);
  } finally {
    await ctx.close();
  }
});
