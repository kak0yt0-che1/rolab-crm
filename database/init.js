const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initDb, getDb, saveDb } = require('./connection');

async function initialize() {
  await initDb();
  const db = getDb();

  // ============================================================
  // CREATE TABLES
  // ============================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plain_password TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'dev')),
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('school', 'kindergarten')),
      address TEXT DEFAULT '',
      contact_person TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS teacher_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      rate INTEGER,
      UNIQUE(teacher_id, company_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
      time_start TEXT NOT NULL,
      time_end TEXT NOT NULL,
      group_name TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_slot_id INTEGER NOT NULL REFERENCES schedule_slots(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      actual_teacher_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'completed', 'cancelled')),
      children_count INTEGER DEFAULT 0,
      price INTEGER DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(schedule_slot_id, date)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS substitutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      original_teacher_id INTEGER NOT NULL REFERENCES users(id),
      substitute_teacher_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(actual_teacher_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_schedule_teacher ON schedule_slots(teacher_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_schedule_company ON schedule_slots(company_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_schedule_day ON schedule_slots(day_of_week);');

  // ============================================================
  // SEED DEFAULT USERS (2 Admins + 1 Dev)
  // ============================================================

  const seedUser = (username, password, role, fullName) => {
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!exists) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(
        "INSERT INTO users (username, password_hash, plain_password, role, full_name, phone) VALUES (?, ?, ?, ?, ?, '')"
      ).run(username, hash, password, role, fullName);
      console.log(`✅ Создан ${role}: ${username} / ${password}`);
    }
  };

  seedUser('admin1', 'admin123', 'admin', 'Администратор 1');
  seedUser('admin2', 'admin123', 'admin', 'Администратор 2');
  seedUser('dev', 'dev123', 'dev', 'Разработчик');

  saveDb();
  console.log('✅ База данных инициализирована');
}

// Allow running directly
if (require.main === module) {
  initialize().catch(console.error);
}

module.exports = initialize;
