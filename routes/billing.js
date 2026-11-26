import crypto from 'node:crypto';
import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createInvoiceTx, processRefundTx, recordPaymentTx } from '../services/billing.js';
import { createNotification } from '../services/notifications.js';

const STAFF_BILL_CREATORS = new Set([
  'admin',
  'department_admin',
  'accountant',
  'receptionist',
  'pharmacist',
  'lab_staff',
  'radiologist',
  'nurse',
  'doctor',
  'case_manager'
]);

const STAFF_PAYMENT_CONFIRMERS = new Set([
  'admin',
  'department_admin',
  'accountant',
  'receptionist',
  'case_manager',
  'pharmacist',
  'lab_staff',
  'nurse'
]);

const ALLOWED_BILL_TYPES = new Set(['consultation', 'lab test', 'medicine', 'room', 'other']);

function getBillingPublicConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  return {
    hospitalName: process.env.HOSPITAL_NAME || 'CareLine HMS',
    hospitalAddress: process.env.HOSPITAL_ADDRESS || '100 Medical Center Pkwy, Metro City',
    hospitalPhone: process.env.HOSPITAL_PHONE || '+1-555-0100',
    upiId: process.env.HOSPITAL_UPI_ID || 'carelinehms@upi',
    currency: 'INR',
    razorpayEnabled: Boolean(keyId && keySecret),
    razorpayKeyId: keyId || null
  };
}

function hydrateBillRow(db, row) {
  if (!row) return null;
  const items = db.all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC', [row.invoice_id]);
  const normalizedStatus = String(row.status || 'pending').toLowerCase();
  return {
    ...row,
    status: normalizedStatus,
    payment_method: row.payment_method || row.method || 'UPI QR',
    description: row.description || row.invoice_description || 'Hospital Bill',
    items
  };
}

