/**
 * AVENIR AI - Code Controller
 */
const { SUPPORTED_LANGUAGES, executeCode, executeTestCases, getDailyChallenge } = require('../services/codeService');

/**
 * POST /api/code/execute
 * Body: { language: string, code: string, stdin?: string }
 */
async function runCode(req, res) {
  try {
    const { language = 'javascript', code, stdin = '' } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide code to execute.',
      });
    }

    const result = await executeCode({ language, code, stdin });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CodeController] Execution error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Execution failed.',
    });
  }
}

/**
 * POST /api/code/test
 * Body: { language: string, code: string, testCases: Array }
 */
async function testCode(req, res) {
  try {
    const { language = 'python', code, testCases = [] } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide code to test.',
      });
    }

    const outcome = await executeTestCases({ language, code, testCases });
    return res.status(200).json({
      success: outcome.success !== undefined ? outcome.success : true,
      ...outcome,
    });
  } catch (error) {
    console.error('[CodeController] Test execution error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Test execution failed.',
    });
  }
}

/**
 * GET /api/code/runtimes
 */
function getRuntimes(req, res) {
  return res.status(200).json({
    success: true,
    languages: SUPPORTED_LANGUAGES,
  });
}

/**
 * GET /api/code/daily
 */
async function getDaily(req, res) {
  try {
    const challenge = await getDailyChallenge();
    return res.status(200).json({
      success: true,
      challenge,
    });
  } catch (error) {
    console.error('[CodeController] Daily challenge error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch daily challenge.',
    });
  }
}

module.exports = {
  runCode,
  testCode,
  getRuntimes,
  getDaily,
};

