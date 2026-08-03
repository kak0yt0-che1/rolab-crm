const mongoose = require('mongoose');

// Оплата родителями за конкретное занятие конкретного ребёнка (payment_type === 'individual').
// Одна запись = один ребёнок на одном занятии. Сумма по умолчанию берётся из client_rate,
// но редактируема (индивидуальные договорённости).
const schema = new mongoose.Schema({
  lesson_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  child_id: { type: mongoose.Schema.Types.ObjectId, ref: 'KindergartenChild', required: true },
  paid: { type: Boolean, default: false },
  paid_at: { type: Date, default: null },
  amount: { type: Number, default: null },
  note: { type: String, default: '', trim: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Один ребёнок — одна запись оплаты на занятие
schema.index({ lesson_id: 1, child_id: 1 }, { unique: true });
schema.index({ lesson_id: 1 });
schema.index({ child_id: 1 });

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.lesson_id = ret.lesson_id ? ret.lesson_id.toString() : ret.lesson_id;
    ret.child_id = ret.child_id && ret.child_id._id
      ? ret.child_id._id.toString()
      : (ret.child_id ? ret.child_id.toString() : ret.child_id);
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('IndividualPayment', schema);
