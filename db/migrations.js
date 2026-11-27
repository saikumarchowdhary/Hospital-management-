import crypto from 'node:crypto';
import { initSchemaPart1 } from './schema.js';
import { initSchemaPart1b } from './schema_part1b.js';
import { initSchemaPart2 } from './schema_part2.js';
import { initSchemaPart3 } from './schema_part3.js';
import { initSchemaPart3b } from './schema_part3b.js';
import { initSchemaPart4 } from './schema_part4.js';
import { initSchemaPart4b } from './schema_part4b.js';
import { normalizePhone } from '../services/phone.js';

export function syncUsersPhoneNormalized(db) {
  const users = db.all('SELECT id, user_code, phone, phone_normalized FROM users ORDER BY id ASC');
  const seen = new Set();
  for (const u of users) {
    let norm = normalizePhone(u.phone);
    if (!norm) continue;
    if (seen.has(norm)) {
      const altPhone = `+1-555-9${String(u.id).padStart(3, '0')}`;
      const altNorm = normalizePhone(altPhone);
      db.run('UPDATE users SET phone = ?, phone_normalized = ? WHERE id = ?', [altPhone, altNorm, u.id]);
      seen.add(altNorm);
    } else {
      seen.add(norm);
      if (u.phone_normalized !== norm) {
        db.run('UPDATE users SET phone_normalized = ? WHERE id = ?', [norm, u.id]);
      }
    }
  }
}

export function activatePendingDoctorAccounts(db) {
  const doctorRole = db.get("SELECT id FROM roles WHERE code = 'doctor'");
  if (!doctorRole) return;

  db.run(
    `UPDATE users
     SET is_active = 1, account_status = 'Active', updated_at = datetime('now')
     WHERE role_id = ? AND account_status IN ('Pending Verification', 'Pending Approval', 'Pending', 'pending', 'unverified', 'Unverified', 'awaiting_approval', 'Awaiting Approval')`,
    [doctorRole.id]
  );

  const pendingDocRequests = db.all(
    `SELECT sr.*, u.user_code, u.branch_id as user_branch_id, u.department_id as user_dept_id
     FROM staff_signup_requests sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.requested_role = 'doctor'
       AND (
         sr.status IN ('Pending', 'Info Requested')
         OR u.account_status IN ('Pending Verification', 'Pending Approval', 'Pending', 'pending', 'unverified', 'Unverified', 'awaiting_approval', 'Awaiting Approval')
         OR u.role_id = (SELECT id FROM roles WHERE code = 'pending_staff')
       )`
  );

  for (const req of pendingDocRequests) {
    const uid = req.user_id;
    const targetDeptId = req.department_id || req.user_dept_id || db.get('SELECT id FROM departments ORDER BY id LIMIT 1')?.id || 1;
    const targetBranchId = req.branch_id || req.user_branch_id || db.get('SELECT id FROM branches ORDER BY id LIMIT 1')?.id || 1;
    const targetSpecId =
      req.specialty_id ||
      db.get('SELECT id FROM specialties WHERE department_id = ? ORDER BY id LIMIT 1', [targetDeptId])?.id ||
      db.get('SELECT id FROM specialties ORDER BY id LIMIT 1')?.id ||
      1;

    db.transaction(() => {
      db.run(
        `UPDATE users
         SET role_id = ?, branch_id = ?, department_id = ?, is_active = 1, account_status = 'Active', updated_at = datetime('now')
         WHERE id = ?`,
        [doctorRole.id, targetBranchId, targetDeptId, uid]
      );

      if (!db.get('SELECT id FROM employee_profiles WHERE user_id = ?', [uid])) {
        db.run(
          `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, photo_url, joining_date, employment_status, base_salary)
           VALUES (?, ?, ?, ?, 'DOCTOR', ?, ?, date('now'), 'Active', 14000)`,
          [uid, req.employee_id || `EMP-${req.user_code}`, targetDeptId, targetBranchId, req.qualification || null, req.photo_url || null]
        );
      }

      if (!db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [uid])) {
        db.run(
          `INSERT INTO doctor_profiles (
             user_id, doctor_code, specialty_id, department_id, branch_id, qualification,
             experience_years, consultation_fee, bio, availability_status, is_active,
             registration_number, medical_council, licence_url, photo_url, licence_attachment_id, photo_attachment_id,
             working_days, slot_minutes, schedule_configured
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 1, ?, ?, ?, ?, ?, ?, '', 30, 0)`,
          [
            uid,
            `DR-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`,
            targetSpecId,
            targetDeptId,
            targetBranchId,
            req.qualification || 'MD',
            Number(req.experience_years || 5),
            Number(req.consultation_fee || 100),
            'Board-certified specialist at MediCore HMS.',
            req.medical_registration_number || `REG-MED-${crypto.randomInt(10000, 99999)}`,
            req.medical_council || null,
            req.licence_url || req.document_url || null,
            req.photo_url || null,
            req.licence_attachment_id || null,
            req.photo_attachment_id || null
          ]
        );
      }

      db.run(
        `UPDATE staff_signup_requests
         SET status = 'Approved', reviewed_at = COALESCE(reviewed_at, datetime('now')), updated_at = datetime('now')
         WHERE id = ?`,
        [req.id]
      );
    })();
  }
}

