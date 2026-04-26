const express = require('express');
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Substitution = require('../models/Substitution');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function badId(res, id) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Неверный идентификатор' });
    return true;
  }
  return false;
}

function formatLesson(l) {
  const slot = l.schedule_slot_id;
  const company = slot.company_id;
  const originalTeacher = slot.teacher_id;
  const actualTeacher = l.actual_teacher_id;

  return {
    id: l._id.toString(),
    date: l.date,
    status: l.status,
    children_count: l.children_count,
    price: l.price,
    notes: l.notes,
    created_at: l.created_at,
    updated_at: l.updated_at,
    schedule_slot_id: slot._id.toString(),
    day_of_week: slot.day_of_week,
    time_start: slot.time_start,
    time_end: slot.time_end,
    group_name: slot.group_name,
    original_teacher_id: originalTeacher._id.toString(),
    original_teacher_name: originalTeacher.full_name,
    actual_teacher_id: actualTeacher._id.toString(),
    actual_teacher_name: actualTeacher.full_name,
    company_id: company._id.toString(),
    company_name: company.name,
    company_type: company.type
  };
}

async function getLessonsPopulated(filter) {
  return Lesson.find(filter)
    .populate({
      path: 'schedule_slot_id',
      populate: [
        { path: 'company_id', select: 'name type' },
        { path: 'teacher_id', select: 'full_name' }
      ]
    })
    .populate('actual_teacher_id', 'full_name')
    .sort({ date: -1 })
    .lean();
}

// GET /api/lessons
router.get('/', async (req, res) => {
  try {
    const { teacher_id, company_id, status, date_from, date_to, date } = req.query;
    const filter = {};

    if (req.user.role === 'teacher') {
      filter.actual_teacher_id = new mongoose.Types.ObjectId(req.user.id);
    } else if (teacher_id) {
      filter.actual_teacher_id = teacher_id;
    }

    if (status) filter.status = status;

    if (date) {
      filter.date = date;
    } else {
      if (date_from || date_to) {
        filter.date = {};
        if (date_from) filter.date.$gte = date_from;
        if (date_to) filter.date.$lte = date_to;
      }
    }

    let lessons = await getLessonsPopulated(filter);

    // Filter by company after populate (since company_id is inside schedule_slot)
    if (company_id) {
      lessons = lessons.filter(l =>
        l.schedule_slot_id && l.schedule_slot_id.company_id &&
        l.schedule_slot_id.company_id._id.toString() === company_id
      );
    }

    // JS sort: date desc, then time_start asc (can't sort populated fields at DB level)
    lessons = lessons
      .filter(l => l.schedule_slot_id)
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (a.schedule_slot_id.time_start || '').localeCompare(b.schedule_slot_id.time_start || '');
      });

    res.json(lessons.map(formatLesson));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/lessons/:id
router.put('/:id', async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { status, children_count, notes } = req.body;
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    if (req.user.role === 'teacher' && lesson.actual_teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    if (status !== undefined) lesson.status = status;
    if (children_count !== undefined) lesson.children_count = children_count;
    if (notes !== undefined) lesson.notes = notes;
    lesson.updated_at = new Date();
    await lesson.save();

    const populated = await getLessonsPopulated({ _id: lesson._id });
    res.json(populated.length ? formatLesson(populated[0]) : { success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/lessons/:id/complete
router.put('/:id/complete', async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { children_count, notes, price } = req.body;
  try {
    const lesson = await Lesson.findById(req.params.id)
      .populate({ path: 'schedule_slot_id', populate: { path: 'company_id', select: 'type' } });
    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    if (req.user.role === 'teacher' && lesson.actual_teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    const companyType = lesson.schedule_slot_id?.company_id?.type;

    // Садик: обязательно количество детей; школа: детей 0 по умолчанию
    if (companyType === 'kindergarten') {
      if (children_count === undefined || children_count === null || children_count === '') {
        return res.status(400).json({ error: 'Укажите количество детей' });
      }
    }

    lesson.status = 'completed';
    lesson.children_count = (children_count !== undefined && children_count !== null && children_count !== '') ? Number(children_count) : 0;
    lesson.price = (price !== undefined && price !== null && price !== '') ? Number(price) : null;
    if (notes !== undefined) lesson.notes = notes;
    lesson.updated_at = new Date();
    await lesson.save();

    res.json({ success: true, message: 'Занятие отмечено как проведенное' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/lessons/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { notes } = req.body;
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    if (req.user.role === 'teacher' && lesson.actual_teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    lesson.status = 'cancelled';
    if (notes) lesson.notes = notes;
    lesson.updated_at = new Date();
    await lesson.save();

    res.json({ success: true, message: 'Занятие отменено' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/lessons/:id/substitute — admin или сам учитель (для своего занятия)
router.post('/:id/substitute', async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { substitute_teacher_id, reason } = req.body;
  if (!substitute_teacher_id) {
    return res.status(400).json({ error: 'Укажите заменяющего педагога' });
  }

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    // Учитель может ставить замену только на своё занятие
    if (req.user.role === 'teacher' && lesson.actual_teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    const substitute = await User.findOne({ _id: substitute_teacher_id, role: 'teacher', active: true });
    if (!substitute) return res.status(400).json({ error: 'Заменяющий педагог не найден' });

    const originalTeacherId = lesson.actual_teacher_id;

    await Substitution.create({
      lesson_id: lesson._id,
      original_teacher_id: originalTeacherId,
      substitute_teacher_id,
      reason: reason || ''
    });

    lesson.actual_teacher_id = substitute_teacher_id;
    lesson.updated_at = new Date();
    await lesson.save();

    res.json({ success: true, message: 'Замена назначена' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
