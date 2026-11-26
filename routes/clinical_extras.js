import crypto from 'node:crypto';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { canAccessClinicalRecord, requireRole } from '../middleware/roles.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

function parseJsonSafe(raw, fallback) {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function calcAgeFromDob(dob) {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const m = now.getMonth() - parsed.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < parsed.getDate())) age--;
  return age >= 0 && age <= 130 ? age : null;
}

export function hydratePrescriptionRow(db, row) {
  if (!row) return null;
  const dbItems = db.all('SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY id ASC', [row.id]);
  const parsedMeds = parseJsonSafe(row.medicines_json, null);
  const medicines = Array.isArray(parsedMeds) && parsedMeds.length > 0
    ? parsedMeds
    : dbItems.map((it) => ({
        name: it.medicine_name,
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        instructions: it.instructions || ''
      }));
  const testsRecommended = parseJsonSafe(row.tests_recommended_json, []);
  return {
    ...row,
    patient_age: calcAgeFromDob(row.patient_dob),
    medicines,
    items: dbItems,
    tests_recommended: Array.isArray(testsRecommended) ? testsRecommended : [],
    hospital: {
      name: process.env.HOSPITAL_NAME || row.branch_name || 'CareLine HMS',
      address: process.env.HOSPITAL_ADDRESS || row.branch_address || '100 Medical Center Pkwy, Metro City',
      phone: process.env.HOSPITAL_PHONE || row.branch_phone || '+1-555-0100'
    }
  };
}

