const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    avatar: { type: String, default: '' }, // URL or base64
    role: { type: String, default: 'Member' },
    seniority: { type: String, enum: ['Junior', 'Mid', 'Senior', 'Lead'], default: 'Mid' },
    totalPoints: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
