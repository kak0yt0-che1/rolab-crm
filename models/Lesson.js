const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  schedule_slot_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduleSlot', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  actual_teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['planned', 'completed', 'cancelled'], default: 'planned' },
  children_count: { type: Number, default: 0 },
  price: { type: Number, default: null },
  notes: { type: String, default: '', trim: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

schema.index({ schedule_slot_id: 1, date: 1 }, { unique: true });
schema.index({ date: 1 });
schema.index({ actual_teacher_id: 1 });
schema.index({ status: 1 });

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.schedule_slot_id = ret.schedule_slot_id ? ret.schedule_slot_id.toString() : ret.schedule_slot_id;
    ret.actual_teacher_id = ret.actual_teacher_id ? ret.actual_teacher_id.toString() : ret.actual_teacher_id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('Lesson', schema);
