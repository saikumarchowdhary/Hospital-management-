# 09 — Missing & Disconnected Features List (Priority-Wise Roadmap)

**Cross-Comparison Basis:** Direct source inspection of `src/App.tsx` (React/Vite SPA) vs. the **Hospital Management Functional Detailed Document**, cross-referenced against existing backend routes (`server.js`, `routes/*.js`), database tables (`db/schema*.js`), and legacy Vanilla JS pages (`public/js/pages/*.js`).

---

## Executive Summary of Findings in `src/App.tsx`

In `src/App.tsx` (1,476 lines), **only 3 tabs actually render interactive UI**, and all 3 operate purely on **in-memory local React state** with **0 backend API calls**:
1. `dashboard`: Hardcoded KPIs + 3 Recharts visualizations (`PieChart`, `BarChart`, `ComposedChart`).
2. `beds`: Hardcoded 10-bed map, edit modal, formal transfer verification modal, and 7-day occupancy `LineChart`.
3. `settings` (`logs` sub-tab): In-memory `activityLogs` table with date-range filtering, summary counts, Before/After diffs, 30s simulated daemon polling, auto-scroll, CSV export, and print.

Meanwhile:
- **`patients` and `appointments` tabs** are listed in `navigationItems` and have unused state (`patients`, `filteredPatients`, `calendarViewMode`), yet have **no rendered JSX block** in `src/App.tsx` (clicking them displays a blank page).
- **`doctors`, `pharmacy`, `billing`, and `analytics` tabs** render a generic static fallback card (`"This module is fully integrated..."`) with no real UI.
- **10+ entire hospital modules** required by the Functional Detailed Document are **completely absent** from `src/App.tsx` (though most have backend routes/schemas already implemented in `routes/` and `db/`).

---

## PRIORITY 1 — Critical Missing Functionality & Verified Defects (Core Clinical, Auth & Frontend-Backend Wiring)

### 1.0 Verified Backend Defect — `staff_signup_requests` Schema Mismatch & Failing Registration Tests
- **What is Failing:** Running `npm test` yields **13 pass / 3 fail** out of 16 tests (`tests/auth.test.js:26`, `tests/members_realtime.test.js:54`, `tests/members_realtime.test.js:167`), with SQLite error: `table staff_signup_requests has no column named phone`.
- **Root Cause:** `db/schema.js` (line 159) creates `staff_signup_requests` with column `mobile TEXT NOT NULL`, whereas `db/migrations.js` (line 62) attempts `CREATE TABLE IF NOT EXISTS staff_signup_requests (... phone TEXT ...)` without adding `phone` via `ensureCol`.
- **Files Needing Work:** `db/schema.js`, `db/migrations.js`, `routes/registration_helpers.js`.

### 1.1 Authentication, Session Management & Password Recovery (React)
- **What is Missing:** Login screen, Patient/Staff registration forms, Forgot Password / OTP verification UI, JWT/cookie session hydration, and CSRF header (`X-Requested-With: MediCore-HMS`) integration. Currently `src/App.tsx` uses a `<select>` role switcher dropdown.
- **Why Required:** Without real authentication, HIPAA/DPDP patient isolation and RBAC cannot be enforced.
- **Module:** Authentication & Security (`middleware/auth.js`, `routes/auth.js`).
- **Status:** React Frontend: `MISSING` | Backend/API/DB: `IMPLEMENTED` (OTP/Email `MOCKED`).
- **Files Needing Work:** Create `src/context/AuthContext.tsx`, `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`; update `src/App.tsx`.

### 1.2 Patients & Front-Office Receptionist Module (React)
- **What is Missing:** Clicking `Patients` renders nothing because no JSX block exists for `activeTab === 'patients'`. Also missing: patient registration modal, OPD check-in/check-out, token queue management, and admission initiation.
- **Why Required:** Core front-office workflow; `filteredPatients` state exists in `src/App.tsx` (line 327) but is never rendered.
- **Module:** Patient & Front-Office Management.
- **Status:** React Frontend: `MISSING JSX` | Backend/API/DB: `IMPLEMENTED` (`routes/patients.js`, `patient_profiles`).
- **Files Needing Work:** `src/pages/PatientsPage.tsx`, `src/pages/ReceptionistPage.tsx`, `src/App.tsx`.

