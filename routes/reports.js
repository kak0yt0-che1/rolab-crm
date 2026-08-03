const express = require('express');
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Substitution = require('../models/Substitution');
const Attendance = require('../models/Attendance');
const KindergartenChild = require('../models/KindergartenChild');
const IndividualPayment = require('../models/IndividualPayment');
const Company = require('../models/Company');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { serverError } = require('../utils/http');
const { calculateClientPayment } = require('../utils/payment');

const router = express.Router();
router.use(authMiddleware);

// GET /api/reports/summary
router.get('/summary', async (req, res) => {
  try {
    const { date_from, date_to, teacher_id, company_id } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }

    const filter = { date: { $gte: date_from, $lte: date_to } };

    if (req.user.role === 'teacher') {
      filter.actual_teacher_id = new mongoose.Types.ObjectId(req.user.id);
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
      .lean();

    lessons = lessons.filter(l => l.actual_teacher_id && l.schedule_slot_id && l.schedule_slot_id.company_id);

    if (company_id) {
      lessons = lessons.filter(l =>
        l.schedule_slot_id.company_id._id.toString() === company_id
      );
    }

    // Итого
    const totals = {
      total_lessons: lessons.length,
      completed: lessons.filter(l => l.status === 'completed').length,
      cancelled: lessons.filter(l => l.status === 'cancelled').length,
      planned: lessons.filter(l => l.status === 'planned').length,
      total_children: lessons.filter(l => l.status === 'completed').reduce((s, l) => s + (l.children_count || 0), 0)
    };

    // По учителям
    const byTeacherMap = {};
    for (const l of lessons) {
      const tid = l.actual_teacher_id._id.toString();
      if (!byTeacherMap[tid]) {
        byTeacherMap[tid] = {
          teacher_id: tid,
          teacher_name: l.actual_teacher_id.full_name,
          total_lessons: 0, completed: 0, cancelled: 0, planned: 0, total_children: 0
        };
      }
      const t = byTeacherMap[tid];
      t.total_lessons++;
      if (l.status === 'completed') { t.completed++; t.total_children += l.children_count || 0; }
      if (l.status === 'cancelled') t.cancelled++;
      if (l.status === 'planned') t.planned++;
    }

    // По компаниям
    const byCompanyMap = {};
    for (const l of lessons) {
      const cid = l.schedule_slot_id.company_id._id.toString();
      if (!byCompanyMap[cid]) {
        byCompanyMap[cid] = {
          company_id: cid,
          company_name: l.schedule_slot_id.company_id.name,
          company_type: l.schedule_slot_id.company_id.type,
          total_lessons: 0, completed: 0, cancelled: 0, planned: 0, total_children: 0
        };
      }
      const c = byCompanyMap[cid];
      c.total_lessons++;
      if (l.status === 'completed') { c.completed++; c.total_children += l.children_count || 0; }
      if (l.status === 'cancelled') c.cancelled++;
      if (l.status === 'planned') c.planned++;
    }

    res.json({
      totals,
      byTeacher: Object.values(byTeacherMap).sort((a, b) => a.teacher_name.localeCompare(b.teacher_name)),
      byCompany: Object.values(byCompanyMap).sort((a, b) => a.company_name.localeCompare(b.company_name))
    });
  } catch (e) {
    serverError(res, e);
  }
});

// GET /api/reports/substitutions
router.get('/substitutions', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }

    const subFilter = {};
    if (req.user.role === 'teacher') {
      const uid = new mongoose.Types.ObjectId(req.user.id);
      subFilter.$or = [
        { original_teacher_id: uid },
        { substitute_teacher_id: uid }
      ];
    }

    const subs = await Substitution.find(subFilter)
      .populate({
        path: 'lesson_id',
        populate: { path: 'schedule_slot_id', populate: { path: 'company_id', select: 'name' } }
      })
      .populate('original_teacher_id', 'full_name')
      .populate('substitute_teacher_id', 'full_name')
      .sort({ createdAt: -1 })
      .lean();

    // Фильтр по дате через занятие
    const filtered = subs.filter(s => {
      if (!s.lesson_id) return false;
      const d = s.lesson_id.date;
      return d >= date_from && d <= date_to;
    });

    res.json(filtered.map(s => ({
      id: s._id.toString(),
      lesson_id: s.lesson_id._id.toString(),
      date: s.lesson_id.date,
      status: s.lesson_id.status,
      time_start: s.lesson_id.schedule_slot_id?.time_start,
      time_end: s.lesson_id.schedule_slot_id?.time_end,
      group_name: s.lesson_id.schedule_slot_id?.group_name,
      company_name: s.lesson_id.schedule_slot_id?.company_id?.name,
      original_teacher_name: s.original_teacher_id?.full_name,
      substitute_teacher_name: s.substitute_teacher_id?.full_name,
      reason: s.reason,
      created_at: s.created_at
    })));
  } catch (e) {
    serverError(res, e);
  }
});

