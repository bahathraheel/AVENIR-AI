/**
 * AVENIR AI - Jobs Controller
 */
const { searchJobs, getAggregatedJobs } = require('../services/jobsService');

/**
 * GET /api/jobs
 * Query parameters:
 *  - q: search keyword / role (e.g. "React", "Frontend", "Python")
 *  - remote: "true" | "false"
 *  - limit: number of results (default: 12)
 */
async function getJobs(req, res) {
  try {
    const { q = '', remote, limit = 12 } = req.query;

    const jobs = await searchJobs({
      query: q,
      remote: remote !== undefined ? remote : null,
      limit: parseInt(limit, 10) || 12,
    });

    return res.status(200).json({
      success: true,
      count: jobs.length,
      query: q,
      jobs,
    });
  } catch (error) {
    console.error('[JobsController] Error fetching jobs:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve career opportunities at this time.',
    });
  }
}

module.exports = {
  getJobs,
};

