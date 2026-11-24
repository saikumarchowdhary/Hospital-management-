import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

export function registerAdminMembersRoutes(router, db, broker) {
  router.get('/members', asyncHandler(async (req, res) => {
    const { role = '', status = '', q = '' } = req.query;
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
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.user_code LIKE ? OR u.phone LIKE ?)');
      params.push(like, like, like, like);
    }

    const members = db.all(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.phone, u.is_active, u.account_status,
              u.created_at, u.last_login_at, u.reviewed_at, u.review_notes,
              r.id as role_id, r.code as role, r.name as role_name, r.is_staff,
              u.department_id, d.name as department_name, b.name as branch_name,
              ep.employee_code, ep.designation, ep.qualification as emp_qualification, ep.shift,
              pp.patient_code, pp.dob, pp.gender, pp.emergency_contact_name, pp.emergency_contact_phone,
              dp.doctor_code, dp.specialty_id, sp.name as specialty_name, dp.qualification as doc_qualification,
              dp.experience_years, dp.consultation_fee, dp.availability_status
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN branches b ON b.id = u.branch_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       LEFT JOIN specialties sp ON sp.id = dp.specialty_id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN u.account_status = 'Pending Approval' THEN 0 ELSE 1 END, u.id DESC`,
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
              u.department_id, d.name as department_name, b.name as branch_name,
              ep.employee_code, ep.designation, ep.qualification as emp_qualification, ep.shift, ep.joining_date,
              pp.id as patient_profile_id, pp.patient_code, pp.dob, pp.gender, pp.address, pp.blood_group, pp.emergency_contact_name, pp.emergency_contact_phone,
              dp.id as doctor_profile_id, dp.doctor_code, dp.specialty_id, sp.name as specialty_name, dp.qualification as doc_qualification, dp.experience_years, dp.consultation_fee, dp.availability_status
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

    const { full_name, phone, department_id, role_id, designation, qualification, shift, experience_years, consultation_fee, specialty_id } = req.body;
    db.transaction(() => {
      db.run(
        `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
                department_id = ?, role_id = COALESCE(?, role_id), updated_at = datetime('now') WHERE id = ?`,
        [full_name?.trim() || null, phone ?? null, department_id ? Number(department_id) : existing.department_id, role_id ? Number(role_id) : null, uid]
      );
      const emp = db.get('SELECT id FROM employee_profiles WHERE user_id = ?', [uid]);
      if (emp) {
        db.run(
          `UPDATE employee_profiles SET department_id = ?, designation = COALESCE(?, designation),
                  qualification = COALESCE(?, qualification), shift = COALESCE(?, shift), updated_at = datetime('now') WHERE user_id = ?`,
          [department_id ? Number(department_id) : existing.department_id, designation || null, qualification || null, shift || null, uid]
        );
      }
      const doc = db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [uid]);
      if (doc) {
        db.run(
          `UPDATE doctor_profiles SET department_id = ?, specialty_id = COALESCE(?, specialty_id),
                  qualification = COALESCE(?, qualification), experience_years = COALESCE(?, experience_years),
                  consultation_fee = COALESCE(?, consultation_fee), updated_at = datetime('now') WHERE user_id = ?`,
          [department_id ? Number(department_id) : existing.department_id, specialty_id ? Number(specialty_id) : null, qualification || null, experience_years !== undefined ? Number(experience_years) : null, consultation_fee !== undefined ? Number(consultation_fee) : null, uid]
        );
      }
      logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.member_updated', entityType: 'user', entityId: uid });
    })();

    if (broker) broker.publish('member:updated', { userId: uid, title: 'Member Updated', message: `${full_name || existing.full_name} profile updated.` }, { roles: ['admin', 'hr'] });
    res.json({ ok: true });
  }));

  router.post('/members/:id/review', asyncHandler(async (req, res) => {
    const uid = Number(req.params.id);
    const { decision, notes = '' } = req.body;
    if (!['Approved', 'Rejected'].includes(decision)) throw new AppError(400, 'Decision must be Approved or Rejected.');
    const user = db.get('SELECT * FROM users WHERE id = ?', [uid]);
    if (!user) throw new AppError(404, 'Member not found.');

    const nextStatus = decision === 'Approved' ? 'Active' : 'Rejected';
    const nextActive = decision === 'Approved' ? 1 : 0;

    db.transaction(() => {
      db.run(
        `UPDATE users SET is_active = ?, account_status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now') WHERE id = ?`,
        [nextActive, nextStatus, req.user.id, notes, uid]
      );
      db.run('UPDATE employee_profiles SET employment_status = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [nextStatus, uid]);
      db.run('UPDATE doctor_profiles SET is_active = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [nextActive, uid]);
      if (decision === 'Approved') {
        const doc = db.get('SELECT id, branch_id FROM doctor_profiles WHERE user_id = ?', [uid]);
        if (doc) {
          const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00'];
          const today = new Date();
          for (let offset = 0; offset < 7; offset++) {
            const dt = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
            for (const t of times) {
              db.run('INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)', [doc.id, doc.branch_id, dt, t, 'Available']);
            }
          }
        }
      }
      logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: `admin.member_${decision.toLowerCase()}`, entityType: 'user', entityId: uid, details: { notes } });
    })();

    createNotification(db, broker, {
      userId: uid,
      roles: ['admin', 'hr'],
      title: `Registration ${decision}`,
      message: `${user.full_name} account is now ${nextStatus}.`,
      eventType: 'member:updated'
    });
    res.json({ ok: true, account_status: nextStatus });
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
    logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.member_status_changed', entityType: 'user', entityId: uid });
    if (broker) broker.publish('member:updated', { userId: uid, title: 'Member Account Updated', message: `${user.full_name} status updated.` }, { roles: ['admin'] });
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
}
