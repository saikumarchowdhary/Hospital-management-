import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmsApp } from '../server.js';

export async function startTestServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medicore-test-'));
  const dbPath = path.join(tmpDir, 'hms.db');
  const uploadDir = path.join(tmpDir, 'uploads');
  const dataDir = path.join(tmpDir, 'data');

  const { app, db } = createHmsApp({ dbPath, uploadDir, dataDir, jwtSecret: 'medicore-test-secret-key' });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  function createClient() {
    const cookies = new Map();

    async function req(method, urlPath, body = null, extraHeaders = {}) {
      const headers = { 'X-Requested-With': 'MediCore-HMS', ...extraHeaders };
      if (cookies.size) {
        headers.Cookie = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const opts = { method, headers };
      if (body instanceof FormData) {
        opts.body = body;
      } else if (body !== null && body !== undefined) {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(`${baseUrl}${urlPath}`, opts);
      const setCookies = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
      for (const sc of setCookies) {
        const pair = sc.split(';')[0];
        const idx = pair.indexOf('=');
        if (idx > 0) {
          const k = pair.slice(0, idx).trim();
          const v = pair.slice(idx + 1).trim();
          if (v) cookies.set(k, v);
          else cookies.delete(k);
        }
      }

      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      return { status: res.status, data, headers: res.headers };
    }

    return {
      get: (p) => req('GET', p),
      post: (p, b) => req('POST', p, b),
      patch: (p, b) => req('PATCH', p, b),
      put: (p, b) => req('PUT', p, b),
      del: (p) => req('DELETE', p),
      async login(identifier, password) {
        return req('POST', '/api/auth/login', { identifier, password, remember: true });
      }
    };
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { baseUrl, dbPath, uploadDir, dataDir, db, createClient, close };
}
