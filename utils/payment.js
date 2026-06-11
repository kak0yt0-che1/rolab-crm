/**
 * Общая логика расчёта оплаты (используется в payments и reports/export).
 */

/**
 * Откат на формулу по умолчанию (когда ставка не задана):
 * Садик: 5000 + (children - 5) * 1000, максимум 10000. Школа: 3500.
 */
function defaultFormula(companyType, childrenCount) {
  if (companyType === 'kindergarten') {
    const base = 5000;
    const extra = Math.max(0, childrenCount - 5) * 1000;
    return Math.min(10000, base + extra);
  }
  return 3500;
}

/**
 * Ставка клиента — сколько организация платит центру.
 * Садик: client_rate за каждого присутствующего ребёнка (линейно).
 * Школа: client_rate за занятие. Если не задан — откат на формулу.
 */
function calculateClientPayment(companyType, childrenCount, clientRate) {
  if (clientRate !== null && clientRate !== undefined) {
    if (companyType === 'kindergarten') return Math.round(clientRate * childrenCount);
    return Math.round(clientRate);
  }
  return defaultFormula(companyType, childrenCount);
}

/**
 * Ставка учителя — сколько центр выплачивает педагогу за занятие (фикс).
 * manualPrice (lesson.price) перекрывает всё (мастер-классы).
 * Если ставка не задана — откат на формулу.
 */
function calculateTeacherPayment(companyType, childrenCount, teacherRate, manualPrice) {
  if (manualPrice !== null && manualPrice !== undefined) {
    return parseInt(manualPrice) || 0;
  }
  if (teacherRate !== null && teacherRate !== undefined) {
    return Math.round(teacherRate);
  }
  return defaultFormula(companyType, childrenCount);
}

module.exports = { defaultFormula, calculateClientPayment, calculateTeacherPayment };
