import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { seedClinicalData } from './seed_clinical.js';
import { seedClinicalDepartmentDoctors } from './seed_doctors.js';
import { seedOperationsData } from './seed_ops.js';
import { MASTER_DEPARTMENTS, MASTER_SPECIALTIES, syncMasterSeedData } from './sync_master.js';

export const ROLES = [
  ['patient', 'Patient', 'Appointments, records, bills, reports', 0],
  ['admin', 'Administrator', 'Complete hospital administration', 1],
  ['doctor', 'Doctor', 'Consultations, diagnosis, prescriptions', 1],
  ['nurse', 'Nurse', 'Patient care and vital monitoring', 1],
  ['receptionist', 'Receptionist', 'Registration and appointments', 1],
  ['case_manager', 'Case Manager', 'Admissions and coordination', 1],
  ['lab_staff', 'Laboratory Staff', 'Diagnostic tests and reports', 1],
  ['pharmacist', 'Pharmacist', 'Medicines and inventory', 1],
  ['radiologist', 'Radiologist', 'Medical imaging and scan reporting', 1],
  ['accountant', 'Accountant', 'Billing and finance', 1],
  ['hr', 'HR / Hiring Team', 'Employees and recruitment', 1],
  ['publisher', 'Publisher', 'Announcements and campaigns', 1],
  ['approver', 'Approver', 'Notice and campaign approvals', 1],
  ['housekeeping', 'Housekeeping Staff', 'Room cleaning and inspections', 1],
  ['housekeeping_supervisor', 'Housekeeping Supervisor', 'Supervises room cleaning, sanitization, and inspections', 1],
  ['bloodbank_staff', 'Blood Bank Staff', 'Blood inventory, donors, and issue control', 1],
  ['external_coordinator', 'External Coordinator', 'Suppliers and external requests', 1],
  ['candidate', 'Candidate', 'Careers and job applications', 0],
  ['pending_staff', 'Pending Staff', 'Awaiting administrative verification and role assignment', 0]
];

export const PERMISSIONS = [
  ['patients.read_own', 'patients', 'Read own patient profile and records'],
  ['patients.read_all', 'patients', 'Search and read patient demographics'],
  ['patients.write', 'patients', 'Register and update patient profiles'],
  ['clinical.read', 'clinical', 'Read restricted clinical notes and diagnoses'],
  ['clinical.write', 'clinical', 'Create consultations, diagnoses, prescriptions'],
  ['nursing.write', 'nursing', 'Record patient vitals and nursing notes'],
  ['appointments.manage', 'appointments', 'Book, confirm, check in, cancel appointments'],
  ['admissions.manage', 'admissions', 'Manage admissions, bed allocations, discharges'],
  ['lab.process', 'laboratory', 'Collect specimens, enter, review, release lab results'],
  ['radiology.process', 'radiology', 'Process imaging orders and release reports'],
  ['pharmacy.dispense', 'pharmacy', 'Manage batches, stock and dispense prescriptions'],
  ['bloodbank.manage', 'bloodbank', 'Manage donors, blood stock, compatibility & issue'],
  ['finance.manage', 'finance', 'Create invoices, payments, refunds, expenses'],
  ['insurance.manage', 'insurance', 'Manage insurance pre-auth and claims'],
  ['hr.manage', 'hr', 'Manage employees, attendance, leave, recruitment'],
  ['payroll.manage', 'payroll', 'Access and process restricted payroll records'],
  ['publisher.create', 'communication', 'Draft announcements and promotional campaigns'],
  ['approver.review', 'communication', 'Approve, reject, publish notices and campaigns'],
  ['housekeeping.manage', 'housekeeping', 'Complete cleaning tasks and pass room inspections'],
  ['external.manage', 'external', 'Coordinate suppliers and external provider requests'],
  ['reports.view', 'reports', 'View authorized operational reports and CSV exports'],
  ['admin.all', 'admin', 'Full system administration and audit log review']
];