### 1.3 Appointments & Calendar View Module (React)
- **What is Missing:** `calendarViewMode` state (`'grid' | 'list'`) exists at line 75 of `src/App.tsx`, but **zero JSX** exists for `activeTab === 'appointments'`. Missing doctor search, slot picker, booking confirmation, rescheduling, and cancellation.
- **Why Required:** Primary entry point for outpatient consultations.
- **Module:** Appointment Management.
- **Status:** React Frontend: `MISSING JSX` | Backend/API/DB: `IMPLEMENTED` (`routes/appointments.js`, `appointments`, `appointment_slots`).
- **Files Needing Work:** `src/pages/AppointmentsPage.tsx`, `src/App.tsx`.

### 1.4 Doctor Consultation & Clinical Care Portal (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing consultation workspace, chief complaint, ICD-10 diagnosis entry, treatment plans, e-prescription builder, lab/radiology order forms, clinical notes, and follow-up scheduling.
- **Why Required:** Core physician clinical workflow.
- **Module:** Doctor Portal / Clinical Care.
- **Status:** React Frontend: `MISSING` | Backend/API/DB: `IMPLEMENTED` (`routes/clinical.js`, `routes/clinical_extras.js`, `consultations`, `diagnoses`, `prescriptions`).
- **Files Needing Work:** `src/pages/DoctorConsultPage.tsx`, `src/pages/DoctorsDirectoryPage.tsx`.

### 1.5 Nurse Portal & Inpatient Care Workflows (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing vital signs recording (BP, pulse, temp, SpO2, RR), Medication Administration Records (MAR), nursing care plans, task checklists, and shift handover notes.
- **Why Required:** Required for inpatient ward safety and nursing operations.
- **Module:** Nurse Portal.
- **Status:** React Frontend: `MISSING` | Backend/API/DB: `IMPLEMENTED` (`routes/nursing.js`, `patient_vitals`, `nursing_tasks`, `nursing_notes`).
- **Files Needing Work:** `src/pages/NursePortalPage.tsx`.

### 1.6 Laboratory Management Module (React + Lab Inventory/Analyzer)
- **What is Missing:** Completely absent from `src/App.tsx` (merged only as a label `"Pharmacy & Lab"` leading to a fallback card). Missing test catalogue, sample collection & specimen barcoding, test processing, result entry/verification, PDF report release, lab reagent inventory, and analyzer integration.
- **Why Required:** Diagnostic lab orders and reports are mandatory clinical workflows.
- **Module:** Laboratory Management.
- **Status:** React Frontend: `MISSING` | Backend/API/DB: `IMPLEMENTED` (`routes/laboratory.js`, `lab_tests`, `lab_orders`, `lab_specimens`, `lab_results`), except Lab Inventory & Analyzer (`MISSING / NOT CONFIGURED`).
- **Files Needing Work:** `src/pages/LaboratoryPage.tsx`, `db/schema_part3.js` (lab inventory), `routes/laboratory.js`.

### 1.7 Pharmacy Management Module (React)
- **What is Missing:** `activeTab === 'pharmacy'` renders only a generic fallback card in `src/App.tsx`. Missing medicine catalogue, batch/FEFO expiry tracking, prescription queue dispensing, stock movements, refill approvals, and low-stock alerts.
- **Why Required:** Medication safety and inventory control.
- **Module:** Pharmacy Management.
- **Status:** React Frontend: `MISSING` | Backend/API/DB: `IMPLEMENTED` (`routes/pharmacy.js`, `services/pharmacy.js`, `medicines`, `medicine_batches`, `dispensing_records`).
- **Files Needing Work:** `src/pages/PharmacyPage.tsx`.

