import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { createInvoiceTx } from '../services/billing.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createLaboratoryRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/tests', asyncHandler(async (_req, res) => {
    const tests = db.all(
      `SELECT lt.*, lc.name as category_name FROM lab_tests lt
       LEFT JOIN lab_categories lc ON lc.id = lt.category_id ORDER BY lt.name`
    );
    res.json({ tests });
  }));

  router.get('/orders', asyncHandler(async (req, res) => {
    let where = '1=1';
    const params = [];
    if (req.user.role === 'patient') {
      where = 'lo.patient_id = ?';
      params.push(req.user.patient_id);
    } else if (!['admin', 'lab_staff', 'doctor', 'nurse'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to laboratory orders.');
    }

    const orders = db.all(
      `SELECT lo.*, lt.name as test_name, lt.code as test_code, lt.unit as default_unit, lt.reference_range as default_range,
              pu.full_name as patient_name, p.patient_code,
              ls.specimen_code, ls.specimen_type, ls.collected_at,
              CASE WHEN ? = 'patient' AND lo.status != 'Released' THEN NULL ELSE lr.result_value END as result_value,
              CASE WHEN ? = 'patient' AND lo.status != 'Released' THEN NULL ELSE lr.abnormal_flag END as abnormal_flag,
              CASE WHEN ? = 'patient' AND lo.status != 'Released' THEN NULL ELSE lr.notes END as result_notes,
              lr.released_at, lr.attachment_id, lr.is_sample_demo
       FROM lab_orders lo
       JOIN lab_tests lt ON lt.id = lo.test_id
       JOIN patient_profiles p ON p.id = lo.patient_id
       JOIN users pu ON pu.id = p.user_id
       LEFT JOIN lab_specimens ls ON ls.order_id = lo.id
       LEFT JOIN lab_results lr ON lr.order_id = lo.id
       WHERE ${where}
       ORDER BY lo.id DESC LIMIT 100`,
      [req.user.role, req.user.role, req.user.role, ...params]
    );
    res.json({ orders });
  }));

  // Book or order a lab test
  router.post('/orders', asyncHandler(async (req, res) => {
    const { test_id, branch_id = 1, scheduled_date = null, scheduled_slot = null, priority = 'Routine' } = req.body;
    const patientId = req.user.role === 'patient' ? req.user.patient_id : Number(req.body.patient_id);
    if (!patientId || !test_id) throw new AppError(400, 'Patient and test selection are required.');

    const test = db.get('SELECT * FROM lab_tests WHERE id = ?', [Number(test_id)]);
    if (!test) throw new AppError(404, 'Lab test not found.');

    const order = db.transaction(() => {
      const ref = `LAB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const status = scheduled_date ? 'Scheduled' : 'Ordered';
      const info = db.run(
        `INSERT INTO lab_orders (order_ref, patient_id, doctor_id, branch_id, test_id, scheduled_date, scheduled_slot, priority, status, ordered_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ref, patientId, req.user.doctor_id || null, Number(branch_id), test.id, scheduled_date, scheduled_slot, priority, status, req.user.id]
      );
      createInvoiceTx(db, broker, {
        patientId,
        branchId: Number(branch_id),
        description: `Laboratory Test: ${test.name}`,
        items: [{ category: 'Laboratory', description: test.name, quantity: 1, unit_price: test.price }],
        actor: req.user
      });
      if (broker) {
        broker.publish('lab:ordered', { orderId: info.lastInsertRowid, ref, title: 'New Lab Order', message: `${ref} (${test.name})` }, { roles: ['lab_staff', 'admin'] });
      }
      return db.get('SELECT * FROM lab_orders WHERE id = ?', [info.lastInsertRowid]);
    })();

    res.status(201).json({ order });
  }));

  router.post('/orders/:id/specimen', requirePermission('lab.process'), asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const order = db.get('SELECT * FROM lab_orders WHERE id = ?', [orderId]);
    if (!order) throw new AppError(404, 'Lab order not found.');

    db.transaction(() => {
      const specCode = `SPEC-${Date.now().toString().slice(-6)}`;
      db.run('INSERT INTO lab_specimens (order_id, specimen_code, specimen_type, collected_by) VALUES (?, ?, ?, ?)',
        [order.id, specCode, req.body.specimen_type || 'Blood', req.user.id]);
      db.run('UPDATE lab_orders SET status = \'Specimen Collected\', updated_at = datetime(\'now\') WHERE id = ?', [order.id]);
      validateAndRecordTransition(db, broker, {
        entityType: 'laboratory', entityId: order.id, fromStatus: order.status, toStatus: 'Specimen Collected', actor: req.user, notes: specCode
      });
    })();
    res.json({ order: db.get('SELECT * FROM lab_orders WHERE id = ?', [orderId]) });
  }));

  router.patch('/orders/:id/processing', requirePermission('lab.process'), asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const order = db.get('SELECT * FROM lab_orders WHERE id = ?', [orderId]);
    if (!order) throw new AppError(404, 'Lab order not found.');
    db.transaction(() => {
      db.run('UPDATE lab_orders SET status = \'Processing\', updated_at = datetime(\'now\') WHERE id = ?', [order.id]);
      validateAndRecordTransition(db, broker, {
        entityType: 'laboratory', entityId: order.id, fromStatus: order.status, toStatus: 'Processing', actor: req.user
      });
    })();
    res.json({ order: db.get('SELECT * FROM lab_orders WHERE id = ?', [orderId]) });
  }));

  router.post('/orders/:id/results', requirePermission('lab.process'), upload.single('reportFile'), asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const order = db.get(
      `SELECT lo.*, lt.unit as def_unit, lt.reference_range as def_ref FROM lab_orders lo JOIN lab_tests lt ON lt.id = lo.test_id WHERE lo.id = ?`,
      [orderId]
    );
    if (!order) throw new AppError(404, 'Lab order not found.');
    if (!req.body.result_value) throw new AppError(400, 'Result value is required.');

    db.transaction(() => {
      let attachmentId = null;
      if (req.file) {
        const aInfo = db.run(
          `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
           VALUES (?, ?, ?, ?, ?, 'laboratory')`,
          [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
        );
        attachmentId = aInfo.lastInsertRowid;
      }

      if (order.status === 'Specimen Collected') {
        db.run('UPDATE lab_orders SET status = \'Processing\' WHERE id = ?', [order.id]);
        validateAndRecordTransition(db, broker, {
          entityType: 'laboratory', entityId: order.id, fromStatus: 'Specimen Collected', toStatus: 'Processing', actor: req.user
        });
      }

      db.run(
        `INSERT INTO lab_results (order_id, result_value, unit, reference_range, abnormal_flag, notes, attachment_id, is_sample_demo, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(order_id) DO UPDATE SET result_value = excluded.result_value, abnormal_flag = excluded.abnormal_flag, notes = excluded.notes`,
        [order.id, req.body.result_value, req.body.unit || order.def_unit, req.body.reference_range || order.def_ref, req.body.abnormal_flag || 'Normal', req.body.notes || 'Sample Demonstration Lab Result', attachmentId, req.user.id]
      );

      const cur = db.get('SELECT status FROM lab_orders WHERE id = ?', [order.id]).status;
      db.run('UPDATE lab_orders SET status = \'Awaiting Review\', updated_at = datetime(\'now\') WHERE id = ?', [order.id]);
      validateAndRecordTransition(db, broker, {
        entityType: 'laboratory', entityId: order.id, fromStatus: cur, toStatus: 'Awaiting Review', actor: req.user
      });
    })();

    res.json({ order: db.get('SELECT * FROM lab_orders WHERE id = ?', [orderId]) });
  }));

  router.post('/orders/:id/release', requirePermission('lab.process'), asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const order = db.get(
      `SELECT lo.*, p.user_id as patient_user_id, lt.name as test_name
       FROM lab_orders lo JOIN patient_profiles p ON p.id = lo.patient_id JOIN lab_tests lt ON lt.id = lo.test_id WHERE lo.id = ?`,
      [orderId]
    );
    if (!order) throw new AppError(404, 'Lab order not found.');

    db.transaction(() => {
      db.run('UPDATE lab_results SET reviewed_by = ?, reviewed_at = datetime(\'now\'), released_at = datetime(\'now\') WHERE order_id = ?', [req.user.id, order.id]);
      db.run('UPDATE lab_orders SET status = \'Released\', updated_at = datetime(\'now\') WHERE id = ?', [order.id]);
      validateAndRecordTransition(db, broker, {
        entityType: 'laboratory',
        entityId: order.id,
        fromStatus: order.status,
        toStatus: 'Released',
        actor: req.user,
        notify: {
          userId: order.patient_user_id,
          roles: ['doctor'],
          title: 'Lab Report Released',
          message: `Report for ${order.test_name} (${order.order_ref}) is now available.`,
          eventType: 'lab:released'
        }
      });
    })();

    res.json({ order: db.get('SELECT * FROM lab_orders WHERE id = ?', [orderId]) });
  }));

  return router;
}
