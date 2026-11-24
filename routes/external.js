import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createExternalRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);
  router.use(requirePermission('external.manage', 'admissions.manage'));

  router.get('/overview', asyncHandler(async (_req, res) => {
    const providers = db.all('SELECT * FROM external_providers ORDER BY name');
    const suppliers = db.all('SELECT * FROM suppliers ORDER BY name');
    const requests = db.all(
      `SELECT er.*, ep.name as provider_name, ep.provider_type, ep.is_verified as provider_verified
       FROM external_requests er LEFT JOIN external_providers ep ON ep.id = er.provider_id ORDER BY er.id DESC`
    );
    const availability = db.all(
      `SELECT pa.*, ep.name as provider_name FROM provider_availability pa JOIN external_providers ep ON ep.id = pa.provider_id`
    );
    const purchaseOrders = db.all(
      `SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.id DESC`
    );
    res.json({ providers, suppliers, requests, availability, purchaseOrders });
  }));

  router.post('/providers', asyncHandler(async (req, res) => {
    const { name, provider_type, contact_person = '', phone, location = '', is_verified = false } = req.body;
    const info = db.run(
      'INSERT INTO external_providers (name, provider_type, contact_person, phone, location, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
      [name, provider_type, contact_person, phone, location, is_verified ? 1 : 0]
    );
    res.status(201).json({ provider: db.get('SELECT * FROM external_providers WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/requests', asyncHandler(async (req, res) => {
    const { provider_id = null, request_type, description, quantity = 1, eta = '' } = req.body;
    const ref = `EXT-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO external_requests (request_ref, provider_id, request_type, description, quantity, eta, status, availability_verified, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Submitted', 0, ?)`,
      [ref, provider_id ? Number(provider_id) : null, request_type, description, Number(quantity), eta, req.user.id]
    );
    res.status(201).json({ request: db.get('SELECT * FROM external_requests WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/requests/:id/status', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status, eta = null, availability_verified = false, notes = '' } = req.body;
    const row = db.get('SELECT * FROM external_requests WHERE id = ?', [id]);
    if (!row) throw new AppError(404, 'External request not found.');
    if (status === 'Confirmed' && !availability_verified && !row.availability_verified) {
      throw new AppError(400, 'Provider availability must be verified before marking Confirmed.');
    }

    db.transaction(() => {
      db.run(
        `UPDATE external_requests SET status = ?, eta = COALESCE(?, eta),
         availability_verified = CASE WHEN ? THEN 1 ELSE availability_verified END,
         updated_at = datetime('now') WHERE id = ?`,
        [status, eta, availability_verified ? 1 : 0, id]
      );
      validateAndRecordTransition(db, broker, {
        entityType: 'external', entityId: id, fromStatus: row.status, toStatus: status, actor: req.user, notes
      });
    })();
    res.json({ request: db.get('SELECT * FROM external_requests WHERE id = ?', [id]) });
  }));

  router.post('/purchase-orders', asyncHandler(async (req, res) => {
    const { supplier_id, item_summary, total_amount } = req.body;
    const prRef = `PR-${Date.now().toString().slice(-6)}`;
    const poRef = `PO-${Date.now().toString().slice(-6)}`;
    const pr = db.run('INSERT INTO purchase_requests (pr_ref, item_summary, estimated_cost, status, requested_by) VALUES (?, ?, ?, ?, ?)',
      [prRef, item_summary, Number(total_amount), 'Approved', req.user.id]);
    const po = db.run('INSERT INTO purchase_orders (po_ref, pr_id, supplier_id, total_amount, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [poRef, pr.lastInsertRowid, Number(supplier_id), Number(total_amount), 'Issued', req.user.id]);
    res.status(201).json({ purchaseOrder: db.get('SELECT * FROM purchase_orders WHERE id = ?', [po.lastInsertRowid]) });
  }));

  return router;
}
