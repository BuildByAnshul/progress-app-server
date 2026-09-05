const express = require('express');
const Task = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');
const authMiddleware = require('../middleware/auth');
const { awardTaskComplete, syncTasksTotal } = require('../points/engine');
const Notification = require('../models/Notification');
const { sendPushNotification } = require('../services/firebase');
const User = require('../models/User');

const router = express.Router();

/** Helper: start/end of a given date string 'YYYY-MM-DD' in UTC */
function dayRange(dateStr) {
  return {
    $gte: new Date(dateStr + 'T00:00:00.000Z'),
    $lte: new Date(dateStr + 'T23:59:59.999Z'),
  };
}

/** Today's date string */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// GET /tasks — all tasks for current user (optional ?date=YYYY-MM-DD&backlog=true)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date, backlog } = req.query;
    const filter = { userId: req.userId };
    if (date) filter.scheduledDate = dayRange(date);
    if (backlog !== undefined) filter.isBacklog = backlog === 'true';
    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /tasks/today
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Get all relevant templates for today
    // Rules: isGlobal = true OR userId = req.userId
    // AND (duration = 'forever' OR duration = 'today' with startDate=today OR duration = 'days' with startDate <= today <= endDate)
    const templates = await TaskTemplate.find({
      $or: [{ isGlobal: true }, { userId: req.userId }],
    });

    const validTemplates = templates.filter(t => {
      if (t.duration === 'forever') return true;
      
      const start = new Date(t.startDate);
      start.setUTCHours(0, 0, 0, 0);
      
      if (t.duration === 'today') return start.getTime() === today.getTime();
      if (t.duration === 'days') {
        const end = new Date(t.endDate);
        end.setUTCHours(23, 59, 59, 999);
        return today >= start && today <= end;
      }
      return false;
    });

    // For each valid template, check if a task is already instantiated for today
    for (const t of validTemplates) {
      const exists = await Task.findOne({
        userId: req.userId,
        templateId: t._id,
        scheduledDate: dayRange(todayStr()),
      });

      if (!exists) {
        await Task.create({
          userId: req.userId,
          title: t.title,
          subtitle: t.subtitle,
          templateId: t._id,
          scheduledDate: today,
          isDefault: t.isGlobal, // marking global as default
          subtasks: t.subtasks.map(st => ({ title: st.title })),
        });
      }
    }

    const tasks = await Task.find({
      userId: req.userId,
      scheduledDate: dayRange(todayStr()),
      isBacklog: false,
    }).sort({ createdAt: 1 });
    res.json(tasks);
  } catch (err) {
    console.error('Fetch today tasks error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /tasks/backlog
router.get('/backlog', authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.userId, isBacklog: true }).sort({ updatedAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /tasks/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /tasks — create a new task
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title, subtitle, dueDate, scheduledDate, assignedAvatars, attachments,
      linkedUrl, subtasks, isBacklog,
      visibility, duration, endDate // 'public'|'private', 'today'|'days'|'forever'
    } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    const isGlobal = visibility === 'public';
    const taskDuration = duration || 'today';
    let templateId = null;

    // If it's a recurring task or a global task, create a template
    if (isGlobal || taskDuration !== 'today') {
      const template = await TaskTemplate.create({
        userId: isGlobal ? null : req.userId,
        isGlobal,
        title,
        subtitle: subtitle || '',
        duration: taskDuration,
        startDate: scheduledDate ? new Date(scheduledDate) : new Date(),
        endDate: endDate ? new Date(endDate) : undefined,
        subtasks: subtasks || [],
      });
      templateId = template._id;
    }

    // Always instantiate it for today for the creator so they see it immediately
    // If it's a future task, we skip creating for today, but for simplicity let's assume it's for today onwards.
    const task = await Task.create({
      userId: req.userId,
      title,
      subtitle: subtitle || '',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      assignedAvatars: assignedAvatars || [],
      attachments: attachments || [],
      linkedUrl: linkedUrl || '',
      subtasks: subtasks || [],
      isBacklog: isBacklog || false,
      templateId: templateId,
      isDefault: isGlobal,
    });

    await syncTasksTotal(req.userId);
    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /tasks/:id — update task (general fields)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const wasCompleted = task.isCompleted;

    const allowed = [
      'title', 'subtitle', 'dueDate', 'scheduledDate', 'assignedAvatars', 'attachments',
      'linkedUrl', 'subtasks', 'isCompleted', 'isBacklog',
    ];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) task[field] = req.body[field];
    });

    await task.save();

    // Award points if task was just completed
    if (!wasCompleted && task.isCompleted) {
      await awardTaskComplete(req.userId, task._id);
    }

    await syncTasksTotal(req.userId);

    res.json(task);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /tasks/:id/complete — mark task complete (convenience endpoint)
router.put('/:id/complete', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.isCompleted) return res.json(task); // idempotent

    task.isCompleted = true;
    await task.save();

    const progress = await awardTaskComplete(req.userId, task._id);
    await syncTasksTotal(req.userId);

    // If it's a global task, notify others
    if (task.isDefault) {
      const currentUser = await User.findById(req.userId);
      const otherUsers = await User.find({ _id: { $ne: req.userId } });
      
      const msgTitle = "Task Completed!";
      const msgBody = `${currentUser.name} ne '${task.title}' task complete kar liya hai! 🎉`;
      
      const notifications = otherUsers.map(u => ({
        userId: u._id,
        title: msgTitle,
        body: msgBody,
        data: { taskId: task._id.toString() }
      }));
      await Notification.insertMany(notifications);

      // Send Push Notifications via FCM
      otherUsers.forEach(u => {
        if (u.fcmToken) sendPushNotification(u.fcmToken, msgTitle, msgBody, { taskId: task._id.toString() });
      });
    }

    res.json({ task, progress });
  } catch (err) {
    console.error('Complete task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /tasks/:id/subtasks/:subtaskId — toggle subtask completion
router.put('/:id/subtasks/:subtaskId', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ message: 'Subtask not found' });

    subtask.isCompleted = req.body.isCompleted !== undefined ? req.body.isCompleted : !subtask.isCompleted;

    // Auto-complete parent task when all subtasks are done
    const wasCompleted = task.isCompleted;
    if (task.subtasks.every((s) => s.isCompleted)) {
      task.isCompleted = true;
    }

    await task.save();

    if (!wasCompleted && task.isCompleted) {
      await awardTaskComplete(req.userId, task._id);
      await syncTasksTotal(req.userId);
    }

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /tasks/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    
    // If this task was tied to a template and the user owned it, delete the template too
    if (task.templateId) {
      await TaskTemplate.findOneAndDelete({ _id: task.templateId, userId: req.userId });
    }

    await syncTasksTotal(req.userId);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
