import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { runMigrations } from '../db/migrations.js';
import { normalizePhone, classifyLoginIdentifier } from '../services/phone.js';
import { startTestServer } from './helpers.js';

test('Phone normalization and identifier classification handle +91 / 0 / spaces consistently', () => {
  assert.equal(normalizePhone('9876543210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.equal(normalizePhone('91-98765-43210'), '+919876543210');
  assert.equal(normalizePhone('+1 (555) 234-5678'), '+15552345678');

  assert.equal(classifyLoginIdentifier('dr.arya@hospital.org').kind, 'email');
  assert.equal(classifyLoginIdentifier('+91 98765 43210').kind, 'phone');
  assert.equal(classifyLoginIdentifier('9876543210').kind, 'phone');
  assert.equal(classifyLoginIdentifier('DOC-12345').kind, 'code');
});

test('Instant doctor signup with license, phone/email uniqueness, email+phone login, migration of stuck pending doctors, and patient regression', async () => {
  const ctx = await startTestServer();
  try {
    const meta = await ctx.createClient().get('/api/auth/registration-meta');
    assert.equal(meta.status, 200);

    // 1. Invalid license file rejected cleanly (400)
    const badFd = new FormData();
    badFd.append('account_type', 'doctor');
    badFd.append('full_name', 'Dr. Bad File');
    badFd.append('email', 'bad.file@hospital.org');
    badFd.append('mobile', '+91 98765 00001');
    badFd.append('password', 'Password123');
    badFd.append('medical_registration_number', 'NMC-BAD-01');
    badFd.append('medical_council', 'NMC');
    badFd.append('department_id', String(meta.data.departments[0].id));
    badFd.append('specialty_id', String(meta.data.specialties[0].id));
    badFd.append('licence', new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), 'script.sh');

    const badFileRes = await ctx.createClient().post('/api/auth/register', badFd);
    assert.equal(badFileRes.status, 400);

    // 2. Register doctor with valid PDF license -> immediate active account + accessToken + no pending messages
    const fd = new FormData();
    fd.append('account_type', 'doctor');
    fd.append('full_name', 'Dr. Arya Nair');
    fd.append('email', 'arya.nair@hospital.org');
    fd.append('mobile', '+91 98765 43210');
    fd.append('password', 'DoctorPass9');
    fd.append('medical_registration_number', 'NMC-445566');
    fd.append('medical_council', 'National Medical Commission');
    fd.append('branch_id', String(meta.data.branches[0].id));
    fd.append('department_id', String(meta.data.departments[0].id));
    fd.append('specialty_id', String(meta.data.specialties[0].id));
    fd.append('qualification', 'MBBS, MD (Cardiology)');
    fd.append('experience_years', '8');
    fd.append('consultation_fee', '180');
    fd.append('licence', new Blob(['%PDF-1.4 valid medical licence'], { type: 'application/pdf' }), 'arya_licence.pdf');

    const docClient = ctx.createClient();
    const regRes = await docClient.post('/api/auth/register', fd);
    assert.equal(regRes.status, 201);
    assert.equal(regRes.data.message, 'Account created successfully');
    assert.equal(regRes.data.pendingVerification, undefined);
    assert.equal(regRes.data.pendingApproval, undefined);
    assert.ok(regRes.data.accessToken);
    assert.ok(regRes.data.token);
    assert.equal(regRes.data.user.role, 'doctor');
    assert.equal(regRes.data.user.account_status, 'Active');
    assert.equal(regRes.data.user.phone, '+919876543210');

    // Immediate authenticated access to Doctor Dashboard & persisted license info
    const dashRes = await docClient.get('/api/doctors/me/dashboard');
    assert.equal(dashRes.status, 200);
    assert.equal(dashRes.data.doctor.registration_number, 'NMC-445566');
    assert.equal(dashRes.data.doctor.medical_council, 'National Medical Commission');
    assert.ok(dashRes.data.doctor.licence_attachment_id);

    // 3. Uniqueness enforcement for normalized phone & email across accounts
    const dupPhoneSameFmt = await ctx.createClient().post('/api/auth/register', {
      account_type: 'doctor',
      full_name: 'Dr. Clone Phone',
      email: 'clone.phone@hospital.org',
      mobile: '9876543210',
      password: 'Password123',
      medical_registration_number: 'NMC-998877',
      medical_council: 'NMC',
      department_id: meta.data.departments[0].id,
      specialty_id: meta.data.specialties[0].id
    });
    assert.equal(dupPhoneSameFmt.status, 409);

    const dupPhoneZeroPrefix = await ctx.createClient().post('/api/auth/register', {
      account_type: 'patient',
      full_name: 'Dup Patient Phone',
      email: 'pat.dupphone@example.com',
      mobile: '09876543210',
      password: 'Password123',
      consent: true
    });
    assert.equal(dupPhoneZeroPrefix.status, 409);

    const dupEmailRes = await ctx.createClient().post('/api/auth/register', {
      account_type: 'doctor',
      full_name: 'Dr. Dup Email',
      email: 'ARYA.NAIR@hospital.org',
      mobile: '+91 98765 11111',
      password: 'Password123',
      medical_registration_number: 'NMC-998878',
      medical_council: 'NMC',
      department_id: meta.data.departments[0].id,
      specialty_id: meta.data.specialties[0].id
    });
    assert.equal(dupEmailRes.status, 409);

    // 4. Logout & Login with Email + Password, and Phone + Password in normalized formats
    await docClient.post('/api/auth/logout', {});

    const wrongPw = await ctx.createClient().post('/api/auth/login', {
      identifier: '+91 98765 43210',
      password: 'WrongPassword1',
      expected_portal: 'staff'
    });
    assert.equal(wrongPw.status, 401);

    const emailLogin = await ctx.createClient().post('/api/auth/login', {
      identifier: 'arya.nair@hospital.org',
      password: 'DoctorPass9',
      expected_portal: 'staff'
    });
    assert.equal(emailLogin.status, 200);
    assert.equal(emailLogin.data.user.email, 'arya.nair@hospital.org');

    for (const phoneVariant of ['+91 98765 43210', '9876543210', '09876543210', '919876543210']) {
      const phoneLoginClient = ctx.createClient();
      const phoneLogin = await phoneLoginClient.post('/api/auth/login', {
        identifier: phoneVariant,
        password: 'DoctorPass9',
        expected_portal: 'staff'
      });
      assert.equal(phoneLogin.status, 200, `Expected phone login to work for ${phoneVariant}`);
      assert.equal(phoneLogin.data.user.role, 'doctor');
      const meDash = await phoneLoginClient.get('/api/doctors/me/dashboard');
      assert.equal(meDash.status, 200);
    }

    // 5. Migration activates existing stuck pending doctors cleanly
    const pendingRoleId = ctx.db.get("SELECT id FROM roles WHERE code = 'pending_staff'").id;
    const stuckHash = bcrypt.hashSync('StuckPass9', 10);
    const deptId = meta.data.departments[0].id;
    const specId = meta.data.specialties[0].id;
    const stuckUser = ctx.db.run(
      `INSERT INTO users (user_code, email, password_hash, full_name, phone, phone_normalized, role_id, branch_id, department_id, is_active, account_status)
       VALUES ('DOCREQ-OLD1', 'stuck.doctor@hospital.org', ?, 'Dr. Stuck Pending', '+91 98111 22334', '+919811122334', ?, 1, ?, 1, 'Pending Verification')`,
      [stuckHash, pendingRoleId, deptId]
    );
    ctx.db.run(
      `INSERT INTO staff_signup_requests (user_id, full_name, email, phone, requested_role, branch_id, department_id, specialty_id, medical_registration_number, medical_council, qualification, status)
       VALUES (?, 'Dr. Stuck Pending', 'stuck.doctor@hospital.org', '+91 98111 22334', 'doctor', 1, ?, ?, 'NMC-STUCK-01', 'State Council', 'MBBS', 'Pending')`,
      [stuckUser.lastInsertRowid, deptId, specId]
    );

    runMigrations(ctx.db);

    const migratedRow = ctx.db.get(
      `SELECT u.account_status, r.code as role, dp.registration_number
       FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.id = ?`,
      [stuckUser.lastInsertRowid]
    );
    assert.equal(migratedRow.account_status, 'Active');
    assert.equal(migratedRow.role, 'doctor');
    assert.equal(migratedRow.registration_number, 'NMC-STUCK-01');

    const stuckLoginClient = ctx.createClient();
    const stuckLogin = await stuckLoginClient.post('/api/auth/login', {
      identifier: '9811122334',
      password: 'StuckPass9'
    });
    assert.equal(stuckLogin.status, 200);
    assert.equal(stuckLogin.data.user.role, 'doctor');
    assert.equal((await stuckLoginClient.get('/api/doctors/me/dashboard')).status, 200);

    // 6. Patient registration & email/phone login regression check
    const patReg = await ctx.createClient().post('/api/auth/register', {
      account_type: 'patient',
      full_name: 'Rohan Verma',
      email: 'rohan.verma@example.com',
      mobile: '+91 91234 56789',
      password: 'PatientPass9',
      consent: true
    });
    assert.equal(patReg.status, 201);
    assert.ok(patReg.data.accessToken);
    assert.equal(patReg.data.user.role, 'patient');

    const patEmailLogin = await ctx.createClient().post('/api/auth/login', {
      identifier: 'rohan.verma@example.com',
      password: 'PatientPass9',
      expected_portal: 'patient'
    });
    assert.equal(patEmailLogin.status, 200);

    const patPhoneLogin = await ctx.createClient().post('/api/auth/login', {
      identifier: '9123456789',
      password: 'PatientPass9',
      expected_portal: 'patient'
    });
    assert.equal(patPhoneLogin.status, 200);
    assert.equal(patPhoneLogin.data.user.email, 'rohan.verma@example.com');
  } finally {
    await ctx.close();
  }
});
