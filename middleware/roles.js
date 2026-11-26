export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: `Access denied for role: ${req.user.role_name}.` });
  };
}

export function requirePermission(...requiredPerms) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'admin' || req.user.permissions.includes('admin.all')) {
      return next();
    }
    const ok = requiredPerms.some((p) => req.user.permissions.includes(p));
    if (!ok) {
      return res.status(403).json({ error: 'Insufficient permissions for this operation.' });
    }
    return next();
  };
}

/**
 * Enforces patient-level clinical isolation:
 * - Patients only access their own records.
 * - Accountants/HR cannot read restricted clinical notes/diagnoses.
 * - Doctors/Nurses access patients assigned via appointments, admissions, or lab/clinical care.
 */
export function canAccessClinicalRecord(db, user, patientId) {
  const pid = Number(patientId);
  if (user.role === 'admin') return true;
  if (user.role === 'patient') return user.patient_id === pid;
  if (['accountant', 'hr', 'publisher', 'approver', 'housekeeping', 'candidate', 'external_coordinator', 'radiologist', 'bloodbank_staff', 'department_admin'].includes(user.role)) {
    return false;
  }
  if (user.role === 'doctor') {
    if (!user.doctor_id) return false;
    const assigned = db.get(
      `SELECT 1 as ok FROM appointments WHERE patient_id = ? AND doctor_id = ?
       UNION
       SELECT 1 as ok FROM admissions WHERE patient_id = ? AND doctor_id = ?
       UNION
       SELECT 1 as ok FROM consultations WHERE patient_id = ? AND doctor_id = ?
       LIMIT 1`,
      [pid, user.doctor_id, pid, user.doctor_id, pid, user.doctor_id]
    );
    return Boolean(assigned);
  }
  if (user.role === 'nurse') {
    const assigned = db.get(
      `SELECT 1 as ok FROM admissions WHERE patient_id = ? AND status IN ('Admitted','Active Care','Discharge Pending')
       UNION
       SELECT 1 as ok FROM nursing_tasks WHERE patient_id = ?
       UNION
       SELECT 1 as ok FROM appointments WHERE patient_id = ? AND status IN ('Checked In','In Consultation')
       LIMIT 1`,
      [pid, pid, pid]
    );
    return Boolean(assigned);
  }
  return false;
}
