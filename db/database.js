import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Database abstraction layer designed for clean portability to PostgreSQL.
 * Currently backed by better-sqlite3 with WAL mode and strict foreign keys.
 */
class DatabaseAdapter {
  constructor(dbPath) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  all(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  run(sql, params = []) {
    const info = this.db.prepare(sql).run(...params);
    return {
      lastInsertRowid: Number(info.lastInsertRowid),
      changes: info.changes
    };
  }

  transaction(fn) {
    const wrapped = this.db.transaction(fn);
    return (...args) => wrapped(...args);
  }

  close() {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }
}

export function createDatabase(customPath) {
  const targetPath = customPath || process.env.HMS_DB_PATH || path.join(process.cwd(), 'data', 'hms.db');
  try {
    const adapter = new DatabaseAdapter(targetPath);
    adapter.get('PRAGMA integrity_check');
    return adapter;
  } catch (err) {
    if (targetPath !== ':memory:' && (String(err).includes('malformed') || String(err).includes('corrupt') || String(err).includes('no such table') || String(err).includes('SQLITE_CORRUPT'))) {
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        if (fs.existsSync(targetPath + '-wal')) fs.unlinkSync(targetPath + '-wal');
        if (fs.existsSync(targetPath + '-shm')) fs.unlinkSync(targetPath + '-shm');
      } catch {}
      return new DatabaseAdapter(targetPath);
    }
    throw err;
  }
}

export default DatabaseAdapter;
