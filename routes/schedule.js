const express = require('express');
const { getDb } = require('../database/connection');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/schedule
router.get('/', (req, res) => {
  const db = getDb();
  try {
    const { teacher_id, company_id, day_of_week } = req.query;
    let sql = `
      SELECT ss.*, u.full_name as teacher_name, c.name as company_name, c.type as company_type
      FROM schedule_slots ss
      JOIN users u ON u.id = ss.teacher_id
      JOIN companies c ON c.id = ss.company_id
      WHERE ss.active = 1
    `;
    const params = [];

    // Teachers can only see their own schedule
    if (req.user.role === 'teacher') {
      sql += ' AND ss.teacher_id = ?';
      params.push(req.user.id);
    } else if (teacher_id) {
      sql += ' AND ss.teacher_id = ?';
      params.push(teacher_id);
    }

    if (company_id) {
      sql += ' AND ss.company_id = ?';
      params.push(company_id);
    }

    if (day_of_week) {
      sql += ' AND ss.day_of_week = ?';
      params.push(day_of_week);
    }

    sql += ' ORDER BY ss.day_of_week, ss.time_start';
    const slots = db.prepare(sql).all(...params);
    res.json(slots);
  } finally {
    db.close();
  }
});

// POST /api/schedule  (admin only)
router.post('/', adminOnly, (req, res) => {
  const { teacher_id, company_id, day_of_week, time_start, time_end, group_name } = req.body;

  if (!teacher_id || !company_id || !day_of_week || !time_start || !time_end) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }

  if (day_of_week < 1 || day_of_week > 7) {
    return res.status(400).json({ error: 'День недели: от 1 (Пн) до 7 (Вс)' });
  }

  const db = getDb();
  try {
    // Check teacher exists
    const teacher = db.prepare('SELECT id FROM users WHERE id = ? AND role = \'teacher\' AND active = 1').get(teacher_id);
    if (!teacher) {
      return res.status(400).json({ error: 'Педагог не найден' });
    }

    // Check company exists
    const company = db.prepare('SELECT id FROM companies WHERE id = ? AND active = 1').get(company_id);
    if (!company) {
      return res.status(400).json({ error: 'Компания не найдена' });
    }

    // Ensure teacher_rate link exists
    const rateExists = db.prepare('SELECT id FROM teacher_rates WHERE teacher_id = ? AND company_id = ?').get(teacher_id, company_id);
    if (!rateExists) {
      db.prepare('INSERT INTO teacher_rates (teacher_id, company_id, rate) VALUES (?, ?, NULL)').run(teacher_id, company_id);
    }

    const result = db.prepare(`
      INSERT INTO schedule_slots (teacher_id, company_id, day_of_week, time_start, time_end, group_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(teacher_id, company_id, day_of_week, time_start, time_end, group_name || '');

    const slot = db.prepare(`
      SELECT ss.*, u.full_name as teacher_name, c.name as company_name, c.type as company_type
      FROM schedule_slots ss
      JOIN users u ON u.id = ss.teacher_id
      JOIN companies c ON c.id = ss.company_id
      WHERE ss.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(slot);
  } finally {
    db.close();
  }
});

// PUT /api/schedule/:id  (admin only)
router.put('/:id', adminOnly, (req, res) => {
  const { teacher_id, company_id, day_of_week, time_start, time_end, group_name, active } = req.body;
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM schedule_slots WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Слот не найден' });
    }

    db.prepare(`
      UPDATE schedule_slots SET
        teacher_id = COALESCE(?, teacher_id),
        company_id = COALESCE(?, company_id),
        day_of_week = COALESCE(?, day_of_week),
        time_start = COALESCE(?, time_start),
        time_end = COALESCE(?, time_end),
        group_name = COALESCE(?, group_name),
        active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      teacher_id || null, company_id || null, day_of_week || null,
      time_start || null, time_end || null,
      group_name !== undefined ? group_name : null,
      active !== undefined ? active : null,
      req.params.id
    );

    const slot = db.prepare(`
      SELECT ss.*, u.full_name as teacher_name, c.name as company_name, c.type as company_type
      FROM schedule_slots ss
      JOIN users u ON u.id = ss.teacher_id
      JOIN companies c ON c.id = ss.company_id
      WHERE ss.id = ?
    `).get(req.params.id);

    res.json(slot);
  } finally {
    db.close();
  }
});

// DELETE /api/schedule/:id  (admin only)
router.delete('/:id', adminOnly, (req, res) => {
  const db = getDb();
  try {
    db.prepare('UPDATE schedule_slots SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } finally {
    db.close();
  }
});

// POST /api/schedule/generate  (admin only)
// Generate lesson instances from schedule slots for a given date range
router.post('/generate', adminOnly, (req, res) => {
  const { date_from, date_to } = req.body;

  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'Укажите date_from и date_to (YYYY-MM-DD)' });
  }

  const db = getDb();
  try {
    const slots = db.prepare('SELECT * FROM schedule_slots WHERE active = 1').all();

    const insertLesson = db.prepare(`
      INSERT OR IGNORE INTO lessons (schedule_slot_id, date, actual_teacher_id, status)
      VALUES (?, ?, ?, 'planned')
    `);

    const dayNames = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 }; // ISO to JS day

    let created = 0;

    const transaction = db.transaction(() => {
      const start = new Date(date_from);
      const end = new Date(date_to);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay(); // 0=Sun, 1=Mon, ...

        for (const slot of slots) {
          if (dayNames[slot.day_of_week] === jsDay) {
            const dateStr = d.toISOString().slice(0, 10);
            const result = insertLesson.run(slot.id, dateStr, slot.teacher_id);
            if (result.changes > 0) created++;
          }
        }
      }
    });

    transaction();
    res.json({ created, message: `Создано ${created} занятий` });
  } finally {
    db.close();
  }
});

module.exports = router;
