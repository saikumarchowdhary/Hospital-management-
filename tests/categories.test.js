import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('category table schema, seeded categories, RBAC protection, and CRUD API', async () => {
  const srv = await startTestServer();
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    // 1. Verify SQLite category table schema matches category_id (PK), name (NOT NULL UNIQUE), description (nullable)
    const columns = srv.db.all('PRAGMA table_info(category)');
    assert.equal(columns.length, 3);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    assert.ok(byName.category_id && byName.category_id.pk === 1);
    assert.ok(byName.name && byName.name.notnull === 1);
    assert.ok(byName.description && byName.description.notnull === 0);

    // 2. Unauthenticated access rejected
    const anon = srv.createClient();
    const unauthRes = await anon.get('/api/categories');
    assert.equal(unauthRes.status, 401);

    // 3. Login as Super Admin & Patient
    const admin = srv.createClient();
    const adminLogin = await admin.post('/api/auth/login', {
      identifier: 'admin@demo.com',
      password: 'Admin@123',
      expected_portal: 'admin',
    });
    assert.equal(adminLogin.status, 200);

    const patient = srv.createClient();
    const patLogin = await patient.post('/api/auth/login', {
      identifier: 'patient@demo.com',
      password: 'Patient@123',
      expected_portal: 'patient',
    });
    assert.equal(patLogin.status, 200);

    // 4. Non-admin can read /api/categories, but is blocked from /api/admin/categories mutations (403)
    const patRead = await patient.get('/api/categories');
    assert.equal(patRead.status, 200);
    assert.ok(patRead.data.categories.length >= 6);

    const patCreate = await patient.post('/api/admin/categories', { name: 'Unauthorized Cat' });
    assert.equal(patCreate.status, 403);

    // 5. Admin Create, Validation, Uniqueness, Update, and Delete
    const emptyName = await admin.post('/api/admin/categories', { name: '   ', description: 'Invalid' });
    assert.equal(emptyName.status, 400);

    const createdNullDesc = await admin.post('/api/admin/categories', {
      name: 'Emergency Triage',
    });
    assert.equal(createdNullDesc.status, 201);
    assert.equal(createdNullDesc.data.category.name, 'Emergency Triage');
    assert.equal(createdNullDesc.data.category.description, null);
    assert.ok(createdNullDesc.data.category.category_id > 0);

    const duplicateRes = await admin.post('/api/admin/categories', {
      name: 'emergency triage',
      description: 'Should fail uniqueness',
    });
    assert.equal(duplicateRes.status, 409);

    const cid = createdNullDesc.data.category.category_id;
    const updatedRes = await admin.patch(`/api/admin/categories/${cid}`, {
      name: 'Emergency & Trauma Care',
      description: 'Escalations and urgent triage feedback',
    });
    assert.equal(updatedRes.status, 200);
    assert.equal(updatedRes.data.category.name, 'Emergency & Trauma Care');
    assert.equal(updatedRes.data.category.description, 'Escalations and urgent triage feedback');

    const listRes = await admin.get('/api/admin/categories');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.data.categories.some((c) => c.category_id === cid && c.name === 'Emergency & Trauma Care'));

    const delRes = await admin.del(`/api/admin/categories/${cid}`);
    assert.equal(delRes.status, 200);

    const afterDel = await admin.get('/api/admin/categories');
    assert.ok(!afterDel.data.categories.some((c) => c.category_id === cid));
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    await srv.close();
  }
});
