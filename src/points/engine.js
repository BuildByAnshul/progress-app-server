const DailyProgress = require('../models/DailyProgress');
const PointsLog = require('../models/PointsLog');
const User = require('../models/User');
const Task = require('../models/Task');

/**
 * Returns today's date as 'YYYY-MM-DD' string (UTC).
 */
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gets or creates today's DailyProgress for a user.
 */
async function getOrCreateProgress(userId, date) {
  let progress = await DailyProgress.findOne({ userId, date });
  if (!progress) {
    progress = await DailyProgress.create({ userId, date });
  }
  return progress;
}

/**
 * Award +1 point when a task is marked complete.
 * Also checks if the five-task bonus should be awarded.
 */
async function awardTaskComplete(userId, taskId) {
  const date = todayString();
  const progress = await getOrCreateProgress(userId, date);

  // Add +1 for completing the task
  progress.tasksCompleted += 1;
  progress.pointsEarned += 1;

  // Add hours from the completed task duration
  const task = await Task.findById(taskId);
  if (task) {
    progress.hoursLogged += task.durationEstimate / 60;
  }

  await progress.save();

  // Log it
  await PointsLog.create({ userId, date, reason: 'task_complete', delta: 1, taskId });

  // Update user's total points
  await User.findByIdAndUpdate(userId, { $inc: { totalPoints: 1 } });

  // Check five-task bonus
  await checkFiveTaskBonus(userId, date, progress);

  return progress;
}

/**
 * Award +5 bonus when a user has >= 5 tasks scheduled today.
 * Only awarded once per day.
 */
async function checkFiveTaskBonus(userId, date, progress) {
  if (!progress) {
    progress = await getOrCreateProgress(userId, date);
  }
  if (progress.fiveBonusAwarded) return; // already given today

  // Count today's scheduled tasks (not backlog)
  const startOfDay = new Date(date + 'T00:00:00.000Z');
  const endOfDay = new Date(date + 'T23:59:59.999Z');
  const taskCount = await Task.countDocuments({
    userId,
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    isBacklog: false,
    isCompleted: true,
  });

  if (taskCount >= 5) {
    progress.pointsEarned += 5;
    progress.fiveBonusAwarded = true;
    await progress.save();

    await PointsLog.create({ userId, date, reason: 'five_task_bonus', delta: 5 });
    await User.findByIdAndUpdate(userId, { $inc: { totalPoints: 5 } });
  }
}

/**
 * Recalculates tasksTotal for a user's daily progress.
 */
async function syncTasksTotal(userId) {
  const date = todayString();
  const startOfDay = new Date(date + 'T00:00:00.000Z');
  const endOfDay = new Date(date + 'T23:59:59.999Z');

  const total = await Task.countDocuments({
    userId,
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    isBacklog: false,
  });

  await DailyProgress.findOneAndUpdate(
    { userId, date },
    { $set: { tasksTotal: total } },
    { upsert: true, new: true }
  );

  // Also check the five-task bonus whenever total changes
  const progress = await getOrCreateProgress(userId, date);
  await checkFiveTaskBonus(userId, date, progress);
}

module.exports = { awardTaskComplete, checkFiveTaskBonus, syncTasksTotal, todayString };
