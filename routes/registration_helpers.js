import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errors.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

export const SELF_REGISTER_STAFF_ROLES = [
  'nurse', 'receptionist', 'case_manager', 'lab_staff', 'pharmacist', 'radiologist',
  'accountant', 'hr', 'publisher', 'approver', 'external_coordinator',
  'housekeeping', 'housekeeping_supervisor', 'bloodbank_staff'
];

function uniqueCode(prefix) {
  return `${prefix}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
}

export function generateNextPatientCode(db) {
  const rows = db.all("SELECT patient_code FROM patient_profiles WHERE patient_code LIKE 'PT-%'");
  let maxNum = 0;
  for (const r of rows) {
    const m = /^PT-(\d+)$/i.exec(String(r.patient_code || '').trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `PT-${String(maxNum + 1).padStart(6, '0')}`;
}

function saveAttachmentRecord(db, file, ownerUserId, moduleName) {
  if (!file) return null;
  const info = db.run(
    `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, owner_user_id, module)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [file.originalname || 'credential', file.filename, file.mimetype || 'application/octet-stream', file.size || 0, ownerUserId, moduleName]
  );
  return { id: info.lastInsertRowid, url: `/api/admin/attachments/${info.lastInsertRowid}` };
}

export function registerStaffPendingTx(db, broker, body, ip, files = {}) {
  const {
    account_type = 'staff',
    requested_role = '',
    full_name,
    email,
    mobile,
    password,
    branch_id = 1,
    department_id = null,
    specialty_id = null,
    employee_id = '',
    qualification = '',
    experience_years = 1,
    consultation_fee = 100,
    medical_registration_number = '',
    registration_number = '',
    medical_council = '',
    council = '',
    document_url = '',
    licence_url = '',
    photo_url = ''
  } = body;

  const isDoctorSignup = account_type === 'doctor' || requested_role === 'doctor';
  const targetReqRole = isDoctorSignup ? 'doctor' : requested_role;

  if (targetReqRole === 'admin' || account_type === 'admin') {
    throw new AppError(403, 'Administrator accounts cannot be created via public sign-up. Please contact hospital administration.');
  }
  if (!isDoctorSignup && !SELF_REGISTER_STAFF_ROLES.includes(targetReqRole)) {
    throw new AppError(400, 'Please select a valid hospital staff role.');
  }
  if (!full_name || String(full_name).trim().length < 2) throw new AppError(400, 'Full name is required.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Valid email is required.');
  if (!mobile || String(mobile).trim().length < 6) throw new AppError(400, 'Valid mobile number is required.');
  if (!isStrongPassword(password)) throw new AppError(400, 'Password must be at least 8 characters and include a number.');

  const safeEmail = String(email).trim().toLowerCase();
  const safeMobile = String(mobile).trim();
  const safeEmpId = employee_id ? String(employee_id).trim() : '';
  const safeRegNo = String(medical_registration_number || registration_number || '').trim();
  const safeCouncil = String(medical_council || council || '').trim();

  if (isDoctorSignup) {
    if (!safeRegNo) throw new AppError(400, 'Medical registration number is required for doctor verification.');
    if (!safeCouncil) throw new AppError(400, 'Medical council name is required for doctor verification.');
    if (!department_id) throw new AppError(400, 'Department selection is required for doctor registration.');
  }

  const dupUser = db.get('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?', [safeEmail, safeMobile]);
  if (dupUser) throw new AppError(409, 'An account with this email or mobile number already exists.');

  if (safeEmpId) {
    const dupEmp = db.get('SELECT id FROM employee_profiles WHERE upper(employee_code) = upper(?)', [safeEmpId]) ||
      db.get("SELECT id FROM staff_signup_requests WHERE upper(employee_id) = upper(?) AND status NOT IN ('Rejected','Withdrawn')", [safeEmpId]);
    if (dupEmp) throw new AppError(409, 'This Employee ID is already registered or pending review.');
  }

  if (safeRegNo) {
    const dupReg = db.get('SELECT id FROM doctor_profiles WHERE upper(registration_number) = upper(?)', [safeRegNo]) ||
      db.get("SELECT id FROM staff_signup_requests WHERE upper(medical_registration_number) = upper(?) AND status NOT IN ('Rejected','Withdrawn')", [safeRegNo]);
    if (dupReg) throw new AppError(409, 'This medical registration number is already registered or pending verification.');
  }

  const pendingRole = db.get("SELECT id, code, name FROM roles WHERE code = 'pending_staff'");
  if (!pendingRole) throw new AppError(500, 'System pending staff role configuration missing.');

  const requestedRoleRow = db.get('SELECT id, code, name FROM roles WHERE code = ?', [targetReqRole]);
  const roleName = requestedRoleRow ? requestedRoleRow.name : targetReqRole;

  const userCode = uniqueCode(isDoctorSignup ? 'DOCREQ' : 'STF');
  const hash = bcrypt.hashSync(password, 10);
  const deptId = department_id ? Number(department_id) : null;
  const branchId = branch_id ? Number(branch_id) : 1;
  const specId = specialty_id ? Number(specialty_id) : null;
  const accountStatus = isDoctorSignup ? 'Pending Verification' : 'Pending Approval';

  const result = db.transaction(() => {
    const uInfo = db.run(
      `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [userCode, safeEmail, hash, String(full_name).trim(), safeMobile, pendingRole.id, branchId, deptId, accountStatus]
    );
    const userId = uInfo.lastInsertRowid;

    const licenceFile = files?.licence?.[0] || files?.document_file?.[0] || null;
    const photoFile = files?.photo?.[0] || null;
    const savedLicence = saveAttachmentRecord(db, licenceFile, userId, isDoctorSignup ? 'doctor_licence' : 'staff_credential');
    const savedPhoto = saveAttachmentRecord(db, photoFile, userId, 'profile_photo');

    const finalLicenceUrl = savedLicence?.url || licence_url || document_url || null;
    const finalPhotoUrl = savedPhoto?.url || photo_url || null;

    db.run(
      `INSERT INTO staff_signup_requests (
         user_id, full_name, email, phone, requested_role, branch_id, department_id,
         employee_id, qualification, document_url,
         medical_registration_number, medical_council, specialty_id, experience_years, consultation_fee,
         licence_url, photo_url, licence_attachment_id, photo_attachment_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        userId, String(full_name).trim(), safeEmail, safeMobile, targetReqRole, branchId, deptId,
        safeEmpId || null, qualification ? String(qualification).trim() : null, finalLicenceUrl,
        safeRegNo || null, safeCouncil || null, specId,
        isDoctorSignup ? Number(experience_years || 1) : null,
        isDoctorSignup ? Number(consultation_fee || 100) : null,
        finalLicenceUrl, finalPhotoUrl, savedLicence?.id || null, savedPhoto?.id || null
      ]
    );

    logAudit(db, {
      actorUserId: userId,
      actorRole: 'pending_staff',
      action: isDoctorSignup ? 'auth.doctor_verification_requested' : 'auth.staff_signup_requested',
      entityType: 'user',
      entityId: userId,
      details: JSON.stringify({ requested_role: targetReqRole, branch_id: branchId, department_id: deptId, medical_registration_number: safeRegNo || undefined }),
      ip
    });

    return { userId, finalLicenceUrl, finalPhotoUrl };
  })();

  createNotification(db, broker, {
    roles: ['admin'],
    title: isDoctorSignup ? 'Doctor Verification Request' : 'New Staff Signup Request',
    message: isDoctorSignup
      ? `${full_name} submitted medical credentials (${safeRegNo}) for Doctor verification.`
      : `${full_name} submitted a signup request for role ${roleName} (${userCode}).`,
    eventType: 'member:registered'
  });

  return {
    id: result.userId,
    user_code: userCode,
    email: safeEmail,
    full_name: String(full_name).trim(),
    role: 'pending_staff',
    role_name: 'Pending Staff',
    requested_role: targetReqRole,
    requested_role_name: roleName,
    account_status: accountStatus,
    is_staff: false
  };
}

