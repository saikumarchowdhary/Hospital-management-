export function initSchemaPart1(db) {
  db.exec(`
    -- 1. Identity & Organization
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      is_staff INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT,
      category TEXT NOT NULL DEFAULT 'clinical',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS specialties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_code TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      account_status TEXT NOT NULL DEFAULT 'Active',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      review_notes TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      reset_token_hash TEXT,
      reset_expires_at TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patient_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
      patient_code TEXT NOT NULL UNIQUE,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL,
      blood_group TEXT,
      address TEXT NOT NULL,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      national_id TEXT,
      otp_verified INTEGER NOT NULL DEFAULT 1,
      profile_completion INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employee_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
      employee_code TEXT NOT NULL UNIQUE,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      designation TEXT NOT NULL,
      qualification TEXT,
      shift TEXT DEFAULT 'Day',
      photo_url TEXT,
      joining_date TEXT NOT NULL,
      employment_status TEXT NOT NULL DEFAULT 'Active',
      base_salary REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
      doctor_code TEXT NOT NULL UNIQUE,
      specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE RESTRICT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      qualification TEXT NOT NULL,
      registration_number TEXT,
      experience_years INTEGER NOT NULL DEFAULT 1,
      consultation_fee REAL NOT NULL DEFAULT 50,
      bio TEXT,
      photo_url TEXT,
      rating REAL DEFAULT 4.8,
      availability_status TEXT NOT NULL DEFAULT 'Available',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_minutes INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(doctor_id, day_of_week, start_time)
    );

    CREATE TABLE IF NOT EXISTS staff_signup_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      requested_role TEXT NOT NULL,
      branch_id INTEGER REFERENCES branches(id),
      department_id INTEGER REFERENCES departments(id),
      employee_id TEXT,
      qualification TEXT,
      document_url TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      rejection_reason TEXT,
      admin_notes TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

  `);
}
