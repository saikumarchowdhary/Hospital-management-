import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { DEMO_USERS } from '../db/seed.js';
import { startTestServer } from './helpers.js';

test('Auth Session & Refresh: Bearer-only token flow, profile rows for all demo accounts, SSE query token, and refresh rotation', async () => {
  const ctx = await startTestServer();
  try {
    // 1. Verify every demo user gets accessToken, refreshToken, and matching role + profile ID without cookies
    for (const u of DEMO_USERS) {
      const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
        body: JSON.stringify({ identifier: u.email, password: u.pass, expected_role: u.role })
      });
      assert.equal(res.status, 200, `Expected 200 login for ${u.email}`);
      const body = await res.json();
      assert.ok(body.token && body.accessToken, `Missing access token for ${u.email}`);
      assert.ok(body.refreshToken, `Missing refresh token for ${u.email}`);
      assert.equal(body.user.role, u.role);
      if (u.role === 'patient') assert.ok(body.user.patient_id, `Missing patient_profiles row for ${u.email}`);
      if (u.role === 'doctor') assert.ok(body.user.doctor_id, `Missing doctor_profiles row for ${u.email}`);
      if (u.role !== 'patient' && u.role !== 'candidate') {
        assert.ok(body.user.employee_id, `Missing employee_profiles row for ${u.email}`);
      }

      // Verify Bearer-only /api/auth/me works with zero cookies
      const meRes = await fetch(`${ctx.baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${body.accessToken}` }
      });
      assert.equal(meRes.status, 200, `Bearer /me failed for ${u.email}`);
    }

    // 2. Patient Bearer-only dashboard + SSE stream connection with ?token=
    const patLogin = await (await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
      body: JSON.stringify({ identifier: 'patient@demo.com', password: 'Patient@123', expected_role: 'patient' })
    })).json();

    const dashRes = await fetch(`${ctx.baseUrl}/api/patients/me/dashboard`, {
      headers: { Authorization: `Bearer ${patLogin.accessToken}` }
    });
    assert.equal(dashRes.status, 200);
    const dashData = await dashRes.json();
    assert.ok(dashData.profile.patient_code);

    const sseAc = new AbortController();
    const sseRes = await fetch(`${ctx.baseUrl}/api/events/stream?token=${encodeURIComponent(patLogin.accessToken)}`, {
      signal: sseAc.signal
    });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const firstChunk = new TextDecoder().decode((await reader.read()).value);
    assert.match(firstChunk, /event: connected/);
    sseAc.abort();

    // 3. Reject refresh token on regular endpoints, allow expired access token recovery via /api/auth/refresh
    const badUse = await fetch(`${ctx.baseUrl}/api/patients/me/dashboard`, {
      headers: { Authorization: `Bearer ${patLogin.refreshToken}` }
    });
    assert.equal(badUse.status, 401);

    const expiredAccess = jwt.sign({ sub: patLogin.user.id, role: 'patient', typ: 'access' }, 'medicore-test-secret-key', { expiresIn: '-10s' });
    const expiredRes = await fetch(`${ctx.baseUrl}/api/patients/me/dashboard`, {
      headers: { Authorization: `Bearer ${expiredAccess}` }
    });
    assert.equal(expiredRes.status, 401);
    const expiredBody = await expiredRes.json();
    assert.equal(expiredBody.error, 'Access token expired.');

    const refRes = await fetch(`${ctx.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MediCore-HMS' },
      body: JSON.stringify({ refreshToken: patLogin.refreshToken })
    });
    assert.equal(refRes.status, 200);
    const refreshed = await refRes.json();
    assert.ok(refreshed.accessToken && refreshed.refreshToken);

    const retriedDash = await fetch(`${ctx.baseUrl}/api/patients/me/dashboard`, {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` }
    });
    assert.equal(retriedDash.status, 200);
  } finally {
    await ctx.close();
  }
});
