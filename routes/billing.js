import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { createInvoiceTx, processRefundTx, recordPaymentTx } from '../services/billing.js';

export function createBillingRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

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
      totalCollected: db.get('SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE status = \'Paid\'').s,
      totalOutstanding: db.get('SELECT COALESCE(SUM(balance_due),0) as s FROM invoices WHERE status IN (\'Pending\',\'Processing\')').s,
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
