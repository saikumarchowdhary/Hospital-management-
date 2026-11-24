import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

export function createPublisherRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/', asyncHandler(async (req, res) => {
    const canSeeAll = ['publisher', 'approver', 'admin'].includes(req.user.role);
    const where = canSeeAll ? '1=1' : "a.status = 'Published'";
    const rows = db.all(
      `SELECT a.*, u.full_name as author_name,
              (SELECT audience_value FROM announcement_audience aa WHERE aa.announcement_id = a.id LIMIT 1) as audience
       FROM announcements a JOIN users u ON u.id = a.created_by
       WHERE ${where} ORDER BY a.id DESC`
    );
    const approvals = canSeeAll ? db.all(
      `SELECT ap.*, a.title as announcement_title, u.full_name as reviewer_name
       FROM announcement_approvals ap
       JOIN announcements a ON a.id = ap.announcement_id
       JOIN users u ON u.id = ap.reviewer_id
       ORDER BY ap.id DESC LIMIT 50`
    ) : [];
    res.json({ announcements: rows, approvals });
  }));

  router.post('/', requirePermission('publisher.create'), upload.single('attachment'), asyncHandler(async (req, res) => {
    const { title, body, priority = 'Normal', start_date, expiry_date, audience = 'all', submit_for_approval = 'true' } = req.body;
    if (!title || !body) throw new AppError(400, 'Title and message body are required.');

    let attachmentId = null;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'publisher')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      attachmentId = aInfo.lastInsertRowid;
    }

    const status = submit_for_approval === 'true' || submit_for_approval === true ? 'Pending Approval' : 'Draft';
    const info = db.run(
      `INSERT INTO announcements (title, body, priority, attachment_id, start_date, expiry_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, body, priority, attachmentId, start_date || new Date().toISOString().slice(0, 10), expiry_date || '2027-12-31', status, req.user.id]
    );
    db.run('INSERT INTO announcement_audience (announcement_id, audience_type, audience_value) VALUES (?, ?, ?)',
      [info.lastInsertRowid, 'role', audience]);

    if (status === 'Pending Approval') {
      createNotification(db, broker, {
        roles: ['approver', 'admin'],
        title: 'Notice Awaiting Approval',
        message: `"${title}" submitted by ${req.user.full_name}.`,
        eventType: 'announcement:submitted'
      });
    }
    res.status(201).json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.post('/:id/review', requirePermission('approver.review'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT * FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    // Publisher must not approve their own restricted notice!
    if (ann.created_by === req.user.id && req.user.role !== 'admin') {
      throw new AppError(403, 'Publishers cannot approve their own announcements.');
    }
    const { decision, comments = '' } = req.body;
    const statusMap = { Approved: 'Published', Rejected: 'Rejected', 'Changes Requested': 'Changes Requested' };
    const nextStatus = statusMap[decision];
    if (!nextStatus) throw new AppError(400, 'Invalid review decision.');

    db.run('UPDATE announcements SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextStatus, id]);
    db.run('INSERT INTO announcement_approvals (announcement_id, reviewer_id, decision, comments) VALUES (?, ?, ?, ?)',
      [id, req.user.id, decision, comments]);
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: `announcement.${decision.toLowerCase()}`, entityType: 'announcement', entityId: id });

    if (nextStatus === 'Published') {
      createNotification(db, broker, {
        roleCode: 'all',
        title: ann.title,
        message: ann.body.slice(0, 140),
        eventType: 'notice:published'
      });
    }
    res.json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }));

  router.post('/:id/ack', asyncHandler(async (req, res) => {
    db.run('UPDATE announcements SET views_count = views_count + 1, acks_count = acks_count + 1 WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  }));

  return router;
}
