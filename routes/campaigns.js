import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

function allowSelfApproval(db) {
  const row = db.get("SELECT value FROM settings WHERE key = 'allow_self_approval'");
  return row?.value === 'true';
}

export function createCampaignsRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/', asyncHandler(async (req, res) => {
    const canSeeAll = ['publisher', 'approver', 'admin'].includes(req.user.role);
    const where = canSeeAll
      ? '1=1'
      : "c.status = 'Published' AND date(c.start_date) <= date('now') AND date(c.end_date) >= date('now')";
    const campaigns = db.all(
      `SELECT c.*, u.full_name as creator_name, b.name as branch_name,
              att.original_name as banner_name,
              COALESCE(cm.impressions, 0) as impressions, COALESCE(cm.clicks, 0) as clicks,
              CASE WHEN date(c.end_date) < date('now') THEN 1 ELSE 0 END as is_expired
       FROM campaigns c
       JOIN users u ON u.id = c.created_by
       LEFT JOIN branches b ON b.id = c.branch_id
       LEFT JOIN attachments att ON att.id = c.banner_attachment_id
       LEFT JOIN campaign_metrics cm ON cm.campaign_id = c.id
       WHERE ${where} ORDER BY c.id DESC`
    );
    const approvals = canSeeAll
      ? db.all(
          `SELECT ca.*, c.name as campaign_name, u.full_name as reviewer_name
           FROM campaign_approvals ca JOIN campaigns c ON c.id = ca.campaign_id JOIN users u ON u.id = ca.reviewer_id
           ORDER BY ca.id DESC LIMIT 100`
        )
      : [];
    res.json({ campaigns, approvals });
  }));

  router.post('/', requirePermission('publisher.create'), upload.single('banner'), asyncHandler(async (req, res) => {
    const {
      name,
      description,
      destination_url = '#patient/doctors',
      offer_terms = '',
      audience = 'Patients',
      branch_id = 1,
      start_date,
      end_date,
      submit_for_approval = 'true'
    } = req.body;
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

    const status = submit_for_approval === 'false' || submit_for_approval === false ? 'Draft' : 'Pending Approval';
    const info = db.run(
      `INSERT INTO campaigns (name, description, destination_url, offer_terms, banner_attachment_id, audience, branch_id, start_date, end_date, status, is_sponsored, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [name.trim(), description.trim(), destination_url, offer_terms, bannerId, audience, Number(branch_id || 1), start_date || new Date().toISOString().slice(0, 10), end_date || '2027-12-31', status, req.user.id]
    );
    db.run('INSERT INTO campaign_metrics (campaign_id, impressions, clicks) VALUES (?, 0, 0)', [info.lastInsertRowid]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: status === 'Pending Approval' ? 'campaign.submitted' : 'campaign.draft_created',
      entityType: 'campaign',
      entityId: info.lastInsertRowid,
      ip: req.ip
    });
    if (status === 'Pending Approval') {
      createNotification(db, broker, {
        roles: ['approver', 'admin'],
        title: 'Campaign Awaiting Approval',
        message: `Campaign "${name}" submitted by ${req.user.full_name}.`,
        eventType: 'campaign:submitted'
      });
    }
    res.status(201).json({ campaign: db.get('SELECT * FROM campaigns WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/:id', requirePermission('publisher.create'), upload.single('banner'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const camp = db.get('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!camp) throw new AppError(404, 'Campaign not found.');
    if (!['Draft', 'Changes Requested', 'Rejected'].includes(camp.status) && req.user.role !== 'admin') {
      throw new AppError(409, 'Only Draft, Rejected, or Changes Requested campaigns can be edited.');
    }
    let bannerId = camp.banner_attachment_id;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'campaigns')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      bannerId = aInfo.lastInsertRowid;
    }
    const {
      name = camp.name,
      description = camp.description,
      destination_url = camp.destination_url,
      offer_terms = camp.offer_terms,
      audience = camp.audience,
      branch_id = camp.branch_id,
      start_date = camp.start_date,
      end_date = camp.end_date
    } = req.body;
    db.run(
      `UPDATE campaigns
       SET name = ?, description = ?, destination_url = ?, offer_terms = ?, banner_attachment_id = ?, audience = ?, branch_id = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [name, description, destination_url, offer_terms, bannerId, audience, Number(branch_id || 1), start_date, end_date, id]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'campaign.updated', entityType: 'campaign', entityId: id, ip: req.ip });
    res.json({ campaign: db.get('SELECT * FROM campaigns WHERE id = ?', [id]) });
  }));

  router.post('/:id/submit', requirePermission('publisher.create'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const camp = db.get('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!camp) throw new AppError(404, 'Campaign not found.');
    db.run("UPDATE campaigns SET status = 'Pending Approval', updated_at = datetime('now') WHERE id = ?", [id]);
    createNotification(db, broker, {
      roles: ['approver', 'admin'],
      title: 'Campaign Submitted for Approval',
      message: `Campaign "${camp.name}" ready for review.`,
      eventType: 'campaign:submitted'
    });
    res.json({ campaign: db.get('SELECT * FROM campaigns WHERE id = ?', [id]) });
  }));

  router.post('/:id/review', requirePermission('approver.review'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const camp = db.get('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!camp) throw new AppError(404, 'Campaign not found.');
    if (camp.created_by === req.user.id && (req.user.role !== 'admin' || !allowSelfApproval(db))) {
      throw new AppError(403, 'Creators cannot approve their own campaigns.');
    }
    const { decision, comments = '', auto_publish = true } = req.body;
    const statusMap = {
      'Under Review': 'Under Review',
      Approved: auto_publish === false || auto_publish === 'false' ? 'Approved' : 'Published',
      Rejected: 'Rejected',
      'Changes Requested': 'Changes Requested'
    };
    const status = statusMap[decision];
    if (!status) throw new AppError(400, 'Invalid review decision.');
    if (['Rejected', 'Changes Requested'].includes(decision) && !String(comments).trim()) {
      throw new AppError(400, `Comments are required for "${decision}".`);
    }
    db.run(
      `UPDATE campaigns
       SET status = ?,
           published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [status, status, id]
    );
    db.run('INSERT INTO campaign_approvals (campaign_id, reviewer_id, decision, comments) VALUES (?, ?, ?, ?)', [id, req.user.id, decision, comments]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: `campaign.${decision.toLowerCase().replace(/\s+/g, '_')}`,
      entityType: 'campaign',
      entityId: id,
      details: JSON.stringify({ before: { status: camp.status }, after: { status, comments } }),
      ip: req.ip
    });
    res.json({ campaign: db.get('SELECT * FROM campaigns WHERE id = ?', [id]) });
  }));

  router.post('/:id/status', requirePermission('publisher.create'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const camp = db.get('SELECT * FROM campaigns WHERE id = ?', [id]);
    if (!camp) throw new AppError(404, 'Campaign not found.');
    const { status } = req.body;
    if (!['Published', 'Paused', 'Archived'].includes(status)) throw new AppError(400, 'Invalid campaign status.');
    if (status === 'Published' && !['Approved', 'Paused', 'Published'].includes(camp.status) && req.user.role !== 'admin') {
      throw new AppError(403, 'Campaign must be approved before publishing.');
    }
    db.run(
      `UPDATE campaigns
       SET status = ?,
           published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
           archived_at = CASE WHEN ? = 'Archived' THEN datetime('now') ELSE archived_at END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [status, status, status, id]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: `campaign.status_${status.toLowerCase()}`, entityType: 'campaign', entityId: id, ip: req.ip });
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
