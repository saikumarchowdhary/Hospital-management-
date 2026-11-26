import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission, requireRole } from '../middleware/roles.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

function allowSelfApproval(db) {
  const row = db.get("SELECT value FROM settings WHERE key = 'allow_self_approval'");
  return row?.value === 'true';
}

export function createPublisherRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  // Publisher / Approver / Admin operational dashboard KPIs
  router.get('/dashboard', requireRole('publisher', 'approver', 'admin'), asyncHandler(async (_req, res) => {
    const noticeCounts = db.get(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END) as draft,
              SUM(CASE WHEN status = 'Pending Approval' THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) as under_review,
              SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved,
              SUM(CASE WHEN status = 'Changes Requested' THEN 1 ELSE 0 END) as changes_requested,
              SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
              SUM(CASE WHEN status = 'Published' AND date(expiry_date) >= date('now') THEN 1 ELSE 0 END) as published_active,
              SUM(CASE WHEN status = 'Published' AND date(expiry_date) < date('now') THEN 1 ELSE 0 END) as expired,
              SUM(CASE WHEN status = 'Archived' THEN 1 ELSE 0 END) as archived,
              SUM(CASE WHEN status IN ('Pending Approval', 'Under Review') AND priority IN ('High', 'Urgent', 'Emergency', 'Restricted') THEN 1 ELSE 0 END) as urgent_pending
       FROM announcements`
    );
    const campCounts = db.get(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'Published' AND date(end_date) >= date('now') THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN status IN ('Pending Approval', 'Under Review') THEN 1 ELSE 0 END) as pending
       FROM campaigns`
    );
    const ackSummary = db.get(
      `SELECT COUNT(*) as total_acks,
              COUNT(DISTINCT announcement_id) as notices_tracked
       FROM notice_acknowledgements WHERE acknowledged_at IS NOT NULL`
    );
    const departments = db.all('SELECT id, name FROM departments WHERE is_active = 1 ORDER BY name');
    const branches = db.all('SELECT id, code, name FROM branches WHERE is_active = 1 ORDER BY id');

    res.json({
      kpis: {
        totalNotices: Number(noticeCounts?.total || 0),
        draftNotices: Number(noticeCounts?.draft || 0),
        pendingNotices: Number(noticeCounts?.pending || 0),
        underReviewNotices: Number(noticeCounts?.under_review || 0),
        approvedNotices: Number(noticeCounts?.approved || 0),
        changesRequestedNotices: Number(noticeCounts?.changes_requested || 0),
        rejectedNotices: Number(noticeCounts?.rejected || 0),
        publishedNotices: Number(noticeCounts?.published_active || 0),
        expiredNotices: Number(noticeCounts?.expired || 0),
        archivedNotices: Number(noticeCounts?.archived || 0),
        urgentPendingNotices: Number(noticeCounts?.urgent_pending || 0),
        activeCampaigns: Number(campCounts?.active || 0),
        pendingCampaigns: Number(campCounts?.pending || 0),
        totalAcknowledgements: Number(ackSummary?.total_acks || 0)
      },
      policy: {
        allowSelfApproval: allowSelfApproval(db)
      },
      departments,
      branches
    });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const canSeeAll = ['publisher', 'approver', 'admin'].includes(req.user.role);
    const { status, category, priority } = req.query;

    let rows = db.all(
      `SELECT a.*, u.full_name as author_name,
              d.name as department_name, b.name as branch_name,
              att.original_name as attachment_name,
              (SELECT audience_value FROM announcement_audience aa WHERE aa.announcement_id = a.id LIMIT 1) as audience,
              (SELECT COUNT(*) FROM notice_acknowledgements na WHERE na.announcement_id = a.id AND na.acknowledged_at IS NOT NULL) as unique_acks_count,
              (SELECT COUNT(*) FROM notice_acknowledgements na WHERE na.announcement_id = a.id) as unique_views_count,
              (SELECT na.acknowledged_at FROM notice_acknowledgements na WHERE na.announcement_id = a.id AND na.user_id = ? LIMIT 1) as my_acknowledged_at,
              CASE WHEN date(a.expiry_date) < date('now') THEN 1 ELSE 0 END as is_expired
       FROM announcements a
       JOIN users u ON u.id = a.created_by
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN branches b ON b.id = a.branch_id
       LEFT JOIN attachments att ON att.id = a.attachment_id
       ${canSeeAll ? 'WHERE 1=1' : "WHERE a.status = 'Published' AND date(a.start_date) <= date('now') AND date(a.expiry_date) >= date('now')"}
       ORDER BY CASE WHEN a.priority IN ('Emergency', 'Urgent') THEN 0 WHEN a.priority = 'High' THEN 1 ELSE 2 END, a.id DESC`,
      [req.user.id]
    );

    if (!canSeeAll) {
      rows = rows.filter((a) => {
        const aud = String(a.audience || 'all').toLowerCase();
        const roleOk =
          aud === 'all' ||
          (aud === 'staff' && req.user.is_staff) ||
          (aud === 'patients' && req.user.role === 'patient') ||
          (aud === 'doctors' && req.user.role === 'doctor') ||
          (aud === 'nurses' && req.user.role === 'nurse') ||
          aud === req.user.role;
        const deptOk = !a.department_id || !req.user.department_id || Number(a.department_id) === Number(req.user.department_id);
        const branchOk = !a.branch_id || !req.user.branch_id || Number(a.branch_id) === Number(req.user.branch_id);
        return roleOk && deptOk && branchOk;
      });
    } else {
      if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
      if (category && category !== 'all') rows = rows.filter((r) => r.category === category);
      if (priority && priority !== 'all') rows = rows.filter((r) => r.priority === priority);
    }

    const approvals = canSeeAll
      ? db.all(
          `SELECT ap.*, a.title as announcement_title, a.priority as announcement_priority,
                  u.full_name as reviewer_name, u.role_id
           FROM announcement_approvals ap
           JOIN announcements a ON a.id = ap.announcement_id
           JOIN users u ON u.id = ap.reviewer_id
           ORDER BY ap.id DESC LIMIT 100`
        )
      : [];

    res.json({ announcements: rows, approvals });
  }));

  router.post('/', requirePermission('publisher.create'), upload.single('attachment'), asyncHandler(async (req, res) => {
    const {
      title,
      body,
      category = 'General',
      priority = 'Normal',
      start_date,
      expiry_date,
      audience = 'all',
      department_id = null,
      branch_id = null,
      submit_for_approval = 'true'
    } = req.body;
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
      `INSERT INTO announcements (title, body, category, priority, attachment_id, department_id, branch_id, start_date, expiry_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        body.trim(),
        String(category || 'General'),
        String(priority || 'Normal'),
        attachmentId,
        department_id ? Number(department_id) : null,
        branch_id ? Number(branch_id) : null,
        start_date || new Date().toISOString().slice(0, 10),
        expiry_date || '2027-12-31',
        status,
        req.user.id
      ]
    );
    db.run('INSERT INTO announcement_audience (announcement_id, audience_type, audience_value) VALUES (?, ?, ?)',
      [info.lastInsertRowid, 'role', audience]);

    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: status === 'Pending Approval' ? 'announcement.submitted' : 'announcement.draft_created',
      entityType: 'announcement',
      entityId: info.lastInsertRowid,
      details: JSON.stringify({ title, category, priority, audience, status }),
      ip: req.ip
    });

    if (status === 'Pending Approval') {
      createNotification(db, broker, {
        roles: ['approver', 'admin'],
        title: ['Urgent', 'Emergency', 'High'].includes(priority) ? `[${priority}] Notice Awaiting Approval` : 'Notice Awaiting Approval',
        message: `"${title}" submitted by ${req.user.full_name}.`,
        eventType: 'announcement:submitted'
      });
    }
    res.status(201).json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/:id', requirePermission('publisher.create'), upload.single('attachment'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT * FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    if (ann.created_by !== req.user.id && req.user.role !== 'admin') {
      throw new AppError(403, 'You can only edit your own announcements.');
    }
    if (!['Draft', 'Changes Requested', 'Rejected'].includes(ann.status) && req.user.role !== 'admin') {
      throw new AppError(409, 'Only Draft, Rejected, or Changes Requested announcements can be edited.');
    }

    let attachmentId = ann.attachment_id;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'publisher')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      attachmentId = aInfo.lastInsertRowid;
    }

    const {
      title = ann.title,
      body = ann.body,
      category = ann.category || 'General',
      priority = ann.priority,
      start_date = ann.start_date,
      expiry_date = ann.expiry_date,
      audience,
      department_id = ann.department_id,
      branch_id = ann.branch_id
    } = req.body;

    db.run(
      `UPDATE announcements
       SET title = ?, body = ?, category = ?, priority = ?, attachment_id = ?, department_id = ?, branch_id = ?, start_date = ?, expiry_date = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        title,
        body,
        category,
        priority,
        attachmentId,
        department_id ? Number(department_id) : null,
        branch_id ? Number(branch_id) : null,
        start_date,
        expiry_date,
        id
      ]
    );
    if (audience) {
      db.run('DELETE FROM announcement_audience WHERE announcement_id = ?', [id]);
      db.run('INSERT INTO announcement_audience (announcement_id, audience_type, audience_value) VALUES (?, ?, ?)', [id, 'role', audience]);
    }
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'announcement.updated',
      entityType: 'announcement',
      entityId: id,
      details: JSON.stringify({ before: { title: ann.title, status: ann.status }, after: { title, priority, category } }),
      ip: req.ip
    });
    res.json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }));

  router.post('/:id/submit', requirePermission('publisher.create'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT * FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    if (!['Draft', 'Changes Requested', 'Rejected'].includes(ann.status)) {
      throw new AppError(409, `Announcement in status "${ann.status}" cannot be submitted.`);
    }
    db.run("UPDATE announcements SET status = 'Pending Approval', updated_at = datetime('now') WHERE id = ?", [id]);
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'announcement.submitted', entityType: 'announcement', entityId: id, ip: req.ip });
    createNotification(db, broker, {
      roles: ['approver', 'admin'],
      title: 'Notice Submitted for Approval',
      message: `"${ann.title}" is ready for review.`,
      eventType: 'announcement:submitted'
    });
    res.json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }));

  router.post('/:id/review', requirePermission('approver.review'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT * FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    // Publisher / creator must not self-approve unless explicit system setting allows admin override
    if (ann.created_by === req.user.id && (req.user.role !== 'admin' || !allowSelfApproval(db))) {
      throw new AppError(403, 'Creators cannot approve their own announcements (separation of duties enforced).');
    }
    const { decision, comments = '', auto_publish = true } = req.body;
    const statusMap = {
      'Under Review': 'Under Review',
      Approved: auto_publish === false || auto_publish === 'false' ? 'Approved' : 'Published',
      Rejected: 'Rejected',
      'Changes Requested': 'Changes Requested'
    };
    const nextStatus = statusMap[decision];
    if (!nextStatus) throw new AppError(400, 'Invalid review decision.');
    if (['Rejected', 'Changes Requested'].includes(decision) && !String(comments).trim()) {
      throw new AppError(400, `Comments / reason are required when marking "${decision}".`);
    }

    db.run(
      `UPDATE announcements
       SET status = ?,
           published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [nextStatus, nextStatus, id]
    );
    db.run('INSERT INTO announcement_approvals (announcement_id, reviewer_id, decision, comments) VALUES (?, ?, ?, ?)',
      [id, req.user.id, decision, comments]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: `announcement.${decision.toLowerCase().replace(/\s+/g, '_')}`,
      entityType: 'announcement',
      entityId: id,
      details: JSON.stringify({ before: { status: ann.status }, after: { status: nextStatus, comments } }),
      ip: req.ip
    });

    if (nextStatus === 'Published') {
      createNotification(db, broker, {
        roleCode: 'all',
        title: ann.title,
        message: ann.body.slice(0, 140),
        eventType: 'notice:published'
      });
    } else {
      createNotification(db, broker, {
        userId: ann.created_by,
        title: `Notice ${decision}: ${ann.title}`,
        message: comments || `Your notice status changed to ${nextStatus}.`,
        eventType: 'announcement:reviewed'
      });
    }
    res.json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }));

  router.post('/:id/publish', requirePermission('publisher.create'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT * FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    if (ann.status !== 'Approved' && req.user.role !== 'admin') {
      throw new AppError(403, 'Notices must be approved by an Approver before publishing.');
    }
    db.run("UPDATE announcements SET status = 'Published', published_at = COALESCE(published_at, datetime('now')), updated_at = datetime('now') WHERE id = ?", [id]);
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'announcement.published', entityType: 'announcement', entityId: id, ip: req.ip });
    createNotification(db, broker, {
      roleCode: 'all',
      title: ann.title,
      message: ann.body.slice(0, 140),
      eventType: 'notice:published'
    });
    res.json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }));

  router.post('/:id/archive', requirePermission('publisher.create'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT * FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    db.run("UPDATE announcements SET status = 'Archived', archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [id]);
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'announcement.archived', entityType: 'announcement', entityId: id, ip: req.ip });
    res.json({ announcement: db.get('SELECT * FROM announcements WHERE id = ?', [id]) });
  }));

  router.post('/:id/view', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT id FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    const existing = db.get('SELECT id FROM notice_acknowledgements WHERE announcement_id = ? AND user_id = ?', [id, req.user.id]);
    if (!existing) {
      db.run('INSERT INTO notice_acknowledgements (announcement_id, user_id, viewed_at) VALUES (?, ?, datetime(\'now\'))', [id, req.user.id]);
      db.run('UPDATE announcements SET views_count = views_count + 1 WHERE id = ?', [id]);
    }
    res.json({ ok: true });
  }));

  router.post('/:id/ack', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get('SELECT id FROM announcements WHERE id = ?', [id]);
    if (!ann) throw new AppError(404, 'Announcement not found.');
    const existing = db.get('SELECT id, acknowledged_at FROM notice_acknowledgements WHERE announcement_id = ? AND user_id = ?', [id, req.user.id]);
    if (!existing) {
      db.run("INSERT INTO notice_acknowledgements (announcement_id, user_id, viewed_at, acknowledged_at) VALUES (?, ?, datetime('now'), datetime('now'))", [id, req.user.id]);
      db.run('UPDATE announcements SET views_count = views_count + 1, acks_count = acks_count + 1 WHERE id = ?', [id]);
    } else if (!existing.acknowledged_at) {
      db.run("UPDATE notice_acknowledgements SET acknowledged_at = datetime('now') WHERE id = ?", [existing.id]);
      db.run('UPDATE announcements SET acks_count = acks_count + 1 WHERE id = ?', [id]);
    }
    res.json({ ok: true });
  }));

  router.get('/:id/acknowledgements', requireRole('publisher', 'approver', 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const ann = db.get(
      `SELECT a.*, (SELECT audience_value FROM announcement_audience aa WHERE aa.announcement_id = a.id LIMIT 1) as audience
       FROM announcements a WHERE a.id = ?`,
      [id]
    );
    if (!ann) throw new AppError(404, 'Announcement not found.');

    const acknowledgements = db.all(
      `SELECT na.*, u.full_name, u.user_code, u.email, r.name as role_name, r.code as role_code
       FROM notice_acknowledgements na
       JOIN users u ON u.id = na.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE na.announcement_id = ?
       ORDER BY na.acknowledged_at DESC, na.viewed_at DESC`,
      [id]
    );

    const aud = String(ann.audience || 'all').toLowerCase();
    const targetUsers = db.all(
      `SELECT u.id, u.full_name, u.user_code, u.email, r.code as role_code, r.name as role_name, r.is_staff, u.department_id, u.branch_id
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = 1 AND r.code != 'pending_staff'`
    ).filter((u) => {
      const roleOk =
        aud === 'all' ||
        (aud === 'staff' && u.is_staff) ||
        (aud === 'patients' && u.role_code === 'patient') ||
        (aud === 'doctors' && u.role_code === 'doctor') ||
        (aud === 'nurses' && u.role_code === 'nurse') ||
        aud === u.role_code;
      const deptOk = !ann.department_id || !u.department_id || Number(ann.department_id) === Number(u.department_id);
      const branchOk = !ann.branch_id || !u.branch_id || Number(ann.branch_id) === Number(u.branch_id);
      return roleOk && deptOk && branchOk;
    });

    const ackMap = new Map(acknowledgements.map((a) => [a.user_id, a]));
    const recipients = targetUsers.map((u) => {
      const rec = ackMap.get(u.id);
      return {
        user_id: u.id,
        full_name: u.full_name,
        user_code: u.user_code,
        email: u.email,
        role_name: u.role_name,
        viewed_at: rec?.viewed_at || null,
        acknowledged_at: rec?.acknowledged_at || null,
        status: rec?.acknowledged_at ? 'Acknowledged' : rec?.viewed_at ? 'Viewed' : 'Unread'
      };
    });

    res.json({
      announcement: ann,
      summary: {
        totalRecipients: recipients.length,
        acknowledgedCount: recipients.filter((r) => r.status === 'Acknowledged').length,
        viewedCount: recipients.filter((r) => r.status === 'Viewed' || r.status === 'Acknowledged').length,
        unreadCount: recipients.filter((r) => r.status === 'Unread').length
      },
      acknowledgements,
      recipients
    });
  }));

  return router;
}
