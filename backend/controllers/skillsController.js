/**
 * AVENIR AI - Skills Controller
 */
const { searchStandardSkills, getRoleBenchmark } = require('../services/skillsService');

/**
 * GET /api/skills/search?q=...
 */
async function searchSkills(req, res) {
  try {
    const { q = '' } = req.query;
    const skills = await searchStandardSkills(q);
    return res.status(200).json({
      success: true,
      query: q,
      count: skills.length,
      skills,
    });
  } catch (error) {
    console.error('[SkillsController] Search error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to search standardized skills.',
    });
  }
}

/**
 * GET /api/skills/role-benchmark?role=...
 */
function getBenchmark(req, res) {
  try {
    const { role = '' } = req.query;
    const benchmark = getRoleBenchmark(role);
    return res.status(200).json({
      success: true,
      benchmark,
    });
  } catch (error) {
    console.error('[SkillsController] Benchmark error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve role benchmark.',
    });
  }
}

module.exports = {
  searchSkills,
  getBenchmark,
};

