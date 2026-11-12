/**
 * Input Validators and Sanitization Utilities
 * All validator functions return: { valid: boolean, errors: string[] }
 */

/**
 * Strips HTML tags and trims whitespace
 * @param {string} str
 * @returns {string}
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Strip control characters
    .trim();
};

/**
 * Normalises an interview type string to the canonical lowercase slug.
 * Accepts UI display values ("Technical Interview", "HR Interview", "Coding Interview", etc.)
 * and maps them to stable, canonical internal identifiers.
 * @param {string} raw
 * @returns {string} 'coding' | 'hr' | 'technical' | 'behavioral' | 'domain-specific'
 */
const normaliseInterviewType = (raw) => {
  if (typeof raw !== 'string') return 'technical';
  const s = raw.toLowerCase().trim();

  if (s.includes('coding') || s.includes('code') || s.includes('algo') || s.includes('dsa') || s.includes('leetcode')) {
    return 'coding';
  }
  if (s.includes('hr') || s.includes('human resource') || s.includes('cultural') || s.includes('people')) {
    return 'hr';
  }
  if (s.includes('behavioral') || s.includes('behavioural') || s.includes('star') || s.includes('leadership')) {
    return 'behavioral';
  }
  if (s.includes('domain') || s.includes('industry') || s.includes('role-specific') || s.includes('specialized')) {
    return 'domain-specific';
  }
  if (s.includes('technical') || s.includes('tech') || s.includes('system') || s.includes('architect')) {
    return 'technical';
  }

  // Fallback to technical
  return 'technical';
};

/**
 * Returns human-readable label and UI metadata for a canonical category
 * @param {string} canonical
 * @returns {{ key: string, label: string, icon: string, mode: string }}
 */
const getInterviewCategoryMetadata = (canonical) => {
  const norm = normaliseInterviewType(canonical);
  const metadataMap = {
    coding: {
      key: 'coding',
      label: 'Coding Interview',
      icon: 'code-2',
      mode: 'coding_sandbox',
      description: 'Hands-on algorithm, data structures, and code execution.',
    },
    hr: {
      key: 'hr',
      label: 'HR Interview',
      icon: 'users',
      mode: 'conversational',
      description: 'Culture fit, career background, and workplace communication.',
    },
    technical: {
      key: 'technical',
      label: 'Technical Interview',
      icon: 'cpu',
      mode: 'technical_dialogue',
      description: 'Deep technical concepts, architecture, and engineering principles.',
    },
    behavioral: {
      key: 'behavioral',
      label: 'Behavioral Interview',
      icon: 'message-square',
      mode: 'star_framework',
      description: 'Scenario-based questions evaluated with the STAR methodology.',
    },
    'domain-specific': {
      key: 'domain-specific',
      label: 'Domain-Specific Interview',
      icon: 'briefcase',
      mode: 'domain_scenario',
      description: 'Industry-specific tools, standards, and practical domain workflows.',
    },
  };

  return metadataMap[norm] || metadataMap.technical;
};

/**
 * Normalises an experience level string to the canonical lowercase slug.
 * Accepts UI display values ("Fresher", "Intermediate", "Experienced", etc.)
 * @param {string} raw
 * @returns {string}
 */
const normaliseExperienceLevel = (raw) => {
  if (typeof raw !== 'string') return '';
  const s = raw.toLowerCase().trim();

  if (s.startsWith('fresher') || s === '0' || s === '0-1' || s === '0-2 years' || s === 'entry' || s === 'entry-level') return 'entry';
  if (s.startsWith('intermediate') || s === 'junior' || s === 'mid' || s === 'mid-level' || s === '3-5 years') return 'mid';
  if (s.startsWith('experienced') || s === 'senior' || s === '5-8 years' || s === '8+ years') return 'senior';
  if (s === 'lead' || s === 'staff' || s === 'principal') return 'lead';
  if (s === 'executive' || s === 'director' || s === 'vp' || s === 'c-level') return 'executive';

  // Return as-is (lowercase) if already canonical
  return s;
};

/**
 * Normalises a difficulty string to the canonical lowercase slug.
 * Accepts UI display values ("Easy", "Medium", "Hard", "Expert", etc.)
 * @param {string} raw
 * @returns {string}
 */
const normaliseDifficulty = (raw) => {
  if (typeof raw !== 'string') return '';
  const s = raw.toLowerCase().trim();

  if (s === 'easy' || s === 'beginner' || s === 'basic') return 'easy';
  if (s === 'medium' || s === 'moderate' || s === 'intermediate') return 'medium';
  if (s === 'hard' || s === 'difficult' || s === 'advanced') return 'hard';
  if (s === 'expert' || s === 'extreme' || s === 'master') return 'expert';

  return s;
};

/**
 * Validates interview setup configuration.
 * Accepts both raw UI display values AND canonical slugs — always normalise first.
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[], normalised: object }}
 */
