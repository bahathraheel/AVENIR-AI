/**
 * AVENIR AI - Dashboard Module
 * Manages overview stats, dynamic score charts, recent interviews list, and weekly goals.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Ensure Lucide icons render
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Initialize Dashboard once Auth is confirmed
  initializeDashboard();
});

/**
 * Main dashboard initialization coordinator
 */
async function initializeDashboard() {
  let user = null;
  if (typeof waitForAuthInit === 'function') {
    user = await waitForAuthInit();
  } else if (typeof firebase !== 'undefined' && firebase.auth) {
    user = firebase.auth().currentUser;
  }

  if (user) {
    setupUserProfileDisplay(user);
    loadDashboardContent();
  } else if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged((u) => {
      if (u) {
        setupUserProfileDisplay(u);
        loadDashboardContent();
      }
    });
  } else {
    // Fallback if auth check is handled independently
    loadDashboardContent();
  }

  setupEventListeners();
}

/**
 * Populate user profile information in welcome banner and sidebar
 */
function setupUserProfileDisplay(user) {
  const displayName = user.displayName || user.email?.split('@')[0] || 'Candidate';
  const email = user.email || '';
  const initial = displayName.charAt(0).toUpperCase();

  const nameEl = document.getElementById('userNameDisplay');
  if (nameEl) nameEl.textContent = displayName;

  const sidebarName = document.getElementById('sidebarUserName');
  if (sidebarName) sidebarName.textContent = displayName;

  const sidebarEmail = document.getElementById('sidebarUserEmail');
  if (sidebarEmail) sidebarEmail.textContent = email;

  const sidebarAvatar = document.getElementById('sidebarUserAvatar');
  if (sidebarAvatar) {
    if (user.photoURL) {
      sidebarAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;">`;
    } else {
      sidebarAvatar.textContent = initial;
    }
  }
}

/**
 * Fetch and render dashboard statistics and recent interview history
 */
