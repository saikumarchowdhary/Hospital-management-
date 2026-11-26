# CareLine HMS – MASTER PROMPT (Pending Work Only)

## ROLE
You are a senior full-stack engineer working inside this existing project. Complete ONLY the pending work listed below so the system fully meets "Hospital Management Functional Detailed Document". Do not rebuild anything that already works. Extend the current code.

## CURRENT STATE (already done, do not redo)
- Backend ~85% (154 endpoints, 103 tables) | React web ~68% | Android ~35% (never built) | Overall end-to-end ~66%
- Working: auth + roles + signup approvals, doctors + slots + appointments, patients, beds/admissions/transfer, pharmacy inventory (batches, expiry, low stock, adjust stock, refill approval), lab + radiology orders, billing/ledger/payments (sandbox), HR/careers, notices (publisher), housekeeping, reports dashboard, audit logs.

## STACK (keep)
Node.js + Express, SQLite (better-sqlite3, `ensureCol` migrations), React 19 + Vite + Tailwind (`src/`, API via `src/lib/api.ts`), legacy JS in `public/js/pages/`, Android Kotlin + Compose (`android/`). Tests: `node --test tests/*.test.js`.

## GLOBAL RULES
1. Work strictly in the order of the phases below. Finish a phase completely (code + tests + lint + build) before starting the next.
2. After every task run `npm test`, `npm run lint`, `npm run build`. Never leave a red test.
3. Never delete tables/columns. Never break existing features. Add migrations with `ensureCol`.
4. Every new endpoint: JWT auth, role/permission check, input validation, audit log, and tests (success, validation error, forbidden).
5. Every React screen uses real APIs only: no hardcoded or mock data. Add loading, empty and error states. Mobile responsive.
6. Money, booking and external requests must be idempotent (duplicate click, retry or duplicate webhook must not create duplicates).
7. Security: never store raw card data; patients see only their own data; staff scoped by role and branch; secrets only in `.env`; no account-existence leaks.
8. If a provider key is missing, run in clearly labelled Sandbox mode and show "Not configured". Never present stale or unconfirmed external data as live.
9. After each phase print: files changed, tests run with result, and what is still pending.

---

## PHASE 0 – CLEANUP (do first, 30 min)
- Make all tests pass. Fix `tests/auth.test.js:26` and `tests/members_realtime.test.js:54` to expect 403 for public admin/doctor signup (current security behaviour).
- Remove `data/secret.key`, `data/hms.db*` from the project; create at first run; add to `.gitignore`.
- Delete `public/assets/aistudio/`.
- Complete `.env.example` (JWT, payment, SMS, email, WhatsApp, maps, ambulance, ABDM, FHIR keys).

## PHASE 1 – MVP (target: Phase 1 = 100%)
1. **Real OTP (4.2):** SMS/email provider adapters (Twilio/MSG91, SMTP/SendGrid) + sandbox fallback. Expiry 5 min, max 5 attempts, resend cooldown 60 s, reused/expired OTP rejected and logged. Remove hardcoded demo OTP outside sandbox mode. Forgot-password returns the same message whether account exists or not; reset invalidates old sessions.
2. **Slot hold during payment (4.4):** `slot_holds` table, hold 5–10 min, auto-expire job, unique constraint + transaction so a slot can never be double-booked. Pending-payment status, late-callback handling, receipt, .ics calendar download. Reschedule/cancel with configurable policy windows.
3. **Records and health wallet (4.5):** secure PDF download for prescriptions, lab, radiology, discharge summary; log every view and download; "Pending review" label for unreviewed results; allergy, chronic condition, family history; patient document upload.
4. **Payments (4.6):** gateway adapter (Razorpay) with order create, signature verification, HMAC idempotent webhook, refund, reconciliation job, promo code with eligibility/expiry, PDF receipt and statement. Paid amount can never exceed outstanding.
5. **Patient refill screen (4.8):** React (and Android later) screen: view prescriptions + dosage, request refill, see status Submitted / Pending / Approved / Rejected, allergy alert. Patient cannot edit dosage.
6. **Finance (5.7):** income/expense statements, authorised adjustments with audit, cashier reconciliation, React screens.

**Phase 1 exit check:** end-to-end test passes: register → verify OTP → book → pay → receipt → view record PDF → request refill → pharmacist approves.

