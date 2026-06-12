/**
 * ROLAB — Admin Panel Logic
 */

// ============================================================
// AUTH CHECK
// ============================================================
const user = API.getUser();
if (!user || (user.role !== 'admin' && user.role !== 'dev')) {
  window.location.href = '/login.html';
}
document.getElementById('header-user-name').textContent = user.full_name;

// ============================================================
// NAVIGATION
// ============================================================
let currentPage = 'dashboard';

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.app-nav a').forEach(el => el.classList.remove('active'));

  const section = document.getElementById('page-' + page);
  const link = document.querySelector(`.app-nav a[data-page="${page}"]`);
  if (section) section.classList.add('active');
  if (link) link.classList.add('active');

  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'companies': loadCompanies(); break;
    case 'teachers': loadTeachers(); loadFilterOptions(); break;
    case 'schedule': loadSchedule(); loadFilterOptions(); break;
    case 'lessons': loadLessons(); loadFilterOptions(); break;
    case 'reports': loadFilterOptions(); break;
    case 'payments': loadFilterOptions(); break;
    case 'children': loadChildren(); loadKindergartenOptions(); break;
  }
}

document.querySelectorAll('.app-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    window.location.hash = page;
    navigateTo(page);
  });
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);
});

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show');
  });
});

// ============================================================
// CACHED DATA
// ============================================================
let allTeachers = [];
let allCompanies = [];

async function loadFilterOptions() {
  try {
    allTeachers = await API.get('/teachers') || [];
    allCompanies = await API.get('/companies') || [];
  } catch (e) {
    console.error(e);
  }

  const teacherSelects = [
    'schedule-filter-teacher', 'lessons-filter-teacher',
    'reports-filter-teacher', 'payments-filter-teacher',
    'slot-teacher', 'lesson-substitute-teacher'
  ];
  teacherSelects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    const isFilter = id.includes('filter');
    const isSub = id === 'lesson-substitute-teacher';
    el.innerHTML = isFilter ? '<option value="">Все</option>'
      : isSub ? '<option value="">— Не менять —</option>'
      : '';
    allTeachers.forEach(t => {
      el.innerHTML += `<option value="${t.id}">${escHtml(t.full_name)}</option>`;
    });
    if (val) el.value = val;
  });

  const companySelects = [
    'schedule-filter-company', 'lessons-filter-company',
    'reports-filter-company', 'slot-company', 'teacher-filter-company'
  ];
  companySelects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    const isFilter = id.includes('filter');
    el.innerHTML = isFilter ? '<option value="">Все</option>' : '';
    allCompanies.forEach(c => {
      const typeLabel = c.type === 'kindergarten' ? '(садик)' : '(школа)';
      el.innerHTML += `<option value="${c.id}">${escHtml(c.name)} ${typeLabel}</option>`;
    });
    if (val) el.value = val;
  });
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  try {
    const today = todayStr();
    const month = getCurrentMonthRange();

    const [lessons, companies, teachers, report] = await Promise.all([
      API.get(`/lessons?date=${today}`),
      API.get('/companies'),
      API.get('/teachers'),
      API.get(`/reports/summary?date_from=${month.from}&date_to=${month.to}`)
    ]);

    document.getElementById('dashboard-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${companies.length}</div>
        <div class="stat-label">Компаний</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${teachers.length}</div>
        <div class="stat-label">Педагогов</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.totals.completed || 0}</div>
        <div class="stat-label">Занятий за месяц</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${lessons.length}</div>
        <div class="stat-label">Занятий сегодня</div>
      </div>
    `;

    const tbody = document.getElementById('dashboard-today-body');
    if (lessons.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет занятий на сегодня</td></tr>';
    } else {
      tbody.innerHTML = lessons.map(l => `
        <tr>
          <td>${formatTimeRange(l.time_start, l.time_end)}</td>
          <td>${escHtml(l.actual_teacher_name)}</td>
          <td>${escHtml(l.company_name)}</td>
          <td>${escHtml(l.group_name) || '—'}</td>
          <td>${statusBadge(l.status)}</td>
          <td>${l.status === 'completed' ? l.children_count : '—'}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('Dashboard error:', e);
  }
}