export const ROLE_PERM_MAP = {
  patient: ['patients.read_own'],
  admin: PERMISSIONS.map((p) => p[0]),
  doctor: ['patients.read_all', 'clinical.read', 'clinical.write', 'appointments.manage', 'admissions.manage', 'lab.process', 'radiology.process', 'reports.view'],
  nurse: ['patients.read_all', 'clinical.read', 'nursing.write', 'admissions.manage'],
  receptionist: ['patients.read_all', 'patients.write', 'appointments.manage', 'admissions.manage', 'finance.manage'],
  case_manager: ['patients.read_all', 'admissions.manage', 'insurance.manage', 'external.manage', 'reports.view'],
  lab_staff: ['patients.read_all', 'lab.process', 'radiology.process'],
  radiologist: ['patients.read_all', 'radiology.process', 'reports.view'],
  pharmacist: ['patients.read_all', 'pharmacy.dispense', 'finance.manage'],
  accountant: ['patients.read_all', 'finance.manage', 'insurance.manage', 'reports.view'],
  hr: ['hr.manage', 'payroll.manage', 'reports.view'],
  publisher: ['publisher.create'],
  approver: ['approver.review', 'reports.view'],
  housekeeping: ['housekeeping.manage'],
  housekeeping_supervisor: ['housekeeping.manage', 'admissions.manage'],
  bloodbank_staff: ['patients.read_all', 'bloodbank.manage', 'reports.view'],
  external_coordinator: ['external.manage', 'bloodbank.manage'],
  candidate: []
};

export const DEMO_USERS = [
  { code: 'PAT-1001', email: 'patient@demo.com', pass: 'Patient@123', name: 'Sarah Jenkins', phone: '+1-555-0101', role: 'patient', dept: null },
  { code: 'ADM-0001', email: 'admin@demo.com', pass: 'Admin@123', name: 'Dr. Arthur Vance', phone: '+1-555-0100', role: 'admin', dept: 'Administration' },
  { code: 'DOC-2001', email: 'doctor@demo.com', pass: 'Doctor@123', name: 'Dr. Elena Rostova', phone: '+1-555-0102', role: 'doctor', dept: 'Cardiology' },
  { code: 'NUR-3001', email: 'nurse@demo.com', pass: 'Nurse@123', name: 'Clara Bennett', phone: '+1-555-0103', role: 'nurse', dept: 'Nursing' },
  { code: 'REC-4001', email: 'reception@demo.com', pass: 'Reception@123', name: 'Marcus Reed', phone: '+1-555-0104', role: 'receptionist', dept: 'Administration' },
  { code: 'CAS-5001', email: 'case@demo.com', pass: 'Case@123', name: 'Nadia Patel', phone: '+1-555-0105', role: 'case_manager', dept: 'Administration' },
  { code: 'LAB-6001', email: 'lab@demo.com', pass: 'Lab@123', name: 'David Kim', phone: '+1-555-0106', role: 'lab_staff', dept: 'Laboratory' },
  { code: 'PHM-7001', email: 'pharmacy@demo.com', pass: 'Pharmacy@123', name: 'Priya Nair', phone: '+1-555-0107', role: 'pharmacist', dept: 'Pharmacy' },
  { code: 'RAD-1601', email: 'radiology@demo.com', pass: 'Radiology@123', name: 'Dr. Nina Volkov', phone: '+1-555-0115', role: 'radiologist', dept: 'Radiology' },
  { code: 'ACC-8001', email: 'accounts@demo.com', pass: 'Accounts@123', name: 'Victor Alvarez', phone: '+1-555-0108', role: 'accountant', dept: 'Finance' },
  { code: 'HR-9001', email: 'hr@demo.com', pass: 'Hr@123', name: 'Hannah Brooks', phone: '+1-555-0109', role: 'hr', dept: 'Human Resources' },
  { code: 'PUB-1101', email: 'publisher@demo.com', pass: 'Publish@123', name: 'Liam OConnor', phone: '+1-555-0110', role: 'publisher', dept: 'Administration' },
  { code: 'APP-1201', email: 'approver@demo.com', pass: 'Approve@123', name: 'Evelyn Shaw', phone: '+1-555-0111', role: 'approver', dept: 'Administration' },
  { code: 'HSK-1301', email: 'housekeeping@demo.com', pass: 'House@123', name: 'Carlos Mendez', phone: '+1-555-0112', role: 'housekeeping', dept: 'Housekeeping' },
  { code: 'BLD-1701', email: 'bloodbank@demo.com', pass: 'Bloodbank@123', name: 'Samuel Boateng', phone: '+1-555-0116', role: 'bloodbank_staff', dept: 'Blood Bank' },
  { code: 'EXT-1401', email: 'external@demo.com', pass: 'External@123', name: 'Grace Liu', phone: '+1-555-0113', role: 'external_coordinator', dept: 'Administration' },
  { code: 'CAN-1501', email: 'candidate@demo.com', pass: 'Candidate@123', name: 'Jordan Blake', phone: '+1-555-0114', role: 'candidate', dept: null }
];

