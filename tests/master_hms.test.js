import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_USERS } from '../db/seed.js';
import { MASTER_SPECIALTIES } from '../db/sync_master.js';
import { startTestServer } from './helpers.js';

const PORTAL_ROLES = [
  'patient', 'admin', 'doctor', 'nurse', 'receptionist', 'lab_staff',
  'pharmacist', 'radiologist', 'accountant', 'hr', 'publisher', 'approver',
  'case_manager', 'housekeeping', 'bloodbank_staff'
];

test('Master HMS: 15+ portal logins, employee ID login, and portal mismatch lock', async () => {
  const ctx = await startTestServer();
  try {
    const demo = await ctx.createClient().get('/api/demo-accounts');
    assert.equal(demo.status, 200);
    assert.ok(demo.data.accounts.length >= 17);

    for (const role of PORTAL_ROLES) {
      const u = DEMO_USERS.find((x) => x.role === role);
      assert.ok(u, `Missing demo user for role ${role}`);

      // Login by user_code with matching expected_role succeeds
      const c = ctx.createClient();
      const ok = await c.post('/api/auth/login', { identifier: u.code, password: u.pass, expected_role: role });
      assert.equal(ok.status, 200, `Portal login failed for ${role}`);
      assert.equal(ok.data.user.role, role);

      // Mismatched portal blocks login with 403
      const wrongPortal = role === 'patient' ? 'admin' : 'patient';
      const mismatch = await ctx.createClient().post('/api/auth/login', {
        identifier: u.email, password: u.pass, expected_role: wrongPortal
      });
      assert.equal(mismatch.status, 403, `Expected 403 mismatch for ${role} on ${wrongPortal} portal`);
    }
  } finally {
    await ctx.close();
  }
});

test('Master HMS: all 24 doctor specializations seeded and searchable with bookable doctors', async () => {
  const ctx = await startTestServer();
  try {
    const pat = ctx.createClient();
    await pat.login('patient@demo.com', 'Patient@123');
    const meta = await pat.get('/api/doctors/meta/filters');
    assert.equal(meta.status, 200);
    assert.equal(meta.data.specialties.length, 24);

    const expectedNames = MASTER_SPECIALTIES.map((s) => s[0]);
    for (const specName of expectedNames) {
      const sp = meta.data.specialties.find((s) => s.name === specName);
      assert.ok(sp, `Missing specialty: ${specName}`);
      assert.ok(sp.doctor_count >= 1, `No active doctor seeded for ${specName}`);
    }

    const docs = await pat.get('/api/doctors');
    assert.equal(docs.status, 200);
    assert.ok(docs.data.doctors.length >= 24);
    assert.ok(docs.data.doctors[0].availability_status);
  } finally {
    await ctx.close();
  }
});

