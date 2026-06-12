const mongoose = require('mongoose');

let connected = false;

async function connectDb() {
  if (connected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI не задан в .env');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10
  });
  connected = true;

  mongoose.connection.on('error', err => {
    console.error('Ошибка соединения MongoDB:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB отключена, mongoose попробует переподключиться');
  });

  console.log('✅ MongoDB подключена');
}

module.exports = { connectDb };