### 1.8 Billing, Invoicing & Live Payment Gateway (React + Gateway)
- **What is Missing:** `activeTab === 'billing'` renders only a fallback card in `src/App.tsx`. Missing invoice builder, payment processing, receipt downloads, refunds, tax/discount breakdown, and live payment gateway/webhook verification (currently `is_simulated = 1` in `services/billing.js`).
- **Why Required:** Hospital revenue cycle and patient billing transparency.
- **Module:** Billing & Finance.
- **Status:** React Frontend: `MISSING` | Backend/API/DB: `IMPLEMENTED (Simulated)` | Live Gateway: `NOT CONFIGURED`.
- **Files Needing Work:** `src/pages/BillingPage.tsx`, `services/billing.js`, `routes/billing.js`.

### 1.9 Frontend-to-Backend API & Real-Time SSE Connectivity (React)
- **What is Missing:** `src/App.tsx` is 100% disconnected from `server.js` (no API client, no Vite `/api` proxy in `vite.config.ts`, no SSE subscription to `/api/events/stream`). Admissions, Beds, Activity Logs, and Dashboard charts all use hardcoded arrays.
- **Why Required:** Without API persistence and SSE broadcast, multi-user synchronization and SQLite persistence do not work in the React UI.
- **Module:** Cross-Cutting Infrastructure.
- **Status:** React Frontend: `DISCONNECTED` | Backend/SSE: `IMPLEMENTED` (`services/events.js`).
- **Files Needing Work:** `src/lib/api.ts`, `src/lib/sse.ts`, `vite.config.ts` (add `/api` proxy to port 3000), `server.js` (serve `dist/` or configure dev integration), `src/App.tsx`.

---

## PRIORITY 2 — Important Missing Functionality (Diagnostics, Blood Bank, Insurance, Mobile)

### 2.1 Radiology Management Module (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing imaging order queue (X-Ray, CT, MRI, Ultrasound), modality scheduling, radiologist findings & impression reporting, and scan attachment retrieval.
- **Module:** Radiology Management (`routes/radiology.js`, `radiology_orders`, `radiology_reports`).
- **Files Needing Work:** `src/pages/RadiologyPage.tsx`.

### 2.2 Blood Bank Management Module (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing blood donor registration, blood group stock levels (`A+`, `O-`, etc.), bag expiry tracking, cross-matching verification, and blood issue/transfusion records.
- **Module:** Blood Bank Management (`routes/bloodbank.js`, `blood_donors`, `blood_inventory`, `blood_requests`, `blood_issues`).
- **Files Needing Work:** `src/pages/BloodBankPage.tsx`.

### 2.3 Insurance & TPA Desk (React + Clearinghouse)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing patient policy registration, eligibility checks, pre-authorization submission, claim tracking, and settlement recording. Backend `insurance_providers` currently uses `is_simulated = 1`.
- **Module:** Insurance & TPA (`routes/insurance.js`, `insurance_policies`, `insurance_cases`, `pre_authorizations`, `insurance_claims`).
- **Files Needing Work:** `src/pages/InsurancePage.tsx`, `routes/insurance.js`.

### 2.4 Patient Portal Health Wallet, Discharge Summaries & Emergency SOS (React)
- **What is Missing:** When `userRole === 'Patient'`, `src/App.tsx` shows admin-style KPIs and empty `My Visits` / `My Payments` tabs. Missing downloadable prescriptions, lab/radiology reports, emergency SOS button, and inpatient discharge checklist/summary UI.
- **Module:** Patient Portal & Discharge Management (`routes/patients.js`, `routes/admissions.js`, `discharge_records`, `emergency_requests`).
- **Files Needing Work:** `src/pages/PatientPortalPage.tsx`, `src/pages/DischargeModal.tsx`.

