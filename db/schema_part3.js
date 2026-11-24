export function initSchemaPart3(db) {
  db.exec(`
    -- 5. Laboratory & Radiology
    CREATE TABLE IF NOT EXISTS lab_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lab_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES lab_categories(id),
      price REAL NOT NULL DEFAULT 25,
      unit TEXT,
      reference_range TEXT,
      description TEXT,
      turnaround_hours INTEGER DEFAULT 6,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lab_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      doctor_id INTEGER REFERENCES doctor_profiles(id),
      branch_id INTEGER REFERENCES branches(id),
      test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
      scheduled_date TEXT,
      scheduled_slot TEXT,
      priority TEXT NOT NULL DEFAULT 'Routine',
      status TEXT NOT NULL DEFAULT 'Ordered',
      ordered_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lab_specimens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES lab_orders(id) ON DELETE RESTRICT,
      specimen_code TEXT NOT NULL UNIQUE,
      specimen_type TEXT NOT NULL,
      collected_by INTEGER NOT NULL REFERENCES users(id),
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lab_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES lab_orders(id) ON DELETE RESTRICT,
      result_value TEXT NOT NULL,
      unit TEXT,
      reference_range TEXT,
      abnormal_flag TEXT DEFAULT 'Normal',
      notes TEXT,
      attachment_id INTEGER,
      is_sample_demo INTEGER NOT NULL DEFAULT 1,
      performed_by INTEGER NOT NULL REFERENCES users(id),
      performed_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      released_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS radiology_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      doctor_id INTEGER REFERENCES doctor_profiles(id),
      modality TEXT NOT NULL,
      study_name TEXT NOT NULL,
      clinical_indication TEXT,
      scheduled_at TEXT,
      price REAL NOT NULL DEFAULT 80,
      status TEXT NOT NULL DEFAULT 'Ordered',
      ordered_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS radiology_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES radiology_orders(id) ON DELETE RESTRICT,
      findings TEXT NOT NULL,
      impression TEXT NOT NULL,
      attachment_id INTEGER,
      reported_by INTEGER NOT NULL REFERENCES users(id),
      reviewed_by INTEGER REFERENCES users(id),
      released_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. Blood Bank
    CREATE TABLE IF NOT EXISTS blood_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blood_donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donor_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      blood_group_id INTEGER NOT NULL REFERENCES blood_groups(id),
      phone TEXT NOT NULL,
      last_donation_date TEXT,
      eligible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blood_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bag_code TEXT NOT NULL UNIQUE,
      blood_group_id INTEGER NOT NULL REFERENCES blood_groups(id),
      component TEXT NOT NULL DEFAULT 'Whole Blood',
      donor_id INTEGER REFERENCES blood_donors(id),
      collection_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      screening_passed INTEGER NOT NULL DEFAULT 1,
      storage_location TEXT DEFAULT 'Bank Freezer A',
      status TEXT NOT NULL DEFAULT 'Available',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blood_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_ref TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      blood_group_id INTEGER NOT NULL REFERENCES blood_groups(id),
      component TEXT NOT NULL DEFAULT 'Whole Blood',
      units_requested INTEGER NOT NULL DEFAULT 1,
      urgency TEXT NOT NULL DEFAULT 'Routine',
      compatibility_checked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Requested',
      requested_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blood_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES blood_requests(id) ON DELETE RESTRICT,
      inventory_id INTEGER NOT NULL REFERENCES blood_inventory(id) ON DELETE RESTRICT,
      compatibility_verified_by INTEGER NOT NULL REFERENCES users(id),
      issued_by INTEGER NOT NULL REFERENCES users(id),
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blood_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_ref TEXT NOT NULL UNIQUE,
      external_provider_id INTEGER,
      blood_group_id INTEGER NOT NULL REFERENCES blood_groups(id),
      units INTEGER NOT NULL,
      direction TEXT NOT NULL DEFAULT 'Inbound',
      status TEXT NOT NULL DEFAULT 'Requested',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

  `);
}
