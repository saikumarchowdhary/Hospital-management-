import bcrypt from 'bcryptjs';

export const CLINICAL_DEPARTMENT_DOCTORS = [
  // Branch: MAIN (branch_id 1 - MediCore Central Hospital)
  {
    code: 'DOC-GM01',
    email: 'dr.general_medicine@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Robert Chen',
    phone: '+1-555-0201',
    dept: 'General Medicine',
    branch: 'MAIN',
    regNum: 'REG-MED-10101',
    degrees: 'MBBS, MD (Internal Medicine)',
    expertise: 'Preventive medicine, adult health, chronic illness management',
    experience: 14,
    fee: 80,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-CARD01',
    email: 'dr.cardiology@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Elena Rostova',
    phone: '+1-555-0202',
    dept: 'Cardiology',
    branch: 'MAIN',
    regNum: 'REG-MED-10201',
    degrees: 'MBBS, MD, DM (Cardiology), FACC',
    expertise: 'Interventional cardiology, hypertension, arrhythmia',
    experience: 16,
    fee: 140,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-PED01',
    email: 'dr.paediatrics@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Emily Watson',
    phone: '+1-555-0203',
    dept: 'Pediatrics',
    branch: 'MAIN',
    regNum: 'REG-MED-10301',
    degrees: 'MBBS, MD (Paediatrics), FAAP',
    expertise: 'Neonatology, child development, immunizations',
    experience: 11,
    fee: 90,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-ORTH01',
    email: 'dr.orthopaedics@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Michael Chang',
    phone: '+1-555-0204',
    dept: 'Orthopedics',
    branch: 'MAIN',
    regNum: 'REG-MED-10401',
    degrees: 'MBBS, MS (Orthopaedics), MCh',
    expertise: 'Joint replacement, sports medicine, trauma surgery',
    experience: 15,
    fee: 130,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-GYN01',
    email: 'dr.gynaecology@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Sophia Morales',
    phone: '+1-555-0205',
    dept: 'Gynecology',
    branch: 'MAIN',
    regNum: 'REG-MED-10501',
    degrees: 'MBBS, MD (OB/GYN), FACOG',
    expertise: 'Maternal-fetal medicine, high-risk pregnancy, laparoscopy',
    experience: 13,
    fee: 115,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-DERM01',
    email: 'dr.dermatology@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Priya Sharma',
    phone: '+1-555-0206',
    dept: 'Dermatology',
    branch: 'MAIN',
    regNum: 'REG-MED-10601',
    degrees: 'MBBS, MD (Dermatology, Venereology & Leprosy)',
    expertise: 'Clinical dermatology, pediatric skin care, laser therapy',
    experience: 9,
    fee: 95,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-RAD01',
    email: 'dr.radiology@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Nina Volkov',
    phone: '+1-555-0207',
    dept: 'Radiology',
    branch: 'MAIN',
    regNum: 'REG-MED-10701',
    degrees: 'MBBS, MD (Radiodiagnosis)',
    expertise: 'Cross-sectional imaging, MRI, CT neuroimaging, ultrasound',
    experience: 12,
    fee: 110,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-EM01',
    email: 'dr.emergency@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Rachel Sterling',
    phone: '+1-555-0208',
    dept: 'Emergency Medicine',
    branch: 'MAIN',
    regNum: 'REG-MED-10801',
    degrees: 'MBBS, MD (Emergency Medicine), FACEP',
    expertise: 'Acute trauma resuscitation, critical care triage',
    experience: 12,
    fee: 110,
    workingDays: 'Mon,Tue,Wed,Thu,Fri,Sat',
    slotMinutes: 30
  },

  // Branch: NORTH (branch_id 2 - MediCore North Clinic / City Branch)
  {
    code: 'DOC-GM02',
    email: 'dr.general_medicine.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Arthur Davis',
    phone: '+1-555-0211',
    dept: 'General Medicine',
    branch: 'NORTH',
    regNum: 'REG-MED-20102',
    degrees: 'MBBS, MD (Internal Medicine)',
    expertise: 'Outpatient primary care, geriatric medicine, wellness exams',
    experience: 10,
    fee: 75,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-CARD02',
    email: 'dr.cardiology.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Frank Mercer',
    phone: '+1-555-0212',
    dept: 'Cardiology',
    branch: 'NORTH',
    regNum: 'REG-MED-20202',
    degrees: 'MBBS, MD (Cardiology)',
    expertise: 'Clinical cardiology, echocardiography, preventive heart health',
    experience: 12,
    fee: 125,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-PED02',
    email: 'dr.paediatrics.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Lisa Ray',
    phone: '+1-555-0213',
    dept: 'Pediatrics',
    branch: 'NORTH',
    regNum: 'REG-MED-20302',
    degrees: 'MBBS, DCH, MD (Pediatrics)',
    expertise: 'Pediatric urgent care, allergy, asthma, developmental screening',
    experience: 8,
    fee: 85,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-ORTH02',
    email: 'dr.orthopaedics.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Kevin Patel',
    phone: '+1-555-0214',
    dept: 'Orthopedics',
    branch: 'NORTH',
    regNum: 'REG-MED-20402',
    degrees: 'MBBS, MS (Orthopedics)',
    expertise: 'Fracture management, spinal care, arthroscopy',
    experience: 11,
    fee: 120,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-GYN02',
    email: 'dr.gynaecology.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Claire Beaumont',
    phone: '+1-555-0215',
    dept: 'Gynecology',
    branch: 'NORTH',
    regNum: 'REG-MED-20502',
    degrees: 'MBBS, MS (OB/GYN)',
    expertise: 'Women reproductive health, adolescent gynecology, menopause care',
    experience: 12,
    fee: 110,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-DERM02',
    email: 'dr.dermatology.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Nina Gupta',
    phone: '+1-555-0216',
    dept: 'Dermatology',
    branch: 'NORTH',
    regNum: 'REG-MED-20602',
    degrees: 'MBBS, DVD, MD (Dermatology)',
    expertise: 'Acne, psoriasis, eczema, cosmetic dermatology',
    experience: 7,
    fee: 90,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-RAD02',
    email: 'dr.radiology.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. Olivia Grant',
    phone: '+1-555-0217',
    dept: 'Radiology',
    branch: 'NORTH',
    regNum: 'REG-MED-20702',
    degrees: 'MBBS, DMRD, DNB (Radiology)',
    expertise: 'Diagnostic ultrasound, digital X-ray, mammography reporting',
    experience: 10,
    fee: 100,
    workingDays: 'Mon,Tue,Wed,Thu,Fri',
    slotMinutes: 30
  },
  {
    code: 'DOC-EM02',
    email: 'dr.emergency.city@demo.com',
    pass: 'Doctor@123',
    name: 'Dr. David Miller',
    phone: '+1-555-0218',
    dept: 'Emergency Medicine',
    branch: 'NORTH',
    regNum: 'REG-MED-20802',
    degrees: 'MBBS, MD (Emergency Medicine)',
    expertise: 'Urgent ambulatory triage, emergency point-of-care, wound repair',
    experience: 9,
    fee: 100,
    workingDays: 'Mon,Tue,Wed,Thu,Fri,Sat',
    slotMinutes: 30
  }
];

