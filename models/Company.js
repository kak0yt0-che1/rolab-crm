const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['school', 'kindergarten'], required: true },
  address: { type: String, default: '', trim: true },
  contact_person: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  // Ставка клиента (сколько организация платит центру).
  // individual — за каждого ребёнка; organization — фикс за занятие. null = откат на формулу.
  client_rate: { type: Number, default: null },
  // Тип оплаты клиентом:
  //   organization — платит сама организация (фикс за занятие)
  //   individual   — платят родители (за каждого ребёнка)
  // Старые записи без поля → расчёт падает на эвристику по type (садик/школа).
  payment_type: { type: String, enum: ['organization', 'individual'], default: 'individual' },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('Company', schema);
