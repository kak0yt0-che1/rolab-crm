const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  lesson_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  child_id: { type: mongoose.Schema.Types.ObjectId, ref: 'KindergartenChild', required: true },
  present: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

schema.index({ lesson_id: 1 });
schema.index({ lesson_id: 1, child_id: 1 }, { unique: true });
schema.index({ child_id: 1 });

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.lesson_id = ret.lesson_id ? ret.lesson_id.toString() : ret.lesson_id;
    ret.child_id = ret.child_id ? ret.child_id.toString() : ret.child_id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('Attendance', schema);
