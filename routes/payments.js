const express = require('express');
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const TeacherRate = require('../models/TeacherRate');
const { authMiddleware } = require('../middleware/auth');
const { calculateClientPayment, calculateTeacherPayment } = require('../utils/payment');

const router = express.Router();
router.use(authMiddleware);

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
      filter.actual_teacher_id = new mongoose.Types.ObjectId(req.user.id);
    } else if (teacher_id) {
      filter.actual_teacher_id = teacher_id;
    }

    let lessons = await Lesson.find(filter)
      .populate({
        path: 'schedule_slot_id',
        populate: [
          { path: 'company_id', select: 'name type client_rate' }
        ]
      })
      .populate('actual_teacher_id', 'full_name')
      .sort({ date: 1 })
      .lean();

    // Фильтр по компании через populate
    if (company_id) {
      lessons = lessons.filter(l =>
        l.schedule_slot_id?.company_id?._id?.toString() === company_id
      );
    }

    // Убрать занятия без расписания (удалённые слоты)
    lessons = lessons.filter(l => l.schedule_slot_id && l.schedule_slot_id.company_id);

    // Загрузить все ставки учителей
    const allRates = await TeacherRate.find({}).lean();
    const rateMap = {};
    for (const r of allRates) {
      rateMap[`${r.teacher_id.toString()}_${r.company_id.toString()}`] = r.rate;
    }

    const isTeacher = req.user.role === 'teacher';

    const paymentDetails = [];
    const teacherTotals = {};
    const companyTotals = {};

    for (const lesson of lessons) {
      const company = lesson.schedule_slot_id.company_id;
      const companyType = company.type;
      const companyName = company.name;
      const companyIdStr = company._id.toString();
      const clientRate = (company.client_rate === undefined) ? null : company.client_rate;
      const teacherIdStr = lesson.actual_teacher_id._id.toString();
      const teacherName = lesson.actual_teacher_id.full_name;
      const childrenCount = lesson.children_count || 0;

      const customRate = rateMap[`${teacherIdStr}_${companyIdStr}`];
      const teacherPayment = calculateTeacherPayment(companyType, childrenCount, customRate, lesson.price);
      const clientPayment = calculateClientPayment(companyType, childrenCount, clientRate);
      const profit = clientPayment - teacherPayment;

      paymentDetails.push({
        lesson_id: lesson._id.toString(),
        date: lesson.date,
        teacher_id: teacherIdStr,
        teacher_name: teacherName,
        company_id: companyIdStr,
        company_name: companyName,
        company_type: companyType,
        group_name: lesson.schedule_slot_id.group_name,
        children_count: childrenCount,
        teacher_payment: teacherPayment,
        client_payment: clientPayment,
        profit,
        // back-compat: для учителя «payment» — его собственная выплата
        payment: teacherPayment
      });

      if (!teacherTotals[teacherIdStr]) {
        teacherTotals[teacherIdStr] = {
          teacher_id: teacherIdStr,
          teacher_name: teacherName,
          total_lessons: 0,
          total_payment: 0,       // выплата учителю (back-compat)
          total_teacher: 0,
          total_client: 0,
          total_profit: 0,
          total_children: 0,
          by_company: {}
        };
      }

      const tt = teacherTotals[teacherIdStr];
      tt.total_lessons++;
      tt.total_payment += teacherPayment;
      tt.total_teacher += teacherPayment;
      tt.total_client += clientPayment;
      tt.total_profit += profit;
      tt.total_children += childrenCount;

      if (!tt.by_company[companyIdStr]) {
        tt.by_company[companyIdStr] = {
          company_name: companyName, company_type: companyType,
          lessons: 0, payment: 0, teacher_payment: 0, client_payment: 0, profit: 0
        };
      }
      const bc = tt.by_company[companyIdStr];
      bc.lessons++;
      bc.payment += teacherPayment;
      bc.teacher_payment += teacherPayment;
      bc.client_payment += clientPayment;
      bc.profit += profit;

      // Итоги по компаниям (доход центра от клиентов)
      if (!companyTotals[companyIdStr]) {
        companyTotals[companyIdStr] = {
          company_id: companyIdStr,
          company_name: companyName,
          company_type: companyType,
          total_lessons: 0,
          total_children: 0,
          total_client: 0,
          total_teacher: 0,
          total_profit: 0
        };
      }
      const ct = companyTotals[companyIdStr];
      ct.total_lessons++;
      ct.total_children += childrenCount;
      ct.total_client += clientPayment;
      ct.total_teacher += teacherPayment;
      ct.total_profit += profit;
    }

    const summaryByTeacher = Object.values(teacherTotals).map(t => ({
      ...t,
      by_company: Object.values(t.by_company)
    }));
    const summaryByCompany = Object.values(companyTotals);

    const grandTeacher = summaryByTeacher.reduce((s, t) => s + t.total_teacher, 0);
    const grandClient = summaryByCompany.reduce((s, c) => s + c.total_client, 0);
    const grandProfit = grandClient - grandTeacher;

    res.json({
      period: { date_from, date_to },
      grand_total: grandTeacher,        // back-compat (выплата учителям)
      grand_teacher: grandTeacher,      // итого к выплате учителям
      grand_client: grandClient,        // итого от клиентов
      grand_profit: grandProfit,        // прибыль центра
      summary_by_teacher: summaryByTeacher,
      summary_by_company: isTeacher ? [] : summaryByCompany,
      details: paymentDetails
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