/**
 * Seeds ONLY non-personal hospital reference configuration:
 * roles, permissions, branches, departments, specialties, facility wards/beds,
 * diagnostic & pharmacy reference catalogs, blood groups, and system settings.
 * Creates ZERO users, ZERO patients, ZERO doctors, ZERO appointments.
 */
export function seedReferenceData(db) {
  const runRef = db.transaction(() => {
    for (const [code, name, description, isStaff] of ROLES) {
      db.run('INSERT OR IGNORE INTO roles (code, name, description, is_staff) VALUES (?, ?, ?, ?)', [code, name, description, isStaff]);
    }
    for (const [code, mod, desc] of PERMISSIONS) {
      db.run('INSERT OR IGNORE INTO permissions (code, module, description) VALUES (?, ?, ?)', [code, mod, desc]);
    }
    const roleMap = Object.fromEntries(db.all('SELECT id, code FROM roles').map((r) => [r.code, r.id]));
    const permMap = Object.fromEntries(db.all('SELECT id, code FROM permissions').map((p) => [p.code, p.id]));
    for (const [roleCode, perms] of Object.entries(ROLE_PERM_MAP)) {
      for (const pCode of perms) {
        if (roleMap[roleCode] && permMap[pCode]) {
          db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleMap[roleCode], permMap[pCode]]);
        }
      }
    }

    const branches = [
      ['MAIN', 'MediCore Central Hospital', '450 Medical Center Blvd, Metro City', '+1-555-8000', 'central@medicore-hms.org'],
      ['NORTH', 'MediCore North Clinic', '128 Northgate Ave, Metro City', '+1-555-8100', 'north@medicore-hms.org'],
      ['SOUTH', 'MediCore South Specialty Wing', '890 Harborview Rd, Metro City', '+1-555-8200', 'south@medicore-hms.org']
    ];
    for (const b of branches) {
      db.run('INSERT OR IGNORE INTO branches (code, name, address, phone, email) VALUES (?, ?, ?, ?, ?)', b);
    }
    const mainBranch = db.get('SELECT id FROM branches WHERE code = ?', ['MAIN']);

    for (const [code, name, cat] of MASTER_DEPARTMENTS) {
      db.run('INSERT OR IGNORE INTO departments (code, name, branch_id, category) VALUES (?, ?, ?, ?)', [code, name, mainBranch.id, cat]);
    }
    const deptMap = Object.fromEntries(db.all('SELECT id, name FROM departments').map((d) => [d.name, d.id]));

    const renames = [
      ['Cardiology', 'Cardiologist'],
      ['Internal Medicine', 'General Physician'],
      ['Neurology', 'Neurologist'],
      ['Orthopedic Surgery', 'Orthopedic Doctor'],
      ['Pediatrics', 'Pediatrician'],
      ['Dermatology', 'Dermatologist']
    ];
    for (const [oldName, newName] of renames) {
      const oldRow = db.get('SELECT id FROM specialties WHERE name = ?', [oldName]);
      const newRow = db.get('SELECT id FROM specialties WHERE name = ?', [newName]);
      if (oldRow && !newRow) {
        db.run('UPDATE specialties SET name = ? WHERE id = ?', [newName, oldRow.id]);
      }
    }

    for (const [sName, dName, desc] of MASTER_SPECIALTIES) {
      db.run(
        'INSERT OR IGNORE INTO specialties (name, department_id, description) VALUES (?, ?, ?)',
        [sName, deptMap[dName] || deptMap['General Medicine'], desc]
      );
    }

    // Structural facility wards / rooms / beds (all Available)
    const wardCnt = db.get('SELECT COUNT(*) as cnt FROM wards')?.cnt || 0;
    if (wardCnt === 0) {
      const wards = [
        [mainBranch.id, deptMap['Cardiology'], 'Cardiac Care Ward A', 'ICU', '3rd Floor'],
        [mainBranch.id, deptMap['General Medicine'], 'General Medical Ward B', 'General', '2nd Floor'],
        [mainBranch.id, deptMap['General Surgery'] || deptMap['Orthopedics'], 'Surgical Recovery Ward C', 'Private', '4th Floor']
      ];
      for (const w of wards) {
        db.run('INSERT INTO wards (branch_id, department_id, name, ward_type, floor) VALUES (?, ?, ?, ?, ?)', w);
      }
      const wardRows = db.all('SELECT id FROM wards ORDER BY id ASC');
      for (const w of wardRows) {
        for (let r = 1; r <= 3; r++) {
          const rNum = `${w.id}0${r}`;
          db.run('INSERT OR IGNORE INTO rooms (ward_id, room_number, room_type, daily_rate) VALUES (?, ?, ?, ?)', [w.id, rNum, w.id === 1 ? 'ICU' : 'Standard', w.id === 1 ? 350 : 180]);
          const room = db.get('SELECT id FROM rooms WHERE ward_id = ? AND room_number = ?', [w.id, rNum]);
          for (let b = 1; b <= 2; b++) {
            db.run('INSERT OR IGNORE INTO beds (room_id, bed_code, status) VALUES (?, ?, ?)', [room.id, `B-${rNum}-${b}`, 'Available']);
          }
        }
      }
    }

    // Reference blood groups, lab test catalog & medicine categories
    for (const bg of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
      db.run('INSERT OR IGNORE INTO blood_groups (group_name) VALUES (?)', [bg]);
    }
    for (const c of ['Cardiovascular', 'Antibiotics', 'Analgesics', 'Painkillers', 'Emergency', 'Endocrine']) {
      db.run('INSERT OR IGNORE INTO medicine_categories (name) VALUES (?)', [c]);
    }
    for (const c of ['Hematology', 'Biochemistry', 'Cardiac Markers']) {
      db.run('INSERT OR IGNORE INTO lab_categories (name) VALUES (?)', [c]);
    }
    const lCat = Object.fromEntries(db.all('SELECT id, name FROM lab_categories').map((r) => [r.name, r.id]));
    const labTests = [
      ['CBC', 'Complete Blood Count (CBC)', 'Hematology', 35, '10^9/L', '4.5 - 11.0', 'Comprehensive blood cell panel'],
      ['LIPID', 'Lipid Profile', 'Biochemistry', 55, 'mg/dL', '< 200', 'Total cholesterol, HDL, LDL, triglycerides'],
      ['HBA1C', 'HbA1c Glycated Hemoglobin', 'Biochemistry', 45, '%', '4.0 - 5.6', '3-month average glucose marker'],
      ['TROP', 'Troponin-I High Sensitivity', 'Cardiac Markers', 75, 'ng/L', '< 14', 'Cardiac muscle injury biomarker']
    ];
    for (const [code, name, cat, price, unit, ref, desc] of labTests) {
      db.run(
        'INSERT OR IGNORE INTO lab_tests (code, name, category_id, price, unit, reference_range, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [code, name, lCat[cat], price, unit, ref, desc]
      );
    }

    const settings = [
      ['hospital_name', 'MediCore HMS', 'Primary hospital name displayed in portal and receipts'],
      ['emergency_hotline', '+1-555-911-CARE', 'Direct emergency triage desk phone number'],
      ['tax_rate_percent', '5', 'Default invoice tax percentage'],
      ['allow_patient_refills', 'true', 'Allow patients to request prescription refills online']
    ];
    for (const [k, v, d] of settings) {
      db.run('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)', [k, v, d]);
    }
  });

  runRef();
}

