const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  rate: { type: Number, default: null }
});

schema.index({ teacher_id: 1, company_id: 1 }, { unique: true });

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.teacher_id = ret.teacher_id ? ret.teacher_id.toString() : ret.teacher_id;
    ret.company_id = ret.company_id ? ret.company_id.toString() : ret.company_id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('TeacherRate', schema);
