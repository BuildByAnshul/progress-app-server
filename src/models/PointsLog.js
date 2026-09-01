const mongoose = require('mongoose');

const pointsLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    reason: { type: String, required: true }, // e.g. 'task_complete', 'five_task_bonus'
    delta: { type: Number, required: true }, // +1, +5, etc.
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' }, // optional reference
  },
  { timestamps: true }
);

pointsLogSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('PointsLog', pointsLogSchema);
