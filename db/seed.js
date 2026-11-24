import bcrypt from 'bcryptjs';
import { seedClinicalData } from './seed_clinical.js';
import { CLINICAL_DEPARTMENT_DOCTORS, seedClinicalDepartmentDoctors } from './seed_doctors.js';
import { seedOperationsData } from './seed_ops.js';
import { syncMasterSeedData } from './sync_master.js';

const ROLES = [
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
  ['bloodbank_staff', 'Blood Bank Staff', 'Blood inventory, donors, and issue control', 1],
  ['external_coordinator', 'External Coordinator', 'Suppliers and external requests', 1],
  ['candidate', 'Candidate', 'Careers and job applications', 0],
  ['pending_staff', 'Pending Staff', 'Awaiting administrative verification and role assignment', 0]
];

const PERMISSIONS = [
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

const ROLE_PERM_MAP = {
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

export function seedDatabase(db) {
  const existing = db.get('SELECT COUNT(*) as cnt FROM users');
  if (existing && existing.cnt > 0) {
    syncMasterSeedData(db, ROLES, PERMISSIONS, ROLE_PERM_MAP, DEMO_USERS);
    seedClinicalDepartmentDoctors(db);
    return;
  }

  const runSeed = db.transaction(() => {
    for (const [code, name, description, isStaff] of ROLES) {
      db.run('INSERT OR IGNORE INTO roles (code, name, description, is_staff) VALUES (?, ?, ?, ?)', [code, name, description, isStaff]);
    }
    for (const [code, mod, desc] of PERMISSIONS) {
      db.run('INSERT OR IGNORE INTO permissions (code, module, description) VALUES (?, ?, ?)', [code, mod, desc]);
    }
    const roleRows = db.all('SELECT id, code FROM roles');
    const permRows = db.all('SELECT id, code FROM permissions');
    const roleMap = Object.fromEntries(roleRows.map((r) => [r.code, r.id]));
    const permMap = Object.fromEntries(permRows.map((p) => [p.code, p.id]));

    for (const [roleCode, perms] of Object.entries(ROLE_PERM_MAP)) {
      for (const pCode of perms) {
        if (roleMap[roleCode] && permMap[pCode]) {
          db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleMap[roleCode], permMap[pCode]]);
        }
      }
    }

    const branches = [
      ['MAIN', 'MediCore Central Hospital', '450 Medical Center Blvd, Metro City', '+1-555-8000', 'central@medicore.demo'],
      ['NORTH', 'MediCore North Clinic', '128 Northgate Ave, Metro City', '+1-555-8100', 'north@medicore.demo'],
      ['SOUTH', 'MediCore South Specialty Wing', '890 Harborview Rd, Metro City', '+1-555-8200', 'south@medicore.demo']
    ];
    for (const b of branches) {
      db.run('INSERT OR IGNORE INTO branches (code, name, address, phone, email) VALUES (?, ?, ?, ?, ?)', b);
    }
    const mainBranch = db.get('SELECT id FROM branches WHERE code = ?', ['MAIN']);

    const departments = [
      ['GM', 'General Medicine', 'clinical'], ['CARD', 'Cardiology', 'clinical'],
      ['NEUR', 'Neurology', 'clinical'], ['ORTH', 'Orthopedics', 'clinical'],
      ['PED', 'Pediatrics', 'clinical'], ['GYN', 'Gynecology', 'clinical'],
      ['DERM', 'Dermatology', 'clinical'], ['ENT', 'ENT', 'clinical'],
      ['OPHT', 'Ophthalmology', 'clinical'], ['GSUR', 'General Surgery', 'clinical'],
      ['EM', 'Emergency Medicine', 'clinical'], ['RAD', 'Radiology', 'diagnostic'],
      ['LAB', 'Laboratory', 'diagnostic'], ['PHM', 'Pharmacy', 'support'],
      ['BB', 'Blood Bank', 'support'], ['ADM', 'Administration', 'admin'],
      ['HR', 'Human Resources', 'admin'], ['FIN', 'Finance', 'admin'],
      ['NUR', 'Nursing', 'clinical'], ['HSK', 'Housekeeping', 'support']
    ];
    for (const [code, name, cat] of departments) {
      db.run('INSERT OR IGNORE INTO departments (code, name, branch_id, category) VALUES (?, ?, ?, ?)', [code, name, mainBranch.id, cat]);
    }
    const deptRows = db.all('SELECT id, name FROM departments');
    const deptMap = Object.fromEntries(deptRows.map((d) => [d.name, d.id]));

    const specs = [
      ['Cardiology', 'Cardiology'], ['Internal Medicine', 'General Medicine'],
      ['Neurology', 'Neurology'], ['Orthopedic Surgery', 'Orthopedics'],
      ['Pediatrics', 'Pediatrics'], ['Dermatology', 'Dermatology']
    ];
    for (const [sName, dName] of specs) {
      db.run('INSERT OR IGNORE INTO specialties (name, department_id, description) VALUES (?, ?, ?)', [sName, deptMap[dName], `${sName} specialist care`]);
    }

    for (const u of DEMO_USERS) {
      const hash = bcrypt.hashSync(u.pass, 10);
      db.run(
        `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.code, u.email, hash, u.name, u.phone, roleMap[u.role], mainBranch.id, u.dept ? deptMap[u.dept] : null]
      );
      const userRow = db.get('SELECT id FROM users WHERE email = ?', [u.email]);
      if (u.role !== 'patient' && u.role !== 'candidate') {
        db.run(
          `INSERT INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, base_salary)
           VALUES (?, ?, ?, ?, ?, '2024-01-15', ?)`,
          [userRow.id, `EMP-${u.code}`, u.dept ? deptMap[u.dept] : deptMap['Administration'], mainBranch.id, u.role.replace('_', ' ').toUpperCase(), u.role === 'doctor' ? 14500 : 5200]
        );
      }
    }

    seedClinicalData(db, roleMap, deptMap);
    seedOperationsData(db, deptMap, mainBranch.id);
  });

  runSeed();
  syncMasterSeedData(db, ROLES, PERMISSIONS, ROLE_PERM_MAP, DEMO_USERS);
  seedClinicalDepartmentDoctors(db);
}
