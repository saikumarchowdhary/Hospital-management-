import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';
import { isStrongPassword } from '../middleware/validation.js';
import { transitionAppointmentTx } from '../services/appointments.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

function resolveScopedDepartmentId(req) {
  if (req.user.role === 'department_admin') {
    if (!req.user.department_id) {
      throw new AppError(403, 'Department Admin account does not have an assigned department.');
    }
    const requestedDept = req.query.department_id || req.body?.department_id;
    if (requestedDept !== undefined && requestedDept !== null && requestedDept !== '' && Number(requestedDept) !== Number(req.user.department_id)) {
      throw new AppError(403, 'Access denied: Department Admins can only access their assigned department.');
    }
    return Number(req.user.department_id);
  }
  const fallback = req.query.department_id || req.body?.department_id || req.user.department_id;
  return fallback ? Number(fallback) : null;
}

export function createDepartmentAdminRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);
  router.use(requireRole('department_admin', 'admin'));

  router.get('/dashboard', asyncHandler(async (req, res) => {
    const deptId = resolveScopedDepartmentId(req);
    if (!deptId) throw new AppError(400, 'Department selection is required.');

    const department = db.get(
      `SELECT d.*, b.name as branch_name, hu.full_name as head_name, hu.user_code as head_user_code
       FROM departments d
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN users hu ON hu.id = d.head_user_id
       WHERE d.id = ?`,
      [deptId]
    );
    if (!department) throw new AppError(404, 'Department not found.');

    const employees = db.all(
      `SELECT ep.id, ep.user_id, ep.employee_code, ep.department_id, ep.branch_id, ep.designation,
              ep.employment_type, ep.qualification, ep.shift, ep.joining_date, ep.employment_status,
              u.user_code, u.full_name, u.email, u.phone, u.is_active, u.account_status, u.last_login_at,
              r.id as role_id, r.code as role, r.name as role_name, b.name as branch_name
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = ep.branch_id
       WHERE COALESCE(ep.department_id, u.department_id) = ?
       ORDER BY ep.id ASC`,
      [deptId]
    );

    const doctorsCount = db.get(
      `SELECT COUNT(*) as c FROM doctor_profiles WHERE department_id = ? AND is_active = 1`,
      [deptId]
    ).c;

    const appointments = db.all(
      `SELECT a.id, a.appointment_ref, a.appointment_date, a.appointment_time, a.visit_type, a.status, a.fee, a.reason,
              pu.full_name as patient_name, p.patient_code,
              du.full_name as doctor_name, s.name as specialty_name, b.name as branch_name
       FROM appointments a
       JOIN patient_profiles p ON p.id = a.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id
       JOIN users du ON du.id = doc.user_id
       JOIN specialties s ON s.id = doc.specialty_id
       JOIN branches b ON b.id = a.branch_id
       WHERE a.department_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time ASC
       LIMIT 100`,
      [deptId]
    );

    const admissions = db.all(
      `SELECT ad.id, ad.admission_ref, ad.admission_type, ad.status, ad.reason, ad.admitted_at,
              pu.full_name as patient_name, p.patient_code,
              du.full_name as doctor_name, b.bed_code, w.name as ward_name
       FROM admissions ad
       JOIN patient_profiles p ON p.id = ad.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = ad.doctor_id
       JOIN users du ON du.id = doc.user_id
       LEFT JOIN beds b ON b.id = ad.bed_id
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN wards w ON w.id = r.ward_id
       WHERE ad.department_id = ?
       ORDER BY ad.id DESC LIMIT 60`,
      [deptId]
    );

    const patients = db.all(
      `SELECT DISTINCT p.id, p.patient_code, p.gender, p.dob, u.full_name, u.phone, u.email,
              (SELECT MAX(a.appointment_date) FROM appointments a WHERE a.patient_id = p.id AND a.department_id = ?) as last_visit_date,
              (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.department_id = ?) as dept_appointments,
              (SELECT COUNT(*) FROM admissions ad WHERE ad.patient_id = p.id AND ad.department_id = ?) as dept_admissions
       FROM patient_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.department_id = ?)
          OR EXISTS (SELECT 1 FROM admissions ad WHERE ad.patient_id = p.id AND ad.department_id = ?)
       ORDER BY p.id DESC LIMIT 100`,
      [deptId, deptId, deptId, deptId, deptId]
    );

    const leaves = db.all(
      `SELECT lr.*, u.full_name as employee_name, ep.employee_code, ep.designation
       FROM leave_requests lr
       JOIN employee_profiles ep ON ep.id = lr.employee_id
       JOIN users u ON u.id = ep.user_id
       WHERE COALESCE(ep.department_id, u.department_id) = ?
       ORDER BY lr.id DESC LIMIT 50`,
      [deptId]
    );

    const vacancies = db.all(
      `SELECT jv.*, (SELECT COUNT(*) FROM job_applications ja WHERE ja.vacancy_id = jv.id) as applicant_count
       FROM job_vacancies jv
       WHERE jv.department_id = ?
       ORDER BY jv.id DESC LIMIT 30`,
      [deptId]
    );

    const recentActivities = db.all(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.actor_role, al.details, al.created_at,
              u.full_name as actor_name, u.user_code as actor_code
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE (u.department_id = ?)
          OR (al.entity_type = 'department' AND al.entity_id = ?)
       ORDER BY al.id DESC LIMIT 50`,
      [deptId, String(deptId)]
    );

    const staffRoles = db.all(
      `SELECT id, code, name FROM roles WHERE is_staff = 1 AND code NOT IN ('admin', 'department_admin') ORDER BY id`
    );

    const todaysAppts = db.get(
      `SELECT COUNT(*) as c FROM appointments WHERE department_id = ? AND appointment_date = date('now')`,
      [deptId]
    ).c;

    res.json({
      department,
      kpis: {
        totalEmployees: employees.length,
        activeEmployees: employees.filter((e) => e.employment_status === 'Active' && e.is_active).length,
        totalDoctors: doctorsCount,
        totalAppointments: appointments.length,
        todaysAppointments: todaysAppts,
        activeAdmissions: admissions.filter((a) => ['Admitted', 'Active Care', 'Discharge Pending'].includes(a.status)).length,
        departmentPatients: patients.length,
        pendingLeaves: leaves.filter((l) => l.status === 'Pending').length
      },
      employees,
      patients,
      appointments,
      admissions,
      leaves,
      vacancies,
      recentActivities,
      staffRoles
    });
  }));

  router.get('/employees', asyncHandler(async (req, res) => {
    const deptId = resolveScopedDepartmentId(req);
    const employees = db.all(
      `SELECT ep.id, ep.user_id, ep.employee_code, ep.department_id, ep.branch_id, ep.designation,
              ep.employment_type, ep.qualification, ep.shift, ep.joining_date, ep.employment_status,
              u.user_code, u.full_name, u.email, u.phone, u.is_active, u.account_status,
              r.id as role_id, r.code as role, r.name as role_name, d.name as department_name
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = COALESCE(ep.department_id, u.department_id)
       WHERE COALESCE(ep.department_id, u.department_id) = ?
       ORDER BY ep.id ASC`,
      [deptId]
    );
    res.json({ department_id: deptId, employees });
  }));

  router.post('/employees', asyncHandler(async (req, res) => {
    const deptId = resolveScopedDepartmentId(req);
    const {
      full_name, email, phone = '', role_id, designation = 'Department Staff',
      employment_type = 'Full-Time', qualification = '', shift = 'Day',
      employee_code = '', password
    } = req.body;

    if (!full_name || !email || !role_id || !password) {
      throw new AppError(400, 'Full name, email, role, and password are required.');
    }
    if (!isStrongPassword(password)) {
      throw new AppError(400, 'Password must be at least 8 characters and include a number.');
    }

    const role = db.get('SELECT * FROM roles WHERE id = ? AND is_staff = 1', [Number(role_id)]);
    if (!role || ['admin', 'department_admin'].includes(role.code)) {
      throw new AppError(403, 'Department Admins cannot provision Administrator accounts.');
    }

    const safeEmail = String(email).trim().toLowerCase();
    if (db.get('SELECT id FROM users WHERE lower(email) = lower(?)', [safeEmail])) {
      throw new AppError(409, 'Email address is already registered.');
    }
    const safeEmpCode = employee_code ? String(employee_code).trim() : '';
    if (safeEmpCode && db.get('SELECT id FROM employee_profiles WHERE upper(employee_code) = upper(?)', [safeEmpCode])) {
      throw new AppError(409, 'Employee ID already exists.');
    }

    const deptRow = db.get('SELECT id, branch_id, name FROM departments WHERE id = ?', [deptId]);
    if (!deptRow) throw new AppError(404, 'Department not found.');

    const hash = bcrypt.hashSync(password, 10);
    const uCode = `${role.code.slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
    const finalEmpCode = safeEmpCode || `EMP-${uCode}`;

    const empId = db.transaction(() => {
      const uInfo = db.run(
        `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
        [uCode, safeEmail, hash, String(full_name).trim(), String(phone).trim(), role.id, deptRow.branch_id || 1, deptId]
      );
      const eInfo = db.run(
        `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, employment_type, qualification, shift, joining_date, base_salary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?)`,
        [uInfo.lastInsertRowid, finalEmpCode, deptId, deptRow.branch_id || 1, String(designation).trim(), employment_type, qualification || null, shift || 'Day', role.code === 'doctor' ? 14000 : 5200]
      );
      if (role.code === 'doctor') {
        const spec = db.get('SELECT id FROM specialties WHERE department_id = ? ORDER BY id LIMIT 1', [deptId]) || db.get('SELECT id FROM specialties ORDER BY id LIMIT 1');
        db.run(
          `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, availability_status, schedule_configured)
           VALUES (?, ?, ?, ?, ?, ?, 5, 100, ?, 'Available', 1)`,
          [uInfo.lastInsertRowid, `DR-${uCode.split('-')[1]}`, spec.id, deptId, deptRow.branch_id || 1, qualification || 'MD', `Consultant in ${deptRow.name}.`]
        );
      }
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'dept_admin.employee_created',
        entityType: 'employee',
        entityId: eInfo.lastInsertRowid,
        details: { department_id: deptId, email: safeEmail, employee_code: finalEmpCode, role: role.code }
      });
      return eInfo.lastInsertRowid;
    })();

    res.status(201).json({ employee: db.get('SELECT * FROM employee_profiles WHERE id = ?', [empId]) });
  }));

  router.patch('/employees/:id', asyncHandler(async (req, res) => {
    const deptId = resolveScopedDepartmentId(req);
    const eid = Number(req.params.id);
    const emp = db.get(
      `SELECT ep.*, u.department_id as user_department_id
       FROM employee_profiles ep JOIN users u ON u.id = ep.user_id WHERE ep.id = ?`,
      [eid]
    );
    if (!emp) throw new AppError(404, 'Employee not found.');
    const empDeptId = emp.department_id || emp.user_department_id;
    if (Number(empDeptId) !== Number(deptId)) {
      throw new AppError(403, 'Access denied: Employee belongs to a different department.');
    }

    const { full_name, phone, designation, employment_type, qualification, shift, employment_status } = req.body;
    db.transaction(() => {
      db.run(
        `UPDATE employee_profiles SET
           designation = COALESCE(?, designation),
           employment_type = COALESCE(?, employment_type),
           qualification = COALESCE(?, qualification),
           shift = COALESCE(?, shift),
           employment_status = COALESCE(?, employment_status),
           updated_at = datetime('now')
         WHERE id = ?`,
        [designation || null, employment_type || null, qualification ?? null, shift || null, employment_status || null, eid]
      );
      const activeFlag = employment_status ? (employment_status === 'Active' ? 1 : 0) : null;
      db.run(
        `UPDATE users SET
           full_name = COALESCE(?, full_name),
           phone = COALESCE(?, phone),
           is_active = COALESCE(?, is_active),
           account_status = COALESCE(?, account_status),
           updated_at = datetime('now')
         WHERE id = ?`,
        [full_name || null, phone ?? null, activeFlag, employment_status ? (employment_status === 'Active' ? 'Active' : 'Suspended') : null, emp.user_id]
      );
      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'dept_admin.employee_updated',
        entityType: 'employee',
        entityId: eid,
        details: { department_id: deptId, changes: req.body }
      });
    })();

    res.json({ employee: db.get('SELECT * FROM employee_profiles WHERE id = ?', [eid]) });
  }));

  router.patch('/appointments/:id/status', asyncHandler(async (req, res) => {
    const deptId = resolveScopedDepartmentId(req);
    const apptId = Number(req.params.id);
    const appt = db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    if (!appt) throw new AppError(404, 'Appointment not found.');
    if (Number(appt.department_id) !== Number(deptId)) {
      throw new AppError(403, 'Access denied: Appointment belongs to a different department.');
    }
    const updated = transitionAppointmentTx(db, broker, {
      appointmentId: apptId,
      toStatus: req.body.status,
      newDate: req.body.new_date,
      newTime: req.body.new_time,
      actor: req.user,
      notes: req.body.notes
    });
    res.json({ appointment: updated });
  }));

  router.patch('/leaves/:id', asyncHandler(async (req, res) => {
    const deptId = resolveScopedDepartmentId(req);
    const lid = Number(req.params.id);
    const leave = db.get(
      `SELECT lr.*, COALESCE(ep.department_id, u.department_id) as emp_dept_id
       FROM leave_requests lr
       JOIN employee_profiles ep ON ep.id = lr.employee_id
       JOIN users u ON u.id = ep.user_id
       WHERE lr.id = ?`,
      [lid]
    );
    if (!leave) throw new AppError(404, 'Leave request not found.');
    if (Number(leave.emp_dept_id) !== Number(deptId)) {
      throw new AppError(403, 'Access denied: Leave request belongs to a different department.');
    }
    const status = req.body.status;
    if (!['Approved', 'Rejected'].includes(status)) {
      throw new AppError(400, 'Leave status must be Approved or Rejected.');
    }
    db.run(`UPDATE leave_requests SET status = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?`, [status, req.user.id, lid]);
    logAudit(db, {
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'dept_admin.leave_updated',
      entityType: 'leave_request',
      entityId: lid,
      details: { department_id: deptId, status }
    });
    createNotification(db, broker, {
      userId: db.get('SELECT user_id FROM employee_profiles WHERE id = ?', [leave.employee_id])?.user_id,
      roles: ['hr'],
      title: `Department Leave ${status}`,
      message: `Leave request #${lid} marked ${status} by Department Admin.`,
      eventType: 'hr:leave_updated'
    });
    res.json({ leave: db.get('SELECT * FROM leave_requests WHERE id = ?', [lid]) });
  }));

  return router;
}
