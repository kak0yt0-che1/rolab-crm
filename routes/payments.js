const express = require('express');
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const TeacherRate = require('../models/TeacherRate');
const Attendance = require('../models/Attendance');
const KindergartenChild = require('../models/KindergartenChild');
const IndividualPayment = require('../models/IndividualPayment');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { badId, serverError } = require('../utils/http');
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
          { path: 'company_id', select: 'name type client_rate payment_type' }
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

    // Ставки только тех учителей, что встречаются в выборке
    const teacherIds = [...new Set(lessons.map(l => l.actual_teacher_id && l.actual_teacher_id._id.toString()).filter(Boolean))];
    const allRates = await TeacherRate.find({ teacher_id: { $in: teacherIds } }).lean();
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
      const clientPayment = calculateClientPayment(companyType, childrenCount, clientRate, company.payment_type);
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
    serverError(res, e);
  }
});

// ============================================================
// ФУНКЦИЯ 2 — Оплата родителями (individual payments)
// ============================================================

/**
 * GET /api/payments/individual/:lessonId
 * Таблица оплаты родителями за занятие: дети, присутствовавшие на занятии,
 * с их статусом оплаты. Сумма по умолчанию = client_rate компании.
 * Только админ. Осмысленно для компаний с payment_type === 'individual'.
 *
 * Мини-тест: занятие садика с 2 присутствовавшими детьми, без записей оплаты →
 *   children: [{ paid:false, amount:<client_rate>, payment_id:null }, ...]
 */
router.get('/individual/:lessonId', adminOnly, async (req, res) => {
  if (badId(res, req.params.lessonId)) return;
  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .populate({
        path: 'schedule_slot_id',
        populate: { path: 'company_id', select: 'name type client_rate payment_type' }
      });
    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    const company = lesson.schedule_slot_id?.company_id;
    if (!company) return res.status(400).json({ error: 'У занятия нет компании' });

    const paymentType = company.payment_type
      || (company.type === 'kindergarten' ? 'individual' : 'organization');
    if (paymentType !== 'individual') {
      return res.status(400).json({ error: 'Оплата родителями доступна только для компаний с типом оплаты «Родители»' });
    }

    const defaultAmount = (company.client_rate === undefined || company.client_rate === null)
      ? null : Number(company.client_rate);

    // Дети, присутствовавшие на занятии
    const marks = await Attendance.find({ lesson_id: lesson._id, present: true }).lean();
    const childIds = marks.map(m => m.child_id);

    const [children, payments] = await Promise.all([
      KindergartenChild.find({ _id: { $in: childIds } }).sort({ full_name: 1 }).lean(),
      IndividualPayment.find({ lesson_id: lesson._id }).lean()
    ]);

    const payMap = {};
    payments.forEach(p => { payMap[p.child_id.toString()] = p; });

    const rows = children.map(c => {
      const p = payMap[c._id.toString()];
      return {
        child_id: c._id.toString(),
        full_name: c.full_name,
        status: c.status,
        payment_id: p ? p._id.toString() : null,
        paid: p ? p.paid : false,
        amount: p && p.amount != null ? p.amount : defaultAmount,
        paid_at: p ? p.paid_at : null,
        note: p ? p.note : ''
      };
    });

    const totalBilled = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const totalPaid = rows.filter(r => r.paid).reduce((s, r) => s + (r.amount || 0), 0);

    res.json({
      lesson_id: lesson._id.toString(),
      date: lesson.date,
      company_name: company.name,
      payment_type: paymentType,
      default_amount: defaultAmount,
      children: rows,
      total_billed: totalBilled,
      total_paid: totalPaid,
      debt: totalBilled - totalPaid
    });
  } catch (e) {
    serverError(res, e);
  }
});

/**
 * PUT /api/payments/individual/:lessonId/:childId
 * Отметить/изменить оплату ребёнка за занятие (upsert).
 * Тело: { paid?, amount?, note? }. paid_at выставляется при переходе в paid=true.
 * Только админ.
 */
router.put('/individual/:lessonId/:childId', adminOnly, async (req, res) => {
  if (badId(res, req.params.lessonId)) return;
  if (badId(res, req.params.childId)) return;
  const { paid, amount, note } = req.body;

  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .populate({ path: 'schedule_slot_id', populate: { path: 'company_id', select: 'client_rate' } });
    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    const defaultAmount = lesson.schedule_slot_id?.company_id?.client_rate;

    let payment = await IndividualPayment.findOne({
      lesson_id: req.params.lessonId, child_id: req.params.childId
    });
    if (!payment) {
      payment = new IndividualPayment({
        lesson_id: req.params.lessonId,
        child_id: req.params.childId,
        amount: (defaultAmount === undefined || defaultAmount === null) ? null : Number(defaultAmount),
        created_by: req.user.id
      });
    }

    if (amount !== undefined) {
      payment.amount = (amount === '' || amount === null) ? null : Number(amount);
    }
    if (note !== undefined) payment.note = note;
    if (paid !== undefined) {
      const willPay = !!paid;
      // выставляем дату только при переходе false→true, снимаем при true→false
      if (willPay && !payment.paid) payment.paid_at = new Date();
      if (!willPay) payment.paid_at = null;
      payment.paid = willPay;
    }
    payment.updated_at = new Date();
    await payment.save();

    res.json(payment.toJSON());
  } catch (e) {
    serverError(res, e);
  }
});

module.exports = router;
