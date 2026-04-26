const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, trim: true },
  password_hash: { type: String, required: true },
  plain_password: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'teacher', 'dev'], required: true },
  full_name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
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

module.exports = mongoose.model('User', schema);
