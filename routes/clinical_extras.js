import { AppError, asyncHandler } from '../middleware/errors.js';
import { canAccessClinicalRecord, requireRole } from '../middleware/roles.js';
import { createNotification } from '../services/notifications.js';

export function registerClinicalExtras(router, db, broker) {
  router.post('/notes', requireRole('doctor', 'nurse'), asyncHandler(async (req, res) => {
    const { patient_id, note_type = 'Progress', content } = req.body;
    const pid = Number(patient_id);
    if (!pid || !content || !String(content).trim()) {
      throw new AppError(400, 'Patient ID and note content are required.');
    }
    if (!canAccessClinicalRecord(db, req.user, pid)) {
      throw new AppError(403, 'Not authorized to add clinical notes for this patient.');
    }
    const info = db.run(
      'INSERT INTO clinical_notes (patient_id, author_id, note_type, content) VALUES (?, ?, ?, ?)',
      [pid, req.user.id, note_type, String(content).trim()]
    );
    res.status(201).json({
      note: db.get(
        `SELECT cn.*, u.full_name as author_name FROM clinical_notes cn JOIN users u ON u.id = cn.author_id WHERE cn.id = ?`,
        [info.lastInsertRowid]
      )
    });
  }));

  router.get('/follow-ups', asyncHandler(async (req, res) => {
    let rows;
    if (req.user.role === 'patient') {
      rows = db.all(
        `SELECT f.*, du.full_name as doctor_name, pu.full_name as patient_name, p.patient_code
         FROM follow_ups f
         JOIN doctor_profiles doc ON doc.id = f.doctor_id JOIN users du ON du.id = doc.user_id
         JOIN patient_profiles p ON p.id = f.patient_id JOIN users pu ON pu.id = p.user_id
         WHERE f.patient_id = ? ORDER BY f.follow_up_date ASC`,
        [req.user.patient_id]
      );
    } else if (req.user.role === 'doctor') {
      rows = db.all(
        `SELECT f.*, du.full_name as doctor_name, pu.full_name as patient_name, p.patient_code
         FROM follow_ups f
         JOIN doctor_profiles doc ON doc.id = f.doctor_id JOIN users du ON du.id = doc.user_id
         JOIN patient_profiles p ON p.id = f.patient_id JOIN users pu ON pu.id = p.user_id
         WHERE f.doctor_id = ? ORDER BY f.follow_up_date ASC`,
        [req.user.doctor_id]
      );
    } else if (['admin', 'case_manager', 'nurse', 'receptionist'].includes(req.user.role)) {
      rows = db.all(
        `SELECT f.*, du.full_name as doctor_name, pu.full_name as patient_name, p.patient_code
         FROM follow_ups f
         JOIN doctor_profiles doc ON doc.id = f.doctor_id JOIN users du ON du.id = doc.user_id
         JOIN patient_profiles p ON p.id = f.patient_id JOIN users pu ON pu.id = p.user_id
         ORDER BY f.follow_up_date ASC LIMIT 100`
      );
    } else {
      throw new AppError(403, 'Access denied to follow-up schedule.');
    }
    res.json({ followUps: rows });
  }));

  router.post('/follow-ups', requireRole('doctor', 'case_manager', 'admin'), asyncHandler(async (req, res) => {
    const { patient_id, doctor_id, follow_up_date, notes = '' } = req.body;
    const pid = Number(patient_id);
    const did = Number(doctor_id || req.user.doctor_id);
    if (!pid || !did || !follow_up_date) {
      throw new AppError(400, 'Patient, doctor, and follow-up date are required.');
    }
    let cons = db.get('SELECT id FROM consultations WHERE patient_id = ? ORDER BY id DESC LIMIT 1', [pid]);
    if (!cons) {
      const cInfo = db.run(
        `INSERT INTO consultations (patient_id, doctor_id, chief_complaint, treatment_plan, created_by)
         VALUES (?, ?, 'Follow-Up Care Plan', ?, ?)`,
        [pid, did, notes || 'Follow-up scheduled', req.user.id]
      );
      cons = { id: cInfo.lastInsertRowid };
    }
    const info = db.run(
      'INSERT INTO follow_ups (consultation_id, patient_id, doctor_id, follow_up_date, notes) VALUES (?, ?, ?, ?, ?)',
      [cons.id, pid, did, follow_up_date, notes]
    );
    const pat = db.get('SELECT user_id FROM patient_profiles WHERE id = ?', [pid]);
    if (pat) {
      createNotification(db, broker, {
        userId: pat.user_id,
        roles: ['case_manager'],
        title: 'Follow-Up Scheduled',
        message: `Follow-up scheduled for ${follow_up_date}.`,
        eventType: 'followup:scheduled'
      });
    }
    res.status(201).json({ followUp: db.get('SELECT * FROM follow_ups WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/follow-ups/:id', requireRole('doctor', 'case_manager', 'admin', 'receptionist'), asyncHandler(async (req, res) => {
    const { status = 'Completed', follow_up_date, notes } = req.body;
    db.run(
      `UPDATE follow_ups SET status = ?, follow_up_date = COALESCE(?, follow_up_date), notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`,
      [status, follow_up_date || null, notes || null, Number(req.params.id)]
    );
    res.json({ followUp: db.get('SELECT * FROM follow_ups WHERE id = ?', [Number(req.params.id)]) });
  }));
}
