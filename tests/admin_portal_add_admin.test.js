import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Admin portal security: non-admins receive "You do not have admin access.", public admin signup is blocked, and Add Admin creates verified admin accounts', async () => {
  const srv = await startTestServer();
  try {
    const anon = srv.createClient();

    // 1. Non-admin (patient, doctor, candidate, nurse) trying Admin portal receives exact 403 error message
    const nonAdminCreds = [
      ['patient@demo.com', 'Patient@123'],
      ['doctor@demo.com', 'Doctor@123'],
      ['candidate@demo.com', 'Candidate@123'],
      ['nurse@demo.com', 'Nurse@123'],
    ];
    for (const [email, password] of nonAdminCreds) {
      const denied = await anon.post('/api/auth/login', {
        identifier: email,
        password,
        expected_portal: 'admin',
        expected_role: 'admin',
      });
      assert.equal(denied.status, 403);
      assert.equal(denied.data.error, 'You do not have admin access.');
    }

    // 2. Public sign-up must reject any attempt to self-register as admin
    const selfSignupAttempt1 = await anon.post('/api/auth/register', {
      account_type: 'admin',
      full_name: 'Fake Admin',
      email: 'fake.admin1@example.com',
      mobile: '+1-555-8001',
      password: 'Password@123',
    });
    assert.equal(selfSignupAttempt1.status, 403);

    const selfSignupAttempt2 = await anon.post('/api/auth/register', {
      account_type: 'staff',
      requested_role: 'admin',
      full_name: 'Fake Admin 2',
      email: 'fake.admin2@example.com',
      mobile: '+1-555-8002',
      password: 'Password@123',
    });
    assert.equal(selfSignupAttempt2.status, 403);

    // 3. Non-admin cannot access POST /api/admin/admins
    const doctorClient = srv.createClient();
    assert.equal((await doctorClient.login('doctor@demo.com', 'Doctor@123')).status, 200);
    const forbiddenCreate = await doctorClient.post('/api/admin/admins', {
      full_name: 'Unauthorized Admin',
      email: 'unauth.admin@hospital.org',
      password: 'Password@123',
    });
    assert.equal(forbiddenCreate.status, 403);

    // 4. Existing admin signs in via Admin portal and creates a new Admin via POST /api/admin/admins
    const adminClient = srv.createClient();
    const adminLogin = await adminClient.post('/api/auth/login', {
      identifier: 'admin@demo.com',
      password: 'Admin@123',
      expected_portal: 'admin',
      expected_role: 'admin',
    });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.data.user.role, 'admin');

    const created = await adminClient.post('/api/admin/admins', {
      full_name: 'Evelyn Carter',
      email: 'evelyn.admin@hospital.org',
      phone: '+1-555-9100',
      designation: 'Chief Operations Admin',
      password: 'AdminPass@123',
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.admin.role, 'admin');
    assert.ok(String(created.data.admin.user_code).startsWith('ADM-'));

    // Duplicate email rejected with 409
    const duplicate = await adminClient.post('/api/admin/admins', {
      full_name: 'Evelyn Duplicate',
      email: 'evelyn.admin@hospital.org',
      password: 'AdminPass@123',
    });
    assert.equal(duplicate.status, 409);

    // 5. Newly created admin can sign in on the Admin portal and list all user roles
    const newAdminClient = srv.createClient();
    const newAdminLogin = await newAdminClient.post('/api/auth/login', {
      identifier: 'evelyn.admin@hospital.org',
      password: 'AdminPass@123',
      expected_portal: 'admin',
      expected_role: 'admin',
    });
    assert.equal(newAdminLogin.status, 200);
    assert.equal(newAdminLogin.data.user.role, 'admin');

    const adminList = await newAdminClient.get('/api/admin/members?role=admin');
    assert.equal(adminList.status, 200);
    assert.ok(adminList.data.members.some((m) => m.email === 'evelyn.admin@hospital.org'));
  } finally {
    await srv.close();
  }
});
