const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  full_name: { type: String, required: true, trim: true },
  company_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  status: { type: String, enum: ['regular', 'trial'], default: 'trial' },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

schema.index({ company_id: 1 });
schema.index({ company_id: 1, full_name: 1 });

schema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.company_id = ret.company_id ? ret.company_id.toString() : ret.company_id;
    delete ret._id;
    delete ret.__v;
  }
});

module.exports = mongoose.model('KindergartenChild', schema);
