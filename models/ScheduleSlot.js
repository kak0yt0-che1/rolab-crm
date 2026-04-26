const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  day_of_week: { type: Number, min: 1, max: 7, required: true },
  time_start: { type: String, required: true },
  time_end: { type: String, required: true },
  group_name: { type: String, default: '', trim: true },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

schema.index({ teacher_id: 1 });
schema.index({ company_id: 1 });
schema.index({ day_of_week: 1 });

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.teacher_id = ret.teacher_id ? ret.teacher_id.toString() : ret.teacher_id;
    ret.company_id = ret.company_id ? ret.company_id.toString() : ret.company_id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('ScheduleSlot', schema);
