export function initSchemaPart2(db) {
  db.exec(`
    -- 3. Admissions & Facilities
    CREATE TABLE IF NOT EXISTS wards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      ward_type TEXT NOT NULL,
      floor TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ward_id INTEGER NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
      room_number TEXT NOT NULL,
      room_type TEXT NOT NULL DEFAULT 'Standard',
      daily_rate REAL NOT NULL DEFAULT 150,
      status TEXT NOT NULL DEFAULT 'Available',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ward_id, room_number)
    );

    CREATE TABLE IF NOT EXISTS beds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      bed_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'Available',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_ref TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
      case_manager_id INTEGER REFERENCES users(id),
      bed_id INTEGER REFERENCES beds(id) ON DELETE RESTRICT,
      admission_type TEXT NOT NULL DEFAULT 'Elective',
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Requested',
      admitted_at TEXT,
      discharged_at TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bed_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id INTEGER NOT NULL REFERENCES admissions(id) ON DELETE RESTRICT,
      bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
      allocated_by INTEGER NOT NULL REFERENCES users(id),
      allocated_at TEXT NOT NULL DEFAULT (datetime('now')),
      released_at TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discharge_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_id INTEGER NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      summary TEXT NOT NULL,
      follow_up_instructions TEXT,
      checklist_json TEXT,
      discharged_by INTEGER NOT NULL REFERENCES users(id),
      discharged_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nursing_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
      assigned_nurse_id INTEGER REFERENCES users(id),
      task_type TEXT NOT NULL,
      description TEXT NOT NULL,
      due_time TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      completed_by INTEGER REFERENCES users(id),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nursing_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
      nurse_id INTEGER NOT NULL REFERENCES users(id),
      observation TEXT NOT NULL,
      medication_administered TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_ref TEXT NOT NULL UNIQUE,
      ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      bed_id INTEGER REFERENCES beds(id) ON DELETE SET NULL,
      assigned_to INTEGER REFERENCES users(id),
      priority TEXT NOT NULL DEFAULT 'Normal',
      status TEXT NOT NULL DEFAULT 'Assigned',
      notes TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      housekeeping_task_id INTEGER NOT NULL REFERENCES housekeeping_tasks(id) ON DELETE RESTRICT,
      room_id INTEGER REFERENCES rooms(id),
      bed_id INTEGER REFERENCES beds(id),
      inspector_id INTEGER NOT NULL REFERENCES users(id),
      passed INTEGER NOT NULL,
      checklist_notes TEXT,
      inspected_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER REFERENCES rooms(id),
      bed_id INTEGER REFERENCES beds(id),
      issue TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Normal',
      status TEXT NOT NULL DEFAULT 'Open',
      reported_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. Pharmacy
    CREATE TABLE IF NOT EXISTS medicine_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      generic_name TEXT,
      category_id INTEGER REFERENCES medicine_categories(id) ON DELETE SET NULL,
      unit TEXT NOT NULL DEFAULT 'Tablet',
      unit_price REAL NOT NULL DEFAULT 1,
      reorder_level INTEGER NOT NULL DEFAULT 20,
      requires_prescription INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS medicine_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      quantity_received INTEGER NOT NULL,
      quantity_available INTEGER NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(medicine_id, batch_number)
    );

    CREATE TABLE IF NOT EXISTS pharmacy_inventory (
      medicine_id INTEGER PRIMARY KEY REFERENCES medicines(id) ON DELETE RESTRICT,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      batch_id INTEGER REFERENCES medicine_batches(id),
      movement_type TEXT NOT NULL,
      quantity_delta INTEGER NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      performed_by INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dispensing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      batch_id INTEGER REFERENCES medicine_batches(id),
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      dispensed_by INTEGER NOT NULL REFERENCES users(id),
      dispensed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refill_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Requested',
      reviewed_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
