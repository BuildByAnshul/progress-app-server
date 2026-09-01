const express = require('express');
const Task = require('../models/Task');
const authMiddleware = require('../middleware/auth');
const { awardTaskComplete, syncTasksTotal } = require('../points/engine');

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
    const tasks = await Task.find({
      userId: req.userId,
      scheduledDate: dayRange(todayStr()),
      isBacklog: false,
    }).sort({ createdAt: 1 });
    res.json(tasks);
  } catch (err) {
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
      title, subtitle, categoryIcon, priority, durationEstimate,
      dueDate, scheduledDate, assignedAvatars, attachments,
      linkedUrl, subtasks, isBacklog,
    } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    const task = await Task.create({
      userId: req.userId,
      title,
      subtitle: subtitle || '',
      categoryIcon: categoryIcon || 'grid',
      priority: priority || 'Medium',
      durationEstimate: durationEstimate || 60,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
      assignedAvatars: assignedAvatars || [],
      attachments: attachments || [],
      linkedUrl: linkedUrl || '',
      subtasks: subtasks || [],
      isBacklog: isBacklog || false,
    });

    // Recalculate today's task total and check five-task bonus
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
      'title', 'subtitle', 'categoryIcon', 'priority', 'durationEstimate',
      'dueDate', 'scheduledDate', 'assignedAvatars', 'attachments',
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
    await syncTasksTotal(req.userId);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
