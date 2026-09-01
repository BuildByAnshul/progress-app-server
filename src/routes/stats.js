const express = require('express');
const DailyProgress = require('../models/DailyProgress');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /stats/daily?date=YYYY-MM-DD
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const progress = await DailyProgress.findOne({ userId: req.userId, date });
    res.json(progress || { userId: req.userId, date, pointsEarned: 0, tasksCompleted: 0, tasksTotal: 0, hoursLogged: 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /stats/weekly — returns Mon–Sun of the current week
router.get('/weekly', authMiddleware, async (req, res) => {
  try {
    // Build array of date strings for the current week (Mon–Sun)
    const today = new Date();
    const dayOfWeek = today.getUTCDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + mondayOffset);

    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });

    const records = await DailyProgress.find({
      userId: req.userId,
      date: { $in: weekDates },
    });

    // Map date → record (fill missing days with zeros)
    const byDate = {};
    records.forEach((r) => (byDate[r.date] = r));

    const weekData = weekDates.map((date) => ({
      date,
      pointsEarned: byDate[date]?.pointsEarned || 0,
      tasksCompleted: byDate[date]?.tasksCompleted || 0,
      tasksTotal: byDate[date]?.tasksTotal || 0,
      hoursLogged: byDate[date]?.hoursLogged || 0,
    }));

    res.json({ week: weekData, today: today.toISOString().slice(0, 10) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
