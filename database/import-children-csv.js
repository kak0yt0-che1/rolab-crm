/**
 * Импорт детей из CSV (Google Sheets «База»)
 * Удаляет старых детей, импортирует новых с временем и днём недели.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { connectDb } = require('./connection');
const Company = require('../models/Company');
const KindergartenChild = require('../models/KindergartenChild');

// Маппинг названий из таблицы → название в БД
const ORG_NAME_MAP = {
  'Happy Kais':              'Happy Kais',
  'Город друзей':            'Город Друзей',
  'Город друзей ':           'Город Друзей',
  'Радость Майлина':         'Радость (Майлина)',
  '71 лицей':                '71 Лицей',
  'Радость Розыбакиева':     'Радость (Розыбакиева)',
  'Батыр':                   'Батыр',
  'Капитошка':               'Капитошка',
  'Падишах':                 'Padishah',
  'Куншуак':                 'Куншуак',
  'Гармония':                'Гармония',
  'Interschool':             'Interschool',
  'Конжыктар':               'Конжыктар',
  'Indigo Preschool 1':      'Indigo Preschool (ф.1)',
  'Indigo Preschool 2':      'Indigo Preschool (ф.2)',
  'Кун Ай':                  'Кун-Ай',
  'Klass':                   'Klass',
  'KIDS DISCOVERY':          'Kids Discovery',
  'KIDS DISCOVERY Таугуль':  'Kids Discovery (Таугуль)',
  '116 школа':               '116 Школа',
  'Bilimalmaty':             'Bilimalmaty',
  'Tamos':                   'TAMOS Education',
  'Cosmo':                   'Cosmo',
  'Лукоморья':               'Лукоморья',
};

// Маппинг сокращений дней → полные названия
const DAY_MAP = {
  'ПН': 'Понедельник',
  'ВТ': 'Вторник',
  'СР': 'Среда',
  'ЧТ': 'Четверг',
  'ПТ': 'Пятница',
  'СБ': 'Суббота',
  'ВС': 'Воскресенье',
};

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  // Skip header (line 0)
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV parse (no quoted commas expected)
    const cols = line.split(',');
    const name = (cols[0] || '').trim();
    const org = (cols[1] || '').trim();
    const time = (cols[4] || '').trim();
    const day = (cols[5] || '').trim();
    if (name && org) {
      rows.push({ name, org, time, day });
    }
  }
  return rows;
}

async function importChildrenFromCSV() {
  await connectDb();

  const csvPath = path.join(__dirname, 'children_data.csv');
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);

  console.log('\n══════════════════════════════════════════');
  console.log('  📂 Импорт детей из CSV (Google Sheets)');
  console.log('══════════════════════════════════════════\n');

  // 0. Удаление старых записей
  const deleted = await KindergartenChild.deleteMany({});
  console.log(`🗑️  Удалено ${deleted.deletedCount} старых записей детей\n`);

  // 1. Загрузить все компании из БД
  const companies = await Company.find({});
  const companyByName = {};
  for (const c of companies) {
    companyByName[c.name] = c._id;
  }

  // 2. Импорт
  let created = 0;
  let skipped = 0;
  const missingOrgs = new Set();

  for (const row of rows) {
    const dbName = ORG_NAME_MAP[row.org] || row.org;
    const companyId = companyByName[dbName];
    if (!companyId) {
      missingOrgs.add(row.org);
      skipped++;
      continue;
    }

    const dayFull = DAY_MAP[row.day] || row.day;

    await KindergartenChild.create({
      full_name: row.name,
      company_id: companyId,
      status: 'regular',
      schedule_time: row.time || '',
      schedule_day: dayFull || '',
      active: true,
    });
    created++;
  }

  if (missingOrgs.size > 0) {
    console.log('⚠️  Организации не найдены в БД:');
    for (const o of missingOrgs) console.log(`   - "${o}"`);
    console.log('');
  }

  console.log(`✅ Создано детей: ${created}`);
  console.log(`⚠️  Пропущено: ${skipped}`);
  console.log('\n══════════════════════════════════════════\n');
}

if (require.main === module) {
  importChildrenFromCSV()
    .then(() => process.exit(0))
    .catch(e => { console.error('❌ Ошибка:', e); process.exit(1); });
}

module.exports = importChildrenFromCSV;
