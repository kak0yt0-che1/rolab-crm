const express = require('express');
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Substitution = require('../models/Substitution');
const { authMiddleware } = require('../middleware/auth');

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
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
