# MediCore HMS — Hospital Management System & Patient PWA

MediCore HMS is a full-stack Hospital Management System and installable Patient Mobile Web App (PWA) built with Node.js, Express.js, SQLite (`better-sqlite3`), Server-Sent Events (SSE), Multer local uploads, and pure HTML5 / CSS3 / Vanilla JavaScript.

## Requirements
- Node.js 20+ (tested on Node v22)
- npm

## Installation & Startup

```bash
npm install
npm start
```

For development mode:

```bash
npm run dev
```

Application URL: **http://localhost:3000**

## Running Tests

```bash
npm test
```

All tests use Node's built-in test runner (`node --test tests/*.test.js`) against isolated temporary SQLite databases and ephemeral Express HTTP servers.

## Local Demonstration Accounts (15 Roles)

Role identification is automatic upon sign-in (no role selector dropdown). These accounts are for local demonstration only:

| Role | Email | Password |
|---|---|---|
| Patient | `patient@demo.com` | `Patient@123` |
| Admin | `admin@demo.com` | `Admin@123` |
| Doctor | `doctor@demo.com` | `Doctor@123` |
| Nurse | `nurse@demo.com` | `Nurse@123` |
| Receptionist | `reception@demo.com` | `Reception@123` |
| Case Manager | `case@demo.com` | `Case@123` |
| Lab Staff | `lab@demo.com` | `Lab@123` |
| Pharmacist | `pharmacy@demo.com` | `Pharmacy@123` |
| Accountant | `accounts@demo.com` | `Accounts@123` |
| HR / Hiring | `hr@demo.com` | `Hr@123` |
| Publisher | `publisher@demo.com` | `Publish@123` |
| Approver | `approver@demo.com` | `Approve@123` |
| Housekeeping | `housekeeping@demo.com` | `House@123` |
| External Coordinator | `external@demo.com` | `External@123` |
| Candidate | `candidate@demo.com` | `Candidate@123` |

## Data Persistence & Uploads
- **SQLite Database**: `./data/hms.db` (WAL mode, foreign keys enforced).
- **JWT Signing Key**: Auto-generated and persisted at `./data/secret.key` (override via `JWT_SECRET` environment variable).
- **Uploaded Attachments**: Stored locally in `./uploads/` (PDF, PNG, JPG, TXT, CSV up to 5 MB) with authenticated download authorization checks.

### Resetting Demo Data
Stop the server, remove `./data/hms.db*`, and restart `npm start` to re-run schema migrations and idempotent seeding cleanly.

## Administration & Configuration
- **Add Departments / Create Staff Accounts**: Sign in as `admin@demo.com` -> **Admin Control** (`#admin/control`).
- **Configure Role Permissions**: **Admin Control** -> **Role Permissions** -> **Configure Permissions** for any role.
- **Hospital Settings**: **Admin Control** -> **Settings** (hospital name, emergency hotline, tax rate, patient refills toggle).
- **Workflow State Machines**: Managed centrally in `services/workflow.js`.

## External Integration & Production Deployment Prerequisites
Local demonstration workflows are intentionally simulated without external paid APIs:
1. **Payments**: Replace the local simulation mode in `services/billing.js` with a PCI-DSS payment gateway (e.g. Stripe / Adyen) and webhook signature verification.
2. **SMS / Email / OTP**: Replace local demo OTP (`123456`) and password-reset preview codes in `routes/auth.js` with an SMS/Email provider (Twilio, SES, SendGrid).
3. **Radiology PACS / DICOM & External TPA**: Connect PACS DICOM viewers and real insurance/TPA clearinghouse APIs.
4. **Emergency Dispatch**: Integrate local ambulance/PSAP dispatch and GPS services; the current Emergency SOS module logs urgent triage requests to the reception/triage desk and displays a direct hotline link.
5. **Security & Compliance**: Deploy behind HTTPS TLS termination, set `JWT_SECRET` in environment secrets, configure off-site encrypted database backups, and complete regional healthcare compliance audits (HIPAA / DPDP / GDPR) prior to handling live PHI.
