import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { getPhoneLookupCandidates, normalizePhone } from '../services/phone.js';
import { approveSignupRequestTx, rejectSignupRequestTx } from './registration_helpers.js';

export function registerAdminSignupsRoutes(router, db, broker) {
  router.get('/signup-requests', asyncHandler(async (_req, res) => {
    const requests = db.all(
      `SELECT sr.*, u.user_code, u.is_active as user_is_active, u.account_status as user_account_status,
              r.name as requested_role_label, d.name as department_name, b.name as branch_name,
              sp.name as specialty_name, rev.full_name as reviewer_name
       FROM staff_signup_requests sr
       JOIN users u ON u.id = sr.user_id
       LEFT JOIN roles r ON r.code = sr.requested_role
       LEFT JOIN departments d ON d.id = sr.department_id
       LEFT JOIN branches b ON b.id = sr.branch_id
       LEFT JOIN specialties sp ON sp.id = sr.specialty_id
       LEFT JOIN users rev ON rev.id = sr.reviewed_by
       ORDER BY CASE WHEN sr.status = 'Pending' THEN 0 WHEN sr.status = 'Info Requested' THEN 1 ELSE 2 END, sr.id DESC`
    );
    const pendingItems = requests.filter((r) => r.status === 'Pending');
    const pendingCount = pendingItems.length;
    const pendingDoctorsCount = pendingItems.filter((r) => r.requested_role === 'doctor').length;
    const pendingStaffCount = pendingItems.filter((r) => r.requested_role !== 'doctor').length;
    res.json({ requests, pendingCount, pendingDoctorsCount, pendingStaffCount });
  }));

  router.post('/signup-requests/:id/approve', asyncHandler(async (req, res) => {
    const reqId = Number(req.params.id);
    const { role = null, department_id = null, branch_id = null, specialty_id = null, admin_notes = '' } = req.body;
    const result = approveSignupRequestTx(db, broker, {
      requestId: reqId,
      adminUserId: req.user.id,
      role,
      department_id,
      branch_id,
      specialty_id,
      admin_notes
    });
    res.json(result);
  }));

  router.post('/signup-requests/:id/reject', asyncHandler(async (req, res) => {
    const reqId = Number(req.params.id);
    const { reason = '' } = req.body;
    const result = rejectSignupRequestTx(db, broker, {
      requestId: reqId,
      adminUserId: req.user.id,
      reason
    });
    res.json(result);
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
      message: `Administrator requested more details for your registration: ${notes}`,
      eventType: 'member:updated'
    });

    res.json({ ok: true, status: 'Info Requested', message: `Information requested for request #${reqId}.` });
  }));

  router.post('/doctors', asyncHandler(async (req, res) => {
    const {
      name, email, phone = '', registration_number, medical_council = '', department_id, branch_id = 1,
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
    const normPhone = normalizePhone(phone);
    if (normPhone) {
      const cands = getPhoneLookupCandidates(phone);
      const ph = cands.map(() => '?').join(', ');
      if (db.get(`SELECT id FROM users WHERE phone_normalized IN (${ph})`, cands)) {
        throw new AppError(409, 'Phone number is already registered.');
      }
    }
    const dupReg = db.get('SELECT id FROM doctor_profiles WHERE upper(registration_number) = upper(?)', [String(registration_number).trim()]);
    if (dupReg) throw new AppError(409, 'Medical registration number is already assigned.');

    const doctorRole = db.get("SELECT id FROM roles WHERE code = 'doctor'");
    const branchIdNum = Number(branch_id || 1);
    const deptIdNum = Number(department_id);

    const fallbackSpec = db.get('SELECT id FROM specialties WHERE department_id = ? ORDER BY id LIMIT 1', [deptIdNum]) || db.get('SELECT id FROM specialties ORDER BY id LIMIT 1');
    const resolvedSpecId = specialty_id ? Number(specialty_id) : (fallbackSpec ? fallbackSpec.id : 1);

    const hash = bcrypt.hashSync(password, 10);
    const uCode = `DOC-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;

    const uid = db.transaction(() => {
      const uInfo = db.run(
        `INSERT INTO users (user_code, email, password_hash, full_name, phone, phone_normalized, role_id, branch_id, department_id, is_active, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
        [uCode, email.trim().toLowerCase(), hash, name.trim(), normPhone || phone, normPhone || null, doctorRole.id, branchIdNum, deptIdNum]
      );
      const userId = uInfo.lastInsertRowid;

      db.run(
        `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, shift, joining_date, employment_status, base_salary)
         VALUES (?, ?, ?, ?, 'CONSULTANT DOCTOR', ?, 'Day', date('now'), 'Active', 15000)`,
        [userId, `EMP-${uCode}`, deptIdNum, branchIdNum, qualification]
      );

      const dpInfo = db.run(
        `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, availability_status, is_active, registration_number, medical_council, working_days, slot_minutes, schedule_configured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 4.9, 'Available', 1, ?, ?, ?, ?, 1)`,
        [userId, `DR-${uCode.split('-')[1]}`, resolvedSpecId, deptIdNum, branchIdNum, qualification, Number(experience_years || 5), Number(consultation_fee || 100), bio || `${name} consultant doctor at MediCore HMS.`, String(registration_number).trim(), medical_council || null, working_days, Number(slot_minutes || 30)]
      );
      const docProfileId = dpInfo.lastInsertRowid;

      const daysMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      const selectedDays = working_days.split(',').map((d) => daysMap[d.trim()]).filter(Boolean);
      for (const dow of (selectedDays.length ? selectedDays : [1, 2, 3, 4, 5])) {
        db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, is_active) VALUES (?, ?, ?, ?, ?, 1)', [docProfileId, dow, '09:00', '17:00', Number(slot_minutes || 30)]);
      }

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
