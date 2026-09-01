const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /users/me — get current user's profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /users/me — update profile (name, role, seniority, avatar)
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, role, seniority, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (role) updates.role = role;
    if (seniority) updates.seniority = seniority;
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select(
      '-passwordHash'
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
