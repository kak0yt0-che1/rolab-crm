const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['school', 'kindergarten'], required: true },
  address: { type: String, default: '', trim: true },
  contact_person: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  // Ставка клиента (сколько организация платит центру).
  // Садик — за каждого ребёнка; школа — за занятие. null = откат на формулу по умолчанию.
  client_rate: { type: Number, default: null },
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
