const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const TeacherRate = require('../models/TeacherRate');
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

function generatePassword(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

async function attachCompanies(teacher) {
  const rates = await TeacherRate.find({ teacher_id: teacher._id }).populate('company_id');
  return rates
    .filter(r => r.company_id && r.company_id.active)
    .map(r => ({
      id: r._id.toString(),
      teacher_id: teacher._id.toString(),
      company_id: r.company_id._id.toString(),
      company_name: r.company_id.name,
      company_type: r.company_id.type,
      rate: r.rate
    }));
}

// GET /api/teachers — только для админа/dev
router.get('/', adminOnly, async (req, res) => {
  try {
    const { search, active } = req.query;
    const filter = { role: 'teacher' };
    if (active !== undefined) {
      filter.active = active === '1' || active === 'true';
    } else {
      filter.active = true;
    }
    if (search) filter.$or = [
      { full_name: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } }
    ];

    const teachers = await User.find(filter).sort({ full_name: 1 });
    const result = await Promise.all(teachers.map(async t => ({
      id: t._id.toString(),
      username: t.username,
      full_name: t.full_name,
      phone: t.phone,
      plain_password: t.plain_password,
      active: t.active,
      created_at: t.created_at,
      companies: await attachCompanies(t)
    })));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teachers/list-names — краткий список педагогов (для выбора замены)
router.get('/list-names', async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher', active: true }, 'full_name').sort({ full_name: 1 });
    res.json(teachers.map(t => ({ id: t._id.toString(), full_name: t.full_name })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teachers/me/companies — учитель видит свои компании
router.get('/me/companies', async (req, res) => {
  try {
    const rates = await TeacherRate.find({ teacher_id: req.user.id }).populate('company_id');
    const companies = rates
      .filter(r => r.company_id && r.company_id.active)
      .map(r => ({
        id: r.company_id._id.toString(),
        name: r.company_id.name,
        type: r.company_id.type,
        rate: r.rate
      }));
    res.json(companies);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teachers/:id
router.get('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const teacher = await User.findOne({ _id: req.params.id, role: 'teacher' });
    if (!teacher) return res.status(404).json({ error: 'Педагог не найден' });

    const rates = await TeacherRate.find({ teacher_id: teacher._id }).populate('company_id');
    res.json({
      id: teacher._id.toString(),
      username: teacher.username,
      full_name: teacher.full_name,
      phone: teacher.phone,
      plain_password: teacher.plain_password,
      active: teacher.active,
      created_at: teacher.created_at,
      rates: rates.map(r => ({
        id: r._id.toString(),
        teacher_id: teacher._id.toString(),
        company_id: r.company_id ? r.company_id._id.toString() : null,
        company_name: r.company_id ? r.company_id.name : null,
        company_type: r.company_id ? r.company_id.type : null,
        rate: r.rate
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teachers
router.post('/', adminOnly, async (req, res) => {
  const { username, full_name, phone, company_ids } = req.body;
  if (!username || !full_name) return res.status(400).json({ error: 'Укажите логин и ФИО' });

  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Логин уже занят' });

    const plainPassword = generatePassword();
    const hash = bcrypt.hashSync(plainPassword, 10);
    const teacher = await User.create({
      username, password_hash: hash, plain_password: plainPassword,
      role: 'teacher', full_name, phone: phone || ''
    });

    if (company_ids && Array.isArray(company_ids)) {
      for (const cid of company_ids) {
        await TeacherRate.create({ teacher_id: teacher._id, company_id: cid, rate: null });
      }
    }

    res.status(201).json({
      id: teacher._id.toString(),
      username: teacher.username,
      full_name: teacher.full_name,
      phone: teacher.phone,
      plain_password: teacher.plain_password,
      active: teacher.active,
      created_at: teacher.created_at
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/teachers/:id
router.put('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { full_name, phone, password, active } = req.body;
  try {
    const teacher = await User.findOne({ _id: req.params.id, role: 'teacher' });
    if (!teacher) return res.status(404).json({ error: 'Педагог не найден' });

    if (full_name !== undefined) teacher.full_name = full_name;
    if (phone !== undefined) teacher.phone = phone;
    if (active !== undefined) teacher.active = active;
    if (password) {
      if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
      teacher.password_hash = bcrypt.hashSync(password, 10);
      teacher.plain_password = password;
    }
    await teacher.save();

    res.json({
      id: teacher._id.toString(),
      username: teacher.username,
      full_name: teacher.full_name,
      phone: teacher.phone,
      plain_password: teacher.plain_password,
      active: teacher.active,
      created_at: teacher.created_at
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/teachers/:id
router.delete('/:id', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    await User.findOneAndUpdate({ _id: req.params.id, role: 'teacher' }, { active: false });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teachers/:id/rates
router.get('/:id/rates', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  try {
    const rates = await TeacherRate.find({ teacher_id: req.params.id }).populate('company_id');
    res.json(rates.map(r => ({
      id: r._id.toString(),
      teacher_id: r.teacher_id.toString(),
      company_id: r.company_id ? r.company_id._id.toString() : null,
      company_name: r.company_id ? r.company_id.name : null,
      company_type: r.company_id ? r.company_id.type : null,
      rate: r.rate
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/teachers/:id/rates — только админ может менять ставки
router.put('/:id/rates', adminOnly, async (req, res) => {
  if (badId(res, req.params.id)) return;
  const { rates } = req.body;
  if (!Array.isArray(rates)) return res.status(400).json({ error: 'rates должен быть массивом' });

  try {
    await TeacherRate.deleteMany({ teacher_id: req.params.id });
    for (const r of rates) {
      await TeacherRate.create({ teacher_id: req.params.id, company_id: r.company_id, rate: r.rate || null });
    }
    const updated = await TeacherRate.find({ teacher_id: req.params.id }).populate('company_id');
    res.json(updated.map(r => ({
      id: r._id.toString(),
      teacher_id: r.teacher_id.toString(),
      company_id: r.company_id ? r.company_id._id.toString() : null,
      company_name: r.company_id ? r.company_id.name : null,
      company_type: r.company_id ? r.company_id.type : null,
      rate: r.rate
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
