import bcrypt from 'bcryptjs';

export const MASTER_DEPARTMENTS = [
  ['GM', 'General Medicine', 'clinical'],
  ['CARD', 'Cardiology', 'clinical'],
  ['NEUR', 'Neurology', 'clinical'],
  ['NSUR', 'Neurosurgery', 'clinical'],
  ['ORTH', 'Orthopedics', 'clinical'],
  ['DERM', 'Dermatology', 'clinical'],
  ['PED', 'Pediatrics', 'clinical'],
  ['GYN', 'Gynecology', 'clinical'],
  ['OBS', 'Obstetrics & Gynecology', 'clinical'],
  ['ENT', 'ENT', 'clinical'],
  ['OPHT', 'Ophthalmology', 'clinical'],
  ['PSY', 'Psychiatry & Behavioral Health', 'clinical'],
  ['ONC', 'Oncology', 'clinical'],
  ['URO', 'Urology', 'clinical'],
  ['NEPH', 'Nephrology', 'clinical'],
  ['GAST', 'Gastroenterology', 'clinical'],
  ['PULM', 'Pulmonology', 'clinical'],
  ['ENDO', 'Endocrinology', 'clinical'],
  ['ANES', 'Anesthesiology', 'clinical'],
  ['DENT', 'Dental Care', 'clinical'],
  ['PHYS', 'Physiotherapy & Rehabilitation', 'clinical'],
  ['EM', 'Emergency Medicine', 'clinical'],
  ['RAD', 'Radiology', 'diagnostic'],
  ['LAB', 'Laboratory', 'diagnostic'],
  ['PHM', 'Pharmacy', 'support'],
  ['BB', 'Blood Bank', 'support'],
  ['ADM', 'Administration', 'admin'],
  ['ADMS', 'Admissions', 'support'],
  ['OPS', 'Operations', 'support'],
  ['HR', 'Human Resources', 'admin'],
  ['FIN', 'Finance', 'admin'],
  ['NUR', 'Nursing', 'clinical'],
  ['HSK', 'Housekeeping', 'support']
];

export const MASTER_SPECIALTIES = [
  ['General Physician', 'General Medicine', 'Primary care, general illness, and preventive medicine'],
  ['Cardiologist', 'Cardiology', 'Heart and cardiovascular specialist care'],
  ['Neurologist', 'Neurology', 'Brain and nervous system specialist care'],
  ['Neurosurgeon', 'Neurosurgery', 'Brain and spine surgery specialist'],
  ['Orthopedic Doctor', 'Orthopedics', 'Bones, joints, fractures, and sports injury specialist'],
  ['Dermatologist', 'Dermatology', 'Skin, hair, and nail specialist care'],
  ['Pediatrician', 'Pediatrics', 'Children and adolescent medical specialist'],
  ['Gynecologist', 'Gynecology', 'Women’s reproductive health specialist'],
  ['Obstetrician', 'Obstetrics & Gynecology', 'Pregnancy, prenatal care, and childbirth specialist'],
  ['ENT Specialist', 'ENT', 'Ear, nose, and throat specialist'],
  ['Ophthalmologist', 'Ophthalmology', 'Eye care and vision specialist'],
  ['Psychiatrist', 'Psychiatry & Behavioral Health', 'Mental health diagnosis and medical therapy'],
  ['Psychologist', 'Psychiatry & Behavioral Health', 'Psychological therapy and behavioral care'],
  ['Oncologist', 'Oncology', 'Cancer diagnosis and oncology care specialist'],
  ['Urologist', 'Urology', 'Urinary tract and urological specialist'],
  ['Nephrologist', 'Nephrology', 'Kidney disease and renal care specialist'],
  ['Gastroenterologist', 'Gastroenterology', 'Digestive system and liver specialist'],
  ['Pulmonologist', 'Pulmonology', 'Lung and respiratory system specialist'],
  ['Endocrinologist', 'Endocrinology', 'Hormone, thyroid, and diabetes specialist'],
  ['Radiologist', 'Radiology', 'Medical imaging and diagnostic scan specialist'],
  ['Anesthesiologist', 'Anesthesiology', 'Perioperative anesthesia and pain specialist'],
  ['Dentist', 'Dental Care', 'Oral and dental surgery specialist'],
  ['Physiotherapist', 'Physiotherapy & Rehabilitation', 'Physical therapy and mobility rehabilitation specialist'],
  ['Emergency Medicine Doctor', 'Emergency Medicine', 'Acute trauma and emergency triage specialist']
];

