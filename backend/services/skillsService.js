/**
 * AVENIR AI - Skills & Taxonomy Service
 * Integrates with EU ESCO (European Skills, Competences, Qualifications and Occupations)
 * from github.com/public-apis/public-apis
 */

const ESCO_SEARCH_URL = 'https://ec.europa.eu/esco/api/search';

// Pre-indexed role competency benchmarks mapped to canonical skill standards
const ROLE_BENCHMARKS = {
  'frontend developer': {
    title: 'Frontend Developer',
    coreSkills: ['JavaScript', 'HTML5', 'CSS3', 'React', 'TypeScript', 'Web Accessibility (WCAG)', 'REST APIs', 'Git', 'Responsive Web Design'],
    recommendedSkills: ['Next.js', 'State Management (Redux/Zustand)', 'Web Performance Optimization', 'Unit Testing (Jest/Playwright)', 'CI/CD Pipelines'],
  },
  'backend developer': {
    title: 'Backend Developer',
    coreSkills: ['Node.js', 'Express.js', 'RESTful API Architecture', 'SQL & Relational Databases', 'NoSQL (MongoDB/Firestore)', 'Authentication (OAuth/JWT)', 'Git'],
    recommendedSkills: ['Docker & Containerization', 'Microservices Architecture', 'Redis Caching', 'Message Brokers (RabbitMQ/Kafka)', 'Cloud Deployment (AWS/GCP)'],
  },
  'full stack developer': {
    title: 'Full Stack Developer',
    coreSkills: ['JavaScript', 'TypeScript', 'React / Modern Frontend Framework', 'Node.js / Express', 'Database Design & Management', 'REST / GraphQL APIs', 'Git'],
    recommendedSkills: ['Docker', 'Cloud Infrastructure', 'Test-Driven Development', 'Application Security (OWASP)', 'Continuous Integration'],
  },
  'data scientist': {
    title: 'Data Scientist & AI Engineer',
    coreSkills: ['Python', 'SQL', 'Data Analysis (Pandas, NumPy)', 'Machine Learning (Scikit-Learn)', 'Gemini API / LLM Prompt Engineering', 'Data Visualization'],
    recommendedSkills: ['PyTorch / TensorFlow', 'Statistical Modeling', 'MLOps & Model Deployment', 'Feature Engineering', 'Big Data (Spark)'],
  },
  'devops engineer': {
    title: 'DevOps & Cloud Engineer',
    coreSkills: ['Linux System Administration', 'Docker & Kubernetes', 'CI/CD Pipelines (GitHub Actions)', 'Infrastructure as Code (Terraform)', 'Cloud Platforms (AWS/GCP/Azure)', 'Bash Scripting'],
    recommendedSkills: ['Prometheus & Grafana Monitoring', 'Network Security', 'Serverless Architecture', 'Site Reliability Engineering (SRE)'],
  },
};

/**
 * Search standardized skills in ESCO Open API with fallback
 */
async function searchStandardSkills(keyword) {
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return [];
  }

  const query = keyword.trim().toLowerCase();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const targetUrl = `${ESCO_SEARCH_URL}?type=skill&text=${encodeURIComponent(query)}&language=en&limit=8`;
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AvenirAI-Platform/1.0',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const items = (data._embedded && data._embedded.results) || [];
      if (items.length > 0) {
        return items.map((item) => ({
          title: item.title,
          uri: item.uri,
          type: 'Standardized Skill',
          description: (item.description && item.description.en && item.description.en[0]) || '',
          source: 'EU ESCO',
        }));
      }
    }
  } catch (err) {
    console.warn('[SkillsService] ESCO search skipped:', err.message);
  }

  // Fallback match against common tech taxonomies
  const commonTaxonomy = [
    'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js', 'Express',
    'HTML5', 'CSS3', 'SQL', 'PostgreSQL', 'MongoDB', 'Docker',
    'Kubernetes', 'Git', 'REST APIs', 'GraphQL', 'AWS', 'Google Cloud',
    'CI/CD Pipelines', 'Automated Testing', 'Agile Methodologies',
  ];

  return commonTaxonomy
    .filter((s) => s.toLowerCase().includes(query))
    .map((s) => ({
      title: s,
      type: 'Core Competency',
      description: `Industry standard competency in ${s}.`,
      source: 'AVENIR Competency Framework',
    }));
}

/**
 * Get role benchmark skills
 */
function getRoleBenchmark(roleQuery) {
  const q = (roleQuery || 'full stack developer').toLowerCase().trim();

  for (const [key, benchmark] of Object.entries(ROLE_BENCHMARKS)) {
    if (q.includes(key) || key.includes(q)) {
      return benchmark;
    }
  }

  return ROLE_BENCHMARKS['full stack developer'];
}

module.exports = {
  ROLE_BENCHMARKS,
  searchStandardSkills,
  getRoleBenchmark,
};

