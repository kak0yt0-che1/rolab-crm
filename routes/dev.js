const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Company = require('../models/Company');
const ScheduleSlot = require('../models/ScheduleSlot');
const Lesson = require('../models/Lesson');
const Substitution = require('../models/Substitution');
const { authMiddleware, devOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, devOnly);

// Все пользователи
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ role: 1, full_name: 1 });
    res.json(users.map(u => ({
      id: u._id.toString(),
      username: u.username,
      plain_password: u.plain_password,
      role: u.role,
      full_name: u.full_name,
      phone: u.phone,
      active: u.active,
      created_at: u.created_at
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Все компании
router.get('/companies', async (req, res) => {
  try {
    const companies = await Company.find().sort({ name: 1 });
    res.json(companies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Все расписания
router.get('/schedule', async (req, res) => {
  try {
    const slots = await ScheduleSlot.find()
      .populate('teacher_id', 'full_name username')
      .populate('company_id', 'name type')
      .sort({ day_of_week: 1, time_start: 1 });
    res.json(slots.map(s => ({
      id: s._id.toString(),
      teacher_name: s.teacher_id?.full_name,
      teacher_username: s.teacher_id?.username,
      company_name: s.company_id?.name,
      company_type: s.company_id?.type,
      day_of_week: s.day_of_week,
      time_start: s.time_start,
      time_end: s.time_end,
      group_name: s.group_name,
      active: s.active,
      created_at: s.created_at
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Все занятия
router.get('/lessons', async (req, res) => {
  try {
    const { date_from, date_to, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = date_from;
      if (date_to) filter.date.$lte = date_to;
    }
    const lessons = await Lesson.find(filter)
      .populate({
        path: 'schedule_slot_id',
        populate: [
          { path: 'company_id', select: 'name type' },
          { path: 'teacher_id', select: 'full_name' }
        ]
      })
      .populate('actual_teacher_id', 'full_name')
      .sort({ date: -1 })
      .limit(500);

    res.json(lessons.filter(l => l.schedule_slot_id).map(l => ({
      id: l._id.toString(),
      date: l.date,
      status: l.status,
      children_count: l.children_count,
      price: l.price,
      notes: l.notes,
      time_start: l.schedule_slot_id.time_start,
      time_end: l.schedule_slot_id.time_end,
      group_name: l.schedule_slot_id.group_name,
      original_teacher: l.schedule_slot_id.teacher_id?.full_name,
      actual_teacher: l.actual_teacher_id?.full_name,
      company_name: l.schedule_slot_id.company_id?.name,
      company_type: l.schedule_slot_id.company_id?.type,
      created_at: l.created_at,
      updated_at: l.updated_at
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Все замены
router.get('/substitutions', async (req, res) => {
  try {
    const subs = await Substitution.find()
      .populate('lesson_id', 'date status')
      .populate('original_teacher_id', 'full_name')
      .populate('substitute_teacher_id', 'full_name')
      .sort({ created_at: -1 })
      .limit(200);
    res.json(subs.map(s => ({
      id: s._id.toString(),
      lesson_date: s.lesson_id?.date,
      original_teacher: s.original_teacher_id?.full_name,
      substitute_teacher: s.substitute_teacher_id?.full_name,
      reason: s.reason,
      created_at: s.created_at
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Статистика БД
router.get('/stats', async (req, res) => {
  try {
    const [users, companies, slots, lessons, subs] = await Promise.all([
      User.countDocuments(),
      Company.countDocuments(),
      ScheduleSlot.countDocuments(),
      Lesson.countDocuments(),
      Substitution.countDocuments()
    ]);
    const lessonsByStatus = await Lesson.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json({
      users, companies,
      schedule_slots: slots,
      lessons, substitutions: subs,
      lessons_by_status: lessonsByStatus
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Сбросить пароль пользователя
router.put('/users/:id/reset-password', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Укажите новый пароль' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    await User.findByIdAndUpdate(req.params.id, { password_hash: hash, plain_password: password });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать пользователя (dev)
router.post('/users', async (req, res) => {
  const { username, password, role, full_name, phone } = req.body;
  if (!username || !password || !role || !full_name) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const user = await User.create({ username, password_hash: hash, plain_password: password, role, full_name, phone: phone || '' });
    res.status(201).json({ id: user._id.toString(), username: user.username, role: user.role, full_name: user.full_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Удалить/деактивировать пользователя
router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
