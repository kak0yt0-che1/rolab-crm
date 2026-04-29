/**
 * Импорт данных из Excel-файла "Копия alfarobot табеля.xlsx"
 * 
 * Извлекает:
 *  - Компании (школы, садики) → Company
 *  - Детей → KindergartenChild
 *  - Преподавателей → User (role: 'teacher')
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const { connectDb } = require('./connection');
const Company = require('../models/Company');
const KindergartenChild = require('../models/KindergartenChild');
const User = require('../models/User');

// ── Маппинг листов Excel на компании ──────────────────────────────
// Каждый элемент: { sheet, name, type, address?, contact_person?, phone? }
const COMPANY_SHEETS = [
  { sheet: 'Happy Kais ',       name: 'Happy Kais',                type: 'kindergarten', address: 'Ураза Исаева 117',              contact_person: 'Татьяна',                  phone: '87472623755' },
  { sheet: 'Конжыктар',         name: 'Конжыктар',                 type: 'kindergarten', address: 'Римова 11',                     contact_person: 'Зульфия Тогаевна',         phone: '87788490717' },
  { sheet: 'Indigo preschool 1',name: 'Indigo Preschool (ф.1)',    type: 'kindergarten', address: 'Розыбакиева 289/2',             contact_person: 'Салтанат',                  phone: '87071515141' },
  { sheet: 'Indigo preschool 2',name: 'Indigo Preschool (ф.2)',    type: 'kindergarten', address: 'Абая Масанчи',                  contact_person: 'Салтанат',                  phone: '87071515141' },
  { sheet: 'Bilimalmaty',       name: 'Bilimalmaty',               type: 'kindergarten', address: 'ЖК Терракота',                  contact_person: 'Арайлым',                   phone: '87073834121' },
  { sheet: 'Tamos',             name: 'TAMOS Education',           type: 'school',       address: 'Сартай батыра 12а',             contact_person: 'Назгуль',                   phone: '87079687985' },
  { sheet: 'Город друзей',      name: 'Город Друзей',              type: 'kindergarten', address: 'Ремизовка',                     contact_person: 'Бахыт Бейбитбаевна',        phone: '87087160878' },
  { sheet: '71 лицей',          name: '71 Лицей',                  type: 'school',       address: '',                              contact_person: 'Алия Аркеновна',            phone: '87471374110' },
  { sheet: '116 школа',         name: '116 Школа',                 type: 'school',       address: '',                              contact_person: '',                          phone: '' },
  { sheet: 'Almaty Towers(старый)', name: 'Almaty Towers',         type: 'kindergarten', address: '',                              contact_person: 'Нигара',                    phone: '87014491881' },
  { sheet: 'Балбобек(старый)',  name: 'Балбобек',                  type: 'kindergarten', address: 'Брусиловского 17',              contact_person: 'Назира Байсултановна',      phone: '87018167272' },
  { sheet: 'Падишах',           name: 'Padishah',                  type: 'kindergarten', address: '',                              contact_person: 'Лейла',                     phone: '87772323403' },
  { sheet: 'Капитошка',         name: 'Капитошка',                 type: 'kindergarten', address: '',                              contact_person: 'Оксана Сергеевна',          phone: '87770330039' },
  { sheet: 'Гармония',          name: 'Гармония',                  type: 'kindergarten', address: 'Кок Тобе',                      contact_person: 'Валентина',                 phone: '77770153142' },
  { sheet: 'Куншуак',           name: 'Куншуак',                   type: 'kindergarten', address: 'Ульяновская 32',                contact_person: 'Галина Владимировна',       phone: '87012189232' },
  { sheet: 'Academ kids',       name: 'Academ Kids',               type: 'kindergarten', address: 'Сайран',                        contact_person: 'Улдана',                    phone: '87770190668' },
  { sheet: 'kids discovery',    name: 'Kids Discovery',            type: 'kindergarten', address: 'Пчеловодная 4',                 contact_person: 'Аида',                      phone: '87762878800' },
  { sheet: 'kids discovery Таугуль', name: 'Kids Discovery (Таугуль)', type: 'kindergarten', address: 'Таугуль',                   contact_person: 'Аида',                      phone: '87762878800' },
  { sheet: 'Кунай',             name: 'Кун-Ай',                    type: 'kindergarten', address: '',                              contact_person: 'Анара',                     phone: '87078087531' },
  { sheet: 'Асека education',   name: 'Aseka Education',           type: 'kindergarten', address: '',                              contact_person: 'Асель',                     phone: '87477700076' },
  { sheet: 'Асека +',           name: 'Aseka+ (Кызыл Ту)',         type: 'kindergarten', address: 'Кызыл Ту',                      contact_person: 'Айнур',                     phone: '87770299498' },
  { sheet: 'Лукоморья',         name: 'Лукоморья',                 type: 'kindergarten', address: '',                              contact_person: 'Ирина',                     phone: '87017128784' },
  { sheet: 'Зияткер',           name: 'Ziyatker Plus',             type: 'kindergarten', address: '',                              contact_person: 'Алина',                     phone: '87767554411' },
  { sheet: 'Радость Майлина',   name: 'Радость (Майлина)',         type: 'kindergarten', address: 'Майлина',                       contact_person: 'Алия Бауыржановна',         phone: '87772380044' },
  { sheet: 'Радость Розыбакиева', name: 'Радость (Розыбакиева)',   type: 'kindergarten', address: 'Розыбакиева',                   contact_person: 'Динара Сардаровна',         phone: '87472949588' },
  { sheet: '28 февраля Happy Time - Еркебул', name: 'Happy Time',  type: 'school',       address: '',                              contact_person: '',                          phone: '' },
  { sheet: 'Космо',             name: 'Cosmo',                     type: 'kindergarten', address: '',                              contact_person: 'Жанель',                    phone: '87028817799' },
  { sheet: 'Interschool',       name: 'Interschool',               type: 'school',       address: '',                              contact_person: 'Ольга Евгеньевна',          phone: '87012107701' },
  { sheet: 'Батыр',             name: 'Батыр',                     type: 'kindergarten', address: '',                              contact_person: 'Айгуль',                    phone: '87755167492' },
  { sheet: 'Klass',             name: 'Klass',                     type: 'kindergarten', address: '',                              contact_person: 'Яна',                       phone: '87474619726' },
  { sheet: 'Жажда познания',    name: 'Жажда Познания',            type: 'kindergarten', address: 'Шаврова 34',                    contact_person: 'Наталья',                   phone: '87071113698' },
  { sheet: 'ProЗнания',         name: 'ProЗнания',                 type: 'kindergarten', address: 'Думан Грин Сити',               contact_person: 'Мадина',                    phone: '877079464460' },
];

// ── Преподаватели (из листа «Расписание» + упоминания в листах) ───
const TEACHERS = [
  { full_name: 'Айгуль',     username: 'aigul' },
  { full_name: 'Еркебулан',  username: 'erkebulan' },
  { full_name: 'Айжан',      username: 'aizhan' },
  { full_name: 'Дамир',      username: 'damir' },
  { full_name: 'Салтанат',   username: 'saltanat' },
  { full_name: 'Дархан',     username: 'darkhan' },
  { full_name: 'Сержан',     username: 'serzhan' },
  { full_name: 'Нурлан',     username: 'nurlan' },
  { full_name: 'Балгын',     username: 'balgyn' },
  { full_name: 'Нургиса',    username: 'nurgisa' },
  { full_name: 'Ерасыл',     username: 'erasyl' },
  { full_name: 'Адлет',      username: 'adlet' },
  { full_name: 'Катя',       username: 'katya' },
];

// ─────────────────────────────────────────────────────────────────
// Утилита: определить, является ли строка заголовком таблицы детей
// ─────────────────────────────────────────────────────────────────
function isHeaderRow(row) {
  // Заголовок содержит «ФИО», «Ф.И.О», «Фио», «Имя» в одном из первых двух столбцов
  for (let c = 0; c <= Math.min(1, row.length - 1); c++) {
    const val = String(row[c]).trim().toLowerCase();
    if (/^(ф\.?и\.?о|фио|имя)/.test(val)) return true;
    if (val === '№' && row.length > 1) {
      const next = String(row[1]).trim().toLowerCase();
      if (/^(ф\.?и\.?о|фио|имя)/.test(next)) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Утилита: является ли значение именем ребенка (а не мусором)
// ─────────────────────────────────────────────────────────────────
function isValidChildName(name) {
  if (!name || name.length < 2) return false;
  const lower = name.toLowerCase();
  // Пропускаем заголовки и итоги
  if (/^(ф\.?и\.?о|фио|№|всего|итого|имя)/i.test(name)) return false;
  // Пропускаем ссылки
  if (/^http/i.test(name)) return false;
  // Пропускаем чистые числа (цена, дата)
  if (/^\d+$/.test(name)) return false;
  // Пропускаем время (10:00, 15.30-16.30 и тп)
  if (/^[\d.:/-]+$/.test(name)) return false;
  // Пропускаем телефоны
  if (/^\+?\d[\d\s()-]{6,}/.test(name)) return false;
  // Пропускаем метаинформацию
  if (/^(моб|тел|контакт|адрес|ул\.|район|директор|воспит|группа|филиал|разница|пробн|понедельник|вторник|среда|четверг|пятница|суббота|воскресен)/i.test(name)) return false;
  // Пропускаем известные не-имена (названия групп, компаний)
  if (['наследники', 'морковки', 'байтерек тобы'].includes(lower)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Утилита: извлечь имена детей из листа Excel
// Стратегия: находим строку-заголовок (ФИО), берём детей ТОЛЬКО после неё
// ─────────────────────────────────────────────────────────────────
function extractChildren(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const allChildren = [];
  const seen = new Set();

  let inChildrenBlock = false; // мы внутри блока с детьми (после заголовка)
  let nameCol = 1;            // в каком столбце ФИО (обычно 1, в Лукоморья — 0)

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    // Проверяем, является ли это строкой-заголовком
    if (isHeaderRow(row)) {
      inChildrenBlock = true;
      // Определяем, в каком столбце имена
      const col0 = String(row[0]).trim().toLowerCase();
      if (/^(ф\.?и\.?о|фио|имя)/.test(col0)) {
        nameCol = 0; // Лукоморья и подобные — имена в col0
      } else {
        nameCol = 1; // Стандартный формат — имена в col1
      }
      continue;
    }

    if (!inChildrenBlock) continue;

    const col0 = String(row[0]).trim();
    const colName = String(row[nameCol]).trim();

    // Проверяем конец блока: «Всего», «итого», пустая строка с «Всего»
    const colNameLower = colName.toLowerCase();
    if (/^(всего|итого)/i.test(colName)) {
      inChildrenBlock = false; // закончили текущий блок, ищем следующий заголовок
      continue;
    }

    // Если попали на строку-разделитель (полностью пустая), пропускаем, 
    // но не выходим из блока — могут быть ещё дети с пустыми номерами
    if (!col0 && !colName) continue;

    // Если col0 — это дата/день недели (новый блок расписания), выходим
    if (/^(понедельник|вторник|среда|четверг|пятница|суббота|воскресен)/i.test(col0)) {
      inChildrenBlock = false;
      continue;
    }

    // Имя ребенка
    const name = colName;

    // Если имя пустое — пропускаем (Academ kids: номера есть, имена пустые)
    if (!name) continue;

    // Проверяем валидность имени
    if (!isValidChildName(name)) continue;

    // col0 должен быть порядковым номером или пустым
    const isNumbered = /^\d+$/.test(col0);
    const isEmpty = col0 === '';
    if (!isNumbered && !isEmpty) {
      // Если col0 не пустой и не число, это может быть новый заголовок или мусор — выходим
      inChildrenBlock = false;
      continue;
    }

    const key = name.toLowerCase() + '___' + sheetName;
    if (!seen.has(key)) {
      seen.add(key);
      allChildren.push(name);
    }
  }

  return allChildren;
}

// ─────────────────────────────────────────────────────────────────
// Основная функция импорта
// ─────────────────────────────────────────────────────────────────
async function importFromXlsx() {
  await connectDb();

  const xlsxPath = path.join(__dirname, '..', 'Копия alfarobot табеля.xlsx');
  const wb = XLSX.readFile(xlsxPath);

  console.log('\n══════════════════════════════════════════');
  console.log('  📂 Импорт данных из Excel');
  console.log('══════════════════════════════════════════\n');

  // ── 0. Очистка старых детей ──────────────────────────────────
  const deletedChildren = await KindergartenChild.deleteMany({});
  console.log(`🗑️  Удалено ${deletedChildren.deletedCount} старых записей детей\n`);

  // ── 1. Преподаватели ─────────────────────────────────────────
  console.log('👨‍🏫 Импорт преподавателей...');
  const teacherMap = {};
  let teachersCreated = 0;
  let teachersSkipped = 0;

  for (const t of TEACHERS) {
    let user = await User.findOne({ username: t.username });
    if (!user) {
      const password = t.username + '123';
      const hash = bcrypt.hashSync(password, 10);
      user = await User.create({
        username: t.username,
        password_hash: hash,
        plain_password: password,
        role: 'teacher',
        full_name: t.full_name,
        active: true
      });
      console.log(`  ✅ ${t.full_name} (${t.username} / ${password})`);
      teachersCreated++;
    } else {
      teachersSkipped++;
    }
    teacherMap[t.full_name.toLowerCase()] = user._id;
  }
  console.log(`  📊 Создано: ${teachersCreated}, пропущено (уже есть): ${teachersSkipped}\n`);

  // ── 2. Компании (школы/садики) ──────────────────────────────
  console.log('🏫 Импорт компаний...');
  const companyMap = {};
  let companiesCreated = 0;
  let companiesSkipped = 0;

  for (const c of COMPANY_SHEETS) {
    let company = await Company.findOne({ name: c.name });
    if (!company) {
      company = await Company.create({
        name: c.name,
        type: c.type,
        address: c.address || '',
        contact_person: c.contact_person || '',
        phone: c.phone || '',
        active: true
      });
      const icon = c.type === 'school' ? '🏫' : '🏠';
      console.log(`  ${icon} ${c.name} (${c.type})`);
      companiesCreated++;
    } else {
      companiesSkipped++;
    }
    companyMap[c.sheet] = company._id;
  }
  console.log(`  📊 Создано: ${companiesCreated}, пропущено (уже есть): ${companiesSkipped}\n`);

  // ── 3. Дети ──────────────────────────────────────────────────
  console.log('👶 Импорт детей...');
  let childrenCreated = 0;

  for (const c of COMPANY_SHEETS) {
    const companyId = companyMap[c.sheet];
    if (!companyId) continue;

    const names = extractChildren(wb, c.sheet);
    if (names.length === 0) {
      console.log(`  ⚠️  ${c.name}: 0 детей (лист пустой или не удалось распознать)`);
      continue;
    }

    console.log(`  📋 ${c.name}: ${names.length} детей`);
    for (const name of names) {
      console.log(`     • ${name}`);
    }

    for (const name of names) {
      await KindergartenChild.create({
        full_name: name,
        company_id: companyId,
        status: 'regular',
        active: true
      });
      childrenCreated++;
    }
  }
  console.log(`\n  📊 Всего создано детей: ${childrenCreated}\n`);

  // ── Итог ─────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════');
  console.log('  ✅ Импорт завершён!');
  console.log(`  👨‍🏫 Преподавателей: ${teachersCreated} новых`);
  console.log(`  🏫 Компаний: ${companiesCreated} новых`);
  console.log(`  👶 Детей: ${childrenCreated} новых`);
  console.log('══════════════════════════════════════════\n');
}

// ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  importFromXlsx()
    .then(() => process.exit(0))
    .catch(e => { console.error('❌ Ошибка импорта:', e); process.exit(1); });
}

module.exports = importFromXlsx;
