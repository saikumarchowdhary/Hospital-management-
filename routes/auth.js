import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';
import { COOKIE_NAME, REFRESH_COOKIE_NAME, clearAuthCookie, createLoginRateLimiter, hydrateAuthenticatedUser, setAuthCookie } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { isStrongPassword, validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { SELF_REGISTER_STAFF_ROLES, generateNextPatientCode, registerStaffPendingTx } from './registration_helpers.js';

function issueSessionTokens(userId, roleCode, jwtSecret, remember = true) {
  const accessTtlSec = remember ? 12 * 3600 : 4 * 3600;
  const refreshTtlSec = remember ? 30 * 24 * 3600 : 7 * 24 * 3600;
  const accessToken = jwt.sign({ sub: userId, role: roleCode, typ: 'access' }, jwtSecret, { expiresIn: accessTtlSec });
  const refreshToken = jwt.sign({ sub: userId, role: roleCode, typ: 'refresh' }, jwtSecret, { expiresIn: refreshTtlSec });
  return { accessToken, refreshToken, expiresAt: Date.now() + accessTtlSec * 1000 };
}

export function createAuthRouter(db, jwtSecret, authenticate, broker = null, upload = null) {
  const router = express.Router();
  const limiter = createLoginRateLimiter();
  const regUpload = upload
    ? upload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'licence', maxCount: 1 },
      { name: 'document_file', maxCount: 1 }
    ])
    : (_req, _res, next) => next();

  router.get('/setup-status', (_req, res) => {
    const row = db.get(
      `SELECT COUNT(*) as cnt FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' AND u.is_active = 1`
    );
    const demoAccountsVisible =
      process.env.NODE_ENV !== 'production' &&
      (process.env.DEMO_ACCOUNTS_VISIBLE === 'true' || process.env.DEMO_ACCOUNTS_VISIBLE === '1');
    res.json({ needsSetup: !row || row.cnt === 0, demoAccountsVisible });
  });

  router.post(
    '/setup-admin',
    limiter,
    [
      body('full_name').trim().isLength({ min: 2 }).withMessage('Full name is required.'),
      body('email').isEmail().normalizeEmail().withMessage('Valid administrator email is required.'),
      body('mobile').optional({ checkFalsy: true }).trim().isLength({ min: 6 }).withMessage('Valid mobile number is required.'),
      body('password').custom(isStrongPassword).withMessage('Password must be at least 8 characters and include at least one number.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { full_name, email, mobile = '', password } = req.body;
      const hash = bcrypt.hashSync(password, 10);
      const userCode = `ADM-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;

      const createdId = db.transaction(() => {
        const existingAdmin = db.get(
          `SELECT COUNT(*) as cnt FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' AND u.is_active = 1`
        );
        if (existingAdmin && existingAdmin.cnt > 0) {
          throw new AppError(403, 'Initial administrator has already been created. Please sign in.');
        }
        const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
        if (dup) throw new AppError(409, 'An account with this email already exists.');

        const adminRole = db.get("SELECT id FROM roles WHERE code = 'admin'");
        const mainBranch = db.get("SELECT id FROM branches WHERE code = 'MAIN'") || db.get('SELECT id FROM branches ORDER BY id LIMIT 1');
        const admDept = db.get("SELECT id FROM departments WHERE name = 'Administration'") || db.get('SELECT id FROM departments ORDER BY id LIMIT 1');

        const uInfo = db.run(
          `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
          [userCode, email, hash, full_name.trim(), mobile ? String(mobile).trim() : '', adminRole.id, mainBranch?.id || null, admDept?.id || null]
        );
        db.run(
          `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, employment_status, base_salary)
           VALUES (?, ?, ?, ?, 'ADMINISTRATOR', date('now'), 'Active', 0)`,
          [uInfo.lastInsertRowid, `EMP-${userCode}`, admDept?.id || null, mainBranch?.id || null]
        );
        logAudit(db, {
          actorUserId: uInfo.lastInsertRowid,
          actorRole: 'admin',
          action: 'auth.setup_admin',
          entityType: 'user',
          entityId: uInfo.lastInsertRowid,
          ip: req.ip
        });
        return uInfo.lastInsertRowid;
      })();

      const { accessToken, refreshToken, expiresAt } = issueSessionTokens(createdId, 'admin', jwtSecret, true);
      setAuthCookie(req, res, accessToken, true, refreshToken);
      const hydratedUser = hydrateAuthenticatedUser(db, createdId);
      return res.status(201).json({
        token: accessToken,
        accessToken,
        refreshToken,
        expiresAt,
        message: 'Initial Administrator account created successfully.',
        user: hydratedUser
      });
    })
  );

  router.get('/registration-meta', (_req, res) => {
    const roles = db.all('SELECT id, code, name, is_staff FROM roles ORDER BY id')
      .filter((r) => SELF_REGISTER_STAFF_ROLES.includes(r.code));
    const departments = db.all('SELECT id, name, category FROM departments WHERE is_active = 1 ORDER BY name');
    const branches = db.all('SELECT id, code, name FROM branches WHERE is_active = 1 ORDER BY id');
    const specialties = db.all('SELECT id, name, department_id FROM specialties ORDER BY name');
    res.json({ staffRoles: roles, departments, branches, specialties });
  });

  router.post(
    '/send-otp',
    limiter,
    [
      body('channel').isIn(['email', 'sms']).withMessage('Channel must be email or sms.'),
      body('target').trim().notEmpty().withMessage('Target email or phone is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { channel, target, purpose = 'signup' } = req.body;
      const normalizedTarget = String(target).trim().toLowerCase();
      const code = String(crypto.randomInt(100000, 999999));
      const hash = bcrypt.hashSync(code, 8);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      db.run(
        `INSERT INTO otp_verifications (channel, target, purpose, code_hash, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [channel, normalizedTarget, String(purpose || 'signup'), hash, expiresAt]
      );
      db.run(
        `INSERT INTO integration_deliveries (channel, recipient, subject, message, mode, status, provider_ref)
         VALUES (?, ?, 'MediCore Verification Code', ?, 'Sandbox', 'Delivered', ?)`,
        [channel, normalizedTarget, 'One-time verification code dispatched (valid 10 minutes).', `OTP-${Date.now()}`]
      );

      const payload = { ok: true, message: `Verification code sent via ${channel}.` };
      if (process.env.NODE_ENV !== 'production') {
        payload.sandboxCode = code;
      }
      return res.json(payload);
    })
  );

  router.post(
    '/verify-otp',
    limiter,
    [
      body('channel').isIn(['email', 'sms']).withMessage('Channel must be email or sms.'),
      body('target').trim().notEmpty().withMessage('Target email or phone is required.'),
      body('code').trim().notEmpty().withMessage('OTP code is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { channel, target, code, purpose = 'signup' } = req.body;
      const normalizedTarget = String(target).trim().toLowerCase();
      const row = db.get(
        `SELECT * FROM otp_verifications
         WHERE channel = ? AND target = ? AND purpose = ? AND verified_at IS NULL
         ORDER BY id DESC LIMIT 1`,
        [channel, normalizedTarget, String(purpose || 'signup')]
      );
      if (!row || new Date(row.expires_at) < new Date() || !bcrypt.compareSync(String(code).trim(), row.code_hash)) {
        throw new AppError(400, 'Invalid or expired verification code.');
      }
      db.run("UPDATE otp_verifications SET verified_at = datetime('now') WHERE id = ?", [row.id]);
      return res.json({ verified: true, message: 'Verification code confirmed.' });
    })
  );

  router.post(
    '/login',
    limiter,
    [
      body('identifier').trim().notEmpty().withMessage('Email or User ID is required.'),
      body('password').notEmpty().withMessage('Password is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { identifier, password, remember = true, expected_role = null } = req.body;
      const user = db.get(
        `SELECT u.*, r.code as role, r.name as role_name, r.is_staff,
                d.name as department_name, b.name as branch_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE lower(u.email) = lower(?) OR upper(u.user_code) = upper(?)`,
        [identifier, identifier]
      );

      if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({ error: 'Account temporarily locked due to repeated failed attempts. Try again later.' });
      }

      // Verify password BEFORE inspecting account status so login never leaks whether an email exists on invalid password
      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) {
        const attempts = user.failed_attempts + 1;
        const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockUntil, user.id]);
        logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'auth.login_failed', entityType: 'user', entityId: user.id, ip: req.ip });
        return res.status(401).json({ error: lockUntil ? 'Account locked for 15 minutes after 5 failed attempts.' : 'Invalid credentials.' });
      }

      if (user.account_status === 'Rejected') {
        const sr = db.get('SELECT rejection_reason FROM staff_signup_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id]);
        const reason = sr?.rejection_reason || user.review_notes || '';
        return res.status(403).json({
          error: reason
            ? `Your registration request was rejected: ${reason}`
            : 'Your registration request was declined. Contact hospital administration.',
          account_status: 'Rejected',
          reason
        });
      }
      if (user.account_status === 'Suspended' || user.account_status === 'Withdrawn' || !user.is_active) {
        return res.status(403).json({
          error: 'This account has been deactivated or suspended. Contact hospital administration.',
          account_status: user.account_status || 'Suspended'
        });
      }
      if (user.account_status === 'Pending Verification') {
        return res.status(403).json({
          error: 'Your doctor account is pending licence verification by hospital administration.',
          account_status: 'Pending Verification'
        });
      }
      if (user.account_status === 'Pending Approval' || user.role === 'pending_staff') {
        return res.status(403).json({
          error: 'Your registration is awaiting administrator approval. Please check back once approved.',
          account_status: user.account_status || 'Pending Approval'
        });
      }
      if (expected_role && user.role !== expected_role) {
        return res.status(403).json({ error: `Account belongs to "${user.role_name}". Switch to the ${user.role_name} portal to sign in.` });
      }

      db.run("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?", [user.id]);
      const { accessToken, refreshToken, expiresAt } = issueSessionTokens(user.id, user.role, jwtSecret, remember);
      setAuthCookie(req, res, accessToken, remember, refreshToken);

      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'auth.login_success', entityType: 'user', entityId: user.id, ip: req.ip });
      const hydratedUser = hydrateAuthenticatedUser(db, user.id);

      return res.json({
        token: accessToken,
        accessToken,
        refreshToken,
        expiresAt,
        user: hydratedUser
      });
    })
  );

  router.post(
    '/register',
    limiter,
    regUpload,
    [
      body('full_name').trim().isLength({ min: 2 }).withMessage('Full name is required.'),
      body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
      body('mobile').trim().isLength({ min: 6 }).withMessage('Valid mobile number is required.'),
      body('password').custom(isStrongPassword).withMessage('Password must be at least 8 characters and include at least one number.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const accType = String(req.body.account_type || '').toLowerCase();
      const reqRole = String(req.body.requested_role || req.body.role || '').toLowerCase();

      if (accType === 'admin' || reqRole === 'admin') {
        throw new AppError(403, 'Administrator accounts cannot be created via public sign-up. Please contact hospital administration.');
      }

      if (accType === 'doctor' || reqRole === 'doctor') {
        const pendingDoctor = registerStaffPendingTx(db, broker, { ...req.body, account_type: 'doctor', requested_role: 'doctor' }, req.ip, req.files);
        return res.status(201).json({
          pendingVerification: true,
          pendingApproval: true,
          message: `Doctor verification submitted (${pendingDoctor.user_code}). Your credentials are pending administrator verification.`,
          user: pendingDoctor
        });
      }

      if (accType === 'staff') {
        const pendingUser = registerStaffPendingTx(db, broker, req.body, req.ip, req.files);
        return res.status(201).json({
          pendingApproval: true,
          message: `Registration request submitted (${pendingUser.user_code}). Your application is awaiting administrative review.`,
          user: pendingUser
        });
      }

      const {
        full_name, email, mobile,
        dob = '1990-01-01',
        gender = 'Prefer not to say',
        address = 'Not provided',
        emergency_contact_name = '', emergency_contact_phone = '',
        password, account_type = 'patient', consent,
        consent_text = 'I consent to MediCore HMS storing my personal health profile, care records, and appointments.',
        consent_version = 'v2.0',
        otp_verified = false
      } = req.body;

      const safeRoleCode = account_type === 'candidate' ? 'candidate' : 'patient';
      if (safeRoleCode === 'patient' && !(consent === true || consent === 'true')) {
        throw new AppError(400, 'Patient privacy consent acceptance is required.');
      }

      const safeEmail = String(email).trim().toLowerCase();
      const safeMobile = String(mobile).trim();
      const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?', [safeEmail, safeMobile]);
      if (dup) throw new AppError(409, 'An account with this email or mobile number already exists.');

      const role = db.get('SELECT id, code, name FROM roles WHERE code = ?', [safeRoleCode]);
      const hash = bcrypt.hashSync(password, 10);
      const rand = crypto.randomInt(10, 99);
      const userCode = `${safeRoleCode === 'candidate' ? 'CAN' : 'PAT'}-${String(Date.now()).slice(-4)}${rand}`;

      const created = db.transaction(() => {
        const uInfo = db.run(
          `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, account_status)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'Active')`,
          [userCode, safeEmail, hash, full_name.trim(), safeMobile, role.id]
        );
        let patientCode = null;
        if (safeRoleCode === 'patient') {
          patientCode = generateNextPatientCode(db);
          const completion = address !== 'Not provided' && emergency_contact_name ? 90 : (address !== 'Not provided' ? 80 : 60);
          const pInfo = db.run(
            `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, address, emergency_contact_name, emergency_contact_phone, otp_verified, profile_completion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uInfo.lastInsertRowid, patientCode, dob || '1990-01-01', gender || 'Prefer not to say', address || 'Not provided', emergency_contact_name || null, emergency_contact_phone || null, otp_verified ? 1 : 0, completion]
          );
          db.run(
            `INSERT INTO patient_consents (patient_id, consent_type, consent_text, consent_version, accepted, ip_address)
             VALUES (?, 'Portal Registration & Care Terms', ?, ?, 1, ?)`,
            [pInfo.lastInsertRowid, String(consent_text), String(consent_version), req.ip]
          );
        }
        logAudit(db, {
          actorUserId: uInfo.lastInsertRowid,
          actorRole: safeRoleCode,
          action: 'auth.register',
          entityType: 'user',
          entityId: uInfo.lastInsertRowid,
          details: JSON.stringify({ role: safeRoleCode, patientCode, consent_version: safeRoleCode === 'patient' ? consent_version : undefined }),
          ip: req.ip
        });
        return uInfo.lastInsertRowid;
      })();

      createNotification(db, broker, {
        roles: safeRoleCode === 'candidate' ? ['admin', 'hr'] : ['admin', 'receptionist'],
        title: safeRoleCode === 'candidate' ? 'New Candidate Registered' : 'New Patient Registered',
        message: `${full_name} (${userCode}) joined MediCore HMS.`,
        eventType: 'member:registered'
      });

      const { accessToken, refreshToken, expiresAt } = issueSessionTokens(created, safeRoleCode, jwtSecret, true);
      setAuthCookie(req, res, accessToken, true, refreshToken);
      const hydratedUser = hydrateAuthenticatedUser(db, created);
      return res.status(201).json({
        token: accessToken,
        accessToken,
        refreshToken,
        expiresAt,
        message: 'Registration successful.',
        user: hydratedUser
      });
    })
  );

  router.post('/forgot-password', limiter, [body('email').isEmail().withMessage('Valid email is required.')], validateRequest, asyncHandler(async (req, res) => {
    const genericMsg = 'If an account matches that email, password reset instructions have been sent.';
    const user = db.get('SELECT id, email FROM users WHERE lower(email) = lower(?)', [req.body.email]);
    if (!user) return res.json({ message: genericMsg });
    const resetCode = String(crypto.randomInt(100000, 999999));
    db.run('UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?', [bcrypt.hashSync(resetCode, 8), new Date(Date.now() + 15 * 60 * 1000).toISOString(), user.id]);
    logAudit(db, { actorUserId: user.id, action: 'auth.forgot_password', entityType: 'user', entityId: user.id });
    const payload = { message: genericMsg };
    if (process.env.NODE_ENV !== 'production') {
      payload.demoResetCode = resetCode;
    }
    return res.json(payload);
  }));

  router.post('/reset-password', limiter, [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('code').trim().notEmpty().withMessage('Reset code is required.'),
    body('new_password').custom(isStrongPassword).withMessage('Password must be at least 8 characters and include at least one number.')
  ], validateRequest, asyncHandler(async (req, res) => {
    const { email, code, new_password } = req.body;
    const user = db.get('SELECT id, reset_token_hash, reset_expires_at FROM users WHERE lower(email) = lower(?)', [email]);
    if (!user || !user.reset_token_hash || !user.reset_expires_at || new Date(user.reset_expires_at) < new Date()) throw new AppError(400, 'Invalid or expired reset code.');
    if (!bcrypt.compareSync(code, user.reset_token_hash)) throw new AppError(400, 'Reset code does not match.');
    db.run('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL, failed_attempts = 0, locked_until = NULL WHERE id = ?', [bcrypt.hashSync(new_password, 10), user.id]);
    logAudit(db, { actorUserId: user.id, action: 'auth.password_reset', entityType: 'user', entityId: user.id });
    return res.json({ message: 'Password updated successfully. You may now sign in.' });
  }));

  router.post('/refresh', asyncHandler(async (req, res) => {
    let rawToken = req.body?.refreshToken || null;
    if (!rawToken && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      rawToken = req.headers.authorization.slice(7).trim();
    }
    if (!rawToken && req.cookies) {
      rawToken = req.cookies[REFRESH_COOKIE_NAME] || req.cookies[COOKIE_NAME] || null;
    }
    if (!rawToken || rawToken === 'null' || rawToken === 'undefined') {
      return res.status(401).json({ error: 'Refresh token missing. Please log in again.' });
    }
    let decoded;
    try {
      decoded = jwt.verify(rawToken, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Refresh token expired or invalid. Please log in again.' });
    }
    const user = hydrateAuthenticatedUser(db, decoded.sub);
    if (!user || !user.is_active || user.account_status !== 'Active' || user.role === 'pending_staff') {
      return res.status(401).json({ error: 'Account is inactive, suspended, or awaiting verification.' });
    }
    const { accessToken, refreshToken, expiresAt } = issueSessionTokens(user.id, user.role, jwtSecret, true);
    setAuthCookie(req, res, accessToken, true, refreshToken);
    return res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      expiresAt,
      user
    });
  }));

  router.get('/my-signup-request', authenticate, asyncHandler(async (req, res) => {
    const request = db.get(
      `SELECT sr.*, b.name as branch_name, d.name as department_name, r.name as requested_role_label
       FROM staff_signup_requests sr
       LEFT JOIN branches b ON b.id = sr.branch_id
       LEFT JOIN departments d ON d.id = sr.department_id
       LEFT JOIN roles r ON r.code = sr.requested_role
       WHERE sr.user_id = ? ORDER BY sr.id DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ request: request || null });
  }));

  router.post('/withdraw-signup', authenticate, asyncHandler(async (req, res) => {
    const request = db.get('SELECT id FROM staff_signup_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (!request) throw new AppError(404, 'No pending signup request found.');
    db.run("UPDATE staff_signup_requests SET status = 'Withdrawn', updated_at = datetime('now') WHERE id = ?", [request.id]);
    db.run("UPDATE users SET is_active = 0, account_status = 'Withdrawn', updated_at = datetime('now') WHERE id = ?", [req.user.id]);
    logAudit(db, { actorUserId: req.user.id, actorRole: 'pending_staff', action: 'auth.staff_signup_withdrawn', entityType: 'user', entityId: req.user.id });
    res.json({ message: 'Registration request successfully withdrawn.' });
  }));

  router.post('/logout', (req, res) => { clearAuthCookie(req, res); res.json({ message: 'Logged out successfully.' }); });
  router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
  return router;
}