### 2.5 Persistent Search Analytics & Live Reports Engine (React + DB)
- **What is Missing:** `activeTab === 'analytics'` renders a fallback card. Dashboard `searchInsightsTrendData` and `topSearchesBarData` are hardcoded constants, and no `search_analytics` table exists in SQLite (`db/schema*.js`).
- **Module:** Reports & Analytics (`routes/reports.js`, `services/reports.js`).
- **Files Needing Work:** Add `search_analytics` table in `db/migrations.js`, add endpoint in `routes/reports.js`, build `src/pages/ReportsPage.tsx`.

### 2.6 Native Android Application (Kotlin + Jetpack Compose)
- **What is Missing:** **100% MISSING.** No `/android` directory, Gradle project, Kotlin code, Jetpack Compose UI, Hilt DI, or Retrofit client exists in the repository.
- **Module:** Native Mobile Platform.
- **Files Needing Work:** Full `/android` project scaffold consuming `/api/*`.

---

## PRIORITY 3 — Remaining Functional Requirements (Operations, HR, Communications, Admin)

### 3.1 HR, Attendance, Payroll & Recruitment ATS (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing employee directory, attendance & shift scheduling, leave approvals, payroll processing & payslip generation, job vacancy publishing, candidate portal, resume uploads, and interview feedback/offer tracking.
- **Module:** HR & Recruitment (`routes/hr.js`, `employee_profiles`, `employee_attendance`, `leave_requests`, `payroll`, `payslips`, `job_vacancies`, `job_applications`, `interviews`).
- **Files Needing Work:** `src/pages/HrPage.tsx`, `src/pages/CandidateCareersPage.tsx`.

### 3.2 Publisher & Approver Module — Notices & Campaigns (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing hospital announcement creation, approval/rejection queue, audience targeting, expiry management, acknowledgement tracking, and promotional campaign analytics.
- **Module:** Publisher & Approver (`routes/publisher.js`, `routes/campaigns.js`, `announcements`, `campaigns`).
- **Files Needing Work:** `src/pages/PublisherPage.tsx`, `src/pages/CampaignsPage.tsx`.

### 3.3 External Coordination & Housekeeping Module (React)
- **What is Missing:** Completely absent from `src/App.tsx`. Missing external provider directory, availability verification, full 7-step external request lifecycle (`Draft → Submitted → Approval Pending → Provider Processing → Confirmed → Fulfilled → Closed` + Escalated/Delayed/Rejected/Cancelled), purchase orders/goods receipts, and housekeeping room inspection tasks.
- **Module:** External Coordination & Housekeeping (`routes/external.js`, `routes/housekeeping.js`).
- **Files Needing Work:** `src/pages/ExternalCoordinationPage.tsx`, `src/pages/HousekeepingPage.tsx`.

### 3.4 Complete Admin Control Center Sub-Tabs (React)
- **What is Missing:** `Settings` sub-tabs (`security`, `roles`, `general`) in `src/App.tsx` are static text cards. Missing user/member management, staff signup approval queue (`staff_signup_requests`), dynamic role-permission matrix editor, department/branch CRUD, and hospital tax/hotline configuration.
- **Module:** Administration (`routes/admin.js`, `routes/admin_members.js`, `routes/admin_signups.js`).
- **Files Needing Work:** `src/pages/AdminControlPage.tsx`, `src/App.tsx`.

---

## PRIORITY 4 — Enhancements & Optional External Integrations

### 4.1 SMS, Email & WhatsApp Notification Gateways (`NOT CONFIGURED`)
- **What is Missing:** Real provider adapters (Twilio SMS/WhatsApp, AWS SES / SendGrid Email) for OTP, appointment reminders, and critical lab/pharmacy alerts.

### 4.2 PACS / DICOM Medical Imaging & Lab Analyzer Drivers (`NOT CONFIGURED`)
- **What is Missing:** DICOMweb / Cornerstone.js viewer for radiology images and HL7/ASTM LIS interface for automated laboratory analyzers.

### 4.3 National Health Standards & Dispatch (`NOT CONFIGURED`)
- **What is Missing:** ABDM health ID integration, HL7/FHIR R4 interoperability bundles, and Google Maps / live GPS ambulance fleet dispatch tracking.
