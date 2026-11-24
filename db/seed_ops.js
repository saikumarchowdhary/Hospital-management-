export function seedOperationsData(db, deptMap, mainBranchId) {
  const adminUser = db.get('SELECT id FROM users WHERE email = ?', ['admin@demo.com']);
  const docUser = db.get('SELECT id FROM users WHERE email = ?', ['doctor@demo.com']);
  const labUser = db.get('SELECT id FROM users WHERE email = ?', ['lab@demo.com']);
  const phmUser = db.get('SELECT id FROM users WHERE email = ?', ['pharmacy@demo.com']);
  const pubUser = db.get('SELECT id FROM users WHERE email = ?', ['publisher@demo.com']);
  const appUser = db.get('SELECT id FROM users WHERE email = ?', ['approver@demo.com']);
  const hrUser = db.get('SELECT id FROM users WHERE email = ?', ['hr@demo.com']);
  const hskUser = db.get('SELECT id FROM users WHERE email = ?', ['housekeeping@demo.com']);
  const pat1 = db.get('SELECT id FROM patient_profiles WHERE patient_code = ?', ['MRN-1001']);
  const doc1 = db.get('SELECT id FROM doctor_profiles WHERE doctor_code = ?', ['DR-2001']);

  // Pharmacy Categories, Medicines, Batches
  const medCats = ['Cardiovascular', 'Antibiotics', 'Analgesics', 'Endocrine'];
  for (const c of medCats) db.run('INSERT OR IGNORE INTO medicine_categories (name) VALUES (?)', [c]);
  const catRows = Object.fromEntries(db.all('SELECT id, name FROM medicine_categories').map((r) => [r.name, r.id]));

  const meds = [
    ['MED-001', 'Amlodipine 5mg', 'Amlodipine Besylate', 'Cardiovascular', 'Tablet', 1.5, 30],
    ['MED-002', 'Amoxicillin 500mg', 'Amoxicillin Trihydrate', 'Antibiotics', 'Capsule', 2.2, 25],
    ['MED-003', 'Paracetamol 500mg', 'Acetaminophen', 'Analgesics', 'Tablet', 0.8, 50],
    ['MED-004', 'Metformin 500mg', 'Metformin HCl', 'Endocrine', 'Tablet', 1.2, 40],
    ['MED-005', 'Atorvastatin 20mg', 'Atorvastatin Calcium', 'Cardiovascular', 'Tablet', 2.5, 20]
  ];
  for (const [sku, name, gen, cat, unit, price, reorder] of meds) {
    db.run(
      'INSERT INTO medicines (sku, name, generic_name, category_id, unit, unit_price, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sku, name, gen, catRows[cat], unit, price, reorder]
    );
    const m = db.get('SELECT id FROM medicines WHERE sku = ?', [sku]);
    const qty = sku === 'MED-005' ? 12 : 180;
    db.run(
      `INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity_received, quantity_available, cost_price)
       VALUES (?, ?, '2027-08-31', ?, ?, ?)`,
      [m.id, `BCH-${sku}`, qty, qty, price * 0.6]
    );
    db.run('INSERT INTO pharmacy_inventory (medicine_id, total_quantity) VALUES (?, ?)', [m.id, qty]);
  }

  // Sample Prescription for Sarah Jenkins
  const med1 = db.get('SELECT id, name FROM medicines WHERE sku = ?', ['MED-001']);
  const cons = db.get('SELECT id FROM consultations LIMIT 1');
  db.run(
    `INSERT INTO prescriptions (prescription_ref, consultation_id, patient_id, doctor_id, status, notes, created_by)
     VALUES ('RX-2026-1001', ?, ?, ?, 'Requested', 'Take once daily in the morning (Sample)', ?)`,
    [cons ? cons.id : null, pat1.id, doc1.id, docUser.id]
  );
  const rx = db.get('SELECT id FROM prescriptions WHERE prescription_ref = ?', ['RX-2026-1001']);
  db.run(
    `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration, quantity, instructions)
     VALUES (?, ?, ?, '5 mg', 'Once daily', '30 days', 30, 'Take with water after breakfast')`,
    [rx.id, med1.id, med1.name]
  );

  // Lab Categories, Tests & 1 Sample Released Report
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
    db.run('INSERT INTO lab_tests (code, name, category_id, price, unit, reference_range, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, lCat[cat], price, unit, ref, desc]);
  }
  const cbc = db.get('SELECT id, unit, reference_range FROM lab_tests WHERE code = ?', ['CBC']);
  db.run(
    `INSERT INTO lab_orders (order_ref, patient_id, doctor_id, branch_id, test_id, scheduled_date, scheduled_slot, status, ordered_by)
     VALUES ('LAB-2026-1001', ?, ?, ?, ?, date('now', '-3 days'), '09:30', 'Released', ?)`,
    [pat1.id, doc1.id, mainBranchId, cbc.id, docUser.id]
  );
  const lo1 = db.get('SELECT id FROM lab_orders WHERE order_ref = ?', ['LAB-2026-1001']);
  db.run('INSERT INTO lab_specimens (order_id, specimen_code, specimen_type, collected_by) VALUES (?, ?, ?, ?)', [lo1.id, 'SPEC-1001', 'Whole Blood EDTA', labUser.id]);
  db.run(
    `INSERT INTO lab_results (order_id, result_value, unit, reference_range, abnormal_flag, notes, is_sample_demo, performed_by, reviewed_by, reviewed_at, released_at)
     VALUES (?, '7.2', ?, ?, 'Normal', 'Sample Demo Report — within normal limits.', 1, ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))`,
    [lo1.id, cbc.unit, cbc.reference_range, labUser.id, docUser.id]
  );

  // Blood Bank
  for (const bg of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
    db.run('INSERT OR IGNORE INTO blood_groups (group_name) VALUES (?)', [bg]);
  }
  const bgMap = Object.fromEntries(db.all('SELECT id, group_name FROM blood_groups').map((r) => [r.group_name, r.id]));
  db.run('INSERT INTO blood_donors (donor_code, full_name, blood_group_id, phone, last_donation_date) VALUES (?, ?, ?, ?, ?)', ['DON-101', 'Samuel Rivera', bgMap['O+'], '+1-555-3301', '2026-08-10']);
  const don1 = db.get('SELECT id FROM blood_donors WHERE donor_code = ?', ['DON-101']);
  db.run(
    `INSERT INTO blood_inventory (bag_code, blood_group_id, component, donor_id, collection_date, expiry_date, screening_passed, status)
     VALUES ('BAG-O-1001', ?, 'Packed RBC', ?, date('now', '-5 days'), date('now', '+30 days'), 1, 'Available')`,
    [bgMap['O+'], don1.id]
  );
  db.run(
    `INSERT INTO blood_inventory (bag_code, blood_group_id, component, donor_id, collection_date, expiry_date, screening_passed, status)
     VALUES ('BAG-A-1002', ?, 'Whole Blood', ?, date('now', '-3 days'), date('now', '+32 days'), 1, 'Available')`,
    [bgMap['A+'], don1.id]
  );

  // Sample Invoice & Insurance
  db.run(
    `INSERT INTO invoices (invoice_number, patient_id, branch_id, description, consultation_charges, lab_charges, tax, total_amount, paid_amount, balance_due, status, created_by)
     VALUES ('INV-2026-1001', ?, ?, 'Cardiology Consultation & CBC Panel (Sample)', 120, 35, 7.75, 162.75, 0, 162.75, 'Pending', ?)`,
    [pat1.id, mainBranchId, adminUser.id]
  );
  const inv1 = db.get('SELECT id FROM invoices WHERE invoice_number = ?', ['INV-2026-1001']);
  db.run('INSERT INTO invoice_items (invoice_id, category, description, quantity, unit_price, line_total) VALUES (?, ?, ?, 1, 120, 120)', [inv1.id, 'Consultation', 'Cardiology OPD Consultation']);
  db.run('INSERT INTO invoice_items (invoice_id, category, description, quantity, unit_price, line_total) VALUES (?, ?, ?, 1, 35, 35)', [inv1.id, 'Laboratory', 'Complete Blood Count (CBC)']);

  db.run('INSERT INTO insurance_providers (name, tpa_code, contact_phone) VALUES (?, ?, ?)', ['MedShield National TPA', 'MS-TPA', '+1-800-555-4000']);
  const prov = db.get('SELECT id FROM insurance_providers LIMIT 1');
  db.run('INSERT INTO insurance_policies (patient_id, provider_id, policy_number, coverage_limit, valid_until) VALUES (?, ?, ?, 100000, ?)', [pat1.id, prov.id, 'POL-MS-98421', '2027-12-31']);

  // HR Vacancy, Announcements, Campaigns, External Providers, Housekeeping
  db.run(
    `INSERT INTO job_vacancies (vacancy_code, title, department_id, branch_id, employment_type, positions, description, status, created_by, approved_by)
     VALUES ('VAC-2026-01', 'Registered ICU Nurse', ?, ?, 'Full-Time', 3, 'Experienced critical care nurse for Cardiac ICU shifts.', 'Published', ?, ?)`,
    [deptMap['Nursing'], mainBranchId, hrUser.id, adminUser.id]
  );
  db.run(
    `INSERT INTO announcements (title, body, priority, start_date, expiry_date, status, created_by)
     VALUES ('Annual Preventive Heart Screening Camp', 'Walk-in lipid profile and ECG checkups available at Central Hospital this month.', 'Normal', date('now', '-1 day'), date('now', '+30 days'), 'Published', ?)`,
    [pubUser.id]
  );
  const ann = db.get('SELECT id FROM announcements LIMIT 1');
  db.run('INSERT INTO announcement_approvals (announcement_id, reviewer_id, decision, comments) VALUES (?, ?, ?, ?)', [ann.id, appUser.id, 'Approved', 'Approved for all patients and staff.']);
  db.run('INSERT INTO announcement_audience (announcement_id, audience_type, audience_value) VALUES (?, ?, ?)', [ann.id, 'role', 'all']);

  db.run(
    `INSERT INTO campaigns (name, description, destination_url, offer_terms, audience, branch_id, start_date, end_date, status, is_sponsored, created_by)
     VALUES ('Comprehensive Wellness Checkup', 'Complete preventive blood and cardiac screening package.', '#patient/lab-booking', 'Valid for outpatient visits only. Local demonstration promotion.', 'Patients', ?, date('now', '-1 day'), date('now', '+30 days'), 'Published', 1, ?)`,
    [mainBranchId, pubUser.id]
  );
  const camp = db.get('SELECT id FROM campaigns LIMIT 1');
  db.run('INSERT INTO campaign_metrics (campaign_id, impressions, clicks) VALUES (?, 14, 2)', [camp.id]);

  db.run('INSERT INTO external_providers (name, provider_type, contact_person, phone, location, is_verified) VALUES (?, ?, ?, ?, ?, 1)', ['Metro Regional Blood Center', 'Blood Bank', 'Dr. Owen Hayes', '+1-555-7700', 'Downtown Medical District']);
  db.run('INSERT INTO suppliers (name, category, contact_phone, email) VALUES (?, ?, ?, ?)', ['Apex Pharma Distributors', 'Pharmaceuticals', '+1-555-6600', 'orders@apexpharma.demo']);

  // Seed one housekeeping task
  const cleanRoom = db.get('SELECT id, ward_id FROM rooms LIMIT 1');
  const cleanBed = db.get('SELECT id FROM beds WHERE bed_code = ?', ['B-102-1']);
  db.run('UPDATE beds SET status = ? WHERE id = ?', ['Cleaning', cleanBed.id]);
  db.run(
    `INSERT INTO housekeeping_tasks (task_ref, ward_id, room_id, bed_id, assigned_to, priority, status, notes, created_by)
     VALUES ('HSK-2026-001', ?, ?, ?, ?, 'High', 'Assigned', 'Terminal sanitization required before next patient.', ?)`,
    [cleanRoom.ward_id, cleanRoom.id, cleanBed.id, hskUser.id, adminUser.id]
  );

  // Settings
  const settings = [
    ['hospital_name', 'MediCore HMS', 'Primary hospital name displayed in portal and receipts'],
    ['emergency_hotline', '+1-555-911-CARE', 'Direct emergency triage desk phone number'],
    ['tax_rate_percent', '5', 'Default invoice tax percentage'],
    ['allow_patient_refills', 'true', 'Allow patients to request prescription refills online']
  ];
  for (const [k, v, d] of settings) {
    db.run('INSERT OR IGNORE INTO settings (key, value, description, updated_by) VALUES (?, ?, ?, ?)', [k, v, d, adminUser.id]);
  }
}
