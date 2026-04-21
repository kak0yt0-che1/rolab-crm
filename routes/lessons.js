const express = require('express');
const { getDb } = require('../database/connection');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/lessons
router.get('/', (req, res) => {
  const db = getDb();
  try {
    const { teacher_id, company_id, status, date_from, date_to, date } = req.query;
    let sql = `
      SELECT l.*,
        ss.day_of_week, ss.time_start, ss.time_end, ss.group_name,
        ss.teacher_id as original_teacher_id,
        u.full_name as actual_teacher_name,
        ou.full_name as original_teacher_name,
        c.name as company_name, c.type as company_type, c.id as company_id
      FROM lessons l
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN users u ON u.id = l.actual_teacher_id
      JOIN users ou ON ou.id = ss.teacher_id
      JOIN companies c ON c.id = ss.company_id
      WHERE 1=1
    `;
    const params = [];

    // Teachers only see their own lessons
    if (req.user.role === 'teacher') {
      sql += ' AND l.actual_teacher_id = ?';
      params.push(req.user.id);
    } else if (teacher_id) {
      sql += ' AND (l.actual_teacher_id = ? OR ss.teacher_id = ?)';
      params.push(teacher_id, teacher_id);
    }

    if (company_id) {
      sql += ' AND ss.company_id = ?';
      params.push(company_id);
    }

    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }

    if (date) {
      sql += ' AND l.date = ?';
      params.push(date);
    } else {
      if (date_from) {
        sql += ' AND l.date >= ?';
        params.push(date_from);
      }
      if (date_to) {
        sql += ' AND l.date <= ?';
        params.push(date_to);
      }
    }

    sql += ' ORDER BY l.date DESC, ss.time_start';
    const lessons = db.prepare(sql).all(...params);
    res.json(lessons);
  } finally {
    db.close();
  }
});

// PUT /api/lessons/:id
router.put('/:id', (req, res) => {
  const { status, children_count, notes } = req.body;
  const db = getDb();
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }

    // Teachers can only update their own lessons
    if (req.user.role === 'teacher' && lesson.actual_teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    db.prepare(`
      UPDATE lessons SET
        status = COALESCE(?, status),
        children_count = COALESCE(?, children_count),
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      status || null,
      children_count !== undefined ? children_count : null,
      notes !== undefined ? notes : null,
      req.params.id
    );

    const updated = db.prepare(`
      SELECT l.*,
        ss.day_of_week, ss.time_start, ss.time_end, ss.group_name,
        ss.teacher_id as original_teacher_id,
        u.full_name as actual_teacher_name,
        c.name as company_name, c.type as company_type, c.id as company_id
      FROM lessons l
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN users u ON u.id = l.actual_teacher_id
      JOIN companies c ON c.id = ss.company_id
      WHERE l.id = ?
    `).get(req.params.id);

    res.json(updated);
  } finally {
    db.close();
  }
});

// PUT /api/lessons/:id/complete
router.put('/:id/complete', (req, res) => {
  const { children_count, notes, price } = req.body;
  const db = getDb();
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }

    if (req.user.role === 'teacher' && lesson.actual_teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    if (children_count === undefined || children_count === null) {
      return res.status(400).json({ error: 'Укажите количество детей' });
    }

    const finalPrice = (price !== undefined && price !== null && price !== '') ? price : null;

    db.prepare(`
      UPDATE lessons SET
        status = 'completed',
        children_count = ?,
        price = ?,
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(children_count, finalPrice, notes || null, req.params.id);

    res.json({ success: true, message: 'Занятие отмечено как проведенное' });
  } finally {
    db.close();
  }
});

// PUT /api/lessons/:id/cancel
router.put('/:id/cancel', (req, res) => {
  const { notes } = req.body;
  const db = getDb();
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }

    if (req.user.role === 'teacher' && lesson.actual_teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    db.prepare(`
      UPDATE lessons SET
        status = 'cancelled',
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(notes || null, req.params.id);

    res.json({ success: true, message: 'Занятие отменено' });
  } finally {
    db.close();
  }
});

// POST /api/lessons/:id/substitute  (admin only)
router.post('/:id/substitute', adminOnly, (req, res) => {
  const { substitute_teacher_id, reason } = req.body;

  if (!substitute_teacher_id) {
    return res.status(400).json({ error: 'Укажите заменяющего педагога' });
  }

  const db = getDb();
  try {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }

    const substitute = db.prepare('SELECT id FROM users WHERE id = ? AND role = \'teacher\' AND active = 1').get(substitute_teacher_id);
    if (!substitute) {
      return res.status(400).json({ error: 'Заменяющий педагог не найден' });
    }

    const originalTeacherId = lesson.actual_teacher_id;

    const transaction = db.transaction(() => {
      // Update lesson's actual teacher
      db.prepare('UPDATE lessons SET actual_teacher_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(substitute_teacher_id, req.params.id);

      // Record substitution
      db.prepare(`
        INSERT INTO substitutions (lesson_id, original_teacher_id, substitute_teacher_id, reason)
        VALUES (?, ?, ?, ?)
      `).run(req.params.id, originalTeacherId, substitute_teacher_id, reason || '');
    });

    transaction();
    res.json({ success: true, message: 'Замена назначена' });
  } finally {
    db.close();
  }
});

module.exports = router;
