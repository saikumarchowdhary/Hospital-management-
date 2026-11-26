import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { createNotification } from '../services/notifications.js';

export function createRadiologyRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/catalogue', asyncHandler(async (_req, res) => {
    res.json({
      catalogue: [
        { modality: 'X-Ray', study_name: 'Chest PA View', price: 65 },
        { modality: 'CT', study_name: 'CT Brain Non-Contrast', price: 220 },
        { modality: 'MRI', study_name: 'MRI Lumbar Spine', price: 380 },
        { modality: 'Ultrasound', study_name: 'Abdominal Ultrasound', price: 110 }
      ]
    });
  }));

  router.get('/orders', asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient' && !['admin', 'radiologist', 'doctor', 'nurse', 'lab_staff'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to radiology orders.');
    }
    const where = req.user.role === 'patient' ? 'ro.patient_id = ?' : '1=1';
    const params = req.user.role === 'patient' ? [req.user.patient_id] : [];
    const orders = db.all(
      `SELECT ro.*, pu.full_name as patient_name, p.patient_code,
              CASE WHEN ? = 'patient' AND ro.status != 'Released' THEN NULL ELSE rr.findings END as findings,
              CASE WHEN ? = 'patient' AND ro.status != 'Released' THEN NULL ELSE rr.impression END as impression,
              rr.released_at, rr.attachment_id
       FROM radiology_orders ro
       JOIN patient_profiles p ON p.id = ro.patient_id JOIN users pu ON pu.id = p.user_id
       LEFT JOIN radiology_reports rr ON rr.order_id = ro.id
       WHERE ${where} ORDER BY ro.id DESC LIMIT 100`,
      [req.user.role, req.user.role, ...params]
    );
    res.json({ orders });
  }));

  router.post('/orders', requirePermission('radiology.process', 'clinical.write'), asyncHandler(async (req, res) => {
    const { patient_id, modality = 'X-Ray', study_name, clinical_indication = '', scheduled_at = null, price = 85 } = req.body;
    const pid = Number(patient_id);
    if (!pid || !study_name) throw new AppError(400, 'Patient and study name are required.');
    const ref = `RAD-${Date.now().toString().slice(-6)}`;
    const status = scheduled_at ? 'Scheduled' : 'Ordered';
    const info = db.run(
      `INSERT INTO radiology_orders (order_ref, patient_id, doctor_id, modality, study_name, clinical_indication, scheduled_at, price, status, ordered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ref, pid, req.user.doctor_id || null, modality, study_name, clinical_indication, scheduled_at || null, Number(price), status, req.user.id]
    );
    createNotification(db, broker, {
      roles: ['radiologist', 'lab_staff'],
      title: 'New Radiology Order',
      message: `${modality}: ${study_name} (${ref}) requested.`,
      eventType: 'radiology:ordered'
    });
    res.status(201).json({ order: db.get('SELECT * FROM radiology_orders WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/orders/:id/schedule', requirePermission('radiology.process'), asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const { scheduled_at } = req.body;
    if (!scheduled_at) throw new AppError(400, 'Scheduled date and time are required.');
    const order = db.get('SELECT * FROM radiology_orders WHERE id = ?', [orderId]);
    if (!order) throw new AppError(404, 'Radiology order not found.');
    db.run('UPDATE radiology_orders SET scheduled_at = ?, status = \'Scheduled\', updated_at = datetime(\'now\') WHERE id = ?', [scheduled_at, orderId]);
    res.json({ order: db.get('SELECT * FROM radiology_orders WHERE id = ?', [orderId]) });
  }));

  router.post('/orders/:id/report', requirePermission('radiology.process'), upload.single('imageFile'), asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const order = db.get('SELECT ro.*, p.user_id as patient_user_id FROM radiology_orders ro JOIN patient_profiles p ON p.id = ro.patient_id WHERE ro.id = ?', [orderId]);
    if (!order) throw new AppError(404, 'Radiology order not found.');

    const { findings, impression, release = true } = req.body;
    if (!findings || !impression) throw new AppError(400, 'Findings and impression are required.');

    let attachmentId = null;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'radiology')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      attachmentId = aInfo.lastInsertRowid;
    }

    const releasedAt = release ? new Date().toISOString() : null;
    db.run(
      `INSERT INTO radiology_reports (order_id, findings, impression, attachment_id, reported_by, reviewed_by, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET findings = excluded.findings, impression = excluded.impression, attachment_id = COALESCE(excluded.attachment_id, radiology_reports.attachment_id), released_at = excluded.released_at`,
      [orderId, findings, impression, attachmentId, req.user.id, release ? req.user.id : null, releasedAt]
    );
    db.run('UPDATE radiology_orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [release ? 'Released' : 'Awaiting Review', orderId]);

    if (release) {
      createNotification(db, broker, {
        userId: order.patient_user_id,
        roles: ['doctor', 'radiologist'],
        title: 'Radiology Report Released',
        message: `${order.study_name} (${order.order_ref}) report is ready.`,
        eventType: 'radiology:released'
      });
    }
    res.json({ order: db.get('SELECT * FROM radiology_orders WHERE id = ?', [orderId]) });
  }));

  return router;
}
