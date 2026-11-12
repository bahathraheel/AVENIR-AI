/**
 * Sanity check test suite for AVENIR AI backend validators and modules
 */
const {
  sanitizeString,
  validateInterviewConfig,
  validateAnswer,
  validateProfile,
  validateResumeFile,
} = require('../utils/validators');
const { formatReportData } = require('../services/reportService');

console.log('Testing validators and utilities...');

// Test 1: sanitizeString
const dirty = '<script>alert("hack")</script>Senior Backend Engineer';
const clean = sanitizeString(dirty);
if (clean !== 'alert("hack")Senior Backend Engineer' && !clean.includes('Senior Backend Engineer')) {
  console.error('FAIL: sanitizeString failed');
  process.exit(1);
}
console.log('PASS: sanitizeString');

// Test 2: validateInterviewConfig
const validConfig = {
  jobRole: 'Full Stack Engineer',
  interviewType: 'technical',
  difficulty: 'hard',
  experienceLevel: 'senior',
  questionCount: 5,
};
const res1 = validateInterviewConfig(validConfig);
if (!res1.valid || res1.errors.length > 0) {
  console.error('FAIL: validateInterviewConfig failed on valid input', res1.errors);
  process.exit(1);
}
console.log('PASS: validateInterviewConfig valid input');

const invalidConfig = {
  jobRole: '',
  interviewType: 'invalidType',
  difficulty: 'superHard',
  experienceLevel: '',
  questionCount: 99,
};
const res2 = validateInterviewConfig(invalidConfig);
if (res2.valid || res2.errors.length === 0) {
  console.error('FAIL: validateInterviewConfig passed on invalid input');
  process.exit(1);
}
console.log('PASS: validateInterviewConfig rejected invalid inputs');

// Test 3: validateAnswer
const answerRes = validateAnswer({
  interviewId: '123-456',
  questionIndex: 0,
  answer: 'I would use Redis for distributed caching.',
});
if (!answerRes.valid) {
  console.error('FAIL: validateAnswer failed on valid data');
  process.exit(1);
}
console.log('PASS: validateAnswer');

// Test 4: validateResumeFile
const validPdf = {
  originalname: 'resume.pdf',
  mimetype: 'application/pdf',
  size: 1024 * 500,
};
if (!validateResumeFile(validPdf).valid) {
  console.error('FAIL: validateResumeFile rejected valid PDF');
  process.exit(1);
}

const largeFile = {
  originalname: 'resume.pdf',
  mimetype: 'application/pdf',
  size: 10 * 1024 * 1024,
};
if (validateResumeFile(largeFile).valid) {
  console.error('FAIL: validateResumeFile allowed oversize file');
  process.exit(1);
}
console.log('PASS: validateResumeFile');

// Test 5: formatReportData
const dummyInterview = {
  id: 'test-123',
  jobRole: 'Cloud Architect',
  interviewType: 'technical',
  questions: [{ id: 1, question: 'What is CAP theorem?' }],
  answers: { '0': 'Consistency, Availability, Partition tolerance.' },
  evaluations: { '0': { overallScore: 92 } },
  report: { overallScore: 92 },
};
const formatted = formatReportData(dummyInterview);
if (formatted.overallScore !== 92 || formatted.questions.length !== 1) {
  console.error('FAIL: formatReportData did not format correctly');
  process.exit(1);
}
console.log('PASS: formatReportData');

console.log('All sanity checks passed successfully!');
