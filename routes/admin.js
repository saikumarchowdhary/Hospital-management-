import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import fs from 'node:fs';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';
import { resolveSafeUploadPath } from '../middleware/uploads.js';
import { isStrongPassword, validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { registerAdminMembersRoutes } from './admin_members.js';
import { registerAdminSignupsRoutes } from './admin_signups.js';

export function createAdminRouter(db, authenticate, uploadDir, broker = null) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/attachments/:id', asyncHandler(async (req, res) => {
    const att = db.get('SELECT * FROM attachments WHERE id = ?', [Number(req.params.id)]);
    if (!att) throw new AppError(404, 'Document not found.');
    if (req.user.role === 'patient' && att.owner_user_id !== req.user.id) {
      const lab = db.get('SELECT lo.patient_id FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.order_id WHERE lr.attachment_id = ? AND lo.status = \'Released\'', [att.id]);
      const rad = db.get('SELECT ro.patient_id FROM radiology_reports rr JOIN radiology_orders ro ON ro.id = rr.order_id WHERE rr.attachment_id = ? AND ro.status = \'Released\'', [att.id]);
      const doc = db.get('SELECT patient_id FROM documents WHERE attachment_id = ? AND patient_id = ?', [att.id, req.user.patient_id]);
      const owns = (lab && lab.patient_id === req.user.patient_id) || (rad && rad.patient_id === req.user.patient_id) || Boolean(doc);
      if (!owns) throw new AppError(403, 'Not authorized to access this document.');
    }
    const safePath = resolveSafeUploadPath(uploadDir, att.stored_name);
    if (!fs.existsSync(safePath)) throw new AppError(404, 'File missing on storage.');
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${att.original_name.replace(/"/g, '')}"`);
    res.sendFile(safePath);
  }));

  router.use(requireRole('admin'));
  registerAdminMembersRoutes(router, db, broker);
  registerAdminSignupsRoutes(router, db, broker);

  router.get('/overview', asyncHandler(async (_req, res) => {
    const users = db.all(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.is_active, u.account_status, u.last_login_at, u.created_at,
              r.id as role_id, r.code as role, r.name as role_name, r.is_staff,
              d.name as department_name, b.name as branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.id ASC`
    );
    const roles = db.all('SELECT * FROM roles ORDER BY id');
    const permissions = db.all('SELECT * FROM permissions ORDER BY module, code');
    const rolePermissions = db.all('SELECT * FROM role_permissions');
    const departments = db.all('SELECT d.*, b.name as branch_name FROM departments d LEFT JOIN branches b ON b.id = d.branch_id ORDER BY d.name');
    const specialties = db.all('SELECT s.*, d.name as department_name FROM specialties s LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.name');
    const branches = db.all('SELECT * FROM branches ORDER BY id');
    const settings = db.all('SELECT * FROM settings ORDER BY key');
    const auditLogs = db.all(
      `SELECT al.*, u.full_name as actor_name FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id ORDER BY al.id DESC LIMIT 100`
    );
    res.json({ users, roles, permissions, rolePermissions, departments, specialties, branches, settings, auditLogs });
  }));

  router.post(
    '/users',
    [
      body('full_name').trim().notEmpty(),
      body('email').isEmail().normalizeEmail(),
      body('role_id').isInt(),
      body('password').custom(isStrongPassword).withMessage('Password must be 8+ chars with a number.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const {
        full_name, email, phone = '', role_id, department_id = null, branch_id = 1, password,
        designation = 'Staff', qualification = 'MD', shift = 'Day',
        specialty_id = null, experience_years = 5, consultation_fee = 100,
        dob = '1990-01-01', gender = 'Other', address = 'Metro City'
      } = req.body;
      const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
      if (dup) throw new AppError(409, 'Email already registered.');
      const role = db.get('SELECT * FROM roles WHERE id = ?', [Number(role_id)]);
      if (!role) throw new AppError(404, 'Role not found.');

      const hash = bcrypt.hashSync(password, 10);
      const uCode = `${role.code.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
      const uid = db.transaction(() => {
        const deptIdNum = department_id ? Number(department_id) : null;
        const uInfo = db.run(
          'INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'Active\')',
          [uCode, email, hash, full_name, phone, role.id, Number(branch_id), deptIdNum]
        );
        if (role.code === 'patient') {
          db.run(
            `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, address, otp_verified, profile_completion)
             VALUES (?, ?, ?, ?, ?, 1, 75)`,
            [uInfo.lastInsertRowid, `MRN-${uCode.split('-')[1]}`, dob, gender, address]
          );
        } else if (role.is_staff) {
          db.run(
            'INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, shift, joining_date, base_salary) VALUES (?, ?, ?, ?, ?, ?, ?, date(\'now\'), ?)',
            [uInfo.lastInsertRowid, `EMP-${uCode}`, deptIdNum, Number(branch_id), role.code === 'doctor' ? 'CONSULTANT DOCTOR' : designation, qualification || null, shift || 'Day', role.code === 'doctor' ? 14000 : 5000]
          );
        }
        if (role.code === 'doctor') {
          const fallbackSpec = db.get('SELECT id, department_id FROM specialties ORDER BY id LIMIT 1');
          const resolvedSpecId = specialty_id ? Number(specialty_id) : fallbackSpec.id;
          const resolvedDeptId = deptIdNum || fallbackSpec.department_id || 1;
          const dpInfo = db.run(
            `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, availability_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
            [uInfo.lastInsertRowid, `DR-${uCode.split('-')[1]}`, resolvedSpecId, resolvedDeptId, Number(branch_id), qualification || 'MD', Number(experience_years || 5), Number(consultation_fee || 100), `${qualification || 'MD'} specialist at MediCore HMS.`]
          );
          for (let dow = 1; dow <= 6; dow++) {
            db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, 30)', [dpInfo.lastInsertRowid, dow, '09:00', '17:00']);
          }
        }
        logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.user_created', entityType: 'user', entityId: uInfo.lastInsertRowid });
        return uInfo.lastInsertRowid;
      })();
      if (broker) broker.publish('member:registered', { userId: uid, title: 'Member Created', message: `${full_name} (${role.name}) added.` }, { roles: ['admin', 'hr'] });
      res.status(201).json({ user: db.get('SELECT id, user_code, email, full_name, is_active, account_status FROM users WHERE id = ?', [uid]) });
    })
  );

  router.patch('/users/:id/status', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const { is_active, reset_password } = req.body;
    if (is_active !== undefined) {
      db.run('UPDATE users SET is_active = ?, account_status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [is_active ? 1 : 0, is_active ? 'Active' : 'Suspended', uid]);
    }
    if (reset_password) {
      if (!isStrongPassword(reset_password)) throw new AppError(400, 'Password must be 8+ chars with a number.');
      db.run('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [bcrypt.hashSync(reset_password, 10), uid]);
    }
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.user_updated', entityType: 'user', entityId: uid });
    if (broker) broker.publish('member:updated', { userId: uid }, { roles: ['admin'] });
    res.json({ ok: true });
  }));

  router.put('/roles/:id/permissions', asyncHandler(async (req, res) => {
    const roleId = Number(req.params.id);
    const { permission_ids = [] } = req.body;
    db.transaction(() => {
      db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      for (const pid of permission_ids) db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, Number(pid)]);
      logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.permissions_updated', entityType: 'role', entityId: roleId });
    })();
    res.json({ ok: true });
  }));

  router.post('/departments', asyncHandler(async (req, res) => {
    const { code, name, branch_id = 1, category = 'clinical' } = req.body;
    const info = db.run('INSERT INTO departments (code, name, branch_id, category) VALUES (?, ?, ?, ?)', [code.toUpperCase(), name, Number(branch_id), category]);
    res.status(201).json({ department: db.get('SELECT * FROM departments WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.put('/settings', asyncHandler(async (req, res) => {
    const { key, value } = req.body;
    db.run('INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime(\'now\')',
      [key, String(value), req.user.id]);
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.setting_updated', entityType: 'setting', entityId: key });
    res.json({ ok: true });
  }));

  return router;
}
