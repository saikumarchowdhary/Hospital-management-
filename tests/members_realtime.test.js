import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

async function readSseUntil(reader, predicate, timeoutMs = 4000) {
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), Math.max(50, deadline - Date.now())))
    ]);
    if (res.timeout || res.done) break;
    buf += dec.decode(res.value, { stream: true });
    if (predicate(buf)) return buf;
  }
  return buf;
}

test('Registration & Admin All Members: patient emergency contact, pending staff approval, admin restriction, suspend/edit/reset, no leaked passwords', async () => {
  const ctx = await startTestServer();
  try {
    const meta = await ctx.createClient().get('/api/auth/registration-meta');
    assert.equal(meta.status, 200);
    assert.ok(!meta.data.staffRoles.some((r) => r.code === 'admin'));
    assert.equal(meta.data.specialties.length, 24);

    // Public admin staff-request blocked (403)
    const blockAdm = await ctx.createClient().post('/api/auth/register', {
      account_type: 'staff', requested_role: 'admin', full_name: 'Bad Actor',
      email: 'bad@example.com', mobile: '+1-555-9000', password: 'Password123'
    });
    assert.equal(blockAdm.status, 403);

    // Patient registration with emergency contact
    const patC = ctx.createClient();
    const patReg = await patC.post('/api/auth/register', {
      full_name: 'Elena Vance', email: 'elena.v@example.com', mobile: '+1-555-9001',
      dob: '1990-07-08', gender: 'Female', address: '88 River St',
      emergency_contact_name: 'Mark Vance', emergency_contact_phone: '+1-555-9002',
      password: 'Password123', consent: true
    });
    assert.equal(patReg.status, 201);
    assert.equal(patReg.data.user.account_status, 'Active');

    // Doctor & Nurse pending staff registration requests
    const docReg = await ctx.createClient().post('/api/auth/register', {
      account_type: 'staff', requested_role: 'doctor', full_name: 'Dr. Nina Shah',
      email: 'nina.shah@demo.com', mobile: '+1-555-9003', password: 'Password123',
      department_id: meta.data.departments[0].id, specialty_id: meta.data.specialties[0].id,
      qualification: 'MD, FACC', experience_years: 11, availability_status: 'Available'
    });
    assert.equal(docReg.status, 201);
    assert.equal(docReg.data.user.account_status, 'Pending Approval');

    // Duplicate email rejected (409)
    const dupStaff = await ctx.createClient().post('/api/auth/register', {
      account_type: 'staff', requested_role: 'nurse', full_name: 'Dup User',
      email: 'nina.shah@demo.com', mobile: '+1-555-9004', password: 'Password123'
    });
    assert.equal(dupStaff.status, 409);

    // Pending doctor cannot login yet (403)
    const pendingLogin = await ctx.createClient().login('nina.shah@demo.com', 'Password123');
    assert.equal(pendingLogin.status, 403);

    // Admin All Members Management: list, filter, never exposes password_hash, inspect activity, approve, edit, suspend, reset
    const adm = ctx.createClient();
    await adm.login('admin@demo.com', 'Admin@123');

    const pendingList = await adm.get('/api/admin/members?status=Pending+Approval');
    assert.equal(pendingList.status, 200);
    const pendingDoc = pendingList.data.members.find((m) => m.email === 'nina.shah@demo.com');
    assert.ok(pendingDoc);
    assert.equal(pendingDoc.password_hash, undefined);

    const approveRes = await adm.post(`/api/admin/members/${pendingDoc.id}/review`, { decision: 'Approved', notes: 'Credentials verified' });
    assert.equal(approveRes.status, 200);

    // Now Dr. Nina Shah can log in and access her Doctor Dashboard!
    const docClient = ctx.createClient();
    const docOk = await docClient.post('/api/auth/login', { identifier: 'nina.shah@demo.com', password: 'Password123', expected_role: 'doctor' });
    assert.equal(docOk.status, 200);
    const docDash = await docClient.get('/api/doctors/me/dashboard');
    assert.equal(docDash.status, 200);
    assert.equal(docDash.data.doctor.full_name, 'Dr. Nina Shah');

    // Admin edits member & inspects profile/work
    const editRes = await adm.patch(`/api/admin/members/${pendingDoc.id}`, { phone: '+1-555-9099', consultation_fee: 175 });
    assert.equal(editRes.status, 200);
    const detail = await adm.get(`/api/admin/members/${pendingDoc.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.member.phone, '+1-555-9099');
    assert.ok(detail.data.activity.length >= 1);

    // Admin suspends -> active session rejected (401) and login blocked (403) -> reactivate
    await adm.patch(`/api/admin/members/${pendingDoc.id}/status`, { account_status: 'Suspended' });
    const rejectedSession = await docClient.get('/api/doctors/me/dashboard');
    assert.equal(rejectedSession.status, 401);
    const suspendedLogin = await ctx.createClient().login('nina.shah@demo.com', 'Password123');
    assert.equal(suspendedLogin.status, 403);

    await adm.patch(`/api/admin/members/${pendingDoc.id}/status`, { account_status: 'Active' });
    const rstTok = await adm.post(`/api/admin/members/${pendingDoc.id}/reset-token`, {});
    assert.equal(rstTok.status, 200);
    assert.ok(rstTok.data.resetCode);
    await ctx.createClient().post('/api/auth/reset-password', {
      email: 'nina.shah@demo.com', code: rstTok.data.resetCode, new_password: 'ResetPass2026'
    });
    const relog = await ctx.createClient().login('nina.shah@demo.com', 'ResetPass2026');
    assert.equal(relog.status, 200);
  } finally {
    await ctx.close();
  }
});

test('Real-Time SSE: cross-role live event stream pushes appointment and registration updates immediately', async () => {
  const ctx = await startTestServer();
  const acDoc = new AbortController();
  const acAdm = new AbortController();
  try {
    // Login Doctor and Admin and obtain cookies
    const loginDoc = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
      body: JSON.stringify({ identifier: 'doctor@demo.com', password: 'Doctor@123' })
    });
    const docCookie = loginDoc.headers.get('set-cookie').split(';')[0];

    const loginAdm = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
      body: JSON.stringify({ identifier: 'admin@demo.com', password: 'Admin@123' })
    });
    const admCookie = loginAdm.headers.get('set-cookie').split(';')[0];

    const docStream = await fetch(`${ctx.baseUrl}/api/events/stream`, { headers: { Cookie: docCookie }, signal: acDoc.signal });
    const admStream = await fetch(`${ctx.baseUrl}/api/events/stream`, { headers: { Cookie: admCookie }, signal: acAdm.signal });
    const docReader = docStream.body.getReader();
    const admReader = admStream.body.getReader();

    // Wait for initial 'connected' frame on both streams
    const initDoc = await readSseUntil(docReader, (s) => s.includes('event: connected'));
    const initAdm = await readSseUntil(admReader, (s) => s.includes('event: connected'));
    assert.ok(initDoc.includes('event: connected'));
    assert.ok(initAdm.includes('event: connected'));

    // Patient books an appointment with doctor@demo.com -> Doctor stream receives live 'appointment:created' event
    const pat = ctx.createClient();
    await pat.login('patient@demo.com', 'Patient@123');
    const docs = (await pat.get('/api/doctors')).data.doctors;
    const elena = docs.find((d) => d.email === 'doctor@demo.com') || docs[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slot = (await pat.get(`/api/doctors/${elena.id}/slots?date=${tomorrow}`)).data.slots.find((s) => s.status === 'Available');
    await pat.post('/api/appointments', { doctor_id: elena.id, appointment_date: tomorrow, appointment_time: slot.slot_time, reason: 'SSE live test' });

    const docEvent = await readSseUntil(docReader, (s) => s.includes('event: appointment:created'));
    assert.ok(docEvent.includes('event: appointment:created'));

    // Staff registration submitted -> Admin stream receives live 'member:registered' event
    await ctx.createClient().post('/api/auth/register', {
      account_type: 'staff', requested_role: 'nurse', full_name: 'Live Test Nurse',
      email: 'live.nurse@demo.com', mobile: '+1-555-9111', password: 'Password123', shift: 'Night'
    });
    const admEvent = await readSseUntil(admReader, (s) => s.includes('event: member:registered'));
    assert.ok(admEvent.includes('event: member:registered'));
  } finally {
    acDoc.abort();
    acAdm.abort();
    await ctx.close();
  }
});
