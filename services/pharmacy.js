import { AppError } from '../middleware/errors.js';
import { validateAndRecordTransition } from './workflow.js';
import { createInvoiceTx } from './billing.js';

export function receiveMedicineBatchTx(db, brokerOrOptions, maybeOptions) {
  let broker = null;
  let options;
  if (maybeOptions) {
    broker = brokerOrOptions;
    options = maybeOptions;
  } else {
    options = brokerOrOptions;
  }

  return db.transaction(() => {
    const { medicineId, batchNumber, expiryDate, quantity, costPrice = 0, actor } = options;
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

    const inv = db.get('SELECT total_quantity FROM pharmacy_inventory WHERE medicine_id = ?', [medicineId]);
    const currentQty = inv ? inv.total_quantity : qty;
    const isLowStock = currentQty <= med.reorder_level;
    const isCritical = currentQty <= 5 || currentQty === 0;

    if (broker) {
      broker.publish('pharmacy:stock_updated', {
        medicineId: med.id,
        medicineName: med.name,
        sku: med.sku,
        totalQuantity: currentQty,
        reorderLevel: med.reorder_level,
        unit: med.unit,
        isLowStock,
        isCritical,
        changeDelta: qty,
        action: 'received',
        batchNumber,
        title: 'Medicine Batch Received',
        message: `Batch ${batchNumber} received for ${med.name}. Available stock: ${currentQty} ${med.unit}.`
      }, { roles: ['pharmacist', 'admin'] });
    }

    return db.get('SELECT * FROM medicine_batches WHERE id = ?', [info.lastInsertRowid]);
  })();
}

export function adjustStockTx(db, brokerOrOptions, maybeOptions) {
  let broker = null;
  let options;
  if (maybeOptions) {
    broker = brokerOrOptions;
    options = maybeOptions;
  } else {
    options = brokerOrOptions;
  }

  return db.transaction(() => {
    const { medicineId, batchId = null, quantityDelta, reason = 'Adjustment', notes = '', actor } = options;
    const med = db.get('SELECT * FROM medicines WHERE id = ?', [medicineId]);
    if (!med) throw new AppError(404, 'Medicine not found.');

    const delta = Number(quantityDelta);
    if (!delta || isNaN(delta)) throw new AppError(400, 'Valid quantity adjustment delta is required.');

    const inv = db.get('SELECT total_quantity FROM pharmacy_inventory WHERE medicine_id = ?', [medicineId]);
    const currentTotal = inv ? inv.total_quantity : 0;
    const newTotal = currentTotal + delta;
    if (newTotal < 0) {
      throw new AppError(409, `Adjustment would reduce stock below zero. Current: ${currentTotal}, Delta: ${delta}`);
    }

    if (batchId) {
      const batch = db.get('SELECT * FROM medicine_batches WHERE id = ? AND medicine_id = ?', [batchId, medicineId]);
      if (!batch) throw new AppError(404, 'Batch not found for this medicine.');
      const newBatchQty = batch.quantity_available + delta;
      if (newBatchQty < 0) {
        throw new AppError(409, `Adjustment would reduce batch quantity below zero. Available in batch: ${batch.quantity_available}`);
      }
      db.run('UPDATE medicine_batches SET quantity_available = quantity_available + ?, updated_at = datetime(\'now\') WHERE id = ?', [delta, batchId]);
    }

    db.run(
      `INSERT INTO pharmacy_inventory (medicine_id, total_quantity, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(medicine_id) DO UPDATE SET total_quantity = total_quantity + excluded.total_quantity, updated_at = datetime('now')`,
      [medicineId, delta]
    );

    const movInfo = db.run(
      `INSERT INTO stock_movements (medicine_id, batch_id, movement_type, quantity_delta, reference_type, performed_by, notes)
       VALUES (?, ?, ?, ?, 'adjustment', ?, ?)`,
      [medicineId, batchId || null, reason, delta, actor.id, notes || `Manual stock adjustment (${reason})`]
    );

    const isLowStock = newTotal <= med.reorder_level;
    const isCritical = newTotal <= 5 || newTotal === 0;

    if (broker) {
      broker.publish('pharmacy:stock_updated', {
        medicineId: med.id,
        medicineName: med.name,
        sku: med.sku,
        totalQuantity: newTotal,
        reorderLevel: med.reorder_level,
        unit: med.unit,
        isLowStock,
        isCritical,
        changeDelta: delta,
        action: 'adjusted',
        reason,
        title: 'Stock Adjusted',
        message: `Inventory for ${med.name} adjusted by ${delta > 0 ? `+${delta}` : delta} ${med.unit}. New balance: ${newTotal}.`
      }, { roles: ['pharmacist', 'admin'] });

      if (isLowStock) {
        const alertData = {
          medicineId: med.id,
          medicine_id: med.id,
          medicineName: med.name,
          name: med.name,
          sku: med.sku,
          totalQuantity: newTotal,
          stock_qty: newTotal,
          quantity: newTotal,
          reorderLevel: med.reorder_level,
          reorder_level: med.reorder_level,
          unit: med.unit,
          isCritical,
          alertLevel: isCritical ? 'red' : 'amber',
          title: isCritical ? 'Critical Low Stock Alert' : 'Low Stock Alert',
          message: `${med.name} (${med.sku}) has reached ${isCritical ? 'CRITICAL' : 'low'} level: ${newTotal} ${med.unit} remaining (Reorder threshold: ${med.reorder_level}).`,
          ts: new Date().toISOString()
        };
        broker.publish('low-stock', alertData, { roles: ['pharmacist', 'admin'] });
        broker.publish('pharmacy:low_stock', alertData, { roles: ['pharmacist', 'admin'] });
      }
    }

    return {
      medicine: med,
      newTotal,
      movementId: movInfo.lastInsertRowid
    };
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

      const updatedInv = db.get('SELECT total_quantity FROM pharmacy_inventory WHERE medicine_id = ?', [med.id]);
      const currentQty = updatedInv ? updatedInv.total_quantity : 0;
      const isLowStock = currentQty <= med.reorder_level;
      const isCritical = currentQty <= 5 || currentQty === 0;

      if (broker) {
        broker.publish('pharmacy:stock_updated', {
          medicineId: med.id,
          medicineName: med.name,
          sku: med.sku,
          totalQuantity: currentQty,
          reorderLevel: med.reorder_level,
          unit: med.unit,
          isLowStock,
          isCritical,
          changeDelta: -needed,
          action: 'dispensed',
          prescriptionRef: rx.prescription_ref
        }, { roles: ['pharmacist', 'admin'] });

        if (isLowStock) {
          const alertData = {
            medicineId: med.id,
            medicine_id: med.id,
            medicineName: med.name,
            name: med.name,
            sku: med.sku,
            totalQuantity: currentQty,
            stock_qty: currentQty,
            quantity: currentQty,
            reorderLevel: med.reorder_level,
            reorder_level: med.reorder_level,
            unit: med.unit,
            isCritical,
            alertLevel: isCritical ? 'red' : 'amber',
            title: isCritical ? 'Critical Low Stock Alert' : 'Low Stock Warning',
            message: `${med.name} (${med.sku}) has reached ${isCritical ? 'CRITICAL' : 'low'} level: ${currentQty} ${med.unit} remaining (Reorder threshold: ${med.reorder_level}).`,
            ts: new Date().toISOString()
          };
          broker.publish('low-stock', alertData, { roles: ['pharmacist', 'admin'] });
          broker.publish('pharmacy:low_stock', alertData, { roles: ['pharmacist', 'admin'] });
        }
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
