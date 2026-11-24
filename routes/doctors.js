import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function saveDoctorSchedulesAndSlots(db, broker, doctorId, payload) {
  const doc = db.get('SELECT id, branch_id, working_days, slot_minutes FROM doctor_profiles WHERE id = ?', [doctorId]);
  if (!doc) throw new AppError(404, 'Doctor profile not found.');

  const {
    schedules = [],
    working_days = null,
    start_time = '09:00',
    end_time = '17:00',
    slot_minutes = 30,
    break_start = null,
    break_end = null,
    consultation_fee,
    availability_status
  } = payload;

  const normalizedSchedules = [];
  if (Array.isArray(schedules) && schedules.length > 0) {
    for (const sc of schedules) {
      normalizedSchedules.push({
        day_of_week: Number(sc.day_of_week),
        start_time: String(sc.start_time || '09:00'),
        end_time: String(sc.end_time || '17:00'),
        slot_minutes: Math.max(10, Number(sc.slot_minutes || slot_minutes || 30)),
        break_start: sc.break_start || break_start || null,
        break_end: sc.break_end || break_end || null
      });
    }
  } else if (Array.isArray(working_days) && working_days.length > 0) {
    for (const d of working_days) {
      const dow = typeof d === 'number' ? d : DAY_NAMES.indexOf(String(d).trim());
      if (dow >= 0 && dow <= 7) {
        normalizedSchedules.push({
          day_of_week: dow,
          start_time: String(start_time || '09:00'),
          end_time: String(end_time || '17:00'),
          slot_minutes: Math.max(10, Number(slot_minutes || 30)),
          break_start: break_start || null,
          break_end: break_end || null
        });
      }
    }
  }

  db.transaction(() => {
    if (consultation_fee !== undefined && consultation_fee !== null && consultation_fee !== '') {
      db.run("UPDATE doctor_profiles SET consultation_fee = ?, updated_at = datetime('now') WHERE id = ?", [Number(consultation_fee), doctorId]);
    }
    if (availability_status) {
      const allowed = ['Available', 'Busy', 'On Leave', 'In Surgery'];
      if (!allowed.includes(availability_status)) throw new AppError(400, 'Invalid availability status.');
      db.run("UPDATE doctor_profiles SET availability_status = ?, updated_at = datetime('now') WHERE id = ?", [availability_status, doctorId]);
    }

    if (normalizedSchedules.length > 0) {
      db.run('DELETE FROM doctor_schedules WHERE doctor_id = ?', [doctorId]);
      for (const sc of normalizedSchedules) {
        db.run(
          `INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, break_start, break_end, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [doctorId, sc.day_of_week, sc.start_time, sc.end_time, sc.slot_minutes, sc.break_start, sc.break_end]
        );
      }

      const dayLabels = [...new Set(normalizedSchedules.map((s) => DAY_NAMES[s.day_of_week % 7]))].join(',');
      db.run(
        "UPDATE doctor_profiles SET working_days = ?, slot_minutes = ?, schedule_configured = 1, updated_at = datetime('now') WHERE id = ?",
        [dayLabels, normalizedSchedules[0].slot_minutes, doctorId]
      );

      const todayStr = new Date().toISOString().slice(0, 10);
      db.run("DELETE FROM appointment_slots WHERE doctor_id = ? AND slot_date >= ? AND status = 'Available'", [doctorId, todayStr]);

      const today = new Date();
      for (let offset = 0; offset < 14; offset++) {
        const dt = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
        const dow = new Date(`${dt}T00:00:00Z`).getUTCDay();
        const matching = normalizedSchedules.filter((s) => s.day_of_week === dow || (dow === 0 && s.day_of_week === 7));
        for (const sc of matching) {
          const [sh, sm] = sc.start_time.split(':').map(Number);
          const [eh, em] = sc.end_time.split(':').map(Number);
          let cur = sh * 60 + sm;
          const end = eh * 60 + em;
          const bStart = sc.break_start ? (() => { const [h, m] = sc.break_start.split(':').map(Number); return h * 60 + m; })() : null;
          const bEnd = sc.break_end ? (() => { const [h, m] = sc.break_end.split(':').map(Number); return h * 60 + m; })() : null;
          while (cur + sc.slot_minutes <= end) {
            const inBreak = bStart !== null && bEnd !== null && cur >= bStart && cur < bEnd;
            if (!inBreak) {
              const hh = String(Math.floor(cur / 60)).padStart(2, '0');
              const mm = String(cur % 60).padStart(2, '0');
              db.run(
                'INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)',
                [doctorId, doc.branch_id, dt, `${hh}:${mm}`, 'Available']
              );
            }
            cur += sc.slot_minutes;
          }
        }
      }
    }
  })();

  if (broker) {
    broker.publish('doctor:updated', { doctorId }, { roles: ['admin', 'receptionist', 'patient', 'doctor'] });
  }
}

export function createDoctorsRouter(db, authenticate, broker = null) {
  const router = express.Router();
  router.use(authenticate);
  router.use((req, _res, next) => {
    if (req.user.role === 'candidate') {
      return next(new AppError(403, 'Candidate accounts only have access to Careers & Applications.'));
    }
    return next();
  });

  router.get('/meta/filters', asyncHandler(async (_req, res) => {
    const branches = db.all('SELECT * FROM branches WHERE is_active = 1');
    const departments = db.all('SELECT * FROM departments WHERE is_active = 1 ORDER BY name');
    const specialties = db.all(
      `SELECT s.*, d.name as department_name,
              (SELECT COUNT(*) FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id
               WHERE dp.specialty_id = s.id AND dp.is_active = 1 AND dp.schedule_configured = 1 AND u.is_active = 1 AND u.account_status = 'Active') as doctor_count
       FROM specialties s LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.id ASC`
    );
    res.json({ branches, departments, specialties });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { q = '', specialtyId, departmentId, branchId, maxFee, dayOfWeek } = req.query;
    const where = ['dp.is_active = 1', 'dp.schedule_configured = 1', 'u.is_active = 1', "u.account_status = 'Active'"];
    const params = [];

    if (q.trim()) {
      where.push('(u.full_name LIKE ? OR s.name LIKE ? OR d.name LIKE ?)');
      const like = `%${q.trim()}%`;
      params.push(like, like, like);
    }
    if (specialtyId) { where.push('dp.specialty_id = ?'); params.push(Number(specialtyId)); }
    if (departmentId) { where.push('dp.department_id = ?'); params.push(Number(departmentId)); }
    if (branchId) { where.push('dp.branch_id = ?'); params.push(Number(branchId)); }
    if (maxFee) { where.push('dp.consultation_fee <= ?'); params.push(Number(maxFee)); }
    if (dayOfWeek !== undefined && dayOfWeek !== '') {
      where.push('EXISTS (SELECT 1 FROM doctor_schedules ds WHERE ds.doctor_id = dp.id AND ds.day_of_week = ? AND ds.is_active = 1)');
      params.push(Number(dayOfWeek));
    }

    const doctors = db.all(
      `SELECT dp.*, u.full_name, u.email, u.phone,
              s.name as specialty_name, d.name as department_name, b.name as branch_name
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       JOIN specialties s ON s.id = dp.specialty_id
       JOIN departments d ON d.id = dp.department_id
       JOIN branches b ON b.id = dp.branch_id
       WHERE ${where.join(' AND ')}
       ORDER BY u.full_name ASC`,
      params
    );

    for (const doc of doctors) {
      doc.schedules = db.all('SELECT day_of_week, start_time, end_time, slot_minutes, break_start, break_end FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY day_of_week', [doc.id]);
    }
    res.json({ doctors });
  }));

  router.get('/me/dashboard', requireRole('doctor'), asyncHandler(async (req, res) => {
    if (!req.user.doctor_id) throw new AppError(403, 'Doctor profile not linked.');
    const doctor = db.get(
      `SELECT dp.*, u.full_name, u.email, u.phone, u.user_code,
              s.name as specialty_name, s.description as specialty_description,
              d.name as department_name, b.name as branch_name
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       JOIN specialties s ON s.id = dp.specialty_id
       JOIN departments d ON d.id = dp.department_id
       JOIN branches b ON b.id = dp.branch_id
       WHERE dp.id = ?`,
      [req.user.doctor_id]
    );
    doctor.schedules = db.all('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 ORDER BY day_of_week', [doctor.id]);

    const patients = db.all(
      `SELECT DISTINCT p.id, p.patient_code, p.dob, p.gender, p.blood_group, pu.full_name, pu.email, pu.phone
       FROM patient_profiles p
       JOIN users pu ON pu.id = p.user_id
       WHERE p.id IN (
         SELECT patient_id FROM appointments WHERE doctor_id = ?
         UNION SELECT patient_id FROM admissions WHERE doctor_id = ?
         UNION SELECT patient_id FROM consultations WHERE doctor_id = ?
       )
       ORDER BY pu.full_name ASC`,
      [doctor.id, doctor.id, doctor.id]
    );

    const followUps = db.all(
      `SELECT f.*, pu.full_name as patient_name, p.patient_code
       FROM follow_ups f
       JOIN patient_profiles p ON p.id = f.patient_id
       JOIN users pu ON pu.id = p.user_id
       WHERE f.doctor_id = ?
       ORDER BY f.follow_up_date ASC`,
      [doctor.id]
    );

    const radiologyOrders = db.all(
      `SELECT ro.*, pu.full_name as patient_name, p.patient_code, rr.findings, rr.impression
       FROM radiology_orders ro
       JOIN patient_profiles p ON p.id = ro.patient_id
       JOIN users pu ON pu.id = p.user_id
       LEFT JOIN radiology_reports rr ON rr.order_id = ro.id
       WHERE ro.doctor_id = ?
       ORDER BY ro.id DESC LIMIT 50`,
      [doctor.id]
    );

    res.json({ doctor, patients, followUps, radiologyOrders });
  }));

  router.put('/me/schedule-setup', requireRole('doctor'), asyncHandler(async (req, res) => {
    if (!req.user.doctor_id) throw new AppError(403, 'Doctor profile not linked.');
    const hasDays = (Array.isArray(req.body.schedules) && req.body.schedules.length > 0) ||
      (Array.isArray(req.body.working_days) && req.body.working_days.length > 0);
    if (!hasDays) throw new AppError(400, 'Please select at least one working day for your schedule.');
    saveDoctorSchedulesAndSlots(db, broker, req.user.doctor_id, req.body);
    const updated = db.get('SELECT * FROM doctor_profiles WHERE id = ?', [req.user.doctor_id]);
    res.json({ ok: true, message: 'Doctor schedule setup completed. Your profile is now live in Find a Doctor.', doctor: updated });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const doc = db.get(
      `SELECT dp.*, u.full_name, u.email, u.phone,
              s.name as specialty_name, d.name as department_name, b.name as branch_name
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       JOIN specialties s ON s.id = dp.specialty_id
       JOIN departments d ON d.id = dp.department_id
       JOIN branches b ON b.id = dp.branch_id
       WHERE dp.id = ?`,
      [Number(req.params.id)]
    );
    if (!doc) throw new AppError(404, 'Doctor not found.');
    doc.schedules = db.all('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1', [doc.id]);
    res.json({ doctor: doc });
  }));

  router.get('/:id/slots', asyncHandler(async (req, res) => {
    const doctorId = Number(req.params.id);
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const doc = db.get('SELECT id, branch_id FROM doctor_profiles WHERE id = ?', [doctorId]);
    if (!doc) throw new AppError(404, 'Doctor not found.');

    let slots = db.all(
      `SELECT s.*,
              CASE WHEN EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.doctor_id = s.doctor_id AND a.appointment_date = s.slot_date
                  AND a.appointment_time = s.slot_time AND a.status NOT IN ('Cancelled','Rescheduled')
              ) THEN 'Booked' ELSE s.status END as computed_status
       FROM appointment_slots s
       WHERE s.doctor_id = ? AND s.slot_date = ?
       ORDER BY s.slot_time ASC`,
      [doctorId, date]
    );

    if (!slots.length) {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const schedules = db.all(
        `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1 AND (day_of_week = ? OR (? = 0 AND day_of_week = 7)) ORDER BY start_time ASC`,
        [doctorId, dow, dow]
      );
      for (const sc of schedules) {
        const [sh, sm] = String(sc.start_time || '09:00').split(':').map(Number);
        const [eh, em] = String(sc.end_time || '17:00').split(':').map(Number);
        const step = Math.max(10, Number(sc.slot_minutes || 30));
        let cur = sh * 60 + sm;
        const end = eh * 60 + em;
        const bStart = sc.break_start ? (() => { const [h, m] = sc.break_start.split(':').map(Number); return h * 60 + m; })() : null;
        const bEnd = sc.break_end ? (() => { const [h, m] = sc.break_end.split(':').map(Number); return h * 60 + m; })() : null;
        while (cur + step <= end) {
          const inBreak = bStart !== null && bEnd !== null && cur >= bStart && cur < bEnd;
          if (!inBreak) {
            const hh = String(Math.floor(cur / 60)).padStart(2, '0');
            const mm = String(cur % 60).padStart(2, '0');
            db.run(
              'INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)',
              [doctorId, doc.branch_id, date, `${hh}:${mm}`, 'Available']
            );
          }
          cur += step;
        }
      }
      slots = db.all(
        `SELECT *, status as computed_status FROM appointment_slots WHERE doctor_id = ? AND slot_date = ? ORDER BY slot_time ASC`,
        [doctorId, date]
      );
    }

    res.json({
      date,
      slots: slots.map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: s.slot_time, status: s.computed_status }))
    });
  }));

  router.put('/:id/schedules', requireRole('admin', 'doctor'), asyncHandler(async (req, res) => {
    const doctorId = Number(req.params.id);
    if (req.user.role === 'doctor' && req.user.doctor_id !== doctorId) {
      throw new AppError(403, 'Doctors may only update their own availability.');
    }
    saveDoctorSchedulesAndSlots(db, broker, doctorId, req.body);
    res.json({ message: 'Doctor schedule and availability updated.' });
  }));

  return router;
}
