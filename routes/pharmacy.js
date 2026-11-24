import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { dispensePrescriptionTx, receiveMedicineBatchTx } from '../services/pharmacy.js';

export function createPharmacyRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/inventory', asyncHandler(async (_req, res) => {
    const medicines = db.all(
      `SELECT m.*, mc.name as category_name, COALESCE(pi.total_quantity, 0) as total_quantity
       FROM medicines m
       LEFT JOIN medicine_categories mc ON mc.id = m.category_id
       LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id
       ORDER BY m.name ASC`
    );
    const batches = db.all(
      `SELECT mb.*, m.name as medicine_name, m.sku FROM medicine_batches mb
       JOIN medicines m ON m.id = mb.medicine_id ORDER BY mb.expiry_date ASC`
    );
    const categories = db.all('SELECT * FROM medicine_categories ORDER BY name');
    const expiringSoon = db.all(
      `SELECT mb.*, m.name as medicine_name FROM medicine_batches mb
       JOIN medicines m ON m.id = mb.medicine_id
       WHERE mb.quantity_available > 0 AND mb.expiry_date <= date('now', '+60 days')`
    );
    res.json({ medicines, batches, categories, expiringSoon });
  }));

  router.post(
    '/medicines',
    requirePermission('pharmacy.dispense'),
    [
      body('sku').trim().notEmpty().withMessage('SKU is required.'),
      body('name').trim().notEmpty().withMessage('Medicine name is required.'),
      body('unit_price').isFloat({ min: 0.1 }).withMessage('Valid unit price is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { sku, name, generic_name = '', category_id = null, unit = 'Tablet', unit_price, reorder_level = 20 } = req.body;
      const info = db.run(
        `INSERT INTO medicines (sku, name, generic_name, category_id, unit, unit_price, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sku, name, generic_name, category_id ? Number(category_id) : null, unit, Number(unit_price), Number(reorder_level)]
      );
      db.run('INSERT INTO pharmacy_inventory (medicine_id, total_quantity) VALUES (?, 0)', [info.lastInsertRowid]);
      res.status(201).json({ medicine: db.get('SELECT * FROM medicines WHERE id = ?', [info.lastInsertRowid]) });
    })
  );

  router.post('/batches', requirePermission('pharmacy.dispense'), asyncHandler(async (req, res) => {
    const batch = receiveMedicineBatchTx(db, {
      medicineId: Number(req.body.medicine_id),
      batchNumber: req.body.batch_number,
      expiryDate: req.body.expiry_date,
      quantity: Number(req.body.quantity),
      costPrice: Number(req.body.cost_price || 0),
      actor: req.user
    });
    res.status(201).json({ batch });
  }));

  router.get('/prescriptions', asyncHandler(async (req, res) => {
    const where = req.user.role === 'patient' ? 'r.patient_id = ?' : '1=1';
    const params = req.user.role === 'patient' ? [req.user.patient_id] : [];
    const prescriptions = db.all(
      `SELECT r.*, pu.full_name as patient_name, p.patient_code, du.full_name as doctor_name
       FROM prescriptions r
       JOIN patient_profiles p ON p.id = r.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = r.doctor_id JOIN users du ON du.id = doc.user_id
       WHERE ${where} ORDER BY r.id DESC LIMIT 100`,
      params
    );
    for (const rx of prescriptions) {
      rx.items = db.all('SELECT * FROM prescription_items WHERE prescription_id = ?', [rx.id]);
    }
    const refills = db.all(
      `SELECT rr.*, r.prescription_ref, pu.full_name as patient_name
       FROM refill_requests rr
       JOIN prescriptions r ON r.id = rr.prescription_id
       JOIN patient_profiles p ON p.id = rr.patient_id JOIN users pu ON pu.id = p.user_id
       ${req.user.role === 'patient' ? 'WHERE rr.patient_id = ?' : ''}
       ORDER BY rr.id DESC`,
      req.user.role === 'patient' ? [req.user.patient_id] : []
    );
    res.json({ prescriptions, refills });
  }));

  // Pharmacy cannot edit clinical prescriptions, only dispense them!
  router.post('/prescriptions/:id/dispense', requirePermission('pharmacy.dispense'), asyncHandler(async (req, res) => {
    const result = dispensePrescriptionTx(db, broker, {
      prescriptionId: Number(req.params.id),
      actor: req.user
    });
    res.json(result);
  }));

  router.post('/refills', asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient' || !req.user.patient_id) throw new AppError(403, 'Only patients can request prescription refills.');
    const rx = db.get('SELECT * FROM prescriptions WHERE id = ? AND patient_id = ?', [Number(req.body.prescription_id), req.user.patient_id]);
    if (!rx) throw new AppError(404, 'Prescription not found.');
    const info = db.run(
      'INSERT INTO refill_requests (prescription_id, patient_id, notes, status) VALUES (?, ?, ?, ?)',
      [rx.id, req.user.patient_id, req.body.notes || 'Patient requested refill', 'Requested']
    );
    res.status(201).json({ refill: db.get('SELECT * FROM refill_requests WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/refills/:id', requirePermission('pharmacy.dispense'), asyncHandler(async (req, res) => {
    db.run('UPDATE refill_requests SET status = ?, reviewed_by = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [req.body.status, req.user.id, Number(req.params.id)]);
    res.json({ refill: db.get('SELECT * FROM refill_requests WHERE id = ?', [Number(req.params.id)]) });
  }));

  return router;
}
