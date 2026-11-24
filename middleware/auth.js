import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'medicore_token';
const REFRESH_COOKIE_NAME = 'medicore_refresh';

export function getJwtSecret(customDir) {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    return process.env.JWT_SECRET;
  }
  const dir = customDir || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const keyFile = path.join(dir, 'secret.key');
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').trim();
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(keyFile, secret, { mode: 0o600 });
  return secret;
}

function buildCookieString(name, value, req, maxAgeMs) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function setAuthCookie(req, res, token, remember = true, refreshToken = null) {
  const accessMaxAge = remember ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const cookies = [buildCookieString(COOKIE_NAME, token, req, accessMaxAge)];
  if (refreshToken) {
    const refreshMaxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    cookies.push(buildCookieString(REFRESH_COOKIE_NAME, refreshToken, req, refreshMaxAge));
  }
  res.setHeader('Set-Cookie', cookies.length === 1 ? cookies[0] : cookies);
}

export function clearAuthCookie(req, res) {
  res.setHeader('Set-Cookie', [
    buildCookieString(COOKIE_NAME, '', req, 0),
    buildCookieString(REFRESH_COOKIE_NAME, '', req, 0)
  ]);
}

export function createLoginRateLimiter() {
  const attempts = new Map();
  return (req, res, next) => {
    const key = req.ip || 'local';
    const now = Date.now();
    const record = attempts.get(key) || { count: 0, resetAt: now + 60_000 };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + 60_000;
    }
    record.count += 1;
    attempts.set(key, record);
    if (record.count > 30) {
      return res.status(429).json({ error: 'Too many authentication requests. Please wait a minute.' });
    }
    return next();
  };
}

export function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const publicAuthPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/setup-admin',
    '/api/auth/send-otp',
    '/api/auth/verify-otp',
    '/api/integrations/webhooks/payment'
  ];
  if (publicAuthPaths.includes(req.path)) {
    return next();
  }
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return next();
  }
  const hasCookie = Boolean(req.cookies && req.cookies[COOKIE_NAME]);
  if (!hasCookie) return next();
  const customHeader = req.headers['x-requested-with'];
  if (customHeader === 'MediCore-HMS') return next();
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return next();
    } catch {
      return res.status(403).json({ error: 'Invalid request origin.' });
    }
  }
  return res.status(403).json({ error: 'CSRF verification failed. Missing security header.' });
}

export function hydrateAuthenticatedUser(db, userId) {
  const user = db.get(
    `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.branch_id, u.department_id,
            u.is_active, u.account_status, r.id as role_id, r.code as role, r.name as role_name, r.is_staff,
            d.name as department_name, b.name as branch_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = ?`,
    [userId]
  );
  if (!user) return null;
  const perms = db.all(
    `SELECT p.code FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [user.role_id]
  );
  user.permissions = perms.map((p) => p.code);
  user.is_staff = Boolean(user.is_staff);
  user.account_status = user.account_status || 'Active';
  if (user.role === 'patient') {
    const pat = db.get('SELECT id, patient_code FROM patient_profiles WHERE user_id = ?', [user.id]);
    user.patient_id = pat ? pat.id : null;
    user.patient_code = pat ? pat.patient_code : null;
  }
  if (user.role === 'doctor') {
    const doc = db.get('SELECT id, doctor_code, schedule_configured FROM doctor_profiles WHERE user_id = ?', [user.id]);
    user.doctor_id = doc ? doc.id : null;
    user.schedule_configured = doc ? Boolean(doc.schedule_configured) : false;
  }
  if (user.is_staff) {
    const emp = db.get('SELECT id, employee_code FROM employee_profiles WHERE user_id = ?', [user.id]);
    user.employee_id = emp ? emp.id : null;
  }
  return user;
}

export function createAuthMiddleware(db, jwtSecret) {
  return (req, res, next) => {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
    if (!token && req.query && req.query.token && (fullPath === '/api/events/stream' || req.path === '/events/stream' || (req.originalUrl || '').startsWith('/api/events/stream'))) {
      token = String(req.query.token).trim();
    }
    if (!token && req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    }
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (decoded.typ === 'refresh') {
        return res.status(401).json({ error: 'Invalid token type. Access token required.' });
      }
      const user = hydrateAuthenticatedUser(db, decoded.sub);
      if (!user || !user.is_active || user.account_status !== 'Active' || user.role === 'pending_staff') {
        return res.status(401).json({ error: 'Account is inactive, suspended, or pending verification.' });
      }
      req.user = user;
      return next();
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token expired.' });
      }
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }
  };
}

export { COOKIE_NAME, REFRESH_COOKIE_NAME };
