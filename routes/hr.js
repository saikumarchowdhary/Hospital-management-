import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission, requireRole } from '../middleware/roles.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createHrRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  const appUpload = upload
    ? upload.fields([
      { name: 'resume', maxCount: 1 },
      { name: 'certificate', maxCount: 1 }
    ])
    : (_req, _res, next) => next();

  // HR Overview Dashboard KPIs
  router.get('/dashboard', requirePermission('hr.manage'), asyncHandler(async (_req, res) => {
    const totalEmployees = db.get('SELECT COUNT(*) as c FROM employee_profiles').c;
    const activeEmployees = db.get("SELECT COUNT(*) as c FROM employee_profiles WHERE employment_status = 'Active'").c;
    const totalVacancies = db.get('SELECT COUNT(*) as c FROM job_vacancies').c;
    const openVacancies = db.get("SELECT COUNT(*) as c FROM job_vacancies WHERE status = 'Published' AND (closing_date IS NULL OR closing_date = '' OR date(closing_date) >= date('now'))").c;

    const appCounts = db.all('SELECT status, COUNT(*) as c FROM job_applications GROUP BY status');
    const byStatus = Object.fromEntries(appCounts.map((r) => [r.status, r.c]));
    const newApplications = byStatus['Submitted'] || 0;
    const underReviewApplications = byStatus['Under Review'] || 0;
    const shortlistedCandidates = byStatus['Shortlisted'] || 0;
    const scheduledInterviews = byStatus['Interview Scheduled'] || 0;
    const selectedCandidates = byStatus['Selected'] || 0;
    const rejectedCandidates = byStatus['Not Selected'] || 0;
    const pendingOffers = db.get("SELECT COUNT(*) as c FROM offers WHERE status = 'Issued'").c;

    const deptDistribution = db.all(
      `SELECT COALESCE(d.name, 'Unassigned') as department, COUNT(ep.id) as count
       FROM employee_profiles ep LEFT JOIN departments d ON d.id = ep.department_id
       GROUP BY ep.department_id ORDER BY count DESC`
    );
    const recentApplications = db.all(
      `SELECT ja.id, ja.application_ref, ja.status, ja.created_at, jv.title as vacancy_title, u.full_name as candidate_name
       FROM job_applications ja
       JOIN job_vacancies jv ON jv.id = ja.vacancy_id
       JOIN users u ON u.id = ja.candidate_user_id
       ORDER BY ja.id DESC LIMIT 8`
    );
    const upcomingInterviews = db.all(
      `SELECT i.*, ja.application_ref, u.full_name as candidate_name, jv.title as vacancy_title
       FROM interviews i
       JOIN job_applications ja ON ja.id = i.application_id
       JOIN users u ON u.id = ja.candidate_user_id
       JOIN job_vacancies jv ON jv.id = ja.vacancy_id
       WHERE i.outcome = 'Pending'
       ORDER BY i.scheduled_at ASC LIMIT 8`
    );

    res.json({
      kpis: {
        totalEmployees,
        activeEmployees,
        totalVacancies,
        openVacancies,
        totalApplications: appCounts.reduce((s, r) => s + r.c, 0),
        newApplications,
        underReviewApplications,
        shortlistedCandidates,
        scheduledInterviews,
        selectedCandidates,
        rejectedCandidates,
        pendingOffers
      },
      deptDistribution,
      recentApplications,
      upcomingInterviews
    });
  }));

  // Vacancies: HR/Admin/Approver see all; candidates/staff see open, non-expired Published vacancies
  router.get('/vacancies', asyncHandler(async (req, res) => {
    const canSeeAll = ['hr', 'admin', 'approver'].includes(req.user.role);
    const where = canSeeAll
      ? '1=1'
      : "jv.status = 'Published' AND (jv.closing_date IS NULL OR jv.closing_date = '' OR date(jv.closing_date) >= date('now'))";
    const vacancies = db.all(
      `SELECT jv.*, d.name as department_name, b.name as branch_name, u.full_name as created_by_name,
              au.full_name as approved_by_name,
              (SELECT COUNT(*) FROM job_applications ja WHERE ja.vacancy_id = jv.id) as applicant_count,
              CASE WHEN jv.closing_date IS NOT NULL AND jv.closing_date != '' AND date(jv.closing_date) < date('now') THEN 1 ELSE 0 END as is_expired
       FROM job_vacancies jv
       LEFT JOIN departments d ON d.id = jv.department_id
       LEFT JOIN branches b ON b.id = jv.branch_id
       LEFT JOIN users u ON u.id = jv.created_by
       LEFT JOIN users au ON au.id = jv.approved_by
       WHERE ${where} ORDER BY jv.id DESC`
    );
    res.json({ vacancies });
  }));

  router.post('/vacancies', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const {
      title, department_id = null, branch_id = 1, location = 'Main Campus',
      employment_type = 'Full-Time', positions = 1,
      required_experience = '', required_qualifications = '',
      description, opening_date = null, closing_date = null,
      status = 'Published'
    } = req.body;
    if (!title || !description) throw new AppError(400, 'Vacancy title and description are required.');
    if (!['Draft', 'Pending Approval', 'Published', 'Closed'].includes(status)) {
      throw new AppError(400, 'Invalid vacancy status.');
    }
    const code = `VAC-${Date.now().toString().slice(-5)}${crypto.randomInt(10, 99)}`;
    const info = db.run(
      `INSERT INTO job_vacancies (
         vacancy_code, title, department_id, branch_id, location, employment_type, positions,
         required_experience, required_qualifications, description, opening_date, closing_date,
         status, created_by, approved_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?)`,
      [
        code, title.trim(), department_id ? Number(department_id) : null, Number(branch_id),
        location, employment_type, Number(positions),
        required_experience, required_qualifications, description,
        opening_date || null, closing_date || null,
        status, req.user.id, status === 'Published' ? req.user.id : null
      ]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.vacancy_created', entityType: 'job_vacancy', entityId: info.lastInsertRowid, details: { title, status } });
    if (status === 'Pending Approval') {
      createNotification(db, broker, {
        roles: ['approver', 'admin'],
        title: 'Vacancy Awaiting Approval',
        message: `${title} (${code}) submitted by HR for approval.`,
        eventType: 'vacancy:submitted'
      });
    }
    res.status(201).json({ vacancy: db.get('SELECT * FROM job_vacancies WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/vacancies/:id', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const vid = Number(req.params.id);
    const existing = db.get('SELECT * FROM job_vacancies WHERE id = ?', [vid]);
    if (!existing) throw new AppError(404, 'Vacancy not found.');
    const {
      title, department_id, branch_id, location, employment_type, positions,
      required_experience, required_qualifications, description, opening_date, closing_date, status
    } = req.body;
    db.run(
      `UPDATE job_vacancies SET
         title = COALESCE(?, title),
         department_id = ?,
         branch_id = COALESCE(?, branch_id),
         location = COALESCE(?, location),
         employment_type = COALESCE(?, employment_type),
         positions = COALESCE(?, positions),
         required_experience = COALESCE(?, required_experience),
         required_qualifications = COALESCE(?, required_qualifications),
         description = COALESCE(?, description),
         opening_date = COALESCE(?, opening_date),
         closing_date = ?,
         status = COALESCE(?, status),
         updated_at = datetime('now')
       WHERE id = ?`,
      [
        title || null,
        department_id !== undefined ? (department_id ? Number(department_id) : null) : existing.department_id,
        branch_id ? Number(branch_id) : null,
        location || null,
        employment_type || null,
        positions !== undefined ? Number(positions) : null,
        required_experience ?? null,
        required_qualifications ?? null,
        description || null,
        opening_date || null,
        closing_date !== undefined ? (closing_date || null) : existing.closing_date,
        status || null,
        vid
      ]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.vacancy_updated', entityType: 'job_vacancy', entityId: vid });
    res.json({ vacancy: db.get('SELECT * FROM job_vacancies WHERE id = ?', [vid]) });
  }));

  router.post('/vacancies/:id/status', requireRole('hr', 'approver', 'admin'), asyncHandler(async (req, res) => {
    const vid = Number(req.params.id);
    const { status } = req.body;
    const vac = db.get('SELECT * FROM job_vacancies WHERE id = ?', [vid]);
    if (!vac) throw new AppError(404, 'Vacancy not found.');
    if (!['Draft', 'Pending Approval', 'Approved', 'Published', 'Closed', 'Rejected'].includes(status)) {
      throw new AppError(400, 'Invalid target vacancy status.');
    }
    if (req.user.role === 'approver' && !['Approved', 'Published', 'Rejected'].includes(status)) {
      throw new AppError(403, 'Approvers may only approve, publish, or reject submitted vacancies.');
    }
    if (req.user.role === 'hr' && vac.status === 'Pending Approval' && status === 'Published') {
      // Allow HR to publish an approved vacancy, or submit Draft -> Pending Approval / Published
      throw new AppError(403, 'Pending approval vacancy must be approved before publishing.');
    }
    const approvedBy = ['Approved', 'Published'].includes(status) ? (vac.approved_by || req.user.id) : vac.approved_by;
    db.run("UPDATE job_vacancies SET status = ?, approved_by = ?, updated_at = datetime('now') WHERE id = ?", [status, approvedBy, vid]);
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.vacancy_status_changed', entityType: 'job_vacancy', entityId: vid, details: { from: vac.status, to: status } });
    res.json({ vacancy: db.get('SELECT * FROM job_vacancies WHERE id = ?', [vid]) });
  }));

  router.get('/vacancies/:id/applicants', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const vid = Number(req.params.id);
    const applications = db.all(
      `SELECT ja.*, u.full_name as candidate_name, u.email as candidate_email, u.phone as candidate_phone
       FROM job_applications ja
       JOIN users u ON u.id = ja.candidate_user_id
       WHERE ja.vacancy_id = ? ORDER BY ja.id DESC`,
      [vid]
    );
    res.json({ applications });
  }));

  // Applications: HR/Admin sees all; candidate sees ONLY own; others blocked 403
  router.get('/applications', asyncHandler(async (req, res) => {
    const isHr = ['hr', 'admin'].includes(req.user.role);
    if (!isHr && req.user.role !== 'candidate') {
      throw new AppError(403, 'Access denied to recruitment applications.');
    }
    const where = isHr ? '1=1' : 'ja.candidate_user_id = ?';
    const params = isHr ? [] : [req.user.id];
    const applications = db.all(
      `SELECT ja.*, jv.title as vacancy_title, jv.vacancy_code, jv.department_id, jv.closing_date,
              u.full_name as candidate_name, u.email as candidate_email, u.phone as candidate_phone,
              (SELECT scheduled_at || ' (' || outcome || ')' FROM interviews i WHERE i.application_id = ja.id ORDER BY i.id DESC LIMIT 1) as interview_summary,
              o.id as offer_id, o.offer_ref, o.status as offer_status, o.offered_salary as offer_table_salary, o.joining_date as offer_joining_date
       FROM job_applications ja
       JOIN job_vacancies jv ON jv.id = ja.vacancy_id
       JOIN users u ON u.id = ja.candidate_user_id
       LEFT JOIN offers o ON o.application_id = ja.id
       WHERE ${where} ORDER BY ja.id DESC`,
      params
    );
    res.json({ applications });
  }));

  router.get('/applications/:id', asyncHandler(async (req, res) => {
    const appId = Number(req.params.id);
    const appRow = db.get(
      `SELECT ja.*, jv.title as vacancy_title, jv.vacancy_code, jv.employment_type, jv.location,
              u.full_name as candidate_name, u.email as candidate_email, u.phone as candidate_phone,
              ra.original_name as resume_name, ca.original_name as cert_name
       FROM job_applications ja
       JOIN job_vacancies jv ON jv.id = ja.vacancy_id
       JOIN users u ON u.id = ja.candidate_user_id
       LEFT JOIN attachments ra ON ra.id = ja.resume_attachment_id
       LEFT JOIN attachments ca ON ca.id = ja.cert_attachment_id
       WHERE ja.id = ?`,
      [appId]
    );
    if (!appRow) throw new AppError(404, 'Application not found.');
    const isHr = ['hr', 'admin'].includes(req.user.role);
    if (!isHr && appRow.candidate_user_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to inspect this application.');
    }
    const interviews = db.all('SELECT * FROM interviews WHERE application_id = ? ORDER BY id DESC', [appId]);
    const offer = db.get('SELECT * FROM offers WHERE application_id = ?', [appId]);
    const history = db.all(
      `SELECT wh.*, u.full_name as actor_name FROM workflow_history wh LEFT JOIN users u ON u.id = wh.actor_id
       WHERE wh.entity_type = 'recruitment' AND wh.entity_id = ? ORDER BY wh.id DESC`,
      [appId]
    );
    res.json({ application: appRow, interviews, offer, history });
  }));

  router.post('/applications', requireRole('candidate', 'hr', 'admin'), appUpload, asyncHandler(async (req, res) => {
    const { vacancy_id, cover_note = '' } = req.body;
    const vac = db.get("SELECT * FROM job_vacancies WHERE id = ? AND status = 'Published'", [Number(vacancy_id)]);
    if (!vac) throw new AppError(404, 'Vacancy is not open for applications.');
    if (vac.closing_date && vac.closing_date < new Date().toISOString().slice(0, 10)) {
      throw new AppError(400, 'This vacancy closing date has passed and no longer accepts applications.');
    }

    const dup = db.get('SELECT id FROM job_applications WHERE vacancy_id = ? AND candidate_user_id = ?', [vac.id, req.user.id]);
    if (dup) throw new AppError(409, 'You have already applied to this position.');

    const resumeFile = req.files?.resume?.[0] || req.file || null;
    const certFile = req.files?.certificate?.[0] || null;
    let resumeId = null;
    let certId = null;

    if (resumeFile) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'recruitment')`,
        [resumeFile.originalname, resumeFile.filename, resumeFile.mimetype, resumeFile.size, req.user.id]
      );
      resumeId = aInfo.lastInsertRowid;
    }
    if (certFile) {
      const cInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'candidate_documents')`,
        [certFile.originalname, certFile.filename, certFile.mimetype, certFile.size, req.user.id]
      );
      certId = cInfo.lastInsertRowid;
    }

    const ref = `APP-${Date.now().toString().slice(-6)}${crypto.randomInt(10, 99)}`;
    const info = db.run(
      `INSERT INTO job_applications (application_ref, vacancy_id, candidate_user_id, cover_note, resume_attachment_id, cert_attachment_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Submitted')`,
      [ref, vac.id, req.user.id, cover_note, resumeId, certId]
    );
    if (certId) {
      db.run(
        `INSERT INTO candidate_documents (application_id, candidate_user_id, doc_type, title, attachment_id)
         VALUES (?, ?, 'Certificate', ?, ?)`,
        [info.lastInsertRowid, req.user.id, certFile.originalname, certId]
      );
    }
    createNotification(db, broker, {
      roles: ['hr', 'admin'],
      title: 'New Job Application',
      message: `${req.user.full_name} applied for ${vac.title} (${ref}).`,
      eventType: 'recruitment:applied'
    });
    res.status(201).json({ application: db.get('SELECT * FROM job_applications WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/applications/:id/status', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const appId = Number(req.params.id);
    const { status, scheduled_at, interviewer_name, interviewer_user_id = null, mode = 'In-Person', feedback, rating = null, outcome = null, offer_salary, rejection_reason = null, notes = null } = req.body;
    const appRow = db.get('SELECT * FROM job_applications WHERE id = ?', [appId]);
    if (!appRow) throw new AppError(404, 'Application not found.');
    if (!status) throw new AppError(400, 'Target status is required.');

    db.transaction(() => {
      db.run(
        `UPDATE job_applications SET
           status = ?,
           offer_salary = COALESCE(?, offer_salary),
           rejection_reason = COALESCE(?, rejection_reason),
           reviewer_notes = COALESCE(?, reviewer_notes),
           reviewed_by = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
        [status, offer_salary ? Number(offer_salary) : null, rejection_reason || null, notes || null, req.user.id, appId]
      );
      if (status === 'Interview Scheduled' && scheduled_at) {
        db.run(
          'INSERT INTO interviews (application_id, scheduled_at, interviewer_name, interviewer_user_id, mode, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [appId, scheduled_at, interviewer_name || req.user.full_name, interviewer_user_id ? Number(interviewer_user_id) : null, mode || 'In-Person', notes || null, req.user.id]
        );
      }
      if (feedback) {
        db.run('UPDATE interviews SET feedback = ?, rating = COALESCE(?, rating), outcome = COALESCE(?, outcome), recorded_by = ?, updated_at = datetime(\'now\') WHERE application_id = ?',
          [feedback, rating ? Number(rating) : null, outcome || status, req.user.id, appId]);
      }
      validateAndRecordTransition(db, broker, {
        entityType: 'recruitment',
        entityId: appId,
        fromStatus: appRow.status,
        toStatus: status,
        actor: req.user,
        notes: rejection_reason || notes || null,
        notify: {
          userId: appRow.candidate_user_id,
          roles: ['hr'],
          title: 'Application Status Updated',
          message: `Application ${appRow.application_ref} is now ${status}.`,
          eventType: 'recruitment:updated'
        }
      });
    })();
    res.json({ application: db.get('SELECT * FROM job_applications WHERE id = ?', [appId]) });
  }));

  // Interview Management
  router.get('/interviews', requirePermission('hr.manage'), asyncHandler(async (_req, res) => {
    const interviews = db.all(
      `SELECT i.*, ja.application_ref, ja.status as application_status, jv.title as vacancy_title,
              u.full_name as candidate_name, u.email as candidate_email, iu.full_name as assigned_interviewer_name
       FROM interviews i
       JOIN job_applications ja ON ja.id = i.application_id
       JOIN job_vacancies jv ON jv.id = ja.vacancy_id
       JOIN users u ON u.id = ja.candidate_user_id
       LEFT JOIN users iu ON iu.id = i.interviewer_user_id
       ORDER BY i.scheduled_at DESC, i.id DESC`
    );
    res.json({ interviews });
  }));

  router.post('/interviews', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const { application_id, scheduled_at, interviewer_name, interviewer_user_id = null, mode = 'In-Person', notes = '' } = req.body;
    const appId = Number(application_id);
    const appRow = db.get('SELECT * FROM job_applications WHERE id = ?', [appId]);
    if (!appRow) throw new AppError(404, 'Application not found.');
    if (!scheduled_at) throw new AppError(400, 'Interview date and time are required.');

    let resolvedInterviewer = interviewer_name;
    if (!resolvedInterviewer && interviewer_user_id) {
      const iu = db.get('SELECT full_name FROM users WHERE id = ?', [Number(interviewer_user_id)]);
      resolvedInterviewer = iu?.full_name;
    }

    const interview = db.transaction(() => {
      const info = db.run(
        `INSERT INTO interviews (application_id, scheduled_at, interviewer_name, interviewer_user_id, mode, notes, outcome, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [appId, scheduled_at, resolvedInterviewer || req.user.full_name, interviewer_user_id ? Number(interviewer_user_id) : null, mode, notes, req.user.id]
      );
      if (appRow.status !== 'Interview Scheduled') {
        db.run("UPDATE job_applications SET status = 'Interview Scheduled', updated_at = datetime('now') WHERE id = ?", [appId]);
        validateAndRecordTransition(db, broker, {
          entityType: 'recruitment',
          entityId: appId,
          fromStatus: appRow.status,
          toStatus: 'Interview Scheduled',
          actor: req.user,
          notes: `Interview scheduled on ${scheduled_at}`,
          notify: {
            userId: appRow.candidate_user_id,
            roles: ['hr'],
            title: 'Interview Scheduled',
            message: `Your interview for ${appRow.application_ref} is scheduled at ${scheduled_at}.`,
            eventType: 'recruitment:interview'
          }
        });
      }
      return db.get('SELECT * FROM interviews WHERE id = ?', [info.lastInsertRowid]);
    })();
    res.status(201).json({ interview });
  }));

  router.patch('/interviews/:id', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const iid = Number(req.params.id);
    const existing = db.get('SELECT * FROM interviews WHERE id = ?', [iid]);
    if (!existing) throw new AppError(404, 'Interview not found.');
    const { scheduled_at, interviewer_name, interviewer_user_id, mode, notes, feedback, rating, outcome } = req.body;
    db.run(
      `UPDATE interviews SET
         scheduled_at = COALESCE(?, scheduled_at),
         interviewer_name = COALESCE(?, interviewer_name),
         interviewer_user_id = COALESCE(?, interviewer_user_id),
         mode = COALESCE(?, mode),
         notes = COALESCE(?, notes),
         feedback = COALESCE(?, feedback),
         rating = COALESCE(?, rating),
         outcome = COALESCE(?, outcome),
         recorded_by = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
      [
        scheduled_at || null,
        interviewer_name || null,
        interviewer_user_id ? Number(interviewer_user_id) : null,
        mode || null,
        notes ?? null,
        feedback ?? null,
        rating !== undefined && rating !== '' ? Number(rating) : null,
        outcome || null,
        req.user.id,
        iid
      ]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.interview_updated', entityType: 'interview', entityId: iid, details: { outcome, rating } });
    res.json({ interview: db.get('SELECT * FROM interviews WHERE id = ?', [iid]) });
  }));

  // Offers & Appointment Letters
  router.get('/offers', asyncHandler(async (req, res) => {
    const isHr = ['hr', 'admin'].includes(req.user.role);
    if (!isHr && req.user.role !== 'candidate') {
      throw new AppError(403, 'Access denied to offers.');
    }
    const where = isHr ? '1=1' : 'o.candidate_user_id = ?';
    const params = isHr ? [] : [req.user.id];
    const offers = db.all(
      `SELECT o.*, ja.application_ref, jv.title as vacancy_title, jv.vacancy_code,
              u.full_name as candidate_name, u.email as candidate_email,
              a.original_name as letter_name
       FROM offers o
       JOIN job_applications ja ON ja.id = o.application_id
       JOIN job_vacancies jv ON jv.id = o.vacancy_id
       JOIN users u ON u.id = o.candidate_user_id
       LEFT JOIN attachments a ON a.id = o.letter_attachment_id
       WHERE ${where} ORDER BY o.id DESC`,
      params
    );
    res.json({ offers });
  }));

  const letterUpload = upload ? upload.single('letter') : (_req, _res, next) => next();
  router.post('/offers', requirePermission('hr.manage'), letterUpload, asyncHandler(async (req, res) => {
    const { application_id, offered_salary, joining_date, employment_type = 'Full-Time', notes = '' } = req.body;
    const appId = Number(application_id);
    const appRow = db.get('SELECT * FROM job_applications WHERE id = ?', [appId]);
    if (!appRow) throw new AppError(404, 'Application not found.');
    if (!offered_salary || !joining_date) throw new AppError(400, 'Offered salary and joining date are required.');
    const existingOffer = db.get('SELECT id FROM offers WHERE application_id = ?', [appId]);
    if (existingOffer) throw new AppError(409, 'An offer already exists for this application.');

    let letterAttachmentId = null;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'offers')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      letterAttachmentId = aInfo.lastInsertRowid;
    }

    const offerRef = `OFR-${Date.now().toString().slice(-6)}`;
    const offer = db.transaction(() => {
      const info = db.run(
        `INSERT INTO offers (offer_ref, application_id, candidate_user_id, vacancy_id, offered_salary, joining_date, employment_type, letter_attachment_id, notes, status, issued_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Issued', ?)`,
        [offerRef, appId, appRow.candidate_user_id, appRow.vacancy_id, Number(offered_salary), joining_date, employment_type, letterAttachmentId, notes, req.user.id]
      );
      db.run("UPDATE job_applications SET status = 'Offer Issued', offer_salary = ?, updated_at = datetime('now') WHERE id = ?", [Number(offered_salary), appId]);
      if (['Shortlisted', 'Interview Scheduled', 'Selected'].includes(appRow.status)) {
        validateAndRecordTransition(db, broker, {
          entityType: 'recruitment',
          entityId: appId,
          fromStatus: appRow.status,
          toStatus: 'Offer Issued',
          actor: req.user,
          notes: `Offer ${offerRef} issued ($${offered_salary})`,
          notify: {
            userId: appRow.candidate_user_id,
            roles: ['hr'],
            title: 'Job Offer Issued',
            message: `Congratulations! Offer ${offerRef} has been issued for ${appRow.application_ref}.`,
            eventType: 'recruitment:offer_issued'
          }
        });
      }
      return db.get('SELECT * FROM offers WHERE id = ?', [info.lastInsertRowid]);
    })();
    res.status(201).json({ offer });
  }));

  router.patch('/offers/:id', requirePermission('hr.manage'), letterUpload, asyncHandler(async (req, res) => {
    const oid = Number(req.params.id);
    const existing = db.get('SELECT * FROM offers WHERE id = ?', [oid]);
    if (!existing) throw new AppError(404, 'Offer not found.');
    const { offered_salary, joining_date, employment_type, status, notes } = req.body;
    let letterAttachmentId = existing.letter_attachment_id;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'offers')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      letterAttachmentId = aInfo.lastInsertRowid;
    }
    db.run(
      `UPDATE offers SET
         offered_salary = COALESCE(?, offered_salary),
         joining_date = COALESCE(?, joining_date),
         employment_type = COALESCE(?, employment_type),
         status = COALESCE(?, status),
         notes = COALESCE(?, notes),
         letter_attachment_id = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
      [offered_salary ? Number(offered_salary) : null, joining_date || null, employment_type || null, status || null, notes ?? null, letterAttachmentId, oid]
    );
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.offer_updated', entityType: 'offer', entityId: oid });
    res.json({ offer: db.get('SELECT * FROM offers WHERE id = ?', [oid]) });
  }));

  router.post('/offers/:id/respond', requireRole('candidate', 'hr', 'admin'), asyncHandler(async (req, res) => {
    const oid = Number(req.params.id);
    const offer = db.get('SELECT * FROM offers WHERE id = ?', [oid]);
    if (!offer) throw new AppError(404, 'Offer not found.');
    if (req.user.role === 'candidate' && offer.candidate_user_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to respond to this offer.');
    }
    const { decision, notes = '' } = req.body;
    if (!['Accepted', 'Rejected'].includes(decision)) throw new AppError(400, 'Decision must be Accepted or Rejected.');

    db.transaction(() => {
      db.run("UPDATE offers SET status = ?, candidate_response_notes = ?, responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [decision, notes, oid]);
      const nextAppStatus = decision === 'Accepted' ? 'Joined' : 'Not Selected';
      const appRow = db.get('SELECT * FROM job_applications WHERE id = ?', [offer.application_id]);
      db.run("UPDATE job_applications SET status = ?, updated_at = datetime('now') WHERE id = ?", [nextAppStatus, offer.application_id]);
      if (appRow) {
        validateAndRecordTransition(db, broker, {
          entityType: 'recruitment',
          entityId: offer.application_id,
          fromStatus: appRow.status,
          toStatus: nextAppStatus,
          actor: req.user,
          notes: `Offer ${offer.offer_ref} ${decision}`,
          notify: {
            roles: ['hr', 'admin'],
            title: `Offer ${decision}`,
            message: `Offer ${offer.offer_ref} was ${decision.toLowerCase()} by candidate.`,
            eventType: 'recruitment:offer_response'
          }
        });
      }
    })();
    res.json({ offer: db.get('SELECT * FROM offers WHERE id = ?', [oid]) });
  }));

  // Employee Management
  router.get('/employees', requirePermission('hr.manage'), asyncHandler(async (_req, res) => {
    const employees = db.all(
      `SELECT ep.*, u.user_code, u.full_name, u.email, u.phone, u.is_active, u.account_status,
              r.id as role_id, r.code as role, r.name as role_name, d.name as department_name, b.name as branch_name,
              (SELECT COUNT(*) FROM employee_documents ed WHERE ed.employee_id = ep.id) as document_count
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = ep.department_id
       LEFT JOIN branches b ON b.id = ep.branch_id
       ORDER BY ep.id ASC`
    );
    const leaves = db.all(
      `SELECT lr.*, u.full_name as employee_name, ep.employee_code
       FROM leave_requests lr JOIN employee_profiles ep ON ep.id = lr.employee_id JOIN users u ON u.id = ep.user_id ORDER BY lr.id DESC`
    );
    const payroll = db.all(
      `SELECT pr.*, u.full_name as employee_name, ep.employee_code, ps.payslip_ref
       FROM payroll pr JOIN employee_profiles ep ON ep.id = pr.employee_id JOIN users u ON u.id = ep.user_id
       LEFT JOIN payslips ps ON ps.payroll_id = pr.id ORDER BY pr.id DESC`
    );
    const attendance = db.all(
      `SELECT ea.*, u.full_name as employee_name, ep.employee_code, ep.designation
       FROM employee_attendance ea JOIN employee_profiles ep ON ep.id = ea.employee_id JOIN users u ON u.id = ep.user_id
       ORDER BY ea.attendance_date DESC, ea.id DESC LIMIT 100`
    );
    const staffRoles = db.all('SELECT id, code, name FROM roles WHERE is_staff = 1 ORDER BY id');
    const departments = db.all('SELECT id, name FROM departments WHERE is_active = 1 ORDER BY name');
    const branches = db.all('SELECT id, name FROM branches WHERE is_active = 1 ORDER BY id');
    res.json({ employees, leaves, payroll, attendance, staffRoles, departments, branches });
  }));

  router.get('/employees/:id', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const eid = Number(req.params.id);
    const employee = db.get(
      `SELECT ep.*, u.user_code, u.full_name, u.email, u.phone, u.is_active, u.account_status,
              r.id as role_id, r.code as role, r.name as role_name, d.name as department_name, b.name as branch_name
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = ep.department_id
       LEFT JOIN branches b ON b.id = ep.branch_id
       WHERE ep.id = ?`,
      [eid]
    );
    if (!employee) throw new AppError(404, 'Employee not found.');
    const documents = db.all(
      `SELECT ed.*, a.original_name, a.mime_type, a.size_bytes
       FROM employee_documents ed LEFT JOIN attachments a ON a.id = ed.attachment_id
       WHERE ed.employee_id = ? ORDER BY ed.id DESC`,
      [eid]
    );
    const attendance = db.all('SELECT * FROM employee_attendance WHERE employee_id = ? ORDER BY attendance_date DESC LIMIT 30', [eid]);
    const leaves = db.all('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY id DESC LIMIT 20', [eid]);
    const payroll = db.all(
      `SELECT pr.*, ps.payslip_ref FROM payroll pr LEFT JOIN payslips ps ON ps.payroll_id = pr.id WHERE pr.employee_id = ? ORDER BY pr.id DESC LIMIT 12`,
      [eid]
    );
    res.json({ employee, documents, attendance, leaves, payroll });
  }));

  router.post('/employees', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const {
      full_name, email, phone = '', role_id, department_id = null, branch_id = 1,
      designation = 'Hospital Staff', employment_type = 'Full-Time', qualification = '',
      shift = 'Day', joining_date = null, employee_code = '', base_salary = 5000, password
    } = req.body;
    if (!full_name || !email || !role_id || !password) throw new AppError(400, 'Name, email, role, and password are required.');
    if (!isStrongPassword(password)) throw new AppError(400, 'Password must be at least 8 characters and include a number.');
    const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
    if (dup) throw new AppError(409, 'Email is already registered.');
    const role = db.get('SELECT * FROM roles WHERE id = ? AND is_staff = 1', [Number(role_id)]);
    if (!role) throw new AppError(400, 'Valid staff role is required.');
    if (employee_code && db.get('SELECT id FROM employee_profiles WHERE upper(employee_code) = upper(?)', [employee_code.trim()])) {
      throw new AppError(409, 'Employee code already exists.');
    }

    const hash = bcrypt.hashSync(password, 10);
    const uCode = `${role.code.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
    const empCode = employee_code?.trim() || `EMP-${uCode}`;
    const empId = db.transaction(() => {
      const deptNum = department_id ? Number(department_id) : null;
      const branchNum = Number(branch_id) || 1;
      const uInfo = db.run(
        'INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uCode, email.trim().toLowerCase(), hash, full_name.trim(), phone, role.id, branchNum, deptNum]
      );
      const eInfo = db.run(
        `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, employment_type, qualification, shift, joining_date, base_salary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?)`,
        [uInfo.lastInsertRowid, empCode, deptNum, branchNum, designation, employment_type, qualification || null, shift || 'Day', joining_date || null, Number(base_salary || 5000)]
      );
      logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.employee_created', entityType: 'employee', entityId: eInfo.lastInsertRowid, details: { empCode, email } });
      return eInfo.lastInsertRowid;
    })();
    if (broker) broker.publish('member:registered', { title: 'New Staff Employee', message: `${full_name} added by HR.` }, { roles: ['admin', 'hr'] });
    res.status(201).json({ employee: db.get('SELECT * FROM employee_profiles WHERE id = ?', [empId]) });
  }));

  router.patch('/employees/:id', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const eid = Number(req.params.id);
    const emp = db.get('SELECT * FROM employee_profiles WHERE id = ?', [eid]);
    if (!emp) throw new AppError(404, 'Employee not found.');
    const { full_name, phone, department_id, branch_id, designation, employment_type, qualification, shift, joining_date, employment_status, base_salary } = req.body;

    db.transaction(() => {
      db.run(
        `UPDATE employee_profiles SET
           department_id = ?,
           branch_id = COALESCE(?, branch_id),
           designation = COALESCE(?, designation),
           employment_type = COALESCE(?, employment_type),
           qualification = COALESCE(?, qualification),
           shift = COALESCE(?, shift),
           joining_date = COALESCE(?, joining_date),
           employment_status = COALESCE(?, employment_status),
           base_salary = COALESCE(?, base_salary),
           updated_at = datetime('now')
         WHERE id = ?`,
        [
          department_id !== undefined ? (department_id ? Number(department_id) : null) : emp.department_id,
          branch_id ? Number(branch_id) : null,
          designation || null,
          employment_type || null,
          qualification ?? null,
          shift || null,
          joining_date || null,
          employment_status || null,
          base_salary !== undefined ? Number(base_salary) : null,
          eid
        ]
      );
      const activeFlag = employment_status ? (employment_status === 'Active' ? 1 : 0) : null;
      db.run(
        `UPDATE users SET
           full_name = COALESCE(?, full_name),
           phone = COALESCE(?, phone),
           department_id = ?,
           branch_id = COALESCE(?, branch_id),
           is_active = COALESCE(?, is_active),
           account_status = COALESCE(?, account_status),
           updated_at = datetime('now')
         WHERE id = ?`,
        [
          full_name || null,
          phone ?? null,
          department_id !== undefined ? (department_id ? Number(department_id) : null) : emp.department_id,
          branch_id ? Number(branch_id) : null,
          activeFlag,
          employment_status ? (employment_status === 'Active' ? 'Active' : 'Suspended') : null,
          emp.user_id
        ]
      );
      logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.employee_updated', entityType: 'employee', entityId: eid, details: { before: emp, after: req.body } });
    })();

    res.json({ employee: db.get('SELECT * FROM employee_profiles WHERE id = ?', [eid]) });
  }));

  const empDocUpload = upload ? upload.single('document') : (_req, _res, next) => next();
  router.post('/employees/:id/documents', requirePermission('hr.manage'), empDocUpload, asyncHandler(async (req, res) => {
    const eid = Number(req.params.id);
    const emp = db.get('SELECT * FROM employee_profiles WHERE id = ?', [eid]);
    if (!emp) throw new AppError(404, 'Employee not found.');
    if (!req.file) throw new AppError(400, 'Document file is required.');
    const { title, doc_type = 'Contract' } = req.body;
    const docTitle = (title && title.trim()) || req.file.originalname;

    const doc = db.transaction(() => {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'employee_documents')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      const dInfo = db.run(
        `INSERT INTO employee_documents (employee_id, title, doc_type, attachment_id, uploaded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [eid, docTitle, doc_type, aInfo.lastInsertRowid, req.user.id]
      );
      return db.get('SELECT ed.*, a.original_name, a.mime_type FROM employee_documents ed LEFT JOIN attachments a ON a.id = ed.attachment_id WHERE ed.id = ?', [dInfo.lastInsertRowid]);
    })();
    res.status(201).json({ document: doc });
  }));

  router.post('/attendance', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const { employee_id, attendance_date, status = 'Present', check_in = '09:00', check_out = '17:00' } = req.body;
    const eid = Number(employee_id);
    if (!eid || !attendance_date) throw new AppError(400, 'Employee and attendance date are required.');
    db.run(
      `INSERT INTO employee_attendance (employee_id, attendance_date, status, check_in, check_out)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, attendance_date) DO UPDATE SET status = excluded.status, check_in = excluded.check_in, check_out = excluded.check_out, updated_at = datetime('now')`,
      [eid, attendance_date, status, check_in, check_out]
    );
    res.status(201).json({ attendance: db.get('SELECT * FROM employee_attendance WHERE employee_id = ? AND attendance_date = ?', [eid, attendance_date]) });
  }));

  router.post('/leaves', asyncHandler(async (req, res) => {
    if (!req.user.employee_id) throw new AppError(403, 'Staff employee profile required.');
    const { leave_type, start_date, end_date, reason } = req.body;
    const info = db.run(
      'INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)',
      [req.user.employee_id, leave_type, start_date, end_date, reason]
    );
    res.status(201).json({ leave: db.get('SELECT * FROM leave_requests WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/leaves/:id', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    db.run('UPDATE leave_requests SET status = ?, reviewed_by = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [req.body.status, req.user.id, Number(req.params.id)]);
    res.json({ leave: db.get('SELECT * FROM leave_requests WHERE id = ?', [Number(req.params.id)]) });
  }));

  router.post('/payroll/run', requirePermission('payroll.manage'), asyncHandler(async (req, res) => {
    const period = req.body.pay_period || new Date().toISOString().slice(0, 7);
    const emps = db.all('SELECT id, base_salary FROM employee_profiles WHERE employment_status = \'Active\'');
    db.transaction(() => {
      for (const e of emps) {
        const deductions = Number((e.base_salary * 0.1).toFixed(2));
        const net = Number((e.base_salary - deductions).toFixed(2));
        db.run(
          `INSERT OR IGNORE INTO payroll (pay_period, employee_id, gross_salary, deductions, net_salary, status, processed_by)
           VALUES (?, ?, ?, ?, ?, 'Processed', ?)`,
          [period, e.id, e.base_salary, deductions, net, req.user.id]
        );
        const pr = db.get('SELECT id FROM payroll WHERE pay_period = ? AND employee_id = ?', [period, e.id]);
        db.run('INSERT OR IGNORE INTO payslips (payroll_id, payslip_ref) VALUES (?, ?)', [pr.id, `PS-${period}-${e.id}`]);
      }
    })();
    logAudit(db, { actorUserId: req.user.id, actorRole: req.user.role, action: 'hr.payroll_processed', entityType: 'payroll', entityId: period });
    res.status(201).json({ message: `Payroll processed for ${period}.` });
  }));

  // HR Reports (Employees, Vacancies, Recruitment, Interviews, Hiring Performance)
  router.get('/reports', requirePermission('hr.manage'), asyncHandler(async (_req, res) => {
    const departmentDistribution = db.all(
      `SELECT COALESCE(d.name, 'Unassigned') as label, COUNT(ep.id) as value,
              SUM(CASE WHEN ep.employment_status = 'Active' THEN 1 ELSE 0 END) as active_count
       FROM employee_profiles ep LEFT JOIN departments d ON d.id = ep.department_id
       GROUP BY ep.department_id ORDER BY value DESC`
    );
    const employmentTypeBreakdown = db.all(
      `SELECT COALESCE(employment_type, 'Full-Time') as label, COUNT(*) as value FROM employee_profiles GROUP BY employment_type`
    );
    const vacancyReport = db.all(
      `SELECT jv.vacancy_code, jv.title, d.name as department, jv.status, jv.positions, jv.opening_date, jv.closing_date,
              COUNT(ja.id) as total_applicants,
              SUM(CASE WHEN ja.status IN ('Selected','Offer Issued','Joined') THEN 1 ELSE 0 END) as selected_count
       FROM job_vacancies jv
       LEFT JOIN departments d ON d.id = jv.department_id
       LEFT JOIN job_applications ja ON ja.vacancy_id = jv.id
       GROUP BY jv.id ORDER BY jv.id DESC`
    );
    const recruitmentFunnel = db.all(
      `SELECT status as label, COUNT(*) as value FROM job_applications GROUP BY status`
    );
    const interviewSummary = db.all(
      `SELECT COALESCE(outcome, 'Pending') as label, COUNT(*) as value, ROUND(AVG(rating), 2) as avg_rating
       FROM interviews GROUP BY outcome`
    );
    const offerSummary = db.all(
      `SELECT status as label, COUNT(*) as value, ROUND(AVG(offered_salary), 2) as avg_salary
       FROM offers GROUP BY status`
    );
    res.json({
      generatedAt: new Date().toISOString(),
      departmentDistribution,
      employmentTypeBreakdown,
      vacancyReport,
      recruitmentFunnel,
      interviewSummary,
      offerSummary
    });
  }));

  return router;
}
