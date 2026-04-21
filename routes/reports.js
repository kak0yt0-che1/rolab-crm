const express = require('express');
const { getDb } = require('../database/connection');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/reports/summary
router.get('/summary', (req, res) => {
  const db = getDb();
  try {
    const { date_from, date_to, teacher_id, company_id } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }

    let teacherFilter = '';
    const params = [date_from, date_to];

    if (req.user.role === 'teacher') {
      teacherFilter = 'AND l.actual_teacher_id = ?';
      params.push(req.user.id);
    } else if (teacher_id) {
      teacherFilter = 'AND l.actual_teacher_id = ?';
      params.push(teacher_id);
    }

    let companyFilter = '';
    if (company_id) {
      companyFilter = 'AND ss.company_id = ?';
      params.push(company_id);
    }

    // Summary by teacher
    const byTeacher = db.prepare(`
      SELECT
        u.id as teacher_id,
        u.full_name as teacher_name,
        COUNT(*) as total_lessons,
        SUM(CASE WHEN l.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN l.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN l.status = 'planned' THEN 1 ELSE 0 END) as planned,
        SUM(CASE WHEN l.status = 'completed' THEN l.children_count ELSE 0 END) as total_children
      FROM lessons l
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN users u ON u.id = l.actual_teacher_id
      WHERE l.date BETWEEN ? AND ? ${teacherFilter} ${companyFilter}
      GROUP BY u.id
      ORDER BY u.full_name
    `).all(...params);

    // Summary by company
    const params2 = [date_from, date_to];
    if (req.user.role === 'teacher') {
      params2.push(req.user.id);
    } else if (teacher_id) {
      params2.push(teacher_id);
    }
    if (company_id) {
      params2.push(company_id);
    }

    const byCompany = db.prepare(`
      SELECT
        c.id as company_id,
        c.name as company_name,
        c.type as company_type,
        COUNT(*) as total_lessons,
        SUM(CASE WHEN l.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN l.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN l.status = 'planned' THEN 1 ELSE 0 END) as planned,
        SUM(CASE WHEN l.status = 'completed' THEN l.children_count ELSE 0 END) as total_children
      FROM lessons l
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN companies c ON c.id = ss.company_id
      JOIN users u ON u.id = l.actual_teacher_id
      WHERE l.date BETWEEN ? AND ? ${teacherFilter} ${companyFilter}
      GROUP BY c.id
      ORDER BY c.name
    `).all(...params2);

    // Total
    const params3 = [date_from, date_to];
    if (req.user.role === 'teacher') {
      params3.push(req.user.id);
    } else if (teacher_id) {
      params3.push(teacher_id);
    }
    if (company_id) {
      params3.push(company_id);
    }

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total_lessons,
        SUM(CASE WHEN l.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN l.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN l.status = 'planned' THEN 1 ELSE 0 END) as planned,
        SUM(CASE WHEN l.status = 'completed' THEN l.children_count ELSE 0 END) as total_children
      FROM lessons l
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN users u ON u.id = l.actual_teacher_id
      WHERE l.date BETWEEN ? AND ? ${teacherFilter} ${companyFilter}
    `).get(...params3);

    res.json({ totals, byTeacher, byCompany });
  } finally {
    db.close();
  }
});

// GET /api/reports/substitutions
router.get('/substitutions', (req, res) => {
  const db = getDb();
  try {
    const { date_from, date_to } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }

    let sql = `
      SELECT s.*,
        l.date, l.status,
        ss.time_start, ss.time_end, ss.group_name,
        c.name as company_name,
        ou.full_name as original_teacher_name,
        su.full_name as substitute_teacher_name
      FROM substitutions s
      JOIN lessons l ON l.id = s.lesson_id
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN companies c ON c.id = ss.company_id
      JOIN users ou ON ou.id = s.original_teacher_id
      JOIN users su ON su.id = s.substitute_teacher_id
      WHERE l.date BETWEEN ? AND ?
    `;
    const params = [date_from, date_to];

    if (req.user.role === 'teacher') {
      sql += ' AND (s.original_teacher_id = ? OR s.substitute_teacher_id = ?)';
      params.push(req.user.id, req.user.id);
    }

    sql += ' ORDER BY l.date DESC';

    const subs = db.prepare(sql).all(...params);
    res.json(subs);
  } finally {
    db.close();
  }
});

module.exports = router;