export function seedClinicalDepartmentDoctors(db) {
  const doctorRole = db.get("SELECT id FROM roles WHERE code = 'doctor'");
  if (!doctorRole) return;

  const branchMap = Object.fromEntries(db.all('SELECT id, code FROM branches').map((b) => [b.code, b.id]));
  const deptMap = Object.fromEntries(db.all('SELECT id, name FROM departments').map((d) => [d.name, d.id]));
  const specRows = db.all('SELECT id, name, department_id FROM specialties');

  const deptToSpecName = {
    'General Medicine': 'General Physician',
    'Cardiology': 'Cardiologist',
    'Pediatrics': 'Pediatrician',
    'Orthopedics': 'Orthopedic Doctor',
    'Gynecology': 'Gynecologist',
    'Dermatology': 'Dermatologist',
    'Radiology': 'Radiologist',
    'Emergency Medicine': 'Emergency Medicine Doctor'
  };

  const docPass = bcrypt.hashSync('Doctor@123', 10);
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00'];
  const today = new Date();

  for (const d of CLINICAL_DEPARTMENT_DOCTORS) {
    const branchId = branchMap[d.branch] || 1;
    const deptId = deptMap[d.dept] || deptMap['General Medicine'] || 1;
    const targetSpecName = deptToSpecName[d.dept];
    const specRow = specRows.find((s) => s.name === targetSpecName) || specRows.find((s) => s.department_id === deptId) || specRows[0];
    const specialtyId = specRow ? specRow.id : 1;

    let userRow = db.get('SELECT id, role_id, is_active, account_status FROM users WHERE lower(email) = lower(?)', [d.email]);
    if (!userRow) {
      const uInfo = db.run(
        `INSERT INTO users (user_code, email, password_hash, full_name, phone, role_id, branch_id, department_id, is_active, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active')`,
        [d.code, d.email, docPass, d.name, d.phone, doctorRole.id, branchId, deptId]
      );
      userRow = { id: uInfo.lastInsertRowid, role_id: doctorRole.id };
    } else {
      db.run(
        `UPDATE users SET role_id = ?, branch_id = ?, department_id = ?, is_active = 1, account_status = 'Active' WHERE id = ?`,
        [doctorRole.id, branchId, deptId, userRow.id]
      );
    }

    db.run(
      `INSERT OR IGNORE INTO employee_profiles (user_id, employee_code, department_id, branch_id, designation, qualification, shift, joining_date, employment_status, base_salary)
       VALUES (?, ?, ?, ?, 'CONSULTANT DOCTOR', ?, 'Day', '2024-01-15', 'Active', 14500)`,
      [userRow.id, `EMP-${d.code}`, deptId, branchId, d.degrees]
    );

    let docProf = db.get('SELECT id FROM doctor_profiles WHERE user_id = ?', [userRow.id]);
    if (!docProf) {
      const dpInfo = db.run(
        `INSERT INTO doctor_profiles (user_id, doctor_code, specialty_id, department_id, branch_id, qualification, experience_years, consultation_fee, bio, rating, availability_status, is_active, registration_number, working_days, slot_minutes, schedule_configured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 4.9, 'Available', 1, ?, ?, ?, 1)`,
        [userRow.id, `DR-${d.code.split('-')[1]}`, specialtyId, deptId, branchId, d.degrees, d.experience, d.fee, `${d.expertise}. Board-certified doctor.`, d.regNum, d.workingDays, d.slotMinutes]
      );
      docProf = { id: dpInfo.lastInsertRowid };
    } else {
      db.run(
        `UPDATE doctor_profiles SET specialty_id = ?, department_id = ?, branch_id = ?, qualification = ?, experience_years = ?, consultation_fee = ?, registration_number = ?, working_days = ?, slot_minutes = ?, is_active = 1, schedule_configured = 1 WHERE id = ?`,
        [specialtyId, deptId, branchId, d.degrees, d.experience, d.fee, d.regNum, d.workingDays, d.slotMinutes, docProf.id]
      );
    }

    // Ensure schedules exist for Mon-Fri (days 1-5)
    for (let dow = 1; dow <= 5; dow++) {
      db.run(
        'INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [docProf.id, dow, '09:00', '17:00', d.slotMinutes]
      );
    }
    if (d.workingDays.includes('Sat')) {
      db.run(
        'INSERT OR IGNORE INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [docProf.id, 6, '09:00', '14:00', d.slotMinutes]
      );
    }

    // Generate bookable slots for the next 7 days
    for (let offset = 0; offset < 7; offset++) {
      const slotDate = new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
      for (const t of times) {
        db.run(
          'INSERT OR IGNORE INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status) VALUES (?, ?, ?, ?, ?)',
          [docProf.id, branchId, slotDate, t, 'Available']
        );
      }
    }
  }
}
