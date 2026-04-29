const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const KindergartenChild = require('../models/KindergartenChild');
const Lesson = require('../models/Lesson');
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

// GET /api/attendance/:lessonId — получить отметки для занятия
router.get('/:lessonId', async (req, res) => {
  if (badId(res, req.params.lessonId)) return;

  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .populate({
        path: 'schedule_slot_id',
        populate: { path: 'company_id', select: 'name type' }
      });

    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    const company = lesson.schedule_slot_id?.company_id;
    if (!company || company.type !== 'kindergarten') {
      return res.status(400).json({ error: 'Отметки по списку доступны только для садиков' });
    }

    // Получаем всех активных детей этого садика
    const children = await KindergartenChild.find({
      company_id: company._id,
      active: true
    }).sort({ full_name: 1 });

    // Получаем существующие отметки
    const marks = await Attendance.find({ lesson_id: req.params.lessonId });
    const markMap = {};
    marks.forEach(m => {
      markMap[m.child_id.toString()] = m.present;
    });

    const result = children.map(c => ({
      child_id: c._id.toString(),
      full_name: c.full_name,
      status: c.status,
      present: markMap[c._id.toString()] || false
    }));

    res.json({
      lesson_id: req.params.lessonId,
      company_name: company.name,
      children: result,
      total: result.length,
      present_count: result.filter(r => r.present).length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/attendance/:lessonId — сохранить отметки (массовое обновление)
router.put('/:lessonId', async (req, res) => {
  if (badId(res, req.params.lessonId)) return;

  const { marks } = req.body;
  // marks: [{ child_id, present: true/false }]
  if (!marks || !Array.isArray(marks)) {
    return res.status(400).json({ error: 'Укажите массив отметок' });
  }

  try {
    const lesson = await Lesson.findById(req.params.lessonId)
      .populate({
        path: 'schedule_slot_id',
        populate: { path: 'company_id', select: 'type' }
      });

    if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

    // Проверяем доступ учителя
    if (req.user.role === 'teacher' && lesson.actual_teacher_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа к этому занятию' });
    }

    // Upsert каждую отметку
    for (const m of marks) {
      if (!m.child_id) continue;

      await Attendance.findOneAndUpdate(
        { lesson_id: req.params.lessonId, child_id: m.child_id },
        { present: !!m.present },
        { upsert: true, new: true }
      );
    }

    // Обновляем children_count в занятии
    const presentCount = await Attendance.countDocuments({
      lesson_id: req.params.lessonId,
      present: true
    });

    lesson.children_count = presentCount;
    lesson.updated_at = new Date();
    await lesson.save();

    res.json({
      success: true,
      message: `Отмечено ${presentCount} из ${marks.length} детей`,
      present_count: presentCount
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
