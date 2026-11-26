import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { dispensePrescriptionTx, receiveMedicineBatchTx, adjustStockTx } from '../services/pharmacy.js';

export function createPharmacyRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/inventory', asyncHandler(async (req, res) => {
    if (!['admin', 'pharmacist', 'doctor', 'nurse', 'receptionist', 'case_manager', 'patient'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to pharmacy inventory.');
    }
    const medicines = db.all(
      `SELECT m.*, mc.name as category_name, COALESCE(pi.total_quantity, 0) as total_quantity
       FROM medicines m
       LEFT JOIN medicine_categories mc ON mc.id = m.category_id
       LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id
       ORDER BY m.name ASC`
    );
    for (const m of medicines) {
      m.is_low_stock = m.total_quantity <= m.reorder_level;
      m.is_critical = m.total_quantity <= 5 || m.total_quantity === 0;
      m.is_out_of_stock = m.total_quantity === 0;
    }

    const batches = db.all(
      `SELECT mb.*, m.name as medicine_name, m.sku, m.unit FROM medicine_batches mb
       JOIN medicines m ON m.id = mb.medicine_id ORDER BY mb.expiry_date ASC`
    );
    const categories = db.all('SELECT * FROM medicine_categories ORDER BY name');
    const expiringSoon = db.all(
      `SELECT mb.*, m.name as medicine_name, m.sku, m.unit FROM medicine_batches mb
       JOIN medicines m ON m.id = mb.medicine_id
       WHERE mb.quantity_available > 0 AND mb.expiry_date <= date('now', '+60 days')
       ORDER BY mb.expiry_date ASC`
    );

    const summary = {
      totalMedicines: medicines.length,
      lowStockCount: medicines.filter((m) => m.is_low_stock).length,
      criticalCount: medicines.filter((m) => m.is_critical).length,
      outOfStockCount: medicines.filter((m) => m.is_out_of_stock).length,
      totalUnits: medicines.reduce((sum, m) => sum + Number(m.total_quantity || 0), 0),
      expiringCount: expiringSoon.length,
    };

    res.json({ medicines, batches, categories, expiringSoon, summary });
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
      const existing = db.get('SELECT id FROM medicines WHERE sku = ?', [sku]);
      if (existing) {
        throw new AppError(409, `Medicine with SKU "${sku}" already exists.`);
      }

      const info = db.run(
        `INSERT INTO medicines (sku, name, generic_name, category_id, unit, unit_price, reorder_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sku, name, generic_name, category_id ? Number(category_id) : null, unit, Number(unit_price), Number(reorder_level)]
      );
      db.run('INSERT INTO pharmacy_inventory (medicine_id, total_quantity) VALUES (?, 0)', [info.lastInsertRowid]);
      const createdMed = db.get('SELECT * FROM medicines WHERE id = ?', [info.lastInsertRowid]);

      if (broker) {
        broker.publish('pharmacy:medicine_created', {
          medicine: createdMed,
          title: 'New Medicine Added',
          message: `${name} (${sku}) added to pharmacy catalogue.`
        }, { roles: ['pharmacist', 'admin'] });
      }

      res.status(201).json({ medicine: createdMed });
    })
  );

  router.patch(
    '/medicines/:id',
    requirePermission('pharmacy.dispense'),
    asyncHandler(async (req, res) => {
      const medId = Number(req.params.id);
      const med = db.get('SELECT * FROM medicines WHERE id = ?', [medId]);
      if (!med) throw new AppError(404, 'Medicine not found.');

      const { name, generic_name, category_id, unit, unit_price, reorder_level } = req.body;
      db.run(
        `UPDATE medicines SET
          name = COALESCE(?, name),
          generic_name = COALESCE(?, generic_name),
          category_id = COALESCE(?, category_id),
          unit = COALESCE(?, unit),
          unit_price = COALESCE(?, unit_price),
          reorder_level = COALESCE(?, reorder_level),
          updated_at = datetime('now')
         WHERE id = ?`,
        [
          name !== undefined ? name : null,
          generic_name !== undefined ? generic_name : null,
          category_id !== undefined ? (category_id ? Number(category_id) : null) : null,
          unit !== undefined ? unit : null,
          unit_price !== undefined ? Number(unit_price) : null,
          reorder_level !== undefined ? Number(reorder_level) : null,
          medId
        ]
      );

      const updated = db.get('SELECT * FROM medicines WHERE id = ?', [medId]);
      const inv = db.get('SELECT total_quantity FROM pharmacy_inventory WHERE medicine_id = ?', [medId]);
      const totalQuantity = inv ? inv.total_quantity : 0;
      const isLowStock = totalQuantity <= updated.reorder_level;

      if (broker) {
        broker.publish('pharmacy:stock_updated', {
          medicineId: updated.id,
          medicineName: updated.name,
          sku: updated.sku,
          totalQuantity,
          reorderLevel: updated.reorder_level,
          unit: updated.unit,
          isLowStock,
          isCritical: totalQuantity <= 5 || totalQuantity === 0,
          action: 'threshold_updated',
          title: 'Medicine Threshold Updated',
          message: `${updated.name} reorder threshold updated to ${updated.reorder_level} ${updated.unit}.`
        }, { roles: ['pharmacist', 'admin'] });

        if (isLowStock) {
          const alertData = {
            medicineId: updated.id,
            medicine_id: updated.id,
            medicineName: updated.name,
            name: updated.name,
            sku: updated.sku,
            totalQuantity,
            stock_qty: totalQuantity,
            quantity: totalQuantity,
            reorderLevel: updated.reorder_level,
            reorder_level: updated.reorder_level,
            unit: updated.unit,
            isCritical: totalQuantity <= 5 || totalQuantity === 0,
            alertLevel: (totalQuantity <= 5 || totalQuantity === 0) ? 'red' : 'amber',
            title: (totalQuantity <= 5 || totalQuantity === 0) ? 'Critical Low Stock Alert' : 'Low Stock Alert',
            message: `${updated.name} (${updated.sku}) is at/below safety threshold: ${totalQuantity} ${updated.unit} remaining (Reorder threshold: ${updated.reorder_level}).`,
            ts: new Date().toISOString()
          };
          broker.publish('low-stock', alertData, { roles: ['pharmacist', 'admin'] });
          broker.publish('pharmacy:low_stock', alertData, { roles: ['pharmacist', 'admin'] });
        }
      }

      res.json({ medicine: updated });
    })
  );

  router.post('/batches', requirePermission('pharmacy.dispense'), asyncHandler(async (req, res) => {
    const batch = receiveMedicineBatchTx(db, broker, {
      medicineId: Number(req.body.medicine_id),
      batchNumber: req.body.batch_number,
      expiryDate: req.body.expiry_date,
      quantity: Number(req.body.quantity),
      costPrice: Number(req.body.cost_price || 0),
      actor: req.user
    });
    res.status(201).json({ batch });
  }));

  router.post('/adjust-stock', requirePermission('pharmacy.dispense'), asyncHandler(async (req, res) => {
    const { medicine_id, batch_id, quantity_delta, reason, notes } = req.body;
    const result = adjustStockTx(db, broker, {
      medicineId: Number(medicine_id),
      batchId: batch_id ? Number(batch_id) : null,
      quantityDelta: Number(quantity_delta),
      reason: reason || 'Adjustment',
      notes,
      actor: req.user
    });
    res.json(result);
  }));

  router.get('/movements', requirePermission('pharmacy.dispense', 'reports.view'), asyncHandler(async (req, res) => {
    if (!['admin', 'pharmacist', 'doctor'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to pharmacy stock movements.');
    }
    const movements = db.all(
      `SELECT sm.*, m.name as medicine_name, m.sku, m.unit, mb.batch_number, u.full_name as actor_name
       FROM stock_movements sm
       JOIN medicines m ON m.id = sm.medicine_id
       LEFT JOIN medicine_batches mb ON mb.id = sm.batch_id
       LEFT JOIN users u ON u.id = sm.performed_by
       ORDER BY sm.id DESC LIMIT 100`
    );
    res.json({ movements });
  }));

  router.get('/prescriptions', asyncHandler(async (req, res) => {
    if (!['patient', 'admin', 'pharmacist', 'doctor', 'nurse'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to patient prescriptions.');
    }
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
