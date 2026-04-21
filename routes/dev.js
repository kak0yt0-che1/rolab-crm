const express = require('express');
const { getDb } = require('../database/connection');
const { authMiddleware, devOnly } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();
router.use(authMiddleware);
router.use(devOnly);

router.get('/users', (req, res) => {
  const db = getDb();
  try {
    const users = db.prepare('SELECT id, username, plain_password, role, full_name, active FROM users').all();
    res.json(users);
  } catch (e) {
    res.status(500).json({error: e.message});
  } finally {
    db.close();
  }
});

module.exports = router;