// GET /api/reports/attendance — таблица посещаемости детей по датам (садик)
// Параметры: date_from, date_to, company_id (садик, обязателен), teacher_id (опц.)
router.get('/attendance', async (req, res) => {
  try {
    const { date_from, date_to, company_id, teacher_id } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }
    if (!company_id) {
      return res.status(400).json({ error: 'Укажите садик (company_id)' });
    }
    if (!mongoose.isValidObjectId(company_id)) {
      return res.status(400).json({ error: 'Неверный идентификатор садика' });
    }

    const filter = { date: { $gte: date_from, $lte: date_to } };
    if (req.user.role === 'teacher') {
      filter.actual_teacher_id = new mongoose.Types.ObjectId(req.user.id);
    } else if (teacher_id) {
      filter.actual_teacher_id = teacher_id;
    }

    let lessons = await Lesson.find(filter)
      .populate({ path: 'schedule_slot_id', populate: { path: 'company_id', select: 'name type' } })
      .lean();

    // Только занятия выбранного садика
    lessons = lessons.filter(l =>
      l.schedule_slot_id &&
      l.schedule_slot_id.company_id &&
      l.schedule_slot_id.company_id._id.toString() === company_id &&
      l.schedule_slot_id.company_id.type === 'kindergarten'
    );

    const companyName = lessons.length ? lessons[0].schedule_slot_id.company_id.name : '';

    // Уникальные даты занятий (столбцы таблицы)
    const dateSet = new Set(lessons.map(l => l.date));
    const dates = Array.from(dateSet).sort();

    const lessonIds = lessons.map(l => l._id);
    const lessonDateMap = {};
    lessons.forEach(l => { lessonDateMap[l._id.toString()] = l.date; });

    // Отметки по всем занятиям периода
    const marks = await Attendance.find({ lesson_id: { $in: lessonIds } }).lean();

    // child_id -> { date -> present }
    const childAttendance = {};
    const childIds = new Set();
    for (const m of marks) {
      const cid = m.child_id.toString();
      const date = lessonDateMap[m.lesson_id.toString()];
      if (!date) continue;
      childIds.add(cid);
      if (!childAttendance[cid]) childAttendance[cid] = {};
      // если в одну дату несколько занятий — присутствие хотя бы на одном считается присутствием
      childAttendance[cid][date] = childAttendance[cid][date] || !!m.present;
    }

    // Подтянуть данные детей (включая тех, кто уже неактивен, но был отмечен)
    const children = await KindergartenChild.find({ _id: { $in: Array.from(childIds) } })
      .sort({ full_name: 1 }).lean();

    const rows = children.map(c => {
      const cid = c._id.toString();
      const att = childAttendance[cid] || {};
      const totalPresent = dates.reduce((s, d) => s + (att[d] ? 1 : 0), 0);
      return {
        child_id: cid,
        full_name: c.full_name,
        status: c.status,
        attendance: att,          // { 'YYYY-MM-DD': true/false }
        total_present: totalPresent
      };
    });

    res.json({
      company_id,
      company_name: companyName,
      dates,
      children: rows
    });
  } catch (e) {
    serverError(res, e);
  }
});

