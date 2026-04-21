const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'dev') {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }
  next();
}

function devOnly(req, res, next) {
  if (req.user.role !== 'dev') {
    return res.status(403).json({ error: 'Доступ только для разработчика' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly, devOnly };
