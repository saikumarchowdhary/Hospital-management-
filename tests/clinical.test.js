import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Clinical: doctor consult/Rx/lab, nurse vitals, role isolation, unreleased lab visibility gate', async () => {
  const ctx = await startTestServer();
  try {
    const doc = ctx.createClient();
    await doc.login('doctor@demo.com', 'Doctor@123');
    const pat = ctx.createClient();
    await pat.login('patient@demo.com', 'Patient@123');
    const nurse = ctx.createClient();
    await nurse.login('nurse@demo.com', 'Nurse@123');
    const acc = ctx.createClient();
    await acc.login('accounts@demo.com', 'Accounts@123');
    const lab = ctx.createClient();
    await lab.login('lab@demo.com', 'Lab@123');

    const patList = await doc.get('/api/patients');
    const patient = patList.data.patients.find((p) => p.patient_code === 'MRN-1001');
    assert.ok(patient);

    // Accountant blocked from clinical records (403)
    const blocked = await acc.get(`/api/clinical/records/${patient.id}`);
    assert.equal(blocked.status, 403);

    // Nurse records vitals
    const vitals = await nurse.post('/api/nursing/vitals', {
      patient_id: patient.id,
      blood_pressure: '122/78',
      temperature: 37.1,
      respiratory_rate: 16,
      pulse: 72,
      oxygen_saturation: 99
    });
    assert.equal(vitals.status, 201);

    // Patient dashboard and doctor patient detail expose 30-day vitals history
    const patDash = await pat.get('/api/patients/me/dashboard');
    assert.equal(patDash.status, 200);
    assert.ok(Array.isArray(patDash.data.vitals) && patDash.data.vitals.length >= 2);
    const docPatDetail = await doc.get(`/api/patients/${patient.id}`);
    assert.equal(docPatDetail.status, 200);
    assert.ok(Array.isArray(docPatDetail.data.clinical?.vitals) && docPatDetail.data.clinical.vitals.length >= 2);
    assert.ok(docPatDetail.data.clinical.vitals.some((v) => v.pulse === 72 && v.blood_pressure === '122/78'));

    // Doctor submits consultation + diagnosis + prescription + lab order (Lipid Profile)
    const testsRes = await doc.get('/api/laboratory/tests');
    const lipidTest = testsRes.data.tests.find((t) => t.code === 'LIPID');
    const consult = await doc.post('/api/clinical/consultations', {
      patient_id: patient.id,
      chief_complaint: 'Intermittent palpitations',
      diagnosis_text: 'Mild dyslipidemia',
      icd_code: 'E78.5',
      prescription_items: [{ medicine_id: 1, medicine_name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Once daily', duration: '14 days', quantity: 14 }],
      lab_test_ids: [lipidTest.id]
    });
    assert.equal(consult.status, 201);
    assert.ok(consult.data.invoice.id);

    // Find newly ordered Lipid order
    const labOrders = await lab.get('/api/laboratory/orders');
    const newOrder = labOrders.data.orders.find((o) => o.test_code === 'LIPID' && o.patient_id === patient.id);
    assert.ok(newOrder);
    assert.equal(newOrder.status, 'Ordered');

    // Collect specimen & enter results (Awaiting Review) — must remain hidden from patient
    await lab.post(`/api/laboratory/orders/${newOrder.id}/specimen`, { specimen_type: 'Serum' });
    await lab.patch(`/api/laboratory/orders/${newOrder.id}/processing`, {});
    await lab.post(`/api/laboratory/orders/${newOrder.id}/results`, { result_value: '215', abnormal_flag: 'High', notes: 'Borderline elevated' });

    const patRecBefore = await pat.get(`/api/clinical/records/${patient.id}`);
    assert.equal(patRecBefore.status, 200);
    assert.equal(patRecBefore.data.labReports.some((r) => r.id === newOrder.id), false);

    // Release result -> visible to patient
    const release = await lab.post(`/api/laboratory/orders/${newOrder.id}/release`, {});
    assert.equal(release.status, 200);
    const patRecAfter = await pat.get(`/api/clinical/records/${patient.id}`);
    assert.equal(patRecAfter.data.labReports.some((r) => r.id === newOrder.id && r.result_value === '215'), true);
  } finally {
    await ctx.close();
  }
});
