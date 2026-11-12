const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const groupController = require('../controllers/groupController');

// All group routes require authentication
router.use(authenticate);

// POST /api/group/create - Create a collaborative group session
router.post('/create', groupController.createRoom);

// POST /api/group/join - Join session via room code
router.post('/join', groupController.joinRoom);

// GET /api/group/:roomId - Retrieve session status and questions
router.get('/:roomId', groupController.getRoom);

// POST /api/group/:roomId/answer - Submit answer for evaluation in session
router.post('/:roomId/answer', groupController.submitGroupAnswer);

module.exports = router;
