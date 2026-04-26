const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  try {
    const user = await User.findOne({ username, active: true });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
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
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ id: user._id.toString(), username: user.username, role: user.role, full_name: user.full_name, phone: user.phone });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Введите текущий и новый пароль' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'Новый пароль минимум 4 символа' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Неверный текущий пароль' });
    }
    user.password_hash = bcrypt.hashSync(new_password, 10);
    user.plain_password = new_password;
    await user.save();
    res.json({ success: true, message: 'Пароль успешно изменен' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
