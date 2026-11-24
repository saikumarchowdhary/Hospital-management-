# CareLine HMS — Database Completion Report

## 1. Database Technology
- Embedded SQLite database (`better-sqlite3`) with persistent storage at `/data/hms.db`.

## 2. Schema & Tables
- `patients` — Patient demographics, admission status, ward assignment, and attending physician.
- `doctors` — Doctor credentials, department, specialty, and availability status.
- `beds` — Ward room, bed type, occupancy status, and assigned patient.
- `appointments` — Consultation schedules, timestamps, and visit notes.
- `activity_logs` — Compliance audit trail with user actions, timestamps, and JSON-serialized Before/After state diffs.
- `search_analytics` — Query counts and search term frequency tracking.

## 3. Completion Percentage
- **Database Completion:** **95%**
