const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const interviewController = require('../controllers/interviewController');
const reportService = require('../services/reportService');
const { db } = require('../config/firebase');

// Apply authentication middleware to all interview routes
router.use(authenticate);

// POST /api/interview/generate - Generate questions and create interview session
router.post('/generate', interviewController.generateQuestions);

// POST /api/interview/evaluate - Evaluate candidate's answer to a question
router.post('/evaluate', interviewController.evaluateAnswer);
router.post('/answer', interviewController.evaluateAnswer);

// POST /api/interview/followup - Generate adaptive follow-up question
router.post('/followup', interviewController.generateFollowUp);

// POST /api/interview/complete - Finalize interview and generate comprehensive assessment report
router.post('/complete', interviewController.completeInterview);

// GET /api/interview/history - List user's past interviews with pagination
router.get('/history', interviewController.getHistory);

// GET /api/interview/:id/report - Get stylized HTML report for download/print
router.get('/:id/report', async (req, res, next) => {
  try {
    const docRef = db.collection('interviews').doc(req.params.id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const data = docSnap.data();
    if (data.userId !== req.user.uid) {
      return res.status(403).json({ success: false, error: 'Unauthorized access to report' });
    }

    const htmlReport = reportService.generatePDFReport(data);
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlReport);
  } catch (error) {
    next(error);
  }
});

// GET /api/interview/:id - Get details of a specific interview session
router.get('/:id', interviewController.getInterview);

// DELETE /api/interview/:id - Delete an interview session
router.delete('/:id', interviewController.deleteInterview);

module.exports = router;
