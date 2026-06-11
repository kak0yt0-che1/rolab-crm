const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const KindergartenChild = require('../models/KindergartenChild');
const Lesson = require('../models/Lesson');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Маппинг day_of_week (1-7) → название дня для фильтрации по группам
const DAY_NAMES = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

/** Нормализует время из формата HTML input ("09:00") в формат CSV ("9:00") */
function normalizeTime(time) {
  return (time || '').replace(/^0(\d)/, '$1');
}

function badId(res, id) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Неверный идентификатор' });
    return true;
  }
  return false;
}

/**
 * Возвращает «дефолтный» состав группы по расписанию занятия
 * (день + время слота совпадают с расписанием ребёнка в садике).
 */
async function autoMatchedChildren(slot, companyId) {
  const slotDay = DAY_NAMES[slot.day_of_week] || '';
  const slotTime = normalizeTime(slot.time_start);
  const childFilter = { company_id: companyId, active: true };
  if (slotDay) childFilter.schedule_day = slotDay;
  if (slotTime) childFilter.schedule_time = slotTime;
  return KindergartenChild.find(childFilter).sort({ full_name: 1 });
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

    const slot = lesson.schedule_slot_id;

    // Существующие отметки для занятия
    const marks = await Attendance.find({ lesson_id: req.params.lessonId });
    const markMap = {};
    marks.forEach(m => { markMap[m.child_id.toString()] = m.present; });

    let listChildren;
    if (marks.length > 0) {
      // Список «зафиксирован» — берём именно детей с отметками (с учётом ручных правок)
      const ids = marks.map(m => m.child_id);
      listChildren = await KindergartenChild.find({ _id: { $in: ids } }).sort({ full_name: 1 });
    } else {
      // Ещё не отмечали — показываем дефолтный состав группы по расписанию
      listChildren = await autoMatchedChildren(slot, company._id);
    }

    const result = listChildren.map(c => ({
      child_id: c._id.toString(),
      full_name: c.full_name,
      status: c.status,
      present: markMap[c._id.toString()] || false
    }));

    // Все дети садика — для добавления в список (кого можно доотметить)
    const allChildren = await KindergartenChild.find({ company_id: company._id, active: true })
      .sort({ full_name: 1 });
    const inListIds = new Set(result.map(r => r.child_id));
    const available = allChildren
      .filter(c => !inListIds.has(c._id.toString()))
      .map(c => ({ child_id: c._id.toString(), full_name: c.full_name, status: c.status }));

    res.json({
      lesson_id: req.params.lessonId,
      company_name: company.name,
      lesson_status: lesson.status,
      children: result,
      available,
      total: result.length,
      present_count: result.filter(r => r.present).length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/attendance/:lessonId — сохранить отметки (заменяет состав списка занятия)
router.put('/:lessonId', async (req, res) => {
  if (badId(res, req.params.lessonId)) return;

  const { marks, complete } = req.body;
  // marks: [{ child_id, present: true/false }] — это итоговый состав списка для занятия
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

    // Итоговый набор child_id, которые должны остаться в списке занятия
    const keepIds = marks
      .filter(m => m.child_id && mongoose.isValidObjectId(m.child_id))
      .map(m => m.child_id.toString());

    // Удаляем отметки детей, которых убрали из списка
    await Attendance.deleteMany({
      lesson_id: req.params.lessonId,
      child_id: { $nin: keepIds }
    });

    // Upsert каждую отметку из переданного списка
    for (const m of marks) {
      if (!m.child_id || !mongoose.isValidObjectId(m.child_id)) continue;
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
    if (complete) lesson.status = 'completed';
    lesson.updated_at = new Date();
    await lesson.save();

    res.json({
      success: true,
      message: complete
        ? `Занятие проведено. Присутствовало ${presentCount} детей`
        : `Отмечено ${presentCount} из ${marks.length} детей`,
      present_count: presentCount,
      lesson_status: lesson.status
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
