import 'dotenv/config';
import { createDatabase } from '../db/database.js';
import { runMigrations } from '../db/migrations.js';
import { seedDemoData } from '../db/seed.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run seed:demo when NODE_ENV=production.');
  process.exit(1);
}

const db = createDatabase(process.env.HMS_DB_PATH);
try {
  runMigrations(db);
  seedDemoData(db);
  console.log('Demo seed completed (local/staging only).');
} finally {
  db.close();
}
