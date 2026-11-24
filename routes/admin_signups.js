import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

export function registerAdminSignupsRoutes(router, db, broker) {
  router.get('/signup-requests', asyncHandler(async (_req, res) => {
    const requests = db.all(
      `SELECT sr.*, u.user_code, u.is_active as user_is_active, u.account_status as user_account_status,
              r.name as requested_role_label, d.name as department_name, b.name as branch_name,
              rev.full_name as reviewer_name
       FROM staff_signup_requests sr
       JOIN users u ON u.id = sr.user_id
       LEFT JOIN roles r ON r.code = sr.requested_role
       LEFT JOIN departments d ON d.id = sr.department_id
       LEFT JOIN branches b ON b.id = sr.branch_id
       LEFT JOIN users rev ON rev.id = sr.reviewed_by
       ORDER BY CASE WHEN sr.status = 'Pending' THEN 0 WHEN sr.status = 'Info Requested' THEN 1 ELSE 2 END, sr.id DESC`
    );
    const pendingCount = requests.filter((r) => r.status === 'Pending').length;
    res.json({ requests, pendingCount });
  }));

  router.post('/signup-requests/:id/approve', asyncHandler(async (req, res) => {
    const reqId = Number(req.params.id);
    const request = db.get('SELECT * FROM staff_signup_requests WHERE id = ?', [reqId]);
    if (!request) throw new AppError(404, 'Signup request not found.');

    if (request.status === 'Approved') {
      return res.json({ ok: true, message: 'Request is already approved.', status: 'Approved' });
    }

    const { role = request.requested_role, department_id = request.department_id, branch_id = request.branch_id, admin_notes = '' } = req.body;
    const targetRole = db.get('SELECT id, code, name, is_staff FROM roles WHERE code = ?', [role]);
    if (!targetRole) throw new AppError(400, 'Invalid assigned role.');

    const targetDeptId = department_id ? Number(department_id) : (request.department_id || null);
    const targetBranchId = branch_id ? Number(branch_id) : (request.branch_id || 1);

    db.transaction(() => {
      db.run(
        `UPDATE users
         SET role_id = ?, branch_id = ?, department_id = ?, is_active = 1, account_status = 'Active',
             reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [targetRole.id, targetBranchId, targetDeptId, req.user.id, admin_notes || 'Approved by administrator', request.user_id]
      );

      const empCode = request.employee_id || `EMP-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
      const existingEmp = db.get('SELECT id FROM employee_profiles WHERE user_id = ?', [request.user_id]);
      if (!existingEmp) {
        db.run(
          `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, joining_date, employment_status, base_salary)
           VALUES (?, ?, ?, ?, ?, ?, date('now'), 'Active', ?)`,
          [request.user_id, empCode, targetDeptId, targetBranchId, targetRole.name.toUpperCase(), request.qualification || null, targetRole.code === 'doctor' ? 14000 : 5500]
        );
      } else {
        db.run(
          `UPDATE employee_profiles SET department_id = ?, branch_id = ?, designation = ?, employment_status = 'Active', updated_at = datetime('now') WHERE user_id = ?`,
          [targetDeptId, targetBranchId, targetRole.name.toUpperCase(), request.user_id]
        );
      }

      if (targetRole.code === 'doctor') {
        const existingDoc = db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [request.user_id]);
        if (!existingDoc) {
          const fallbackSpec = db.get('SELECT id FROM specialties WHERE department_id = ? ORDER BY id LIMIT 1') || db.get('SELECT id FROM specialties ORDER BY id LIMIT 1');
          const dpInfo = db.run(
            `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, availability_status, is_active, registration_number, working_days, slot_minutes)
             VALUES (?, ?, ?, ?, ?, ?, 5, 100, ?, 'Available', 1, ?, 'Mon,Tue,Wed,Thu,Fri', 30)`,
            [request.user_id, `DR-${String(Date.now()).slice(-4)}`, fallbackSpec.id, targetDeptId || 1, targetBranchId, request.qualification || 'MD', `Consultant at MediCore HMS`, `REG-MED-${crypto.randomInt(10000, 99999)}`]
          );
          for (let dow = 1; dow <= 5; dow++) {
            db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, 30)', [dpInfo.lastInsertRowid, dow, '09:00', '17:00']);
          }
          const today = new Date();
          const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00'];
          for (let offset = 0; offset < 7; offset++) {
            const dt = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
            for (const t of times) {
              db.run('INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)', [dpInfo.lastInsertRowid, targetBranchId, dt, t, 'Available']);
            }
          }
        }
      }

      db.run(
        `UPDATE staff_signup_requests
         SET status = 'Approved', reviewed_by = ?, reviewed_at = datetime('now'), admin_notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [req.user.id, admin_notes || null, reqId]
      );

      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: 'admin',
        action: 'auth.staff_signup_approved',
        entityType: 'staff_signup_request',
        entityId: reqId,
        details: JSON.stringify({ assignedRole: targetRole.code, department_id: targetDeptId, branch_id: targetBranchId })
      });
    })();

    createNotification(db, broker, {
      userId: request.user_id,
      roles: ['admin'],
      title: 'Staff Signup Approved',
      message: `Your account registration as ${targetRole.name} has been approved by administration. You now have full workspace access.`,
      eventType: 'member:updated'
    });

    res.json({ ok: true, status: 'Approved', role: targetRole.code, message: `Staff signup request #${reqId} approved.` });
  }));

  router.post('/signup-requests/:id/reject', asyncHandler(async (req, res) => {
    const reqId = Number(req.params.id);
    const { reason = '' } = req.body;
    if (!String(reason).trim()) throw new AppError(400, 'Rejection reason is required.');

    const request = db.get('SELECT * FROM staff_signup_requests WHERE id = ?', [reqId]);
    if (!request) throw new AppError(404, 'Signup request not found.');

    db.transaction(() => {
      db.run(
        `UPDATE staff_signup_requests
         SET status = 'Rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [String(reason).trim(), req.user.id, reqId]
      );
      db.run(
        `UPDATE users
         SET is_active = 0, account_status = 'Rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [req.user.id, String(reason).trim(), request.user_id]
      );
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: 'admin',
        action: 'auth.staff_signup_rejected',
        entityType: 'staff_signup_request',
        entityId: reqId,
        details: JSON.stringify({ reason })
      });
    })();

    createNotification(db, broker, {
      userId: request.user_id,
      roles: ['admin'],
      title: 'Staff Signup Rejected',
      message: `Your staff application was reviewed and rejected. Reason: ${reason}`,
      eventType: 'member:updated'
    });

    res.json({ ok: true, status: 'Rejected', message: `Staff signup request #${reqId} rejected.` });
  }));

  router.post('/signup-requests/:id/request-info', asyncHandler(async (req, res) => {
    const reqId = Number(req.params.id);
    const { notes = '' } = req.body;
    if (!String(notes).trim()) throw new AppError(400, 'Information request notes are required.');

    const request = db.get('SELECT * FROM staff_signup_requests WHERE id = ?', [reqId]);
    if (!request) throw new AppError(404, 'Signup request not found.');

    db.transaction(() => {
      db.run(
        `UPDATE staff_signup_requests
         SET status = 'Info Requested', admin_notes = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [String(notes).trim(), req.user.id, reqId]
      );
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: 'admin',
        action: 'auth.staff_signup_info_requested',
        entityType: 'staff_signup_request',
        entityId: reqId,
        details: JSON.stringify({ notes })
      });
    })();

    createNotification(db, broker, {
      userId: request.user_id,
      roles: ['admin'],
      title: 'More Information Needed',
      message: `Administrator requested more details for your staff registration: ${notes}`,
      eventType: 'member:updated'
    });

    res.json({ ok: true, status: 'Info Requested', message: `Information requested for request #${reqId}.` });
  }));

  router.post('/doctors', asyncHandler(async (req, res) => {
    const {
      name, email, phone = '', registration_number, department_id, branch_id = 1,
      qualification = 'MBBS, MD', specialty_id = null, bio = '',
      experience_years = 5, consultation_fee = 100, working_days = 'Mon,Tue,Wed,Thu,Fri',
      slot_minutes = 30, password = 'Doctor@123'
    } = req.body;

    if (!name || String(name).trim().length < 2) throw new AppError(400, 'Doctor name is required.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Valid doctor email is required.');
    if (!registration_number || !String(registration_number).trim()) throw new AppError(400, 'Medical registration number is required.');
    if (!department_id) throw new AppError(400, 'Department selection is required.');
    if (!isStrongPassword(password)) throw new AppError(400, 'Password must be 8+ chars and contain a number.');

    const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
    if (dup) throw new AppError(409, 'Email is already registered.');

    const doctorRole = db.get("SELECT id FROM roles WHERE code = 'doctor'");
    const branchIdNum = Number(branch_id || 1);
    const deptIdNum = Number(department_id);

    const fallbackSpec = db.get('SELECT id FROM specialties WHERE department_id = ? ORDER BY id LIMIT 1') || db.get('SELECT id FROM specialties ORDER BY id LIMIT 1');
    const resolvedSpecId = specialty_id ? Number(specialty_id) : (fallbackSpec ? fallbackSpec.id : 1);

    const hash = bcrypt.hashSync(password, 10);
    const uCode = `DOC-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;

    const uid = db.transaction(() => {
      const uInfo = db.run(
        `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
        [uCode, email.trim().toLowerCase(), hash, name.trim(), phone, doctorRole.id, branchIdNum, deptIdNum]
      );
      const userId = uInfo.lastInsertRowid;

      db.run(
        `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, shift, joining_date, employment_status, base_salary)
         VALUES (?, ?, ?, ?, 'CONSULTANT DOCTOR', ?, 'Day', date('now'), 'Active', 15000)`,
        [userId, `EMP-${uCode}`, deptIdNum, branchIdNum, qualification]
      );

      const dpInfo = db.run(
        `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, availability_status, is_active, registration_number, working_days, slot_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 4.9, 'Available', 1, ?, ?, ?)`,
        [userId, `DR-${uCode.split('-')[1]}`, resolvedSpecId, deptIdNum, branchIdNum, qualification, Number(experience_years || 5), Number(consultation_fee || 100), bio || `${name} consultant doctor at MediCore HMS.`, String(registration_number).trim(), working_days, Number(slot_minutes || 30)]
      );
      const docProfileId = dpInfo.lastInsertRowid;

      // Seed schedules for selected working days
      const daysMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      const selectedDays = working_days.split(',').map((d) => daysMap[d.trim()]).filter(Boolean);
      for (const dow of (selectedDays.length ? selectedDays : [1, 2, 3, 4, 5])) {
        db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, is_active) VALUES (?, ?, ?, ?, ?, 1)', [docProfileId, dow, '09:00', '17:00', Number(slot_minutes || 30)]);
      }

      // Generate future slots
      const today = new Date();
      const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00'];
      for (let offset = 0; offset < 7; offset++) {
        const dt = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
        for (const t of times) {
          db.run('INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)', [docProfileId, branchIdNum, dt, t, 'Available']);
        }
      }

      logAudit(db, { actorUserId: req.user.id, actorRole: 'admin', action: 'admin.doctor_created', entityType: 'doctor_profile', entityId: docProfileId, details: JSON.stringify({ name, email, reg: registration_number }) });
      return userId;
    })();

    if (broker) broker.publish('member:registered', { userId: uid, title: 'Doctor Created', message: `${name} has joined MediCore HMS.` }, { roles: ['admin', 'receptionist'] });
    res.status(201).json({ ok: true, message: `Doctor ${name} successfully created with schedule and slots.`, userId: uid });
  }));
}
