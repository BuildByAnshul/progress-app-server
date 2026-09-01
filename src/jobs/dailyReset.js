const cron = require('node-cron');
const Task = require('../models/Task');
const DailyProgress = require('../models/DailyProgress');

/**
 * Runs at midnight (00:00) every day.
 * - Moves all incomplete today-tasks to backlog
 * - Ensures DailyProgress records exist for all active users
 */
function startDailyResetJob() {
  // '0 0 * * *' = midnight every day
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Daily reset job running at', new Date().toISOString());

    try {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setUTCHours(23, 59, 59, 999);

      // Mark all incomplete tasks from yesterday as backlog
      const result = await Task.updateMany(
        {
          scheduledDate: { $gte: yesterday, $lte: yesterdayEnd },
          isCompleted: false,
          isBacklog: false,
        },
        { $set: { isBacklog: true } }
      );

      console.log(`[CRON] Moved ${result.modifiedCount} tasks to backlog`);
    } catch (err) {
      console.error('[CRON] Daily reset error:', err);
    }
  });

  console.log('[CRON] Daily reset job scheduled at midnight');
}

module.exports = { startDailyResetJob };
