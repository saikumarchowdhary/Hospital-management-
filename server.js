import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { DEMO_USERS, seedDatabase } from './db/seed.js';
import { CLINICAL_DEPARTMENT_DOCTORS } from './db/seed_doctors.js';
import { createAuthMiddleware, csrfProtect, getJwtSecret } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { createUploadMiddleware } from './middleware/uploads.js';
import { createAdminRouter } from './routes/admin.js';
import { createAdmissionsRouter } from './routes/admissions.js';
import { createAppointmentsRouter } from './routes/appointments.js';
import { createAuthRouter } from './routes/auth.js';
import { createBedsRouter } from './routes/beds.js';
import { createBillingRouter } from './routes/billing.js';
import { createBloodBankRouter } from './routes/bloodbank.js';
import { createCampaignsRouter } from './routes/campaigns.js';
import { createClinicalRouter } from './routes/clinical.js';
import { createDoctorsRouter } from './routes/doctors.js';
import { createExternalRouter } from './routes/external.js';
import { createHousekeepingRouter } from './routes/housekeeping.js';
import { createHrRouter } from './routes/hr.js';
import { createInsuranceRouter } from './routes/insurance.js';
import { createLaboratoryRouter } from './routes/laboratory.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createNursingRouter } from './routes/nursing.js';
import { createPatientsRouter } from './routes/patients.js';
import { createPharmacyRouter } from './routes/pharmacy.js';
import { createPublisherRouter } from './routes/publisher.js';
import { createRadiologyRouter } from './routes/radiology.js';
import { createReportsRouter } from './routes/reports.js';
import { EventBroker } from './services/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createHmsApp(options = {}) {
  const db = createDatabase(options.dbPath);
  runMigrations(db);
  seedDatabase(db);

  const jwtSecret = options.jwtSecret || getJwtSecret(options.dataDir);
  const { upload, uploadDir } = createUploadMiddleware(options.uploadDir);
  const broker = new EventBroker(db);
  const authenticate = createAuthMiddleware(db, jwtSecret);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(csrfProtect);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MediCore HMS', timestamp: new Date().toISOString() });
  });

  app.get('/api/demo-accounts', (_req, res) => {
    const isVisible = process.env.DEMO_ACCOUNTS_VISIBLE !== 'false' && process.env.DEMO_ACCOUNTS_VISIBLE !== '0';
    if (!isVisible) {
      return res.json({ visible: false, accounts: [], groups: [] });
    }

    const doctorAccounts = CLINICAL_DEPARTMENT_DOCTORS.map((d) => ({
      role: 'doctor',
      user_code: d.code,
      label: `${d.dept} (${d.branch === 'MAIN' ? 'Central' : 'City'})`,
      email: d.email,
      password: d.pass,
      name: d.name,
      department: d.dept,
      branch: d.branch === 'MAIN' ? 'Central Hospital' : 'City Clinic',
      reg_num: d.regNum
    }));

    const allAccounts = [
      ...DEMO_USERS.map((u) => ({
        role: u.role,
        user_code: u.code,
        label: u.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        email: u.email,
        password: u.pass,
        name: u.name,
        department: u.dept || ''
      })),
      ...doctorAccounts.filter((d) => !DEMO_USERS.some((u) => u.email.toLowerCase() === d.email.toLowerCase()))
    ];

    const groups = [
      {
        name: 'Patient',
        accounts: allAccounts.filter((a) => a.role === 'patient')
      },
      {
        name: 'Doctors',
        hasSearch: true,
        accounts: doctorAccounts
      },
      {
        name: 'Nursing and front office',
        accounts: allAccounts.filter((a) => ['nurse', 'receptionist', 'case_manager'].includes(a.role))
      },
      {
        name: 'Lab and Pharmacy',
        accounts: allAccounts.filter((a) => ['lab_staff', 'pharmacist', 'radiologist'].includes(a.role))
      },
      {
        name: 'Finance',
        accounts: allAccounts.filter((a) => a.role === 'accountant')
      },
      {
        name: 'HR and Publishing',
        accounts: allAccounts.filter((a) => ['hr', 'publisher', 'approver'].includes(a.role))
      },
      {
        name: 'External and Housekeeping',
        accounts: allAccounts.filter((a) => ['housekeeping', 'bloodbank_staff', 'external_coordinator'].includes(a.role))
      },
      {
        name: 'Admin',
        accounts: allAccounts.filter((a) => a.role === 'admin')
      },
      {
        name: 'Candidate',
        accounts: allAccounts.filter((a) => a.role === 'candidate')
      }
    ];

    res.json({ visible: true, accounts: allAccounts, groups });
  });

  app.use('/api/auth', createAuthRouter(db, jwtSecret, authenticate, broker));
  app.use('/api/patients', createPatientsRouter(db, broker, authenticate, upload));
  app.use('/api/doctors', createDoctorsRouter(db, authenticate));
  app.use('/api/appointments', createAppointmentsRouter(db, broker, authenticate));
  app.use('/api/clinical', createClinicalRouter(db, broker, authenticate));
  app.use('/api/nursing', createNursingRouter(db, broker, authenticate));
  app.use('/api/admissions', createAdmissionsRouter(db, broker, authenticate));
  app.use('/api/beds', createBedsRouter(db, authenticate));
  app.use('/api/laboratory', createLaboratoryRouter(db, broker, authenticate, upload));
  app.use('/api/radiology', createRadiologyRouter(db, broker, authenticate, upload));
  app.use('/api/pharmacy', createPharmacyRouter(db, broker, authenticate));
  app.use('/api/bloodbank', createBloodBankRouter(db, broker, authenticate));
  app.use('/api/billing', createBillingRouter(db, broker, authenticate));
  app.use('/api/insurance', createInsuranceRouter(db, broker, authenticate));
  app.use('/api/hr', createHrRouter(db, broker, authenticate, upload));
  app.use('/api/publisher', createPublisherRouter(db, broker, authenticate, upload));
  app.use('/api/campaigns', createCampaignsRouter(db, broker, authenticate, upload));
  app.use('/api/housekeeping', createHousekeepingRouter(db, broker, authenticate));
  app.use('/api/external', createExternalRouter(db, broker, authenticate));
  app.use('/api', createNotificationsRouter(db, broker, authenticate));
  app.use('/api/reports', createReportsRouter(db, authenticate));
  app.use('/api/admin', createAdminRouter(db, authenticate, uploadDir, broker));

  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(errorHandler);
  return { app, db, broker };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const { app } = createHmsApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`MediCore HMS running at http://localhost:${port}`);
    console.log('Demonstration Login Accounts (Local Demo Only):');
    for (const u of DEMO_USERS) {
      console.log(`  - ${u.role.padEnd(20)} | ${u.email.padEnd(24)} | ${u.pass}`);
    }
  });
}