const EXTRA_SPECIALIST_DOCTORS = [
  ['DR-2006', 'dr.neurosurg@demo.com', 'Dr. Marcus Thorne', 'Neurosurgeon', 'Neurosurgery', 'MAIN', 'MD, MCh Neurosurgery', 15, 190],
  ['DR-2007', 'dr.derm@demo.com', 'Dr. Priya Sharma', 'Dermatologist', 'Dermatology', 'NORTH', 'MD Dermatology', 8, 95],
  ['DR-2008', 'dr.gyn@demo.com', 'Dr. Sophia Morales', 'Gynecologist', 'Gynecology', 'MAIN', 'MD, FACOG', 13, 115],
  ['DR-2009', 'dr.obs@demo.com', 'Dr. Claire Beaumont', 'Obstetrician', 'Obstetrics & Gynecology', 'SOUTH', 'MD Obstetrics & Maternal Care', 12, 125],
  ['DR-2010', 'dr.ent@demo.com', 'Dr. Tariq Al-Mansoor', 'ENT Specialist', 'ENT', 'MAIN', 'MS ENT, Head & Neck', 10, 100],
  ['DR-2011', 'dr.ophth@demo.com', 'Dr. Hannah Cho', 'Ophthalmologist', 'Ophthalmology', 'NORTH', 'MD Ophthalmology', 11, 105],
  ['DR-2012', 'dr.psych@demo.com', 'Dr. Julian Reid', 'Psychiatrist', 'Psychiatry & Behavioral Health', 'MAIN', 'MD Psychiatry', 14, 130],
  ['DR-2013', 'dr.psycol@demo.com', 'Dr. Maya Lin', 'Psychologist', 'Psychiatry & Behavioral Health', 'NORTH', 'PsyD Clinical Psychology', 9, 90],
  ['DR-2014', 'dr.onc@demo.com', 'Dr. Arjun Kulkarni', 'Oncologist', 'Oncology', 'MAIN', 'MD, DM Medical Oncology', 17, 180],
  ['DR-2015', 'dr.uro@demo.com', 'Dr. Henrik Lindqvist', 'Urologist', 'Urology', 'SOUTH', 'MCh Urology', 12, 125],
  ['DR-2016', 'dr.neph@demo.com', 'Dr. Amara Okafor', 'Nephrologist', 'Nephrology', 'MAIN', 'MD, DM Nephrology', 11, 130],
  ['DR-2017', 'dr.gast@demo.com', 'Dr. Daniel Novak', 'Gastroenterologist', 'Gastroenterology', 'MAIN', 'MD Gastroenterology', 13, 135],
  ['DR-2018', 'dr.pulm@demo.com', 'Dr. Farah Haddad', 'Pulmonologist', 'Pulmonology', 'NORTH', 'MD Pulmonology & Critical Care', 10, 120],
  ['DR-2019', 'dr.endo@demo.com', 'Dr. Samuel Kim', 'Endocrinologist', 'Endocrinology', 'MAIN', 'MD Endocrinology & Metabolism', 12, 115],
  ['DR-2020', 'dr.rad@demo.com', 'Dr. Olivia Grant', 'Radiologist', 'Radiology', 'MAIN', 'MD Diagnostic Radiology', 11, 110],
  ['DR-2021', 'dr.anes@demo.com', 'Dr. Mateo Silva', 'Anesthesiologist', 'Anesthesiology', 'MAIN', 'MD Anesthesiology', 14, 140],
  ['DR-2022', 'dr.dent@demo.com', 'Dr. Chloe Bennett', 'Dentist', 'Dental Care', 'SOUTH', 'DDS Dental Surgery', 8, 75],
  ['DR-2023', 'dr.phys@demo.com', 'Dr. Liam Walsh', 'Physiotherapist', 'Physiotherapy & Rehabilitation', 'NORTH', 'DPT Physical Rehabilitation', 7, 70],
  ['DR-2024', 'dr.emerg@demo.com', 'Dr. Rachel Sterling', 'Emergency Medicine Doctor', 'Emergency Medicine', 'MAIN', 'MD Emergency Medicine', 12, 110]
];

