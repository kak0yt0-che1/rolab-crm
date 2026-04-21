const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let dbInstance = null;
let SQL = null;
let inTransaction = false;

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data/rolab.db');
const dbDir = path.dirname(dbPath);

async function initDb() {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(buffer);
  } else {
    dbInstance = new SQL.Database();
  }

  dbInstance.run('PRAGMA foreign_keys = ON');
  return dbInstance;
}

function getDbRaw() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

function saveDb() {
  if (dbInstance) {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function persistIfNotInTransaction() {
  if (!inTransaction) {
    saveDb();
  }
}

/**
 * Wrapper that mimics better-sqlite3 API on top of sql.js
 */
class DbWrapper {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new StmtWrapper(this.db, sql);
  }

  exec(sql) {
    this.db.run(sql);
    persistIfNotInTransaction();
  }

  close() {
    // No-op — singleton stays alive
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self.db.run('BEGIN TRANSACTION');
      inTransaction = true;
      try {
        const result = fn(...args);
        self.db.run('COMMIT');
        inTransaction = false;
        saveDb();
        return result;
      } catch (e) {
        inTransaction = false;
        try { self.db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      }
    };
  }

  pragma(str) {
    this.db.run(`PRAGMA ${str}`);
  }
}

class StmtWrapper {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    this.db.run(this.sql, params);
    const lastIdResult = this.db.exec('SELECT last_insert_rowid() as id');
    const changes = this.db.getRowsModified();
    persistIfNotInTransaction();
    return {
      lastInsertRowid: lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : 0,
      changes
    };
  }

  get(...params) {
    let stmt;
    try {
      stmt = this.db.prepare(this.sql);
      if (params.length > 0) stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        return row;
      }
      stmt.free();
      return undefined;
    } catch (e) {
      if (stmt) try { stmt.free(); } catch (_) {}
      console.error('SQL Error in get():', this.sql, params, e.message);
      return undefined;
    }
  }

  all(...params) {
    let stmt;
    try {
      const results = [];
      stmt = this.db.prepare(this.sql);
      if (params.length > 0) stmt.bind(params);
      while (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        results.push(row);
      }
      stmt.free();
      return results;
    } catch (e) {
      if (stmt) try { stmt.free(); } catch (_) {}
      console.error('SQL Error in all():', this.sql, params, e.message);
      return [];
    }
  }
}

function getDb() {
  return new DbWrapper(getDbRaw());
}

module.exports = { initDb, getDb, saveDb };
