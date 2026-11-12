const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/authMiddleware');
const resumeController = require('../controllers/resumeController');

// Multer memory storage configuration for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Protect all resume routes
router.use(authenticate);

// POST /api/resume/analyze - Upload and analyze resume
router.post('/analyze', upload.single('resume'), resumeController.analyzeResume);

// GET /api/resume/latest - Retrieve user's most recent resume analysis
router.get('/latest', resumeController.getLatestResume);

// GET /api/resume/history - Retrieve user's previous resume analyses
router.get('/history', resumeController.getResumeHistory);

// GET /api/resume/:id - Get details of a specific resume analysis
router.get('/:id', resumeController.getResumeById);

module.exports = router;