function queryBills(db, { where = ['1=1'], params = [], limit = 200 }) {
  const rows = db.all(
    `SELECT p.*,
            i.invoice_number, i.description as invoice_description, i.total_amount as invoice_total,
            i.paid_amount as invoice_paid, i.balance_due as invoice_balance, i.status as invoice_status,
            pu.full_name as patient_name, pu.email as patient_email, pu.phone as patient_phone,
            pat.patient_code, pat.gender as patient_gender, pat.dob as patient_dob,
            cu.full_name as created_by_name, vu.full_name as verified_by_name
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN patient_profiles pat ON pat.id = p.patient_id
     JOIN users pu ON pu.id = pat.user_id
     LEFT JOIN users cu ON cu.id = COALESCE(p.created_by, p.recorded_by)
     LEFT JOIN users vu ON vu.id = p.verified_by
     WHERE ${where.join(' AND ')}
     ORDER BY p.id DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => hydrateBillRow(db, r));
}

export function createBillingRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/config', asyncHandler(async (_req, res) => {
    res.json({ config: getBillingPublicConfig() });
  }));

  router.get('/bills', asyncHandler(async (req, res) => {
    const where = ['1=1'];
    const params = [];

    if (req.user.role === 'patient') {
      if (!req.user.patient_id) throw new AppError(403, 'Patient profile not linked.');
      where.push('p.patient_id = ?');
      params.push(req.user.patient_id);
    } else if (STAFF_BILL_CREATORS.has(req.user.role)) {
      if (req.query.patient_id) {
        where.push('p.patient_id = ?');
        params.push(Number(req.query.patient_id));
      }
    } else {
      throw new AppError(403, 'Access denied to hospital bills.');
    }

    if (req.query.status && req.query.status !== 'All') {
      where.push('LOWER(p.status) = LOWER(?)');
      params.push(String(req.query.status).trim());
    }
    if (req.query.bill_type && req.query.bill_type !== 'All') {
      where.push('LOWER(p.bill_type) = LOWER(?)');
      params.push(String(req.query.bill_type).trim());
    }
    if (req.query.from_date) {
      where.push('date(p.created_at) >= date(?)');
      params.push(String(req.query.from_date));
    }
    if (req.query.to_date) {
      where.push('date(p.created_at) <= date(?)');
      params.push(String(req.query.to_date));
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      where.push(`(p.payment_ref LIKE ? OR COALESCE(p.transaction_id,'') LIKE ? OR COALESCE(p.description,'') LIKE ? OR pu.full_name LIKE ? OR pat.patient_code LIKE ?)`);
      params.push(like, like, like, like, like);
    }

    const bills = queryBills(db, { where, params, limit: 200 });
    res.json({ bills, config: getBillingPublicConfig() });
  }));

  router.post(
    '/bills',
    [
      body('patient_id').isInt().withMessage('Patient is required.'),
      body('bill_type').trim().notEmpty().withMessage('Bill type is required.'),
      body('description').trim().notEmpty().withMessage('Bill description is required.'),
      body('amount').isFloat({ min: 1 }).withMessage('Bill amount must be greater than zero.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      if (!STAFF_BILL_CREATORS.has(req.user.role)) {
        throw new AppError(403, 'Only hospital staff or admins can create patient bills.');
      }
      const pid = Number(req.body.patient_id);
      const billType = String(req.body.bill_type).trim().toLowerCase();
      if (!ALLOWED_BILL_TYPES.has(billType)) {
        throw new AppError(400, 'Invalid bill type. Allowed: consultation, lab test, medicine, room, other.');
      }
      const description = String(req.body.description).trim();
      const amount = Number(Number(req.body.amount).toFixed(2));

      const billId = db.transaction(() => {
        const pat = db.get(
          'SELECT p.id, p.user_id, u.branch_id FROM patient_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?',
          [pid]
        );
        if (!pat) throw new AppError(404, 'Patient not found.');

        const suffix = `${String(Date.now()).slice(-6)}${crypto.randomInt(10, 99)}`;
        const invNo = `INV-${new Date().getFullYear()}-${suffix}`;
        const payRef = `BILL-${suffix}`;
        const pendReceipt = `PEND-${suffix}`;

        const invInfo = db.run(
          `INSERT INTO invoices (
             invoice_number, patient_id, branch_id, description,
             consultation_charges, lab_charges, pharmacy_charges, admission_charges,
             discount, tax, total_amount, paid_amount, balance_due, status, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, 'Pending', ?)`,
          [
            invNo,
            pat.id,
            pat.branch_id || req.user.branch_id || 1,
            description,
            billType === 'consultation' ? amount : 0,
            billType === 'lab test' ? amount : 0,
            billType === 'medicine' ? amount : 0,
            billType === 'room' ? amount : 0,
            amount,
            amount,
            req.user.id
          ]
        );

        db.run(
          `INSERT INTO invoice_items (invoice_id, category, description, quantity, unit_price, line_total)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [invInfo.lastInsertRowid, billType, description, amount, amount]
        );

        const pInfo = db.run(
          `INSERT INTO payments (
             payment_ref, receipt_number, invoice_id, patient_id, amount, method, payment_method,
             bill_type, description, is_simulated, status, recorded_by, created_by, paid_at
           ) VALUES (?, ?, ?, ?, ?, 'UPI QR', 'UPI QR', ?, ?, 0, 'pending', ?, ?, '')`,
          [payRef, pendReceipt, invInfo.lastInsertRowid, pat.id, amount, billType, description, req.user.id, req.user.id]
        );

        createNotification(db, broker, {
          userId: pat.user_id,
          title: 'New Hospital Bill Generated',
          message: `${payRef} (${billType}) for ₹${amount.toFixed(2)} is ready for UPI payment.`,
          eventType: 'bill:created'
        });

        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: 'bill.created',
          entityType: 'payment',
          entityId: pInfo.lastInsertRowid,
          details: { payment_ref: payRef, patient_id: pat.id, bill_type: billType, amount }
        });

        return pInfo.lastInsertRowid;
      })();

      const [bill] = queryBills(db, { where: ['p.id = ?'], params: [billId], limit: 1 });
      res.status(201).json({ bill });
    })
  );

  router.post(
    '/bills/:id/submit-upi',
    [
      body('transaction_id')
        .trim()
        .isLength({ min: 6, max: 80 })
        .withMessage('Enter a valid UPI Transaction ID / UTR (minimum 6 characters).')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const billId = Number(req.params.id);
      const existing = db.get('SELECT * FROM payments WHERE id = ?', [billId]);
      if (!existing) throw new AppError(404, 'Bill not found.');

      if (req.user.role === 'patient') {
        if (existing.patient_id !== req.user.patient_id) {
          throw new AppError(403, 'You can only submit payment references for your own bills.');
        }
      } else if (!STAFF_BILL_CREATORS.has(req.user.role)) {
        throw new AppError(403, 'Not authorized to submit UPI reference.');
      }

      const currentStatus = String(existing.status || '').toLowerCase();
      if (currentStatus === 'paid') {
        throw new AppError(409, 'This bill has already been verified and paid.');
      }

      const txnId = String(req.body.transaction_id).trim();
      if (!/^[a-zA-Z0-9._-]{6,80}$/.test(txnId)) {
        throw new AppError(400, 'Transaction ID may only contain letters, numbers, dots, underscores, or hyphens.');
      }

      db.transaction(() => {
        db.run(
          `UPDATE payments
           SET transaction_id = ?, payment_method = 'UPI QR', method = 'UPI QR',
               status = 'verification_pending', upi_submitted_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`,
          [txnId, billId]
        );
        db.run(
          `UPDATE invoices SET status = 'Processing', updated_at = datetime('now') WHERE id = ? AND status != 'Paid'`,
          [existing.invoice_id]
        );
        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: 'bill.upi_submitted',
          entityType: 'payment',
          entityId: billId,
          details: { before: { status: existing.status }, after: { status: 'verification_pending', transaction_id: txnId } }
        });
      })();

      createNotification(db, broker, {
        roles: ['admin', 'accountant', 'receptionist'],
        title: 'UPI Payment Verification Pending',
        message: `Bill ${existing.payment_ref} submitted with UTR/Txn ID ${txnId}. Please verify.`,
        eventType: 'bill:verification_pending'
      });

      const [bill] = queryBills(db, { where: ['p.id = ?'], params: [billId], limit: 1 });
      res.json({ bill, message: 'Transaction ID submitted. Waiting for hospital staff verification.' });
    })
  );

  router.post(
    '/bills/:id/confirm',
    [
      body('decision')
        .optional()
        .isIn(['paid', 'failed'])
        .withMessage('Decision must be either paid or failed.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      if (!STAFF_PAYMENT_CONFIRMERS.has(req.user.role)) {
        throw new AppError(403, 'Only authorized hospital staff or admins can verify and confirm payments.');
      }

      const billId = Number(req.params.id);
      const decision = String(req.body.decision || 'paid').toLowerCase();
      const notes = String(req.body.notes || '').trim();
      const existing = db.get('SELECT * FROM payments WHERE id = ?', [billId]);
      if (!existing) throw new AppError(404, 'Bill not found.');

      const currentStatus = String(existing.status || '').toLowerCase();
      if (currentStatus === 'paid') {
        throw new AppError(409, 'This bill is already marked as paid.');
      }

      const pat = db.get('SELECT user_id FROM patient_profiles WHERE id = ?', [existing.patient_id]);

      db.transaction(() => {
        if (decision === 'paid') {
          const receiptNo = existing.receipt_number && existing.receipt_number.startsWith('RCPT-')
            ? existing.receipt_number
            : `RCPT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}${crypto.randomInt(10, 99)}`;
          const txnRef = existing.transaction_id || String(req.body.transaction_id || '').trim() || existing.payment_ref;

          db.run(
            `UPDATE payments
             SET status = 'paid', receipt_number = ?, transaction_id = ?,
                 paid_at = datetime('now'), verified_by = ?, verified_at = datetime('now'),
                 verification_notes = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [receiptNo, txnRef, req.user.id, notes || 'Verified by hospital staff', billId]
          );

          const inv = db.get('SELECT * FROM invoices WHERE id = ?', [existing.invoice_id]);
          const sumPaid = db.get(
            `SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE invoice_id = ? AND LOWER(status) = 'paid'`,
            [existing.invoice_id]
          ).s;
          const nextBalance = Math.max(0, Number((inv.total_amount - sumPaid).toFixed(2)));
          db.run(
            `UPDATE invoices
             SET paid_amount = ?, balance_due = ?, status = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [sumPaid, nextBalance, nextBalance <= 0 ? 'Paid' : 'Processing', existing.invoice_id]
          );

          db.run(
            `INSERT INTO financial_transactions (tx_ref, tx_type, reference_table, reference_id, amount, actor_id, notes)
             VALUES (?, 'Payment', 'payments', ?, ?, ?, ?)`,
            [`TX-${Date.now()}-${crypto.randomInt(10, 99)}`, billId, existing.amount, req.user.id, `UPI verified (${txnRef})`]
          );

          if (pat) {
            createNotification(db, broker, {
              userId: pat.user_id,
              title: 'Payment Verified & Receipt Ready',
              message: `Payment of ₹${Number(existing.amount).toFixed(2)} for ${existing.payment_ref} is confirmed.`,
              eventType: 'bill:paid'
            });
          }
        } else {
          db.run(
            `UPDATE payments
             SET status = 'failed', verified_by = ?, verified_at = datetime('now'),
                 verification_notes = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [req.user.id, notes || 'Transaction ID could not be verified', billId]
          );
          db.run(
            `UPDATE invoices SET status = 'Pending', updated_at = datetime('now') WHERE id = ? AND status != 'Paid'`,
            [existing.invoice_id]
          );
          if (pat) {
            createNotification(db, broker, {
              userId: pat.user_id,
              title: 'Payment Verification Failed',
              message: `Verification failed for ${existing.payment_ref}. Please check your transaction ID and resubmit.`,
              eventType: 'bill:failed'
            });
          }
        }

        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: `bill.payment_${decision}`,
          entityType: 'payment',
          entityId: billId,
          details: { before: { status: existing.status }, after: { status: decision, notes } }
        });
      })();

      const [bill] = queryBills(db, { where: ['p.id = ?'], params: [billId], limit: 1 });
      res.json({ bill });
    })
  );

  router.post('/bills/:id/create-razorpay-order', asyncHandler(async (req, res) => {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!keyId || !keySecret) {
      throw new AppError(503, 'Razorpay test mode is not configured on this server. Please complete payment via UPI QR.');
    }

    const billId = Number(req.params.id);
    const bill = db.get('SELECT * FROM payments WHERE id = ?', [billId]);
    if (!bill) throw new AppError(404, 'Bill not found.');
    if (req.user.role === 'patient' && bill.patient_id !== req.user.patient_id) {
      throw new AppError(403, 'Access denied to this bill.');
    }
    if (String(bill.status).toLowerCase() === 'paid') {
      throw new AppError(409, 'Bill is already paid.');
    }

    const amountPaise = Math.round(Number(bill.amount) * 100);
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: bill.payment_ref,
        notes: { bill_id: String(bill.id), patient_id: String(bill.patient_id) }
      })
    });
    const orderData = await rzpRes.json().catch(() => ({}));
    if (!rzpRes.ok || !orderData.id) {
      throw new AppError(502, orderData?.error?.description || 'Failed to initialize Razorpay order.');
    }

    db.run(`UPDATE payments SET razorpay_order_id = ?, updated_at = datetime('now') WHERE id = ?`, [orderData.id, billId]);
    res.json({
      orderId: orderData.id,
      amountPaise,
      currency: 'INR',
      keyId
    });
  }));

  router.post(
    '/bills/:id/verify-razorpay',
    [
      body('razorpay_order_id').trim().notEmpty(),
      body('razorpay_payment_id').trim().notEmpty(),
      body('razorpay_signature').trim().notEmpty()
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
      if (!keySecret) {
        throw new AppError(503, 'Razorpay secret key is not configured on the server.');
      }

      const billId = Number(req.params.id);
      const existing = db.get('SELECT * FROM payments WHERE id = ?', [billId]);
      if (!existing) throw new AppError(404, 'Bill not found.');
      if (req.user.role === 'patient' && existing.patient_id !== req.user.patient_id) {
        throw new AppError(403, 'Access denied to this bill.');
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (existing.razorpay_order_id && existing.razorpay_order_id !== razorpay_order_id) {
        throw new AppError(400, 'Razorpay order mismatch.');
      }

      const expectedHex = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const sigBuf = Buffer.from(String(razorpay_signature), 'utf8');
      const expBuf = Buffer.from(expectedHex, 'utf8');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: 'bill.razorpay_signature_invalid',
          entityType: 'payment',
          entityId: billId
        });
        throw new AppError(400, 'Invalid Razorpay signature.');
      }

      db.transaction(() => {
        const receiptNo = existing.receipt_number && existing.receipt_number.startsWith('RCPT-')
          ? existing.receipt_number
          : `RCPT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}${crypto.randomInt(10, 99)}`;
        db.run(
          `UPDATE payments
           SET status = 'paid', receipt_number = ?, transaction_id = ?, payment_method = 'Razorpay',
               method = 'Razorpay', razorpay_order_id = ?, paid_at = datetime('now'),
               verified_at = datetime('now'), verification_notes = 'Razorpay HMAC-SHA256 verified',
               updated_at = datetime('now')
           WHERE id = ?`,
          [receiptNo, razorpay_payment_id, razorpay_order_id, billId]
        );
        const inv = db.get('SELECT * FROM invoices WHERE id = ?', [existing.invoice_id]);
        const sumPaid = db.get(
          `SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE invoice_id = ? AND LOWER(status) = 'paid'`,
          [existing.invoice_id]
        ).s;
        const nextBalance = Math.max(0, Number((inv.total_amount - sumPaid).toFixed(2)));
        db.run(
          `UPDATE invoices SET paid_amount = ?, balance_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
          [sumPaid, nextBalance, nextBalance <= 0 ? 'Paid' : 'Processing', existing.invoice_id]
        );
        db.run(
          `INSERT INTO financial_transactions (tx_ref, tx_type, reference_table, reference_id, amount, actor_id, notes)
           VALUES (?, 'Payment', 'payments', ?, ?, ?, ?)`,
          [`TX-${Date.now()}-${crypto.randomInt(10, 99)}`, billId, existing.amount, req.user.id, `Razorpay verified (${razorpay_payment_id})`]
        );
        logAudit(db, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: 'bill.razorpay_verified',
          entityType: 'payment',
          entityId: billId,
          details: { razorpay_order_id, razorpay_payment_id }
        });
      })();

      const [bill] = queryBills(db, { where: ['p.id = ?'], params: [billId], limit: 1 });
      res.json({ bill });
    })
  );

  router.get('/invoices', asyncHandler(async (req, res) => {
    let where = '1=1';
    const params = [];
    if (req.user.role === 'patient') {
      where = 'i.patient_id = ?';
      params.push(req.user.patient_id);
    } else if (!['admin', 'accountant', 'receptionist', 'case_manager', 'pharmacist'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to billing records.');
    }

    const invoices = db.all(
      `SELECT i.*, pu.full_name as patient_name, p.patient_code
       FROM invoices i
       JOIN patient_profiles p ON p.id = i.patient_id
       JOIN users pu ON pu.id = p.user_id
       WHERE ${where} ORDER BY i.id DESC LIMIT 100`,
      params
    );
    for (const inv of invoices) {
      inv.items = db.all('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
      inv.payments = db.all('SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC', [inv.id]);
    }
    res.json({ invoices });
  }));

  router.post(
    '/invoices',
    requirePermission('finance.manage'),
    [
      body('patient_id').isInt().withMessage('Patient is required.'),
      body('description').trim().notEmpty().withMessage('Description is required.'),
      body('items').isArray({ min: 1 }).withMessage('At least one line item is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const invoice = createInvoiceTx(db, broker, {
        patientId: Number(req.body.patient_id),
        branchId: req.body.branch_id ? Number(req.body.branch_id) : req.user.branch_id,
        description: req.body.description,
        items: req.body.items,
        discount: Number(req.body.discount || 0),
        actor: req.user
      });
      res.status(201).json({ invoice });
    })
  );

  router.post(
    '/payments',
    [
      body('invoice_id').isInt().withMessage('Invoice is required.'),
      body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be positive.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      if (req.user.role !== 'patient' && !req.user.permissions.includes('finance.manage') && req.user.role !== 'admin') {
        throw new AppError(403, 'Not authorized to record payments.');
      }
      const result = recordPaymentTx(db, broker, {
        invoiceId: Number(req.body.invoice_id),
        amount: Number(req.body.amount),
        method: req.body.method || 'Demo Simulation Card',
        idempotencyKey: req.body.idempotency_key || null,
        actor: req.user
      });
      res.status(201).json(result);
    })
  );

  router.post('/refunds', requirePermission('finance.manage'), asyncHandler(async (req, res) => {
    const refund = processRefundTx(db, broker, {
      paymentId: Number(req.body.payment_id),
      amount: req.body.amount ? Number(req.body.amount) : null,
      reason: req.body.reason || 'Billing adjustment',
      actor: req.user
    });
    res.status(201).json({ refund });
  }));

  router.get('/ledger', requirePermission('finance.manage'), asyncHandler(async (_req, res) => {
    const payments = db.all(
      `SELECT p.*, i.invoice_number, pu.full_name as patient_name
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       JOIN patient_profiles pat ON pat.id = p.patient_id JOIN users pu ON pu.id = pat.user_id
       ORDER BY p.id DESC LIMIT 50`
    );
    const expenses = db.all(
      `SELECT e.*, d.name as department_name FROM expenses e LEFT JOIN departments d ON d.id = e.department_id ORDER BY e.id DESC LIMIT 50`
    );
    const refunds = db.all('SELECT * FROM refunds ORDER BY id DESC LIMIT 50');
    const transactions = db.all('SELECT * FROM financial_transactions ORDER BY id DESC LIMIT 50');

    const totals = {
      totalInvoiced: db.get('SELECT COALESCE(SUM(total_amount),0) as s FROM invoices').s,
      totalCollected: db.get("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE LOWER(status) = 'paid'").s,
      totalOutstanding: db.get("SELECT COALESCE(SUM(balance_due),0) as s FROM invoices WHERE status IN ('Pending','Processing')").s,
      totalExpenses: db.get('SELECT COALESCE(SUM(amount),0) as s FROM expenses').s,
      totalRefunds: db.get('SELECT COALESCE(SUM(amount),0) as s FROM refunds').s
    };

    res.json({ totals, payments, expenses, refunds, transactions });
  }));

  router.post('/expenses', requirePermission('finance.manage'), asyncHandler(async (req, res) => {
    const { category, description, amount, department_id = null, expense_date } = req.body;
    const ref = `EXP-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO expenses (expense_ref, department_id, category, description, amount, expense_date, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ref, department_id ? Number(department_id) : null, category, description, Number(amount), expense_date || new Date().toISOString().slice(0, 10), req.user.id]
    );
    res.status(201).json({ expense: db.get('SELECT * FROM expenses WHERE id = ?', [info.lastInsertRowid]) });
  }));

  return router;
}
