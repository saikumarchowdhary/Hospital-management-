import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import fs from 'node:fs';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { canAccessClinicalRecord, requireRole } from '../middleware/roles.js';
import { resolveSafeUploadPath } from '../middleware/uploads.js';
import { isStrongPassword, validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { getAdminDashboardStats } from '../services/reports.js';
import { hydratePrescriptionRow } from './clinical_extras.js';
import { registerAdminMembersRoutes } from './admin_members.js';
import { registerAdminSignupsRoutes } from './admin_signups.js';
import { registerHospitalIdsRoutes } from './hospital_ids.js';

export function createAdminRouter(db, authenticate, uploadDir, broker = null, upload = null) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/attachments/:id', asyncHandler(async (req, res) => {
    const att = db.get('SELECT * FROM attachments WHERE id = ?', [Number(req.params.id)]);
    if (!att) throw new AppError(404, 'Document not found.');

    const role = req.user.role;
    const isAdmin = role === 'admin';
    const isOwner = att.owner_user_id === req.user.id;
    let allowed = isAdmin || isOwner;

    if (!allowed) {
      if (['recruitment', 'candidate_documents'].includes(att.module)) {
        allowed = role === 'hr';
      } else if (att.module === 'offers') {
        if (role === 'hr') allowed = true;
        else {
          const ownOffer = db.get('SELECT id FROM offers WHERE letter_attachment_id = ? AND candidate_user_id = ?', [att.id, req.user.id]);
          allowed = Boolean(ownOffer);
        }
      } else if (att.module === 'employee_documents') {
        if (role === 'hr') allowed = true;
        else if (req.user.employee_id) {
          const ownEmpDoc = db.get('SELECT id FROM employee_documents WHERE attachment_id = ? AND employee_id = ?', [att.id, req.user.employee_id]);
          allowed = Boolean(ownEmpDoc);
        }
      } else if (['staff_signup', 'doctor_signup'].includes(att.module)) {
        allowed = false;
      } else if (['publisher', 'campaigns'].includes(att.module)) {
        if (['publisher', 'approver'].includes(role)) {
          allowed = true;
        } else {
          const pubAnn = db.get(`SELECT id FROM announcements WHERE attachment_id = ? AND status = 'Published' AND date(expiry_date) >= date('now')`, [att.id]);
          const pubCamp = db.get(`SELECT id FROM campaigns WHERE banner_attachment_id = ? AND status = 'Published' AND date(end_date) >= date('now')`, [att.id]);
          allowed = Boolean(pubAnn || pubCamp);
        }
      } else if (['laboratory', 'radiology', 'patient_documents'].includes(att.module)) {
        const lab = db.get('SELECT lo.patient_id, lo.status FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.order_id WHERE lr.attachment_id = ?', [att.id]);
        const rad = db.get('SELECT ro.patient_id, ro.status FROM radiology_reports rr JOIN radiology_orders ro ON ro.id = rr.order_id WHERE rr.attachment_id = ?', [att.id]);
        const doc = db.get('SELECT patient_id FROM documents WHERE attachment_id = ?', [att.id]);
        const targetPid = lab?.patient_id || rad?.patient_id || doc?.patient_id;

        if (role === 'lab_staff' && att.module === 'laboratory') allowed = true;
        else if (role === 'radiologist' && att.module === 'radiology') allowed = true;
        else if (role === 'patient') {
          allowed =
            (lab && lab.patient_id === req.user.patient_id && lab.status === 'Released') ||
            (rad && rad.patient_id === req.user.patient_id && rad.status === 'Released') ||
            (doc && doc.patient_id === req.user.patient_id);
        } else if (targetPid) {
          allowed = canAccessClinicalRecord(db, req.user, targetPid);
        }
      }
    }

    if (!allowed) throw new AppError(403, 'Not authorized to access this document.');

    const safePath = resolveSafeUploadPath(uploadDir, att.stored_name);
    if (!fs.existsSync(safePath)) throw new AppError(404, 'File missing on storage.');
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${att.original_name.replace(/"/g, '')}"`);
    res.sendFile(safePath);
  }));

  router.use(requireRole('admin'));
  registerAdminMembersRoutes(router, db, broker, upload);
  registerAdminSignupsRoutes(router, db, broker);
  registerHospitalIdsRoutes(router, db, broker);

  router.get('/overview', asyncHandler(async (_req, res) => {
    const users = db.all(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.is_active, u.account_status, u.last_login_at, u.created_at,
              r.id as role_id, r.code as role, r.name as role_name, r.is_staff,
              u.department_id, u.branch_id, d.name as department_name, b.name as branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.id ASC`
    );
    const roles = db.all('SELECT * FROM roles ORDER BY id');
    const permissions = db.all('SELECT * FROM permissions ORDER BY module, code');
    const rolePermissions = db.all('SELECT * FROM role_permissions');
    const departments = db.all(
      `SELECT d.*, b.name as branch_name, hu.full_name as head_name, hu.user_code as head_user_code,
              (SELECT COUNT(*) FROM employee_profiles ep WHERE ep.department_id = d.id AND ep.employment_status = 'Active') as employee_count,
              (SELECT COUNT(*) FROM doctor_profiles dp WHERE dp.department_id = d.id AND dp.is_active = 1) as doctor_count
       FROM departments d
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users hu ON hu.id = d.head_user_id
       ORDER BY d.name`
    );
    const specialties = db.all('SELECT s.*, d.name as department_name FROM specialties s LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.name');
    const branches = db.all('SELECT * FROM branches ORDER BY id');
    const settings = db.all('SELECT * FROM settings ORDER BY key');
    const auditLogs = db.all(
      `SELECT al.*, u.full_name as actor_name, u.user_code as actor_code
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
       ORDER BY al.id DESC LIMIT 200`
    );
    const stats = getAdminDashboardStats(db);
    const categories = db.all('SELECT category_id, name, description FROM category ORDER BY category_id ASC');
    res.json({ users, roles, permissions, rolePermissions, departments, specialties, branches, settings, auditLogs, stats, categories });
  }));

  router.get('/audit-logs', asyncHandler(async (req, res) => {
    const { action = '', actor_role = '', entity_type = '', q = '', start_date = '', end_date = '', limit = '200' } = req.query;
    const where = ['1=1'];
    const params = [];
    if (action) { where.push('al.action LIKE ?'); params.push(`%${action}%`); }
    if (actor_role) { where.push('al.actor_role = ?'); params.push(actor_role); }
    if (entity_type) { where.push('al.entity_type = ?'); params.push(entity_type); }
    if (start_date) { where.push('date(al.created_at) >= date(?)'); params.push(start_date); }
    if (end_date) { where.push('date(al.created_at) <= date(?)'); params.push(end_date); }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      where.push('(al.action LIKE ? OR al.entity_type LIKE ? OR COALESCE(u.full_name,\'\') LIKE ? OR COALESCE(al.details,\'\') LIKE ?)');
      params.push(like, like, like, like);
    }
    const maxLimit = Math.min(500, Math.max(10, Number(limit) || 200));
    const logs = db.all(
      `SELECT al.*, u.full_name as actor_name, u.email as actor_email, u.user_code as actor_code
       FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY al.id DESC LIMIT ?`,
      [...params, maxLimit]
    );
    res.json({ logs });
  }));

  router.get('/login-activity', asyncHandler(async (_req, res) => {
    const events = db.all(
      `SELECT al.id, al.actor_user_id, al.actor_role, al.action, al.ip_address, al.created_at,
              u.full_name, u.email, u.user_code, u.last_login_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE al.action IN ('auth.login_success', 'auth.login_failed', 'auth.password_reset', 'auth.register', 'auth.setup_admin')
       ORDER BY al.id DESC LIMIT 120`
    );
    res.json({ events });
  }));

  router.get('/finance-payroll', asyncHandler(async (_req, res) => {
    const totals = {
      totalInvoiced: Number((db.get('SELECT COALESCE(SUM(total_amount),0) as s FROM invoices').s || 0).toFixed(2)),
      totalCollected: Number((db.get("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE LOWER(status) = 'paid'").s || 0).toFixed(2)),
      totalOutstanding: Number((db.get("SELECT COALESCE(SUM(balance_due),0) as s FROM invoices WHERE status IN ('Pending','Processing')").s || 0).toFixed(2)),
      totalExpenses: Number((db.get('SELECT COALESCE(SUM(amount),0) as s FROM expenses').s || 0).toFixed(2)),
      totalRefunds: Number((db.get('SELECT COALESCE(SUM(amount),0) as s FROM refunds').s || 0).toFixed(2)),
      totalPayrollGross: Number((db.get('SELECT COALESCE(SUM(gross_salary),0) as s FROM payroll').s || 0).toFixed(2)),
      totalPayrollNet: Number((db.get('SELECT COALESCE(SUM(net_salary),0) as s FROM payroll').s || 0).toFixed(2))
    };
    const invoices = db.all(
      `SELECT i.*, pu.full_name as patient_name, p.patient_code
       FROM invoices i JOIN patient_profiles p ON p.id = i.patient_id JOIN users pu ON pu.id = p.user_id
       ORDER BY i.id DESC LIMIT 40`
    );
    const payments = db.all(
      `SELECT p.*, i.invoice_number, pu.full_name as patient_name
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       JOIN patient_profiles pat ON pat.id = p.patient_id JOIN users pu ON pu.id = pat.user_id
       ORDER BY p.id DESC LIMIT 40`
    );
    const payroll = db.all(
      `SELECT pr.*, u.full_name as employee_name, ep.employee_code, ep.designation, d.name as department_name, ps.payslip_ref
       FROM payroll pr
       JOIN employee_profiles ep ON ep.id = pr.employee_id
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN departments d ON d.id = ep.department_id
       LEFT JOIN payslips ps ON ps.payroll_id = pr.id
       ORDER BY pr.id DESC LIMIT 60`
    );
    const expenses = db.all(
      `SELECT e.*, d.name as department_name FROM expenses e LEFT JOIN departments d ON d.id = e.department_id ORDER BY e.id DESC LIMIT 40`
    );
    const payrollSummaryByPeriod = db.all(
      `SELECT pay_period, COUNT(*) as staff_count, ROUND(SUM(gross_salary), 2) as total_gross,
              ROUND(SUM(deductions), 2) as total_deductions, ROUND(SUM(net_salary), 2) as total_net
       FROM payroll GROUP BY pay_period ORDER BY pay_period DESC LIMIT 12`
    );
    res.json({ totals, invoices, payments, payroll, expenses, payrollSummaryByPeriod });
  }));

  router.get('/documents', asyncHandler(async (_req, res) => {
    const documents = db.all(
      `SELECT a.id, a.original_name, a.mime_type, a.size_bytes, a.module, a.created_at,
              u.full_name as owner_name, u.user_code as owner_code, r.name as owner_role
       FROM attachments a
       LEFT JOIN users u ON u.id = a.owner_user_id
       LEFT JOIN roles r ON r.id = u.role_id
       ORDER BY a.id DESC LIMIT 150`
    );
    const employeeDocs = db.all(
      `SELECT ed.*, u.full_name as employee_name, ep.employee_code, a.original_name, a.mime_type
       FROM employee_documents ed
       JOIN employee_profiles ep ON ep.id = ed.employee_id
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN attachments a ON a.id = ed.attachment_id
       ORDER BY ed.id DESC LIMIT 80`
    );
    res.json({ documents, employeeDocs });
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
        designation = 'Staff', qualification = 'MD', shift = 'Day', employment_type = 'Full-Time', employee_id = '',
        specialty_id = null, experience_years = 5, consultation_fee = 100,
        registration_number = '', medical_council = '',
        dob = '1990-01-01', gender = 'Other', address = 'Metro City'
      } = req.body;
      const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
      if (dup) throw new AppError(409, 'Email already registered.');
      const role = db.get('SELECT * FROM roles WHERE id = ?', [Number(role_id)]);
      if (!role) throw new AppError(404, 'Role not found.');

      const safeEmpCode = employee_id ? String(employee_id).trim() : '';
      const safeRegNo = registration_number ? String(registration_number).trim() : '';
      if (safeEmpCode && db.get('SELECT id FROM employee_profiles WHERE upper(employee_code) = upper(?)', [safeEmpCode])) {
        throw new AppError(409, 'Employee ID already exists.');
      }
      if (safeRegNo && db.get('SELECT id FROM doctor_profiles WHERE upper(registration_number) = upper(?)', [safeRegNo])) {
        throw new AppError(409, 'Medical registration number already exists.');
      }

      const hash = bcrypt.hashSync(password, 10);
      const uCode = `${role.code.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
      const uid = db.transaction(() => {
        const deptIdNum = department_id ? Number(department_id) : null;
        const uInfo = db.run(
          'INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'Active\')',
          [uCode, email, hash, full_name, phone, role.id, Number(branch_id), deptIdNum]
        );
        if (role.code === 'patient') {
          const rows = db.all("SELECT patient_code FROM patient_profiles WHERE patient_code LIKE 'PT-%'");
          let maxNum = 0;
          for (const r of rows) {
            const m = /^PT-(\d+)$/i.exec(String(r.patient_code || '').trim());
            if (m && Number(m[1]) > maxNum) maxNum = Number(m[1]);
          }
          const patCode = `PT-${String(maxNum + 1).padStart(6, '0')}`;
          db.run(
            `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, address, otp_verified, profile_completion)
             VALUES (?, ?, ?, ?, ?, 1, 75)`,
            [uInfo.lastInsertRowid, patCode, dob, gender, address]
          );
        } else if (role.is_staff) {
          db.run(
            'INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, shift, employment_type, joining_date, base_salary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, date(\'now\'), ?)',
            [uInfo.lastInsertRowid, safeEmpCode || `EMP-${uCode}`, deptIdNum, Number(branch_id), role.code === 'doctor' ? 'CONSULTANT DOCTOR' : designation, qualification || null, shift || 'Day', employment_type || 'Full-Time', role.code === 'doctor' ? 14000 : 5000]
          );
        }
        if (role.code === 'doctor') {
          const fallbackSpec = db.get('SELECT id, department_id FROM specialties ORDER BY id LIMIT 1');
          const resolvedSpecId = specialty_id ? Number(specialty_id) : fallbackSpec.id;
          const resolvedDeptId = deptIdNum || fallbackSpec.department_id || 1;
          const dpInfo = db.run(
            `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, availability_status, registration_number, medical_council, schedule_configured)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, 1)`,
            [uInfo.lastInsertRowid, `DR-${uCode.split('-')[1]}`, resolvedSpecId, resolvedDeptId, Number(branch_id), qualification || 'MD', Number(experience_years || 5), Number(consultation_fee || 100), `${qualification || 'MD'} specialist at MediCore HMS.`, safeRegNo || `REG-${uCode}`, medical_council || null]
          );
          for (let dow = 1; dow <= 6; dow++) {
            db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, 30)', [dpInfo.lastInsertRowid, dow, '09:00', '17:00']);
          }
        }
        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: 'admin',
          action: 'admin.user_created',
          entityType: 'user',
          entityId: uInfo.lastInsertRowid,
          details: { after: { email, full_name, role: role.code, department_id: deptIdNum } }
        });
        return uInfo.lastInsertRowid;
      })();
      if (broker) broker.publish('member:registered', { userId: uid, title: 'Member Created', message: `${full_name} (${role.name}) added.` }, { roles: ['admin', 'hr'] });
      res.status(201).json({ user: db.get('SELECT id, user_code, email, full_name, is_active, account_status FROM users WHERE id = ?', [uid]) });
    })
  );

  router.patch('/users/:id/status', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const { is_active, reset_password } = req.body;
    const beforeUser = db.get('SELECT is_active, account_status FROM users WHERE id = ?', [uid]);
    if (!beforeUser) throw new AppError(404, 'User not found.');
    if (is_active !== undefined) {
      db.run('UPDATE users SET is_active = ?, account_status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [is_active ? 1 : 0, is_active ? 'Active' : 'Suspended', uid]);
      db.run('UPDATE doctor_profiles SET is_active = ? WHERE user_id = ?', [is_active ? 1 : 0, uid]);
    }
    if (reset_password) {
      if (!isStrongPassword(reset_password)) throw new AppError(400, 'Password must be 8+ chars with a number.');
      db.run('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [bcrypt.hashSync(reset_password, 10), uid]);
    }
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.user_updated',
      entityType: 'user',
      entityId: uid,
      details: { before: beforeUser, after: { is_active: is_active !== undefined ? Boolean(is_active) : beforeUser.is_active, passwordReset: Boolean(reset_password) } }
    });
    if (broker) broker.publish('member:updated', { userId: uid }, { roles: ['admin'] });
    res.json({ ok: true });
  }));

  // Roles & Permissions Management
  router.post('/roles', asyncHandler(async (req, res) => {
    const { code, name, description = '', is_staff = true, permission_ids = [] } = req.body;
    if (!code || !name) throw new AppError(400, 'Role code and name are required.');
    const normalizedCode = String(code).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const dup = db.get('SELECT id FROM roles WHERE code = ?', [normalizedCode]);
    if (dup) throw new AppError(409, 'Role code already exists.');

    const role = db.transaction(() => {
      const info = db.run('INSERT INTO roles (code, name, description, is_staff) VALUES (?, ?, ?, ?)', [normalizedCode, name.trim(), description, is_staff ? 1 : 0]);
      for (const pid of permission_ids) {
        db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [info.lastInsertRowid, Number(pid)]);
      }
      logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.role_created', entityType: 'role', entityId: info.lastInsertRowid, details: { after: { code: normalizedCode, name } } });
      return db.get('SELECT * FROM roles WHERE id = ?', [info.lastInsertRowid]);
    })();
    res.status(201).json({ role });
  }));

  router.patch('/roles/:id', asyncHandler(async (req, res) => {
    const roleId = Number(req.params.id);
    const existing = db.get('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!existing) throw new AppError(404, 'Role not found.');
    const { name, description, is_staff } = req.body;
    db.run(
      `UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), is_staff = COALESCE(?, is_staff), updated_at = datetime('now') WHERE id = ?`,
      [name ? name.trim() : null, description ?? null, is_staff !== undefined ? (is_staff ? 1 : 0) : null, roleId]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.role_updated', entityType: 'role', entityId: roleId, details: { before: existing, after: { name, description, is_staff } } });
    res.json({ role: db.get('SELECT * FROM roles WHERE id = ?', [roleId]) });
  }));

  router.put('/roles/:id/permissions', asyncHandler(async (req, res) => {
    const roleId = Number(req.params.id);
    const { permission_ids = [] } = req.body;
    const beforePerms = db.all('SELECT permission_id FROM role_permissions WHERE role_id = ?', [roleId]).map((r) => r.permission_id);
    db.transaction(() => {
      db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      for (const pid of permission_ids) db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, Number(pid)]);
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: 'admin',
        action: 'admin.permissions_updated',
        entityType: 'role',
        entityId: roleId,
        details: { before: { permission_ids: beforePerms }, after: { permission_ids: permission_ids.map(Number) } }
      });
    })();
    res.json({ ok: true });
  }));

  // Department Management
  router.get('/departments', asyncHandler(async (_req, res) => {
    const departments = db.all(
      `SELECT d.*, b.name as branch_name, hu.full_name as head_name, hu.user_code as head_user_code,
              (SELECT COUNT(*) FROM employee_profiles ep WHERE ep.department_id = d.id) as employee_count,
              (SELECT COUNT(*) FROM doctor_profiles dp WHERE dp.department_id = d.id) as doctor_count
       FROM departments d
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users hu ON hu.id = d.head_user_id
       ORDER BY d.name`
    );
    res.json({ departments });
  }));

  router.post('/departments', asyncHandler(async (req, res) => {
    const { code, name, branch_id = 1, category = 'clinical', head_user_id = null, description = '' } = req.body;
    if (!code || !name) throw new AppError(400, 'Department code and name are required.');
    const info = db.run(
      'INSERT INTO departments (code, name, branch_id, category, head_user_id, description) VALUES (?, ?, ?, ?, ?, ?)',
      [code.trim().toUpperCase(), name.trim(), Number(branch_id), category, head_user_id ? Number(head_user_id) : null, description]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.department_created', entityType: 'department', entityId: info.lastInsertRowid, details: { after: { code, name, category, head_user_id } } });
    res.status(201).json({ department: db.get('SELECT * FROM departments WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/departments/:id', asyncHandler(async (req, res) => {
    const deptId = Number(req.params.id);
    const existing = db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!existing) throw new AppError(404, 'Department not found.');
    const { code, name, branch_id, category, head_user_id, description, is_active } = req.body;
    db.run(
      `UPDATE departments SET
         code = COALESCE(?, code),
         name = COALESCE(?, name),
         branch_id = COALESCE(?, branch_id),
         category = COALESCE(?, category),
         head_user_id = ?,
         description = COALESCE(?, description),
         is_active = COALESCE(?, is_active),
         updated_at = datetime('now')
       WHERE id = ?`,
      [
        code ? code.trim().toUpperCase() : null,
        name ? name.trim() : null,
        branch_id ? Number(branch_id) : null,
        category || null,
        head_user_id !== undefined ? (head_user_id ? Number(head_user_id) : null) : existing.head_user_id,
        description !== undefined ? description : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        deptId
      ]
    );
    const updated = db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.department_updated', entityType: 'department', entityId: deptId, details: { before: existing, after: updated } });
    res.json({ department: updated });
  }));

  router.get('/departments/:id/employees', asyncHandler(async (req, res) => {
    const deptId = Number(req.params.id);
    const employees = db.all(
      `SELECT u.id as user_id, u.user_code, u.full_name, u.email, u.phone, u.account_status, r.name as role_name, r.code as role,
              ep.employee_code, ep.designation, ep.employment_type, ep.employment_status
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE (u.department_id = ? OR ep.department_id = ?) AND r.is_staff = 1
       ORDER BY u.full_name`,
      [deptId, deptId]
    );
    res.json({ employees });
  }));

  // Branch Management
  router.get('/branches', asyncHandler(async (_req, res) => {
    res.json({ branches: db.all('SELECT * FROM branches ORDER BY id') });
  }));

  router.post('/branches', asyncHandler(async (req, res) => {
    const { code, name, address, phone, email = '', city = '' } = req.body;
    if (!code || !name || !address || !phone) throw new AppError(400, 'Code, name, address, and phone are required.');
    const info = db.run(
      'INSERT INTO branches (code, name, address, phone, email, city) VALUES (?, ?, ?, ?, ?, ?)',
      [code.trim().toUpperCase(), name.trim(), address.trim(), phone.trim(), email.trim(), city.trim()]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.branch_created', entityType: 'branch', entityId: info.lastInsertRowid });
    res.status(201).json({ branch: db.get('SELECT * FROM branches WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/branches/:id', asyncHandler(async (req, res) => {
    const branchId = Number(req.params.id);
    const existing = db.get('SELECT * FROM branches WHERE id = ?', [branchId]);
    if (!existing) throw new AppError(404, 'Branch not found.');
    const { name, address, phone, email, city, is_active } = req.body;
    db.run(
      `UPDATE branches SET name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone),
       email = COALESCE(?, email), city = COALESCE(?, city), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ?`,
      [name || null, address || null, phone || null, email ?? null, city ?? null, is_active !== undefined ? (is_active ? 1 : 0) : null, branchId]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.branch_updated', entityType: 'branch', entityId: branchId });
    res.json({ branch: db.get('SELECT * FROM branches WHERE id = ?', [branchId]) });
  }));

  router.put('/settings', asyncHandler(async (req, res) => {
    const { key, value } = req.body;
    if (!key) throw new AppError(400, 'Setting key is required.');
    const before = db.get('SELECT value FROM settings WHERE key = ?', [key]);
    db.run('INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime(\'now\')',
      [key, String(value), req.user.id]);
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.setting_updated', entityType: 'setting', entityId: key, details: { before: before?.value ?? null, after: String(value) } });
    res.json({ ok: true });
  }));

  router.put('/settings/bulk', asyncHandler(async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') throw new AppError(400, 'Settings map required.');
    db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        db.run(
          `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
          [key, String(value), req.user.id]
        );
      }
      logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.settings_bulk_updated', entityType: 'setting', entityId: 'bulk', details: { keys: Object.keys(settings) } });
    })();
    res.json({ settings: db.all('SELECT * FROM settings ORDER BY key') });
  }));

  // Admin Verification / Invitation Codes Management
  router.get('/verification-codes', asyncHandler(async (_req, res) => {
    const codes = db.all(
      `SELECT avc.id, avc.code_label, avc.code_label as label, avc.target_role, avc.department_id, avc.is_demo, avc.is_active,
              avc.expires_at, avc.used_count, avc.created_at, d.name as department_name, u.full_name as created_by_name
       FROM admin_verification_codes avc
       LEFT JOIN departments d ON d.id = avc.department_id
       LEFT JOIN users u ON u.id = avc.created_by
       ORDER BY avc.id DESC`
    );
    res.json({ codes });
  }));

  router.post('/verification-codes', asyncHandler(async (req, res) => {
    const rawLabel = req.body.code_label ?? req.body.label;
    const rawValue = req.body.code_value ?? req.body.code;
    const { target_role = 'department_admin', department_id = null, expires_at = null } = req.body;
    if (!rawLabel || !rawValue || String(rawValue).trim().length < 6) {
      throw new AppError(400, 'Code label and verification code (minimum 6 characters) are required.');
    }
    if (!['department_admin', 'admin'].includes(target_role)) {
      throw new AppError(400, 'Target role must be department_admin or admin.');
    }
    const hash = bcrypt.hashSync(String(rawValue).trim(), 10);
    const info = db.run(
      `INSERT INTO admin_verification_codes (code_label, code_hash, target_role, department_id, is_demo, is_active, expires_at, created_by)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?)`,
      [String(rawLabel).trim(), hash, targetRoleOrDefault(target_role), department_id ? Number(department_id) : null, expires_at || null, req.user.id]
    );
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.verification_code_created',
      entityType: 'admin_verification_code',
      entityId: info.lastInsertRowid,
      details: { code_label: String(rawLabel).trim(), target_role, department_id }
    });
    res.status(201).json({
      code: db.get('SELECT id, code_label, code_label as label, target_role, department_id, is_active, expires_at, used_count, created_at FROM admin_verification_codes WHERE id = ?', [info.lastInsertRowid])
    });
  }));

  router.delete('/verification-codes/:id', asyncHandler(async (req, res) => {
    const cid = Number(req.params.id);
    db.run('UPDATE admin_verification_codes SET is_active = 0 WHERE id = ?', [cid]);
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.verification_code_revoked', entityType: 'admin_verification_code', entityId: cid });
    res.json({ ok: true });
  }));

  // Category Management (category_id, name, description)
  router.get('/categories', asyncHandler(async (_req, res) => {
    const categories = db.all('SELECT category_id, name, description FROM category ORDER BY category_id ASC');
    res.json({ categories });
  }));

  router.post('/categories', asyncHandler(async (req, res) => {
    const rawName = req.body?.name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const description = req.body?.description === undefined || req.body?.description === null
      ? null
      : (String(req.body.description).trim() || null);

    if (!name) throw new AppError(400, 'Category name is required.');
    const existing = db.get('SELECT category_id FROM category WHERE LOWER(name) = LOWER(?)', [name]);
    if (existing) throw new AppError(409, 'A category with this name already exists.');

    const info = db.run('INSERT INTO category (name, description) VALUES (?, ?)', [name, description]);
    const category = db.get('SELECT category_id, name, description FROM category WHERE category_id = ?', [info.lastInsertRowid]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.category_created',
      entityType: 'category',
      entityId: info.lastInsertRowid,
      details: { name }
    });
    res.status(201).json({ category });
  }));

  router.patch('/categories/:id', asyncHandler(async (req, res) => {
    const categoryId = Number(req.params.id);
    const existing = db.get('SELECT category_id, name, description FROM category WHERE category_id = ?', [categoryId]);
    if (!existing) throw new AppError(404, 'Category not found.');

    const nextName = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    if (!nextName) throw new AppError(400, 'Category name cannot be empty.');

    const duplicate = db.get('SELECT category_id FROM category WHERE LOWER(name) = LOWER(?) AND category_id != ?', [nextName, categoryId]);
    if (duplicate) throw new AppError(409, 'A category with this name already exists.');

    const nextDescription = req.body?.description !== undefined
      ? (req.body.description === null ? null : (String(req.body.description).trim() || null))
      : existing.description;

    db.run('UPDATE category SET name = ?, description = ? WHERE category_id = ?', [nextName, nextDescription, categoryId]);
    const category = db.get('SELECT category_id, name, description FROM category WHERE category_id = ?', [categoryId]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.category_updated',
      entityType: 'category',
      entityId: categoryId,
      details: { name: nextName }
    });
    res.json({ category });
  }));

  router.delete('/categories/:id', asyncHandler(async (req, res) => {
    const categoryId = Number(req.params.id);
    const existing = db.get('SELECT category_id, name FROM category WHERE category_id = ?', [categoryId]);
    if (!existing) throw new AppError(404, 'Category not found.');
    db.run('DELETE FROM category WHERE category_id = ?', [categoryId]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.category_deleted',
      entityType: 'category',
      entityId: categoryId,
      details: { name: existing.name }
    });
    res.json({ ok: true });
  }));

  // Admin All Prescriptions (with date/status/search filters)
  router.get('/prescriptions', asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.status && req.query.status !== 'All') {
      where.push('LOWER(r.status) = LOWER(?)');
      params.push(String(req.query.status).trim());
    }
    if (req.query.from_date) {
      where.push('date(r.created_at) >= date(?)');
      params.push(String(req.query.from_date));
    }
    if (req.query.to_date) {
      where.push('date(r.created_at) <= date(?)');
      params.push(String(req.query.to_date));
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      where.push(`(r.prescription_ref LIKE ? OR pu.full_name LIKE ? OR du.full_name LIKE ? OR COALESCE(r.diagnosis,'') LIKE ? OR p.patient_code LIKE ?)`);
      params.push(like, like, like, like, like);
    }

    const rows = db.all(
      `SELECT r.*,
              pu.full_name as patient_name, pu.phone as patient_phone, pu.email as patient_email,
              p.patient_code, p.dob as patient_dob, p.gender as patient_gender, p.blood_group as patient_blood_group,
              du.full_name as doctor_name, doc.doctor_code, doc.registration_number, doc.qualification as doctor_qualification,
              COALESCE(sp.name, 'General Medicine') as specialization,
              d.name as department_name,
              b.name as branch_name, b.address as branch_address, b.phone as branch_phone
       FROM prescriptions r
       JOIN patient_profiles p ON p.id = r.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = r.doctor_id
       JOIN users du ON du.id = doc.user_id
       LEFT JOIN specialties sp ON sp.id = doc.specialty_id
       LEFT JOIN departments d ON d.id = doc.department_id
       LEFT JOIN branches b ON b.id = doc.branch_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.id DESC LIMIT 300`,
      params
    );
    res.json({ prescriptions: rows.map((row) => hydratePrescriptionRow(db, row)) });
  }));

  // Admin All Payments & Bills (with date/status/bill_type/search filters)
  router.get('/payments', asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    if (req.query.status && req.query.status !== 'All') {
      where.push('LOWER(p.status) = LOWER(?)');
      params.push(String(req.query.status).trim());
    }
    if (req.query.bill_type && req.query.bill_type !== 'All') {
      where.push('LOWER(p.bill_type) = LOWER(?)');
      params.push(String(req.query.bill_type).trim());
    }
    if (req.query.from_date) {
      where.push('date(p.created_at) >= date(?)');
      params.push(String(req.query.from_date));
    }
    if (req.query.to_date) {
      where.push('date(p.created_at) <= date(?)');
      params.push(String(req.query.to_date));
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      where.push(`(p.payment_ref LIKE ? OR p.receipt_number LIKE ? OR COALESCE(p.transaction_id,'') LIKE ? OR COALESCE(p.description,'') LIKE ? OR pu.full_name LIKE ? OR pat.patient_code LIKE ?)`);
      params.push(like, like, like, like, like, like);
    }

    const payments = db.all(
      `SELECT p.*,
              i.invoice_number, i.description as invoice_description, i.total_amount as invoice_total,
              pu.full_name as patient_name, pu.email as patient_email, pu.phone as patient_phone,
              pat.patient_code,
              cu.full_name as created_by_name, vu.full_name as verified_by_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN patient_profiles pat ON pat.id = p.patient_id
       JOIN users pu ON pu.id = pat.user_id
       LEFT JOIN users cu ON cu.id = COALESCE(p.created_by, p.recorded_by)
       LEFT JOIN users vu ON vu.id = p.verified_by
       WHERE ${where.join(' AND ')}
       ORDER BY p.id DESC LIMIT 300`,
      params
    ).map((r) => ({
      ...r,
      status: String(r.status || 'pending').toLowerCase(),
      payment_method: r.payment_method || r.method || 'UPI QR',
      description: r.description || r.invoice_description || 'Hospital Bill',
      items: db.all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC', [r.invoice_id])
    }));

    const summary = {
      totalCount: payments.length,
      paidTotal: Number(payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2)),
      pendingTotal: Number(payments.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2)),
      verificationPendingTotal: Number(payments.filter((p) => p.status === 'verification_pending').reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2)),
      failedTotal: Number(payments.filter((p) => p.status === 'failed').reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2))
    };

    res.json({ payments, summary });
  }));

  return router;
}

function targetRoleOrDefault(role) {
  return role === 'admin' ? 'admin' : 'department_admin';
}
