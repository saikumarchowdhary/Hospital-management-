import bcrypt from 'bcryptjs';

export function seedClinicalData(db, roleMap, deptMap) {
  const branches = db.all('SELECT id, code FROM branches');
  const branchMap = Object.fromEntries(branches.map((b) => [b.code, b.id]));
  const specs = db.all('SELECT id, name FROM specialties');
  const specMap = Object.fromEntries(specs.map((s) => [s.name, s.id]));

  const docUser = db.get('SELECT id FROM users WHERE email = ?', ['doctor@demo.com']);
  const patUser = db.get('SELECT id FROM users WHERE email = ?', ['patient@demo.com']);
  const nurseUser = db.get('SELECT id FROM users WHERE email = ?', ['nurse@demo.com']);
  const labUser = db.get('SELECT id FROM users WHERE email = ?', ['lab@demo.com']);
  const adminUser = db.get('SELECT id FROM users WHERE email = ?', ['admin@demo.com']);

  // Additional doctors & patients so directory, charts and beds feel realistic
  const extraDocs = [
    { code: 'DOC-2002', email: 'dr.patel@demo.com', name: 'Dr. Vikram Patel', spec: 'General Physician', dept: 'General Medicine', branch: 'MAIN', qual: 'MD, FACP', exp: 14, fee: 95 },
    { code: 'DOC-2003', email: 'dr.chen@demo.com', name: 'Dr. Mei Chen', spec: 'Neurologist', dept: 'Neurology', branch: 'NORTH', qual: 'MD, PhD Neurology', exp: 11, fee: 140 },
    { code: 'DOC-2004', email: 'dr.miller@demo.com', name: 'Dr. Lucas Miller', spec: 'Orthopedic Doctor', dept: 'Orthopedics', branch: 'SOUTH', qual: 'MS Orthopedics', exp: 16, fee: 130 },
    { code: 'DOC-2005', email: 'dr.ahmed@demo.com', name: 'Dr. Layla Ahmed', spec: 'Pediatrician', dept: 'Pediatrics', branch: 'MAIN', qual: 'MD Pediatrics', exp: 9, fee: 85 }
  ];

  const defaultSpecId = Object.values(specMap)[0];
  const defaultDocPass = bcrypt.hashSync('Doctor@123', 10);
  db.run(
    `INSERT OR IGNORE INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, schedule_configured)
     VALUES (?, 'DR-2001', ?, ?, ?, 'MD, FACC Cardiology', 12, 120, 'Senior Interventional Cardiologist specializing in preventive heart care.', 4.9, 1)`,
    [docUser.id, specMap['Cardiologist'] || specMap['Cardiology'] || defaultSpecId, deptMap['Cardiology'], branchMap['MAIN']]
  );

  for (const d of extraDocs) {
    const docPhone = `+1-555-${d.code.replace('DOC-', '')}`;
    db.run(
      `INSERT OR IGNORE INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.code, d.email, defaultDocPass, d.name, docPhone, roleMap['doctor'], branchMap[d.branch], deptMap[d.dept]]
    );
    const u = db.get('SELECT id FROM users WHERE email = ?', [d.email]);
    db.run(
      `INSERT OR IGNORE INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, joining_date, base_salary)
       VALUES (?, ?, ?, ?, 'CONSULTANT DOCTOR', '2024-02-01', 14000)`,
      [u.id, `EMP-${d.code}`, deptMap[d.dept], branchMap[d.branch]]
    );
    db.run(
      `INSERT OR IGNORE INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, schedule_configured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 4.8, 1)`,
      [u.id, d.code, specMap[d.spec] || defaultSpecId, deptMap[d.dept], branchMap[d.branch], d.qual, d.exp, d.fee, `Board-certified specialist in ${d.spec}.`]
    );
  }

  // Generate doctor schedules & upcoming 7 days of slots
  const allDocs = db.all('SELECT id, branch_id FROM doctor_profiles');
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00'];
  const today = new Date();
  for (const doc of allDocs) {
    for (let dow = 1; dow <= 6; dow++) {
      db.run('INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, 30)', [doc.id, dow, '09:00', '17:00']);
    }
    for (let offset = 0; offset < 7; offset++) {
      const dt = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
      for (const t of times) {
        db.run('INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)', [doc.id, doc.branch_id, dt, t, 'Available']);
      }
    }
  }

  // Patients
  db.run(
    `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, blood_group, address, emergency_contact_name, emergency_contact_phone, profile_completion)
     VALUES (?, 'MRN-1001', '1991-05-14', 'Female', 'O+', '742 Evergreen Terrace, Metro City', 'Robert Jenkins', '+1-555-0911', 90)`,
    [patUser.id]
  );
  const pat1 = db.get('SELECT id FROM patient_profiles WHERE patient_code = ?', ['MRN-1001']);

  const extraPatPass = bcrypt.hashSync('Patient@123', 10);
  db.run(
    `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id)
     VALUES ('PAT-1002', 'robert.chen@demo.com', ?, 'Robert Chen', '+1-555-0188', ?, ?)`,
    [extraPatPass, roleMap['patient'], branchMap['MAIN']]
  );
  const patUser2 = db.get('SELECT id FROM users WHERE email = ?', ['robert.chen@demo.com']);
  db.run(
    `INSERT INTO patient_profiles (user_id, patient_code, dob, gender, blood_group, address, emergency_contact_name, emergency_contact_phone, profile_completion)
     VALUES (?, 'MRN-1002', '1980-11-22', 'Male', 'A+', '215 Oakridge Ln, Metro City', 'Linda Chen', '+1-555-0189', 85)`,
    [patUser2.id]
  );
  const pat2 = db.get('SELECT id FROM patient_profiles WHERE patient_code = ?', ['MRN-1002']);

  db.run('INSERT INTO patient_consents (patient_id, consent_type, accepted) VALUES (?, ?, 1)', [pat1.id, 'General Care & Portal Terms']);
  db.run('INSERT INTO allergies (patient_id, allergen, reaction, severity, recorded_by) VALUES (?, ?, ?, ?, ?)', [pat1.id, 'Penicillin', 'Mild skin rash', 'Moderate', docUser.id]);
  db.run('INSERT INTO medical_history (patient_id, condition_name, diagnosed_year, status, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', [pat1.id, 'Mild Hypertension', '2023', 'Managed', 'Controlled with lifestyle and low-dose therapy (Sample Demo Record)', docUser.id]);
  const pat1VitalsSeries = [
    [-28, '138/88', 86, 37.3, 19, 96, 65.2],
    [-24, '135/86', 84, 37.1, 18, 97, 64.9],
    [-20, '132/84', 81, 37.0, 18, 97, 64.5],
    [-16, '129/82', 79, 36.9, 17, 98, 64.1],
    [-12, '126/80', 77, 36.8, 17, 98, 63.8],
    [-8,  '124/79', 76, 36.8, 16, 98, 63.4],
    [-4,  '123/78', 75, 36.7, 16, 99, 63.1],
    [0,   '122/78', 74, 36.7, 16, 99, 63.0]
  ];
  for (const [offsetDays, bp, pulse, temp, rr, spo2, weight] of pat1VitalsSeries) {
    db.run(
      `INSERT INTO patient_vitals (patient_id, encounter_type, blood_pressure, pulse, temperature, respiratory_rate, oxygen_saturation, height_cm, weight_kg, recorded_by, created_at)
       VALUES (?, 'OPD', ?, ?, ?, ?, ?, 166, ?, ?, datetime('now', ?))`,
      [pat1.id, bp, pulse, temp, rr, spo2, weight, nurseUser.id, `${offsetDays} days`]
    );
  }

  const pat2VitalsSeries = [
    [-14, '146/92', 94, 37.6, 21, 94, 78.5],
    [-10, '140/88', 89, 37.3, 20, 95, 78.2],
    [-7,  '134/84', 84, 37.1, 18, 96, 77.9],
    [-4,  '128/82', 80, 36.9, 17, 97, 77.6],
    [-2,  '126/80', 77, 36.8, 17, 98, 77.4],
    [-1,  '124/78', 75, 36.8, 16, 98, 77.2]
  ];
  for (const [offsetDays, bp, pulse, temp, rr, spo2, weight] of pat2VitalsSeries) {
    db.run(
      `INSERT INTO patient_vitals (patient_id, encounter_type, blood_pressure, pulse, temperature, respiratory_rate, oxygen_saturation, height_cm, weight_kg, recorded_by, created_at)
       VALUES (?, 'IPD', ?, ?, ?, ?, ?, 176, ?, ?, datetime('now', ?))`,
      [pat2.id, bp, pulse, temp, rr, spo2, weight, nurseUser.id, `${offsetDays} days`]
    );
  }

  // Sample appointment, consultation, diagnosis, prescription, lab order
  const firstDoc = db.get('SELECT id, branch_id, department_id, consultation_fee FROM doctor_profiles WHERE doctor_code = ?', ['DR-2001']);
  const todayStr = today.toISOString().slice(0, 10);
  const slot1 = db.get('SELECT id FROM appointment_slots WHERE doctor_id = ? AND slot_date = ? AND slot_time = ?', [firstDoc.id, todayStr, '09:00']);
  db.run('UPDATE appointment_slots SET status = ? WHERE id = ?', ['Booked', slot1.id]);

  db.run(
    `INSERT INTO appointments (appointment_ref, patient_id, doctor_id, branch_id, department_id, slot_id, appointment_date, appointment_time, visit_type, reason, fee, status, created_by)
     VALUES ('APT-2026-1001', ?, ?, ?, ?, ?, ?, '09:00', 'Follow-Up', 'Routine cardiac checkup (Sample)', ?, 'Confirmed', ?)`,
    [pat1.id, firstDoc.id, firstDoc.branch_id, firstDoc.department_id, slot1.id, todayStr, firstDoc.consultation_fee, patUser.id]
  );

  // Past completed consultation for Sarah Jenkins
  const pastDate = new Date(today.getTime() - 5 * 86400000).toISOString().slice(0, 10);
  db.run(
    `INSERT INTO appointments (appointment_ref, patient_id, doctor_id, branch_id, department_id, appointment_date, appointment_time, visit_type, reason, fee, status, created_by)
     VALUES ('APT-2026-0990', ?, ?, ?, ?, ?, '10:00', 'In-Person', 'Initial blood pressure evaluation (Sample)', ?, 'Completed', ?)`,
    [pat1.id, firstDoc.id, firstDoc.branch_id, firstDoc.department_id, pastDate, firstDoc.consultation_fee, patUser.id]
  );
  const pastApt = db.get('SELECT id FROM appointments WHERE appointment_ref = ?', ['APT-2026-0990']);
  db.run(
    `INSERT INTO consultations (appointment_id, patient_id, doctor_id, chief_complaint, examination_notes, treatment_plan, created_by)
     VALUES (?, ?, ?, 'Occasional dizziness and elevated morning BP', 'Heart sounds normal S1/S2, no murmurs. Lungs clear.', 'Low sodium diet, daily BP log, follow-up in 2 weeks (Sample Demo).', ?)`,
    [pastApt.id, pat1.id, firstDoc.id, docUser.id]
  );
  const cons = db.get('SELECT id FROM consultations WHERE appointment_id = ?', [pastApt.id]);
  db.run('INSERT INTO diagnoses (consultation_id, patient_id, icd_code, diagnosis_text, severity, created_by) VALUES (?, ?, ?, ?, ?, ?)', [cons.id, pat1.id, 'I10', 'Essential (primary) hypertension - Sample', 'Mild', docUser.id]);

  // Wards, Rooms, Beds (reuse structural wards if already seeded by reference seed)
  const existingWardCount = db.get('SELECT COUNT(*) as cnt FROM wards')?.cnt || 0;
  if (existingWardCount === 0) {
    const wards = [
      [branchMap['MAIN'], deptMap['Cardiology'], 'Cardiac Care Ward A', 'ICU', '3rd Floor'],
      [branchMap['MAIN'], deptMap['General Medicine'], 'General Medical Ward B', 'General', '2nd Floor'],
      [branchMap['MAIN'], deptMap['General Surgery'], 'Surgical Recovery Ward C', 'Private', '4th Floor']
    ];
    for (const w of wards) {
      db.run('INSERT INTO wards (branch_id, department_id, name, ward_type, floor) VALUES (?, ?, ?, ?, ?)', w);
    }
  }
  const wardRows = db.all('SELECT id, name FROM wards');
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

  // Active admission for Robert Chen
  const bedOcc = db.get('SELECT id FROM beds WHERE bed_code = ?', ['B-101-1']);
  db.run('UPDATE beds SET status = ? WHERE id = ?', ['Occupied', bedOcc.id]);
  db.run(
    `INSERT INTO admissions (admission_ref, patient_id, department_id, doctor_id, bed_id, admission_type, reason, status, admitted_at, created_by)
     VALUES ('ADM-2026-001', ?, ?, ?, ?, 'Emergency', 'Cardiac observation & telemetry (Sample)', 'Active Care', datetime('now', '-1 day'), ?)`,
    [pat2.id, deptMap['Cardiology'], firstDoc.id, bedOcc.id, adminUser.id]
  );
  const adm1 = db.get('SELECT id FROM admissions WHERE admission_ref = ?', ['ADM-2026-001']);
  db.run('INSERT INTO bed_allocations (admission_id, bed_id, allocated_by) VALUES (?, ?, ?)', [adm1.id, bedOcc.id, adminUser.id]);
  db.run('INSERT INTO nursing_tasks (patient_id, admission_id, assigned_nurse_id, task_type, description, due_time) VALUES (?, ?, ?, ?, ?, ?)', [pat2.id, adm1.id, nurseUser.id, 'Vitals Check', 'Record 4-hourly cardiac vitals and SpO2', '14:00']);

  // Keep labUser referenced
  if (labUser) {
    db.run('INSERT INTO nursing_notes (patient_id, admission_id, nurse_id, observation) VALUES (?, ?, ?, ?)', [pat2.id, adm1.id, nurseUser.id, 'Patient comfortable, resting in bed B-101-1.']);
  }
}