/**
 * Bootstraps initial Administrator ONLY when ADMIN_EMAIL + ADMIN_PASSWORD env vars are provided
 * and no administrator exists yet.
 */
export function bootstrapAdminFromEnv(db) {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const fullName = (process.env.ADMIN_NAME || 'Hospital Administrator').trim();
  if (!email || !password) return null;

  const existingAdmin = db.get(
    `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' LIMIT 1`
  );
  if (existingAdmin) return null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL environment variable is not a valid email address.');
  }
  if (password.length < 8 || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD environment variable must be at least 8 characters and include a number.');
  }

  const adminRole = db.get("SELECT id FROM roles WHERE code = 'admin'");
  const mainBranch = db.get("SELECT id FROM branches WHERE code = 'MAIN'") || db.get('SELECT id FROM branches ORDER BY id LIMIT 1');
  const admDept = db.get("SELECT id FROM departments WHERE name = 'Administration'") || db.get('SELECT id FROM departments ORDER BY id LIMIT 1');

  const hash = bcrypt.hashSync(password, 10);
  const code = `ADM-${String(Date.now()).slice(-4)}${crypto.randomInt(10, 99)}`;

  const createdId = db.transaction(() => {
    const uInfo = db.run(
      `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, 1, 'Active')`,
      [code, email, hash, fullName, adminRole.id, mainBranch?.id || null, admDept?.id || null]
    );
    db.run(
      `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, employment_status, base_salary)
       VALUES (?, ?, ?, ?, 'ADMINISTRATOR', date('now'), 'Active', 0)`,
      [uInfo.lastInsertRowid, `EMP-${code}`, admDept?.id || null, mainBranch?.id || null]
    );
    db.run(
      `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
       VALUES (?, 'admin', 'system.admin_bootstrapped', 'user', ?, ?)`,
      [uInfo.lastInsertRowid, uInfo.lastInsertRowid, JSON.stringify({ email, via: 'env' })]
    );
    return uInfo.lastInsertRowid;
  })();

  return { id: createdId, email, user_code: code };
}

