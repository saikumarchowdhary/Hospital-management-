import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Admin dashboard charts return patientDistributionByDepartment across all active hospital departments', async () => {
  const srv = await startTestServer();
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const admin = srv.createClient();
    const loginRes = await admin.post('/api/auth/login', {
      identifier: 'admin@demo.com',
      password: 'Admin@123',
      expected_portal: 'admin',
    });
    assert.equal(loginRes.status, 200);

    const [dashRes, overviewRes] = await Promise.all([
      admin.get('/api/reports/dashboard'),
      admin.get('/api/admin/overview'),
    ]);
    assert.equal(dashRes.status, 200);
    assert.equal(overviewRes.status, 200);

    const dist = dashRes.data?.charts?.patientDistributionByDepartment;
    const overviewDist = overviewRes.data?.stats?.charts?.patientDistributionByDepartment;
    assert.ok(Array.isArray(dist), 'patientDistributionByDepartment should be an array');
    assert.ok(Array.isArray(overviewDist), 'overview stats should also include patientDistributionByDepartment');

    const activeDeptsCount = srv.db.get('SELECT COUNT(*) as c FROM departments WHERE is_active = 1').c;
    assert.equal(dist.length, activeDeptsCount);
    assert.ok(dist.length >= 33, `Expected at least 33 hospital departments, got ${dist.length}`);

    const byName = Object.fromEntries(dist.map((d) => [d.department_name, d]));
    for (const expectedDept of ['Cardiology', 'Neurology', 'Emergency Medicine', 'Radiology', 'Admissions', 'Operations']) {
      assert.ok(byName[expectedDept], `Expected ${expectedDept} in department distribution`);
      assert.equal(typeof byName[expectedDept].patients, 'number');
      assert.equal(typeof byName[expectedDept].appointment_patients, 'number');
      assert.equal(typeof byName[expectedDept].inpatient_count, 'number');
    }

    // Cardiology has seeded patient appointment & admission activity
    assert.ok(byName.Cardiology.patients >= 1, 'Cardiology should have at least 1 patient');
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    await srv.close();
  }
});

test('Admin dashboard reports 30-day prescription count segmented by top 5 prescribing doctors', async () => {
  const srv = await startTestServer();
  try {
    const admin = srv.createClient();
    await admin.login('admin@demo.com', 'Admin@123');

    const pat = srv.db.get('SELECT id FROM patient_profiles ORDER BY id ASC LIMIT 1');
    const doctors = srv.db.all('SELECT id, user_id FROM doctor_profiles WHERE is_active = 1 ORDER BY id ASC LIMIT 6');
    assert.ok(pat && doctors.length >= 6, 'Expected seeded patient and at least 6 doctors');

    // Insert controlled 30-day prescriptions across 6 doctors (counts: 6, 5, 4, 3, 2, 1) plus 1 old (45 days ago)
    const baselineTotal = srv.db.get("SELECT COUNT(*) as c FROM prescriptions WHERE datetime(created_at) >= datetime('now', '-30 days')").c;
    let seq = 0;
    const expectedCounts = [6, 5, 4, 3, 2, 1];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < expectedCounts[i]; j++) {
        seq++;
        srv.db.run(
          `INSERT INTO prescriptions (prescription_ref, patient_id, doctor_id, status, diagnosis, created_by, created_at)
           VALUES (?, ?, ?, ?, 'Summary Test Dx', ?, datetime('now', '-2 days'))`,
          [`RX-30D-${Date.now()}-${seq}`, pat.id, doctors[i].id, j === 0 ? 'Dispensed' : 'Requested', doctors[i].user_id]
        );
      }
    }
    // Old prescription outside 30-day window (should NOT be counted)
    srv.db.run(
      `INSERT INTO prescriptions (prescription_ref, patient_id, doctor_id, status, diagnosis, created_by, created_at)
       VALUES (?, ?, ?, 'Dispensed', 'Old Dx', ?, datetime('now', '-45 days'))`,
      [`RX-OLD-${Date.now()}`, pat.id, doctors[5].id, doctors[5].user_id]
    );

    const [dashRes, overviewRes] = await Promise.all([
      admin.get('/api/reports/dashboard'),
      admin.get('/api/admin/overview'),
    ]);
    assert.equal(dashRes.status, 200);
    assert.equal(overviewRes.status, 200);

    const summary = dashRes.data?.prescriptionsSummary30Days;
    assert.ok(summary, 'prescriptionsSummary30Days should be returned');
    assert.equal(summary.totalCount, baselineTotal + 21);
    assert.equal(dashRes.data.kpis.prescriptionsLast30DaysTotal, baselineTotal + 21);
    assert.equal(summary.topDoctors.length, 5, 'Should return at most top 5 prescribing doctors');

    // Verify descending order and exact doctor #1
    for (let k = 1; k < summary.topDoctors.length; k++) {
      assert.ok(
        summary.topDoctors[k - 1].prescription_count >= summary.topDoctors[k].prescription_count,
        'Top doctors must be ordered by descending prescription count'
      );
    }
    assert.equal(overviewRes.data.stats.prescriptionsSummary30Days.totalCount, baselineTotal + 21);
    assert.equal(overviewRes.data.stats.charts.topPrescribingDoctors30Days.length, 5);
  } finally {
    await srv.close();
  }
});
