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
 *
 * paymentType (ФУНКЦИЯ 1) имеет приоритет над companyType:
 *   'individual'   → rate × childrenCount (родители платят за каждого ребёнка)
 *   'organization' → rate (фикс за занятие)
 * Если paymentType не передан (старые записи) — падаем на эвристику по companyType
 * (садик = за ребёнка, школа = фикс), сохраняя обратную совместимость.
 *
 * clientRate может прийти строкой ("4000") из формы/БД — приводим через parseFloat.
 * Мини-тест:
 *   calculateClientPayment('kindergarten', 3, '4000')                 === 12000
 *   calculateClientPayment('school', 20, '8000')                      === 8000
 *   calculateClientPayment('school', 5, '5000', 'individual')         === 25000 (школа, платят родители)
 *   calculateClientPayment('kindergarten', 5, '5000', 'organization') === 5000  (садик, платит организация)
 *   calculateClientPayment('kindergarten', 6, null)                   === 6000  (defaultFormula)
 *   calculateClientPayment('kindergarten', 6, '')                     === 6000  (пустая строка → откат)
 */
function calculateClientPayment(companyType, childrenCount, clientRate, paymentType) {
  const rate = (clientRate !== null && clientRate !== undefined && clientRate !== '')
    ? parseFloat(clientRate) : null;
  if (rate !== null && !isNaN(rate)) {
    const perChild = paymentType
      ? paymentType === 'individual'
      : companyType === 'kindergarten';
    return perChild ? Math.round(rate * childrenCount) : Math.round(rate);
  }
  return defaultFormula(companyType, childrenCount);
}

/**
 * Ставка учителя — сколько центр выплачивает педагогу за занятие (фикс).
 * manualPrice (lesson.price) перекрывает всё (мастер-классы).
 * Если ставка не задана — откат на формулу.
 */
function calculateTeacherPayment(companyType, childrenCount, teacherRate, manualPrice) {
  if (manualPrice !== null && manualPrice !== undefined && manualPrice !== '') {
    const mp = parseFloat(manualPrice);
    if (!isNaN(mp)) return Math.round(mp);
  }
  const rate = (teacherRate !== null && teacherRate !== undefined && teacherRate !== '')
    ? parseFloat(teacherRate) : null;
  if (rate !== null && !isNaN(rate)) {
    return Math.round(rate);
  }
  return defaultFormula(companyType, childrenCount);
}

module.exports = { defaultFormula, calculateClientPayment, calculateTeacherPayment };
