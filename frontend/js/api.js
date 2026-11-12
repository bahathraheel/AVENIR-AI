/**
 * AVENIR AI - Central API Client Module
 * Provides unified, authenticated HTTP request helpers for all backend endpoints.
 */

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000' 
  : 'YOUR_BACKEND_URL'; // Replace with actual backend URL after deployment

/**
 * Universal Toast Notification System
 * Displays floating alert notifications in the top right corner
 */
function showToast(message, type = 'info', duration = 4000) {
  let toastContainer = document.getElementById('avenir-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'avenir-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 380px;
      width: calc(100% - 48px);
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.setAttribute('role', 'alert');

  const bgColors = {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#252525'
  };

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.style.cssText = `
    background: #FFFFFF;
    color: #252525;
    border-left: 4px solid ${bgColors[type] || bgColors.info};
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04);
    border-radius: 8px;
    padding: 12px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: auto;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    transform: translateX(120%);
    opacity: 0;
  `;

  toast.innerHTML = `
    <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${bgColors[type]}15;color:${bgColors[type]};font-weight:bold;font-size:12px;flex-shrink:0;">
      ${icons[type] || icons.info}
    </span>
    <span style="flex-grow:1;word-break:break-word;">${message}</span>
    <button type="button" style="background:none;border:none;color:#9CA3AF;cursor:pointer;font-size:16px;padding:0 4px;margin-left:4px;line-height:1;" aria-label="Close notification">&times;</button>
  `;

  const closeBtn = toast.querySelector('button');
  const dismiss = () => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  };

  closeBtn.addEventListener('click', dismiss);
  toastContainer.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  });

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

/**
 * a) apiRequest(endpoint, method, body, isFormData, isRetry)
 * Central HTTP client with Firebase Auth bearer token injection,
 * automatic token refreshing on 401, error throwing, and protected route preservation.
 */
async function apiRequest(endpoint, method = 'GET', body = null, isFormData = false, isRetry = false) {
  let token = null;
  if (typeof getAuthToken === 'function') {
    token = await getAuthToken(isRetry);
  }

  const headers = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method: method.toUpperCase(),
    headers
  };

  if (body) {
    if (isFormData) {
      config.body = body; // Native FormData object
    } else {
      config.body = JSON.stringify(body);
    }
  }

  const targetUrl = `${API_BASE_URL}${endpoint}`;

  let response;
  try {
    response = await fetch(targetUrl, config);
  } catch (networkError) {
    console.error(`Network fetch failed for ${targetUrl}:`, networkError);
    throw new Error('Unable to connect to the backend server. Please verify your connection.');
  }

  // Handle 401 Unauthorized with automatic token refresh retry
  if (response.status === 401) {
    if (!isRetry && typeof getAuthToken === 'function') {
      console.warn(`401 received for ${endpoint}. Attempting automatic ID token refresh...`);
      try {
        const freshToken = await getAuthToken(true);
        if (freshToken) {
          // Retry the request once with the refreshed token
          return apiRequest(endpoint, method, body, isFormData, true);
        }
      } catch (refreshErr) {
        console.warn('Automatic token refresh failed:', refreshErr);
      }
    }

    // Only redirect to login if user is on a protected page
    const isProtected = typeof isProtectedPage === 'function' ? isProtectedPage() : true;
    if (isProtected) {
      console.warn('Session expired or unauthorized (401). Redirecting to login.');
      if (typeof showToast === 'function') {
        showToast('Your session has expired. Please sign in again.', 'warning');
      }
      setTimeout(() => {
        window.location.replace('login.html');
      }, 500);
    }
    throw new Error('Session expired. Please sign in again.');
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonError) {
    console.error('Failed to parse API JSON response:', jsonError);
    throw new Error(`Server returned invalid response (Status ${response.status}).`);
  }

  if (!response.ok || (data && data.success === false)) {
    const errorMsg = data?.error || data?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data.data !== undefined ? data.data : data;
}

/**
 * b) Specific API helper functions
 */

/**
 * POST /api/auth/verify
 * Verifies current token and synchronizes Firestore profile
 */
async function verifyAuth() {
  return await apiRequest('/api/auth/verify', 'POST');
}

/**
 * POST /api/interview/generate
 * Generates initial mock interview question set
 * @param {Object} config - { jobRole, interviewType, difficulty, experienceLevel, questionCount }
 */
async function generateQuestions(config) {
  return await apiRequest('/api/interview/generate', 'POST', {
    jobRole: config.jobRole,
    interviewType: config.interviewType,
    difficulty: config.difficulty,
    experienceLevel: config.experienceLevel,
    questionCount: config.questionCount
  });
}

/**
 * POST /api/interview/evaluate
 * Evaluates candidate's single answer
 * @param {Object} data - { interviewId, questionIndex, question, answer, jobRole, interviewType, difficulty }
 */
async function evaluateAnswer(data) {
  return await apiRequest('/api/interview/evaluate', 'POST', {
    interviewId: data.interviewId,
    questionIndex: data.questionIndex,
    question: data.question,
    answer: data.answer,
    jobRole: data.jobRole,
    interviewType: data.interviewType,
    difficulty: data.difficulty
  });
}

