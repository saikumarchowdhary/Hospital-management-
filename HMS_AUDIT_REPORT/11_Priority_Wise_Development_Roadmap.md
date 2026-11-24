# 11 — Priority-Wise Development Roadmap (Final Completion Phase)

**Source Analysis Basis:** `src/App.tsx` (React/Vite SPA), `server.js`, `routes/*.js`, `db/schema*.js`, and `HMS_Final_100_Percent_Completion_Audit.md`.

---

## 1. Absent & Incomplete Modules in `src/App.tsx` vs. Required HMS Modules

| Module | Presence in `src/App.tsx` | Backend & DB Status | Priority |
|---|---|---|---|
| **Authentication & Session Security** | **Absent** (Role `<select>` dropdown only) | Implemented (`routes/auth.js`, `middleware/auth.js`) | Priority 1 |
| **Patients & Receptionist Front Office** | **Broken / Non-rendered** (`patients` tab renders blank; unused `filteredPatients` state) | Implemented (`routes/patients.js`, `appointments`) | Priority 1 |
| **Appointments & Calendar Grid** | **Broken / Non-rendered** (`appointments` tab renders blank; unused `calendarViewMode` state) | Implemented (`routes/appointments.js`, `appointment_slots`) | Priority 1 |
| **Doctor Consultation & Clinical Care** | **Entirely Absent** | Implemented (`routes/clinical.js`, `consultations`, `diagnoses`, `prescriptions`) | Priority 1 |
| **Nurse Portal (Vitals, MAR, Handover)** | **Entirely Absent** | Implemented (`routes/nursing.js`, `patient_vitals`, `nursing_tasks`) | Priority 1 |
| **Laboratory Management** | **Entirely Absent** (Generic fallback card on `pharmacy` label) | Implemented (`routes/laboratory.js`, `lab_orders`, `lab_results`) | Priority 1 |
| **Pharmacy Dispensing & Inventory** | **Placeholder Fallback Card Only** | Implemented (`routes/pharmacy.js`, `medicines`, `medicine_batches`) | Priority 1 |
| **Billing, Invoicing & Payment Webhooks** | **Placeholder Fallback Card Only** | Simulated (`routes/billing.js`, `services/billing.js`; live webhook missing) | Priority 1 |
| **Admissions & Bed Map + Transfer** | **UI-Only Local State** (Disconnected from `/api/beds` & `/api/admissions`) | Partial (`routes/admissions.js` lacks dedicated `/transfer` transaction endpoint) | Priority 1 |
| **Real-Time Multi-User Sync (WebSocket/SSE)** | **Absent** (Local `setInterval` only) | SSE exists (`services/events.js`); WebSocket server missing | Priority 1 |
| **Radiology Management** | **Entirely Absent** | Implemented (`routes/radiology.js`, `radiology_orders`, `radiology_reports`) | Priority 2 |
| **Blood Bank Management** | **Entirely Absent** | Implemented (`routes/bloodbank.js`, `blood_donors`, `blood_inventory`, `blood_issues`) | Priority 2 |
| **Insurance & TPA Desk** | **Entirely Absent** | Simulated (`routes/insurance.js`, `insurance_policies`, `insurance_claims`) | Priority 2 |
| **Native Android Application (Kotlin/Compose)** | **Entirely Absent** (0% — no `/android` directory) | APIs ready (`/api/*`) | Priority 2 |
| **HR, Payroll & Recruitment ATS** | **Entirely Absent** | Implemented (`routes/hr.js`, `employee_profiles`, `payroll`, `job_vacancies`) | Priority 3 |
| **Publisher & Approver (Notices/Campaigns)** | **Entirely Absent** | Implemented (`routes/publisher.js`, `routes/campaigns.js`) | Priority 3 |
| **External Coordination & Housekeeping** | **Entirely Absent** | Implemented (`routes/external.js`, `routes/housekeeping.js`) | Priority 3 |
| **Admin Control Center (Users/Roles/Settings)** | **Placeholder Cards Only** (`security`, `roles`, `general` sub-tabs) | Implemented (`routes/admin.js`, `routes/admin_members.js`, `routes/admin_signups.js`) | Priority 3 |
| **Live External Integrations (SMS/Email/WhatsApp/PACS/FHIR/Maps)** | **Entirely Absent** | `NOT CONFIGURED` (requires vendor credentials & sandbox adapters) | Priority 4 |

---

## 2. Priority-Wise Execution Roadmap

### Priority 1 — Critical Infrastructure, Core Clinical Modules & Test Fixes
1. Fix `staff_signup_requests` missing `phone` column in `db/migrations.js`.
2. Implement real transactional `POST /api/admissions/transfer` in `services/admissions.js` + `routes/admissions.js` with occupied/invalid/concurrency rollback protection.
3. Add WebSocket multi-user server (`services/websocket.js`) integrated with `EventBroker` and `server.js`.
4. Add HMAC-verified Payment Webhook handler (`POST /api/integrations/webhooks/payment`) and sandbox SMS/Email/WhatsApp integration service (`services/integrations.js`, `routes/integrations.js`).
5. Connect `src/App.tsx` to live `/api/*` endpoints + WebSocket stream, add Auth login/register flow, and build real interactive views for Patients/Reception, Appointments Calendar, Doctor Consultations, Nurse Vitals, Laboratory, Pharmacy, Billing, and persistent Activity Logs.

### Priority 2 — Diagnostics, Blood Bank, Insurance & Native Android
1. Build React modules for Radiology, Blood Bank, Insurance/TPA, and live `search_analytics` DB persistence.
2. Scaffold native Android application under `/android` using Kotlin, Jetpack Compose, MVVM, Hilt, and Retrofit connected to `/api/*`.

### Priority 3 — Operations, HR, Communications & Admin Matrix
1. Build React views for HR/Payroll/Recruitment, Publisher/Campaigns, External Coordination (7-step lifecycle), Housekeeping, and Admin User/Role/Permission matrix.

### Priority 4 — Production Vendor Integrations & Hardening
1. Configure live Stripe/Adyen, Twilio SMS/WhatsApp, SendGrid/SES, PACS/DICOM, HL7/FHIR, and Maps API credentials in production secrets, and run load/security audits.
