const express = require('express');
const mongoose = require('mongoose');
const ScheduleSlot = require('../models/ScheduleSlot');
const Lesson = require('../models/Lesson');
const TeacherRate = require('../models/TeacherRate');
const User = require('../models/User');
const Company = require('../models/Company');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function badId(res, id) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Неверный идентификатор' });
    return true;
  }
  return false;
}

function formatSlot(s) {
  return {
    id: s._id.toString(),
    teacher_id: s.teacher_id._id ? s.teacher_id._id.toString() : s.teacher_id.toString(),
    teacher_name: s.teacher_id.full_name || '',
    company_id: s.company_id._id ? s.company_id._id.toString() : s.company_id.toString(),
    company_name: s.company_id.name || '',
    company_type: s.company_id.type || '',
    day_of_week: s.day_of_week,
    time_start: s.time_start,
    time_end: s.time_end,
    group_name: s.group_name,
    active: s.active,
    created_at: s.created_at
  };
}

// GET /api/schedule
router.get('/', async (req, res) => {
  try {
    const { teacher_id, company_id, day_of_week } = req.query;
    const filter = { active: true };

    if (req.user.role === 'teacher') {
      filter.teacher_id = new mongoose.Types.ObjectId(req.user.id);
    } else if (teacher_id) {
      filter.teacher_id = teacher_id;
    }

    if (company_id) filter.company_id = company_id;
    if (day_of_week) filter.day_of_week = Number(day_of_week);

    const slots = await ScheduleSlot.find(filter)
      .populate('teacher_id', 'full_name')
      .populate('company_id', 'name type')
      .sort({ day_of_week: 1, time_start: 1 })
      .lean();

    res.json(slots.map(formatSlot));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/schedule — admin или учитель (для себя)
router.post('/', async (req, res) => {
  const { teacher_id, company_id, day_of_week, time_start, time_end, group_name } = req.body;

  // Учитель может добавлять только для себя
  const effectiveTeacherId = req.user.role === 'teacher' ? req.user.id : teacher_id;

  if (!effectiveTeacherId || !company_id || !day_of_week || !time_start || !time_end) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }
  if (day_of_week < 1 || day_of_week > 7) {
    return res.status(400).json({ error: 'День недели: от 1 (Пн) до 7 (Вс)' });
  }

  // Учитель не может добавить слот для другого учителя
  if (req.user.role === 'teacher' && effectiveTeacherId !== req.user.id) {
    return res.status(403).json({ error: 'Можно добавлять расписание только для себя' });
  }

  try {
    const teacher = await User.findOne({ _id: effectiveTeacherId, role: 'teacher', active: true });
    if (!teacher) return res.status(400).json({ error: 'Педагог не найден' });

    const company = await Company.findOne({ _id: company_id, active: true });
    if (!company) return res.status(400).json({ error: 'Компания не найдена' });

    // Создать связку ставки если нет
    await TeacherRate.findOneAndUpdate(
      { teacher_id: effectiveTeacherId, company_id },
      { $setOnInsert: { rate: null } },
      { upsert: true, new: true }
    );

    const slot = await ScheduleSlot.create({
      teacher_id: effectiveTeacherId, company_id,
      day_of_week: Number(day_of_week), time_start, time_end,
      group_name: group_name || ''
    });

    const populated = await ScheduleSlot.findById(slot._id)
      .populate('teacher_id', 'full_name')
      .populate('company_id', 'name type');

    res.status(201).json(formatSlot(populated));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/schedule/:id — admin или учитель (только свой слот)
router.put('/:id', async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const slot = await ScheduleSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ error: 'Слот не найден' });

    if (req.user.role === 'teacher' && slot.teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому слоту' });
    }

    const { day_of_week, time_start, time_end, group_name, active, company_id } = req.body;

    // Учитель не может менять company_id или teacher_id
    if (req.user.role !== 'teacher') {
      if (req.body.teacher_id) slot.teacher_id = req.body.teacher_id;
      if (company_id) slot.company_id = company_id;
    }

    if (day_of_week !== undefined) slot.day_of_week = Number(day_of_week);
    if (time_start !== undefined) slot.time_start = time_start;
    if (time_end !== undefined) slot.time_end = time_end;
    if (group_name !== undefined) slot.group_name = group_name;
    if (active !== undefined) slot.active = active;

    await slot.save();

    const populated = await ScheduleSlot.findById(slot._id)
      .populate('teacher_id', 'full_name')
      .populate('company_id', 'name type');

    res.json(formatSlot(populated));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/schedule/:id — admin или учитель (только свой слот)
router.delete('/:id', async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const slot = await ScheduleSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ error: 'Слот не найден' });

    if (req.user.role === 'teacher' && slot.teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому слоту' });
    }

    await ScheduleSlot.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/schedule/generate — только admin
router.post('/generate', adminOnly, async (req, res) => {
  const { date_from, date_to } = req.body;
  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'Укажите date_from и date_to (YYYY-MM-DD)' });
  }

  try {
    const slots = await ScheduleSlot.find({ active: true });
    const dayMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 }; // ISO → JS getDay()

    let created = 0;
    const start = new Date(date_from);
    const end = new Date(date_to);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const jsDay = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);

      for (const slot of slots) {
        if (dayMap[slot.day_of_week] === jsDay) {
          try {
            await Lesson.create({
              schedule_slot_id: slot._id,
              date: dateStr,
              actual_teacher_id: slot.teacher_id,
              status: 'planned'
            });
            created++;
          } catch (dupErr) {
            // ignore duplicate key errors (lesson already exists)
          }
        }
      }
    }

    res.json({ created, message: `Создано ${created} занятий` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