async function loadDashboardContent() {
  try {
    const data = await getDashboardData();
    renderStatCards(data);
    renderRecentInterviews(data.recentInterviews || []);
    renderPerformanceChart(data.recentInterviews || []);
    renderWeeklyProgress(data);

    // Load Live Public APIs integrations
    loadDailyChallenge();
    loadCareerOpportunities();

    // Show Firestore setup notice if DB not yet created
    if (data.firestoreNotice) {
      showFirestoreNotice(data.firestoreNotice);
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    if (typeof showToast === 'function') {
      showToast('Failed to load dashboard data: ' + error.message, 'error');
    }
  }
}

/**
 * Show a dismissible notice when Firestore database hasn't been created yet
 */
function showFirestoreNotice(message) {
  // Don't duplicate
  if (document.getElementById('firestoreNoticeBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'firestoreNoticeBanner';
  banner.className = 'firestore-notice-banner';
  banner.innerHTML = `
    <div class="notice-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    </div>
    <div class="notice-text">
      <p class="notice-title">Database Setup Required</p>
      <p class="notice-desc">
        Your Firestore database hasn't been created yet. Data is temporarily stored in memory.
        <a class="notice-link" href="https://console.firebase.google.com/project/avenir-ai-7b10f/firestore" target="_blank" rel="noopener">
          Create Firestore database →
        </a>
        (Choose production mode, region: <strong>us-central1</strong>)
      </p>
    </div>
    <button class="notice-dismiss" title="Dismiss" onclick="this.parentElement.remove()">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  // Insert after the page header / top-bar area
  const mainContent = document.querySelector('.main-content') || document.querySelector('main') || document.body;
  const firstChild = mainContent.firstElementChild;
  if (firstChild) {
    mainContent.insertBefore(banner, firstChild);
  } else {
    mainContent.appendChild(banner);
  }
}

/**
 * Populate numerical statistic cards
 */
function renderStatCards(data) {
  const totalEl = document.getElementById('statTotalInterviews');
  if (totalEl) totalEl.textContent = data.totalInterviews ?? 0;

  const avgEl = document.getElementById('statAvgScore');
  if (avgEl) avgEl.textContent = `${data.avgScore ?? 0}%`;

  const highEl = document.getElementById('statHighestScore');
  if (highEl) highEl.textContent = `${data.highestScore ?? 0}%`;

  const compEl = document.getElementById('statCompletedInterviews');
  if (compEl) compEl.textContent = data.completedCount ?? 0;

  // Toggle welcome banner if brand new user
  const welcomeBanner = document.getElementById('dashboardWelcomeBanner');
  if (welcomeBanner && data.totalInterviews > 0) {
    welcomeBanner.style.display = 'none';
  }
}

/**
 * Render recent mock interview cards or show empty state
 */
function renderRecentInterviews(interviews) {
  const listContainer = document.getElementById('recentInterviewsList');
  const emptyState = document.getElementById('recentInterviewsEmpty');

  if (!listContainer) return;

  if (!interviews || interviews.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  // Clear existing items but preserve empty state template
  listContainer.innerHTML = '';

  interviews.forEach((item) => {
    const card = document.createElement('a');
    card.href = item.status === 'completed' ? `results.html?id=${item.id}` : `interview-room.html`;
    card.className = 'recent-interview-item';
    card.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      margin-bottom: 10px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    `;

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#FF5841';
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 4px 12px rgba(255, 88, 65, 0.12)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#E5E7EB';
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
    });

    // Format date cleanly
    let dateStr = 'Recent';
    if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {
        dateStr = item.createdAt.substring(0, 10);
      }
    }

    const scoreDisplay = typeof item.overallScore === 'number' 
      ? `${item.overallScore}%` 
      : (item.status === 'completed' ? 'Evaluated' : 'In Progress');

    const scoreColor = (typeof item.overallScore === 'number' && item.overallScore >= 80)
      ? '#10B981'
      : (typeof item.overallScore === 'number' && item.overallScore >= 60)
        ? '#FF5841'
        : '#6B7280';

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 14px;">
        <div style="width: 42px; height: 42px; border-radius: 8px; background: rgba(255, 88, 65, 0.1); display: flex; align-items: center; justify-content: center; color: #FF5841;">
          <i data-lucide="file-text" style="width: 20px; height: 20px;"></i>
        </div>
        <div>
          <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #252525;">${item.jobRole || 'Technical Interview'}</h4>
          <div style="display: flex; gap: 8px; font-size: 12px; color: #6B7280; align-items: center;">
            <span>${item.interviewType || 'Mock'}</span>
            <span>•</span>
            <span style="text-transform: capitalize;">${item.difficulty || 'Medium'}</span>
            <span>•</span>
            <span>${dateStr}</span>
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="text-align: right;">
          <span style="display: block; font-size: 16px; font-weight: 700; color: ${scoreColor};">${scoreDisplay}</span>
          <span style="font-size: 11px; text-transform: uppercase; color: #9CA3AF; letter-spacing: 0.04em;">${item.status || 'Done'}</span>
        </div>
        <i data-lucide="chevron-right" style="color: #9CA3AF; width: 18px; height: 18px;"></i>
      </div>
    `;

    listContainer.appendChild(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Render canvas-based performance progression chart
 */
function renderPerformanceChart(recentInterviews) {
  const canvas = document.getElementById('performanceChart');
  const fallback = document.getElementById('chartFallback');

  if (!canvas) return;

  // Filter completed items with valid numerical scores
  const scoredItems = (recentInterviews || [])
    .filter((item) => typeof item.overallScore === 'number' && !isNaN(item.overallScore))
    .slice(0, 10)
    .reverse(); // Chronological left-to-right

  if (scoredItems.length === 0) {
    if (fallback) fallback.classList.remove('hidden');
    canvas.style.display = 'none';
    return;
  }

  if (fallback) fallback.classList.add('hidden');
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // High-DPI crisp rendering
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 400;
  const height = rect.height || 220;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const paddingLeft = 36;
  const paddingRight = 20;
  const paddingTop = 28;
  const paddingBottom = 32;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Draw grid lines
  const gridSteps = 4;
  ctx.strokeStyle = '#F3F4F6';
  ctx.lineWidth = 1;
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const val = (100 / gridSteps) * i;
    const y = paddingTop + chartHeight - (chartHeight / gridSteps) * i;

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    ctx.fillText(`${val}%`, paddingLeft - 6, y + 4);
  }

  // Draw Bars
  const count = scoredItems.length;
  const barWidth = Math.min(36, Math.max(16, (chartWidth / count) * 0.55));
  const spacing = chartWidth / count;

  scoredItems.forEach((item, idx) => {
    const x = paddingLeft + idx * spacing + (spacing - barWidth) / 2;
    const score = Math.max(0, Math.min(100, item.overallScore));
    const barHeight = (score / 100) * chartHeight;
    const y = paddingTop + chartHeight - barHeight;

    // Gradient bar
    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#FF5841');
    gradient.addColorStop(1, '#C53678');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    const radius = 4;
    // Rounded top bar
    ctx.moveTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, y + barHeight);
    ctx.lineTo(x, y + barHeight);
    ctx.closePath();
    ctx.fill();

    // Score label on top of bar
    ctx.fillStyle = '#252525';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${score}%`, x + barWidth / 2, y - 6);

    // X-axis label (index or short date)
    let label = `#${idx + 1}`;
    if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        label = `${d.getMonth() + 1}/${d.getDate()}`;
      } catch (e) {
        label = `#${idx + 1}`;
      }
    }

    ctx.fillStyle = '#6B7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barWidth / 2, height - 10);
  });
}

