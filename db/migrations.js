import { initSchemaPart1 } from './schema.js';
import { initSchemaPart1b } from './schema_part1b.js';
import { initSchemaPart2 } from './schema_part2.js';
import { initSchemaPart3 } from './schema_part3.js';
import { initSchemaPart3b } from './schema_part3b.js';
import { initSchemaPart4 } from './schema_part4.js';
import { initSchemaPart4b } from './schema_part4b.js';

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

    CREATE TRIGGER IF NOT EXISTS trg_prevent_direct_doctor_admin_signup
    BEFORE INSERT ON users
    FOR EACH ROW
    WHEN (
      NEW.role_id IN (SELECT id FROM roles WHERE code IN ('doctor', 'admin'))
      AND NEW.account_status IN ('Pending Approval', 'Pending Verification')
    )
    BEGIN
      SELECT RAISE(ABORT, 'Direct public sign-up for doctor and admin roles is prohibited.');
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

  db.exec(`
    UPDATE doctor_profiles SET schedule_configured = 1
    WHERE schedule_configured = 0 AND EXISTS (
      SELECT 1 FROM doctor_schedules ds WHERE ds.doctor_id = doctor_profiles.id AND ds.is_active = 1
    );
  `);
}
