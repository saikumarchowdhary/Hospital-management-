import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { startTestServer } from './helpers.js';

test('Admin & HR Registration: verification codes, HR bypass, duplicate checks, and multi-department support', async () => {
  const srv = await startTestServer();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevInvite = process.env.ADMIN_INVITE_CODE;
  delete process.env.ADMIN_INVITE_CODE;
  process.env.NODE_ENV = 'development';

  try {
    const anon = srv.createClient();

    // Verify dynamic department list includes Cardiology, Neurology, Admissions, Operations, Human Resources
    const metaRes = await anon.get('/api/auth/registration-meta');
    assert.equal(metaRes.status, 200);
    assert.equal(metaRes.data.isDemoVerificationMode, true);
    assert.equal(metaRes.data.demoAdminVerificationLabel, 'ADMIN 123');
    const depts = metaRes.data.departments || [];
    const deptNames = new Set(depts.map((d) => d.name));
    for (const expected of ['Cardiology', 'Neurology', 'Orthopedics', 'Admissions', 'Operations', 'Human Resources', 'Pharmacy', 'Radiology', 'Laboratory', 'Nursing']) {
      assert.ok(deptNames.has(expected), `Expected department ${expected} in registration-meta`);
    }

    const cardio = depts.find((d) => d.name === 'Cardiology');
    const neuro = depts.find((d) => d.name === 'Neurology');
    const ops = depts.find((d) => d.name === 'Operations');
    const hrDept = depts.find((d) => d.name === 'Human Resources');

    // Scenario 2: Admin registration with incorrect verification code fails
    const badCodeRes = await anon.post('/api/auth/register-admin-hr', {
      full_name: 'Bad Code Admin',
      email: 'badcode@hospital.org',
      mobile: '+1-555-0101',
      employee_id: 'EMP-BAD-01',
      department_id: cardio.id,
      designation: 'Cardiology Admin',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'WRONGCODE',
    });
    assert.equal(badCodeRes.status, 403);
    assert.equal(badCodeRes.data.error, 'Invalid Admin Verification Code.');
    assert.equal(srv.db.get('SELECT id FROM users WHERE email = ?', ['badcode@hospital.org']), undefined);

    // Scenario 2b: Missing verification code on Admin registration also fails
    const missingCodeRes = await anon.post('/api/auth/register-admin-hr', {
      full_name: 'Missing Code Super Admin',
      email: 'nocode@hospital.org',
      mobile: '+1-555-0102',
      employee_id: 'EMP-NO-01',
      department_id: ops.id,
      designation: 'Operations Super Admin',
      account_type: 'super_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
    });
    assert.equal(missingCodeRes.status, 403);
    assert.equal(missingCodeRes.data.error, 'Invalid Admin Verification Code.');

    // Scenario 1 & 4: Department Admin registration with valid ADMIN123 across Cardiology & Neurology
    const cardioClient = srv.createClient();
    const cardioReg = await cardioClient.post('/api/auth/register-admin-hr', {
      full_name: 'Dr. Alice CardioAdmin',
      email: 'alice.cardio@hospital.org',
      mobile: '+1-555-0201',
      employee_id: 'EMP-CARD-201',
      department_id: cardio.id,
      designation: 'Cardiology Department Administrator',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'ADMIN123',
    });
    assert.equal(cardioReg.status, 201);
    assert.equal(cardioReg.data.user.role, 'department_admin');
    assert.equal(cardioReg.data.user.department_id, cardio.id);
    assert.equal(cardioReg.data.user.department_name, 'Cardiology');
    assert.equal(cardioReg.data.user.employee_code, 'EMP-CARD-201');

    const neuroClient = srv.createClient();
    const neuroReg = await neuroClient.post('/api/auth/register-admin-hr', {
      full_name: 'Dr. Bob NeuroAdmin',
      email: 'bob.neuro@hospital.org',
      mobile: '+1-555-0202',
      employee_id: 'EMP-NEUR-202',
      department_id: neuro.id,
      designation: 'Neurology Department Administrator',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'ADMIN123',
    });
    assert.equal(neuroReg.status, 201);
    assert.equal(neuroReg.data.user.role, 'department_admin');
    assert.equal(neuroReg.data.user.department_id, neuro.id);

    // Super Admin registration with ADMIN123
    const superClient = srv.createClient();
    const superReg = await superClient.post('/api/auth/register-admin-hr', {
      full_name: 'Elena Vance SuperAdmin',
      email: 'elena.super@hospital.org',
      mobile: '+1-555-0203',
      employee_id: 'EMP-SUP-203',
      department_id: ops.id,
      designation: 'Chief Hospital Administrator',
      account_type: 'super_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'ADMIN123',
    });
    assert.equal(superReg.status, 201);
    assert.equal(superReg.data.user.role, 'admin');

    // Scenario 3: HR registration does NOT require Admin Verification Code
    const hrRegClient = srv.createClient();
    const hrReg = await hrRegClient.post('/api/auth/register-admin-hr', {
      full_name: 'Priya Sharma HR',
      email: 'priya.hr@hospital.org',
      mobile: '+1-555-0204',
      employee_id: 'EMP-HR-204',
      department_id: hrDept.id,
      designation: 'HR Generalist',
      account_type: 'hr',
      password: 'Password@123',
      confirm_password: 'Password@123',
    });
    assert.equal(hrReg.status, 201);
    assert.equal(hrReg.data.user.role, 'hr');
    assert.equal(hrReg.data.user.department_id, hrDept.id);

    // Scenario 5: Duplicate Email validation
    const dupEmailRes = await anon.post('/api/auth/register-admin-hr', {
      full_name: 'Duplicate Email User',
      email: 'ALICE.CARDIO@hospital.org',
      mobile: '+1-555-0991',
      employee_id: 'EMP-UNIQ-991',
      department_id: cardio.id,
      designation: 'HR Coordinator',
      account_type: 'hr',
      password: 'Password@123',
      confirm_password: 'Password@123',
    });
    assert.equal(dupEmailRes.status, 409);

    // Scenario 6: Duplicate Employee ID validation
    const dupEmpRes = await anon.post('/api/auth/register-admin-hr', {
      full_name: 'Duplicate EmpID User',
      email: 'unique.user@hospital.org',
      mobile: '+1-555-0992',
      employee_id: 'emp-card-201',
      department_id: cardio.id,
      designation: 'HR Coordinator',
      account_type: 'hr',
      password: 'Password@123',
      confirm_password: 'Password@123',
    });
    assert.equal(dupEmpRes.status, 409);

    // Production mode disables demo hint & ADMIN123 fallback, while DB invitation codes & ADMIN_INVITE_CODE work
    process.env.NODE_ENV = 'production';
    const prodMeta = await anon.get('/api/auth/registration-meta');
    assert.equal(prodMeta.data.isDemoVerificationMode, false);
    assert.equal(prodMeta.data.demoAdminVerificationLabel, null);

    const demoInProdRes = await anon.post('/api/auth/register-admin-hr', {
      full_name: 'Prod Blocked DemoCode',
      email: 'prodblock@hospital.org',
      mobile: '+1-555-0299',
      employee_id: 'EMP-PROD-299',
      department_id: cardio.id,
      designation: 'Admin',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'ADMIN123',
    });
    assert.equal(demoInProdRes.status, 403);

    // Super Admin issues a custom hashed invitation code via /api/admin/verification-codes
    const issueCodeRes = await superClient.post('/api/admin/verification-codes', {
      label: 'Operations Invite',
      code: 'OPS-SECURE-999',
      target_role: 'department_admin',
      department_id: ops.id,
    });
    assert.equal(issueCodeRes.status, 201);

    const prodValidRes = await anon.post('/api/auth/register-admin-hr', {
      full_name: 'Ops Prod Admin',
      email: 'ops.prod@hospital.org',
      mobile: '+1-555-0300',
      employee_id: 'EMP-OPS-300',
      department_id: ops.id,
      designation: 'Operations Manager',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'OPS-SECURE-999',
    });
    assert.equal(prodValidRes.status, 201);
    assert.equal(prodValidRes.data.user.role, 'department_admin');
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevInvite === undefined) delete process.env.ADMIN_INVITE_CODE;
    else process.env.ADMIN_INVITE_CODE = prevInvite;
    await srv.close();
  }
});

