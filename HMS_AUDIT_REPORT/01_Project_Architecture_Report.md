# 01 — Project Architecture & Functional Cross-Comparison Report

**Audit Date:** 2026-11-24  
**Repository Root:** `/`  
**Scope:** Full-stack inspection of the React + Vite SPA (`src/`), Express + WebSocket/SSE backend (`server.js`, `routes/`, `services/`, `middleware/`), SQLite relational database (`db/`), Legacy Vanilla JS PWA (`public/`), Native Android Kotlin/Jetpack Compose module (`android/`), and external production integrations (`services/integrations.js`, `.env.example`) cross-compared against the **Hospital Management Functional Detailed Document**.

---

## 1. System Architecture Overview

| Layer | Technology & Entry Point | Current State |
|---|---|---|
| **Web Frontend (Primary)** | React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (`index.html`, `src/App.tsx`, `src/components/*.tsx`, `src/lib/api.ts`) | **Wired to Backend & Built to `dist/`** — Authenticates via JWT (`Bearer` in-memory + `HttpOnly` cookie), consumes `/api/*` REST APIs and `/ws` WebSocket events, and serves compiled output via `server.js`. |
| **Web Frontend (Legacy PWA)** | Vanilla JS ES Modules + Service Worker (`public/index.html`, `public/js/pages/*.js`, `public/manifest.json`, `public/service-worker.js`) | **Complete Fallback** — Contains 29 role-specific JS modules; `server.js` falls back to `public/` if `dist/index.html` is absent. |
| **Backend API & Real-Time** | Node.js 22 + Express 4.21.2 (`server.js`, 26 router files in `routes/`, 11 service files in `services/`, `middleware/`) | **Production-Ready Core** — Mounts 23 API route groups under `/api/*`, enforces RBAC & CSRF/JWT middleware, runs atomic SQLite transactions, and broadcasts dual SSE (`/api/events/stream`) + WebSocket (`/ws`) events. |
| **Database** | SQLite via `better-sqlite3` (`./data/hms.db`, WAL mode, foreign keys `ON`) across 7 schema modules + `db/migrations.js` | **Operational (~70+ tables)** — Covers RBAC, clinical care, admissions/transfers, lab, radiology, pharmacy, blood bank, billing, insurance, HR, campaigns, housekeeping, audit logs, `search_analytics`, `webhook_events`, and `integration_deliveries`. |
| **Native Android App** | Kotlin + Jetpack Compose + Material 3 + Hilt DI + Retrofit + OkHttp WebSocket + `androidx.security:security-crypto` (`android/`) | **Source Implemented / APK Uncompiled in Container** — Includes `AuthenticationRepository`, `AuthModule`, `AdmissionsBedsScreen` (`LazyVerticalGrid` ward map + transfer verification), `PatientHomeScreen`, `DoctorsBookingScreen`, `BillingNotificationsScreen`, and `HmsApiService` targeting `http://10.0.2.2:3000/`. |

---

## 2. Cross-Comparison Against Hospital Management Functional Detailed Document

### 2.1 Core Platform, Security & Real-Time Infrastructure
- **Authentication & Session Management:**
  - *Backend (`routes/auth.js`, `middleware/auth.js`):* **Implemented.** Login (`email`/`user_code`), patient registration, `POST /api/auth/refresh`, `GET /api/auth/me`, `POST /api/auth/logout`, lockout after 5 failures, login rate limiting, CSRF header/origin checks, and strict `403` guard blocking direct public `admin`/`doctor` signup.
  - *Web (`src/App.tsx`) & Android (`AuthenticationRepository.kt`, `AuthModule.kt`):* **Implemented.** React stores short-lived access token in memory + `HttpOnly` cookie; Android encrypts tokens via `EncryptedSharedPreferences` + AES-256 `MasterKey` (`androidx.security:security-crypto`) injected via Hilt.
  - *Gap:* OTP / password reset delivery uses local demo codes unless SMS/Email credentials are configured.
- **Multi-User Real-Time Synchronization:**
  - *Backend (`services/events.js`, `services/websocket.js`):* **Implemented & Verified.** Dual SSE (`/api/events/stream`) and JWT-authenticated WebSocket (`/ws`) server broadcasting bed transfers, lab/pharmacy events, and notifications.
  - *Web & Android:* **Implemented.** `src/App.tsx` and `HmsWebSocketClient.kt` subscribe to `/ws`.

### 2.2 Clinical, Inpatient & Diagnostic Modules Matrix