export function approveSignupRequestTx(db, broker, { requestId = null, userId = null, adminUserId, role = null, department_id = null, branch_id = null, specialty_id = null, admin_notes = '' }) {
  const request = requestId
    ? db.get('SELECT * FROM staff_signup_requests WHERE id = ?', [Number(requestId)])
    : db.get('SELECT * FROM staff_signup_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1', [Number(userId)]);

  const targetUid = request ? request.user_id : Number(userId);
  const user = db.get('SELECT * FROM users WHERE id = ?', [targetUid]);
  if (!user) throw new AppError(404, 'Member or signup request not found.');

  if (request && request.status === 'Approved') {
    return { ok: true, status: 'Approved', role: role || request.requested_role, message: 'Request is already approved.' };
  }

  const assignedRoleCode = role || request?.requested_role || db.get('SELECT code FROM roles WHERE id = ?', [user.role_id])?.code;
  const targetRole = db.get('SELECT id, code, name, is_staff FROM roles WHERE code = ?', [assignedRoleCode]);
  if (!targetRole || targetRole.code === 'pending_staff') throw new AppError(400, 'Invalid assigned role.');

  const targetDeptId = department_id ? Number(department_id) : (request?.department_id || user.department_id || null);
  const targetBranchId = branch_id ? Number(branch_id) : (request?.branch_id || user.branch_id || 1);
  const targetSpecId = specialty_id ? Number(specialty_id) : (request?.specialty_id || null);

  db.transaction(() => {
    db.run(
      `UPDATE users
       SET role_id = ?, branch_id = ?, department_id = ?, is_active = 1, account_status = 'Active',
           reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [targetRole.id, targetBranchId, targetDeptId, adminUserId, admin_notes || 'Approved by administrator', targetUid]
    );

    if (targetRole.is_staff) {
      const empCode = request?.employee_id || `EMP-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
      const existingEmp = db.get('SELECT id FROM employee_profiles WHERE user_id = ?', [targetUid]);
      if (!existingEmp) {
        db.run(
          `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, photo_url, joining_date, employment_status, base_salary)
           VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), 'Active', ?)`,
          [targetUid, empCode, targetDeptId, targetBranchId, targetRole.name.toUpperCase(), request?.qualification || null, request?.photo_url || null, targetRole.code === 'doctor' ? 14000 : 5500]
        );
      } else {
        db.run(
          `UPDATE employee_profiles SET department_id = ?, branch_id = ?, designation = ?, employment_status = 'Active', updated_at = datetime('now') WHERE user_id = ?`,
          [targetDeptId, targetBranchId, targetRole.name.toUpperCase(), targetUid]
        );
      }
    }

    if (targetRole.code === 'doctor') {
      const existingDoc = db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [targetUid]);
      if (!existingDoc) {
        const fallbackSpec = (targetSpecId && db.get('SELECT id FROM specialties WHERE id = ?', [targetSpecId])) ||
          (targetDeptId && db.get('SELECT id FROM specialties WHERE department_id = ? ORDER BY id LIMIT 1', [targetDeptId])) ||
          db.get('SELECT id FROM specialties ORDER BY id LIMIT 1');
        const resolvedDept = targetDeptId || db.get('SELECT id FROM departments ORDER BY id LIMIT 1')?.id || 1;
        const regNumber = request?.medical_registration_number || `REG-MED-${crypto.randomInt(10000, 99999)}`;
        db.run(
          `INSERT INTO doctor_profiles (
             user_id, doctor_code, specialty_id, department_id, branch_id, qualification,
             experience_years, consultation_fee, bio, availability_status, is_active,
             registration_number, medical_council, licence_url, photo_url, working_days, slot_minutes, schedule_configured
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 1, ?, ?, ?, ?, '', 30, 0)`,
          [
            targetUid,
            `DR-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`,
            fallbackSpec.id,
            resolvedDept,
            targetBranchId,
            request?.qualification || 'MD',
            Number(request?.experience_years || 5),
            Number(request?.consultation_fee || 100),
            'Board-certified specialist at MediCore HMS.',
            regNumber,
            request?.medical_council || null,
            request?.licence_url || request?.document_url || null,
            request?.photo_url || null
          ]
        );
      } else {
        db.run(
          `UPDATE doctor_profiles SET is_active = 1, department_id = COALESCE(?, department_id), branch_id = COALESCE(?, branch_id), specialty_id = COALESCE(?, specialty_id), updated_at = datetime('now') WHERE user_id = ?`,
          [targetDeptId, targetBranchId, targetSpecId, targetUid]
        );
      }
    }

    if (request) {
      db.run(
        `UPDATE staff_signup_requests
         SET status = 'Approved', reviewed_by = ?, reviewed_at = datetime('now'), admin_notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [adminUserId, admin_notes || null, request.id]
      );
    }

    logAudit(db, {
      actorUserId: adminUserId,
      actorRole: 'admin',
      action: targetRole.code === 'doctor' ? 'auth.doctor_verified' : 'auth.staff_signup_approved',
      entityType: request ? 'staff_signup_request' : 'user',
      entityId: request ? request.id : targetUid,
      details: JSON.stringify({ assignedRole: targetRole.code, department_id: targetDeptId, branch_id: targetBranchId })
    });
  })();

  createNotification(db, broker, {
    userId: targetUid,
    roles: ['admin'],
    title: targetRole.code === 'doctor' ? 'Doctor Credentials Verified' : 'Staff Signup Approved',
    message: targetRole.code === 'doctor'
      ? 'Your medical credentials have been verified. Sign in to complete your schedule setup wizard.'
      : `Your account registration as ${targetRole.name} has been approved by administration.`,
    eventType: 'member:updated'
  });

  return {
    ok: true,
    status: 'Approved',
    role: targetRole.code,
    message: `Request approved for ${user.full_name} as ${targetRole.name}.`
  };
}

export function rejectSignupRequestTx(db, broker, { requestId = null, userId = null, adminUserId, reason }) {
  if (!String(reason || '').trim()) throw new AppError(400, 'Rejection reason is required.');
  const cleanReason = String(reason).trim();

  const request = requestId
    ? db.get('SELECT * FROM staff_signup_requests WHERE id = ?', [Number(requestId)])
    : db.get('SELECT * FROM staff_signup_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1', [Number(userId)]);

  const targetUid = request ? request.user_id : Number(userId);
  const user = db.get('SELECT * FROM users WHERE id = ?', [targetUid]);
  if (!user) throw new AppError(404, 'Signup request or user not found.');

  db.transaction(() => {
    if (request) {
      db.run(
        `UPDATE staff_signup_requests
         SET status = 'Rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [cleanReason, adminUserId, request.id]
      );
    }
    db.run(
      `UPDATE users
       SET is_active = 0, account_status = 'Rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [adminUserId, cleanReason, targetUid]
    );
    logAudit(db, {
      actorUserId: adminUserId,
      actorRole: 'admin',
      action: 'auth.staff_signup_rejected',
      entityType: request ? 'staff_signup_request' : 'user',
      entityId: request ? request.id : targetUid,
      details: JSON.stringify({ reason: cleanReason })
    });
  })();

  createNotification(db, broker, {
    userId: targetUid,
    roles: ['admin'],
    title: 'Registration Declined',
    message: `Your application was reviewed and rejected. Reason: ${cleanReason}`,
    eventType: 'member:updated'
  });

  return { ok: true, status: 'Rejected', message: `Signup request rejected.` };
}