test('Master HMS: patient non-empty dashboard, document upload/download, and clinical record privacy', async () => {
  const ctx = await startTestServer();
  try {
    // Register brand new patient (empty history/appointments) -> dashboard still complete
    const regClient = ctx.createClient();
    const reg = await regClient.post('/api/auth/register', {
      full_name: 'Nora Hayes',
      email: 'nora.hayes@example.com',
      mobile: '+1-555-8811',
      dob: '1991-04-12',
      gender: 'Female',
      address: '20 Cedar Ln',
      password: 'Password123',
      consent: true
    });
    assert.equal(reg.status, 201);
    const dash = await regClient.get('/api/patients/me/dashboard');
    assert.equal(dash.status, 200);
    assert.equal(dash.data.profile.full_name, 'Nora Hayes');
    assert.ok(dash.data.profile.patient_code.startsWith('MRN-'));
    assert.equal(dash.data.releasedLabsCount, 0);
    assert.equal(dash.data.releasedRadiologyCount, 0);

    // Upload patient medical document & download it
    const fd = new FormData();
    fd.append('title', 'Prior Blood Panel PDF');
    fd.append('category', 'External Medical Report');
    fd.append('document', new Blob(['%PDF-1.4 sample content'], { type: 'application/pdf' }), 'panel.pdf');
    const up = await regClient.post('/api/patients/me/documents', fd);
    assert.equal(up.status, 201);
    assert.ok(up.data.document.attachment_id);

    const list = await regClient.get('/api/patients/me/documents');
    assert.equal(list.status, 200);
    assert.equal(list.data.documents.length, 1);

    const dl = await regClient.get(`/api/admin/attachments/${up.data.document.attachment_id}`);
    assert.equal(dl.status, 200);

    // Unassigned doctor cannot access Nora's clinical chart or add clinical notes
    const doc = ctx.createClient();
    await doc.login('doctor@demo.com', 'Doctor@123');
    const deniedRec = await doc.get(`/api/clinical/records/${dash.data.profile.id}`);
    assert.equal(deniedRec.status, 403);
    const deniedNote = await doc.post('/api/clinical/notes', { patient_id: dash.data.profile.id, content: 'Unauthorized note' });
    assert.equal(deniedNote.status, 403);
  } finally {
    await ctx.close();
  }
});

