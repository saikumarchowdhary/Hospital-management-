import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createInsuranceRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/overview', requirePermission('insurance.manage', 'finance.manage', 'admissions.manage'), asyncHandler(async (_req, res) => {
    const providers = db.all('SELECT * FROM insurance_providers ORDER BY name');
    const policies = db.all(
      `SELECT ip.*, p.patient_code, pu.full_name as patient_name, prov.name as provider_name
       FROM insurance_policies ip
       JOIN patient_profiles p ON p.id = ip.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN insurance_providers prov ON prov.id = ip.provider_id`
    );
    const cases = db.all(
      `SELECT ic.*, p.patient_code, pu.full_name as patient_name, ip.policy_number, prov.name as provider_name,
              cl.id as claim_id, cl.claim_ref, cl.claimed_amount, cl.settled_amount, cl.status as claim_status, cl.query_reason
       FROM insurance_cases ic
       JOIN patient_profiles p ON p.id = ic.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN insurance_policies ip ON ip.id = ic.policy_id
       JOIN insurance_providers prov ON prov.id = ip.provider_id
       LEFT JOIN insurance_claims cl ON cl.case_id = ic.id
       ORDER BY ic.id DESC`
    );
    res.json({ providers, policies, cases });
  }));

  router.post('/policies', requirePermission('insurance.manage'), asyncHandler(async (req, res) => {
    const { patient_id, provider_id, policy_number, coverage_limit = 50000, valid_until } = req.body;
    const info = db.run(
      `INSERT INTO insurance_policies (patient_id, provider_id, policy_number, coverage_limit, valid_until, eligibility_status)
       VALUES (?, ?, ?, ?, ?, 'Manually Recorded (Simulated TPA)')`,
      [Number(patient_id), Number(provider_id), policy_number, Number(coverage_limit), valid_until]
    );
    res.status(201).json({ policy: db.get('SELECT * FROM insurance_policies WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/cases', requirePermission('insurance.manage'), asyncHandler(async (req, res) => {
    const { patient_id, policy_id, admission_id = null, invoice_id = null, estimated_amount } = req.body;
    const ref = `INS-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO insurance_cases (case_ref, patient_id, policy_id, admission_id, invoice_id, estimated_amount, status, source_verification, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Submitted', 'Local Simulated TPA Workflow', ?)`,
      [ref, Number(patient_id), Number(policy_id), admission_id ? Number(admission_id) : null, invoice_id ? Number(invoice_id) : null, Number(estimated_amount), req.user.id]
    );
    db.run(
      'INSERT INTO pre_authorizations (case_id, requested_amount, status, updated_by) VALUES (?, ?, ?, ?)',
      [info.lastInsertRowid, Number(estimated_amount), 'Submitted', req.user.id]
    );
    const cRef = `CLM-${Date.now().toString().slice(-6)}`;
    db.run(
      'INSERT INTO insurance_claims (claim_ref, case_id, claimed_amount, status, updated_by) VALUES (?, ?, ?, ?, ?)',
      [cRef, info.lastInsertRowid, Number(estimated_amount), 'Submitted', req.user.id]
    );
    res.status(201).json({ insuranceCase: db.get('SELECT * FROM insurance_cases WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/cases/:id/status', requirePermission('insurance.manage'), asyncHandler(async (req, res) => {
    const caseId = Number(req.params.id);
    const { status, settled_amount = 0, query_reason = null } = req.body;
    const ic = db.get('SELECT * FROM insurance_cases WHERE id = ?', [caseId]);
    if (!ic) throw new AppError(404, 'Insurance case not found.');

    db.transaction(() => {
      db.run('UPDATE insurance_cases SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, ic.id]);
      db.run('UPDATE insurance_claims SET status = ?, settled_amount = ?, query_reason = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE case_id = ?',
        [status, Number(settled_amount), query_reason, req.user.id, ic.id]);
      validateAndRecordTransition(db, broker, {
        entityType: 'insurance',
        entityId: ic.id,
        fromStatus: ic.status,
        toStatus: status,
        actor: req.user,
        notes: query_reason || `Settled: $${settled_amount}`
      });
    })();

    res.json({ insuranceCase: db.get('SELECT * FROM insurance_cases WHERE id = ?', [caseId]) });
  }));

  return router;
}
