/**
 * ROLAB — API Helper
 * Shared utilities for all pages
 */

const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('rolab_token');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('rolab_user') || 'null');
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem('rolab_token');
    localStorage.removeItem('rolab_user');
    window.location.href = '/login.html';
  },

  async request(method, path, body) {
    const token = this.getToken();
    if (!token) {
      this.logout();
      return;
    }

    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    // For GET with query params
    let url = this.baseUrl + path;

    const res = await fetch(url, opts);

    if (res.status === 401) {
      this.logout();
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка запроса');
    }

    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  delete(path) { return this.request('DELETE', path); }
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const DAYS_RU = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DAYS_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(amount) {
  return Number(amount).toLocaleString('ru-RU') + ' тг';
}

function statusBadge(status) {
  const map = {
    planned: '<span class="badge badge-info">Запланировано</span>',
    completed: '<span class="badge badge-success">Проведено</span>',
    cancelled: '<span class="badge badge-danger">Отменено</span>'
  };
  return map[status] || status;
}

function companyTypeBadge(type) {
  if (type === 'kindergarten') return '<span class="badge badge-warning">Садик</span>';
  if (type === 'masterclass') return '<span class="badge" style="background:#8b5cf6;color:white;">М-класс</span>';
  return '<span class="badge badge-info">Школа</span>';
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Escape string for use inside onclick='...' attribute (single-quoted JS string)
function escAttr(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showAlert(container, message, type = 'success') {
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 4000);
}

// Get current monday and sunday for default date range
function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: localDateStr(monday),
    to: localDateStr(sunday)
  };
}

function getCurrentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: localDateStr(first),
    to: localDateStr(last)
  };
}

function todayStr() {
  return localDateStr(new Date());
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
