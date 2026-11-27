import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { canAccessClinicalRecord, requireRole } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createInvoiceTx } from '../services/billing.js';
import { createNotification } from '../services/notifications.js';
import { registerClinicalExtras } from './clinical_extras.js';

export function createClinicalRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  // Patient or authorized clinical staff views full medical records
  router.get('/records/:patientId', asyncHandler(async (req, res) => {
    const pid = Number(req.params.patientId);
    if (!canAccessClinicalRecord(db, req.user, pid)) {
      throw new AppError(403, 'You are not authorized to access this patient\'s clinical records.');
    }
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'clinical_records.viewed', entityType: 'patient', entityId: pid });

    const consultations = db.all(
      `SELECT c.*, du.full_name as doctor_name, d.name as department_name
       FROM consultations c
       JOIN doctor_profiles doc ON doc.id = c.doctor_id
       JOIN users du ON du.id = doc.user_id
       JOIN departments d ON d.id = doc.department_id
       WHERE c.patient_id = ? ORDER BY c.created_at DESC`,
      [pid]
    );
    const diagnoses = db.all('SELECT * FROM diagnoses WHERE patient_id = ? ORDER BY created_at DESC', [pid]);
    const prescriptions = db.all(
      `SELECT r.*, du.full_name as doctor_name FROM prescriptions r
       JOIN doctor_profiles doc ON doc.id = r.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE r.patient_id = ? ORDER BY r.created_at DESC`,
      [pid]
    );
    for (const rx of prescriptions) {
      rx.items = db.all('SELECT * FROM prescription_items WHERE prescription_id = ?', [rx.id]);
    }

    // Only released reports for patients!
    const labWhere = req.user.role === 'patient' ? "AND lo.status = 'Released'" : '';
    const labReports = db.all(
      `SELECT lo.id, lo.order_ref, lo.status, lo.created_at, lt.name as test_name,
              lr.result_value, lr.unit, lr.reference_range, lr.abnormal_flag, lr.notes, lr.released_at, lr.attachment_id, lr.is_sample_demo
       FROM lab_orders lo
       JOIN lab_tests lt ON lt.id = lo.test_id
       LEFT JOIN lab_results lr ON lr.order_id = lo.id
       WHERE lo.patient_id = ? ${labWhere}
       ORDER BY lo.created_at DESC`,
      [pid]
    );

    const radWhere = req.user.role === 'patient' ? "AND ro.status = 'Released'" : '';
    const radiologyReports = db.all(
      `SELECT ro.id, ro.order_ref, ro.modality, ro.study_name, ro.status, ro.created_at,
              rr.findings, rr.impression, rr.released_at, rr.attachment_id
       FROM radiology_orders ro
       LEFT JOIN radiology_reports rr ON rr.order_id = ro.id
       WHERE ro.patient_id = ? ${radWhere}
       ORDER BY ro.created_at DESC`,
      [pid]
    );

    const discharges = db.all(
      `SELECT dr.*, a.admission_ref FROM discharge_records dr
       JOIN admissions a ON a.id = dr.admission_id WHERE dr.patient_id = ? ORDER BY dr.discharged_at DESC`,
      [pid]
    );
    const vitals = db.all(
      `SELECT pv.*, u.full_name as recorded_by_name FROM patient_vitals pv
       LEFT JOIN users u ON u.id = pv.recorded_by WHERE pv.patient_id = ? ORDER BY pv.created_at DESC, pv.id DESC LIMIT 60`,
      [pid]
    );
    const allergies = db.all('SELECT * FROM allergies WHERE patient_id = ?', [pid]);
    const medicalHistory = db.all('SELECT * FROM medical_history WHERE patient_id = ?', [pid]);
    const clinicalNotes = db.all(
      `SELECT cn.*, u.full_name as author_name FROM clinical_notes cn
       JOIN users u ON u.id = cn.author_id WHERE cn.patient_id = ? ORDER BY cn.created_at DESC LIMIT 30`,
      [pid]
    );
    const followUps = db.all(
      `SELECT f.*, du.full_name as doctor_name FROM follow_ups f
       JOIN doctor_profiles doc ON doc.id = f.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE f.patient_id = ? ORDER BY f.follow_up_date DESC`,
      [pid]
    );

    res.json({ consultations, diagnoses, prescriptions, labReports, radiologyReports, discharges, vitals, allergies, medicalHistory, clinicalNotes, followUps });
  }));

  // Doctor Consultation Workspace Submission (atomic across consultation, diagnosis, rx, lab, rad, invoice)
  router.post(
    '/consultations',
    requireRole('doctor'),
    [
      body('patient_id').isInt().withMessage('Patient ID is required.'),
      body('chief_complaint').trim().notEmpty().withMessage('Chief complaint is required.'),
      body('diagnosis_text').trim().notEmpty().withMessage('Diagnosis is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      if (!req.user.doctor_id) throw new AppError(403, 'Doctor profile not linked.');
      const {
        appointment_id = null,
        patient_id,
        chief_complaint,
        examination_notes = '',
        treatment_plan = '',
        diagnosis_text,
        icd_code = '',
        severity = 'Moderate',
        prescription_items = [],
        lab_test_ids = [],
        radiology_request = null,
        follow_up_date = null
      } = req.body;

      const result = db.transaction(() => {
        const pat = db.get('SELECT id, user_id FROM patient_profiles WHERE id = ?', [Number(patient_id)]);
        if (!pat) throw new AppError(404, 'Patient not found.');

        const cInfo = db.run(
          `INSERT INTO consultations (appointment_id, patient_id, doctor_id, chief_complaint, examination_notes, treatment_plan, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [appointment_id ? Number(appointment_id) : null, pat.id, req.user.doctor_id, chief_complaint, examination_notes, treatment_plan, req.user.id]
        );
        const consultationId = cInfo.lastInsertRowid;

        db.run(
          `INSERT INTO diagnoses (consultation_id, patient_id, icd_code, diagnosis_text, severity, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [consultationId, pat.id, icd_code, diagnosis_text, severity, req.user.id]
        );

        let rxId = null;
        if (Array.isArray(prescription_items) && prescription_items.length > 0) {
          const rxRef = `RX-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
          const rxInfo = db.run(
            `INSERT INTO prescriptions (prescription_ref, consultation_id, patient_id, doctor_id, status, notes, created_by)
             VALUES (?, ?, ?, ?, 'Requested', ?, ?)`,
            [rxRef, consultationId, pat.id, req.user.doctor_id, treatment_plan, req.user.id]
          );
          rxId = rxInfo.lastInsertRowid;
          for (const item of prescription_items) {
            db.run(
              `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration, quantity, instructions)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [rxId, item.medicine_id || null, item.medicine_name, item.dosage, item.frequency, item.duration, Number(item.quantity || 10), item.instructions || '']
            );
          }
          createNotification(db, broker, {
            userId: pat.user_id,
            roles: ['pharmacist'],
            title: 'New Prescription Issued',
            message: `Prescription ${rxRef} created by ${req.user.full_name}.`,
            eventType: 'prescription:created'
          });
        }

        const invoiceItems = [];
        const doc = db.get('SELECT consultation_fee, branch_id FROM doctor_profiles WHERE id = ?', [req.user.doctor_id]);
        invoiceItems.push({ category: 'Consultation', description: `Consultation with ${req.user.full_name}`, quantity: 1, unit_price: doc.consultation_fee });

        if (Array.isArray(lab_test_ids)) {
          for (const tid of lab_test_ids) {
            const test = db.get('SELECT * FROM lab_tests WHERE id = ?', [Number(tid)]);
            if (test) {
              const lRef = `LAB-${Date.now().toString().slice(-6)}-${test.id}`;
              db.run(
                `INSERT INTO lab_orders (order_ref, patient_id, doctor_id, branch_id, test_id, status, ordered_by)
                 VALUES (?, ?, ?, ?, ?, 'Ordered', ?)`,
                [lRef, pat.id, req.user.doctor_id, doc.branch_id, test.id, req.user.id]
              );
              invoiceItems.push({ category: 'Laboratory', description: test.name, quantity: 1, unit_price: test.price });
              createNotification(db, broker, {
                roles: ['lab_staff'],
                title: 'New Lab Order',
                message: `Order ${lRef} (${test.name}) ordered by ${req.user.full_name}.`,
                eventType: 'lab:ordered'
              });
            }
          }
        }

        if (radiology_request && radiology_request.study_name) {
          const rRef = `RAD-${Date.now().toString().slice(-6)}`;
          db.run(
            `INSERT INTO radiology_orders (order_ref, patient_id, doctor_id, modality, study_name, clinical_indication, status, ordered_by)
             VALUES (?, ?, ?, ?, ?, ?, 'Ordered', ?)`,
            [rRef, pat.id, req.user.doctor_id, radiology_request.modality || 'X-Ray', radiology_request.study_name, diagnosis_text, req.user.id]
          );
          invoiceItems.push({ category: 'Radiology', description: `${radiology_request.modality || 'X-Ray'}: ${radiology_request.study_name}`, quantity: 1, unit_price: 85 });
          createNotification(db, broker, {
            roles: ['radiologist', 'lab_staff'],
            title: 'New Radiology Order',
            message: `${radiology_request.modality || 'X-Ray'}: ${radiology_request.study_name} (${rRef}) ordered by ${req.user.full_name}.`,
            eventType: 'radiology:ordered'
          });
        }
        if (treatment_plan && broker) {
          broker.publish('treatment:updated', { patientId: pat.id, title: 'Care Plan Updated', message: `New clinical instructions from ${req.user.full_name}.` }, { roles: ['nurse'], userId: pat.user_id });
        }

        if (follow_up_date) {
          db.run(
            `INSERT INTO follow_ups (consultation_id, patient_id, doctor_id, follow_up_date, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [consultationId, pat.id, req.user.doctor_id, follow_up_date, treatment_plan]
          );
        }

        if (appointment_id) {
          db.run('UPDATE appointments SET status = \'Completed\', updated_at = datetime(\'now\') WHERE id = ?', [Number(appointment_id)]);
        }

        const invoice = createInvoiceTx(db, broker, {
          patientId: pat.id,
          branchId: doc.branch_id,
          description: `Consultation & Orders (${req.user.full_name})`,
          items: invoiceItems,
          actor: req.user
        });

        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: 'consultation.created',
          entityType: 'consultation',
          entityId: consultationId
        });

        return { consultationId, rxId, invoice };
      })();

      res.status(201).json(result);
    })
  );

  router.post('/allergies', requireRole('doctor', 'nurse'), asyncHandler(async (req, res) => {
    const { patient_id, allergen, reaction, severity = 'Moderate' } = req.body;
    const info = db.run(
      'INSERT INTO allergies (patient_id, allergen, reaction, severity, recorded_by) VALUES (?, ?, ?, ?, ?)',
      [Number(patient_id), allergen, reaction, severity, req.user.id]
    );
    res.status(201).json({ allergy: db.get('SELECT * FROM allergies WHERE id = ?', [info.lastInsertRowid]) });
  }));

  registerClinicalExtras(router, db, broker);

  return router;
}