| Functional Module | Backend API & DB (`routes/`, `db/`) | React SPA (`src/`) | Native Android (`android/`) | Status & Gaps |
|---|---|---|---|---|
| **Dashboard & Search Analytics** | `GET /api/reports/dashboard`, `GET/POST /api/reports/search-analytics`, `search_analytics` table | `src/App.tsx` (KPI cards, PieChart, BarChart, ComposedChart) | Patient dashboard summary (`GET api/patients/me/dashboard`) | **Implemented on Web**; Admin/Exec analytics charts not yet replicated on Android. |
| **Patients & EHR** | `routes/patients.js` (CRUD, medical records, SOS, attachments) | `PatientsPanel.tsx` (directory, EHR drawer, registration, patient dashboard & SOS) | `PatientHomeScreen.kt` + `getPatients` / `getPatientDetail` / `sendEmergencySos` | **Implemented.** Minor gap: React lacks full patient-uploaded attachment preview UI compared to `public/js/pages/records.js`. |
| **Doctors & Appointments** | `routes/doctors.js`, `routes/appointments.js` (24 specializations, slots, booking, status flow) | `DoctorsAppointmentsPanel.tsx` (directory, live slot booking, status transitions) | `DoctorsBookingScreen.kt` (`getDoctors`, `getDoctorSlots`, `bookAppointment`) | **Implemented.** React calendar grid drag-rescheduling is simpler than `public/js/pages/appointments.js`. |
| **Inpatient Admissions & Bed Map** | `routes/admissions.js`, `routes/beds.js`, `services/admissions.js` (atomic `POST /api/admissions/transfer`, discharge) | `src/App.tsx` (7-day occupancy chart, ward map, status gate, formal Bed Transfer Verification modal) | `AdmissionsBedsScreen.kt` (`LazyVerticalGrid` ward map, `getBeds`, `updateBedStatus`, `transferBed`, transfer log) | **Implemented & Verified** (race condition + rollback tested). *Gap:* React & Android do not yet expose full Discharge Summary / Checklist creation UI (`POST /api/admissions/:id/discharge`), which exists only in backend & `public/js/pages/admissions.js`. |
| **Doctor Consultation & Clinical Care** | `routes/clinical.js`, `routes/clinical_extras.js` (`consultations`, `diagnoses`, `prescriptions`) | **Partial / Gap** | **Missing UI** | Backend supports full consultations, ICD-10 diagnosis, e-prescriptions, and clinical notes (`routes/clinical.js`), and `public/js/pages/doctor-consult.js` renders them, but **React (`src/`) and Android lack dedicated Doctor Consultation / e-Prescription authoring screens**. |
| **Nurse Portal (Vitals, MAR, Handover)** | `routes/nursing.js` (`patient_vitals`, `nursing_tasks`, `nursing_notes`) | **Missing in React** | **Missing UI** | Implemented in backend & `public/js/pages/nurse.js`, **absent from `src/App.tsx` / `src/components/*` and Android UI**. |
| **Pharmacy & Dispensing** | `routes/pharmacy.js`, `services/pharmacy.js` (`medicines`, `medicine_batches`, FEFO dispensing) | `ClinicalDiagnosticsPanel.tsx` (inventory + Rx dispensing) | DTOs & Retrofit endpoints (`getPharmacyInventory`, `getPrescriptions`, `dispensePrescription`) | **Implemented on Web & API**; Android pharmacist screen not yet built. Batch/expiry CRUD UI exists in `public/js/pages/pharmacy.js`, partial in React. |
| **Laboratory Management** | `routes/laboratory.js` (tests, specimen collection, processing, result release) | `ClinicalDiagnosticsPanel.tsx` (order queue + release action) | `getLabOrders`, `releaseLabOrder` in `HmsApiService.kt` | **Partial in React/Android:** Specimen collection & result value entry UI exist in `public/js/pages/laboratory.js`; React exposes order queue & release. **Reagent Inventory & LIS Analyzer Drivers are MISSING across all layers.** |
| **Radiology & PACS** | `routes/radiology.js` (`radiology_orders`, `radiology_reports`) | `ClinicalDiagnosticsPanel.tsx` (orders table) | `getRadiologyOrders` in `HmsApiService.kt` | **Partial:** Report authoring UI is in `public/js/pages/radiology.js` (missing in React/Android). **Live PACS/DICOMweb viewer is `NOT CONFIGURED`.** |
| **Blood Bank** | `routes/bloodbank.js` (`blood_donors`, `blood_inventory`, compatibility & issue) | `ClinicalDiagnosticsPanel.tsx` (inventory list) | `getBloodBankOverview` in `HmsApiService.kt` | **Partial:** Donor registration, cross-match gate, and bag issue forms exist in `public/js/pages/bloodbank.js`, **missing in React & Android UI**. |

