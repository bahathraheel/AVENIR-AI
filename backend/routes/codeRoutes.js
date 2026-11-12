/**
 * AVENIR AI - Code Routes
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { runCode, testCode, getRuntimes, getDaily } = require('../controllers/codeController');

// Rate limiter for code execution: 40 executions per 5 minutes per IP
const executionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  message: {
    success: false,
    error: 'Execution limit reached. Please wait a few minutes before running more code.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/execute', executionLimiter, runCode);
router.post('/test', executionLimiter, testCode);
router.get('/runtimes', getRuntimes);
router.get('/daily', getDaily);

module.exports = router;

