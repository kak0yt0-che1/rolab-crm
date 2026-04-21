const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/connection');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

// Generate random password
function generatePassword(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// GET /api/teachers
router.get('/', (req, res) => {
  const db = getDb();
  try {
    const { search, active } = req.query;
    let sql = "SELECT id, username, full_name, phone, plain_password, active, created_at FROM users WHERE role = 'teacher'";
    const params = [];

    if (active !== undefined) {
      sql += ' AND active = ?';
      params.push(Number(active));
    } else {
      sql += ' AND active = 1';
    }

    if (search) {
      sql += ' AND (full_name LIKE ? OR username LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY full_name';
    const teachers = db.prepare(sql).all(...params);

    // Attach companies for each teacher
    for (const t of teachers) {
      t.companies = db.prepare(`
        SELECT tr.*, c.name as company_name, c.type as company_type
        FROM teacher_rates tr
        JOIN companies c ON c.id = tr.company_id
        WHERE tr.teacher_id = ? AND c.active = 1
      `).all(t.id);
    }

    res.json(teachers);
  } finally {
    db.close();
  }
});

// GET /api/teachers/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  try {
    const teacher = db.prepare(
      "SELECT id, username, full_name, phone, plain_password, active, created_at FROM users WHERE id = ? AND role = 'teacher'"
    ).get(req.params.id);

    if (!teacher) {
      return res.status(404).json({ error: 'Педагог не найден' });
    }

    teacher.rates = db.prepare(`
      SELECT tr.*, c.name as company_name, c.type as company_type
      FROM teacher_rates tr
      JOIN companies c ON c.id = tr.company_id
      WHERE tr.teacher_id = ?
    `).all(req.params.id);

    res.json(teacher);
  } finally {
    db.close();
  }
});

// POST /api/teachers — auto-generates password
router.post('/', (req, res) => {
  const { username, full_name, phone, company_ids } = req.body;

  if (!username || !full_name) {
    return res.status(400).json({ error: 'Укажите логин и ФИО' });
  }

  const db = getDb();
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Логин уже занят' });
    }

    const plainPassword = generatePassword();
    const hash = bcrypt.hashSync(plainPassword, 10);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role, full_name, phone)
      VALUES (?, ?, ?, 'teacher', ?, ?)
    `);

    const insertRate = db.prepare(`
      INSERT INTO teacher_rates (teacher_id, company_id, rate) VALUES (?, ?, NULL)
    `);

    const transaction = db.transaction(() => {
      const result = insertUser.run(username, hash, plainPassword, full_name, phone || '');
      const teacherId = result.lastInsertRowid;

      if (company_ids && Array.isArray(company_ids)) {
        for (const cid of company_ids) {
          insertRate.run(teacherId, cid);
        }
      }

      return teacherId;
    });

    const teacherId = transaction();
    const teacher = db.prepare(
      'SELECT id, username, full_name, phone, plain_password, active, created_at FROM users WHERE id = ?'
    ).get(teacherId);

    res.status(201).json(teacher);
  } finally {
    db.close();
  }
});

// PUT /api/teachers/:id
router.put('/:id', (req, res) => {
  const { full_name, phone, password, active } = req.body;
  const db = getDb();
  try {
    const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'").get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Педагог не найден' });
    }

    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ error: 'Пароль минимум 4 символа' });
      }
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash = ?, plain_password = ? WHERE id = ?').run(hash, password, req.params.id);
    }

    db.prepare(`
      UPDATE users SET
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      full_name || null,
      phone !== undefined ? phone : null,
      active !== undefined ? active : null,
      req.params.id
    );

    const teacher = db.prepare(
      'SELECT id, username, full_name, phone, plain_password, active, created_at FROM users WHERE id = ?'
    ).get(req.params.id);

    res.json(teacher);
  } finally {
    db.close();
  }
});

// DELETE /api/teachers/:id (soft delete)
router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    db.prepare("UPDATE users SET active = 0 WHERE id = ? AND role = 'teacher'").run(req.params.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// GET /api/teachers/:id/rates
router.get('/:id/rates', (req, res) => {
  const db = getDb();
  try {
    const rates = db.prepare(`
      SELECT tr.*, c.name as company_name, c.type as company_type
      FROM teacher_rates tr
      JOIN companies c ON c.id = tr.company_id
      WHERE tr.teacher_id = ?
    `).all(req.params.id);
    res.json(rates);
  } finally {
    db.close();
  }
});

// PUT /api/teachers/:id/rates
router.put('/:id/rates', (req, res) => {
  const { rates } = req.body; // [{ company_id, rate }]
  if (!Array.isArray(rates)) {
    return res.status(400).json({ error: 'rates должен быть массивом' });
  }

  const db = getDb();
  try {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM teacher_rates WHERE teacher_id = ?').run(req.params.id);
      const stmt = db.prepare('INSERT INTO teacher_rates (teacher_id, company_id, rate) VALUES (?, ?, ?)');
      for (const r of rates) {
        stmt.run(req.params.id, r.company_id, r.rate || null);
      }
    });
    transaction();

    const updatedRates = db.prepare(`
      SELECT tr.*, c.name as company_name, c.type as company_type
      FROM teacher_rates tr
      JOIN companies c ON c.id = tr.company_id
      WHERE tr.teacher_id = ?
    `).all(req.params.id);

    res.json(updatedRates);
  } finally {
    db.close();
  }
});

module.exports = router;
