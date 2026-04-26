const express = require('express');
const Lesson = require('../models/Lesson');
const TeacherRate = require('../models/TeacherRate');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * Садик: 5000 + (children - 5) * 1000, максимум 10000
 * Школа: ставка учителя или 3500 по умолчанию
 */
function calculatePayment(companyType, childrenCount, customRate, manualPrice) {
  if (manualPrice !== null && manualPrice !== undefined) {
    return parseInt(manualPrice) || 0;
  }
  if (companyType === 'kindergarten') {
    const base = 5000;
    const extra = Math.max(0, childrenCount - 5) * 1000;
    return Math.min(10000, base + extra);
  }
  return customRate || 3500;
}

// GET /api/payments/calculate
router.get('/calculate', async (req, res) => {
  try {
    const { date_from, date_to, teacher_id, company_id } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }

    const filter = {
      status: 'completed',
      date: { $gte: date_from, $lte: date_to }
    };

    if (req.user.role === 'teacher') {
      filter.actual_teacher_id = req.user.id;
    } else if (teacher_id) {
      filter.actual_teacher_id = teacher_id;
    }

    let lessons = await Lesson.find(filter)
      .populate({
        path: 'schedule_slot_id',
        populate: [
          { path: 'company_id', select: 'name type' }
        ]
      })
      .populate('actual_teacher_id', 'full_name')
      .sort({ date: 1 });

    // Фильтр по компании через populate
    if (company_id) {
      lessons = lessons.filter(l =>
        l.schedule_slot_id?.company_id?._id?.toString() === company_id
      );
    }

    // Убрать занятия без расписания (удалённые слоты)
    lessons = lessons.filter(l => l.schedule_slot_id && l.schedule_slot_id.company_id);

    // Загрузить все ставки учителей
    const allRates = await TeacherRate.find({});
    const rateMap = {};
    for (const r of allRates) {
      rateMap[`${r.teacher_id}_${r.company_id}`] = r.rate;
    }

    const paymentDetails = [];
    const teacherTotals = {};

    for (const lesson of lessons) {
      const companyType = lesson.schedule_slot_id.company_id.type;
      const companyName = lesson.schedule_slot_id.company_id.name;
      const companyIdStr = lesson.schedule_slot_id.company_id._id.toString();
      const teacherIdStr = lesson.actual_teacher_id._id.toString();
      const teacherName = lesson.actual_teacher_id.full_name;

      const customRate = rateMap[`${teacherIdStr}_${companyIdStr}`];
      const payment = calculatePayment(companyType, lesson.children_count || 0, customRate, lesson.price);

      paymentDetails.push({
        lesson_id: lesson._id.toString(),
        date: lesson.date,
        teacher_id: teacherIdStr,
        teacher_name: teacherName,
        company_name: companyName,
        company_type: companyType,
        group_name: lesson.schedule_slot_id.group_name,
        children_count: lesson.children_count || 0,
        payment
      });

      if (!teacherTotals[teacherIdStr]) {
        teacherTotals[teacherIdStr] = {
          teacher_id: teacherIdStr,
          teacher_name: teacherName,
          total_lessons: 0,
          total_payment: 0,
          total_children: 0,
          by_company: {}
        };
      }

      const tt = teacherTotals[teacherIdStr];
      tt.total_lessons++;
      tt.total_payment += payment;
      tt.total_children += lesson.children_count || 0;

      if (!tt.by_company[companyIdStr]) {
        tt.by_company[companyIdStr] = { company_name: companyName, company_type: companyType, lessons: 0, payment: 0 };
      }
      tt.by_company[companyIdStr].lessons++;
      tt.by_company[companyIdStr].payment += payment;
    }

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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
