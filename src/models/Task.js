const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
});

const attachmentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileSize: { type: String, default: '' },
  fileType: { type: String, default: 'file' }, // file | zip | image | doc
  url: { type: String, default: '' },
});

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    categoryIcon: { type: String, default: 'grid' }, // icon identifier string
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    durationEstimate: { type: Number, default: 60 }, // minutes
    dueDate: { type: Date },
    scheduledDate: { type: Date, default: () => new Date() }, // date the task belongs to
    assignedAvatars: [{ type: String }], // array of avatar URLs
    attachments: [attachmentSchema],
    linkedUrl: { type: String, default: '' },
    subtasks: [subtaskSchema],
    isCompleted: { type: Boolean, default: false, index: true },
    isBacklog: { type: Boolean, default: false, index: true },
    isDefault: { type: Boolean, default: false }, // seeded default tasks
  },
  { timestamps: true }
);

// Index for efficient today's tasks lookup
taskSchema.index({ userId: 1, scheduledDate: 1, isBacklog: 1 });

module.exports = mongoose.model('Task', taskSchema);
