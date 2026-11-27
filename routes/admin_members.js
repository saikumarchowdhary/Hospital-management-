import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { getPhoneLookupCandidates, normalizePhone } from '../services/phone.js';
import { approveSignupRequestTx, generateNextPatientCode, rejectSignupRequestTx } from './registration_helpers.js';

function parseCsvRows(csvText) {
  const lines = String(csvText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line, idx) => {
    const vals = splitLine(line);
    const rowObj = { _rowNumber: idx + 2 };
    headers.forEach((h, i) => { rowObj[h] = vals[i] ?? ''; });
    return rowObj;
  });
}

export function registerAdminMembersRoutes(router, db, broker, upload = null) {
  router.get('/members', asyncHandler(async (req, res) => {
    const { role = '', status = '', department_id = '', branch_id = '', q = '' } = req.query;
    const where = ['1=1'];
    const params = [];
    if (role && role !== 'all') {
      where.push('r.code = ?');
      params.push(role);
    }
    if (status && status !== 'all') {
      where.push('u.account_status = ?');
      params.push(status);
    }
    if (department_id && department_id !== 'all') {
      where.push('u.department_id = ?');
      params.push(Number(department_id));
    }
    if (branch_id && branch_id !== 'all') {
      where.push('u.branch_id = ?');
      params.push(Number(branch_id));
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.user_code LIKE ? OR u.phone LIKE ?)');
      params.push(like, like, like, like);
    }

    const members = db.all(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.is_active, u.account_status,
              u.created_at, u.last_login_at, u.reviewed_at, u.review_notes,
              r.id as role_id, r.code as role, r.name as role_name, r.is_staff,
              u.department_id, u.branch_id, d.name as department_name, b.name as branch_name,
              ep.employee_code, ep.designation, ep.qualification as emp_qualification, ep.shift,
              pp.patient_code, pp.dob, pp.gender, pp.emergency_contact_name, pp.emergency_contact_phone,
              dp.doctor_code, dp.specialty_id, sp.name as specialty_name, dp.qualification as doc_qualification,
              dp.experience_years, dp.consultation_fee, dp.availability_status, dp.registration_number, dp.medical_council, dp.schedule_configured
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       LEFT JOIN specialties sp ON sp.id = dp.specialty_id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN u.account_status IN ('Pending Verification', 'Pending Approval') THEN 0 ELSE 1 END, u.id DESC`,
      params
    );
    res.json({ members });
  }));

  router.get('/members/:id', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const member = db.get(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.is_active, u.account_status,
              u.created_at, u.last_login_at, u.reviewed_at, u.review_notes,
              r.id as role_id, r.code as role, r.name as role_name, r.is_staff,
              u.department_id, u.branch_id, d.name as department_name, b.name as branch_name,
              ep.employee_code, ep.designation, ep.qualification as emp_qualification, ep.shift, ep.joining_date,
              pp.id as patient_profile_id, pp.patient_code, pp.dob, pp.gender, pp.address, pp.blood_group, pp.emergency_contact_name, pp.emergency_contact_phone,
              dp.id as doctor_profile_id, dp.doctor_code, dp.specialty_id, sp.name as specialty_name, dp.qualification as doc_qualification,
              dp.experience_years, dp.consultation_fee, dp.availability_status, dp.registration_number, dp.medical_council, dp.schedule_configured
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       LEFT JOIN specialties sp ON sp.id = dp.specialty_id
       WHERE u.id = ?`,
      [uid]
    );
    if (!member) throw new AppError(404, 'Member not found.');

    const activity = db.all(
      `SELECT action, entity_type, entity_id, details, ip_address, created_at
       FROM audit_logs WHERE actor_user_id = ? OR (entity_type = 'user' AND entity_id = ?)
       ORDER BY id DESC LIMIT 20`,
      [uid, uid]
    );

    let assignments = [];
    if (member.patient_profile_id) {
      assignments = db.all(
        `SELECT appointment_ref as ref, appointment_date || ' ' || appointment_time as when_at, status, 'Appointment' as kind
         FROM appointments WHERE patient_id = ? ORDER BY id DESC LIMIT 10`,
        [member.patient_profile_id]
      );
    } else if (member.doctor_profile_id) {
      assignments = db.all(
        `SELECT a.appointment_ref as ref, a.appointment_date || ' ' || a.appointment_time as when_at, a.status, pu.full_name as kind
         FROM appointments a JOIN patient_profiles p ON p.id = a.patient_id JOIN users pu ON pu.id = p.user_id
         WHERE a.doctor_id = ? ORDER BY a.id DESC LIMIT 10`,
        [member.doctor_profile_id]
      );
    } else {
      assignments = db.all(
        `SELECT action as ref, created_at as when_at, entity_type as status, 'Workflow Action' as kind
         FROM audit_logs WHERE actor_user_id = ? ORDER BY id DESC LIMIT 10`,
        [uid]
      );
    }

    res.json({ member, activity, assignments });
  }));

  router.patch('/members/:id', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const existing = db.get('SELECT * FROM users WHERE id = ?', [uid]);
    if (!existing) throw new AppError(404, 'Member not found.');

    const { full_name, phone, department_id, branch_id, role_id, designation, qualification, shift, employment_type, base_salary, experience_years, consultation_fee, specialty_id } = req.body;
    const nextPhoneRaw = phone !== undefined && phone !== null ? String(phone).trim() : null;
    const nextPhoneNorm = nextPhoneRaw !== null ? normalizePhone(nextPhoneRaw) : null;
    if (nextPhoneNorm) {
      const dupPhone = db.get('SELECT id FROM users WHERE phone_normalized = ? AND id != ?', [nextPhoneNorm, uid]);
      if (dupPhone) throw new AppError(409, 'An account with this phone number already exists.');
    }
    db.transaction(() => {
      db.run(
        `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
                phone_normalized = CASE WHEN ? IS NOT NULL THEN ? ELSE phone_normalized END,
                department_id = ?, branch_id = COALESCE(?, branch_id), role_id = COALESCE(?, role_id), updated_at = datetime('now') WHERE id = ?`,
        [full_name?.trim() || null, nextPhoneRaw, nextPhoneRaw, nextPhoneNorm || null, department_id !== undefined ? (department_id ? Number(department_id) : null) : existing.department_id, branch_id ? Number(branch_id) : null, role_id ? Number(role_id) : null, uid]
      );
      const emp = db.get('SELECT id FROM employee_profiles WHERE user_id = ?', [uid]);
      if (emp) {
        db.run(
          `UPDATE employee_profiles SET department_id = ?, branch_id = COALESCE(?, branch_id), designation = COALESCE(?, designation),
                  qualification = COALESCE(?, qualification), shift = COALESCE(?, shift), employment_type = COALESCE(?, employment_type),
                  base_salary = COALESCE(?, base_salary), updated_at = datetime('now') WHERE user_id = ?`,
          [department_id !== undefined ? (department_id ? Number(department_id) : null) : existing.department_id, branch_id ? Number(branch_id) : null, designation || null, qualification || null, shift || null, employment_type || null, base_salary !== undefined ? Number(base_salary) : null, uid]
        );
      }
      const doc = db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [uid]);
      if (doc) {
        db.run(
          `UPDATE doctor_profiles SET department_id = ?, branch_id = COALESCE(?, branch_id), specialty_id = COALESCE(?, specialty_id),
                  qualification = COALESCE(?, qualification), experience_years = COALESCE(?, experience_years),
                  consultation_fee = COALESCE(?, consultation_fee), updated_at = datetime('now') WHERE user_id = ?`,
          [department_id !== undefined ? (department_id ? Number(department_id) : null) : existing.department_id, branch_id ? Number(branch_id) : null, specialty_id ? Number(specialty_id) : null, qualification || null, experience_years !== undefined ? Number(experience_years) : null, consultation_fee !== undefined ? Number(consultation_fee) : null, uid]
        );
      }
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: 'admin',
        action: 'admin.member_updated',
        entityType: 'user',
        entityId: uid,
        details: {
          before: { full_name: existing.full_name, role_id: existing.role_id, department_id: existing.department_id, branch_id: existing.branch_id },
          after: { full_name: full_name || existing.full_name, role_id: role_id || existing.role_id, department_id: department_id ?? existing.department_id, branch_id: branch_id || existing.branch_id }
        }
      });
    })();

    if (broker) broker.publish('member:updated', { userId: uid, title: 'Member Updated', message: `${full_name || existing.full_name} profile updated.` }, { roles: ['admin', 'hr'] });
    res.json({ ok: true });
  }));

  router.patch('/members/:id/role', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const { role_id, role_code } = req.body;
    const existing = db.get('SELECT u.*, r.code as role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [uid]);
    if (!existing) throw new AppError(404, 'Member not found.');
    const targetRole = role_id
      ? db.get('SELECT * FROM roles WHERE id = ?', [Number(role_id)])
      : db.get('SELECT * FROM roles WHERE code = ?', [String(role_code || '')]);
    if (!targetRole) throw new AppError(404, 'Target role not found.');
    db.run("UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE id = ?", [targetRole.id, uid]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.role_assigned',
      entityType: 'user',
      entityId: uid,
      details: { before: { role: existing.role_code }, after: { role: targetRole.code } }
    });
    res.json({ ok: true, role: targetRole });
  }));

  router.post('/members/:id/review', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const { decision, notes = '', role = null, department_id = null, branch_id = null, specialty_id = null } = req.body;
    if (!['Approved', 'Rejected'].includes(decision)) throw new AppError(400, 'Decision must be Approved or Rejected.');

    if (decision === 'Approved') {
      const result = approveSignupRequestTx(db, broker, {
        userId: uid,
        adminUserId: req.user.id,
        role,
        department_id,
        branch_id,
        specialty_id,
        admin_notes: notes
      });
      return res.json({ ok: true, account_status: 'Active', role: result.role });
    }

    rejectSignupRequestTx(db, broker, {
      userId: uid,
      adminUserId: req.user.id,
      reason: notes || 'Declined by administrator'
    });
    return res.json({ ok: true, account_status: 'Rejected' });
  }));

  router.patch('/members/:id/status', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const { account_status, reset_password } = req.body;
    const user = db.get('SELECT id, full_name FROM users WHERE id = ?', [uid]);
    if (!user) throw new AppError(404, 'Member not found.');

    if (account_status) {
      if (!['Active', 'Suspended', 'Rejected'].includes(account_status)) throw new AppError(400, 'Invalid account status.');
      const active = account_status === 'Active' ? 1 : 0;
      db.run('UPDATE users SET is_active = ?, account_status = ?, updated_at = datetime(\'now\') WHERE id = ?', [active, account_status, uid]);
      db.run('UPDATE doctor_profiles SET is_active = ? WHERE user_id = ?', [active, uid]);
    }
    if (reset_password) {
      if (!isStrongPassword(reset_password)) throw new AppError(400, 'New password must be 8+ chars with a number.');
      db.run('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime(\'now\') WHERE id = ?', [bcrypt.hashSync(reset_password, 10), uid]);
    }
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.member_status_changed', entityType: 'user', entityId: uid, details: JSON.stringify({ account_status, passwordReset: Boolean(reset_password) }) });
    createNotification(db, broker, {
      userId: uid,
      roles: ['admin'],
      title: 'Account Status Updated',
      message: `${user.full_name} account status updated${account_status ? ` to ${account_status}` : ''}.`,
      eventType: account_status === 'Suspended' ? 'member:deactivated' : 'member:updated'
    });
    res.json({ ok: true });
  }));

  router.post('/members/:id/reset-token', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const user = db.get('SELECT id, email, full_name FROM users WHERE id = ?', [uid]);
    if (!user) throw new AppError(404, 'Member not found.');
    const code = String(crypto.randomInt(100000, 999999));
    db.run('UPDATE users SET reset_token_hash = ?, reset_expires_at = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [bcrypt.hashSync(code, 8), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), uid]);
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.password_reset_issued', entityType: 'user', entityId: uid });
    res.json({ resetCode: code, email: user.email, message: `One-time reset code issued for ${user.full_name} (valid 24 hours).` });
  }));

  const csvUpload = upload ? upload.single('file') : (_req, _res, next) => next();
  router.post('/members/import-csv', csvUpload, asyncHandler(async (req, res) => {
    let csvText = req.body?.csv_text || '';
    if (!csvText && req.file?.path) {
      csvText = fs.readFileSync(req.file.path, 'utf8');
    }
    if (!String(csvText).trim()) throw new AppError(400, 'CSV content or file is required.');

    const rows = parseCsvRows(csvText);
    if (!rows.length) throw new AppError(400, 'CSV must contain a header row and at least one member row.');

    const roleMap = Object.fromEntries(db.all('SELECT id, code, name, is_staff FROM roles').map((r) => [r.code.toLowerCase(), r]));
    const deptRows = db.all('SELECT id, code, name FROM departments');
    const branchRows = db.all('SELECT id, code, name FROM branches');
    const specRows = db.all('SELECT id, name, department_id FROM specialties');

    const createdUsers = [];
    const errors = [];

    for (const row of rows) {
      const rowNum = row._rowNumber;
      const fullName = String(row.full_name || row.name || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const mobile = String(row.mobile || row.phone || '').trim();
      const roleCode = String(row.role || 'patient').trim().toLowerCase();
      const password = String(row.password || '').trim();
      const empId = String(row.employee_id || '').trim();
      const regNo = String(row.medical_registration_number || row.registration_number || '').trim();
      const council = String(row.medical_council || row.council || '').trim();

      if (!fullName || fullName.length < 2) {
        errors.push({ row: rowNum, email, message: 'Full name is required.' });
        continue;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, email, message: 'Valid email is required.' });
        continue;
      }
      if (!isStrongPassword(password)) {
        errors.push({ row: rowNum, email, message: 'Password must be at least 8 characters and include a number.' });
        continue;
      }
      const roleObj = roleMap[roleCode];
      if (!roleObj || roleObj.code === 'pending_staff') {
        errors.push({ row: rowNum, email, message: `Unknown or invalid role "${roleCode}".` });
        continue;
      }
      const normMobile = normalizePhone(mobile);
      const dupUser = db.get(
        'SELECT id FROM users WHERE lower(email) = lower(?) OR (? != \'\' AND (phone_normalized = ? OR phone = ?))',
        [email, normMobile || mobile, normMobile, mobile]
      );
      if (dupUser) {
        errors.push({ row: rowNum, email, message: 'Email or mobile number already exists.' });
        continue;
      }
      if (empId && db.get('SELECT id FROM employee_profiles WHERE upper(employee_code) = upper(?)', [empId])) {
        errors.push({ row: rowNum, email, message: `Employee ID ${empId} already exists.` });
        continue;
      }
      if (regNo && db.get('SELECT id FROM doctor_profiles WHERE upper(registration_number) = upper(?)', [regNo])) {
        errors.push({ row: rowNum, email, message: `Medical registration ${regNo} already exists.` });
        continue;
      }

      const branchMatch = branchRows.find((b) => b.code.toLowerCase() === String(row.branch || '').toLowerCase() || b.name.toLowerCase() === String(row.branch || '').toLowerCase()) || branchRows[0];
      const deptMatch = deptRows.find((d) => d.code.toLowerCase() === String(row.department || '').toLowerCase() || d.name.toLowerCase() === String(row.department || '').toLowerCase()) || null;
      const specMatch = specRows.find((s) => s.name.toLowerCase() === String(row.specialty || '').toLowerCase()) || (deptMatch && specRows.find((s) => s.department_id === deptMatch.id)) || specRows[0];

      const uCode = `${roleObj.code.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
      const hash = bcrypt.hashSync(password, 10);

      try {
        const uid = db.transaction(() => {
          const uInfo = db.run(
            `INSERT INTO users (user_code, email, password_hash, full_name, phone, phone_normalized, role_id, branch_id, department_id, is_active, account_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
            [uCode, email, hash, fullName, normMobile || mobile, normMobile || null, roleObj.id, branchMatch?.id || 1, deptMatch?.id || null]
          );
          const newId = uInfo.lastInsertRowid;

          if (roleObj.code === 'patient') {
            const patCode = generateNextPatientCode(db);
            db.run(
              `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, address, otp_verified, profile_completion)
               VALUES (?, ?, ?, ?, ?, 1, 70)`,
              [newId, patCode, row.dob || '1990-01-01', row.gender || 'Other', row.address || 'Not provided']
            );
          } else if (roleObj.is_staff) {
            db.run(
              `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, joining_date, employment_status, base_salary)
               VALUES (?, ?, ?, ?, ?, ?, date('now'), 'Active', ?)`,
              [newId, empId || `EMP-${uCode}`, deptMatch?.id || null, branchMatch?.id || 1, roleObj.name.toUpperCase(), row.qualification || null, roleObj.code === 'doctor' ? 14000 : 5500]
            );
          }

          if (roleObj.code === 'doctor') {
            db.run(
              `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, registration_number, medical_council, schedule_configured)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [newId, `DR-${uCode.split('-')[1]}`, specMatch.id, deptMatch?.id || specMatch.department_id || 1, branchMatch?.id || 1, row.qualification || 'MD', Number(row.experience_years || 5), Number(row.consultation_fee || 100), regNo || `REG-${uCode}`, council || null]
            );
          }

          return newId;
        })();
        createdUsers.push({ id: uid, email, role: roleObj.code, user_code: uCode });
      } catch (err) {
        errors.push({ row: rowNum, email, message: err.message || 'Database insert error.' });
      }
    }

    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: 'admin',
      action: 'admin.members_csv_imported',
      entityType: 'user',
      entityId: req.user.id,
      details: JSON.stringify({ createdCount: createdUsers.length, errorCount: errors.length })
    });
    if (broker && createdUsers.length > 0) {
      broker.publish('member:registered', { count: createdUsers.length, title: 'Bulk CSV Import', message: `${createdUsers.length} account(s) imported by administrator.` }, { roles: ['admin', 'hr'] });
    }

    res.json({
      createdCount: createdUsers.length,
      skippedCount: errors.length,
      errors,
      createdUsers
    });
  }));

  router.post('/admins', asyncHandler(async (req, res) => {
    const {
      full_name = '',
      email = '',
      phone = '',
      password = '',
      department_id = null,
      branch_id = 1,
      designation = 'Hospital Administrator'
    } = req.body || {};

    const cleanName = String(full_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = normalizePhone(phone) || String(phone).trim();
    const cleanPhoneNorm = normalizePhone(phone);
    if (cleanName.length < 2) throw new AppError(400, 'Full name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new AppError(400, 'Valid email address is required.');
    if (!isStrongPassword(password)) throw new AppError(400, 'Password must be at least 8 characters and include a number.');

    const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [cleanEmail]);
    if (dup) throw new AppError(409, 'An account with this email address already exists.');
    if (cleanPhoneNorm) {
      const cands = getPhoneLookupCandidates(phone);
      const ph = cands.map(() => '?').join(', ');
      if (db.get(`SELECT id FROM users WHERE phone_normalized IN (${ph})`, cands)) {
        throw new AppError(409, 'An account with this phone number already exists.');
      }
    }

    const adminRole = db.get("SELECT id, code, name FROM roles WHERE code = 'admin'");
    if (!adminRole) throw new AppError(500, 'Admin role configuration missing.');

    const admDept = department_id
      ? db.get('SELECT id, branch_id FROM departments WHERE id = ?', [Number(department_id)])
      : db.get("SELECT id, branch_id FROM departments WHERE name = 'Administration'") || db.get('SELECT id, branch_id FROM departments ORDER BY id LIMIT 1');

    const userCode = `ADM-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
    const hash = bcrypt.hashSync(password, 10);

    const createdId = db.transaction(() => {
      const uInfo = db.run(
        `INSERT INTO users (user_code, email, password_hash, full_name, phone, phone_normalized, role_id, branch_id, department_id, is_active, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
        [userCode, cleanEmail, hash, cleanName, cleanPhone, cleanPhoneNorm || null, adminRole.id, Number(branch_id || admDept?.branch_id || 1), admDept?.id || null]
      );
      db.run(
        `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, employment_status, base_salary)
         VALUES (?, ?, ?, ?, ?, date('now'), 'Active', 0)`,
        [uInfo.lastInsertRowid, `EMP-${userCode}`, admDept?.id || null, Number(branch_id || admDept?.branch_id || 1), String(designation || 'Hospital Administrator').trim()]
      );
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: 'admin',
        action: 'admin.admin_created',
        entityType: 'user',
        entityId: uInfo.lastInsertRowid,
        details: JSON.stringify({ email: cleanEmail, user_code: userCode })
      });
      return uInfo.lastInsertRowid;
    })();

    const adminUser = db.get(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.is_active, u.account_status,
              u.created_at, r.code as role, r.name as role_name, u.department_id, d.name as department_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ?`,
      [createdId]
    );
    if (broker) {
      broker.publish('member:registered', { userId: createdId, title: 'New Admin Created', message: `${cleanName} added as Administrator.` }, { roles: ['admin'] });
    }
    res.status(201).json({ admin: adminUser, message: `Administrator account created for ${cleanName}.` });
  }));
}
