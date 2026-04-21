const express = require('express');
const { getDb } = require('../database/connection');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

// GET /api/companies
router.get('/', (req, res) => {
  const db = getDb();
  try {
    const { type, search, active } = req.query;
    let sql = 'SELECT * FROM companies WHERE 1=1';
    const params = [];

    if (active !== undefined) {
      sql += ' AND active = ?';
      params.push(Number(active));
    } else {
      sql += ' AND active = 1';
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY name';
    const companies = db.prepare(sql).all(...params);
    res.json(companies);
  } finally {
    db.close();
  }
});

// GET /api/companies/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    res.json(company);
  } finally {
    db.close();
  }
});

// POST /api/companies
router.post('/', (req, res) => {
  const { name, type, address, contact_person, phone } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Укажите название и тип компании' });
  }

  if (!['school', 'kindergarten'].includes(type)) {
    return res.status(400).json({ error: 'Тип: school или kindergarten' });
  }

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO companies (name, type, address, contact_person, phone)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, type, address || '', contact_person || '', phone || '');

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(company);
  } finally {
    db.close();
  }
});

// PUT /api/companies/:id
router.put('/:id', (req, res) => {
  const { name, type, address, contact_person, phone, active } = req.body;
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }

    db.prepare(`
      UPDATE companies SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        address = COALESCE(?, address),
        contact_person = COALESCE(?, contact_person),
        phone = COALESCE(?, phone),
        active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      name || null, type || null, address !== undefined ? address : null,
      contact_person !== undefined ? contact_person : null,
      phone !== undefined ? phone : null,
      active !== undefined ? active : null,
      req.params.id
    );

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    res.json(company);
  } finally {
    db.close();
  }
});

// DELETE /api/companies/:id (soft delete)
router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    db.prepare('UPDATE companies SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

module.exports = router;