test('Master HMS: doctor, receptionist check-out/admission, radiologist, nurse, HR, approver, housekeeping, blood bank', async () => {
  const ctx = await startTestServer();
  try {
    const pat = ctx.createClient(); await pat.login('patient@demo.com', 'Patient@123');
    const patDash = (await pat.get('/api/patients/me/dashboard')).data;
    const pid = patDash.profile.id;

    const doc = ctx.createClient(); await doc.login('doctor@demo.com', 'Doctor@123');
    const rec = ctx.createClient(); await rec.login('reception@demo.com', 'Reception@123');
    const rad = ctx.createClient(); await rad.login('radiology@demo.com', 'Radiology@123');
    const nur = ctx.createClient(); await nur.login('nurse@demo.com', 'Nurse@123');
    const hr = ctx.createClient(); await hr.login('hr@demo.com', 'Hr@123');
    const pub = ctx.createClient(); await pub.login('publisher@demo.com', 'Publish@123');
    const app = ctx.createClient(); await app.login('approver@demo.com', 'Approve@123');
    const hsk = ctx.createClient(); await hsk.login('housekeeping@demo.com', 'House@123');
    const bld = ctx.createClient(); await bld.login('bloodbank@demo.com', 'Bloodbank@123');

    // Doctor dashboard + availability update + clinical note + follow-up + radiology order
    const docDash = await doc.get('/api/doctors/me/dashboard');
    assert.equal(docDash.status, 200);
    assert.ok(docDash.data.doctor.specialty_name);
    const availUpd = await doc.put(`/api/doctors/${docDash.data.doctor.id}/schedules`, {
      availability_status: 'Busy',
      consultation_fee: 165
    });
    assert.equal(availUpd.status, 200);

    const note = await doc.post('/api/clinical/notes', { patient_id: pid, note_type: 'Progress', content: 'BP stabilized on regimen.' });
    assert.equal(note.status, 201);
    const fu = await doc.post('/api/clinical/follow-ups', { patient_id: pid, follow_up_date: '2026-12-10', notes: 'Repeat ECG' });
    assert.equal(fu.status, 201);
    const radOrder = await doc.post('/api/radiology/orders', { patient_id: pid, modality: 'X-Ray', study_name: 'Chest PA View' });
    assert.equal(radOrder.status, 201);

    // Radiologist schedules scan & releases report -> patient dashboard reflects released radiology count
    const radSched = await rad.patch(`/api/radiology/orders/${radOrder.data.order.id}/schedule`, { scheduled_at: '2026-12-01 10:00' });
    assert.equal(radSched.status, 200);
    assert.equal(radSched.data.order.status, 'Scheduled');
    const radRep = await rad.post(`/api/radiology/orders/${radOrder.data.order.id}/report`, {
      findings: 'Clear lung fields.', impression: 'Normal Chest Radiograph', release: true
    });
    assert.equal(radRep.status, 200);
    assert.equal(radRep.data.order.status, 'Released');

    // Receptionist appointment Check-Out & Admission Registration
    const docs = (await rec.get('/api/doctors')).data.doctors;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slot = (await rec.get(`/api/doctors/${docs[0].id}/slots?date=${tomorrow}`)).data.slots.find((s) => s.status === 'Available');
    const apt = await rec.post('/api/appointments', { patient_id: pid, doctor_id: docs[0].id, appointment_date: tomorrow, appointment_time: slot.slot_time });
    await rec.patch(`/api/appointments/${apt.data.appointment.id}/status`, { status: 'Confirmed' });
    await rec.patch(`/api/appointments/${apt.data.appointment.id}/status`, { status: 'Checked In' });
    const chkOut = await rec.patch(`/api/appointments/${apt.data.appointment.id}/status`, { status: 'Checked Out' });
    assert.equal(chkOut.status, 200);
    assert.equal(chkOut.data.appointment.status, 'Checked Out');
    assert.ok(chkOut.data.appointment.checked_out_at);

    const recAdm = await rec.post('/api/admissions', {
      patient_id: pid, department_id: docs[0].department_id, doctor_id: docs[0].id, admission_type: 'Elective', reason: '24h telemetry monitoring'
    });
    assert.equal(recAdm.status, 201);

    // Nurse sees doctorInstructions
    const nurDash = await nur.get('/api/nursing/dashboard');
    assert.equal(nurDash.status, 200);
    assert.ok(Array.isArray(nurDash.data.doctorInstructions));

    // HR registers staff employee & marks attendance
    const hrList = (await hr.get('/api/hr/employees')).data;
    const emp = await hr.post('/api/hr/employees', {
      full_name: 'Kevin Brooks', email: 'kevin.brooks@demo.com', role_id: hrList.staffRoles.find((r) => r.code === 'nurse').id, department_id: docs[0].department_id, designation: 'ICU Nurse', base_salary: 5200, password: 'Password123'
    });
    assert.equal(emp.status, 201);
    const att = await hr.post('/api/hr/attendance', { employee_id: emp.data.employee.id, attendance_date: new Date().toISOString().slice(0, 10), status: 'Present' });
    assert.equal(att.status, 201);

    // Publisher -> Approver with remarks -> approvals log returned
    const notice = await pub.post('/api/publisher', { title: 'MRI Suite Upgrade', body: 'New 3T scanner active.', audience: 'all' });
    assert.equal(notice.status, 201);
    const appr = await app.post(`/api/publisher/${notice.data.announcement.id}/review`, { decision: 'Approved', comments: 'Verified with radiology chief' });
    assert.equal(appr.status, 200);
    const pubList = await app.get('/api/publisher');
    assert.ok(pubList.data.approvals.some((x) => x.comments === 'Verified with radiology chief'));

    // Housekeeping maintenance request creation & resolution
    const hk1 = await hsk.get('/api/housekeeping/tasks');
    assert.equal(hk1.status, 200);
    const maint = await hsk.post('/api/housekeeping/maintenance', { room_id: hk1.data.beds[0].room_id, issue: 'AC thermostat check' });
    assert.equal(maint.status, 201);
    const resMaint = await hsk.patch(`/api/housekeeping/maintenance/${maint.data.maintenance.id}`, { status: 'Resolved' });
    assert.equal(resMaint.status, 200);

    // Blood bank staff views overview + issues + patients
    const bbOv = await bld.get('/api/bloodbank/overview');
    assert.equal(bbOv.status, 200);
    assert.ok(Array.isArray(bbOv.data.issues));
    const bbPats = await bld.get('/api/patients');
    assert.equal(bbPats.status, 200);
  } finally {
    await ctx.close();
  }
});
