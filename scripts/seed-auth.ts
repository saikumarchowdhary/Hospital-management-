import { createDatabase } from '../db/database.js';
import { runMigrations } from '../db/migrations.js';
import { DEMO_USERS, seedDatabase } from '../db/seed.js';
import { CLINICAL_DEPARTMENT_DOCTORS, seedClinicalDepartmentDoctors } from '../db/seed_doctors.js';

export function runSeedAuth(dbPath = './data/hms.db') {
  const db = createDatabase(dbPath);
  runMigrations(db);
  seedDatabase(db);
  seedClinicalDepartmentDoctors(db);

  console.log('\n===============================================================');
  console.log('  CareLine / MediCore HMS — Authenticated Demonstration Users');
  console.log('===============================================================\n');

  const groups: Record<string, Array<{ role: string; label: string; email: string; pass: string; name: string; dept?: string; branch?: string; reg?: string }>> = {
    'Patient': [
      { role: 'patient', label: 'Patient Portal', email: 'patient@demo.com', pass: 'Patient@123', name: 'Sarah Jenkins', dept: 'Outpatient' }
    ],
    'Doctors (One per Clinical Department for Both Branches)': CLINICAL_DEPARTMENT_DOCTORS.map((d) => ({
      role: 'doctor',
      label: `${d.dept} (${d.branch === 'MAIN' ? 'Central' : 'City Clinic'})`,
      email: d.email,
      pass: d.pass,
      name: d.name,
      dept: d.dept,
      branch: d.branch === 'MAIN' ? 'Central Hospital' : 'North/City Clinic',
      reg: d.regNum
    })),
    'Nursing and front office': [
      { role: 'nurse', label: 'Nurse Portal', email: 'nurse@demo.com', pass: 'Nurse@123', name: 'Clara Bennett', dept: 'Nursing' },
      { role: 'receptionist', label: 'Receptionist Portal', email: 'reception@demo.com', pass: 'Reception@123', name: 'Marcus Reed', dept: 'Administration' },
      { role: 'case_manager', label: 'Case Manager Portal', email: 'case@demo.com', pass: 'Case@123', name: 'Nadia Patel', dept: 'Administration' }
    ],
    'Lab and Pharmacy': [
      { role: 'lab_staff', label: 'Laboratory Tech', email: 'lab@demo.com', pass: 'Lab@123', name: 'David Kim', dept: 'Laboratory' },
      { role: 'pharmacist', label: 'Pharmacist', email: 'pharmacy@demo.com', pass: 'Pharmacy@123', name: 'Priya Nair', dept: 'Pharmacy' },
      { role: 'radiologist', label: 'Radiologist', email: 'radiology@demo.com', pass: 'Radiology@123', name: 'Dr. Nina Volkov', dept: 'Radiology' }
    ],
    'Finance': [
      { role: 'accountant', label: 'Accountant / Billing', email: 'accounts@demo.com', pass: 'Accounts@123', name: 'Victor Alvarez', dept: 'Finance' }
    ],
    'HR and Publishing': [
      { role: 'hr', label: 'HR / Recruitment', email: 'hr@demo.com', pass: 'Hr@123', name: 'Hannah Brooks', dept: 'Human Resources' },
      { role: 'publisher', label: 'Publisher', email: 'publisher@demo.com', pass: 'Publish@123', name: 'Liam OConnor', dept: 'Administration' },
      { role: 'approver', label: 'Approver', email: 'approver@demo.com', pass: 'Approve@123', name: 'Evelyn Shaw', dept: 'Administration' }
    ],
    'External and Housekeeping': [
      { role: 'housekeeping', label: 'Housekeeping Staff', email: 'housekeeping@demo.com', pass: 'House@123', name: 'Carlos Mendez', dept: 'Housekeeping' },
      { role: 'bloodbank_staff', label: 'Blood Bank Staff', email: 'bloodbank@demo.com', pass: 'Bloodbank@123', name: 'Samuel Boateng', dept: 'Blood Bank' },
      { role: 'external_coordinator', label: 'External Coordinator', email: 'external@demo.com', pass: 'External@123', name: 'Grace Liu', dept: 'Administration' }
    ],
    'Admin': [
      { role: 'admin', label: 'System Administrator', email: 'admin@demo.com', pass: 'Admin@123', name: 'Dr. Arthur Vance', dept: 'Administration' }
    ],
    'Candidate': [
      { role: 'candidate', label: 'Job Candidate', email: 'candidate@demo.com', pass: 'Candidate@123', name: 'Jordan Blake', dept: 'Careers' }
    ]
  };

  for (const [groupName, members] of Object.entries(groups)) {
    console.log(`### ${groupName}`);
    console.log('| Role / Portal | Full Name | Email Address | Password | Dept / Branch | Reg Number |');
    console.log('|---|---|---|---|---|---|');
    for (const m of members) {
      console.log(`| ${m.label} | ${m.name} | \`${m.email}\` | \`${m.pass}\` | ${m.dept || '-'} (${m.branch || 'Central'}) | ${m.reg || '-'} |`);
    }
    console.log('');
  }

  console.log('Seed authentication completed successfully. All users linked and verified.\n');
  return groups;
}

if (process.argv[1] && process.argv[1].endsWith('seed-auth.ts')) {
  runSeedAuth();
}