### 2.3 Finance, Operations, Admin & Mobile Matrix

| Functional Module | Backend API & DB | React SPA (`src/`) | Native Android (`android/`) | Status & Gaps |
|---|---|---|---|---|
| **Billing, Ledger & Payments** | `routes/billing.js`, `services/billing.js` (invoices, idempotent payments, ledger, refunds) | `BillingInsurancePanel.tsx` (invoices, ledger totals, payment recording) | `BillingNotificationsScreen.kt` (`getInvoices`, `recordPayment`) | **Implemented (Sandbox/Local).** Live payment gateway (`STRIPE_SECRET_KEY`) is `NOT CONFIGURED`; React omits refund/expense forms present in `public/js/pages/finance.js`. |
| **Insurance & TPA Desk** | `routes/insurance.js` (`insurance_policies`, `insurance_cases`) | `BillingInsurancePanel.tsx` (claims view) | **Missing** | **Partial:** Policy creation & pre-auth workflows exist in backend & `public/js/pages/insurance.js`; live TPA clearinghouse is simulated. |
| **HR, Payroll & Recruitment ATS** | `routes/hr.js` (employees, attendance, leave, payroll, vacancies, applications) | `OperationsIntegrationsPanel.tsx` (employee directory only) | **Missing** | **Partial in React / Missing in Android:** Attendance, leave approvals, payroll slips, job vacancies, and candidate application UI exist only in `public/js/pages/hr.js` & `hr-extra.js`. |
| **Housekeeping & Room Inspection** | `routes/housekeeping.js` (cleaning tasks + bed-release compliance gate) | **Missing in React** | **Missing UI** (cleaning gate enforced server-side on `PATCH /api/beds/:id/status`) | Backend & `public/js/pages/housekeeping.js` complete; **dedicated Housekeeping task board absent from React & Android UI**. |
| **Publisher, Approver & Campaigns** | `routes/publisher.js`, `routes/campaigns.js` (separation of duties) | `OperationsIntegrationsPanel.tsx` (notices list) | **Missing** | **Partial in React:** Notice creation/approval and campaign forms exist in `public/js/pages/publisher.js` & `campaigns.js`. |
| **External Coordination & Ambulance** | `routes/external.js` (7-step provider lifecycle, procurement, ambulance) | **Missing in React** | **Missing** | Backend & `public/js/pages/external.js` complete; **absent from React & Android UI**. GPS ambulance tracking is `NOT CONFIGURED`. |
| **Compliance Audit Logs & Admin RBAC** | `routes/admin.js`, `admin_members.js`, `admin_signups.js` | `src/App.tsx` (Live audit trail, diffs, CSV/Print, RBAC matrix toggles) | **Missing** | **Implemented on Web** (`staff_signup_requests` approval UI and department/branch CRUD remain in `public/js/pages/admin*.js`). |

---

## 3. External Integrations & Production Readiness Gaps

All third-party integrations are architected in `/services/integrations.js`, `/routes/integrations.js`, and `/.env.example` with explicit `CONFIGURED` / `NOT CONFIGURED` status reporting and sandbox safeguards, but require production credentials:
1. **Payment Gateway & Webhooks (`STRIPE_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`):** `NOT CONFIGURED` in environment (HMAC-SHA256 webhook verification & idempotency verified in test/sandbox mode).
2. **SMS, Email & WhatsApp (`TWILIO_*`, `SENDGRID_API_KEY`/`SMTP_HOST`, `WHATSAPP_*`):** `NOT CONFIGURED` in environment (sandbox delivery logging works; live mode strictly returns HTTP `503`).
3. **Medical Imaging & Interoperability (`PACS_DICOMWEB_URL`, `FHIR_BASE_URL`):** `NOT CONFIGURED` (no live DICOMweb viewer, HL7/FHIR R4 connector, ABDM gateway, or Lab Analyzer LIS interface).
4. **Geospatial / Ambulance Dispatch (`GOOGLE_MAPS_API_KEY`):** `NOT CONFIGURED`.
5. **Cloud Infrastructure & Persistence Notes:** `server.js` serves compiled `dist/` assets cleanly on `0.0.0.0:${PORT || 3000}`. For multi-instance Cloud Run scaling, local `./data/hms.db` (SQLite) and `./uploads/` require persistent volume backing or migration to managed Cloud SQL (PostgreSQL) and Cloud Storage.
6. **Android Build Environment:** `/android` source modules are implemented, but APK compilation and instrumented Compose tests remain unexecuted in this container due to missing JDK, Gradle, and Android SDK toolchains.
