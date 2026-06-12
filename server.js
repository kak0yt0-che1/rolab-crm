require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { connectDb } = require('./database/connection');
const initializeDb = require('./database/init');

// Без секрета JWT работать нельзя — упасть сразу, а не на первом логине
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-to-random-string') {
  console.error('JWT_SECRET не задан (или оставлен дефолтным) в .env');
  process.exit(1);
}

async function startServer() {
  await connectDb();
  await initializeDb();

  const app = express();
  const PORT = process.env.PORT || 3000;

  // За реверс-прокси (Render) — нужен реальный IP для rate-limit
  app.set('trust proxy', 1);

  // CSP отключён: admin.html грузит SheetJS с CDN, страницы используют inline-скрипты
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  // CORS: по умолчанию same-origin фронт; внешние origin — через переменную окружения
  app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : {}));

  // 2mb — импорт списков детей из Excel идёт через JSON-тело
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/companies', require('./routes/companies'));
  app.use('/api/teachers', require('./routes/teachers'));
  app.use('/api/schedule', require('./routes/schedule'));
  app.use('/api/lessons', require('./routes/lessons'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/children', require('./routes/children'));
  app.use('/api/attendance', require('./routes/attendance'));
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev', require('./routes/dev'));
  }

  // SPA-фолбэк: отдать файл из public, иначе login.html; /api/* → 404 JSON
  app.get(/(.*)/, (req, res) => {
    if (!req.path.startsWith('/api')) {
      const filePath = path.join(__dirname, 'public', path.normalize(req.path).replace(/^(\.\.[\\/])+/, ''));
      if (filePath.startsWith(path.join(__dirname, 'public')) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
      }
      return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }

    return res.status(404).json({ error: 'Not found' });
  });

  // Центральный обработчик ошибок (JSON parse errors, всё, что прошло мимо try/catch роутов)
  app.use((err, req, res, next) => {
    console.error('Ошибка:', err);
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Некорректное тело запроса' });
    }
    const message = process.env.NODE_ENV === 'production'
      ? 'Внутренняя ошибка сервера'
      : err.message;
    res.status(err.status || 500).json({ error: message });
  });

  app.listen(PORT, () => {
    console.log(`ROLAB server started on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
