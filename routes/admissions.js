import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { allocateBedTx, createAdmissionTx, dischargePatientTx, transferBedTx } from '../services/admissions.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createAdmissionsRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/', requirePermission('admissions.manage', 'patients.read_all'), asyncHandler(async (_req, res) => {
    const admissions = db.all(
      `SELECT a.*, pu.full_name as patient_name, p.patient_code,
              du.full_name as doctor_name, d.name as department_name,
              b.bed_code, r.room_number, w.name as ward_name
       FROM admissions a
       JOIN patient_profiles p ON p.id = a.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id JOIN users du ON du.id = doc.user_id
       JOIN departments d ON d.id = a.department_id
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN wards w ON w.id = r.ward_id
       ORDER BY a.id DESC`
    );
    res.json({ admissions });
  }));

  router.post(
    '/',
    requirePermission('admissions.manage'),
    [
      body('patient_id').isInt().withMessage('Patient is required.'),
      body('department_id').isInt().withMessage('Department is required.'),
      body('doctor_id').isInt().withMessage('Attending doctor is required.'),
      body('reason').trim().notEmpty().withMessage('Admission reason is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const admission = createAdmissionTx(db, broker, {
        patientId: Number(req.body.patient_id),
        departmentId: Number(req.body.department_id),
        doctorId: Number(req.body.doctor_id),
        admissionType: req.body.admission_type || 'Elective',
        reason: req.body.reason,
        actor: req.user
      });
      res.status(201).json({ admission });
    })
  );

  router.patch('/:id/status', requirePermission('admissions.manage'), asyncHandler(async (req, res) => {
    const adm = db.get('SELECT * FROM admissions WHERE id = ?', [Number(req.params.id)]);
    if (!adm) throw new AppError(404, 'Admission not found.');
    const { status, notes } = req.body;
    db.transaction(() => {
      db.run('UPDATE admissions SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, adm.id]);
      validateAndRecordTransition(db, broker, {
        entityType: 'admission',
        entityId: adm.id,
        fromStatus: adm.status,
        toStatus: status,
        actor: req.user,
        notes
      });
    })();
    res.json({ admission: db.get('SELECT * FROM admissions WHERE id = ?', [adm.id]) });
  }));

  router.post('/:id/allocate-bed', requirePermission('admissions.manage'), asyncHandler(async (req, res) => {
    const admission = allocateBedTx(db, broker, {
      admissionId: Number(req.params.id),
      bedId: Number(req.body.bed_id),
      actor: req.user
    });
    res.json({ admission });
  }));

  router.post(
    '/:id/discharge',
    requirePermission('admissions.manage'),
    [body('summary').trim().notEmpty().withMessage('Discharge summary is required.')],
    validateRequest,
    asyncHandler(async (req, res) => {
      const result = dischargePatientTx(db, broker, {
        admissionId: Number(req.params.id),
        summary: req.body.summary,
        followUpInstructions: req.body.follow_up_instructions || '',
        checklist: req.body.checklist || { medsReviewed: true, billingCleared: true },
        actor: req.user
      });
      res.json(result);
    })
  );

  router.get('/transfers', requirePermission('admissions.manage', 'patients.read_all'), asyncHandler(async (_req, res) => {
    const transfers = db.all(
      `SELECT bt.*, pu.full_name as patient_name, fb.bed_code as from_bed_code, tb.bed_code as to_bed_code,
              u.full_name as actor_name
       FROM bed_transfers bt
       JOIN patient_profiles p ON p.id = bt.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN beds fb ON fb.id = bt.from_bed_id
       JOIN beds tb ON tb.id = bt.to_bed_id
       JOIN users u ON u.id = bt.transferred_by
       ORDER BY bt.id DESC LIMIT 100`
    );
    res.json({ transfers });
  }));

  router.post(
    '/transfer',
    requirePermission('admissions.manage'),
    [
      body('from_bed_id').isInt().withMessage('Origin bed is required.'),
      body('to_bed_id').isInt().withMessage('Destination bed is required.'),
      body('reason').trim().notEmpty().withMessage('Reason for transfer is mandatory.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const result = transferBedTx(db, broker, {
        fromBedId: Number(req.body.from_bed_id),
        toBedId: Number(req.body.to_bed_id),
        reason: req.body.reason,
        patientId: req.body.patient_id ? Number(req.body.patient_id) : null,
        releaseStatus: req.body.release_status || 'Cleaning',
        actor: req.user
      });
      res.status(201).json(result);
    })
  );

  return router;
}
