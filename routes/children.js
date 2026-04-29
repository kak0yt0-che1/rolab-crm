const express = require('express');
const mongoose = require('mongoose');
const KindergartenChild = require('../models/KindergartenChild');
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

// GET /api/children?company_id=...&status=...&search=...
router.get('/', async (req, res) => {
  try {
    const { company_id, status, search, active } = req.query;
    const filter = {};

    if (active !== undefined) {
      filter.active = active === '1' || active === 'true';
    } else {
      filter.active = true;
    }

    if (company_id) {
      if (badId(res, company_id)) return;
      filter.company_id = company_id;
    }
    if (status && ['regular', 'trial'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.full_name = { $regex: search, $options: 'i' };
    }

    const children = await KindergartenChild.find(filter)
      .populate('company_id', 'name type')
      .sort({ full_name: 1 });

    const result = children.map(c => ({
      ...c.toJSON(),
      company_name: c.company_id ? c.company_id.name : '—',
      company_type: c.company_id ? c.company_id.type : null
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/children/:id
router.get('/:id', async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const child = await KindergartenChild.findById(req.params.id)
      .populate('company_id', 'name type');
    if (!child) return res.status(404).json({ error: 'Ребёнок не найден' });
    res.json(child);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/children — добавить ребёнка
router.post('/', adminOnly, async (req, res) => {
  const { full_name, company_id, status } = req.body;
  if (!full_name || !company_id) {
    return res.status(400).json({ error: 'Укажите ФИО и садик' });
  }
  if (badId(res, company_id)) return;

  try {
    // Проверяем что компания — садик
    const company = await Company.findById(company_id);
    if (!company) return res.status(404).json({ error: 'Садик не найден' });
    if (company.type !== 'kindergarten') {
      return res.status(400).json({ error: 'Списки детей доступны только для садиков' });
    }

    const child = await KindergartenChild.create({
      full_name: full_name.trim(),
      company_id,
      status: status || 'trial'
    });
    res.status(201).json(child);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/children/:id — обновить данные ребёнка
router.put('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { full_name, status, active } = req.body;
  try {
    const update = {};
    if (full_name !== undefined) update.full_name = full_name.trim();
    if (status !== undefined && ['regular', 'trial'].includes(status)) update.status = status;
    if (active !== undefined) update.active = active;

    const child = await KindergartenChild.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!child) return res.status(404).json({ error: 'Ребёнок не найден' });
    res.json(child);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/children/:id/promote — пробный → регуляр
router.put('/:id/promote', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const child = await KindergartenChild.findById(req.params.id);
    if (!child) return res.status(404).json({ error: 'Ребёнок не найден' });
    if (child.status === 'regular') {
      return res.status(400).json({ error: 'Ребёнок уже регуляр' });
    }
    child.status = 'regular';
    await child.save();
    res.json({ success: true, message: 'Ребёнок переведён в регуляры' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/children/:id — мягкое удаление
router.delete('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    await KindergartenChild.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/children/import — импорт из Excel (парсинг на сервере)
router.post('/import', adminOnly, async (req, res) => {
  const { children } = req.body;
  // children: [{ full_name, company_id, status }]
  if (!children || !Array.isArray(children) || children.length === 0) {
    return res.status(400).json({ error: 'Список детей пуст' });
  }

  try {
    let created = 0;
    let skipped = 0;

    for (const item of children) {
      if (!item.full_name || !item.company_id) {
        skipped++;
        continue;
      }

      // Проверяем дубли по имени и садику
      const exists = await KindergartenChild.findOne({
        full_name: { $regex: `^${item.full_name.trim()}$`, $options: 'i' },
        company_id: item.company_id
      });

      if (exists) {
        skipped++;
        continue;
      }

      await KindergartenChild.create({
        full_name: item.full_name.trim(),
        company_id: item.company_id,
        status: item.status || 'regular'
      });
      created++;
    }

    res.json({
      success: true,
      message: `Импортировано: ${created}, пропущено (дубли): ${skipped}`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