export function syncMasterSeedData(db, rolesList, permsList, rolePermMap, demoUsersList) {
  const syncTx = db.transaction(() => {
    for (const [code, name, description, isStaff] of rolesList) {
      db.run('INSERT OR IGNORE INTO roles (code, name, description, is_staff) VALUES (?, ?, ?, ?)', [code, name, description, isStaff]);
    }
    for (const [code, mod, desc] of permsList) {
      db.run('INSERT OR IGNORE INTO permissions (code, module, description) VALUES (?, ?, ?)', [code, mod, desc]);
    }

    const roleMap = Object.fromEntries(db.all('SELECT id, code FROM roles').map((r) => [r.code, r.id]));
    const permMap = Object.fromEntries(db.all('SELECT id, code FROM permissions').map((p) => [p.code, p.id]));
    for (const [roleCode, perms] of Object.entries(rolePermMap)) {
      for (const pCode of perms) {
        if (roleMap[roleCode] && permMap[pCode]) {
          db.run('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleMap[roleCode], permMap[pCode]]);
        }
      }
    }

    const mainBranch = db.get('SELECT id FROM branches WHERE code = ?', ['MAIN']);
    if (!mainBranch) return;
    const branchMap = Object.fromEntries(db.all('SELECT id, code FROM branches').map((b) => [b.code, b.id]));

    for (const [code, name, cat] of MASTER_DEPARTMENTS) {
      db.run('INSERT OR IGNORE INTO departments (code, name, branch_id, category) VALUES (?, ?, ?, ?)', [code, name, mainBranch.id, cat]);
    }
    const deptMap = Object.fromEntries(db.all('SELECT id, name FROM departments').map((d) => [d.name, d.id]));

    // Rename legacy 6 seed specialty labels into canonical requested names before adding missing ones
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
    const specMap = Object.fromEntries(db.all('SELECT id, name FROM specialties').map((s) => [s.name, s.id]));

    // Ensure all demo accounts exist with exact role_id and matching profile rows
    for (const u of demoUsersList) {
      let userRow = db.get('SELECT id, role_id, is_active, account_status FROM users WHERE lower(email) = lower(?)', [u.email]);
      const targetRoleId = roleMap[u.role];
      const targetDeptId = u.dept ? deptMap[u.dept] : null;
      if (!userRow) {
        const hash = bcrypt.hashSync(u.pass, 10);
        const info = db.run(
          `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
          [u.code, u.email, hash, u.name, u.phone, targetRoleId, mainBranch.id, targetDeptId]
        );
        userRow = { id: info.lastInsertRowid, role_id: targetRoleId };
      } else if (userRow.role_id !== targetRoleId || !userRow.is_active || userRow.account_status !== 'Active') {
        db.run(
          `UPDATE users SET role_id = ?, is_active = 1, account_status = 'Active', department_id = COALESCE(department_id, ?) WHERE id = ?`,
          [targetRoleId, targetDeptId, userRow.id]
        );
      }

      if (u.role === 'patient') {
        const pat = db.get('SELECT id FROM patient_profiles WHERE user_id = ?', [userRow.id]);
        if (!pat) {
          const mrn = u.code.startsWith('PAT-') ? u.code.replace('PAT-', 'MRN-') : `MRN-${userRow.id}`;
          db.run(
            `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, blood_group, address, emergency_contact_name, emergency_contact_phone, otp_verified, profile_completion)
             VALUES (?, ?, '1991-05-14', 'Female', 'O+', '742 Evergreen Terrace, Metro City', 'Emergency Desk', '+1-555-0911', 1, 90)`,
            [userRow.id, mrn]
          );
        }
      } else if (u.role !== 'candidate') {
        const emp = db.get('SELECT id FROM employee_profiles WHERE user_id = ?', [userRow.id]);
        if (!emp) {
          db.run(
            `INSERT OR IGNORE INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, base_salary)
             VALUES (?, ?, ?, ?, ?, '2024-01-15', ?)`,
            [userRow.id, `EMP-${u.code}`, targetDeptId || deptMap['Administration'], mainBranch.id, u.role.replace(/_/g, ' ').toUpperCase(), u.role === 'doctor' ? 14500 : 5800]
          );
        }
        if (u.role === 'doctor') {
          const doc = db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [userRow.id]);
          if (!doc) {
            const cardSpecId = specMap['Cardiologist'] || Object.values(specMap)[0];
            db.run(
              `INSERT OR IGNORE INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, availability_status, schedule_configured)
               VALUES (?, ?, ?, ?, ?, 'MD, FACC', 12, 120, 'Senior Consultant Physician.', 4.9, 'Available', 1)`,
              [userRow.id, u.code.replace('DOC-', 'DR-'), cardSpecId, targetDeptId || deptMap['Cardiology'], mainBranch.id]
            );
          } else {
            db.run('UPDATE doctor_profiles SET schedule_configured = 1 WHERE id = ?', [doc.id]);
          }
        }
      }
    }

    // Ensure every one of the 24 specializations has at least one active doctor + schedules + slots
    const docPass = bcrypt.hashSync('Doctor@123', 10);
    const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00'];
    const today = new Date();
    for (const [dCode, email, name, spec, dept, br, qual, exp, fee] of EXTRA_SPECIALIST_DOCTORS) {
      let userRow = db.get('SELECT id FROM users WHERE email = ?', [email]);
      if (!userRow) {
        const uInfo = db.run(
          `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id)
           VALUES (?, ?, ?, ?, '+1-555-0250', ?, ?, ?)`,
          [dCode, email, docPass, name, roleMap['doctor'], branchMap[br] || mainBranch.id, deptMap[dept] || deptMap['General Medicine']]
        );
        userRow = { id: uInfo.lastInsertRowid };
        db.run(
          `INSERT OR IGNORE INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, base_salary)
           VALUES (?, ?, ?, ?, 'CONSULTANT DOCTOR', '2024-02-01', 14000)`,
          [userRow.id, `EMP-${dCode}`, deptMap[dept] || deptMap['General Medicine'], branchMap[br] || mainBranch.id]
        );
      }
      let docProf = db.get('SELECT id, branch_id FROM doctor_profiles WHERE user_id = ?', [userRow.id]);
      if (!docProf) {
        const dpInfo = db.run(
          `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, availability_status, schedule_configured)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 4.8, 'Available', 1)`,
          [userRow.id, dCode, specMap[spec], deptMap[dept] || deptMap['General Medicine'], branchMap[br] || mainBranch.id, qual, exp, fee, `Board-certified ${spec} at MediCore HMS.`]
        );
        docProf = { id: dpInfo.lastInsertRowid, branch_id: branchMap[br] || mainBranch.id };
        for (let dow = 1; dow <= 6; dow++) {
          db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, 30)', [docProf.id, dow, '09:00', '17:00']);
        }
        for (let offset = 0; offset < 7; offset++) {
          const dt = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
          for (const t of times) {
            db.run('INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)', [docProf.id, docProf.branch_id, dt, t, 'Available']);
          }
        }
      }
    }
  });

  syncTx();
}
