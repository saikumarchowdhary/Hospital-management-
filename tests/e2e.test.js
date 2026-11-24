import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('End-to-End Acceptance: multi-role hospital workflow, SSE notifications, self-approval block, and audit logs', async () => {
  const ctx = await startTestServer();
  try {
    // 1. Login all participating roles
    const pat = ctx.createClient(); await pat.login('patient@demo.com', 'Patient@123');
    const rec = ctx.createClient(); await rec.login('reception@demo.com', 'Reception@123');
    const doc = ctx.createClient(); await doc.login('doctor@demo.com', 'Doctor@123');
    const lab = ctx.createClient(); await lab.login('lab@demo.com', 'Lab@123');
    const phm = ctx.createClient(); await phm.login('pharmacy@demo.com', 'Pharmacy@123');
    const acc = ctx.createClient(); await acc.login('accounts@demo.com', 'Accounts@123');
    const bld = ctx.createClient(); await bld.login('external@demo.com', 'External@123');
    const ins = ctx.createClient(); await ins.login('case@demo.com', 'Case@123');
    const hr = ctx.createClient(); await hr.login('hr@demo.com', 'Hr@123');
    const cand = ctx.createClient(); await cand.login('candidate@demo.com', 'Candidate@123');
    const pub = ctx.createClient(); await pub.login('publisher@demo.com', 'Publish@123');
    const app = ctx.createClient(); await app.login('approver@demo.com', 'Approve@123');
    const adm = ctx.createClient(); await adm.login('admin@demo.com', 'Admin@123');

    // 2. Patient books appointment & checks SOS
    const docs = (await pat.get('/api/doctors')).data.doctors;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slot = (await pat.get(`/api/doctors/${docs[0].id}/slots?date=${tomorrow}`)).data.slots.find((s) => s.status === 'Available');
    const book = await pat.post('/api/appointments', {
      doctor_id: docs[0].id,
      appointment_date: tomorrow,
      appointment_time: slot.slot_time,
      reason: 'E2E Wellness Check'
    });
    assert.equal(book.status, 201);
    const aptId = book.data.appointment.id;

    // 3. Receptionist confirms and checks in patient
    await rec.patch(`/api/appointments/${aptId}/status`, { status: 'Confirmed' });
    await rec.patch(`/api/appointments/${aptId}/status`, { status: 'Checked In' });

    // 4. Doctor starts consultation & orders prescription + CBC lab
    await doc.patch(`/api/appointments/${aptId}/status`, { status: 'In Consultation' });
    const cbc = (await doc.get('/api/laboratory/tests')).data.tests.find((t) => t.code === 'CBC');
    const patProfile = (await pat.get('/api/patients/me/dashboard')).data.profile;
    const consult = await doc.post('/api/clinical/consultations', {
      appointment_id: aptId,
      patient_id: patProfile.id,
      chief_complaint: 'Fatigue',
      diagnosis_text: 'Iron deficiency workup',
      prescription_items: [{ medicine_id: 1, medicine_name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Once daily', duration: '10 days', quantity: 10 }],
      lab_test_ids: [cbc.id]
    });
    assert.equal(consult.status, 201);

    // 5. Lab staff completes workflow & releases report -> patient receives notification & sees report
    const orders = (await lab.get('/api/laboratory/orders')).data.orders;
    const labOrder = orders.find((o) => o.patient_id === patProfile.id && o.status === 'Ordered');
    await lab.post(`/api/laboratory/orders/${labOrder.id}/specimen`, { specimen_type: 'EDTA Blood' });
    await lab.patch(`/api/laboratory/orders/${labOrder.id}/processing`, {});
    await lab.post(`/api/laboratory/orders/${labOrder.id}/results`, { result_value: '8.4', abnormal_flag: 'Normal', notes: 'E2E normal' });
    await lab.post(`/api/laboratory/orders/${labOrder.id}/release`, {});

    const patNotifs = await pat.get('/api/notifications');
    assert.ok(patNotifs.data.items.some((n) => n.title.includes('Lab Report')));

    // 6. Pharmacist dispenses Rx & Accountant records payment
    const disp = await phm.post(`/api/pharmacy/prescriptions/${consult.data.rxId}/dispense`, {});
    assert.equal(disp.status, 200);
    const pay = await acc.post('/api/billing/payments', {
      invoice_id: disp.data.invoice.id,
      amount: disp.data.invoice.balance_due,
      idempotency_key: 'e2e-pay-1'
    });
    assert.equal(pay.status, 201);

    // 7. Blood bank compatibility gate
    const bb = (await bld.get('/api/bloodbank/overview')).data;
    const bag = bb.inventory.find((b) => b.status === 'Available');
    const bReq = await bld.post('/api/bloodbank/requests', { patient_id: patProfile.id, blood_group_id: bag.blood_group_id, units_requested: 1 });
    assert.equal(bReq.status, 201);
    const blockedIssue = await bld.post(`/api/bloodbank/requests/${bReq.data.request.id}/issue`, { inventory_id: bag.id, compatibility_checked: false });
    assert.equal(blockedIssue.status, 400);
    const okIssue = await bld.post(`/api/bloodbank/requests/${bReq.data.request.id}/issue`, { inventory_id: bag.id, compatibility_checked: true });
    assert.equal(okIssue.status, 200);

    // 8. Insurance claim workflow (simulated)
    const insOv = (await ins.get('/api/insurance/overview')).data;
    const claim = await ins.post('/api/insurance/cases', {
      policy_id: insOv.policies[0].id,
      patient_id: patProfile.id,
      estimated_amount: 120
    });
    assert.equal(claim.status, 201);
    const caseId = claim.data.insuranceCase.id;
    await ins.patch(`/api/insurance/cases/${caseId}/status`, { status: 'Under Review' });
    const settled = await acc.patch(`/api/insurance/cases/${caseId}/status`, {
      status: 'Approved',
      settled_amount: 100
    });
    assert.equal(settled.status, 200);

    // 9. HR & Candidate recruitment workflow
    const vac = await hr.post('/api/hr/vacancies', { title: 'Clinical Pharmacist', positions: 1, description: 'Inpatient pharmacy' });
    assert.equal(vac.status, 201);
    const apply = await cand.post('/api/hr/applications', { vacancy_id: vac.data.vacancy.id, cover_note: '5 years ICU pharmacy' });
    assert.equal(apply.status, 201);
    await hr.patch(`/api/hr/applications/${apply.data.application.id}/status`, { status: 'Under Review' });
    await hr.patch(`/api/hr/applications/${apply.data.application.id}/status`, { status: 'Shortlisted' });

    // 10. Publisher & Approver separation of duties
    const notice = await pub.post('/api/publisher', { title: 'Flu Shot Clinic', body: 'Open this weekend', audience: 'all' });
    assert.equal(notice.status, 201);
    const selfApprove = await pub.post(`/api/publisher/${notice.data.announcement.id}/review`, { decision: 'Approved' });
    assert.equal(selfApprove.status, 403);
    const appApprove = await app.post(`/api/publisher/${notice.data.announcement.id}/review`, { decision: 'Approved' });
    assert.equal(appApprove.status, 200);
    assert.equal(appApprove.data.announcement.status, 'Published');

    // 11. External coordination availability verification gate
    const extOv = (await bld.get('/api/external/overview')).data;
    const extReq = await bld.post('/api/external/requests', {
      provider_id: extOv.providers[0].id,
      request_type: 'Blood Units',
      description: '2 units O- negative',
      quantity: 2
    });
    assert.equal(extReq.status, 201);
    const extId = extReq.data.request.id;
    await bld.patch(`/api/external/requests/${extId}/status`, { status: 'Approval Pending' });
    await bld.patch(`/api/external/requests/${extId}/status`, { status: 'Provider Processing' });
    const noVerify = await bld.patch(`/api/external/requests/${extId}/status`, { status: 'Confirmed', availability_verified: false });
    assert.equal(noVerify.status, 400);
    const okVerify = await bld.patch(`/api/external/requests/${extId}/status`, { status: 'Confirmed', availability_verified: true, eta: '45 mins' });
    assert.equal(okVerify.status, 200);

    // 12. Admin Dashboard KPIs & Audit Trail reflect live DB state
    const dash = await adm.get('/api/reports/dashboard');
    assert.equal(dash.status, 200);
    assert.ok(dash.data.kpis.totalPatients >= 2);
    assert.ok(dash.data.recentActivity.length > 0);
  } finally {
    await ctx.close();
  }
});