/**
 * Seeds fake demo accounts, doctors, patients, and clinical/operational transactions.
 * Strictly blocked in production (`NODE_ENV=production`) and NEVER called automatically on boot.
 */
export function seedDemoData(db) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed data is blocked in production (NODE_ENV=production).');
  }

  seedReferenceData(db);

  const existing = db.get('SELECT COUNT(*) as cnt FROM users WHERE lower(email) = ?', ['admin@demo.com']);
  if (existing && existing.cnt > 0) {
    syncMasterSeedData(db, ROLES, PERMISSIONS, ROLE_PERM_MAP, DEMO_USERS);
    seedClinicalDepartmentDoctors(db);
    return;
  }

  const runDemo = db.transaction(() => {
    const roleMap = Object.fromEntries(db.all('SELECT id, code FROM roles').map((r) => [r.code, r.id]));
    const mainBranch = db.get('SELECT id FROM branches WHERE code = ?', ['MAIN']);
    const deptMap = Object.fromEntries(db.all('SELECT id, name FROM departments').map((d) => [d.name, d.id]));

    for (const u of DEMO_USERS) {
      const hash = bcrypt.hashSync(u.pass, 10);
      db.run(
        `INSERT OR IGNORE INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.code, u.email, hash, u.name, u.phone, roleMap[u.role], mainBranch.id, u.dept ? deptMap[u.dept] : null]
      );
      const userRow = db.get('SELECT id FROM users WHERE email = ?', [u.email]);
      if (userRow && u.role !== 'patient' && u.role !== 'candidate') {
        db.run(
          `INSERT OR IGNORE INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, base_salary)
           VALUES (?, ?, ?, ?, ?, '2024-01-15', ?)`,
          [userRow.id, `EMP-${u.code}`, u.dept ? deptMap[u.dept] : deptMap['Administration'], mainBranch.id, u.role.replace('_', ' ').toUpperCase(), u.role === 'doctor' ? 14500 : 5200]
        );
      }
    }

    seedClinicalData(db, roleMap, deptMap);
    seedOperationsData(db, deptMap, mainBranch.id);
  });

  runDemo();
  syncMasterSeedData(db, ROLES, PERMISSIONS, ROLE_PERM_MAP, DEMO_USERS);
  seedClinicalDepartmentDoctors(db);
}

export function seedDatabase(db) {
  return seedReferenceData(db);
}