// ============================================================
// COMPANIES
// ============================================================
async function loadCompanies() {
  try {
    const type = document.getElementById('company-filter-type').value;
    const search = document.getElementById('company-filter-search').value;
    let query = '/companies?';
    if (type) query += `type=${type}&`;
    if (search) query += `search=${encodeURIComponent(search)}&`;

    const companies = await API.get(query);
    const tbody = document.getElementById('companies-body');

    if (companies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет компаний</td></tr>';
      return;
    }

    tbody.innerHTML = companies.map(c => `
      <tr>
        <td><strong>${escHtml(c.name)}</strong></td>
        <td>${companyTypeBadge(c.type)}</td>
        <td>${escHtml(c.address) || '—'}</td>
        <td>${escHtml(c.contact_person) || '—'}</td>
        <td>${escHtml(c.phone) || '—'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline" onclick="editCompany('${c.id}')">Изменить</button>
            <button class="btn btn-sm btn-danger" onclick="deleteCompany('${c.id}', '${escAttr(c.name)}')">Удалить</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Companies error:', e);
  }
}

function openCompanyModal(data) {
  document.getElementById('company-edit-id').value = data ? data.id : '';
  document.getElementById('company-name').value = data ? data.name : '';
  document.getElementById('company-type').value = data ? data.type : 'school';
  document.getElementById('company-address').value = data ? data.address : '';
  document.getElementById('company-contact').value = data ? data.contact_person : '';
  document.getElementById('company-phone').value = data ? data.phone : '';
  document.getElementById('company-client-rate').value = (data && data.client_rate != null) ? data.client_rate : '';
  document.getElementById('modal-company-title').textContent = data ? 'Редактировать компанию' : 'Новая компания';
  openModal('modal-company');
}

async function editCompany(id) {
  try {
    const c = await API.get(`/companies/${id}`);
    openCompanyModal(c);
  } catch (e) {
    alert(e.message);
  }
}

async function saveCompany() {
  const id = document.getElementById('company-edit-id').value;
  const clientRateRaw = document.getElementById('company-client-rate').value;
  const data = {
    name: document.getElementById('company-name').value.trim(),
    type: document.getElementById('company-type').value,
    address: document.getElementById('company-address').value.trim(),
    contact_person: document.getElementById('company-contact').value.trim(),
    phone: document.getElementById('company-phone').value.trim(),
    client_rate: clientRateRaw === '' ? null : Number(clientRateRaw)
  };

  if (!data.name) { alert('Укажите название'); return; }

  try {
    if (id) {
      await API.put(`/companies/${id}`, data);
    } else {
      await API.post('/companies', data);
    }
    closeModal('modal-company');
    loadCompanies();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteCompany(id, name) {
  if (!confirm('Удалить компанию «' + name + '»?')) return;
  try {
    await API.delete(`/companies/${id}`);
    loadCompanies();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// TEACHERS
// ============================================================
async function loadTeachers() {
  try {
    const search = document.getElementById('teacher-filter-search').value;
    const companyFilter = document.getElementById('teacher-filter-company')
      ? document.getElementById('teacher-filter-company').value : '';
    let query = '/teachers?';
    if (search) query += `search=${encodeURIComponent(search)}&`;

    let teachers = await API.get(query);

    // Фильтрация по компании (педагоги, привязанные к выбранной компании)
    if (companyFilter) {
      teachers = teachers.filter(t =>
        (t.companies || []).some(c => c.company_id === companyFilter)
      );
    }

    const tbody = document.getElementById('teachers-body');

    if (teachers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет педагогов</td></tr>';
      return;
    }

    tbody.innerHTML = teachers.map(t => {
      const companiesList = (t.companies || []).map(c =>
        `${escHtml(c.company_name)} ${c.rate ? '(' + formatMoney(c.rate) + ')' : ''}`
      ).join(', ') || '—';

      return `
        <tr>
          <td><strong>${escHtml(t.full_name)}</strong></td>
          <td>${escHtml(t.username)}</td>
          <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:3px;">${escHtml(t.plain_password) || '—'}</code></td>
          <td>${escHtml(t.phone) || '—'}</td>
          <td>${companiesList}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline" onclick="editTeacher('${t.id}')">Изменить</button>
              <button class="btn btn-sm btn-outline" onclick="openRatesModal('${t.id}')">Ставки</button>
              <button class="btn btn-sm btn-danger" onclick="deleteTeacher('${t.id}', '${escAttr(t.full_name)}')">Удалить</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Teachers error:', e);
  }
}

function generateLoginFromFullName(fullName) {
  if (document.getElementById('teacher-edit-id').value) return;

  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  const str = fullName.trim().toLowerCase();
  const parts = str.split(/\s+/);
  if (!parts[0]) { document.getElementById('teacher-username').value = ''; return; }

  let result = '';
  for (let i = 0; i < parts[0].length; i++) {
    const char = parts[0][i];
    if (map[char] !== undefined) result += map[char];
    else if (/[a-z0-9]/.test(char)) result += char;
  }
  if (parts.length > 1 && parts[1][0]) {
    const char = parts[1][0];
    if (map[char] !== undefined) result += '_' + map[char];
    else if (/[a-z0-9]/.test(char)) result += '_' + char;
  }
  document.getElementById('teacher-username').value = result;
}

function openTeacherModal(data) {
  document.getElementById('teacher-edit-id').value = data ? data.id : '';
  document.getElementById('teacher-fullname').value = data ? data.full_name : '';
  document.getElementById('teacher-username').value = data ? data.username : '';
  document.getElementById('teacher-password').value = '';
  document.getElementById('teacher-phone').value = data ? data.phone : '';
  document.getElementById('modal-teacher-title').textContent = data ? 'Редактировать педагога' : 'Новый педагог';

  const pwdGroup = document.getElementById('teacher-password-group');
  const pwdInfo = document.getElementById('teacher-password-info');

  if (data) {
    document.getElementById('teacher-username').readOnly = true;
    pwdGroup.style.display = '';
    pwdInfo.style.display = 'none';
  } else {
    document.getElementById('teacher-username').readOnly = false;
    pwdGroup.style.display = 'none';
    pwdInfo.style.display = '';
  }

  openModal('modal-teacher');
}

async function editTeacher(id) {
  try {
    const t = await API.get(`/teachers/${id}`);
    openTeacherModal(t);
  } catch (e) {
    alert(e.message);
  }
}

async function saveTeacher() {
  const id = document.getElementById('teacher-edit-id').value;
  const fullName = document.getElementById('teacher-fullname').value.trim();
  const username = document.getElementById('teacher-username').value.trim();
  const password = document.getElementById('teacher-password').value;
  const phone = document.getElementById('teacher-phone').value.trim();

  if (!fullName) { alert('Укажите ФИО'); return; }

  try {
    if (id) {
      const updateData = { full_name: fullName, phone };
      if (password) updateData.password = password;
      await API.put(`/teachers/${id}`, updateData);
    } else {
      if (!username) { alert('Укажите логин'); return; }
      await API.post('/teachers', { username, full_name: fullName, phone });
    }
    closeModal('modal-teacher');
    loadTeachers();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteTeacher(id, name) {
  if (!confirm('Удалить педагога «' + name + '»?')) return;
  try {
    await API.delete(`/teachers/${id}`);
    loadTeachers();
  } catch (e) {
    alert(e.message);
  }
}

async function openRatesModal(teacherId) {
  document.getElementById('rates-teacher-id').value = teacherId;

  try {
    const [rates, companies] = await Promise.all([
      API.get(`/teachers/${teacherId}/rates`),
      API.get('/companies')
    ]);

    const rateMap = {};
    rates.forEach(r => { rateMap[r.company_id] = r.rate; });

    const container = document.getElementById('rates-list');
    container.innerHTML = companies.map(c => {
      const checked = rateMap.hasOwnProperty(c.id) ? 'checked' : '';
      const rateVal = rateMap[c.id] || '';
      const typeLabel = c.type === 'kindergarten' ? '(садик)' : '(школа)';

      return `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eee;">
          <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;">
            <input type="checkbox" class="rate-check" data-company="${c.id}" ${checked}>
            <span>${escHtml(c.name)} ${typeLabel}</span>
          </label>
          <div>
            <input type="number" class="rate-input" data-company="${c.id}" value="${rateVal}"
              placeholder="ставка за занятие" style="width:140px;padding:6px 8px;font-size:14px;border:1px solid #d0d0d0;border-radius:4px;">
          </div>
        </div>
      `;
    }).join('');

    openModal('modal-rates');
  } catch (e) {
    alert(e.message);
  }
}

async function saveRates() {
  const teacherId = document.getElementById('rates-teacher-id').value;
  const checks = document.querySelectorAll('.rate-check:checked');
  const rates = [];

  checks.forEach(cb => {
    const companyId = cb.dataset.company; // ✅ ObjectId string — без parseInt
    const rateInput = document.querySelector(`.rate-input[data-company="${companyId}"]`);
    const rate = rateInput ? parseInt(rateInput.value) || null : null;
    rates.push({ company_id: companyId, rate }); // ✅ строка ObjectId
  });

  try {
    await API.put(`/teachers/${teacherId}/rates`, { rates });
    closeModal('modal-rates');
    loadTeachers();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// SCHEDULE
// ============================================================
async function loadSchedule() {
  try {
    const teacher = document.getElementById('schedule-filter-teacher').value;
    const company = document.getElementById('schedule-filter-company').value;
    const day = document.getElementById('schedule-filter-day').value;

    let query = '/schedule?';
    if (teacher) query += `teacher_id=${teacher}&`;
    if (company) query += `company_id=${company}&`;
    if (day) query += `day_of_week=${day}&`;

    const slots = await API.get(query);
    const tbody = document.getElementById('schedule-body');

    if (slots.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Нет слотов расписания</td></tr>';
      return;
    }

    tbody.innerHTML = slots.map(s => `
      <tr>
        <td><strong>${DAYS_RU[s.day_of_week]}</strong></td>
        <td>${formatTimeRange(s.time_start, s.time_end)}</td>
        <td>${escHtml(s.teacher_name)}</td>
        <td>${escHtml(s.company_name)}</td>
        <td>${companyTypeBadge(s.company_type)}</td>
        <td>${escHtml(s.group_name) || '—'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline" onclick="editSlot('${s.id}')">Изменить</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSlot('${s.id}')">Удалить</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Schedule error:', e);
  }
}

function openSlotModal(data) {
  document.getElementById('slot-edit-id').value = data ? data.id : '';
  document.getElementById('slot-day').value = data ? data.day_of_week : '1';
  document.getElementById('slot-time-start').value = data ? data.time_start : '09:00';
  document.getElementById('slot-time-end').value = data ? data.time_end : '10:00';
  document.getElementById('slot-group').value = data ? data.group_name : '';
  document.getElementById('modal-slot-title').textContent = data ? 'Редактировать слот' : 'Новый слот расписания';

  if (data) {
    document.getElementById('slot-teacher').value = data.teacher_id;
    document.getElementById('slot-company').value = data.company_id;
  }

  openModal('modal-slot');
}

async function editSlot(id) {
  try {
    const slots = await API.get('/schedule');
    const slot = slots.find(s => s.id === id); // ✅ сравнение строк
    if (slot) openSlotModal(slot);
  } catch (e) {
    alert(e.message);
  }
}

async function saveSlot() {
  const id = document.getElementById('slot-edit-id').value;
  const data = {
    teacher_id: document.getElementById('slot-teacher').value,   // ✅ строка ObjectId
    company_id: document.getElementById('slot-company').value,   // ✅ строка ObjectId
    day_of_week: parseInt(document.getElementById('slot-day').value), // ✅ число (1-7)
    time_start: document.getElementById('slot-time-start').value,
    time_end: document.getElementById('slot-time-end').value,
    group_name: document.getElementById('slot-group').value.trim()
  };

  if (!data.teacher_id || !data.company_id || !data.time_start || !data.time_end) {
    alert('Заполните все обязательные поля');
    return;
  }

  try {
    if (id) {
      await API.put(`/schedule/${id}`, data);
    } else {
      await API.post('/schedule', data);
    }
    closeModal('modal-slot');
    loadSchedule();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteSlot(id) {
  if (!confirm('Удалить слот расписания?')) return;
  try {
    await API.delete(`/schedule/${id}`);
    loadSchedule();
  } catch (e) {
    alert(e.message);
  }
}

function openGenerateModal() {
  const week = getCurrentWeekRange();
  document.getElementById('generate-from').value = week.from;
  document.getElementById('generate-to').value = week.to;
  openModal('modal-generate');
}

async function generateLessons() {
  const date_from = document.getElementById('generate-from').value;
  const date_to = document.getElementById('generate-to').value;

  if (!date_from || !date_to) { alert('Укажите период'); return; }

  try {
    const result = await API.post('/schedule/generate', { date_from, date_to });
    closeModal('modal-generate');
    alert(result.message);
    // Переходим на страницу занятий, чтобы список расписания сбросился
    window.location.hash = 'lessons';
    navigateTo('lessons');
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// LESSONS
// ============================================================
async function loadLessons() {
  try {
    const dateFrom = document.getElementById('lessons-date-from').value;
    const dateTo = document.getElementById('lessons-date-to').value;
    const teacher = document.getElementById('lessons-filter-teacher').value;
    const company = document.getElementById('lessons-filter-company').value;
    const status = document.getElementById('lessons-filter-status').value;

    let query = '/lessons?';
    if (dateFrom) query += `date_from=${dateFrom}&`;
    if (dateTo) query += `date_to=${dateTo}&`;
    if (teacher) query += `teacher_id=${teacher}&`;
    if (company) query += `company_id=${company}&`;
    if (status) query += `status=${status}&`;

    const lessons = await API.get(query);
    const tbody = document.getElementById('lessons-body');

    if (lessons.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Нет занятий за выбранный период</td></tr>';
      return;
    }

    tbody.innerHTML = lessons.map(l => {
      const isSubstituted = l.actual_teacher_id !== l.original_teacher_id;
      const teacherDisplay = isSubstituted
        ? `${escHtml(l.actual_teacher_name)} <span class="text-muted">(замена)</span>`
        : escHtml(l.actual_teacher_name);

      return `
        <tr>
          <td>${formatDate(l.date)}</td>
          <td>${formatTimeRange(l.time_start, l.time_end)}</td>
          <td>${teacherDisplay}</td>
          <td>${escHtml(l.company_name)}</td>
          <td>${escHtml(l.group_name) || '—'}</td>
          <td>${statusBadge(l.status)}</td>
          <td>${l.status === 'completed' ? l.children_count : '—'}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline" onclick="${l.company_type === 'kindergarten' ? `openAttendanceModal('${l.id}')` : `openLessonModal('${l.id}')`}">Открыть</button>
              <button class="btn btn-sm btn-danger" onclick="deleteLesson('${l.id}')">Удалить</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Lessons error:', e);
  }
}

async function openLessonModal(id) {
  try {
    // Используем текущие фильтры чтобы не тянуть всё
    const dateFrom = document.getElementById('lessons-date-from').value;
    const dateTo = document.getElementById('lessons-date-to').value;
    let q = '/lessons?';
    if (dateFrom) q += `date_from=${dateFrom}&`;
    if (dateTo) q += `date_to=${dateTo}&`;
    const lessons = await API.get(q);
    const l = lessons.find(x => x.id === id); // ✅ сравнение строк
    if (!l) { alert('Занятие не найдено'); return; }

    document.getElementById('lesson-edit-id').value = l.id;
    document.getElementById('lesson-children').value = l.children_count || 0;
    document.getElementById('lesson-notes').value = l.notes || '';

    const isSubstituted = l.actual_teacher_id !== l.original_teacher_id;

    document.getElementById('lesson-info').innerHTML = `
      <table style="width:100%;">
        <tr><td class="text-muted" style="width:140px;">Дата:</td><td><strong>${formatDate(l.date)}</strong></td></tr>
        <tr><td class="text-muted">Время:</td><td>${formatTimeRange(l.time_start, l.time_end)}</td></tr>
        <tr><td class="text-muted">Компания:</td><td>${escHtml(l.company_name)} ${companyTypeBadge(l.company_type)}</td></tr>
        <tr><td class="text-muted">Группа:</td><td>${escHtml(l.group_name) || '—'}</td></tr>
        <tr><td class="text-muted">Педагог:</td><td>${escHtml(l.actual_teacher_name)} ${isSubstituted ? '<span class="badge badge-warning">Замена</span>' : ''}</td></tr>
        <tr><td class="text-muted">Статус:</td><td>${statusBadge(l.status)}</td></tr>
      </table>
      ${l.company_type === 'kindergarten' ? `<button class="btn btn-success mt-16" onclick="closeModal('modal-lesson'); openAttendanceModal('${l.id}');">✅ Отметка по списку</button>` : ''}
    `;

    await loadFilterOptions();
    openModal('modal-lesson');
  } catch (e) {
    alert(e.message);
  }
}

async function completeLesson() {
  const id = document.getElementById('lesson-edit-id').value;
  const children_count = parseInt(document.getElementById('lesson-children').value);
  const price_raw = document.getElementById('lesson-price').value;
  const price = price_raw ? parseInt(price_raw) : null;
  const notes = document.getElementById('lesson-notes').value.trim();

  if (isNaN(children_count) || children_count < 0) {
    alert('Укажите корректное количество детей');
    return;
  }

  try {
    await API.put(`/lessons/${id}/complete`, { children_count, price, notes });
    closeModal('modal-lesson');
    loadLessons();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function cancelLesson() {
  const id = document.getElementById('lesson-edit-id').value;
  const notes = document.getElementById('lesson-notes').value.trim();
  if (!confirm('Отменить занятие?')) return;
  try {
    await API.put(`/lessons/${id}/cancel`, { notes });
    closeModal('modal-lesson');
    loadLessons();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function doSubstitute() {
  const lessonId = document.getElementById('lesson-edit-id').value;
  const substituteId = document.getElementById('lesson-substitute-teacher').value;
  const reason = document.getElementById('lesson-substitute-reason').value.trim();

  if (!substituteId) { alert('Выберите заменяющего педагога'); return; }

  try {
    await API.post(`/lessons/${lessonId}/substitute`, {
      substitute_teacher_id: substituteId, // ✅ строка ObjectId
      reason
    });
    alert('Замена назначена');
    closeModal('modal-lesson');
    loadLessons();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteLesson(id) {
  if (!confirm('Удалить это занятие? Это действие нельзя отменить.')) return;
  try {
    await API.delete(`/lessons/${id}`);
    loadLessons();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// REPORTS
// ============================================================
async function loadReports() {
  const dateFrom = document.getElementById('reports-date-from').value;
  const dateTo = document.getElementById('reports-date-to').value;
  const teacher = document.getElementById('reports-filter-teacher').value;
  const company = document.getElementById('reports-filter-company').value;

  if (!dateFrom || !dateTo) { alert('Укажите период'); return; }

  try {
    let query = `/reports/summary?date_from=${dateFrom}&date_to=${dateTo}`;
    if (teacher) query += `&teacher_id=${teacher}`;
    if (company) query += `&company_id=${company}`;

    const report = await API.get(query);
    const t = report.totals;

    document.getElementById('reports-totals').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${t.total_lessons || 0}</div>
        <div class="stat-label">Всего занятий</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${t.completed || 0}</div>
        <div class="stat-label">Проведено</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${t.cancelled || 0}</div>
        <div class="stat-label">Отменено</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${t.total_children || 0}</div>
        <div class="stat-label">Всего детей</div>
      </div>
    `;

    document.getElementById('reports-teachers-body').innerHTML = report.byTeacher.map(r => `
      <tr>
        <td><strong>${escHtml(r.teacher_name)}</strong></td>
        <td>${r.total_lessons}</td>
        <td class="text-success text-bold">${r.completed}</td>
        <td class="text-danger">${r.cancelled}</td>
        <td>${r.planned}</td>
        <td>${r.total_children}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state">Нет данных</td></tr>';

    document.getElementById('reports-companies-body').innerHTML = report.byCompany.map(r => `
      <tr>
        <td><strong>${escHtml(r.company_name)}</strong></td>
        <td>${companyTypeBadge(r.company_type)}</td>
        <td>${r.total_lessons}</td>
        <td class="text-success text-bold">${r.completed}</td>
        <td class="text-danger">${r.cancelled}</td>
        <td>${r.total_children}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state">Нет данных</td></tr>';

    const subs = await API.get(`/reports/substitutions?date_from=${dateFrom}&date_to=${dateTo}`);
    document.getElementById('reports-subs-body').innerHTML = subs.map(s => `
      <tr>
        <td>${formatDate(s.date)}</td>
        <td>${escHtml(s.company_name)}</td>
        <td>${formatTimeRange(s.time_start, s.time_end)}</td>
        <td>${escHtml(s.original_teacher_name)}</td>
        <td>${escHtml(s.substitute_teacher_name)}</td>
        <td>${escHtml(s.reason) || '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty-state">Нет замен</td></tr>';

    // Таблица посещаемости (нужен выбранный садик)
    await loadAttendanceReport(dateFrom, dateTo, company, teacher);
  } catch (e) {
    alert(e.message);
  }
}

// Таблица посещаемости: дети (строки) × даты (столбцы)
async function loadAttendanceReport(dateFrom, dateTo, companyId, teacherId) {
  const wrap = document.getElementById('reports-attendance-wrap');
  if (!wrap) return;

  // Нужен садик
  const company = (allCompanies || []).find(c => c.id === companyId);
  if (!companyId || !company || company.type !== 'kindergarten') {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px;">Выберите садик в фильтре «Компания» сверху и нажмите «Показать»</div>';
    return;
  }

  try {
    let q = `/reports/attendance?date_from=${dateFrom}&date_to=${dateTo}&company_id=${companyId}`;
    if (teacherId) q += `&teacher_id=${teacherId}`;
    const data = await API.get(q);

    if (!data.dates.length || !data.children.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:20px;">Нет данных посещаемости за период</div>';
      return;
    }

    const headCols = data.dates.map(d => {
      const dd = new Date(d + 'T00:00:00');
      const label = dd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      return `<th style="text-align:center;white-space:nowrap;">${label}</th>`;
    }).join('');

    const rows = data.children.map((c, i) => {
      const cells = data.dates.map(d => {
        const present = c.attendance[d];
        if (present === true) return '<td style="text-align:center;color:var(--success);font-weight:700;">✓</td>';
        if (present === false) return '<td style="text-align:center;color:var(--danger);">×</td>';
        return '<td style="text-align:center;color:#cbd5e1;">·</td>';
      }).join('');
      return `
        <tr>
          <td>${i + 1}</td>
          <td style="white-space:nowrap;"><strong>${escHtml(c.full_name)}</strong> ${childStatusBadge(c.status)}</td>
          ${cells}
          <td style="text-align:center;font-weight:700;">${c.total_present}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>ФИО</th>
            ${headCols}
            <th style="text-align:center;">Итого</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state" style="padding:20px;">Ошибка: ${escHtml(e.message)}</div>`;
  }
}

// Экспорт счёта клиенту в PDF (через печать браузера → «Сохранить как PDF»).
// Садик — дети×даты, школа — занятия×даты. Ставка учителя в выгрузку не попадает.
async function exportClientTable() {
  const dateFrom = document.getElementById('reports-date-from').value;
  const dateTo = document.getElementById('reports-date-to').value;
  const companyId = document.getElementById('reports-filter-company').value;

  if (!dateFrom || !dateTo) { alert('Укажите период'); return; }
  if (!companyId) { alert('Выберите компанию в фильтре «Компания»'); return; }

  try {
    const data = await API.get(`/reports/export-data?company_id=${companyId}&date_from=${dateFrom}&date_to=${dateTo}`);
    const html = buildClientInvoiceHtml(data);

    const w = window.open('', '_blank');
    if (!w) { alert('Разрешите всплывающие окна, чтобы сформировать PDF'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Печать (в диалоге выбрать «Сохранить как PDF»)
    w.onload = () => { w.focus(); w.print(); };
  } catch (e) {
    alert(e.message);
  }
}

function buildClientInvoiceHtml(data) {
  const shortDate = d => {
    const dd = new Date(d + 'T00:00:00');
    return dd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };
  const typeLabel = data.company_type === 'kindergarten' ? 'Садик' : 'Школа';

  let tableHtml = '';
  if (data.company_type === 'kindergarten') {
    const head = `<th>№</th><th class="name">ФИО</th>${data.dates.map(d => `<th class="day">${shortDate(d)}</th>`).join('')}<th>Посещений</th>`;
    const rows = (data.children || []).map((c, i) => {
      const cells = data.dates.map(d => {
        const p = c.attendance[d];
        if (p === true) return '<td class="mark yes">✓</td>';
        if (p === false) return '<td class="mark no">×</td>';
        return '<td class="mark">·</td>';
      }).join('');
      return `<tr><td>${i + 1}</td><td class="name">${escHtml(c.full_name)}</td>${cells}<td class="total">${c.total_present}</td></tr>`;
    }).join('');
    const body = rows || `<tr><td colspan="${data.dates.length + 3}" class="empty">Нет данных за период</td></tr>`;
    tableHtml = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  } else {
    const rows = (data.lessons || []).map(l => `
      <tr>
        <td>${formatDate(l.date)}</td>
        <td>${escHtml(l.group_name) || '—'}</td>
        <td>${formatTimeRange(l.time_start, l.time_end)}</td>
        <td class="total">${l.children_count}</td>
        <td class="total">${formatMoney(l.client_payment)}</td>
      </tr>`).join('');
    const body = rows || '<tr><td colspan="5" class="empty">Нет данных за период</td></tr>';
    tableHtml = `<table><thead><tr><th>Дата</th><th>Группа</th><th>Время</th><th>Детей</th><th>Сумма</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<title>Счёт — ${escHtml(data.company_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #475569; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; }
  th { background: #f1f5f9; }
  td.name, th.name { text-align: left; white-space: nowrap; }
  td.mark { font-weight: 700; }
  td.mark.yes { color: #16a34a; }
  td.mark.no { color: #dc2626; }
  td.total { font-weight: 700; }
  td.empty { color: #94a3b8; font-style: italic; }
  .grand { margin-top: 20px; text-align: right; font-size: 16px; font-weight: 700; }
  .grand span { color: #2563eb; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>Счёт к оплате — ${escHtml(data.company_name)}</h1>
  <div class="meta">${typeLabel} • Период: ${formatDate(data.date_from)} — ${formatDate(data.date_to)}</div>
  ${tableHtml}
  <div class="grand">Итого к оплате клиентом: <span>${formatMoney(data.client_total)}</span></div>
</body></html>`;
}

// ============================================================
// PAYMENTS
// ============================================================
async function loadPayments() {
  const dateFrom = document.getElementById('payments-date-from').value;
  const dateTo = document.getElementById('payments-date-to').value;
  const teacher = document.getElementById('payments-filter-teacher').value;

  if (!dateFrom || !dateTo) { alert('Укажите период'); return; }

  try {
    let query = `/payments/calculate?date_from=${dateFrom}&date_to=${dateTo}`;
    if (teacher) query += `&teacher_id=${teacher}`;

    const result = await API.get(query);

    document.getElementById('payments-totals').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${formatMoney(result.grand_client)}</div>
        <div class="stat-label">От клиентов</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${formatMoney(result.grand_teacher)}</div>
        <div class="stat-label">Выплаты учителям</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${formatMoney(result.grand_profit)}</div>
        <div class="stat-label">Прибыль центра</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${result.details.length}</div>
        <div class="stat-label">Проведенных занятий</div>
      </div>
    `;

    // Выплаты педагогам
    document.getElementById('payments-summary-card').style.display = '';
    const summaryBody = document.getElementById('payments-summary-body');
    summaryBody.innerHTML = result.summary_by_teacher.map(t => `
      <tr>
        <td><strong>${escHtml(t.teacher_name)}</strong></td>
        <td>${t.total_lessons}</td>
        <td>${t.total_children}</td>
        <td class="text-bold">${formatMoney(t.total_teacher)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">Нет данных</td></tr>';

    if (result.summary_by_teacher.length > 0) {
      summaryBody.innerHTML += `
        <tr style="background:#f0f9ff;font-weight:700;">
          <td>ИТОГО</td>
          <td>${result.details.length}</td>
          <td>${result.summary_by_teacher.reduce((s, t) => s + t.total_children, 0)}</td>
          <td>${formatMoney(result.grand_teacher)}</td>
        </tr>
      `;
    }

    // Доход по компаниям (клиент → центр)
    const companyCard = document.getElementById('payments-company-card');
    const companyBody = document.getElementById('payments-company-body');
    const byCompany = result.summary_by_company || [];
    if (companyBody) {
      companyCard.style.display = '';
      companyBody.innerHTML = byCompany.map(c => `
        <tr>
          <td><strong>${escHtml(c.company_name)}</strong></td>
          <td>${companyTypeBadge(c.company_type)}</td>
          <td>${c.total_lessons}</td>
          <td>${c.total_children}</td>
          <td class="text-bold">${formatMoney(c.total_client)}</td>
          <td class="text-danger">${formatMoney(c.total_teacher)}</td>
          <td class="text-success text-bold">${formatMoney(c.total_profit)}</td>
        </tr>
      `).join('') || '<tr><td colspan="7" class="empty-state">Нет данных</td></tr>';

      if (byCompany.length > 0) {
        companyBody.innerHTML += `
          <tr style="background:#f0f9ff;font-weight:700;">
            <td colspan="4">ИТОГО</td>
            <td>${formatMoney(result.grand_client)}</td>
            <td>${formatMoney(result.grand_teacher)}</td>
            <td>${formatMoney(result.grand_profit)}</td>
          </tr>
        `;
      }
    }

    // Детализация
    document.getElementById('payments-details-card').style.display = '';
    document.getElementById('payments-details-body').innerHTML = result.details.map(d => `
      <tr>
        <td>${formatDate(d.date)}</td>
        <td>${escHtml(d.teacher_name)}</td>
        <td>${escHtml(d.company_name)}</td>
        <td>${companyTypeBadge(d.company_type)}</td>
        <td>${escHtml(d.group_name) || '—'}</td>
        <td>${d.children_count}</td>
        <td>${formatMoney(d.client_payment)}</td>
        <td class="text-danger">${formatMoney(d.teacher_payment)}</td>
        <td class="text-success text-bold">${formatMoney(d.profit)}</td>
      </tr>
    `).join('') || '<tr><td colspan="9" class="empty-state">Нет данных</td></tr>';
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// CHILDREN (KINDERGARTEN)
// ============================================================
async function loadKindergartenOptions() {
  try {
    const companies = await API.get('/companies?type=kindergarten');
    // Children filter
    const filterSelect = document.getElementById('children-filter-company');
    if (filterSelect) {
      const val = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Все</option>';
      companies.forEach(c => {
        filterSelect.innerHTML += `<option value="${c.id}">${escHtml(c.name)}</option>`;
      });
      if (val) filterSelect.value = val;
    }
    // Child modal
    const childSelect = document.getElementById('child-company');
    if (childSelect) {
      childSelect.innerHTML = '';
      companies.forEach(c => {
        childSelect.innerHTML += `<option value="${c.id}">${escHtml(c.name)}</option>`;
      });
    }
    // Import modal
    const importSelect = document.getElementById('import-target-company');
    if (importSelect) {
      importSelect.innerHTML = '';
      companies.forEach(c => {
        importSelect.innerHTML += `<option value="${c.id}">${escHtml(c.name)}</option>`;
      });
    }
  } catch (e) {
    console.error('loadKindergartenOptions error:', e);
  }
}

async function loadChildren() {
  try {
    const company = document.getElementById('children-filter-company').value;
    const status = document.getElementById('children-filter-status').value;
    const search = document.getElementById('children-filter-search').value;

    let query = '/children?';
    if (company) query += `company_id=${company}&`;
    if (status) query += `status=${status}&`;
    if (search) query += `search=${encodeURIComponent(search)}&`;

    const children = await API.get(query);
    const tbody = document.getElementById('children-body');

    if (children.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет детей</td></tr>';
      return;
    }

    tbody.innerHTML = children.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escHtml(c.full_name)}</strong></td>
        <td>${escHtml(c.company_name)}</td>
        <td>${childStatusBadge(c.status)}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline" onclick="editChild('${c.id}')">Изменить</button>
            ${c.status === 'trial' ? `<button class="btn btn-sm btn-success" onclick="promoteChild('${c.id}', '${escAttr(c.full_name)}')">→ Регуляр</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="deleteChild('${c.id}', '${escAttr(c.full_name)}')">Удалить</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Children error:', e);
  }
}

function childStatusBadge(status) {
  if (status === 'regular') return '<span class="badge badge-success">Регуляр</span>';
  if (status === 'trial') return '<span class="badge badge-warning">Пробный</span>';
  return status;
}

function openChildModal(data) {
  document.getElementById('child-edit-id').value = data ? data.id : '';
  document.getElementById('child-fullname').value = data ? data.full_name : '';
  document.getElementById('child-status').value = data ? data.status : 'trial';
  document.getElementById('modal-child-title').textContent = data ? 'Редактировать ребёнка' : 'Новый ребёнок';

  loadKindergartenOptions().then(() => {
    if (data && data.company_id) {
      document.getElementById('child-company').value = data.company_id;
    }
  });

  openModal('modal-child');
}

async function editChild(id) {
  try {
    const c = await API.get(`/children/${id}`);
    openChildModal(c);
  } catch (e) {
    alert(e.message);
  }
}

async function saveChild() {
  const id = document.getElementById('child-edit-id').value;
  const data = {
    full_name: document.getElementById('child-fullname').value.trim(),
    company_id: document.getElementById('child-company').value,
    status: document.getElementById('child-status').value
  };

  if (!data.full_name) { alert('Укажите ФИО'); return; }
  if (!data.company_id) { alert('Выберите садик'); return; }

  try {
    if (id) {
      await API.put(`/children/${id}`, data);
    } else {
      await API.post('/children', data);
    }
    closeModal('modal-child');
    loadChildren();
  } catch (e) {
    alert(e.message);
  }
}

async function promoteChild(id, name) {
  if (!confirm(`Перевести «${name}» из пробного в регуляр?`)) return;
  try {
    await API.put(`/children/${id}/promote`);
    loadChildren();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteChild(id, name) {
  if (!confirm(`Удалить ребёнка «${name}»?`)) return;
  try {
    await API.delete(`/children/${id}`);
    loadChildren();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// EXCEL IMPORT
// ============================================================
let importWorkbook = null;
let importParsedSheets = {};

function openImportChildrenModal() {
  document.getElementById('import-excel-file').value = '';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('btn-do-import').disabled = true;
  importWorkbook = null;
  importParsedSheets = {};
  loadKindergartenOptions();
  openModal('modal-import-children');
}

function parseExcelForImport(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      importWorkbook = XLSX.read(e.target.result, { type: 'array' });
      importParsedSheets = {};

      const sheetSelect = document.getElementById('import-sheet-select');
      sheetSelect.innerHTML = '';
      importWorkbook.SheetNames.forEach(name => {
        sheetSelect.innerHTML += `<option value="${escHtml(name)}">${escHtml(name)}</option>`;
        // Parse children from each sheet
        importParsedSheets[name] = extractChildrenFromSheet(importWorkbook.Sheets[name]);
      });

      document.getElementById('import-preview').style.display = '';
      document.getElementById('btn-do-import').disabled = false;
      renderImportSheet();
    } catch (err) {
      alert('Ошибка чтения Excel: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function extractChildrenFromSheet(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const children = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;

    const firstCol = row[0];
    const nameCol = row[1];
    const thirdCol = row.length > 2 ? String(row[2] || '') : '';

    // Row is a child if first column is a number (index) and second is a name string
    if (typeof firstCol === 'number' && firstCol >= 1 && firstCol <= 100 &&
        typeof nameCol === 'string' && nameCol.trim().length > 0) {

      const name = nameCol.trim();

      // Skip totals, headers
      const lowerName = name.toLowerCase();
      if (['итого', 'всего', 'ф.и.о', 'фио', 'всего:', 'итого:'].some(kw => lowerName.includes(kw))) continue;

      // Detect trial status
      let status = 'regular';
      if (thirdCol) {
        const lc = thirdCol.toLowerCase();
        if (lc.includes('проб') || lc.includes('пр') || lc === '1пр') {
          status = 'trial';
        }
      }

      children.push({ full_name: name, status });
    }
  }

  return children;
}

function renderImportSheet() {
  const sheetName = document.getElementById('import-sheet-select').value;
  const children = importParsedSheets[sheetName] || [];
  const tbody = document.getElementById('import-children-body');

  if (children.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Не найдено детей на этом листе</td></tr>';
    return;
  }

  tbody.innerHTML = children.map((c, i) => `
    <tr>
      <td><input type="checkbox" class="import-child-check" data-index="${i}" checked></td>
      <td>${escHtml(c.full_name)}</td>
      <td>${childStatusBadge(c.status)}</td>
    </tr>
  `).join('');
}

function toggleImportAll(checked) {
  document.querySelectorAll('.import-child-check').forEach(cb => cb.checked = checked);
}

async function doImportChildren() {
  const sheetName = document.getElementById('import-sheet-select').value;
  const companyId = document.getElementById('import-target-company').value;
  const allChildren = importParsedSheets[sheetName] || [];

  if (!companyId) { alert('Выберите садик'); return; }

  const checks = document.querySelectorAll('.import-child-check:checked');
  const selected = [];
  checks.forEach(cb => {
    const idx = parseInt(cb.dataset.index);
    if (allChildren[idx]) {
      selected.push({
        full_name: allChildren[idx].full_name,
        company_id: companyId,
        status: allChildren[idx].status
      });
    }
  });

  if (selected.length === 0) { alert('Не выбрано ни одного ребёнка'); return; }

  try {
    const result = await API.post('/children/import', { children: selected });
    alert(result.message);
    closeModal('modal-import-children');
    loadChildren();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// ATTENDANCE (Checklist)
// ============================================================
let _attAvailable = []; // дети садика, которых можно добавить в список

async function openAttendanceModal(lessonId) {
  try {
    const data = await API.get(`/attendance/${lessonId}`);

    document.getElementById('attendance-lesson-id').value = lessonId;
    document.getElementById('attendance-info').innerHTML = `
      <p class="text-muted">Садик: <strong>${escHtml(data.company_name)}</strong> | В списке: <span id="att-total">${data.total}</span> ${data.lesson_status === 'completed' ? '<span class="badge badge-success">Проведено</span>' : ''}</p>
    `;

    renderAttendanceRows(data.children);
    _attAvailable = data.available || [];
    renderAttendanceAddOptions();

    const notesEl = document.getElementById('attendance-notes');
    if (notesEl) notesEl.value = data.notes || '';
    const newChildEl = document.getElementById('attendance-new-child');
    if (newChildEl) newChildEl.value = '';

    // Список педагогов для замены
    const subSel = document.getElementById('attendance-substitute-teacher');
    if (subSel) {
      if (!allTeachers.length) await loadFilterOptions();
      subSel.innerHTML = '<option value="">— не менять —</option>' +
        allTeachers.map(t => `<option value="${t.id}">${escHtml(t.full_name)}</option>`).join('');
      const reasonEl = document.getElementById('attendance-substitute-reason');
      if (reasonEl) reasonEl.value = '';
    }

    updateAttendanceSummary();
    openModal('modal-attendance');
  } catch (e) {
    alert(e.message);
  }
}

// Создать нового ребёнка и сразу добавить в список занятия
async function createChildInAttendance() {
  const input = document.getElementById('attendance-new-child');
  const name = input.value.trim();
  if (!name) { alert('Введите ФИО ребёнка'); return; }
  const lessonId = document.getElementById('attendance-lesson-id').value;
  try {
    const child = await API.post(`/attendance/${lessonId}/child`, { full_name: name });
    const tbody = document.getElementById('attendance-body');
    const emptyRow = tbody.querySelector('.empty-state');
    if (emptyRow) tbody.innerHTML = '';
    // не дублируем, если вдруг уже в списке
    if (!document.querySelector(`[data-row-child="${child.child_id}"]`)) {
      tbody.insertAdjacentHTML('beforeend', attendanceRowHtml(child.child_id, child.full_name, child.status, true));
    }
    input.value = '';
    // обновим пул доступных (новый ребёнок теперь существует в садике)
    _attAvailable = _attAvailable.filter(c => c.child_id !== child.child_id);
    renderAttendanceAddOptions();
    updateAttendanceSummary();
  } catch (e) {
    alert(e.message);
  }
}

async function cancelLessonFromAttendance() {
  const lessonId = document.getElementById('attendance-lesson-id').value;
  const notes = document.getElementById('attendance-notes').value.trim();
  if (!confirm('Отменить занятие?')) return;
  try {
    await API.put(`/lessons/${lessonId}/cancel`, { notes });
    closeModal('modal-attendance');
    if (currentPage === 'lessons') loadLessons();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function doSubstituteFromAttendance() {
  const lessonId = document.getElementById('attendance-lesson-id').value;
  const substituteId = document.getElementById('attendance-substitute-teacher').value;
  const reason = document.getElementById('attendance-substitute-reason').value.trim();
  if (!substituteId) { alert('Выберите заменяющего педагога'); return; }
  try {
    await API.post(`/lessons/${lessonId}/substitute`, { substitute_teacher_id: substituteId, reason });
    alert('Замена назначена');
    closeModal('modal-attendance');
    if (currentPage === 'lessons') loadLessons();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

function renderAttendanceRows(children) {
  const tbody = document.getElementById('attendance-body');
  if (!children || children.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Список пуст. Добавьте детей через выпадающий список ниже.</td></tr>';
    return;
  }
  tbody.innerHTML = children.map(c => attendanceRowHtml(c.child_id, c.full_name, c.status, c.present)).join('');
}

function attendanceRowHtml(childId, fullName, status, present) {
  return `
    <tr data-row-child="${childId}" data-name="${escAttr(fullName)}" data-status="${status}">
      <td>
        <input type="checkbox" class="attendance-check" data-child="${childId}" ${present ? 'checked' : ''}
          onchange="updateAttendanceSummary()" style="width:20px;height:20px;cursor:pointer;">
      </td>
      <td>${escHtml(fullName)}</td>
      <td>${childStatusBadge(status)}</td>
      <td><button class="btn btn-sm btn-danger" title="Убрать из списка" onclick="removeChildFromAttendance('${childId}')">×</button></td>
    </tr>`;
}

function renderAttendanceAddOptions() {
  const sel = document.getElementById('attendance-add-select');
  if (!sel) return;
  const inList = new Set(Array.from(document.querySelectorAll('[data-row-child]')).map(r => r.dataset.rowChild));
  const opts = _attAvailable.filter(c => !inList.has(c.child_id));
  sel.innerHTML = '<option value="">— выберите —</option>' +
    opts.map(c => `<option value="${c.child_id}" data-name="${escAttr(c.full_name)}" data-status="${c.status}">${escHtml(c.full_name)}</option>`).join('');
}

function addChildToAttendance() {
  const sel = document.getElementById('attendance-add-select');
  const childId = sel.value;
  if (!childId) return;
  const opt = sel.options[sel.selectedIndex];
  const fullName = opt.dataset.name;
  const status = opt.dataset.status;

  const tbody = document.getElementById('attendance-body');
  // убрать заглушку «Список пуст»
  const emptyRow = tbody.querySelector('.empty-state');
  if (emptyRow) tbody.innerHTML = '';

  tbody.insertAdjacentHTML('beforeend', attendanceRowHtml(childId, fullName, status, true));
  renderAttendanceAddOptions();
  updateAttendanceSummary();
}

function removeChildFromAttendance(childId) {
  const row = document.querySelector(`[data-row-child="${childId}"]`);
  if (row) row.remove();
  const tbody = document.getElementById('attendance-body');
  if (!tbody.querySelector('[data-row-child]')) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Список пуст. Добавьте детей через выпадающий список ниже.</td></tr>';
  }
  renderAttendanceAddOptions();
  updateAttendanceSummary();
}

function updateAttendanceSummary() {
  const total = document.querySelectorAll('.attendance-check').length;
  const present = document.querySelectorAll('.attendance-check:checked').length;
  document.getElementById('attendance-summary').textContent = `Присутствует: ${present} из ${total}`;
  const totalEl = document.getElementById('att-total');
  if (totalEl) totalEl.textContent = total;
}

async function saveAttendance(complete) {
  const lessonId = document.getElementById('attendance-lesson-id').value;
  const checks = document.querySelectorAll('.attendance-check');
  const marks = [];

  checks.forEach(cb => {
    marks.push({
      child_id: cb.dataset.child,
      present: cb.checked
    });
  });

  const notesEl = document.getElementById('attendance-notes');
  const notes = notesEl ? notesEl.value.trim() : undefined;

  try {
    const result = await API.put(`/attendance/${lessonId}`, { marks, complete: !!complete, notes });
    alert(result.message);
    closeModal('modal-attendance');
    if (currentPage === 'lessons') loadLessons();
    if (currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
// INIT
// ============================================================
(function init() {
  const week = getCurrentWeekRange();
  const month = getCurrentMonthRange();

  document.getElementById('lessons-date-from').value = week.from;
  document.getElementById('lessons-date-to').value = week.to;
  document.getElementById('reports-date-from').value = month.from;
  document.getElementById('reports-date-to').value = month.to;
  document.getElementById('payments-date-from').value = month.from;
  document.getElementById('payments-date-to').value = month.to;

  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);
  loadFilterOptions();
})();
