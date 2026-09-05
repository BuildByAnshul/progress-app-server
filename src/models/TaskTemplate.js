const mongoose = require('mongoose');

const taskTemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isGlobal: { type: Boolean, default: false, index: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    duration: { type: String, enum: ['today', 'days', 'forever'], default: 'today' },
    startDate: { type: Date, default: () => new Date() },
    endDate: { type: Date },
    category: { type: String, default: 'General' },
    subtasks: [
      {
        title: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('TaskTemplate', taskTemplateSchema);
