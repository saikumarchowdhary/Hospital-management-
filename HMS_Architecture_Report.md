# CareLine HMS — Project Architecture Report

## 1. System Overview
CareLine Hospital Management System (HMS) is a full-stack, enterprise-grade healthcare platform designed to streamline clinical care, administrative workflows, patient portals, inventory, billing, and compliance monitoring.

## 2. Frontend Architecture
- **Framework:** React SPA built with Vite and TypeScript.
- **Styling:** Tailwind CSS with utility-first responsive design.
- **UI Components & Icons:** Lucide React icons, Motion React (`motion/react`) for fluid animations, and Recharts for interactive analytics and data visualization.
- **State Management:** React Hooks (`useState`, `useMemo`, `useEffect`, `useRef`), multi-role RBAC switcher, and real-time client-side filtering.

## 3. Backend Architecture
- **Framework:** Node.js with Express (`server.js` and modular routers in `/routes`).
- **Middleware:** JSON body parsing, CORS, custom audit logging, and role-based authorization headers.
- **Real-Time Polling & SSE:** Live refresh polling daemon (30s interval) for compliance activity logs and automated system health checksums.

## 4. Database Architecture
- **Engine:** SQLite (`better-sqlite3` embedded database stored in `/data/hms.db`).
- **Schema:** Relational tables covering patients, doctors, nurses, appointments, beds, pharmacy inventory, billing ledger, audit logs, and search analytics.
- **Persistence:** Full CRUD operations across all core modules with transactional integrity.

## 5. Security & Authentication
- **Access Control:** Role-Based Access Control (RBAC) supporting Administrator, Doctor, Nurse, Patient, Accountant, and Pharmacist roles.
- **Audit Trails:** Chronological compliance logging capturing user action, timestamp, IP address, module, and granular Before/After state change diffs.
- **Data Protection:** Least-privilege role scoping, input sanitization, and secure environment configuration.
