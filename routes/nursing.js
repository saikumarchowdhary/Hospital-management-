import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';

export function createNursingRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);
  router.use(requireRole('nurse', 'doctor', 'admin'));

  router.get('/dashboard', asyncHandler(async (_req, res) => {
    const activeAdmissions = db.all(
      `SELECT a.id, a.admission_ref, a.patient_id, a.status, p.patient_code, pu.full_name as patient_name,
              b.bed_code, r.room_number, w.name as ward_name, du.full_name as doctor_name
       FROM admissions a
       JOIN patient_profiles p ON p.id = a.patient_id
       JOIN users pu ON pu.id = p.user_id
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN wards w ON w.id = r.ward_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id
       JOIN users du ON du.id = doc.user_id
       WHERE a.status IN ('Admitted','Active Care','Discharge Pending')
       ORDER BY a.id DESC`
    );
    const checkedInPatients = db.all(
      `SELECT a.id as appointment_id, a.appointment_ref, a.patient_id, p.patient_code, pu.full_name as patient_name,
              du.full_name as doctor_name, a.appointment_time
       FROM appointments a
       JOIN patient_profiles p ON p.id = a.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE a.status IN ('Checked In','In Consultation')`
    );
    const tasks = db.all(
      `SELECT nt.*, pu.full_name as patient_name, p.patient_code
       FROM nursing_tasks nt
       JOIN patient_profiles p ON p.id = nt.patient_id JOIN users pu ON pu.id = p.user_id
       ORDER BY nt.status ASC, nt.id DESC LIMIT 50`
    );
    const recentVitals = db.all(
      `SELECT pv.*, pu.full_name as patient_name, u.full_name as recorded_by_name
       FROM patient_vitals pv
       JOIN patient_profiles p ON p.id = pv.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN users u ON u.id = pv.recorded_by
       ORDER BY pv.id DESC LIMIT 30`
    );
    const notes = db.all(
      `SELECT nn.*, pu.full_name as patient_name, u.full_name as nurse_name
       FROM nursing_notes nn
       JOIN patient_profiles p ON p.id = nn.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN users u ON u.id = nn.nurse_id
       ORDER BY nn.id DESC LIMIT 30`
    );
    const doctorInstructions = db.all(
      `SELECT c.id, c.patient_id, pu.full_name as patient_name, p.patient_code, du.full_name as doctor_name,
              c.chief_complaint, c.treatment_plan, c.created_at
       FROM consultations c
       JOIN patient_profiles p ON p.id = c.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = c.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE COALESCE(c.treatment_plan, '') != ''
       ORDER BY c.id DESC LIMIT 25`
    );

    res.json({ activeAdmissions, checkedInPatients, tasks, recentVitals, notes, doctorInstructions });
  }));

  router.post(
    '/vitals',
    [
      body('patient_id').isInt().withMessage('Patient is required.'),
      body('blood_pressure').trim().notEmpty().withMessage('Blood pressure is required.'),
      body('pulse').isInt({ min: 20, max: 250 }).withMessage('Valid pulse is required.'),
      body('temperature').isFloat({ min: 30, max: 45 }).withMessage('Valid temperature (°C) is required.'),
      body('respiratory_rate').isInt({ min: 5, max: 60 }).withMessage('Valid respiratory rate is required.'),
      body('oxygen_saturation').isInt({ min: 50, max: 100 }).withMessage('Valid SpO2 (%) is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { patient_id, encounter_type = 'IPD', encounter_id = null, blood_pressure, pulse, temperature, respiratory_rate, oxygen_saturation, height_cm = null, weight_kg = null } = req.body;
      const pat = db.get('SELECT id FROM patient_profiles WHERE id = ?', [Number(patient_id)]);
      if (!pat) throw new AppError(404, 'Patient not found.');

      const info = db.run(
        `INSERT INTO patient_vitals (patient_id, encounter_type, encounter_id, blood_pressure, pulse, temperature, respiratory_rate, oxygen_saturation, height_cm, weight_kg, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pat.id, encounter_type, encounter_id, blood_pressure, Number(pulse), Number(temperature), Number(respiratory_rate), Number(oxygen_saturation), height_cm ? Number(height_cm) : null, weight_kg ? Number(weight_kg) : null, req.user.id]
      );
      logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'vitals.recorded', entityType: 'patient_vitals', entityId: info.lastInsertRowid });
      if (broker) {
        broker.publish('vitals:recorded', { patientId: pat.id }, { roles: ['doctor', 'nurse'] });
      }
      res.status(201).json({ vitals: db.get('SELECT * FROM patient_vitals WHERE id = ?', [info.lastInsertRowid]) });
    })
  );

  router.post(
    '/notes',
    [
      body('patient_id').isInt().withMessage('Patient is required.'),
      body('observation').trim().notEmpty().withMessage('Observation note is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { patient_id, admission_id = null, observation, medication_administered = null } = req.body;
      const info = db.run(
        `INSERT INTO nursing_notes (patient_id, admission_id, nurse_id, observation, medication_administered)
         VALUES (?, ?, ?, ?, ?)`,
        [Number(patient_id), admission_id ? Number(admission_id) : null, req.user.id, observation, medication_administered]
      );
      res.status(201).json({ note: db.get('SELECT * FROM nursing_notes WHERE id = ?', [info.lastInsertRowid]) });
    })
  );

  router.post('/tasks', asyncHandler(async (req, res) => {
    const { patient_id, admission_id = null, task_type, description, due_time = '' } = req.body;
    const info = db.run(
      `INSERT INTO nursing_tasks (patient_id, admission_id, assigned_nurse_id, task_type, description, due_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [Number(patient_id), admission_id ? Number(admission_id) : null, req.user.id, task_type, description, due_time]
    );
    res.status(201).json({ task: db.get('SELECT * FROM nursing_tasks WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/tasks/:id/complete', asyncHandler(async (req, res) => {
    db.run(
      `UPDATE nursing_tasks SET status = 'Completed', completed_by = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [req.user.id, Number(req.params.id)]
    );
    res.json({ task: db.get('SELECT * FROM nursing_tasks WHERE id = ?', [Number(req.params.id)]) });
  }));

  return router;
}
