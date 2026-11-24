import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errors.js';
import { isStrongPassword } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';
import { createNotification } from '../services/notifications.js';

export const SELF_REGISTER_STAFF_ROLES = [
  'nurse', 'receptionist', 'case_manager', 'lab_staff', 'pharmacist', 'radiologist',
  'accountant', 'hr', 'publisher', 'approver', 'external_coordinator', 'housekeeping'
];

function uniqueCode(prefix) {
  return `${prefix}-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;
}

export function registerStaffPendingTx(db, broker, body, ip) {
  const {
    requested_role, full_name, email, mobile, password,
    branch_id = 1, department_id = null, employee_id = '', qualification = '',
    document_url = ''
  } = body;

  if (requested_role === 'admin' || requested_role === 'doctor') {
    throw new AppError(403, 'Doctor and Administrator accounts cannot be created via public sign-up. Please contact hospital administration.');
  }
  if (!SELF_REGISTER_STAFF_ROLES.includes(requested_role)) {
    throw new AppError(400, 'Please select a valid hospital staff role.');
  }
  if (!full_name || String(full_name).trim().length < 2) throw new AppError(400, 'Full name is required.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Valid email is required.');
  if (!mobile || String(mobile).trim().length < 6) throw new AppError(400, 'Valid mobile number is required.');
  if (!isStrongPassword(password)) throw new AppError(400, 'Password must be at least 8 characters and include a number.');

  const safeEmail = String(email).trim().toLowerCase();
  const safeMobile = String(mobile).trim();
  const dup = db.get('SELECT id FROM users WHERE lower(email) = lower(?) OR phone = ?', [safeEmail, safeMobile]);
  if (dup) throw new AppError(409, 'An account with this email or mobile number already exists.');

  const pendingRole = db.get("SELECT id, code, name FROM roles WHERE code = 'pending_staff'");
  if (!pendingRole) throw new AppError(500, 'System pending staff role configuration missing.');

  const requestedRoleRow = db.get('SELECT id, code, name FROM roles WHERE code = ?', [requested_role]);
  const roleName = requestedRoleRow ? requestedRoleRow.name : requested_role;

  const userCode = uniqueCode('STF');
  const hash = bcrypt.hashSync(password, 10);
  const deptId = department_id ? Number(department_id) : null;
  const branchId = branch_id ? Number(branch_id) : 1;

  const uid = db.transaction(() => {
    const uInfo = db.run(
      `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Pending Approval')`,
      [userCode, safeEmail, hash, String(full_name).trim(), safeMobile, pendingRole.id, branchId, deptId]
    );

    const userId = uInfo.lastInsertRowid;

    db.run(
      `INSERT INTO staff_signup_requests (user_id, full_name, email, phone, requested_role, branch_id, department_id, employee_id, qualification, document_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [userId, String(full_name).trim(), safeEmail, safeMobile, requested_role, branchId, deptId, employee_id || null, qualification || null, document_url || null]
    );

    logAudit(db, {
      actorUserId: userId,
      actorRole: 'pending_staff',
      action: 'auth.staff_signup_requested',
      entityType: 'user',
      entityId: userId,
      details: JSON.stringify({ requested_role, branch_id: branchId, department_id: deptId }),
      ip
    });

    return userId;
  })();

  createNotification(db, broker, {
    roles: ['admin'],
    title: 'New Staff Signup Request',
    message: `${full_name} submitted a signup request for role ${roleName} (${userCode}).`,
    eventType: 'member:registered'
  });

  return {
    id: uid,
    user_code: userCode,
    email: safeEmail,
    full_name: String(full_name).trim(),
    role: 'pending_staff',
    role_name: 'Pending Staff',
    requested_role,
    requested_role_name: roleName,
    account_status: 'Pending Approval',
    is_staff: false
  };
}
