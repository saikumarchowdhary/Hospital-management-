import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Section 1: Fresh boot contains only reference data, zero fake users/doctors, and hides demo accounts by default', async () => {
  const ctx = await startTestServer({ seedDemo: false });
  const prevVis = process.env.DEMO_ACCOUNTS_VISIBLE;
  const prevEnv = process.env.NODE_ENV;
  try {
    delete process.env.DEMO_ACCOUNTS_VISIBLE;
    delete process.env.NODE_ENV;

    // 1. Zero users, zero doctors, zero patients, zero appointments on fresh DB
    assert.equal(ctx.db.get('SELECT COUNT(*) as cnt FROM users').cnt, 0);
    assert.equal(ctx.db.get('SELECT COUNT(*) as cnt FROM doctor_profiles').cnt, 0);
    assert.equal(ctx.db.get('SELECT COUNT(*) as cnt FROM patient_profiles').cnt, 0);
    assert.equal(ctx.db.get('SELECT COUNT(*) as cnt FROM appointments').cnt, 0);
    assert.equal(ctx.db.get('SELECT COUNT(*) as cnt FROM invoices').cnt, 0);

    // Reference data IS seeded (roles, permissions, branches, departments, specialties, wards/beds, lab tests)
    assert.ok(ctx.db.get('SELECT COUNT(*) as cnt FROM roles').cnt >= 16);
    assert.ok(ctx.db.get('SELECT COUNT(*) as cnt FROM branches').cnt >= 3);
    assert.ok(ctx.db.get('SELECT COUNT(*) as cnt FROM departments').cnt >= 20);
    assert.ok(ctx.db.get('SELECT COUNT(*) as cnt FROM specialties').cnt >= 24);
    assert.ok(ctx.db.get('SELECT COUNT(*) as cnt FROM beds').cnt >= 10);
    assert.equal(ctx.db.get("SELECT COUNT(*) as cnt FROM beds WHERE status != 'Available'").cnt, 0);

    // 2. DEMO_ACCOUNTS_VISIBLE defaults to false
    const anon = ctx.createClient();
    const demoDefault = await anon.get('/api/demo-accounts');
    assert.equal(demoDefault.status, 200);
    assert.equal(demoDefault.data.visible, false);
    assert.deepEqual(demoDefault.data.accounts, []);

    // Demo accounts visible only when explicitly enabled in non-production
    process.env.DEMO_ACCOUNTS_VISIBLE = 'true';
    const demoOn = await anon.get('/api/demo-accounts');
    assert.equal(demoOn.status, 200);
    assert.equal(demoOn.data.visible, true);
    assert.ok(demoOn.data.accounts.length > 0);

    // Blocked in production even if DEMO_ACCOUNTS_VISIBLE=true
    process.env.NODE_ENV = 'production';
    const demoProd = await anon.get('/api/demo-accounts');
    assert.equal(demoProd.status, 200);
    assert.equal(demoProd.data.visible, false);
    assert.deepEqual(demoProd.data.accounts, []);
    delete process.env.NODE_ENV;
    delete process.env.DEMO_ACCOUNTS_VISIBLE;

    // 3. First-run setup screen flow creates first Admin once and locks permanently
    const statusBefore = await anon.get('/api/auth/setup-status');
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.needsSetup, true);

    const setupRes = await anon.post('/api/auth/setup-admin', {
      full_name: 'Primary Hospital Admin',
      email: 'chief.admin@hospital.org',
      mobile: '+1-555-7000',
      password: 'SecureAdmin99'
    });
    assert.equal(setupRes.status, 201);
    assert.equal(setupRes.data.user.role, 'admin');
    assert.ok(setupRes.data.token);

    const statusAfter = await anon.get('/api/auth/setup-status');
    assert.equal(statusAfter.status, 200);
    assert.equal(statusAfter.data.needsSetup, false);

    // Second setup attempt must be blocked (403)
    const secondSetup = await ctx.createClient().post('/api/auth/setup-admin', {
      full_name: 'Rogue Admin',
      email: 'rogue@hospital.org',
      password: 'RoguePass99'
    });
    assert.equal(secondSetup.status, 403);

    // Admin can create a second Admin via admin API
    const adm = ctx.createClient();
    const admLogin = await adm.login('chief.admin@hospital.org', 'SecureAdmin99');
    assert.equal(admLogin.status, 200);

    const ov = await adm.get('/api/admin/overview');
    const adminRoleId = ov.data.roles.find((r) => r.code === 'admin').id;
    const secondAdm = await adm.post('/api/admin/users', {
      full_name: 'Secondary Admin',
      email: 'deputy.admin@hospital.org',
      role_id: adminRoleId,
      password: 'DeputyPass99'
    });
    assert.equal(secondAdm.status, 201);

    const deputyLogin = await ctx.createClient().login('deputy.admin@hospital.org', 'DeputyPass99');
    assert.equal(deputyLogin.status, 200);
    assert.equal(deputyLogin.data.user.role, 'admin');

    // 4. Find a doctor & filters read from DB only (empty when no doctors exist)
    const docsRes = await adm.get('/api/doctors');
    assert.equal(docsRes.status, 200);
    assert.deepEqual(docsRes.data.doctors, []);

    const filtersRes = await adm.get('/api/doctors/meta/filters');
    assert.equal(filtersRes.status, 200);
    assert.ok(filtersRes.data.specialties.every((s) => s.doctor_count === 0));
  } finally {
    if (prevVis === undefined) delete process.env.DEMO_ACCOUNTS_VISIBLE;
    else process.env.DEMO_ACCOUNTS_VISIBLE = prevVis;
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
    await ctx.close();
  }
});

