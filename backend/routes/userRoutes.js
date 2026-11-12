const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// All user routes require authentication
router.use(authenticate);

// GET /api/user/profile - Fetch authenticated user profile
router.get('/profile', userController.getProfile);

// PUT /api/user/profile - Update profile details
router.put('/profile', userController.updateProfile);

// PUT /api/user/settings - Update preferences
router.put('/settings', userController.updateSettings);

module.exports = router;
