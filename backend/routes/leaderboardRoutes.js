const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const leaderboardController = require('../controllers/leaderboardController');

// All leaderboard routes require authentication
router.use(authenticate);

// GET /api/leaderboard - Get public community rankings
router.get('/', leaderboardController.getLeaderboard);

module.exports = router;
