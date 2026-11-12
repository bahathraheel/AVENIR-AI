const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const learningController = require('../controllers/learningController');

// Protect all learning routes
router.use(authenticate);

// POST /api/learning/generate - Generate personalized learning roadmap
router.post('/generate', learningController.generateRoadmap);

// POST /api/learning/progress - Update progress on roadmap topics
router.post('/progress', learningController.updateProgress);

// GET /api/learning/progress - Retrieve current roadmap and completion status
router.get('/progress', learningController.getProgress);

module.exports = router;
