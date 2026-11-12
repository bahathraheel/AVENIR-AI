const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const analyticsController = require('../controllers/analyticsController');

// All analytics routes require authentication
router.use(authenticate);

// GET /api/analytics/dashboard - Aggregate summary stats for the dashboard
router.get('/dashboard', analyticsController.getDashboard);

// GET /api/analytics/performance - Categorical and temporal performance trends
router.get('/performance', analyticsController.getPerformance);

module.exports = router;
