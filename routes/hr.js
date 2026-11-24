import bcrypt from 'bcryptjs';
import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission, requireRole } from '../middleware/roles.js';
import { isStrongPassword } from '../middleware/validation.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createHrRouter(db, broker, authenticate, upload) {
  const router = express.Router();
  router.use(authenticate);

  // Public to candidate & HR: open vacancies
  router.get('/vacancies', asyncHandler(async (req, res) => {
    const where = ['hr', 'admin'].includes(req.user.role) ? '1=1' : "jv.status = 'Published'";
    const vacancies = db.all(
      `SELECT jv.*, d.name as department_name, b.name as branch_name
       FROM job_vacancies jv
       LEFT JOIN departments d ON d.id = jv.department_id
       LEFT JOIN branches b ON b.id = jv.branch_id
       WHERE ${where} ORDER BY jv.id DESC`
    );
    res.json({ vacancies });
  }));

  router.post('/vacancies', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const { title, department_id = null, branch_id = 1, employment_type = 'Full-Time', positions = 1, description, status = 'Published' } = req.body;
    const code = `VAC-${Date.now().toString().slice(-5)}`;
    const info = db.run(
      `INSERT INTO job_vacancies (vacancy_code, title, department_id, branch_id, employment_type, positions, description, status, created_by, approved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, title, department_id ? Number(department_id) : null, Number(branch_id), employment_type, Number(positions), description, status, req.user.id, status === 'Published' ? req.user.id : null]
    );
    res.status(201).json({ vacancy: db.get('SELECT * FROM job_vacancies WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.get('/applications', asyncHandler(async (req, res) => {
    const isHr = ['hr', 'admin'].includes(req.user.role);
    const where = isHr ? '1=1' : 'ja.candidate_user_id = ?';
    const params = isHr ? [] : [req.user.id];
    const applications = db.all(
      `SELECT ja.*, jv.title as vacancy_title, jv.vacancy_code, u.full_name as candidate_name, u.email as candidate_email,
              (SELECT scheduled_at || ' (' || outcome || ')' FROM interviews i WHERE i.application_id = ja.id ORDER BY i.id DESC LIMIT 1) as interview_summary
       FROM job_applications ja
       JOIN job_vacancies jv ON jv.id = ja.vacancy_id
       JOIN users u ON u.id = ja.candidate_user_id
       WHERE ${where} ORDER BY ja.id DESC`,
      params
    );
    res.json({ applications });
  }));

  router.post('/applications', requireRole('candidate', 'hr', 'admin'), upload.single('resume'), asyncHandler(async (req, res) => {
    const { vacancy_id, cover_note = '' } = req.body;
    const vac = db.get('SELECT * FROM job_vacancies WHERE id = ? AND status = \'Published\'', [Number(vacancy_id)]);
    if (!vac) throw new AppError(404, 'Vacancy is not open for applications.');

    const dup = db.get('SELECT id FROM job_applications WHERE vacancy_id = ? AND candidate_user_id = ?', [vac.id, req.user.id]);
    if (dup) throw new AppError(409, 'You have already applied to this position.');

    let resumeId = null;
    if (req.file) {
      const aInfo = db.run(
        `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
         VALUES (?, ?, ?, ?, ?, 'recruitment')`,
        [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
      );
      resumeId = aInfo.lastInsertRowid;
    }

    const ref = `APP-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO job_applications (application_ref, vacancy_id, candidate_user_id, cover_note, resume_attachment_id, status)
       VALUES (?, ?, ?, ?, ?, 'Submitted')`,
      [ref, vac.id, req.user.id, cover_note, resumeId]
    );
    res.status(201).json({ application: db.get('SELECT * FROM job_applications WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/applications/:id/status', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const appId = Number(req.params.id);
    const { status, scheduled_at, interviewer_name, feedback, offer_salary } = req.body;
    const appRow = db.get('SELECT * FROM job_applications WHERE id = ?', [appId]);
    if (!appRow) throw new AppError(404, 'Application not found.');

    db.transaction(() => {
      db.run('UPDATE job_applications SET status = ?, offer_salary = COALESCE(?, offer_salary), updated_at = datetime(\'now\') WHERE id = ?',
        [status, offer_salary ? Number(offer_salary) : null, appId]);
      if (status === 'Interview Scheduled' && scheduled_at) {
        db.run('INSERT INTO interviews (application_id, scheduled_at, interviewer_name, created_by) VALUES (?, ?, ?, ?)',
          [appId, scheduled_at, interviewer_name || req.user.full_name, req.user.id]);
      }
      if (feedback) {
        db.run('UPDATE interviews SET feedback = ?, outcome = ? WHERE application_id = ?', [feedback, status, appId]);
      }
      validateAndRecordTransition(db, broker, {
        entityType: 'recruitment',
        entityId: appId,
        fromStatus: appRow.status,
        toStatus: status,
        actor: req.user,
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

  router.get('/employees', requirePermission('hr.manage'), asyncHandler(async (_req, res) => {
    const employees = db.all(
      `SELECT ep.*, u.full_name, u.email, u.phone, u.is_active, r.name as role_name, d.name as department_name, b.name as branch_name
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
    res.json({ employees, leaves, payroll, attendance, staffRoles, departments });
  }));

  router.post('/employees', requirePermission('hr.manage'), asyncHandler(async (req, res) => {
    const { full_name, email, phone = '', role_id, department_id = null, designation = 'Hospital Staff', base_salary = 5000, password } = req.body;
    if (!full_name || !email || !role_id || !password) throw new AppError(400, 'Name, email, role, and password are required.');
    if (!isStrongPassword(password)) throw new AppError(400, 'Password must be at least 8 characters and include a number.');
    const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
    if (dup) throw new AppError(409, 'Email is already registered.');
    const role = db.get('SELECT * FROM roles WHERE id = ? AND is_staff = 1', [Number(role_id)]);
    if (!role) throw new AppError(400, 'Valid staff role is required.');

    const hash = bcrypt.hashSync(password, 10);
    const uCode = `${role.code.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-4)}`;
    const empId = db.transaction(() => {
      const uInfo = db.run(
        'INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
        [uCode, email.trim().toLowerCase(), hash, full_name.trim(), phone, role.id, department_id ? Number(department_id) : null]
      );
      const eInfo = db.run(
        'INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, base_salary) VALUES (?, ?, ?, 1, ?, date(\'now\'), ?)',
        [uInfo.lastInsertRowid, `EMP-${uCode}`, department_id ? Number(department_id) : null, designation, Number(base_salary || 5000)]
      );
      return eInfo.lastInsertRowid;
    })();
    if (broker) broker.publish('member:registered', { title: 'New Staff Employee', message: `${full_name} added by HR.` }, { roles: ['admin', 'hr'] });
    res.status(201).json({ employee: db.get('SELECT * FROM employee_profiles WHERE id = ?', [empId]) });
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
    res.status(201).json({ message: `Payroll processed for ${period}.` });
  }));

  return router;
}
