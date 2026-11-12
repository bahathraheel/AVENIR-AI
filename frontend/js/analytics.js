/**
 * AVENIR AI - Performance Analytics Module
 * Renders verified Firestore interview analytics, responsive Chart.js visual trends,
 * time-range filters, and targeted category insights.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Authentication Guard
  if (typeof checkAuthState === 'function') await checkAuthState();
  if (typeof waitForAuthInit === 'function') {
    const user = await waitForAuthInit();
    if (!user) return;
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  initPerformanceAnalytics();
});

function initPerformanceAnalytics() {
  const filterBtns = document.querySelectorAll('.filter-btn, [data-period]');
  const emptyStateEl = document.getElementById('analyticsEmptyState');
  const chartsSection = document.querySelector('.analytics-charts');
  const detailsSection = document.querySelector('.analytics-details');
  const insightsSection = document.getElementById('analyticsInsightsSection');

  let currentPeriod = 'all';
  let chartInstances = {
    trend: null,
    category: null,
    difficulty: null,
    progress: null,
  };

  // Safe Chart instance destructor
  function destroyChart(key) {
    if (chartInstances[key]) {
      try {
        chartInstances[key].destroy();
      } catch (e) {
        console.warn(`[Analytics] Error destroying chart ${key}:`, e);
      }
      chartInstances[key] = null;
    }
  }

  // Setup filter button listeners
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const rawPeriod = btn.dataset.period || btn.dataset.filter || btn.textContent.trim().toLowerCase();
      currentPeriod = rawPeriod === 'all time' || rawPeriod === 'alltime' ? 'all' : rawPeriod;

      await loadAnalytics(currentPeriod);
    });
  });

  // Initial load with default 'all'
  loadAnalytics(currentPeriod);

  /**
   * Main Loader: Queries backend analytics API and coordinates UI updates
   */
  async function loadAnalytics(period) {
    try {
      showLoading(true);

      const data = await getPerformanceData(period);
      if (!data) throw new Error('No analytics data received from server.');

      renderStatCards(data);
      renderInsights(data);
      renderAllCharts(data);
      renderCategoryTable(data);
      renderImprovementAreas(data);

      const hasHistory = data.totalInterviews > 0 || (data.timeline && data.timeline.length > 0);
      if (emptyStateEl) {
        if (!hasHistory && period === 'all') {
          emptyStateEl.classList.remove('hidden');
          if (chartsSection) chartsSection.style.display = 'none';
          if (detailsSection) detailsSection.style.display = 'none';
          if (insightsSection) insightsSection.style.display = 'none';
        } else {
          emptyStateEl.classList.add('hidden');
          if (chartsSection) chartsSection.style.display = '';
          if (detailsSection) detailsSection.style.display = '';
          if (insightsSection) insightsSection.style.display = '';
        }
      }

      if (window.lucide) {
        window.lucide.createIcons();
      }
    } catch (err) {
      console.error('[Analytics] Failed to load performance data:', err);
      if (typeof showToast === 'function') {
        showToast('Unable to synchronize analytics data. Please retry.', 'error');
      }
    } finally {
      showLoading(false);
    }
  }

  /**
   * 1. Render the Four Core Summary Metric Cards
   */
  function renderStatCards(data) {
    const stats = data.stats || {};

    // Total Practice Time
    setText('statPracticeTime', stats.practiceTimeFormatted || '0 mins');
    setText('statPracticeTimeSub', stats.practiceTimeSubtext || 'Total practice duration');

    // Average Technical Score
    setText('statTechScore', stats.avgScoreText || (data.avgScore != null ? `${Math.round(data.avgScore)}%` : '0%'));
    setText('statTechScoreSub', stats.avgScoreSubtext || 'Valid completed evaluations');

    // Completion Rate
    setText('statCompletionRate', stats.completionRateText || (data.completionRate != null ? `${Math.round(data.completionRate)}%` : '0%'));
    setText('statCompletionRateSub', stats.completionRateSubtext || 'Completed / Started sessions');

    // Total Mock Sessions
    setText('statTotalSessions', stats.totalSessionsText || String(data.totalStarted ?? data.totalInterviews ?? 0));
    setText('statTotalSessionsSub', stats.totalSessionsSubtext || `${data.completedCount || 0} completed`);
  }

  /**
   * 2. Render Additional Analytics Insights (Requirement 6)
   */
  function renderInsights(data) {
    const insights = data.insights || {};
    setText('insightStrongest', insights.strongestCategory || 'None recorded yet');
    setText('insightWeakest', insights.weakestCategory || 'None recorded yet');
    setText('insightImprovement', insights.recentImprovement || '0%');
  }

  /**
   * 3. Render Responsive Charts using Chart.js with Theme Colors & Fallbacks
   */
  function renderAllCharts(data) {
    renderScoreTrendChart(data);
    renderCategoryPerformanceChart(data);
    renderDifficultyChart(data);
    renderPracticeVolumeChart(data);
  }

  /**
   * Chart 1: Score Progression Trend Line Chart
   */
  function renderScoreTrendChart(data) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    destroyChart('trend');

    const timeline = data.timeline || data.scoreTrend || [];
    const ctx = canvas.getContext('2d');

    if (timeline.length === 0) {
      renderEmptyCanvas(canvas, 'No completed interview scores in this period');
      return;
    }

    // Sort chronologically
    const sorted = [...timeline].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map((t, idx) => t.formattedDate || `#${idx + 1}`);
    const scores = sorted.map((t) => Math.round(t.score));

    // Linear gradient for fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(255, 88, 65, 0.25)');
    gradient.addColorStop(1, 'rgba(197, 54, 120, 0.02)');

    if (typeof Chart !== 'undefined') {
      chartInstances.trend = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Overall Score',
              data: scores,
              borderColor: '#FF5841',
              borderWidth: 2.5,
              backgroundColor: gradient,
              fill: true,
              tension: 0.35,
              pointBackgroundColor: '#FFFFFF',
              pointBorderColor: '#FF5841',
              pointBorderWidth: 2,
              pointRadius: 5,
              pointHoverRadius: 8,
              pointHoverBackgroundColor: '#C53678',
              pointHoverBorderColor: '#FFFFFF',
              pointHoverBorderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#252525',
              titleFont: { size: 12, weight: '700' },
              bodyFont: { size: 13, weight: '600' },
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                label: (context) => {
                  const idx = context.dataIndex;
                  const item = sorted[idx];
                  const role = item?.jobRole ? ` • ${item.jobRole}` : '';
                  const cat = item?.category ? ` [${item.category}]` : '';
                  return `Score: ${context.parsed.y}%${cat}${role}`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 }, color: '#74717A' },
            },
            y: {
              min: 0,
              max: 100,
              ticks: {
                stepSize: 20,
                font: { size: 11 },
                color: '#74717A',
                callback: (val) => `${val}%`,
              },
              grid: { color: '#F0E2E8' },
            },
          },
        },
      });
    } else {
      // Fallback simple canvas renderer
      drawCanvasLineFallback(canvas, labels, scores, '#FF5841');
    }
  }

  /**
   * Chart 2: Performance by Category (5 Canonical Categories)
   */
  function renderCategoryPerformanceChart(data) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    destroyChart('category');

    const canonical = [
      'HR Interview',
      'Technical Interview',
      'Coding Interview',
      'Behavioral Interview',
      'Domain-Specific Interview',
    ];

    const categoryMap = data.categories || {};
    const labels = canonical.map((c) => c.replace(' Interview', ''));
    const scores = canonical.map((cat) => {
      const entry = categoryMap[cat];
      return entry ? entry.avgScore || 0 : data.categoryPerformance?.[cat] || 0;
    });

    const hasData = scores.some((s) => s > 0);
    if (!hasData) {
      renderEmptyCanvas(canvas, 'No category data recorded in this period');
      return;
    }

    const barColors = [
      '#FF5841', // Sunset Orange (HR)
      '#C53678', // Red-Violet (Technical)
      '#FF7900', // Amber-Orange (Coding)
      '#E11D48', // Rose (Behavioral)
      '#FF5841', // Violet (Domain)
    ];

    if (typeof Chart !== 'undefined') {
      chartInstances.category = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Average Score',
              data: scores,
              backgroundColor: barColors,
              borderRadius: 6,
              maxBarThickness: 42,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#252525',
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: (context) => {
                  const catFullName = canonical[context.dataIndex];
                  const attempts = categoryMap[catFullName]?.attempts || 0;
                  return `Avg: ${context.parsed.y}% (${attempts} completed session${attempts !== 1 ? 's' : ''})`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10.5, weight: '600' }, color: '#252525' },
            },
            y: {
              min: 0,
              max: 100,
              ticks: {
                stepSize: 20,
                color: '#74717A',
                callback: (val) => `${val}%`,
              },
              grid: { color: '#F0E2E8' },
            },
          },
        },
      });
    } else {
      drawCanvasBarFallback(canvas, labels, scores, barColors);
    }
  }

  /**
   * Chart 3: Scores by Difficulty Level (Easy, Medium, Hard)
   */
  function renderDifficultyChart(data) {
    const canvas = document.getElementById('difficultyChart');
    if (!canvas) return;
    destroyChart('difficulty');

    const diff = data.difficultyBreakdown || {};
    const labels = ['Easy', 'Medium', 'Hard'];
    const scores = [
      diff.easy?.avgScore || 0,
      diff.medium?.avgScore || 0,
      diff.hard?.avgScore || 0,
    ];

    const hasData = scores.some((s) => s > 0);
    if (!hasData) {
      renderEmptyCanvas(canvas, 'No difficulty ratings available in this period');
      return;
    }

    const colors = ['#10B981', '#F59E0B', '#EF4444'];

    if (typeof Chart !== 'undefined') {
      chartInstances.difficulty = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Average Score',
              data: scores,
              backgroundColor: colors,
              borderRadius: 6,
              maxBarThickness: 45,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#252525',
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: (context) => {
                  const key = labels[context.dataIndex].toLowerCase();
                  const count = diff[key]?.attempts || 0;
                  return `Avg: ${context.parsed.y}% (${count} session${count !== 1 ? 's' : ''})`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11, weight: '700' }, color: '#252525' },
            },
            y: {
              min: 0,
              max: 100,
              ticks: {
                stepSize: 20,
                color: '#74717A',
                callback: (val) => `${val}%`,
              },
              grid: { color: '#F0E2E8' },
            },
          },
        },
      });
    }
  }

  /**
   * Chart 4: Practice Volume Over Time
   */
  function renderPracticeVolumeChart(data) {
    const canvas = document.getElementById('progressChart');
    if (!canvas) return;
    destroyChart('progress');

    const timeline = data.timeline || [];
    if (timeline.length === 0) {
      renderEmptyCanvas(canvas, 'No mock session volume recorded in this period');
      return;
    }

    const labels = timeline.map((t, idx) => t.formattedDate || `#${idx + 1}`);
    const questionsCounts = timeline.map((t) => t.questionsCount || 5);

    if (typeof Chart !== 'undefined') {
      chartInstances.progress = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Questions Answered',
              data: questionsCounts,
              backgroundColor: 'rgba(255, 88, 65, 0.85)',
              hoverBackgroundColor: '#C53678',
              borderRadius: 5,
              maxBarThickness: 36,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#252525',
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: (context) => `${context.parsed.y} Questions Completed`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 }, color: '#74717A' },
            },
            y: {
              beginAtZero: true,
              ticks: { precision: 0, color: '#74717A' },
              grid: { color: '#F0E2E8' },
            },
          },
        },
      });
    }
  }

  /**
   * 4. Render Category Breakdown Table
   */
  function renderCategoryTable(data) {
    const tbody = document.getElementById('categoryTableBody');
    if (!tbody) return;

    const canonical = [
      'Technical Interview',
      'Coding Interview',
      'HR Interview',
      'Behavioral Interview',
      'Domain-Specific Interview',
    ];

    const categoryMap = data.categories || {};
    tbody.innerHTML = '';

    canonical.forEach((cat) => {
      const entry = categoryMap[cat] || { attempts: 0, avgScore: 0, highestScore: 0, trend: '0%' };
      const score = entry.avgScore || 0;
      const scoreClass = score >= 75 ? 'good' : score >= 50 ? 'warning' : 'danger';
      const trendPositive = entry.trend && entry.trend.startsWith('+');
      const trendZero = !entry.trend || entry.trend === '0%';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(cat)}</strong></td>
        <td><span class="badge ${entry.attempts > 0 ? 'badge-primary' : 'badge-neutral'}">${entry.attempts} session${entry.attempts !== 1 ? 's' : ''}</span></td>
        <td>
          <span class="score-pill ${entry.attempts > 0 ? scoreClass : ''}">
            ${entry.attempts > 0 ? `${score}%` : '--'}
          </span>
        </td>
        <td>${entry.attempts > 0 ? `${entry.highestScore}%` : '--'}</td>
        <td>
          <span class="trend-indicator ${trendPositive ? 'text-success' : trendZero ? 'text-muted' : 'text-danger'}" style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
            <i data-lucide="${trendPositive ? 'trending-up' : trendZero ? 'minus' : 'trending-down'}" style="width: 14px; height: 14px;"></i>
            <span>${entry.attempts >= 2 ? entry.trend : entry.attempts === 1 ? 'Baseline' : '--'}</span>
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * 5. Render Targeted Improvement Areas (Requirement 6)
   */
  function renderImprovementAreas(data) {
    const list = document.getElementById('improvementAreasList');
    if (!list) return;

    const items = data.insights?.targetedImprovements || [];
    list.innerHTML = '';

    if (items.length === 0) {
      list.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--color-text-muted);">
          <i data-lucide="check-circle" style="width: 32px; height: 32px; color: #10B981; margin-bottom: 8px;"></i>
          <p style="margin: 0; font-size: 14px;">No critical weaknesses identified for this time period!</p>
        </div>
      `;
      return;
    }

    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'improvement-item';
      div.innerHTML = `
        <div class="improvement-icon-box warning" style="background: #FFFBEB; color: #F59E0B; width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i data-lucide="alert-circle" style="width: 20px; height: 20px;"></i>
        </div>
        <div class="improvement-info" style="flex: 1;">
          <h4 class="improvement-title" style="margin: 0 0 3px 0; font-size: 14px; font-weight: 700; color: var(--color-text);">${escapeHtml(item.title)}</h4>
          <p class="improvement-desc" style="margin: 0; font-size: 12.5px; color: var(--color-text-muted); line-height: 1.45;">${escapeHtml(item.desc)}</p>
        </div>
        <a href="learning.html" class="btn btn-outline btn-xs" style="flex-shrink: 0;">Study Topic</a>
      `;
      list.appendChild(div);
    });
  }

  /**
   * Renders a clean visual empty state inside a canvas when zero data exists
   */
  function renderEmptyCanvas(canvas, message) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 500) * dpr;
    canvas.height = (rect.height || 260) * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width || 500;
    const H = rect.height || 260;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FAF9FB';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#74717A';
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, W / 2, H / 2);
  }

  // --- Fallback Canvas Drawers (in case Chart.js is offline) ---
  function drawCanvasLineFallback(canvas, labels, scores, color) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    // Draw baseline
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    scores.forEach((s, i) => {
      const x = 50 + i * ((W - 70) / Math.max(scores.length - 1, 1));
      const y = H - 40 - (s / 100) * (H - 70);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawCanvasBarFallback(canvas, labels, scores, colors) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const barW = (W - 80) / scores.length;
    scores.forEach((s, i) => {
      const x = 50 + i * barW;
      const barH = (s / 100) * (H - 60);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x + 6, H - 30 - barH, barW - 12, barH);
    });
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
  }
}
