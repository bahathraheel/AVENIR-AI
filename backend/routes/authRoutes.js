const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/verify - Verify Firebase ID Token and sync user profile
router.post('/verify', authController.verifyToken);

module.exports = router;
