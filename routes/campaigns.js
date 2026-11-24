import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';

export function createCampaignsRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/', asyncHandler(async (req, res) => {
    const canSeeAll = ['publisher', 'approver', 'admin'].includes(req.user.role);
    const where = canSeeAll ? '1=1' : "c.status = 'Published'";
    const campaigns = db.all(
      `SELECT c.*, u.full_name as creator_name, COALESCE(cm.impressions, 0) as impressions, COALESCE(cm.clicks, 0) as clicks
       FROM campaigns c
       JOIN users u ON u.id = c.created_by
       LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id
       WHERE ${where} ORDER BY c.id DESC`
    );
    const approvals = canSeeAll ? db.all(
      `SELECT ca.*, c.name as campaign_name, u.full_name as reviewer_name
       FROM campaign_approvals ca JOIN campaigns c ON c.id = ca.campaign_id JOIN users u ON u.id = ca.reviewer_id
       ORDER BY ca.id DESC LIMIT 50`
    ) : [];
    res.json({ campaigns, approvals });
  }));

  router.post('/', requirePermission('publisher.create'), upload.single('banner'), asyncHandler(async (req, res) => {
    const { name, description, destination_url = '#patient/doctors', offer_terms = '', audience = 'Patients', branch_id = 1, start_date, end_date } = req.body;
    if (!name || !description) throw new AppError(400, 'Campaign name and description are required.');

    let bannerId = null;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'campaigns')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      bannerId = aInfo.lastInsertRowid;
    }

    const info = db.run(
      `INSERT INTO campaigns (name, description, destination_url, offer_terms, banner_attachment_id, audience, branch_id, start_date, end_date, status, is_sponsored, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Approval', 1, ?)`,
      [name, description, destination_url, offer_terms, bannerId, audience, Number(branch_id), start_date || new Date().toISOString().slice(0, 10), end_date || '2027-12-31', req.user.id]
    );
    db.run('INSERT INTO campaign_metrics (campaign_id, impressions, clicks) VALUES (?, 0, 0)', [info.lastInsertRowid]);
    if (broker) {
      broker.publish('campaign:submitted', { campaignId: info.lastInsertRowid, name }, { roles: ['approver', 'admin'] });
    }
    res.status(201).json({ campaign: db.get('SELECT * FROM campaigns WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/:id/review', requirePermission('approver.review'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const camp = db.get('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!camp) throw new AppError(404, 'Campaign not found.');
    if (camp.created_by === req.user.id && req.user.role !== 'admin') {
      throw new AppError(403, 'Publishers cannot approve their own campaigns.');
    }
    const { decision, comments = '' } = req.body;
    const status = decision === 'Approved' ? 'Published' : decision === 'Rejected' ? 'Rejected' : 'Changes Requested';
    db.run('UPDATE campaigns SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
    db.run('INSERT INTO campaign_approvals (campaign_id, reviewer_id, decision, comments) VALUES (?, ?, ?, ?)', [id, req.user.id, decision, comments]);
    res.json({ campaign: db.get('SELECT * FROM campaigns WHERE id = ?', [id]) });
  }));

  router.post('/:id/track', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const col = req.body.event === 'click' ? 'clicks' : 'impressions';
    db.run(`UPDATE campaign_metrics SET ${col} = ${col} + 1, updated_at = datetime('now') WHERE campaign_id = ?`, [id]);
    res.json({ ok: true });
  }));

  return router;
}
