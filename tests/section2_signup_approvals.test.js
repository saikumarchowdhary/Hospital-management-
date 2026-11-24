import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Section 2 Unified Sign-Up: Patient PT-000001 + consent, Candidate isolation, Doctor licence verification + schedule wizard, Staff & Admin queues, CSV import', async () => {
  const ctx = await startTestServer({ seedDemo: false });
  try {
    // 1. Setup first Admin via /api/auth/setup-admin
    const adm = ctx.createClient();
    const setupRes = await adm.post('/api/auth/setup-admin', {
      full_name: 'Dr. Chief Admin',
      email: 'chief.admin@hospital.org',
      mobile: '+1-555-1000',
      password: 'Password123'
    });
    assert.equal(setupRes.status, 201);
    assert.equal(setupRes.data.user.role, 'admin');

    const meta = await ctx.createClient().get('/api/auth/registration-meta');
    assert.equal(meta.status, 200);
    assert.ok(meta.data.staffRoles.some((r) => r.code === 'housekeeping_supervisor'));
    assert.ok(meta.data.staffRoles.some((r) => r.code === 'bloodbank_staff'));
    assert.ok(!meta.data.staffRoles.some((r) => r.code === 'admin'));

    // Admin signup always rejected
    const blockAdm = await ctx.createClient().post('/api/auth/register', {
      account_type: 'admin',
      full_name: 'Fake Admin',
      email: 'fake@hospital.org',
      mobile: '+1-555-1001',
      password: 'Password123'
    });
    assert.equal(blockAdm.status, 403);

    // 2. OTP send & verify (dev returns sandboxCode, prod hides it)
    const otpSend = await ctx.createClient().post('/api/auth/send-otp', {
      channel: 'email',
      target: 'patient.one@example.com',
      purpose: 'signup'
    });
    assert.equal(otpSend.status, 200);
    assert.ok(otpSend.data.sandboxCode);

    const otpVerify = await ctx.createClient().post('/api/auth/verify-otp', {
      channel: 'email',
      target: 'patient.one@example.com',
      code: otpSend.data.sandboxCode,
      purpose: 'signup'
    });
    assert.equal(otpVerify.status, 200);
    assert.equal(otpVerify.data.verified, true);

    // 3. Patient signup -> PT-000001 format + consent_text + consent_version stored
    const patClient = ctx.createClient();
    const patReg = await patClient.post('/api/auth/register', {
      account_type: 'patient',
      full_name: 'Alice Patient',
      email: 'patient.one@example.com',
      mobile: '+1-555-2001',
      password: 'Password123',
      consent: true,
      consent_text: 'Custom consent copy v2.0',
      consent_version: 'v2.0',
      otp_verified: true
    });
    assert.equal(patReg.status, 201);
    assert.match(patReg.data.user.patient_code, /^PT-\d{6}$/);
    const consentRow = ctx.db.get('SELECT * FROM patient_consents WHERE patient_id = ?', [patReg.data.user.patient_id]);
    assert.equal(consentRow.consent_version, 'v2.0');
    assert.equal(consentRow.consent_text, 'Custom consent copy v2.0');

    // 4. Candidate signup -> Jobs & Applications only, blocked elsewhere
    const candClient = ctx.createClient();
    const candReg = await candClient.post('/api/auth/register', {
      account_type: 'candidate',
      full_name: 'Bob Candidate',
      email: 'bob.cand@example.com',
      mobile: '+1-555-2002',
      password: 'Password123'
    });
    assert.equal(candReg.status, 201);
    assert.equal(candReg.data.user.role, 'candidate');
    assert.equal((await candClient.get('/api/hr/vacancies')).status, 200);
    assert.equal((await candClient.get('/api/hr/applications')).status, 200);
    assert.equal((await candClient.get('/api/doctors')).status, 403);
    assert.equal((await candClient.get('/api/appointments')).status, 403);
    assert.equal((await candClient.get('/api/patients')).status, 403);
    assert.equal((await candClient.get('/api/admin/overview')).status, 403);

    // 5. Doctor self-signup with multipart licence upload -> Pending Verification
    const fdDoc = new FormData();
    fdDoc.append('account_type', 'doctor');
    fdDoc.append('full_name', 'Dr. Clara Heart');
    fdDoc.append('email', 'clara.heart@hospital.org');
    fdDoc.append('mobile', '+1-555-3001');
    fdDoc.append('password', 'Password123');
    fdDoc.append('medical_registration_number', 'MED-REG-77001');
    fdDoc.append('medical_council', 'National Medical Council');
    fdDoc.append('branch_id', String(meta.data.branches[0].id));
    fdDoc.append('department_id', String(meta.data.departments[0].id));
    fdDoc.append('specialty_id', String(meta.data.specialties[0].id));
    fdDoc.append('qualification', 'MBBS, MD');
    fdDoc.append('experience_years', '9');
    fdDoc.append('consultation_fee', '140');
    fdDoc.append('licence', new Blob(['%PDF-1.4 mock licence'], { type: 'application/pdf' }), 'licence.pdf');

    const docReg = await ctx.createClient().post('/api/auth/register', fdDoc);
    assert.equal(docReg.status, 201);
    assert.equal(docReg.data.pendingVerification, true);
    assert.equal(docReg.data.user.account_status, 'Pending Verification');

    // Duplicate medical registration number blocked (409)
    const dupRegNo = await ctx.createClient().post('/api/auth/register', {
      account_type: 'doctor',
      full_name: 'Dr. Copy',
      email: 'copy.doc@hospital.org',
      mobile: '+1-555-3002',
      password: 'Password123',
      medical_registration_number: 'MED-REG-77001',
      medical_council: 'National Medical Council',
      department_id: meta.data.departments[0].id,
      specialty_id: meta.data.specialties[0].id
    });
    assert.equal(dupRegNo.status, 409);

    // Security check: Wrong password on pending doctor does NOT leak Pending Verification status
    const wrongPwPending = await ctx.createClient().login('clara.heart@hospital.org', 'WrongPassword9');
    assert.equal(wrongPwPending.status, 401);
    assert.equal(wrongPwPending.data.error, 'Invalid credentials.');

    // Correct password shows Pending Verification status cleanly
    const rightPwPending = await ctx.createClient().login('clara.heart@hospital.org', 'Password123');
    assert.equal(rightPwPending.status, 403);
    assert.equal(rightPwPending.data.account_status, 'Pending Verification');

    // Forgot password returns identical generic message regardless of email existence
    const fpUnknown = await ctx.createClient().post('/api/auth/forgot-password', { email: 'nobody@nowhere.org' });
    const fpKnown = await ctx.createClient().post('/api/auth/forgot-password', { email: 'clara.heart@hospital.org' });
    assert.equal(fpUnknown.data.message, fpKnown.data.message);

    // 6. Staff self-signup (housekeeping_supervisor) with unique employee_id -> Pending Approval
    const staffReg = await ctx.createClient().post('/api/auth/register', {
      account_type: 'staff',
      requested_role: 'housekeeping_supervisor',
      full_name: 'Sam Supervisor',
      email: 'sam.sup@hospital.org',
      mobile: '+1-555-4001',
      password: 'Password123',
      employee_id: 'EMP-HK-001',
      branch_id: meta.data.branches[0].id,
      department_id: meta.data.departments[0].id
    });
    assert.equal(staffReg.status, 201);
    assert.equal(staffReg.data.user.account_status, 'Pending Approval');

    // Duplicate employee_id rejected (409)
    const dupEmp = await ctx.createClient().post('/api/auth/register', {
      account_type: 'staff',
      requested_role: 'nurse',
      full_name: 'Dup Emp',
      email: 'dup.emp@hospital.org',
      mobile: '+1-555-4002',
      password: 'Password123',
      employee_id: 'EMP-HK-001'
    });
    assert.equal(dupEmp.status, 409);

    // 7. Admin inspects signup queues, views licence attachment, verifies doctor, requests info / rejects staff
    const queueRes = await adm.get('/api/admin/signup-requests');
    assert.equal(queueRes.status, 200);
    assert.equal(queueRes.data.pendingDoctorsCount, 1);
    assert.equal(queueRes.data.pendingStaffCount, 1);

    const docReqRow = queueRes.data.requests.find((r) => r.email === 'clara.heart@hospital.org');
    assert.ok(docReqRow.licence_attachment_id);
    const attRes = await adm.get(`/api/admin/attachments/${docReqRow.licence_attachment_id}`);
    assert.equal(attRes.status, 200);

    // Approve doctor -> creates doctor_profiles with schedule_configured = 0 (not visible in Find a Doctor yet!)
    const approveDoc = await adm.post(`/api/admin/signup-requests/${docReqRow.id}/approve`, {
      admin_notes: 'Verified licence against NMC'
    });
    assert.equal(approveDoc.status, 200);

    const patDocsBeforeWizard = await patClient.get('/api/doctors');
    assert.equal(patDocsBeforeWizard.data.doctors.length, 0);

    // Doctor logs in -> schedule_configured is 0 -> completes setup wizard with break -> appears in Find a Doctor
    const claraClient = ctx.createClient();
    const claraLogin = await claraClient.login('clara.heart@hospital.org', 'Password123');
    assert.equal(claraLogin.status, 200);
    assert.equal(claraLogin.data.user.schedule_configured, false);

    const wizRes = await claraClient.put('/api/doctors/me/schedule-setup', {
      working_days: [0, 1, 2, 3, 4, 5, 6],
      start_time: '09:00',
      end_time: '12:00',
      slot_minutes: 30,
      break_start: '10:30',
      break_end: '11:00',
      consultation_fee: 150
    });
    assert.equal(wizRes.status, 200);

    const patDocsAfterWizard = await patClient.get('/api/doctors');
    assert.equal(patDocsAfterWizard.data.doctors.length, 1);
    const claraId = patDocsAfterWizard.data.doctors[0].id;

    // Verify slots exclude the break window 10:30-11:00
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slotsRes = await patClient.get(`/api/doctors/${claraId}/slots?date=${tomorrow}`);
    const slotTimes = slotsRes.data.slots.map((s) => s.slot_time);
    assert.ok(slotTimes.includes('09:00'));
    assert.ok(slotTimes.includes('11:00'));
    assert.ok(!slotTimes.includes('10:30'));

    // Staff request -> Reject with reason -> Login shows exact rejection reason on valid password
    const staffReqRow = queueRes.data.requests.find((r) => r.email === 'sam.sup@hospital.org');
    const rejRes = await adm.post(`/api/admin/signup-requests/${staffReqRow.id}/reject`, {
      reason: 'Badge number not found in HR roster'
    });
    assert.equal(rejRes.status, 200);
    const samLogin = await ctx.createClient().login('sam.sup@hospital.org', 'Password123');
    assert.equal(samLogin.status, 403);
    assert.match(samLogin.data.error, /Badge number not found in HR roster/);

    // 8. Bulk CSV Import with mixed valid & invalid rows
    const csvPayload = [
      'full_name,email,mobile,role,password,department,branch,employee_id',
      'Nurse Valid,nurse.csv@hospital.org,+1-555-6001,nurse,Pass1234,Cardiology,Main,EMP-CSV-1',
      'Invalid Role,bad.role@hospital.org,+1-555-6002,wizard,Pass1234,Cardiology,Main,EMP-CSV-2',
      'Weak Pass,weak.pw@hospital.org,+1-555-6003,pharmacist,short,Pharmacy,Main,EMP-CSV-3'
    ].join('\n');

    const csvRes = await adm.post('/api/admin/members/import-csv', { csv_text: csvPayload });
    assert.equal(csvRes.status, 200);
    assert.equal(csvRes.data.createdCount, 1);
    assert.equal(csvRes.data.skippedCount, 2);
    assert.equal(csvRes.data.errors.length, 2);

    const csvNurseLogin = await ctx.createClient().login('nurse.csv@hospital.org', 'Pass1234');
    assert.equal(csvNurseLogin.status, 200);
    assert.equal(csvNurseLogin.data.user.role, 'nurse');
  } finally {
    await ctx.close();
  }
});
