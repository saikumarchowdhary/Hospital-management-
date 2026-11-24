import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';

export function createDoctorsRouter(db, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/meta/filters', asyncHandler(async (_req, res) => {
    const branches = db.all('SELECT * FROM branches WHERE is_active = 1');
    const departments = db.all('SELECT * FROM departments WHERE is_active = 1 ORDER BY name');
    const specialties = db.all(
      `SELECT s.*, d.name as department_name,
              (SELECT COUNT(*) FROM doctor_profiles dp WHERE dp.specialty_id = s.id AND dp.is_active = 1) as doctor_count
       FROM specialties s LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.id ASC`
    );
    res.json({ branches, departments, specialties });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { q = '', specialtyId, departmentId, branchId, maxFee, dayOfWeek } = req.query;
    const where = ['dp.is_active = 1'];
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
      doc.schedules = db.all('SELECT day_of_week, start_time, end_time FROM doctor_schedules WHERE doctor_id = ? AND is_active = 1', [doc.id]);
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
      const defaults = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00'];
      for (const t of defaults) {
        db.run('INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)',
          [doctorId, doc.branch_id, date, t, 'Available']);
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
    const { schedules = [], consultation_fee, availability_status } = req.body;
    if (consultation_fee !== undefined) {
      db.run('UPDATE doctor_profiles SET consultation_fee = ?, updated_at = datetime(\'now\') WHERE id = ?', [Number(consultation_fee), doctorId]);
    }
    if (availability_status) {
      const allowed = ['Available', 'Busy', 'On Leave', 'In Surgery'];
      if (!allowed.includes(availability_status)) throw new AppError(400, 'Invalid availability status.');
      db.run('UPDATE doctor_profiles SET availability_status = ?, updated_at = datetime(\'now\') WHERE id = ?', [availability_status, doctorId]);
    }
    if (Array.isArray(schedules) && schedules.length) {
      db.run('DELETE FROM doctor_schedules WHERE doctor_id = ?', [doctorId]);
      for (const sc of schedules) {
        db.run(
          'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, ?)',
          [doctorId, Number(sc.day_of_week), sc.start_time, sc.end_time, Number(sc.slot_minutes || 30)]
        );
      }
    }
    res.json({ message: 'Doctor schedule and availability updated.' });
  }));

  return router;
}
