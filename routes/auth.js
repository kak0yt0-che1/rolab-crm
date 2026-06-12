const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { serverError } = require('../utils/http');

const router = express.Router();

// Защита от перебора паролей: 20 попыток входа с одного IP за 15 минут
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  // строгая проверка типов — объект вместо строки уходит в Mongo-запрос как оператор
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  try {
    const user = await User.findOne({ username, active: true });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = jwt.sign(
      { id: user._id.toString(), username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      token,
      user: { id: user._id.toString(), username: user.username, role: user.role, full_name: user.full_name }
    });
  } catch (e) {
    serverError(res, e);
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ id: user._id.toString(), username: user.username, role: user.role, full_name: user.full_name, phone: user.phone });
  } catch (e) {
    serverError(res, e);
  }
});

router.put('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (typeof current_password !== 'string' || typeof new_password !== 'string' || !current_password || !new_password) {
    return res.status(400).json({ error: 'Введите текущий и новый пароль' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Новый пароль минимум 6 символов' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(400).json({ error: 'Неверный текущий пароль' });
    }
    user.password_hash = await bcrypt.hash(new_password, 10);
    user.plain_password = new_password;
    await user.save();
    res.json({ success: true, message: 'Пароль успешно изменен' });
  } catch (e) {
    serverError(res, e);
  }
});

module.exports = router;