test('Section 1: ADMIN_EMAIL + ADMIN_PASSWORD env bootstrap & seed:demo production guard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medicore-sec1-'));
  const dbPath = path.join(tmpDir, 'hms.db');
  const prevEmail = process.env.ADMIN_EMAIL;
  const prevPass = process.env.ADMIN_PASSWORD;
  const prevName = process.env.ADMIN_NAME;
  try {
    // seed:demo MUST refuse in production
    let prodBlocked = false;
    try {
      execFileSync(process.execPath, ['scripts/seed-demo.js'], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production', HMS_DB_PATH: dbPath },
        stdio: 'pipe'
      });
    } catch (err) {
      prodBlocked = err.status !== 0;
    }
    assert.equal(prodBlocked, true);

    // seed:demo works in local/staging
    execFileSync(process.execPath, ['scripts/seed-demo.js'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'development', HMS_DB_PATH: dbPath },
      stdio: 'pipe'
    });
    assert.ok(fs.existsSync(dbPath));

    // Env bootstrap creates first Admin on clean DB
    const envDbPath = path.join(tmpDir, 'env-boot.db');
    process.env.ADMIN_EMAIL = 'env.admin@hospital.org';
    process.env.ADMIN_PASSWORD = 'EnvAdminPassword1';
    process.env.ADMIN_NAME = 'Env Bootstrapped Admin';
    const { createHmsApp } = await import('../server.js');
    const inst = createHmsApp({ dbPath: envDbPath, uploadDir: path.join(tmpDir, 'up'), dataDir: path.join(tmpDir, 'd'), jwtSecret: 'sec1' });
    try {
      const adminRow = inst.db.get("SELECT u.email, u.full_name, r.code as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin'");
      assert.equal(adminRow.email, 'env.admin@hospital.org');
      assert.equal(adminRow.full_name, 'Env Bootstrapped Admin');
    } finally {
      inst.db.close();
    }
  } finally {
    if (prevEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = prevEmail;
    if (prevPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = prevPass;
    if (prevName === undefined) delete process.env.ADMIN_NAME;
    else process.env.ADMIN_NAME = prevName;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