test('Login portals, strict department-level RBAC restrictions, HR dept filtering, logout & JWT expiration', async () => {
  const srv = await startTestServer();
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const cardioClient = srv.createClient();
    const neuroClient = srv.createClient();
    const superClient = srv.createClient();
    const hrClient = srv.createClient();

    const metaRes = await cardioClient.get('/api/auth/registration-meta');
    const cardio = metaRes.data.departments.find((d) => d.name === 'Cardiology');
    const neuro = metaRes.data.departments.find((d) => d.name === 'Neurology');
    const hrDept = metaRes.data.departments.find((d) => d.name === 'Human Resources');

    // Register Cardiology Dept Admin, Neurology Dept Admin, HR user, and login Super Admin
    await cardioClient.post('/api/auth/register-admin-hr', {
      full_name: 'Cardio Admin',
      email: 'cardio.admin@hospital.org',
      mobile: '+1-555-0401',
      employee_id: 'EMP-CA-401',
      department_id: cardio.id,
      designation: 'Cardiology Admin',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'ADMIN123',
    });

    await neuroClient.post('/api/auth/register-admin-hr', {
      full_name: 'Neuro Admin',
      email: 'neuro.admin@hospital.org',
      mobile: '+1-555-0402',
      employee_id: 'EMP-NA-402',
      department_id: neuro.id,
      designation: 'Neurology Admin',
      account_type: 'department_admin',
      password: 'Password@123',
      confirm_password: 'Password@123',
      verification_code: 'ADMIN123',
    });

    await hrClient.post('/api/auth/register-admin-hr', {
      full_name: 'HR Officer',
      email: 'hr.officer@hospital.org',
      mobile: '+1-555-0403',
      employee_id: 'EMP-HR-403',
      department_id: hrDept.id,
      designation: 'HR Officer',
      account_type: 'hr',
      password: 'Password@123',
      confirm_password: 'Password@123',
    });

    // Scenario 7 & 8: Login via Employee ID and Email with expected_portal checks
    const loginTest = srv.createClient();
    let r = await loginTest.post('/api/auth/login', {
      identifier: 'EMP-CA-401',
      password: 'Password@123',
      expected_portal: 'department_admin',
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'department_admin');

    // Department Admin rejected on Super Admin & HR portals
    for (const wrongPortal of ['admin', 'hr', 'publisher', 'patient', 'staff']) {
      const blocked = await loginTest.post('/api/auth/login', {
        identifier: 'EMP-CA-401',
        password: 'Password@123',
        expected_portal: wrongPortal,
      });
      assert.equal(blocked.status, 403, `Expected 403 when department_admin tries portal ${wrongPortal}`);
    }

    // Super Admin login succeeds on admin portal, blocked on department_admin portal
    r = await superClient.post('/api/auth/login', {
      identifier: 'admin@demo.com',
      password: 'Admin@123',
      expected_portal: 'admin',
    });
    assert.equal(r.status, 200);
    const superWrong = await srv.createClient().post('/api/auth/login', {
      identifier: 'admin@demo.com',
      password: 'Admin@123',
      expected_portal: 'department_admin',
    });
    assert.equal(superWrong.status, 403);

    // HR login via Employee ID works on hr portal
    r = await srv.createClient().post('/api/auth/login', {
      identifier: 'EMP-HR-403',
      password: 'Password@123',
      expected_portal: 'hr',
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'hr');

    // Scenario 8: HR dashboard & department-wise employee filtering
    const hrDash = await hrClient.get('/api/hr/dashboard');
    assert.equal(hrDash.status, 200);
    const hrCardioEmps = await hrClient.get(`/api/hr/employees?department_id=${cardio.id}`);
    assert.equal(hrCardioEmps.status, 200);
    assert.ok(hrCardioEmps.data.employees.length >= 1);
    assert.ok(hrCardioEmps.data.employees.every((e) => e.department_id === cardio.id));

    // Scenario 9: Department-level isolation
    // 9a: Cardiology Admin reads Cardiology dashboard & creates a nurse in Cardiology
    const cardioDash = await cardioClient.get('/api/department-admin/dashboard');
    assert.equal(cardioDash.status, 200);
    assert.equal(cardioDash.data.department.id, cardio.id);
    const nurseRole = cardioDash.data.staffRoles.find((sr) => sr.code === 'nurse');
    assert.ok(nurseRole, 'Expected nurse role in staffRoles');
    assert.ok(!cardioDash.data.staffRoles.some((sr) => sr.code === 'admin' || sr.code === 'department_admin'));

    const createdCardioEmp = await cardioClient.post('/api/department-admin/employees', {
      full_name: 'Cardio Nurse One',
      email: 'cardio.nurse1@hospital.org',
      phone: '+1-555-0501',
      role_id: nurseRole.id,
      designation: 'Cardiac Ward Nurse',
      password: 'Password@123',
    });
    assert.equal(createdCardioEmp.status, 201);
    assert.equal(createdCardioEmp.data.employee.department_id, cardio.id);

    // Neurology Admin creates a nurse in Neurology
    const createdNeuroEmp = await neuroClient.post('/api/department-admin/employees', {
      full_name: 'Neuro Nurse One',
      email: 'neuro.nurse1@hospital.org',
      phone: '+1-555-0502',
      role_id: nurseRole.id,
      designation: 'Neuro ICU Nurse',
      password: 'Password@123',
    });
    assert.equal(createdNeuroEmp.status, 201);
    const neuroEmpId = createdNeuroEmp.data.employee.id;

    // 9b: Cardiology Admin CANNOT access Neurology dashboard, employees, or mutate Neurology staff
    const crossDash = await cardioClient.get(`/api/department-admin/dashboard?department_id=${neuro.id}`);
    assert.equal(crossDash.status, 403);

    const crossEmps = await cardioClient.get(`/api/department-admin/employees?department_id=${neuro.id}`);
    assert.equal(crossEmps.status, 403);

    const crossPatch = await cardioClient.patch(`/api/department-admin/employees/${neuroEmpId}`, {
      designation: 'Tampered',
    });
    assert.equal(crossPatch.status, 403);

    // 9c: Cross-department queries on patients/appointments/admissions blocked with 403
    const crossPatients = await cardioClient.get(`/api/patients?department_id=${neuro.id}`);
    assert.equal(crossPatients.status, 403);
    const crossAppts = await cardioClient.get(`/api/appointments?department_id=${neuro.id}`);
    assert.equal(crossAppts.status, 403);
    const crossAdms = await cardioClient.get(`/api/admissions?department_id=${neuro.id}`);
    assert.equal(crossAdms.status, 403);

    // 9d: Department Admin CANNOT access Super Admin global governance routes or HR payroll
    const adminOverview = await cardioClient.get('/api/admin/overview');
    assert.equal(adminOverview.status, 403);
    const payrollAttempt = await cardioClient.post('/api/hr/payroll/run', {});
    assert.equal(payrollAttempt.status, 403);

    // 9e: Super Admin CAN inspect Neurology via department_id override
    const superNeuroDash = await superClient.get(`/api/department-admin/dashboard?department_id=${neuro.id}`);
    assert.equal(superNeuroDash.status, 200);
    assert.equal(superNeuroDash.data.department.id, neuro.id);

    // Scenario 10: Logout clears session & expired JWT is rejected
    const logoutRes = await cardioClient.post('/api/auth/logout', {});
    assert.equal(logoutRes.status, 200);

    const afterLogoutMe = await cardioClient.get('/api/auth/me');
    assert.equal(afterLogoutMe.status, 401);
    const afterLogoutDash = await cardioClient.get('/api/department-admin/dashboard');
    assert.equal(afterLogoutDash.status, 401);

    // Expired JWT token rejection
    const expiredToken = jwt.sign(
      { sub: 1, role: 'department_admin' },
      'medicore-test-secret-key',
      { expiresIn: -10 }
    );
    const expRes = await fetch(`${srv.baseUrl}/api/department-admin/dashboard`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expRes.status, 401);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    await srv.close();
  }
});
