import { AppError } from '../middleware/errors.js';
import { logAudit } from './audit.js';
import { createNotification } from './notifications.js';

export function createInvoiceTx(db, broker, { patientId, branchId = null, description, items = [], discount = 0, taxRate = 5, actor }) {
  return db.transaction(() => {
    if (!items.length) throw new AppError(400, 'At least one invoice line item is required.');
    let consultation = 0;
    let lab = 0;
    let pharmacy = 0;
    let admission = 0;
    let subtotal = 0;

    for (const item of items) {
      const qty = Number(item.quantity || 1);
      const price = Number(item.unit_price || 0);
      const lineTotal = qty * price;
      subtotal += lineTotal;
      if (item.category === 'Consultation') consultation += lineTotal;
      else if (item.category === 'Laboratory' || item.category === 'Radiology') lab += lineTotal;
      else if (item.category === 'Pharmacy') pharmacy += lineTotal;
      else if (item.category === 'Admission') admission += lineTotal;
    }

    const taxable = Math.max(0, subtotal - Number(discount || 0));
    const tax = Number(((taxable * Number(taxRate)) / 100).toFixed(2));
    const total = Number((taxable + tax).toFixed(2));
    const invNum = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const info = db.run(
      `INSERT INTO invoices (invoice_number, patient_id, branch_id, description, consultation_charges, lab_charges, pharmacy_charges, admission_charges, discount, tax, total_amount, paid_amount, balance_due, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'Pending', ?)`,
      [invNum, patientId, branchId, description, consultation, lab, pharmacy, admission, Number(discount || 0), tax, total, total, actor.id]
    );

    for (const item of items) {
      const qty = Number(item.quantity || 1);
      const price = Number(item.unit_price || 0);
      db.run(
        `INSERT INTO invoice_items (invoice_id, category, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [info.lastInsertRowid, item.category || 'Service', item.description, qty, price, qty * price]
      );
    }

    const pat = db.get('SELECT user_id FROM patient_profiles WHERE id = ?', [patientId]);
    logAudit(db, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'invoice.created',
      entityType: 'invoice',
      entityId: info.lastInsertRowid,
      details: { invoiceNumber: invNum, total }
    });
    if (pat) {
      createNotification(db, broker, {
        userId: pat.user_id,
        roles: ['accountant'],
        title: 'New Invoice Generated',
        message: `Invoice ${invNum} for $${total.toFixed(2)} is ready.`,
        eventType: 'invoice:created'
      });
    }
    return db.get('SELECT * FROM invoices WHERE id = ?', [info.lastInsertRowid]);
  })();
}

export function recordPaymentTx(db, broker, { invoiceId, amount, method = 'Demo Card', idempotencyKey = null, actor }) {
  return db.transaction(() => {
    if (idempotencyKey) {
      const dup = db.get('SELECT * FROM payments WHERE idempotency_key = ?', [idempotencyKey]);
      if (dup) throw new AppError(409, 'Duplicate payment request detected.');
    }

    const inv = db.get(
      `SELECT i.*, p.user_id as patient_user_id FROM invoices i
       JOIN patient_profiles p ON p.id = i.patient_id WHERE i.id = ?`,
      [invoiceId]
    );
    if (!inv) throw new AppError(404, 'Invoice not found.');
    if (actor.role === 'patient' && inv.patient_user_id !== actor.id) {
      throw new AppError(403, 'You can only pay your own invoices.');
    }
    if (inv.status === 'Paid' || inv.balance_due <= 0) {
      throw new AppError(409, 'Invoice is already fully paid.');
    }

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0 || payAmount > inv.balance_due + 0.01) {
      throw new AppError(400, `Payment amount must be between $0.01 and $${inv.balance_due.toFixed(2)}.`);
    }

    const payRef = `PAY-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const receiptNo = `RCPT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const info = db.run(
      `INSERT INTO payments (payment_ref, receipt_number, invoice_id, patient_id, amount, method, is_simulated, idempotency_key, status, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'Paid', ?)`,
      [payRef, receiptNo, inv.id, inv.patient_id, payAmount, method, idempotencyKey, actor.id]
    );

    const newPaid = Number((inv.paid_amount + payAmount).toFixed(2));
    const newBal = Number(Math.max(0, inv.total_amount - newPaid).toFixed(2));
    const newStatus = newBal <= 0 ? 'Paid' : 'Pending';

    db.run(
      `UPDATE invoices SET paid_amount = ?, balance_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [newPaid, newBal, newStatus, inv.id]
    );

    db.run(
      `INSERT INTO financial_transactions (tx_ref, tx_type, reference_table, reference_id, amount, actor_id, notes)
       VALUES (?, 'Payment (Simulated)', 'payments', ?, ?, ?, ?)`,
      [`TX-${payRef}`, info.lastInsertRowid, payAmount, actor.id, `Invoice ${inv.invoice_number}`]
    );

    logAudit(db, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'payment.recorded',
      entityType: 'payment',
      entityId: info.lastInsertRowid,
      details: { invoiceNumber: inv.invoice_number, amount: payAmount, receiptNo, simulated: true }
    });

    createNotification(db, broker, {
      userId: inv.patient_user_id,
      roles: ['accountant', 'admin'],
      title: 'Payment Recorded',
      message: `Receipt ${receiptNo} issued for $${payAmount.toFixed(2)} (Demo Simulation).`,
      eventType: 'payment:updated'
    });

    return {
      payment: db.get('SELECT * FROM payments WHERE id = ?', [info.lastInsertRowid]),
      invoice: db.get('SELECT * FROM invoices WHERE id = ?', [inv.id])
    };
  })();
}