/**
 * Calculate and render weekly progress toward goals
 */
function renderWeeklyProgress(data) {
  const fractionEl = document.getElementById('weeklyProgressFraction');
  const barEl = document.getElementById('weeklyProgressBar');

  // Compute interviews completed within the last 7 days
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Track which day-of-week had completions (0=Mon...6=Sun)
  const activeDays = new Set();

  let thisWeekCount = 0;
  if (data.recentInterviews && Array.isArray(data.recentInterviews)) {
    data.recentInterviews.forEach((item) => {
      if (item.status === 'completed' && item.createdAt) {
        const itemDate = new Date(item.createdAt);
        if (itemDate >= weekStart) {
          thisWeekCount++;
          // Convert JS getDay (0=Sun) to Mon-based (0=Mon...6=Sun)
          const dayIdx = (itemDate.getDay() + 6) % 7;
          activeDays.add(dayIdx);
        }
      }
    });
  }

  const weeklyTarget = 5; // Default weekly goal
  const percent = Math.min(100, Math.round((thisWeekCount / weeklyTarget) * 100));

  if (fractionEl) fractionEl.textContent = `${thisWeekCount} / ${weeklyTarget}`;
  if (barEl) barEl.style.width = `${percent}%`;

  // Rebuild weekly days grid with proper MON-SUN labels + CSS dot classes
  const daysGrid = document.getElementById('weeklyDaysGrid');
  if (daysGrid) {
    const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const todayIdx = (now.getDay() + 6) % 7; // Mon=0 … Sun=6

    daysGrid.innerHTML = DAY_LABELS.map((label, idx) => {
      const isActive = activeDays.has(idx);
      const isToday = idx === todayIdx;
      const dotClass = isActive ? 'dot-indicator active' : 'dot-indicator';
      const labelStyle = isToday ? 'color:#FF5841;font-weight:800;' : '';
      return `
        <div class="day-dot">
          <div class="${dotClass}"></div>
          <span class="day-label" style="${labelStyle}">${label}</span>
        </div>`;
    }).join('');
  }
}

/**
 * Setup navigation & action button event handlers
 */
function setupEventListeners() {
  // Mobile sidebar toggle handlers
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.add('active');
    });
  }

  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    });
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }
}

/**
 * Load and render today's technical challenge from LeetCode Daily API
 */
async function loadDailyChallenge() {
  const titleEl = document.getElementById('dailyChallengeTitle');
  const tagsEl = document.getElementById('dailyChallengeTags');
  const diffEl = document.getElementById('dailyChallengeDifficulty');
  const solveBtn = document.getElementById('solveChallengeBtn');

  if (!titleEl) return;

  try {
    const res = await getDailyChallenge();
    if (res && res.challenge) {
      const { title, difficulty, questionLink, topicTags } = res.challenge;
      titleEl.textContent = title || 'Daily Technical Challenge';
      if (diffEl) {
        diffEl.textContent = difficulty || 'Medium';
        diffEl.className = `badge badge-${(difficulty || '').toLowerCase() === 'easy' ? 'success' : (difficulty || '').toLowerCase() === 'hard' ? 'danger' : 'primary'}`;
      }
      if (tagsEl && Array.isArray(topicTags)) {
        tagsEl.innerHTML = topicTags.slice(0, 4).map(t => `<span class="tag">${t}</span>`).join('');
      }
      if (solveBtn && questionLink) {
        solveBtn.href = questionLink;
      }
    }
  } catch (err) {
    console.warn('[Dashboard] Daily challenge load skipped:', err.message);
  }
}

/**
 * Load and render live job opportunities from Arbeitnow & Remotive
 */
async function loadCareerOpportunities() {
  const container = document.getElementById('dashboardJobsList');
  if (!container) return;

  try {
    const res = await getJobs({ limit: 4 });
    const jobs = (res && res.jobs) || [];

    if (jobs.length === 0) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);">No job listings currently available.</div>';
      return;
    }

    container.innerHTML = jobs.map(job => `
      <a href="${job.url}" target="_blank" rel="noopener" class="job-card-item">
        <div class="job-info">
          <div class="job-title">${escapeHtml(job.title)}</div>
          <div class="job-meta">
            <span>${escapeHtml(job.company)}</span>
            <span>&bull;</span>
            <span>${escapeHtml(job.location)}</span>
            ${job.remote ? '<span class="job-badge-remote">Remote</span>' : ''}
          </div>
        </div>
        <div class="job-apply-link">
          <span>Apply</span>
          <i data-lucide="arrow-up-right" style="width:14px;height:14px;"></i>
        </div>
      </a>
    `).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.warn('[Dashboard] Jobs load skipped:', err.message);
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);">Career opportunities temporarily unavailable.</div>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}