export function runMigrations(db) {
  initSchemaPart1(db);
  initSchemaPart1b(db);
  initSchemaPart2(db);
  initSchemaPart3(db);
  initSchemaPart3b(db);
  initSchemaPart4(db);
  initSchemaPart4b(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, appointment_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id, appointment_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    CREATE INDEX IF NOT EXISTS idx_slots_lookup ON appointment_slots(doctor_id, slot_date, status);
    CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status);
    CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(user_id, role_code, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_system_events_id ON system_events(id);
  `);

  const ensureCol = (table, col, def) => {
    const cols = db.all(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  };
  ensureCol('doctor_profiles', 'availability_status', "TEXT NOT NULL DEFAULT 'Available'");
  ensureCol('doctor_profiles', 'photo_url', 'TEXT');
  ensureCol('doctor_profiles', 'registration_number', 'TEXT');
  ensureCol('doctor_profiles', 'medical_council', 'TEXT');
  ensureCol('doctor_profiles', 'licence_url', 'TEXT');
  ensureCol('doctor_profiles', 'licence_attachment_id', 'INTEGER');
  ensureCol('doctor_profiles', 'photo_attachment_id', 'INTEGER');
  ensureCol('doctor_profiles', 'working_days', "TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri'");
  ensureCol('doctor_profiles', 'slot_minutes', 'INTEGER DEFAULT 30');
  ensureCol('doctor_profiles', 'schedule_configured', 'INTEGER NOT NULL DEFAULT 0');
  ensureCol('doctor_schedules', 'break_start', 'TEXT');
  ensureCol('doctor_schedules', 'break_end', 'TEXT');
  ensureCol('patient_consents', 'consent_text', 'TEXT');
  ensureCol('patient_consents', 'consent_version', "TEXT DEFAULT 'v1.0'");
  ensureCol('appointments', 'checked_out_at', 'TEXT');
  ensureCol('housekeeping_tasks', 'task_type', "TEXT NOT NULL DEFAULT 'Cleaning'");
  ensureCol('users', 'account_status', "TEXT NOT NULL DEFAULT 'Active'");
  ensureCol('users', 'phone_normalized', 'TEXT');
  ensureCol('users', 'reviewed_by', 'INTEGER');
  ensureCol('users', 'reviewed_at', 'TEXT');
  ensureCol('users', 'review_notes', 'TEXT');
  ensureCol('employee_profiles', 'qualification', 'TEXT');
  ensureCol('employee_profiles', 'shift', "TEXT DEFAULT 'Day'");
  ensureCol('employee_profiles', 'photo_url', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_signup_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      requested_role TEXT NOT NULL,
      branch_id INTEGER REFERENCES branches(id),
      department_id INTEGER REFERENCES departments(id),
      employee_id TEXT,
      qualification TEXT,
      document_url TEXT,
      medical_registration_number TEXT,
      medical_council TEXT,
      specialty_id INTEGER,
      experience_years INTEGER,
      consultation_fee REAL,
      licence_url TEXT,
      photo_url TEXT,
      licence_attachment_id INTEGER,
      photo_attachment_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Pending',
      rejection_reason TEXT,
      admin_notes TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_staff_requests_status ON staff_signup_requests(status);
    CREATE INDEX IF NOT EXISTS idx_staff_requests_user ON staff_signup_requests(user_id);

    CREATE TABLE IF NOT EXISTS otp_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'signup',
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_otp_target ON otp_verifications(channel, target, purpose);

    CREATE TABLE IF NOT EXISTS bed_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_ref TEXT NOT NULL UNIQUE,
      admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      from_bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
      to_bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
      reason TEXT NOT NULL,
      transferred_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bed_transfers_patient ON bed_transfers(patient_id, created_at);

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      signature_valid INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Processed',
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integration_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'Sandbox',
      status TEXT NOT NULL,
      provider_ref TEXT,
      error_message TEXT,
      actor_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS search_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      user_role TEXT,
      search_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_search_analytics_date ON search_analytics(search_date, term);

    INSERT OR IGNORE INTO roles (code, name, description, is_staff)
    VALUES ('pending_staff', 'Pending Staff', 'Awaiting administrative verification and role assignment', 0);

    INSERT OR IGNORE INTO roles (code, name, description, is_staff)
    VALUES ('housekeeping_supervisor', 'Housekeeping Supervisor', 'Supervises room cleaning, sanitization, and inspections', 1);

    DROP TRIGGER IF EXISTS trg_prevent_direct_doctor_admin_signup;

    CREATE TRIGGER IF NOT EXISTS trg_prevent_pending_admin_signup
    BEFORE INSERT ON users
    FOR EACH ROW
    WHEN (
      NEW.role_id IN (SELECT id FROM roles WHERE code = 'admin')
      AND NEW.account_status IN ('Pending Approval', 'Pending Verification')
    )
    BEGIN
      SELECT RAISE(ABORT, 'Direct public sign-up for admin role is prohibited.');
    END;

    UPDATE users SET account_status = CASE WHEN is_active = 1 THEN 'Active' ELSE 'Suspended' END WHERE account_status IS NULL OR account_status = '';
  `);
  ensureCol('staff_signup_requests', 'phone', 'TEXT');
  ensureCol('staff_signup_requests', 'medical_registration_number', 'TEXT');
  ensureCol('staff_signup_requests', 'medical_council', 'TEXT');
  ensureCol('staff_signup_requests', 'specialty_id', 'INTEGER');
  ensureCol('staff_signup_requests', 'experience_years', 'INTEGER');
  ensureCol('staff_signup_requests', 'consultation_fee', 'REAL');
  ensureCol('staff_signup_requests', 'licence_url', 'TEXT');
  ensureCol('staff_signup_requests', 'photo_url', 'TEXT');
  ensureCol('staff_signup_requests', 'licence_attachment_id', 'INTEGER');
  ensureCol('staff_signup_requests', 'photo_attachment_id', 'INTEGER');

  // Admin Departments, Branches & HR/Recruitment/Publishing Schema Extensions
  ensureCol('departments', 'head_user_id', 'INTEGER REFERENCES users(id)');
  ensureCol('departments', 'description', 'TEXT');
  ensureCol('branches', 'city', 'TEXT');
  ensureCol('employee_profiles', 'employment_type', "TEXT NOT NULL DEFAULT 'Full-Time'");

  ensureCol('job_vacancies', 'location', "TEXT NOT NULL DEFAULT 'Main Campus'");
  ensureCol('job_vacancies', 'required_experience', 'TEXT');
  ensureCol('job_vacancies', 'required_qualifications', 'TEXT');
  ensureCol('job_vacancies', 'opening_date', 'TEXT');
  ensureCol('job_vacancies', 'closing_date', 'TEXT');

  ensureCol('job_applications', 'rejection_reason', 'TEXT');
  ensureCol('job_applications', 'reviewer_notes', 'TEXT');
  ensureCol('job_applications', 'reviewed_by', 'INTEGER REFERENCES users(id)');
  ensureCol('job_applications', 'cert_attachment_id', 'INTEGER');

  ensureCol('interviews', 'interviewer_user_id', 'INTEGER REFERENCES users(id)');
  ensureCol('interviews', 'notes', 'TEXT');
  ensureCol('interviews', 'recorded_by', 'INTEGER REFERENCES users(id)');

  ensureCol('announcements', 'category', "TEXT NOT NULL DEFAULT 'General'");
  ensureCol('announcements', 'department_id', 'INTEGER REFERENCES departments(id)');
  ensureCol('announcements', 'branch_id', 'INTEGER REFERENCES branches(id)');
  ensureCol('announcements', 'published_at', 'TEXT');
  ensureCol('announcements', 'archived_at', 'TEXT');

  ensureCol('campaigns', 'published_at', 'TEXT');
  ensureCol('campaigns', 'archived_at', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'Contract',
      attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employee_docs_emp ON employee_documents(employee_id);

    CREATE TABLE IF NOT EXISTS candidate_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
      candidate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL DEFAULT 'Certificate',
      title TEXT NOT NULL,
      attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_candidate_docs_app ON candidate_documents(application_id);

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_ref TEXT NOT NULL UNIQUE,
      application_id INTEGER NOT NULL UNIQUE REFERENCES job_applications(id) ON DELETE CASCADE,
      candidate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vacancy_id INTEGER NOT NULL REFERENCES job_vacancies(id) ON DELETE RESTRICT,
      offered_salary REAL NOT NULL,
      joining_date TEXT NOT NULL,
      employment_type TEXT NOT NULL DEFAULT 'Full-Time',
      letter_attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Issued',
      candidate_response_notes TEXT,
      responded_at TEXT,
      issued_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_offers_candidate ON offers(candidate_user_id, status);

    CREATE TABLE IF NOT EXISTS notice_acknowledgements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      UNIQUE(announcement_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notice_acks_ann ON notice_acknowledgements(announcement_id, user_id);

    CREATE TABLE IF NOT EXISTS admin_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_label TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      target_role TEXT NOT NULL DEFAULT 'department_admin',
      department_id INTEGER REFERENCES departments(id),
      is_demo INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      used_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_codes_active ON admin_verification_codes(is_active, is_demo);

    CREATE TABLE IF NOT EXISTS category (
      category_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );

    INSERT OR IGNORE INTO roles (code, name, description, is_staff)
    VALUES ('department_admin', 'Department Admin', 'Department-level administration and operations', 1);

    UPDATE doctor_profiles SET schedule_configured = 1
    WHERE schedule_configured = 0 AND EXISTS (
      SELECT 1 FROM doctor_schedules ds WHERE ds.doctor_id = doctor_profiles.id AND ds.is_active = 1
    );
  `);

  // Part 2 & Part 3 extensions for Prescriptions PDF + UPI QR Payments
  ensureCol('prescriptions', 'appointment_id', 'INTEGER REFERENCES appointments(id)');
  ensureCol('prescriptions', 'diagnosis', 'TEXT');
  ensureCol('prescriptions', 'symptoms', 'TEXT');
  ensureCol('prescriptions', 'medicines_json', 'TEXT');
  ensureCol('prescriptions', 'tests_recommended_json', 'TEXT');
  ensureCol('prescriptions', 'advice', 'TEXT');
  ensureCol('prescriptions', 'follow_up_date', 'TEXT');

  ensureCol('payments', 'bill_type', "TEXT NOT NULL DEFAULT 'other'");
  ensureCol('payments', 'description', 'TEXT');
  ensureCol('payments', 'transaction_id', 'TEXT');
  ensureCol('payments', 'payment_method', 'TEXT');
  ensureCol('payments', 'created_by', 'INTEGER REFERENCES users(id)');
  ensureCol('payments', 'verification_notes', 'TEXT');
  ensureCol('payments', 'verified_by', 'INTEGER REFERENCES users(id)');
  ensureCol('payments', 'verified_at', 'TEXT');
  ensureCol('payments', 'upi_submitted_at', 'TEXT');
  ensureCol('payments', 'razorpay_order_id', 'TEXT');

  // Hospital ID / Employee ID system for doctors and hospital staff
  ensureCol('users', 'hospital_id', 'TEXT');
  ensureCol('employee_profiles', 'hospital_id', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
      assigned_role TEXT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      is_used INTEGER NOT NULL DEFAULT 0,
      used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      used_at TEXT,
      created_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hospital_ids_lookup ON hospital_ids(hospital_id, is_used);
    CREATE INDEX IF NOT EXISTS idx_hospital_ids_used ON hospital_ids(is_used);
  `);

  const hidCount = db.get('SELECT COUNT(*) as cnt FROM hospital_ids');
  if (!hidCount || hidCount.cnt === 0) {
    const seedIds = [
      ['MED001', 'doctor', 'General Medicine Specialist'],
      ['MED002', 'doctor', 'Cardiology Specialist'],
      ['MED003', 'nurse', 'Inpatient Nursing Staff'],
      ['MED004', 'nurse', 'ICU Care Nurse'],
      ['MED005', 'receptionist', 'Central Reception Desk'],
      ['MED006', 'pharmacist', 'Inpatient Pharmacy'],
      ['MED007', 'lab_staff', 'Pathology & Diagnostic Lab'],
      ['MED008', 'radiologist', 'Medical Imaging & Radiology'],
      ['MED009', 'accountant', 'Billing & Finance Officer'],
      ['MED010', null, 'Available Staff / Doctor ID'],
      ['MED011', null, 'Available Staff / Doctor ID'],
      ['MED012', null, 'Available Staff / Doctor ID']
    ];
    for (const [code, role, notes] of seedIds) {
      db.run(
        `INSERT OR IGNORE INTO hospital_ids (hospital_id, assigned_role, notes) VALUES (?, ?, ?)`,
        [code, role, notes]
      );
    }
  }
  activatePendingDoctorAccounts(db);
  syncUsersPhoneNormalized(db);
  seedRoleAccessPasscodes(db);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_normalized ON users(phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_normalized != '';
  `);
}

function seedRoleAccessPasscodes(db) {
  const presets = [
    {
      label: 'Admin Role Passcode',
      targetRole: 'admin',
      hash: '$2b$10$MIUQqLxkmrCn.l7nMTJ3ouS9EYahq8kM7q8m.emPhoVhc3R8UKROq',
    },
    {
      label: 'Department Admin Role Passcode',
      targetRole: 'department_admin',
      hash: '$2b$10$iJKPLb/rz6T6DMysZDqZQujj9KibiaXLQk7l1ZPEu5uf51QMEjyCa',
    },
  ];
  for (const preset of presets) {
    const existing = db.get(
      'SELECT id FROM admin_verification_codes WHERE code_label = ? AND target_role = ?',
      [preset.label, preset.targetRole]
    );
    if (!existing) {
      db.run(
        `INSERT INTO admin_verification_codes (code_label, code_hash, target_role, department_id, is_demo, is_active)
         VALUES (?, ?, ?, NULL, 0, 1)`,
        [preset.label, preset.hash, preset.targetRole]
      );
    }
  }
}
