import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEMO_USERS } from '../db/seed.js';
import { createHmsApp } from '../server.js';
import { startTestServer } from './helpers.js';

test('Auth: patient registration, duplicate prevention, and staff self-registration block', async () => {
  const ctx = await startTestServer();
  try {
    const c = ctx.createClient();
    // Attempt to register with staff account_type='admin' must downgrade to patient (never staff)
    const reg = await c.post('/api/auth/register', {
      full_name: 'Alice Walker',
      email: 'alice@example.com',
      mobile: '+1-555-9901',
      dob: '1993-06-11',
      gender: 'Female',
      address: '45 Pine Ave',
      password: 'Password123',
      account_type: 'admin',
      consent: true
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.role, 'patient');
    assert.equal(reg.data.user.is_staff, false);

    // Duplicate registration blocked (409)
    const dup = await c.post('/api/auth/register', {
      full_name: 'Alice Walker 2',
      email: 'alice@example.com',
      mobile: '+1-555-9901',
      dob: '1993-06-11',
      gender: 'Female',
      address: '45 Pine Ave',
      password: 'Password123',
      consent: true
    });
    assert.equal(dup.status, 409);

    // Verify registered user can authenticate
    const c2 = ctx.createClient();
    const login = await c2.login('alice@example.com', 'Password123');
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, 'patient');
  } finally {
    await ctx.close();
  }
});

test('Auth: all 15 demo roles authenticate automatically with expected role', async () => {
  const ctx = await startTestServer();
  try {
    for (const u of DEMO_USERS) {
      const c = ctx.createClient();
      const res = await c.login(u.email, u.pass);
      assert.equal(res.status, 200, `Login failed for ${u.email}`);
      assert.equal(res.data.user.role, u.role);
      const me = await c.get('/api/auth/me');
      assert.equal(me.status, 200);
      assert.equal(me.data.user.role, u.role);
    }
  } finally {
    await ctx.close();
  }
});

test('Auth: unauthorized access, blocked user, password reset, and lockout behavior', async () => {
  const ctx = await startTestServer();
  try {
    const anon = ctx.createClient();
    const unauth = await anon.get('/api/patients');
    assert.equal(unauth.status, 401);

    // Lockout after 5 failed attempts on candidate account
    const badClient = ctx.createClient();
    for (let i = 0; i < 4; i++) {
      const fail = await badClient.login('candidate@demo.com', 'WrongPass1');
      assert.equal(fail.status, 401);
    }
    const fifth = await badClient.login('candidate@demo.com', 'WrongPass1');
    assert.equal(fifth.status, 401);
    const locked = await badClient.login('candidate@demo.com', 'Candidate@123');
    assert.equal(locked.status, 423);

    // Password reset clears lock and updates password
    const fp = await anon.post('/api/auth/forgot-password', { email: 'candidate@demo.com' });
    assert.equal(fp.status, 200);
    assert.ok(fp.data.demoResetCode);
    const rp = await anon.post('/api/auth/reset-password', {
      email: 'candidate@demo.com',
      code: fp.data.demoResetCode,
      new_password: 'NewCandidate99'
    });
    assert.equal(rp.status, 200);
    const relogin = await badClient.login('candidate@demo.com', 'NewCandidate99');
    assert.equal(relogin.status, 200);

    // Admin blocks user -> blocked user gets 403
    const adm = ctx.createClient();
    await adm.login('admin@demo.com', 'Admin@123');
    const candId = relogin.data.user.id;
    const block = await adm.patch(`/api/admin/users/${candId}/status`, { is_active: false });
    assert.equal(block.status, 200);
    const blockedLogin = await ctx.createClient().login('candidate@demo.com', 'NewCandidate99');
    assert.equal(blockedLogin.status, 403);
  } finally {
    await ctx.close();
  }
});

test('Persistence: created records survive server/DB restart', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medicore-persist-'));
  const opts = {
    dbPath: path.join(tmpDir, 'hms.db'),
    uploadDir: path.join(tmpDir, 'uploads'),
    dataDir: path.join(tmpDir, 'data'),
    jwtSecret: 'persist-secret'
  };
  try {
    let instance = createHmsApp(opts);
    let srv = await new Promise((resolve) => {
      const s = instance.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url1 = `http://127.0.0.1:${srv.address().port}`;
    await fetch(`${url1}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
      body: JSON.stringify({
        full_name: 'Persisted Patient',
        email: 'persist@example.com',
        mobile: '+1-555-7777',
        dob: '1988-02-02',
        gender: 'Male',
        address: '10 Oak Rd',
        password: 'Persist123',
        consent: true
      })
    });
    await new Promise((resolve) => srv.close(resolve));
    instance.db.close();

    // Restart with same dbPath
    instance = createHmsApp(opts);
    srv = await new Promise((resolve) => {
      const s = instance.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const url2 = `http://127.0.0.1:${srv.address().port}`;
    const loginRes = await fetch(`${url2}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
      body: JSON.stringify({ identifier: 'persist@example.com', password: 'Persist123' })
    });
    assert.equal(loginRes.status, 200);
    const body = await loginRes.json();
    assert.equal(body.user.full_name, 'Persisted Patient');
    await new Promise((resolve) => srv.close(resolve));
    instance.db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
