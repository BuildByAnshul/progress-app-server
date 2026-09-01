const mongoose = require('mongoose');

const dailyProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD' for easy lookup
    pointsEarned: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    tasksTotal: { type: Number, default: 0 },
    hoursLogged: { type: Number, default: 0 }, // computed from completed task durations
    fiveBonusAwarded: { type: Boolean, default: false }, // prevent double-award
  },
  { timestamps: true }
);

dailyProgressSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyProgress', dailyProgressSchema);
