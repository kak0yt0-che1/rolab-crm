const express = require('express');
const mongoose = require('mongoose');
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

// GET — все пользователи могут читать список компаний (нужно учителям для расписания)
router.get('/', async (req, res) => {
  try {
    const { type, search, active } = req.query;
    const filter = {};

    if (active !== undefined) {
      filter.active = active === '1' || active === 'true';
    } else {
      filter.active = true;
    }

    if (type) filter.type = type;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const companies = await Company.find(filter).sort({ name: 1 });
    res.json(companies);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Компания не найдена' });
    res.json(company);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', adminOnly, async (req, res) => {
  const { name, type, address, contact_person, phone } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Укажите название и тип компании' });
  if (!['school', 'kindergarten'].includes(type)) {
    return res.status(400).json({ error: 'Тип: school или kindergarten' });
  }
  try {
    const company = await Company.create({ name, type, address, contact_person, phone });
    res.status(201).json(company);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { name, type, address, contact_person, phone, active } = req.body;
  try {
    const update = {};
    if (name !== undefined) update.name = name;
    if (type !== undefined) update.type = type;
    if (address !== undefined) update.address = address;
    if (contact_person !== undefined) update.contact_person = contact_person;
    if (phone !== undefined) update.phone = phone;
    if (active !== undefined) update.active = active;

    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!company) return res.status(404).json({ error: 'Компания не найдена' });
    res.json(company);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    await Company.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
