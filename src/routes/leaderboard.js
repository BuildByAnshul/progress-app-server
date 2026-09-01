const express = require('express');
const DailyProgress = require('../models/DailyProgress');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /leaderboard — all users sorted by this-week points, highest first
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Get current week's Mon–Sun date strings
    const today = new Date();
    const dayOfWeek = today.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + mondayOffset);

    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });

    // Aggregate: sum points per user for this week
    const weeklyAgg = await DailyProgress.aggregate([
      { $match: { date: { $in: weekDates } } },
      {
        $group: {
          _id: '$userId',
          weeklyPoints: { $sum: '$pointsEarned' },
          tasksCompleted: { $sum: '$tasksCompleted' },
        },
      },
      { $sort: { weeklyPoints: -1 } },
    ]);

    // Fetch user details
    const userIds = weeklyAgg.map((a) => a._id);
    const users = await User.find({ _id: { $in: userIds } }).select('name avatar role seniority totalPoints');

    const userMap = {};
    users.forEach((u) => (userMap[u._id.toString()] = u));

    // Also include users with 0 points this week (they may still be in the system)
    const allUsers = await User.find().select('name avatar role seniority totalPoints');
    const aggUserIds = new Set(userIds.map((id) => id.toString()));

    const zeroEntries = allUsers
      .filter((u) => !aggUserIds.has(u._id.toString()))
      .map((u) => ({ _id: u._id, weeklyPoints: 0, tasksCompleted: 0 }));

    const combined = [...weeklyAgg, ...zeroEntries];

    // Find max weekly points for progress bar normalization
    const maxPoints = combined.length > 0 ? Math.max(...combined.map((e) => e.weeklyPoints), 1) : 1;

    const leaderboard = combined.map((entry, index) => {
      const userId = entry._id.toString();
      const user = userMap[userId] || allUsers.find((u) => u._id.toString() === userId);
      return {
        rank: index + 1,
        userId,
        name: user?.name || 'Unknown',
        avatar: user?.avatar || '',
        role: user?.role || '',
        seniority: user?.seniority || '',
        totalPoints: user?.totalPoints || 0,
        weeklyPoints: entry.weeklyPoints,
        tasksCompleted: entry.tasksCompleted,
        progressRatio: entry.weeklyPoints / maxPoints,
      };
    });

    // Sort again after merging (zeroEntries might mix)
    leaderboard.sort((a, b) => b.weeklyPoints - a.weeklyPoints);
    leaderboard.forEach((e, i) => (e.rank = i + 1));

    res.json({ leaderboard, currentUserId: req.userId });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