// GET /api/reports/export-data — данные для экспорта счёта клиенту (только админ).
// Садик: дети × даты с посещаемостью, разбивка по группам (слотам).
// Школа: занятия × даты + кол-во.
// Внизу — итоговая сумма к оплате клиентом. Ставка учителя НЕ включается.
router.get('/export-data', adminOnly, async (req, res) => {
  try {
    const { date_from, date_to, company_id } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'Укажите date_from и date_to' });
    }
    if (!company_id || !mongoose.isValidObjectId(company_id)) {
      return res.status(400).json({ error: 'Укажите компанию (company_id)' });
    }

    const company = await Company.findById(company_id);
    if (!company) return res.status(404).json({ error: 'Компания не найдена' });

    // Только проведённые занятия компании за период
    let lessons = await Lesson.find({
      status: 'completed',
      date: { $gte: date_from, $lte: date_to }
    })
      .populate({ path: 'schedule_slot_id', populate: { path: 'company_id', select: 'name type client_rate' } })
      .lean();

    lessons = lessons.filter(l =>
      l.schedule_slot_id &&
      l.schedule_slot_id.company_id &&
      l.schedule_slot_id.company_id._id.toString() === company_id
    );

    const clientRate = (company.client_rate === undefined) ? null : company.client_rate;

    const dates = Array.from(new Set(lessons.map(l => l.date))).sort();

    const base = {
      company_id,
      company_name: company.name,
      company_type: company.type,
      date_from,
      date_to,
      dates
    };

    if (company.type === 'kindergarten') {
      // --- Садик: разбивка по группам (слотам) ---
      // Группируем занятия по schedule_slot_id
      const slotMap = {};
      for (const l of lessons) {
        const slotId = l.schedule_slot_id._id.toString();
        if (!slotMap[slotId]) {
          slotMap[slotId] = {
            slot_id: slotId,
            time_start: l.schedule_slot_id.time_start,
            time_end: l.schedule_slot_id.time_end,
            group_name: l.schedule_slot_id.group_name || '',
            lessons: []
          };
        }
        slotMap[slotId].lessons.push(l);
      }

      // Все отметки по всем занятиям периода
      const allLessonIds = lessons.map(l => l._id);
      const allMarks = await Attendance.find({ lesson_id: { $in: allLessonIds } }).lean();

      // Маппинг lesson_id -> { date, slot_id }
      const lessonInfoMap = {};
      lessons.forEach(l => {
        lessonInfoMap[l._id.toString()] = {
          date: l.date,
          slot_id: l.schedule_slot_id._id.toString()
        };
      });

      // Строим посещаемость по слотам: slot_id -> child_id -> date -> present
      const slotAttendance = {};
      const slotChildIds = {};
      for (const m of allMarks) {
        const info = lessonInfoMap[m.lesson_id.toString()];
        if (!info) continue;
        const { date, slot_id } = info;
        const cid = m.child_id.toString();

        if (!slotAttendance[slot_id]) slotAttendance[slot_id] = {};
        if (!slotAttendance[slot_id][cid]) slotAttendance[slot_id][cid] = {};
        // Если несколько занятий одного слота в одну дату — OR
        slotAttendance[slot_id][cid][date] = slotAttendance[slot_id][cid][date] || !!m.present;

        if (!slotChildIds[slot_id]) slotChildIds[slot_id] = new Set();
        slotChildIds[slot_id].add(cid);
      }

      // Загружаем данные всех детей
      const allChildIdsSet = new Set();
      Object.values(slotChildIds).forEach(s => s.forEach(id => allChildIdsSet.add(id)));
      const allChildren = await KindergartenChild.find({ _id: { $in: Array.from(allChildIdsSet) } })
        .sort({ full_name: 1 }).lean();
      const childMap = {};
      allChildren.forEach(c => { childMap[c._id.toString()] = c; });

      // Собираем группы и считаем итого
      let totalPresent = 0;
      const groups = Object.values(slotMap)
        .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''))
        .map(slot => {
          const att = slotAttendance[slot.slot_id] || {};
          const cids = slotChildIds[slot.slot_id] ? Array.from(slotChildIds[slot.slot_id]) : [];

          // Сортируем детей по ФИО
          const sortedCids = cids
            .filter(cid => childMap[cid])
            .sort((a, b) => (childMap[a].full_name || '').localeCompare(childMap[b].full_name || ''));

          let groupTotal = 0;
          const children = sortedCids.map(cid => {
            const child = childMap[cid];
            const childAtt = att[cid] || {};
            const present = dates.reduce((s, d) => s + (childAtt[d] ? 1 : 0), 0);
            groupTotal += present;
            return {
              full_name: child.full_name,
              status: child.status,
              attendance: childAtt,
              total_present: present
            };
          });

          // Всего по дате для этой группы
          const totals_per_date = {};
          for (const d of dates) {
            totals_per_date[d] = sortedCids.reduce((s, cid) => s + ((att[cid] || {})[d] ? 1 : 0), 0);
          }

          totalPresent += groupTotal;

          return {
            time_start: slot.time_start,
            time_end: slot.time_end,
            group_name: slot.group_name,
            children,
            totals_per_date,
            subtotal: groupTotal
          };
        });

      // client_total считается по реальным посещениям
      base.groups = groups;
      base.total_present = totalPresent;
      base.client_total = calculateClientPayment(company.type, totalPresent, clientRate, company.payment_type);

      // ФУНКЦИЯ 3: факт оплаты родителями за период (для payment_type === 'individual')
      const paidRecords = await IndividualPayment
        .find({ lesson_id: { $in: allLessonIds }, paid: true }).lean();
      base.total_billed = base.client_total;
      base.total_paid = paidRecords.reduce((s, p) => s + (p.amount || 0), 0);
      base.debt = base.total_billed - base.total_paid;
    } else {
      // Школа: список занятий по датам (без поимённых детей)
      let clientTotal = 0;
      for (const l of lessons) {
        clientTotal += calculateClientPayment(company.type, l.children_count || 0, clientRate, company.payment_type);
      }
      base.client_total = clientTotal;
      base.lessons = lessons
        .map(l => ({
          date: l.date,
          group_name: l.schedule_slot_id.group_name || '',
          time_start: l.schedule_slot_id.time_start,
          time_end: l.schedule_slot_id.time_end,
          children_count: l.children_count || 0,
          client_payment: calculateClientPayment(company.type, l.children_count || 0, clientRate, company.payment_type)
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json(base);
  } catch (e) {
    serverError(res, e);
  }
});

module.exports = router;