const validateInterviewConfig = (config) => {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Interview configuration payload is required.'], normalised: {} };
  }

  const { jobRole, interviewType, difficulty, experienceLevel, questionCount } = config;

  // ── Job Role ──────────────────────────────────────────────────────────────
  const cleanRole = sanitizeString(typeof jobRole === 'string' ? jobRole : '');
  if (!cleanRole || cleanRole.length < 2) {
    errors.push('Please select or enter a job role (minimum 2 characters).');
  } else if (cleanRole.length > 100) {
    errors.push('Job role must not exceed 100 characters.');
  }

  // ── Interview Type ────────────────────────────────────────────────────────
  const normType = normaliseInterviewType(interviewType || '');
  const validTypes = ['technical', 'behavioral', 'mixed', 'system-design', 'coding', 'hr', 'case-study', 'domain-specific'];
  if (!normType) {
    errors.push('Please select an interview category.');
  } else if (!validTypes.includes(normType)) {
    errors.push(`Interview type "${interviewType}" is not recognised. Please select a valid category.`);
  }

  // ── Difficulty ────────────────────────────────────────────────────────────
  const normDiff = normaliseDifficulty(difficulty || '');
  const validDifficulties = ['beginner', 'easy', 'medium', 'hard', 'expert'];
  if (!normDiff) {
    errors.push('Please select a difficulty level.');
  } else if (!validDifficulties.includes(normDiff)) {
    errors.push(`Difficulty "${difficulty}" is not recognised. Please select Easy, Medium, or Hard.`);
  }

  // ── Experience Level ──────────────────────────────────────────────────────
  const normExp = normaliseExperienceLevel(experienceLevel || '');
  const validExperience = ['entry', 'entry-level', 'junior', 'mid', 'mid-level', 'senior', 'lead', 'executive'];
  if (!normExp) {
    errors.push('Please select your experience level.');
  } else if (!validExperience.includes(normExp)) {
    errors.push(`Experience level "${experienceLevel}" is not recognised. Please select Fresher, Intermediate, or Experienced.`);
  }

  // ── Question Count ────────────────────────────────────────────────────────
  let normCount = 10;
  if (questionCount !== undefined) {
    normCount = parseInt(questionCount, 10);
    if (isNaN(normCount) || normCount < 1 || normCount > 20) {
      errors.push('Please select a valid number of questions (1 – 20).');
      normCount = 10;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalised: {
      jobRole: cleanRole,
      interviewType: normType,
      difficulty: normDiff,
      experienceLevel: normExp,
      questionCount: normCount,
    },
  };
};

/**
 * Validates interview answer submission
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateAnswer = (data) => {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Answer payload is required.'] };
  }

  const { interviewId, questionIndex, question, answer } = data;

  if (!interviewId || typeof interviewId !== 'string') {
    errors.push('Valid interviewId is required.');
  }

  if (question !== undefined && (typeof question !== 'string' || question.trim().length === 0)) {
    errors.push('Question text must be a non-empty string.');
  }

  if (answer === undefined || answer === null || typeof answer !== 'string') {
    errors.push('Answer must be provided as a string.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validates user profile updates
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateProfile = (data) => {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Profile data is required.'] };
  }

  const { displayName, headline, targetRole, bio, skills, yearsOfExperience, githubUrl, linkedinUrl, optInLeaderboard } = data;

  if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length < 2)) {
    errors.push('Display name must be at least 2 characters long.');
  }

  if (headline !== undefined && typeof headline !== 'string') {
    errors.push('Headline must be a string.');
  }

  if (targetRole !== undefined && typeof targetRole !== 'string') {
    errors.push('Target role must be a string.');
  }

  if (bio !== undefined && typeof bio !== 'string') {
    errors.push('Bio must be a string.');
  }

  if (skills !== undefined && !Array.isArray(skills) && typeof skills !== 'string') {
    errors.push('Skills must be an array of strings or comma-separated string.');
  }

  if (yearsOfExperience !== undefined) {
    const yoe = Number(yearsOfExperience);
    if (isNaN(yoe) || yoe < 0 || yoe > 60) {
      errors.push('Years of experience must be a valid number between 0 and 60.');
    }
  }

  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;
  if (githubUrl && typeof githubUrl === 'string' && !urlRegex.test(githubUrl.trim())) {
    errors.push('GitHub URL is invalid.');
  }

  if (linkedinUrl && typeof linkedinUrl === 'string' && !urlRegex.test(linkedinUrl.trim())) {
    errors.push('LinkedIn URL is invalid.');
  }

  if (optInLeaderboard !== undefined && typeof optInLeaderboard !== 'boolean') {
    errors.push('optInLeaderboard must be a boolean value.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validates uploaded resume file
 * @param {Express.Multer.File} file
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateResumeFile = (file) => {
  const errors = [];

  if (!file) {
    return { valid: false, errors: ['Resume file is required.'] };
  }

  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];

  const allowedExtensions = ['.pdf', '.docx', '.doc'];
  const originalName = (file.originalname || '').toLowerCase();
  const hasValidExtension = allowedExtensions.some((ext) => originalName.endsWith(ext));

  if (!allowedMimeTypes.includes(file.mimetype) && !hasValidExtension) {
    errors.push('Only PDF (.pdf) and Microsoft Word (.docx, .doc) files are allowed.');
  }

  // 5MB max size
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    errors.push('File size exceeds the 5MB limit.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  sanitizeString,
  normaliseInterviewType,
  normaliseExperienceLevel,
  normaliseDifficulty,
  getInterviewCategoryMetadata,
  validateInterviewConfig,
  validateAnswer,
  validateProfile,
  validateResumeFile,
};
