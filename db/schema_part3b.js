export function initSchemaPart3b(db) {
  db.exec(`
    -- 7. Finance & Insurance
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      branch_id INTEGER REFERENCES branches(id),
      description TEXT NOT NULL,
      consultation_charges REAL NOT NULL DEFAULT 0,
      lab_charges REAL NOT NULL DEFAULT 0,
      pharmacy_charges REAL NOT NULL DEFAULT 0,
      admission_charges REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_ref TEXT NOT NULL UNIQUE,
      receipt_number TEXT NOT NULL UNIQUE,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'Demo Card',
      is_simulated INTEGER NOT NULL DEFAULT 1,
      idempotency_key TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'Paid',
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_ref TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Refunded',
      processed_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_ref TEXT NOT NULL UNIQUE,
      department_id INTEGER REFERENCES departments(id),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_ref TEXT NOT NULL UNIQUE,
      tx_type TEXT NOT NULL,
      reference_table TEXT NOT NULL,
      reference_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      actor_id INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insurance_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      tpa_code TEXT NOT NULL UNIQUE,
      contact_phone TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insurance_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      provider_id INTEGER NOT NULL REFERENCES insurance_providers(id) ON DELETE RESTRICT,
      policy_number TEXT NOT NULL UNIQUE,
      coverage_limit REAL NOT NULL DEFAULT 50000,
      valid_until TEXT NOT NULL,
      eligibility_status TEXT NOT NULL DEFAULT 'Manual Verification Pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insurance_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_ref TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
      policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
      admission_id INTEGER REFERENCES admissions(id),
      invoice_id INTEGER REFERENCES invoices(id),
      estimated_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      source_verification TEXT NOT NULL DEFAULT 'Manual / Simulated',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pre_authorizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES insurance_cases(id) ON DELETE RESTRICT,
      requested_amount REAL NOT NULL,
      approved_amount REAL DEFAULT 0,
      query_notes TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted',
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insurance_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_ref TEXT NOT NULL UNIQUE,
      case_id INTEGER NOT NULL REFERENCES insurance_cases(id) ON DELETE RESTRICT,
      claimed_amount REAL NOT NULL,
      settled_amount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Submitted',
      query_reason TEXT,
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insurance_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES insurance_cases(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      attachment_id INTEGER,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
