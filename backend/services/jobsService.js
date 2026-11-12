/**
 * AVENIR AI - Jobs Aggregator Service
 * Integrates with free public job board APIs (Arbeitnow & Remotive)
 * from github.com/public-apis/public-apis
 */

// In-memory cache to respect public API rate limits
let jobsCache = {
  data: [],
  timestamp: 0,
  ttlMs: 30 * 60 * 1000, // 30 minutes cache
};

/**
 * Fetch remote jobs from Remotive Public API
 */
async function fetchRemotiveJobs() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://remotive.com/api/remote-jobs?limit=30', {
      signal: controller.signal,
      headers: { 'User-Agent': 'AvenirAI-CareerPlatform/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[JobsService] Remotive returned status ${res.status}`);
      return [];
    }

    const json = await res.json();
    const jobs = json.jobs || [];

    return jobs.map((job) => ({
      id: `remotive-${job.id}`,
      title: job.title || 'Software Role',
      company: job.company_name || 'Tech Company',
      company_logo: job.company_logo || '',
      location: job.candidate_required_location || 'Remote (Worldwide)',
      category: job.category || 'Software Development',
      tags: Array.isArray(job.tags) ? job.tags.slice(0, 5) : [],
      url: job.url,
      salary: job.salary || null,
      job_type: job.job_type ? job.job_type.replace('_', ' ') : 'Full-time',
      remote: true,
      published_at: job.publication_date || new Date().toISOString(),
      source: 'Remotive',
    }));
  } catch (err) {
    console.warn('[JobsService] Remotive fetch skipped:', err.message);
    return [];
  }
}

/**
 * Fetch jobs from Arbeitnow Public API
 */
async function fetchArbeitnowJobs() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
      signal: controller.signal,
      headers: { 'User-Agent': 'AvenirAI-CareerPlatform/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[JobsService] Arbeitnow returned status ${res.status}`);
      return [];
    }

    const json = await res.json();
    const jobs = json.data || [];

    return jobs.map((job) => ({
      id: `arbeitnow-${job.slug || Math.random().toString(36).substring(7)}`,
      title: job.title || 'Developer Role',
      company: job.company_name || 'Innovate Inc',
      company_logo: '',
      location: job.location || (job.remote ? 'Remote' : 'Hybrid'),
      category: 'Software Engineering',
      tags: Array.isArray(job.tags) ? job.tags.slice(0, 5) : [],
      url: job.url,
      salary: null,
      job_type: job.job_types && job.job_types.length ? job.job_types[0] : 'Full-time',
      remote: Boolean(job.remote),
      published_at: new Date(job.created_at * 1000).toISOString(),
      source: 'Arbeitnow',
    }));
  } catch (err) {
    console.warn('[JobsService] Arbeitnow fetch skipped:', err.message);
    return [];
  }
}

/**
 * Fallback tech jobs if public services are temporarily unreachable
 */
function getCuratedFallbackJobs() {
  return [
    {
      id: 'fallback-1',
      title: 'Full Stack Engineer (Node.js & React)',
      company: 'CloudScale Technologies',
      location: 'Remote',
      category: 'Software Development',
      tags: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      url: 'https://news.ycombinator.com/jobs',
      salary: '$95,000 - $130,000',
      job_type: 'Full-time',
      remote: true,
      published_at: new Date().toISOString(),
      source: 'AVENIR Partner Network',
    },
    {
      id: 'fallback-2',
      title: 'AI / Machine Learning Integration Engineer',
      company: 'NeuralSphere AI',
      location: 'Remote / US & Europe',
      category: 'Data Science & AI',
      tags: ['Python', 'Gemini API', 'PyTorch', 'REST APIs'],
      url: 'https://news.ycombinator.com/jobs',
      salary: '$110,000 - $150,000',
      job_type: 'Full-time',
      remote: true,
      published_at: new Date().toISOString(),
      source: 'AVENIR Partner Network',
    },
    {
      id: 'fallback-3',
      title: 'Frontend Developer (UI/UX Focus)',
      company: 'Apex Digital Systems',
      location: 'Remote',
      category: 'Software Development',
      tags: ['JavaScript', 'CSS3', 'Modern Web', 'Performance'],
      url: 'https://news.ycombinator.com/jobs',
      salary: '$80,000 - $115,000',
      job_type: 'Full-time',
      remote: true,
      published_at: new Date().toISOString(),
      source: 'AVENIR Partner Network',
    },
    {
      id: 'fallback-4',
      title: 'Backend Platform Engineer',
      company: 'FinVantage Solutions',
      location: 'Hybrid / Remote',
      category: 'Software Development',
      tags: ['Node.js', 'Express', 'Microservices', 'Docker'],
      url: 'https://news.ycombinator.com/jobs',
      salary: '$100,000 - $140,000',
      job_type: 'Full-time',
      remote: true,
      published_at: new Date().toISOString(),
      source: 'AVENIR Partner Network',
    },
  ];
}

/**
 * Get all aggregated jobs with caching
 */
async function getAggregatedJobs({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && jobsCache.data.length > 0 && now - jobsCache.timestamp < jobsCache.ttlMs) {
    return jobsCache.data;
  }

  // Fetch concurrently
  const [remotive, arbeitnow] = await Promise.all([fetchRemotiveJobs(), fetchArbeitnowJobs()]);

  let combined = [...remotive, ...arbeitnow];

  if (combined.length === 0) {
    combined = getCuratedFallbackJobs();
  }

  // Deduplicate by title & company
  const seen = new Set();
  const deduped = [];
  for (const item of combined) {
    const key = `${(item.title || '').toLowerCase()}|${(item.company || '').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  jobsCache = {
    data: deduped,
    timestamp: now,
    ttlMs: jobsCache.ttlMs,
  };

  return deduped;
}

/**
 * Search and filter jobs
 */
async function searchJobs({ query = '', remote = null, limit = 15 } = {}) {
  const allJobs = await getAggregatedJobs();
  const qLower = (query || '').toLowerCase().trim();

  let filtered = allJobs;

  if (qLower) {
    filtered = filtered.filter((job) => {
      const matchTitle = (job.title || '').toLowerCase().includes(qLower);
      const matchCompany = (job.company || '').toLowerCase().includes(qLower);
      const matchLocation = (job.location || '').toLowerCase().includes(qLower);
      const matchTags = (job.tags || []).some((t) => t.toLowerCase().includes(qLower));
      return matchTitle || matchCompany || matchLocation || matchTags;
    });
  }

  if (remote === true || remote === 'true') {
    filtered = filtered.filter((j) => j.remote === true);
  }

  return filtered.slice(0, Math.min(Number(limit) || 15, 50));
}

module.exports = {
  getAggregatedJobs,
  searchJobs,
};

