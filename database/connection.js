const mongoose = require('mongoose');

let connected = false;

async function connectDb() {
  if (connected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI не задан в .env');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000
  });
  connected = true;
  console.log('✅ MongoDB подключена');
}

module.exports = { connectDb };
