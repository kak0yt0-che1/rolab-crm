require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const initializeDb = require('./database/init');

async function startServer() {
  // Initialize database
  await initializeDb();

  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/companies', require('./routes/companies'));
  app.use('/api/teachers', require('./routes/teachers'));
  app.use('/api/schedule', require('./routes/schedule'));
  app.use('/api/lessons', require('./routes/lessons'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/dev', require('./routes/dev'));

  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      const filePath = path.join(__dirname, 'public', req.path);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
      }
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('❌ Ошибка:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  app.listen(PORT, () => {
    console.log(`🚀 ROLAB система запущена: http://localhost:${PORT}`);
    console.log(`📋 Вход: admin / admin123`);
  });
}

startServer().catch(err => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
