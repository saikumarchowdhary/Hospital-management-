import bcrypt from 'bcryptjs';
import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { canAccessClinicalRecord, requirePermission } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

export function createPatientsRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  // Patient Mobile Home Dashboard
  router.get('/me/dashboard', asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient' || !req.user.patient_id) {
      throw new AppError(403, 'Patient profile required.');
    }
    const pid = req.user.patient_id;
    const profile = db.get(
      `SELECT p.*, u.full_name, u.email, u.phone FROM patient_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
      [pid]
    );
    const upcomingAppointment = db.get(
      `SELECT a.*, du.full_name as doctor_name, s.name as specialty_name, b.name as branch_name
       FROM appointments a
       JOIN doctor_profiles doc ON doc.id = a.doctor_id
       JOIN users du ON du.id = doc.user_id
       JOIN specialties s ON s.id = doc.specialty_id
       JOIN branches b ON b.id = a.branch_id
       WHERE a.patient_id = ? AND a.status IN ('Booked','Confirmed','Checked In','Rescheduled')
       ORDER BY a.appointment_date ASC, a.appointment_time ASC LIMIT 1`,
      [pid]
    );
    const lastConsultation = db.get(
      `SELECT c.*, du.full_name as doctor_name FROM consultations c
       JOIN doctor_profiles doc ON doc.id = c.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE c.patient_id = ? ORDER BY c.created_at DESC LIMIT 1`,
      [pid]
    );
    const pendingPayments = db.get(
      `SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE patient_id = ? AND balance_due > 0 AND status != 'Cancelled'`,
      [pid]
    );
    const releasedLabs = db.get(
      `SELECT COUNT(*) as count FROM lab_orders WHERE patient_id = ? AND status = 'Released'`,
      [pid]
    );
    const activeRx = db.get(`SELECT COUNT(*) as count FROM prescriptions WHERE patient_id = ?`, [pid]);
    const releasedRad = db.get(`SELECT COUNT(*) as count FROM radiology_orders WHERE patient_id = ? AND status = 'Released'`, [pid]);
    const dischargeCnt = db.get(`SELECT COUNT(*) as count FROM discharge_records WHERE patient_id = ?`, [pid]);
    const docsCnt = db.get(`SELECT COUNT(*) as count FROM documents WHERE patient_id = ?`, [pid]);
    const histCnt = db.get(`SELECT COUNT(*) as count FROM medical_history WHERE patient_id = ?`, [pid]);
    const followUps = db.all(
      `SELECT f.*, du.full_name as doctor_name FROM follow_ups f
       JOIN doctor_profiles doc ON doc.id = f.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE f.patient_id = ? ORDER BY f.follow_up_date ASC LIMIT 5`,
      [pid]
    );
    const announcements = db.all(
      `SELECT id, title, body, priority, category, start_date, expiry_date FROM announcements
       WHERE status = 'Published' AND date(start_date) <= date('now') AND date(expiry_date) >= date('now')
       ORDER BY id DESC LIMIT 5`
    );
    const campaigns = db.all(
      `SELECT id, name, description, destination_url, offer_terms, banner_attachment_id, is_sponsored FROM campaigns
       WHERE status = 'Published' AND audience IN ('Patients','All') AND date(start_date) <= date('now') AND date(end_date) >= date('now')
       ORDER BY id DESC LIMIT 3`
    );
    const emergencies = db.all('SELECT * FROM emergency_requests WHERE patient_id = ? ORDER BY id DESC LIMIT 3', [pid]);

    res.json({
      profile,
      upcomingAppointment,
      lastConsultation,
      pendingPayments,
      releasedLabsCount: releasedLabs.count,
      releasedRadiologyCount: releasedRad.count,
      activeRxCount: activeRx.count,
      dischargeCount: dischargeCnt.count,
      documentsCount: docsCnt.count,
      historyCount: histCnt.count,
      followUps,
      announcements,
      campaigns,
      emergencies
    });
  }));

  router.get('/me/documents', asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient' || !req.user.patient_id) throw new AppError(403, 'Patient profile required.');
    const documents = db.all(
      `SELECT d.*, a.original_name, a.mime_type, a.size_bytes
       FROM documents d LEFT JOIN attachments a ON a.id = d.attachment_id
       WHERE d.patient_id = ? ORDER BY d.id DESC`,
      [req.user.patient_id]
    );
    res.json({ documents });
  }));

  router.post('/me/documents', upload.single('document'), asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient' || !req.user.patient_id) throw new AppError(403, 'Patient profile required.');
    if (!req.file) throw new AppError(400, 'Please select a valid PDF, image, or text document.');
    const { title, category = 'External Medical Report' } = req.body;
    if (!title || !String(title).trim()) throw new AppError(400, 'Document title is required.');

    const doc = db.transaction(() => {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'patient_documents')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      const dInfo = db.run(
        `INSERT INTO documents (patient_id, title, category, source, status, attachment_id, uploaded_by)
         VALUES (?, ?, ?, 'Patient Upload', 'Released', ?, ?)`,
        [req.user.patient_id, String(title).trim(), category, aInfo.lastInsertRowid, req.user.id]
      );
      logAudit(db, { actorUserId: req.user.id, actorRole: 'patient', action: 'patient.document_uploaded', entityType: 'document', entityId: dInfo.lastInsertRowid });
      return db.get(
        `SELECT d.*, a.original_name, a.mime_type, a.size_bytes FROM documents d LEFT JOIN attachments a ON a.id = d.attachment_id WHERE d.id = ?`,
        [dInfo.lastInsertRowid]
      );
    })();
    res.status(201).json({ document: doc });
  }));

  // Update own profile
  router.put('/me/profile', asyncHandler(async (req, res) => {
    const { full_name, phone, address, blood_group, emergency_contact_name, emergency_contact_phone } = req.body;
    if (full_name) db.run('UPDATE users SET full_name = ?, phone = COALESCE(?, phone), updated_at = datetime(\'now\') WHERE id = ?', [full_name, phone || null, req.user.id]);
    if (req.user.patient_id) {
      db.run(
        `UPDATE patient_profiles SET address = COALESCE(?, address), blood_group = COALESCE(?, blood_group),
         emergency_contact_name = COALESCE(?, emergency_contact_name),
         emergency_contact_phone = COALESCE(?, emergency_contact_phone),
         profile_completion = 100, updated_at = datetime('now') WHERE id = ?`,
        [address || null, blood_group || null, emergency_contact_name || null, emergency_contact_phone || null, req.user.patient_id]
      );
    }
    res.json({ message: 'Profile updated.' });
  }));

  // Patient Search (Staff)
  router.get('/', requirePermission('patients.read_all'), asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = db.all(
      `SELECT p.id, p.patient_code, p.dob, p.gender, p.blood_group, p.address,
              u.id as user_id, u.full_name, u.email, u.phone, u.is_active, p.created_at
       FROM patient_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE u.full_name LIKE ? OR p.patient_code LIKE ? OR u.email LIKE ? OR COALESCE(u.phone,'') LIKE ?
       ORDER BY p.id DESC LIMIT 100`,
      [like, like, like, like]
    );
    res.json({ patients: rows });
  }));

  // Staff registers patient with duplicate detection
  router.post(
    '/',
    requirePermission('patients.write'),
    [
      body('full_name').trim().notEmpty().withMessage('Full name is required.'),
      body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
      body('phone').trim().notEmpty().withMessage('Phone number is required.'),
      body('dob').notEmpty().withMessage('Date of birth is required.'),
      body('gender').notEmpty().withMessage('Gender is required.'),
      body('address').trim().notEmpty().withMessage('Address is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { full_name, email, phone, dob, gender, blood_group, address, national_id } = req.body;
      const dup = db.get(
        `SELECT u.id FROM users u LEFT JOIN patient_profiles p ON p.user_id = u.id
         WHERE lower(u.email) = lower(?) OR u.phone = ? OR (? IS NOT NULL AND p.national_id = ?)`,
        [email, phone, national_id || null, national_id || null]
      );
      if (dup) throw new AppError(409, 'Duplicate patient detected by email, phone, or national ID.');

      const patRole = db.get('SELECT id FROM roles WHERE code = ?', ['patient']);
      const uCode = `PAT-${String(Date.now()).slice(-6)}`;
      const pCode = `MRN-${String(Date.now()).slice(-6)}`;
      const tempPass = bcrypt.hashSync(`Patient@${String(Date.now()).slice(-4)}`, 10);

      const patId = db.transaction(() => {
        const uInfo = db.run(
          'INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uCode, email, tempPass, full_name, phone, patRole.id, req.user.branch_id || 1]
        );
        const pInfo = db.run(
          `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, blood_group, address, national_id, profile_completion)
           VALUES (?, ?, ?, ?, ?, ?, ?, 85)`,
          [uInfo.lastInsertRowid, pCode, dob, gender, blood_group || null, address, national_id || null]
        );
        logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'patient.created', entityType: 'patient', entityId: pInfo.lastInsertRowid });
        return pInfo.lastInsertRowid;
      })();

      const patient = db.get(
        'SELECT p.*, u.full_name, u.email, u.phone FROM patient_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?',
        [patId]
      );
      res.status(201).json({ patient });
    })
  );

  // Patient detail (demographics + allowed history)
  router.get('/:id', asyncHandler(async (req, res) => {
    const pid = Number(req.params.id);
    if (req.user.role === 'patient' && req.user.patient_id !== pid) {
      throw new AppError(403, 'Access denied.');
    }
    if (req.user.role !== 'patient' && !req.user.permissions.includes('patients.read_all')) {
      throw new AppError(403, 'Insufficient permissions.');
    }

    const patient = db.get(
      `SELECT p.*, u.full_name, u.email, u.phone, u.is_active
       FROM patient_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
      [pid]
    );
    if (!patient) throw new AppError(404, 'Patient not found.');

    const appointments = db.all(
      `SELECT a.*, du.full_name as doctor_name, d.name as department_name
       FROM appointments a
       JOIN doctor_profiles doc ON doc.id = a.doctor_id JOIN users du ON du.id = doc.user_id
       JOIN departments d ON d.id = a.department_id
       WHERE a.patient_id = ? ORDER BY a.appointment_date DESC`,
      [pid]
    );

    const canClinical = canAccessClinicalRecord(db, req.user, pid);
    const clinical = canClinical
      ? {
          vitals: db.all('SELECT * FROM patient_vitals WHERE patient_id = ? ORDER BY created_at DESC LIMIT 10', [pid]),
          allergies: db.all('SELECT * FROM allergies WHERE patient_id = ?', [pid]),
          history: db.all('SELECT * FROM medical_history WHERE patient_id = ?', [pid]),
          diagnoses: db.all('SELECT * FROM diagnoses WHERE patient_id = ? ORDER BY created_at DESC', [pid]),
          consultations: db.all('SELECT * FROM consultations WHERE patient_id = ? ORDER BY created_at DESC', [pid])
        }
      : null;

    res.json({ patient, appointments, clinicalRestricted: !canClinical, clinical });
  }));

  // Emergency SOS Request (Patient or Staff)
  router.post(
    '/emergency/sos',
    [
      body('emergency_type').trim().notEmpty().withMessage('Emergency type is required.'),
      body('contact_phone').trim().notEmpty().withMessage('Contact number is required.'),
      body('location_text').trim().notEmpty().withMessage('Location is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { emergency_type, contact_phone, location_text, notes = '' } = req.body;
      const ref = `SOS-${Date.now().toString().slice(-6)}`;
      const info = db.run(
        `INSERT INTO emergency_requests (emergency_ref, patient_id, patient_name, contact_phone, emergency_type, location_text, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Received', ?)`,
        [ref, req.user.patient_id || null, req.body.patient_name || req.user.full_name, contact_phone, emergency_type, location_text, notes, req.user.id]
      );
      createNotification(db, broker, {
        roles: ['admin', 'doctor', 'nurse', 'receptionist', 'case_manager'],
        title: `EMERGENCY SOS: ${emergency_type}`,
        message: `${req.body.patient_name || req.user.full_name} at ${location_text} (${ref}).`,
        category: 'danger',
        eventType: 'emergency:created'
      });
      res.status(201).json({ emergency: db.get('SELECT * FROM emergency_requests WHERE id = ?', [info.lastInsertRowid]) });
    })
  );

  router.get('/emergency/list', requirePermission('patients.read_all'), asyncHandler(async (_req, res) => {
    const rows = db.all('SELECT * FROM emergency_requests ORDER BY id DESC LIMIT 50');
    res.json({ emergencies: rows });
  }));

  router.patch('/emergency/:id', requirePermission('patients.read_all'), asyncHandler(async (req, res) => {
    const { status } = req.body;
    db.run('UPDATE emergency_requests SET status = ?, assigned_to = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.user.id, Number(req.params.id)]);
    res.json({ emergency: db.get('SELECT * FROM emergency_requests WHERE id = ?', [Number(req.params.id)]) });
  }));

  return router;
}
