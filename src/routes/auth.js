const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Task = require('../models/Task');
const { syncTasksTotal } = require('../points/engine');

const router = express.Router();

// Default tasks seeded for new users
const DEFAULT_TASKS = [
  { title: 'Fitness', subtitle: 'Workout or physical activity', priority: 'High', durationEstimate: 60, isDefault: true },
  { title: 'Personality', subtitle: 'Self reflection or grooming', priority: 'Medium', durationEstimate: 30, isDefault: true },
  { title: 'Social Activities', subtitle: 'Connect with friends/family', priority: 'Medium', durationEstimate: 60, isDefault: true },
  { title: 'Communication', subtitle: 'Improve speaking or writing', priority: 'Medium', durationEstimate: 45, isDefault: true },
  { title: 'Learn new thing', subtitle: 'Read a book or take a course', priority: 'High', durationEstimate: 60, isDefault: true },
];

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, seniority } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: role || 'Member',
      seniority: seniority || 'Mid',
    });

    // Seed default tasks for the new user
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const defaultTasks = DEFAULT_TASKS.map((t) => ({
      ...t,
      userId: user._id,
      scheduledDate: today,
    }));
    await Task.insertMany(defaultTasks);

    // Award five-task bonus for having 5 tasks on day 1
    await syncTasksTotal(user._id);

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        seniority: user.seniority,
        totalPoints: user.totalPoints,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        seniority: user.seniority,
        totalPoints: user.totalPoints,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
