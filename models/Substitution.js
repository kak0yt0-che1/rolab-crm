const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  lesson_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  original_teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  substitute_teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '', trim: true },
  created_at: { type: Date, default: Date.now }
});

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.lesson_id = ret.lesson_id ? ret.lesson_id.toString() : ret.lesson_id;
    ret.original_teacher_id = ret.original_teacher_id ? ret.original_teacher_id.toString() : ret.original_teacher_id;
    ret.substitute_teacher_id = ret.substitute_teacher_id ? ret.substitute_teacher_id.toString() : ret.substitute_teacher_id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('Substitution', schema);
