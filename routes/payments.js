const express = require('express');
const { getDb } = require('../database/connection');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * Payment calculation logic:
 *
 * Kindergarten (садик):
 *   payment = 5000 + max(0, children_count - 5) * 1000
 *
 * School (школа):
 *   payment = custom_rate (from teacher_rates) OR 3500 (default)
 */
function calculatePayment(companyType, childrenCount, customRate, manualPrice) {
  // If a manual price was entered (masterclass or override), it takes absolute priority
  if (manualPrice !== null && manualPrice !== undefined) {
    return parseInt(manualPrice) || 0;
  }

  // Fallbacks based on company type
  if (companyType === 'masterclass') {
    return 0; // If they forgot to enter manual price for a masterclass
  } else if (companyType === 'kindergarten') {
    const base = 5000;
    const extra = Math.max(0, childrenCount - 5) * 1000;
    return base + extra;
  } else {
    // school
    return customRate || 3500;
  }
}

// GET /api/payments/calculate
router.get('/calculate', (req, res) => {
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

    // Get all completed lessons with necessary data
    const lessons = db.prepare(`
      SELECT
        l.id, l.date, l.children_count, l.price, l.actual_teacher_id,
        ss.company_id, ss.group_name,
        u.full_name as teacher_name,
        c.name as company_name, c.type as company_type
      FROM lessons l
      JOIN schedule_slots ss ON ss.id = l.schedule_slot_id
      JOIN users u ON u.id = l.actual_teacher_id
      JOIN companies c ON c.id = ss.company_id
      WHERE l.status = 'completed'
        AND l.date BETWEEN ? AND ?
        ${teacherFilter}
        ${companyFilter}
      ORDER BY u.full_name, l.date
    `).all(...params);

    // Get all custom rates
    const rates = db.prepare('SELECT * FROM teacher_rates').all();
    const rateMap = {};
    for (const r of rates) {
      rateMap[`${r.teacher_id}_${r.company_id}`] = r.rate;
    }

    // Calculate payments
    const paymentDetails = [];
    const teacherTotals = {};

    for (const lesson of lessons) {
      const customRate = rateMap[`${lesson.actual_teacher_id}_${lesson.company_id}`];
      const payment = calculatePayment(lesson.company_type, lesson.children_count, customRate, lesson.price);

      paymentDetails.push({
        lesson_id: lesson.id,
        date: lesson.date,
        teacher_id: lesson.actual_teacher_id,
        teacher_name: lesson.teacher_name,
        company_name: lesson.company_name,
        company_type: lesson.company_type,
        group_name: lesson.group_name,
        children_count: lesson.children_count,
        payment
      });

      // Aggregate by teacher
      if (!teacherTotals[lesson.actual_teacher_id]) {
        teacherTotals[lesson.actual_teacher_id] = {
          teacher_id: lesson.actual_teacher_id,
          teacher_name: lesson.teacher_name,
          total_lessons: 0,
          total_payment: 0,
          total_children: 0,
          by_company: {}
        };
      }

      const tt = teacherTotals[lesson.actual_teacher_id];
      tt.total_lessons++;
      tt.total_payment += payment;
      tt.total_children += lesson.children_count;

      if (!tt.by_company[lesson.company_id]) {
        tt.by_company[lesson.company_id] = {
          company_name: lesson.company_name,
          company_type: lesson.company_type,
          lessons: 0,
          payment: 0
        };
      }
      tt.by_company[lesson.company_id].lessons++;
      tt.by_company[lesson.company_id].payment += payment;
    }

    // Convert by_company from object to array
    const summaryByTeacher = Object.values(teacherTotals).map(t => ({
      ...t,
      by_company: Object.values(t.by_company)
    }));

    const grandTotal = summaryByTeacher.reduce((sum, t) => sum + t.total_payment, 0);

    res.json({
      period: { date_from, date_to },
      grand_total: grandTotal,
      summary_by_teacher: summaryByTeacher,
      details: paymentDetails
    });
  } finally {
    db.close();
  }
});

module.exports = router;
