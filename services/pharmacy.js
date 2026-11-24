import { AppError } from '../middleware/errors.js';
import { validateAndRecordTransition } from './workflow.js';
import { createInvoiceTx } from './billing.js';

export function receiveMedicineBatchTx(db, { medicineId, batchNumber, expiryDate, quantity, costPrice = 0, actor }) {
  return db.transaction(() => {
    const med = db.get('SELECT * FROM medicines WHERE id = ?', [medicineId]);
    if (!med) throw new AppError(404, 'Medicine not found.');
    const qty = Number(quantity);
    if (!qty || qty <= 0) throw new AppError(400, 'Quantity must be greater than zero.');

    const info = db.run(
      `INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity_received, quantity_available, cost_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [medicineId, batchNumber, expiryDate, qty, qty, Number(costPrice || 0)]
    );

    db.run(
      `INSERT INTO pharmacy_inventory (medicine_id, total_quantity, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(medicine_id) DO UPDATE SET total_quantity = total_quantity + excluded.total_quantity, updated_at = datetime('now')`,
      [medicineId, qty]
    );

    db.run(
      `INSERT INTO stock_movements (medicine_id, batch_id, movement_type, quantity_delta, reference_type, performed_by, notes)
       VALUES (?, ?, 'Receipt', ?, 'batch', ?, ?)`,
      [medicineId, info.lastInsertRowid, qty, actor.id, `Received batch ${batchNumber}`]
    );

    return db.get('SELECT * FROM medicine_batches WHERE id = ?', [info.lastInsertRowid]);
  })();
}

export function dispensePrescriptionTx(db, broker, { prescriptionId, actor }) {
  return db.transaction(() => {
    const rx = db.get(
      `SELECT r.*, p.user_id as patient_user_id FROM prescriptions r
       JOIN patient_profiles p ON p.id = r.patient_id WHERE r.id = ?`,
      [prescriptionId]
    );
    if (!rx) throw new AppError(404, 'Prescription not found.');
    if (['Dispensed', 'Completed'].includes(rx.status)) {
      throw new AppError(409, 'Prescription has already been dispensed.');
    }

    const items = db.all('SELECT * FROM prescription_items WHERE prescription_id = ?', [rx.id]);
    if (!items.length) throw new AppError(400, 'Prescription has no medicine items.');

    const invoiceItems = [];

    for (const item of items) {
      let med = item.medicine_id
        ? db.get('SELECT * FROM medicines WHERE id = ?', [item.medicine_id])
        : db.get('SELECT * FROM medicines WHERE lower(name) = lower(?)', [item.medicine_name]);

      if (!med) {
        throw new AppError(400, `Medicine "${item.medicine_name}" is not mapped in pharmacy inventory.`);
      }

      const needed = Number(item.quantity || 1);
      const inv = db.get('SELECT total_quantity FROM pharmacy_inventory WHERE medicine_id = ?', [med.id]);
      const availTotal = inv ? inv.total_quantity : 0;
      if (availTotal < needed) {
        throw new AppError(409, `Insufficient stock for ${med.name}. Available: ${availTotal}, required: ${needed}.`);
      }

      let remaining = needed;
      const batches = db.all(
        `SELECT * FROM medicine_batches
         WHERE medicine_id = ? AND quantity_available > 0 AND expiry_date >= date('now')
         ORDER BY expiry_date ASC`,
        [med.id]
      );

      const batchTotal = batches.reduce((s, b) => s + b.quantity_available, 0);
      if (batchTotal < needed) {
        throw new AppError(409, `Insufficient unexpired stock for ${med.name}.`);
      }

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity_available);
        db.run('UPDATE medicine_batches SET quantity_available = quantity_available - ?, updated_at = datetime(\'now\') WHERE id = ?', [deduct, batch.id]);
        db.run('UPDATE pharmacy_inventory SET total_quantity = total_quantity - ?, updated_at = datetime(\'now\') WHERE medicine_id = ?', [deduct, med.id]);
        db.run(
          `INSERT INTO stock_movements (medicine_id, batch_id, movement_type, quantity_delta, reference_type, reference_id, performed_by, notes)
           VALUES (?, ?, 'Dispense', ?, 'prescription', ?, ?, ?)`,
          [med.id, batch.id, -deduct, rx.id, actor.id, `Dispensed for ${rx.prescription_ref}`]
        );
        db.run(
          `INSERT INTO dispensing_records (prescription_id, patient_id, medicine_id, batch_id, quantity, total_price, dispensed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [rx.id, rx.patient_id, med.id, batch.id, deduct, deduct * med.unit_price, actor.id]
        );
        remaining -= deduct;
      }

      invoiceItems.push({
        category: 'Pharmacy',
        description: `${med.name} (${needed} ${med.unit})`,
        quantity: needed,
        unit_price: med.unit_price
      });
    }

    db.run('UPDATE prescriptions SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['Dispensed', rx.id]);

    validateAndRecordTransition(db, broker, {
      entityType: 'pharmacy',
      entityId: rx.id,
      fromStatus: rx.status,
      toStatus: 'Dispensed',
      actor,
      notes: 'Medicines dispensed from inventory',
      notify: {
        userId: rx.patient_user_id,
        roles: ['doctor', 'accountant'],
        title: 'Prescription Dispensed',
        message: `Prescription ${rx.prescription_ref} has been dispensed by Pharmacy.`,
        eventType: 'pharmacy:dispensed'
      }
    });

    const invoice = createInvoiceTx(db, broker, {
      patientId: rx.patient_id,
      description: `Pharmacy Dispensing (${rx.prescription_ref})`,
      items: invoiceItems,
      actor
    });

    return { prescription: db.get('SELECT * FROM prescriptions WHERE id = ?', [rx.id]), invoice };
  })();
}