## PHASE 2 – ENGAGEMENT AND SAFETY
1. **Lab booking (4.7):** test + package catalogue, price, hospital/home collection, slot availability, pay, order tracking, "report ready" notification, report appears in Records.
2. **Emergency (4.9):** always-visible SOS button (never hidden by promotions), emergency-call fallback number, location permission or manual address, callback number, request reference, dispatch queue for case manager, status only when dispatch confirms, immediate fallback text on failure.
3. **Blood bank (5.6):** React screens for stock by group/component/expiry, donors with screening status, reservation, authorised issue, external blood request, near-expiry and stockout alerts.
4. **Security (8.3):** staff/admin MFA (TOTP), account lockout, session timeout, device list with "log out other devices", biometric sign-in (Android), helmet, rate limiting, CSRF, encryption of sensitive fields at rest, backup/restore script.
5. **Careers (6.1) and Notices (6.2) polish:** interview scheduling + feedback, status history, closed/expired vacancies reject applications; notice audience targeting, approval for critical notices, delivery/view/acknowledgement report with export, expired notices hidden.
6. **Reports (8.2):** PDF export besides CSV, data freshness label, export log, exported data equals displayed data.
7. **Android app (35% → complete):** Compose screens for login/OTP/biometric, home, doctors, booking + payment, records, lab, pharmacy + refills, bills, SOS, notifications, family profiles. Dependency injection, error handling, dark mode. Build with `./gradlew assembleDebug`; if it cannot build here, give exact commands and say clearly it is untested.
8. **Family/dependent profiles (4.5):** `family_members` table, profile switch in web and Android.
9. **Feedback and ratings, telemedicine (link-based visit type), push notifications (FCM adapter).**

**Phase 2 exit check:** tests green; Android debug build attempted and result reported.

## PHASE 3 – SCALE AND EXTERNAL COORDINATION
Shared request lifecycle for all external modules: Draft → Submitted → Approval pending → Provider processing → Confirmed → Fulfilled → Closed; exceptions Rejected, Unavailable, Delayed, Cancelled, Escalated. Every request has unique ID, requester, category, priority, timestamps, status, audit.

1. **7.1 External dashboard:** open / awaiting approval / confirmed / exception counts; filters by branch, category, provider, owner, priority, status; visible failed-integration queue with manual follow-up.
2. **7.2 Supplier and purchase:** supplier catalogue, price, lead time, comparison, purchase request, budget approval, purchase order, goods receipt with quality check, discrepancy record, return/warranty, invoice matching, supplier performance history. PO cannot be submitted without approval.
3. **7.5 Manpower / staffing agency (NEW module, nothing exists):** staffing request, approved agency directory, quotes, credential verification, approval, roster, attendance, replacement, timesheet, agency invoice reconciliation. No clinical deployment before credential check and approval.
4. **7.6 Centralized availability:** check internal stock/roster first, then providers (API/webhook or manual), show source, timestamp, quantity, confirmation, stale warning; submit and track; update stock/roster/claim records.
5. **7.4 + 5.7 Insurance/TPA and payroll:** policy and eligibility check, pre-auth with documents, query owner, resubmit, final claim, settlement timeline, billing update. Payroll: salary components, attendance, adjustments, payslip PDF, restricted to authorised roles; clinical and financial permissions separated.
6. **6.3 Campaigns:** React screens for create, approve, schedule, auto-stop at expiry, labelled "Sponsored" in patient app, privacy-safe analytics (impressions, clicks, enquiries, bookings), no health-data targeting.
7. **8.4 Integrations:** adapter per provider with secure credentials, idempotent updates, safe retry, monitoring screen (status, latency, freshness). Real adapters for payment and SMS/email/WhatsApp; ABDM and HL7/FHIR (Patient, Appointment, Observation, MedicationRequest); analyzer/PACS adapter; insurer/TPA adapter. Sandbox mode when keys are missing.

**Phase 3 exit check:** tests green; every integration shows Real or Sandbox status on the monitoring screen.

## FINAL TESTING (after Phase 3)
- Special tests: concurrent double booking, duplicate payment webhook, bed overlap, stock cannot go negative, patient cannot read another patient's data, branch scope, expired OTP, expired vacancy, expired notice, expired campaign, PO without approval, clinical deployment without credential check.
- Playwright end-to-end for each role: patient, doctor, pharmacist, lab, case manager, accountant, HR, admin.

## FINAL REPORT (required)
Create `HMS_Final_Verification_Report.md` with:
1. Table of every requirement (PDF sections 4.1 – 8.4): status Done / Partial / Missing + evidence (file path and test name).
2. Real output of `npm test`, `npm run lint`, `npm run build`.
3. List of features still in Sandbox/mock mode.
4. List of anything not done and why.
5. Completion % = (Done×1 + Partial×0.5) ÷ total requirements. Do not round up and do not claim 100% unless every item is proven.

## START
Begin with Phase 0, report results, then continue phase by phase. Do not skip ahead.
