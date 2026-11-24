import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../services/audit.js';

export function createBloodBankRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/overview', requirePermission('bloodbank.manage', 'clinical.read', 'external.manage'), asyncHandler(async (_req, res) => {
    const groups = db.all('SELECT * FROM blood_groups ORDER BY id');
    const donors = db.all(
      `SELECT bd.*, bg.group_name FROM blood_donors bd JOIN blood_groups bg ON bg.id = bd.blood_group_id ORDER BY bd.id DESC`
    );
    const inventory = db.all(
      `SELECT bi.*, bg.group_name FROM blood_inventory bi JOIN blood_groups bg ON bg.id = bi.blood_group_id ORDER BY bi.expiry_date ASC`
    );
    const requests = db.all(
      `SELECT br.*, bg.group_name, pu.full_name as patient_name, p.patient_code
       FROM blood_requests br
       JOIN blood_groups bg ON bg.id = br.blood_group_id
       JOIN patient_profiles p ON p.id = br.patient_id JOIN users pu ON pu.id = p.user_id
       ORDER BY br.id DESC`
    );
    const transfers = db.all(
      `SELECT bt.*, bg.group_name FROM blood_transfers bt JOIN blood_groups bg ON bg.id = bt.blood_group_id ORDER BY bt.id DESC`
    );
    const issues = db.all(
      `SELECT bi.*, br.request_ref, bg.group_name, inv.bag_code, inv.component, pu.full_name as patient_name, iu.full_name as issued_by_name
       FROM blood_issues bi
       JOIN blood_requests br ON br.id = bi.request_id
       JOIN blood_groups bg ON bg.id = br.blood_group_id
       JOIN blood_inventory inv ON inv.id = bi.inventory_id
       JOIN patient_profiles p ON p.id = br.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN users iu ON iu.id = bi.issued_by
       ORDER BY bi.id DESC LIMIT 50`
    );
    res.json({ groups, donors, inventory, requests, transfers, issues });
  }));

  router.post('/donors', requirePermission('bloodbank.manage'), asyncHandler(async (req, res) => {
    const { full_name, blood_group_id, phone } = req.body;
    const code = `DON-${String(Date.now()).slice(-5)}`;
    const info = db.run(
      'INSERT INTO blood_donors (donor_code, full_name, blood_group_id, phone, last_donation_date) VALUES (?, ?, ?, ?, date(\'now\'))',
      [code, full_name, Number(blood_group_id), phone]
    );
    res.status(201).json({ donor: db.get('SELECT * FROM blood_donors WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/inventory', requirePermission('bloodbank.manage'), asyncHandler(async (req, res) => {
    const { blood_group_id, component = 'Whole Blood', donor_id = null, expiry_date, screening_passed = true } = req.body;
    const code = `BAG-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO blood_inventory (bag_code, blood_group_id, component, donor_id, collection_date, expiry_date, screening_passed, status)
       VALUES (?, ?, ?, ?, date('now'), ?, ?, 'Available')`,
      [code, Number(blood_group_id), component, donor_id ? Number(donor_id) : null, expiry_date, screening_passed ? 1 : 0]
    );
    res.status(201).json({ bag: db.get('SELECT * FROM blood_inventory WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/requests', asyncHandler(async (req, res) => {
    const { patient_id, blood_group_id, component = 'Whole Blood', units_requested = 1, urgency = 'Routine' } = req.body;
    const ref = `BLD-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO blood_requests (request_ref, patient_id, blood_group_id, component, units_requested, urgency, status, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Requested', ?)`,
      [ref, Number(patient_id), Number(blood_group_id), component, Number(units_requested), urgency, req.user.id]
    );
    if (broker) {
      broker.publish('bloodbank:request', { requestId: info.lastInsertRowid, ref }, { roles: ['external_coordinator', 'admin', 'lab_staff'] });
    }
    res.status(201).json({ request: db.get('SELECT * FROM blood_requests WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/requests/:id/issue', requirePermission('bloodbank.manage'), asyncHandler(async (req, res) => {
    const reqId = Number(req.params.id);
    const { inventory_id, compatibility_checked } = req.body;
    if (!compatibility_checked) {
      throw new AppError(400, 'Authorized compatibility and cross-match check must be verified before issuing blood.');
    }

    const result = db.transaction(() => {
      const br = db.get('SELECT * FROM blood_requests WHERE id = ?', [reqId]);
      if (!br) throw new AppError(404, 'Blood request not found.');
      const bag = db.get('SELECT * FROM blood_inventory WHERE id = ?', [Number(inventory_id)]);
      if (!bag || bag.status !== 'Available') throw new AppError(409, 'Selected blood unit is not available.');
      if (!bag.screening_passed) throw new AppError(409, 'Selected blood unit has not passed screening.');

      db.run('UPDATE blood_inventory SET status = \'Issued\', updated_at = datetime(\'now\') WHERE id = ?', [bag.id]);
      db.run('UPDATE blood_requests SET compatibility_checked = 1, status = \'Issued\', updated_at = datetime(\'now\') WHERE id = ?', [br.id]);
      db.run(
        `INSERT INTO blood_issues (request_id, inventory_id, compatibility_verified_by, issued_by)
         VALUES (?, ?, ?, ?)`,
        [br.id, bag.id, req.user.id, req.user.id]
      );
      logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'blood.issued', entityType: 'blood_request', entityId: br.id, details: { bagCode: bag.bag_code } });
      return db.get('SELECT * FROM blood_requests WHERE id = ?', [br.id]);
    })();

    res.json({ request: result });
  }));

  router.post('/transfers', requirePermission('bloodbank.manage', 'external.manage'), asyncHandler(async (req, res) => {
    const { blood_group_id, units = 2, direction = 'Inbound', external_provider_id = null } = req.body;
    const ref = `BTR-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO blood_transfers (transfer_ref, external_provider_id, blood_group_id, units, direction, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'Requested', ?)`,
      [ref, external_provider_id ? Number(external_provider_id) : null, Number(blood_group_id), Number(units), direction, req.user.id]
    );
    res.status(201).json({ transfer: db.get('SELECT * FROM blood_transfers WHERE id = ?', [info.lastInsertRowid]) });
  }));

  return router;
}
