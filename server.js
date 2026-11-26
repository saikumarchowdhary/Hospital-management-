import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { bootstrapAdminFromEnv, DEMO_USERS, seedDemoData, seedReferenceData } from './db/seed.js';
import { CLINICAL_DEPARTMENT_DOCTORS } from './db/seed_doctors.js';
import { createAuthMiddleware, csrfProtect, getJwtSecret } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { createUploadMiddleware } from './middleware/uploads.js';
import { createAdminRouter } from './routes/admin.js';
import { createAdmissionsRouter } from './routes/admissions.js';
import { createDepartmentAdminRouter } from './routes/department_admin.js';
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
import { createIntegrationsRouter } from './routes/integrations.js';
import { EventBroker } from './services/events.js';
import { attachWebSocketServer } from './services/websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createHmsApp(options = {}) {
  const db = createDatabase(options.dbPath);
  runMigrations(db);
  seedReferenceData(db);
  if (options.seedDemo === true) {
    seedDemoData(db);
  }
  bootstrapAdminFromEnv(db);

  const jwtSecret = options.jwtSecret || getJwtSecret(options.dataDir);
  const { upload, uploadDir } = createUploadMiddleware(options.uploadDir);
  const broker = new EventBroker(db);
  const authenticate = createAuthMiddleware(db, jwtSecret);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.on('finish', () => {
      if (res.statusCode === 403 && req.user && (req.originalUrl || req.path || '').startsWith('/api/')) {
        try {
          db.run(
            `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, ip_address)
             VALUES (?, ?, 'authz.denied', 'route', ?, ?, ?)`,
            [req.user.id, req.user.role, req.originalUrl || req.path, JSON.stringify({ method: req.method, path: req.originalUrl }), req.ip || '127.0.0.1']
          );
        } catch {}
      }
    });
    next();
  });
  app.use(csrfProtect);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MediCore HMS', timestamp: new Date().toISOString() });
  });

  app.get('/api/admin/exists', (_req, res) => {
    try {
      const row = db.get(
        `SELECT COUNT(*) as cnt FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' AND u.is_active = 1`
      );
      res.json({ exists: Boolean(row && row.cnt > 0) });
    } catch {
      res.json({ exists: false });
    }
  });

  app.get('/api/prescriptions/verify/:ref', (req, res) => {
    const ref = String(req.params.ref || '').trim();
    if (!ref) {
      return res.status(400).json({ valid: false, error: 'Prescription reference is required.' });
    }
    const row = db.get(
      `SELECT r.id, r.prescription_ref, r.status, r.created_at,
              du.full_name as doctor_name, COALESCE(sp.name, 'General Medicine') as specialization,
              doc.registration_number, COALESCE(b.name, ?) as hospital_name
       FROM prescriptions r
       JOIN doctor_profiles doc ON doc.id = r.doctor_id
       JOIN users du ON du.id = doc.user_id
       LEFT JOIN specialties sp ON sp.id = doc.specialty_id
       LEFT JOIN branches b ON b.id = doc.branch_id
       WHERE upper(r.prescription_ref) = upper(?)`,
      [process.env.HOSPITAL_NAME || 'CareLine HMS', ref]
    );
    if (!row) {
      return res.status(404).json({ valid: false, error: 'Prescription not found or invalid verification code.' });
    }
    return res.json({ valid: true, verification: row });
  });

  app.get('/api/demo-accounts', (_req, res) => {
    const isVisible =
      process.env.NODE_ENV !== 'production' &&
      (process.env.DEMO_ACCOUNTS_VISIBLE === 'true' || process.env.DEMO_ACCOUNTS_VISIBLE === '1');
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
        accounts: allAccounts.filter((a) => ['admin', 'department_admin'].includes(a.role))
      },
      {
        name: 'Candidate',
        accounts: allAccounts.filter((a) => a.role === 'candidate')
      }
    ];

    res.json({ visible: true, accounts: allAccounts, groups });
  });

  app.use('/api/auth', createAuthRouter(db, jwtSecret, authenticate, broker, upload));
  app.use('/api/patients', createPatientsRouter(db, broker, authenticate, upload));
  app.use('/api/doctors', createDoctorsRouter(db, authenticate, broker));
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
  app.use('/api/integrations', createIntegrationsRouter(db, broker, authenticate));
  app.use('/api', createNotificationsRouter(db, broker, authenticate));
  app.use('/api/reports', createReportsRouter(db, authenticate));
  app.get('/api/categories', authenticate, (_req, res) => {
    const categories = db.all('SELECT category_id, name, description FROM category ORDER BY category_id ASC');
    res.json({ categories });
  });
  app.use('/api/admin', createAdminRouter(db, authenticate, uploadDir, broker, upload));
  app.use('/api/department-admin', createDepartmentAdminRouter(db, broker, authenticate));

  const distDir = path.join(__dirname, 'dist');
  const publicDir = path.join(__dirname, 'public');
  const staticDir = fs.existsSync(path.join(distDir, 'index.html')) ? distDir : publicDir;
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found.' });
    }
    return res.sendFile(path.join(staticDir, 'index.html'));
  });

  app.use(errorHandler);
  const attachWebSocket = (httpServer) => attachWebSocketServer(httpServer, db, jwtSecret, broker);
  return { app, db, broker, attachWebSocket };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const { app, attachWebSocket } = createHmsApp();
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`MediCore HMS running at http://localhost:${port}`);
  });
  attachWebSocket(server);
}
