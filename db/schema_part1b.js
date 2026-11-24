export function initSchemaPart1b(db) {
  db.exec(`
    -- 2. Patient Services & Clinical
    CREATE TABLE IF NOT EXISTS appointment_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(doctor_id, slot_date, slot_time)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_ref TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      slot_id INTEGER REFERENCES appointment_slots(id) ON DELETE SET NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      visit_type TEXT NOT NULL DEFAULT 'In-Person',
      reason TEXT,
      fee REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Booked',
      checked_in_at TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(doctor_id, appointment_date, appointment_time)
    );

    CREATE TABLE IF NOT EXISTS consultations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
      chief_complaint TEXT NOT NULL,
      examination_notes TEXT,
      treatment_plan TEXT,
      status TEXT NOT NULL DEFAULT 'Finalized',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      icd_code TEXT,
      diagnosis_text TEXT NOT NULL,
      severity TEXT DEFAULT 'Moderate',
      is_primary INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_ref TEXT NOT NULL UNIQUE,
      consultation_id INTEGER REFERENCES consultations(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'Requested',
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prescription_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
      medicine_id INTEGER,
      medicine_name TEXT NOT NULL,
      dosage TEXT NOT NULL,
      frequency TEXT NOT NULL,
      duration TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      instructions TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
      follow_up_date TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Scheduled',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      record_type TEXT NOT NULL,
      title TEXT NOT NULL,
      source_module TEXT NOT NULL,
      reference_id INTEGER,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      is_released INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medical_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      condition_name TEXT NOT NULL,
      diagnosed_year TEXT,
      status TEXT NOT NULL DEFAULT 'Ongoing',
      notes TEXT,
      recorded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS allergies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      allergen TEXT NOT NULL,
      reaction TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Moderate',
      recorded_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patient_vitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      encounter_type TEXT DEFAULT 'OPD',
      encounter_id INTEGER,
      blood_pressure TEXT NOT NULL,
      pulse INTEGER NOT NULL,
      temperature REAL NOT NULL,
      respiratory_rate INTEGER NOT NULL,
      oxygen_saturation INTEGER NOT NULL,
      height_cm REAL,
      weight_kg REAL,
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clinical_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      note_type TEXT NOT NULL DEFAULT 'Progress',
      content TEXT NOT NULL,
      is_restricted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Released',
      attachment_id INTEGER,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patient_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      consent_type TEXT NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 1,
      accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
