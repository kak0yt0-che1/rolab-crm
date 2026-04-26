require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { connectDb } = require('./connection');
const User = require('../models/User');

async function initialize() {
  await connectDb();

  const seedUser = async (username, password, role, fullName) => {
    const exists = await User.findOne({ username });
    if (!exists) {
      const hash = bcrypt.hashSync(password, 10);
      await User.create({ username, password_hash: hash, plain_password: password, role, full_name: fullName });
      console.log(`✅ Создан ${role}: ${username} / ${password}`);
    }
  };

  // 2 администратора с разными паролями + разработчик
  await seedUser('admin1', 'Admin@1234', 'admin', 'Администратор 1');
  await seedUser('admin2', 'Rolab@5678', 'admin', 'Администратор 2');
  await seedUser('dev', 'dev123', 'dev', 'Разработчик');

  console.log('✅ База данных инициализирована');
}

if (require.main === module) {
  initialize().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = initialize;
