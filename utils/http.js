/**
 * Общие HTTP-хелперы для роутов: валидация ObjectId, экранирование regex,
 * единая обработка ошибок (без утечки внутренних сообщений в production).
 */
const mongoose = require('mongoose');

/**
 * Проверяет ObjectId. Если невалиден — отвечает 400 и возвращает true.
 * Использование: if (badId(res, req.params.id)) return;
 */
function badId(res, id) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'Неверный идентификатор' });
    return true;
  }
  return false;
}

/**
 * Экранирует спецсимволы для безопасной подстановки пользовательского
 * ввода в $regex (защита от regex-инъекции и ReDoS).
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Единый ответ 500/400 из catch-блоков роутов.
 * CastError (кривой ObjectId в запросе) → 400; остальное → 500.
 * В production текст внутренней ошибки клиенту не отдаётся.
 */
function serverError(res, err) {
  if (err && (err.name === 'CastError' || err.name === 'ValidationError')) {
    return res.status(400).json({ error: 'Некорректные данные запроса' });
  }
  console.error('Ошибка запроса:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'Внутренняя ошибка сервера'
    : (err && err.message) || 'Внутренняя ошибка сервера';
  return res.status(500).json({ error: message });
}

module.exports = { badId, escapeRegex, serverError };