export function registerClinicalExtras(router, db, broker) {
  router.get('/prescriptions', asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];
    const role = req.user.role;

    if (role === 'patient') {
      if (!req.user.patient_id) throw new AppError(403, 'Patient profile not linked.');
      where.push('r.patient_id = ?');
      params.push(req.user.patient_id);
    } else if (role === 'doctor') {
      if (!req.user.doctor_id) throw new AppError(403, 'Doctor profile not linked.');
      if (req.query.patient_id) {
        const pid = Number(req.query.patient_id);
        if (!canAccessClinicalRecord(db, req.user, pid)) {
          throw new AppError(403, 'Not authorized to view this patient\'s prescriptions.');
        }
        where.push('r.patient_id = ?');
        params.push(pid);
      } else {
        where.push('r.doctor_id = ?');
        params.push(req.user.doctor_id);
      }
    } else if (['admin', 'pharmacist', 'nurse'].includes(role)) {
      if (req.query.patient_id) {
        where.push('r.patient_id = ?');
        params.push(Number(req.query.patient_id));
      }
      if (req.query.doctor_id) {
        where.push('r.doctor_id = ?');
        params.push(Number(req.query.doctor_id));
      }
    } else {
      throw new AppError(403, 'Access denied to prescriptions.');
    }

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
       ORDER BY r.id DESC LIMIT 200`,
      params
    );
    res.json({ prescriptions: rows.map((row) => hydratePrescriptionRow(db, row)) });
  }));

  router.get('/prescriptions/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = db.get(
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
       WHERE r.id = ?`,
      [id]
    );
    if (!row) throw new AppError(404, 'Prescription not found.');
    if (req.user.role === 'patient') {
      if (row.patient_id !== req.user.patient_id) throw new AppError(403, 'Not authorized to view this prescription.');
    } else if (req.user.role === 'doctor') {
      if (row.doctor_id !== req.user.doctor_id && !canAccessClinicalRecord(db, req.user, row.patient_id)) {
        throw new AppError(403, 'Not authorized to view this prescription.');
      }
    } else if (!['admin', 'pharmacist', 'nurse'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to prescription.');
    }
    res.json({ prescription: hydratePrescriptionRow(db, row) });
  }));

  router.post('/prescriptions', requireRole('doctor'), asyncHandler(async (req, res) => {
    if (!req.user.doctor_id) throw new AppError(403, 'Doctor profile not linked.');
    const {
      patient_id,
      appointment_id = null,
      diagnosis = '',
      symptoms = '',
      medicines = [],
      tests_recommended = [],
      advice = '',
      notes = '',
      follow_up_date = null
    } = req.body;

    const pid = Number(patient_id);
    if (!pid) throw new AppError(400, 'Patient selection is required.');
    const cleanDiagnosis = String(diagnosis || '').trim();
    if (!cleanDiagnosis) throw new AppError(400, 'Diagnosis is required.');
    if (!Array.isArray(medicines) || medicines.length === 0) {
      throw new AppError(400, 'At least one medicine is required.');
    }

    const cleanMeds = medicines.map((m, idx) => {
      const name = String(m?.name || m?.medicine_name || '').trim();
      const dosage = String(m?.dosage || '').trim();
      const frequency = String(m?.frequency || '').trim();
      const duration = String(m?.duration || '').trim();
      const instructions = String(m?.instructions || '').trim();
      if (!name || !dosage || !frequency || !duration) {
        throw new AppError(400, `Medicine row #${idx + 1} must include name, dosage, frequency, and duration.`);
      }
      return { name, dosage, frequency, duration, instructions };
    });

    const cleanTests = Array.isArray(tests_recommended)
      ? tests_recommended.map((t) => String(t).trim()).filter(Boolean)
      : String(tests_recommended || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

    const rxId = db.transaction(() => {
      const pat = db.get('SELECT id, user_id FROM patient_profiles WHERE id = ?', [pid]);
      if (!pat) throw new AppError(404, 'Patient not found.');

      let resolvedApptId = null;
      if (appointment_id) {
        const appt = db.get('SELECT id, patient_id FROM appointments WHERE id = ?', [Number(appointment_id)]);
        if (!appt || appt.patient_id !== pat.id) {
          throw new AppError(400, 'Selected appointment does not belong to this patient.');
        }
        resolvedApptId = appt.id;
      }

      const rxRef = `RX-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}${crypto.randomInt(10, 99)}`;
      const combinedAdvice = String(advice || notes || '').trim();
      const info = db.run(
        `INSERT INTO prescriptions (
           prescription_ref, appointment_id, patient_id, doctor_id, status,
           diagnosis, symptoms, medicines_json, tests_recommended_json, advice, notes, follow_up_date, created_by
         ) VALUES (?, ?, ?, ?, 'Requested', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rxRef,
          resolvedApptId,
          pat.id,
          req.user.doctor_id,
          cleanDiagnosis,
          String(symptoms || '').trim() || null,
          JSON.stringify(cleanMeds),
          JSON.stringify(cleanTests),
          combinedAdvice || null,
          combinedAdvice || null,
          follow_up_date ? String(follow_up_date).trim() : null,
          req.user.id
        ]
      );
      const insertedId = info.lastInsertRowid;

      for (const m of cleanMeds) {
        const medMatch = db.get('SELECT id FROM medicines WHERE lower(name) = lower(?) LIMIT 1', [m.name]);
        db.run(
          `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration, quantity, instructions)
           VALUES (?, ?, ?, ?, ?, ?, 10, ?)`,
          [insertedId, medMatch?.id || null, m.name, m.dosage, m.frequency, m.duration, m.instructions]
        );
      }

      createNotification(db, broker, {
        userId: pat.user_id,
        roles: ['pharmacist'],
        title: 'New Prescription Issued',
        message: `Prescription ${rxRef} issued by ${req.user.full_name} for ${cleanDiagnosis}.`,
        eventType: 'prescription:created'
      });

      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'prescription.created',
        entityType: 'prescription',
        entityId: insertedId,
        details: { prescription_ref: rxRef, patient_id: pat.id, medicines_count: cleanMeds.length }
      });

      return insertedId;
    })();

    const created = db.get(
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
       WHERE r.id = ?`,
      [rxId]
    );
    res.status(201).json({ prescription: hydratePrescriptionRow(db, created) });
  }));

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
