require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const statsRoutes = require('./routes/stats');
const leaderboardRoutes = require('./routes/leaderboard');
const pointsRoutes = require('./routes/points');
const notificationRoutes = require('./routes/notifications');
const { startDailyResetJob } = require('./jobs/dailyReset');
require('./services/firebase'); // Initialize Firebase

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/tasks', taskRoutes);
app.use('/stats', statsRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/notifications', notificationRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// 404 catch-all
app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

// ── Database + Server start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/progressapp';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected:', MONGO_URI);
    startDailyResetJob();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
