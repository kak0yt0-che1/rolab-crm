require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { connectDb } = require('./database/connection');
const initializeDb = require('./database/init');

async function startServer() {
  await connectDb();
  await initializeDb();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/companies', require('./routes/companies'));
  app.use('/api/teachers', require('./routes/teachers'));
  app.use('/api/schedule', require('./routes/schedule'));
  app.use('/api/lessons', require('./routes/lessons'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/dev', require('./routes/dev'));

  app.get(/(.*)/, (req, res) => {
    if (!req.path.startsWith('/api')) {
      const filePath = path.join(__dirname, 'public', req.path);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
      }
      return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }

    return res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    console.error('Ошибка:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  app.listen(PORT, () => {
    console.log(`ROLAB server started on port ${PORT}`);
    console.log(`Вход: admin1 / Admin@1234  или  admin2 / Rolab@5678`);
  });
}

startServer().catch(err => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
