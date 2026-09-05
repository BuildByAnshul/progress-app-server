const express = require('express');
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /notifications — Fetch all notifications for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50); // Get latest 50 notifications
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /notifications/:id/read — Mark notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.userId });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    
    notification.isRead = true;
    await notification.save();
    
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /notifications/read-all — Mark all notifications as read
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.userId, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