/**
 * POST /api/interview/followup
 * Generates an adaptive follow-up question
 */
async function generateFollowUp(data) {
  return await apiRequest('/api/interview/followup', 'POST', data);
}

/**
 * POST /api/interview/complete
 * Marks interview complete and computes comprehensive final report
 * @param {string} interviewId
 */
async function completeInterview(interviewId, answers = {}, evaluations = {}) {
  return await apiRequest('/api/interview/complete', 'POST', { interviewId, answers, evaluations });
}

/**
 * GET /api/interview/history
 * Retrieves user's mock interview history with pagination
 * @param {number} page
 * @param {number} limit
 */
async function getInterviewHistory(page = 1, limit = 10) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const offset = (pageNum - 1) * limitNum;
  return await apiRequest(`/api/interview/history?page=${pageNum}&limit=${limitNum}&offset=${offset}`, 'GET');
}

/**
 * GET /api/interview/:id
 * Fetches a single completed or in-progress interview
 * @param {string} id
 */
async function getInterview(id) {
  if (!id) throw new Error('Interview ID is required.');
  return await apiRequest(`/api/interview/${id}`, 'GET');
}

/**
 * DELETE /api/interview/:id
 * Permanently deletes an interview record
 * @param {string} id
 */
async function deleteInterview(id) {
  if (!id) throw new Error('Interview ID is required.');
  return await apiRequest(`/api/interview/${id}`, 'DELETE');
}

/**
 * POST /api/resume/analyze
 * Submits resume document file for ATS and skills analysis
 * @param {FormData} formData
 */
async function analyzeResume(formData) {
  return await apiRequest('/api/resume/analyze', 'POST', formData, true);
}

/**
 * GET /api/resume/latest
 * Retrieves most recent resume analysis for current user
 */
async function getLatestResume() {
  return await apiRequest('/api/resume/latest', 'GET');
}

/**
 * GET /api/resume/history
 * Retrieves all previous resume analyses for current user
 */
async function getResumeHistory() {
  return await apiRequest('/api/resume/history', 'GET');
}

/**
 * GET /api/resume/:id
 * Retrieves single resume analysis by ID
 */
async function getResumeById(id) {
  if (!id) throw new Error('Resume ID is required.');
  return await apiRequest(`/api/resume/${id}`, 'GET');
}

/**
 * GET /api/analytics/dashboard
 * Aggregates dashboard counts, average scores, and recent interviews
 */
async function getDashboardData() {
  return await apiRequest('/api/analytics/dashboard', 'GET');
}

/**
 * GET /api/analytics/performance
 * Returns detailed performance metrics and timelines
 * @param {string} filter - 'allTime', 'monthly', or 'weekly'
 */
async function getPerformanceData(filter = 'allTime') {
  const timeRange = (filter || 'allTime').toLowerCase();
  return await apiRequest(`/api/analytics/performance?timeRange=${timeRange}`, 'GET');
}

/**
 * GET /api/leaderboard
 * Fetches ranked leaderboard of opted-in candidates
 * @param {number} limit
 */
async function getLeaderboard(limit = 20) {
  return await apiRequest(`/api/leaderboard?limit=${limit}`, 'GET');
}

/**
 * POST /api/learning/generate
 * Generates structured learning roadmap
 * @param {Object} data - { jobRole, weakTopics, experienceLevel }
 */
async function generateLearningPlan(data) {
  return await apiRequest('/api/learning/generate', 'POST', data);
}

/**
 * POST /api/learning/progress
 * Updates completion status for a specific roadmap topic
 * @param {Object} data - { topicName, completed } or { completedTopics: [] }
 */
async function updateLearningProgress(data) {
  return await apiRequest('/api/learning/progress', 'POST', data);
}

/**
 * GET /api/learning/progress
 * Retrieves current learning curriculum and progress
 */
async function getLearningProgress() {
  return await apiRequest('/api/learning/progress', 'GET');
}

/**
 * POST /api/group/create
 * Creates a collaborative mock interview room
 * @param {Object} data - { title, jobRole, difficulty, questionCount }
 */
async function createGroupRoom(data) {
  return await apiRequest('/api/group/create', 'POST', data);
}

/**
 * POST /api/group/join
 * Joins a group room with a 6-character room code
 * @param {string} roomCode
 */
async function joinGroupRoom(roomCode) {
  return await apiRequest('/api/group/join', 'POST', { roomCode });
}

/**
 * GET /api/group/:roomId
 * Retrieves current status, questions, and participants of a room
 * @param {string} roomId
 */
async function getGroupRoom(roomId) {
  if (!roomId) throw new Error('Room ID is required.');
  return await apiRequest(`/api/group/${roomId}`, 'GET');
}

/**
 * POST /api/group/:roomId/answer
 * Submits an answer for evaluation in a group interview session
 * @param {string} roomId
 * @param {Object} data - { questionIndex, answer }
 */