export function processRefundTx(db, broker, { paymentId, amount, reason, actor }) {
  return db.transaction(() => {
    const pay = db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!pay) throw new AppError(404, 'Payment record not found.');
    if (pay.status === 'Refunded') throw new AppError(409, 'Payment has already been refunded.');
    const refAmount = Number(amount || pay.amount);
    if (refAmount <= 0 || refAmount > pay.amount) throw new AppError(400, 'Invalid refund amount.');

    const refundRef = `RFD-${Date.now()}`;
    const info = db.run(
      `INSERT INTO refunds (refund_ref, payment_id, invoice_id, amount, reason, status, processed_by)
       VALUES (?, ?, ?, ?, ?, 'Refunded', ?)`,
      [refundRef, pay.id, pay.invoice_id, refAmount, reason, actor.id]
    );

    db.run('UPDATE payments SET status = ? WHERE id = ?', ['Refunded', pay.id]);
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', [pay.invoice_id]);
    const newPaid = Math.max(0, Number((inv.paid_amount - refAmount).toFixed(2)));
    const newBal = Number((inv.total_amount - newPaid).toFixed(2));
    db.run('UPDATE invoices SET paid_amount = ?, balance_due = ?, status = ? WHERE id = ?', [newPaid, newBal, 'Refunded', inv.id]);

    db.run(
      `INSERT INTO financial_transactions (tx_ref, tx_type, reference_table, reference_id, amount, actor_id, notes)
       VALUES (?, 'Refund', 'refunds', ?, ?, ?, ?)`,
      [`TX-${refundRef}`, info.lastInsertRowid, -refAmount, actor.id, reason]
    );

    logAudit(db, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'payment.refunded',
      entityType: 'refund',
      entityId: info.lastInsertRowid,
      details: { paymentId, amount: refAmount, reason }
    });

    if (broker) {
      broker.publish('payment:refunded', { refundRef, amount: refAmount }, { roles: ['accountant', 'admin'] });
    }
    return db.get('SELECT * FROM refunds WHERE id = ?', [info.lastInsertRowid]);
  })();
}