async function submitGroupAnswer(roomId, data) {
  if (!roomId) throw new Error('Room ID is required.');
  return await apiRequest(`/api/group/${roomId}/answer`, 'POST', data);
}

/**
 * GET /api/user/profile
 * Retrieves user profile metadata
 */
async function getUserProfile() {
  return await apiRequest('/api/user/profile', 'GET');
}

/**
 * PUT /api/user/profile
 * Updates user profile details
 * @param {Object} data
 */
async function updateUserProfile(data) {
  return await apiRequest('/api/user/profile', 'PUT', data);
}

/**
 * PUT /api/user/settings
 * Updates preferences and application settings
 * @param {Object} data
 */
async function updateUserSettings(data) {
  return await apiRequest('/api/user/settings', 'PUT', data);
}

/**
 * POST /api/face/detect
 * Detects human faces and attributes from webcam snapshot or uploaded file
 * Note: Never requires or exposes API tokens on frontend; securely routed via backend.
 * @param {FormData|Object} payload - FormData with 'photo' or JSON { photo: "data:image/jpeg;base64,..." }
 */
async function detectFace(payload) {
  if (payload instanceof FormData) {
    return await apiRequest('/api/face/detect', 'POST', payload, true);
  }
  return await apiRequest('/api/face/detect', 'POST', payload, false);
}

/**
 * GET /api/face/status
 * Checks if face detection service is active and ready
 */
async function getFaceDetectionStatus() {
  return await apiRequest('/api/face/status', 'GET');
}

/**
 * GET /api/jobs
 * Fetch career opportunities from public job boards (Arbeitnow & Remotive)
 */
async function getJobs(params = {}) {
  const query = new URLSearchParams(params).toString();
  const endpoint = `/api/jobs${query ? `?${query}` : ''}`;
  return await apiRequest(endpoint, 'GET');
}

/**
 * POST /api/code/execute
 * Execute code in sandboxed compiler engine (Piston / Wandbox)
 */
async function executeCode(language, code, stdin = '') {
  return await apiRequest('/api/code/execute', 'POST', { language, code, stdin });
}

/**
 * POST /api/code/test
 * Execute code against multiple test cases and return pass/fail breakdown
 */
async function testCode(language, code, testCases = []) {
  return await apiRequest('/api/code/test', 'POST', { language, code, testCases });
}

/**
 * GET /api/code/runtimes
 */
async function getCodeRuntimes() {
  return await apiRequest('/api/code/runtimes', 'GET');
}

/**
 * GET /api/code/daily
 * Fetch daily technical challenge from LeetCode Daily API
 */
async function getDailyChallenge() {
  return await apiRequest('/api/code/daily', 'GET');
}

/**
 * GET /api/skills/search
 * Search canonical skills in EU ESCO Open API
 */
async function searchSkills(q = '') {
  return await apiRequest(`/api/skills/search?q=${encodeURIComponent(q)}`, 'GET');
}

/**
 * GET /api/skills/role-benchmark
 */
async function getRoleBenchmark(role = '') {
  return await apiRequest(`/api/skills/role-benchmark?role=${encodeURIComponent(role)}`, 'GET');
}

// Global Mobile Drawer & Icon Initializer
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (toggle) toggle.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  if (sidebar) {
    sidebar.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          closeSidebar();
        }
      });
    });
  }
});
window.API_BASE_URL = API_BASE_URL;
window.apiRequest = apiRequest;
window.showToast = showToast;
window.verifyAuth = verifyAuth;
window.generateQuestions = generateQuestions;
window.evaluateAnswer = evaluateAnswer;
window.generateFollowUp = generateFollowUp;
window.completeInterview = completeInterview;
window.getInterviewHistory = getInterviewHistory;
window.getInterview = getInterview;
window.deleteInterview = deleteInterview;
window.analyzeResume = analyzeResume;
window.getLatestResume = getLatestResume;
window.getResumeHistory = getResumeHistory;
window.getResumeById = getResumeById;
window.getDashboardData = getDashboardData;
window.getPerformanceData = getPerformanceData;
window.getLeaderboard = getLeaderboard;
window.generateLearningPlan = generateLearningPlan;
window.updateLearningProgress = updateLearningProgress;
window.getLearningProgress = getLearningProgress;
window.createGroupRoom = createGroupRoom;
window.joinGroupRoom = joinGroupRoom;
window.getGroupRoom = getGroupRoom;
window.submitGroupAnswer = submitGroupAnswer;
window.getUserProfile = getUserProfile;
window.updateUserProfile = updateUserProfile;
window.updateUserSettings = updateUserSettings;
window.detectFace = detectFace;
window.getFaceDetectionStatus = getFaceDetectionStatus;
window.getJobs = getJobs;
window.executeCode = executeCode;
window.testCode = testCode;
window.getCodeRuntimes = getCodeRuntimes;
window.getDailyChallenge = getDailyChallenge;
window.searchSkills = searchSkills;
window.getRoleBenchmark = getRoleBenchmark;
