/**
 * AVENIR AI - Interview Results & Performance Report Module
 * Fetches comprehensive evaluation report, renders score breakdown, question accordions,
 * and generates branded printable PDF reports.
 */

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  initResultsPage();
});

async function initResultsPage() {
  if (typeof waitForAuthInit === 'function') {
    await waitForAuthInit();
  }

  // 1. Extract interviewId from URL params or sessionStorage fallback
  const urlParams = new URLSearchParams(window.location.search);
  let interviewId = urlParams.get('id');

  if (!interviewId) {
    interviewId = sessionStorage.getItem('avenir_last_completed_id');
  }

  if (!interviewId) {
    console.warn('No interview ID specified. Redirecting to dashboard.');
    window.location.replace('dashboard.html');
    return;
  }

  try {
    const interviewData = await getInterview(interviewId);
    if (!interviewData) {
      throw new Error('Interview report record not found.');
    }

    renderResults(interviewData);
    setupActionButtons(interviewData);

  } catch (error) {
    console.error('Failed to load interview results:', error);
    if (typeof showToast === 'function') {
      showToast('Error loading report: ' + error.message, 'error');
    }
  }
}

/**
 * Populate all report components
 */
function renderResults(data) {
  const report = data.report || {};
  const overallScore = report.overallScore ?? 75;

  // Header & Badges
  const sessionTitleEl = document.getElementById('sessionTitle');
  if (sessionTitleEl) {
    sessionTitleEl.textContent = `${data.jobRole || 'Software Engineering'} Mock Interview Report`;
  }

  const roleBadge = document.getElementById('resultsRoleBadge');
  if (roleBadge) roleBadge.innerHTML = `<i data-lucide="code-2"></i> <span>${data.jobRole || 'Software Developer'}</span>`;

  const catBadge = document.getElementById('resultsCategoryBadge');
  if (catBadge) catBadge.innerHTML = `<i data-lucide="layers"></i> <span>${data.interviewType || 'Technical Interview'}</span>`;

  const diffBadge = document.getElementById('resultsDifficultyBadge');
  if (diffBadge) diffBadge.innerHTML = `<i data-lucide="bar-chart-2"></i> <span style="text-transform: capitalize;">${data.difficulty || 'Medium'}</span>`;

  const dateBadge = document.getElementById('resultsDateBadge');
  if (dateBadge && data.completedAt) {
    try {
      const d = new Date(data.completedAt);
      dateBadge.innerHTML = `<i data-lucide="calendar"></i> <span>${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
    } catch (e) {
      dateBadge.innerHTML = `<i data-lucide="calendar"></i> <span>Today</span>`;
    }
  }

  // Session Summary Text
  const summaryEl = document.getElementById('sessionSummaryText');
  if (summaryEl) {
    summaryEl.textContent = report.executiveSummary || report.overallFeedback || 
      'You demonstrated solid technical competency and structured communication across core topics. Review the detailed feedback below for actionable steps to increase your hireability.';
  }

  // 1. Overall Score & Grade Badge
  renderOverallScore(overallScore);

  // 2. Category Scores Grid
  renderCategoryScores(report.categoryScores || {});

  // 3. Strengths, Weaknesses & Missed Concepts
  renderFeedbackDetails(report);

  // 4. Questions & Answers Review Accordion
  renderQuestionAccordion(data);

  // 5. Recommended Improvement Plan
  renderImprovementPlan(report.improvementPlan || report.recommendedPlan || []);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Render Large Score Circle and Readiness Badge
 */
function renderOverallScore(score) {
  const scoreValEl = document.getElementById('overallScoreVal');
  const scoreCircle = document.getElementById('overallScoreCircle');
  const gradeBadge = document.getElementById('scoreGradeBadge');

  if (scoreValEl) scoreValEl.textContent = score;

  let gradeText = 'Proficient';
  let color = '#FF5841';
  let gradeClass = 'grade-proficient';

  if (score >= 85) {
    gradeText = 'Interview Ready';
    color = '#10B981';
    gradeClass = 'grade-excellent';
  } else if (score >= 70) {
    gradeText = 'Solid Performer';
    color = '#FF5841';
    gradeClass = 'grade-good';
  } else {
    gradeText = 'Needs Practice';
    color = '#EF4444';
    gradeClass = 'grade-needs-work';
  }

  if (scoreCircle) {
    scoreCircle.style.borderColor = color;
    scoreCircle.style.color = color;
  }

  if (gradeBadge) {
    gradeBadge.className = `score-grade-badge ${gradeClass}`;
    gradeBadge.textContent = gradeText;
    gradeBadge.style.color = color;
  }
}

/**
 * Render Performance Breakdown Cards
 */
function renderCategoryScores(catScores) {
  const grid = document.getElementById('categoryBreakdownGrid');
  if (!grid) return;

  const categories = [
    { key: 'technicalCorrectness', label: 'Technical Accuracy', desc: 'Accuracy of logic, core syntax, and algorithmic principles.' },
    { key: 'clarity', label: 'Communication & Clarity', desc: 'Structure of thought, verbal flow, and terminology precision.' },
    { key: 'problemSolving', label: 'Problem-Solving & Edge Cases', desc: 'Trade-off analysis, efficiency, and architectural reasoning.' },
    { key: 'completeness', label: 'Completeness & Depth', desc: 'Thoroughness of answer without missing key dependencies.' }
  ];

  grid.innerHTML = '';

  categories.forEach((cat) => {
    const val = typeof catScores[cat.key] === 'number' 
      ? catScores[cat.key] 
      : (catScores[cat.label] || 80);

    const card = document.createElement('div');
    card.className = 'score-breakdown-card';
    card.innerHTML = `
      <div class="card-top" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span class="breakdown-category" style="font-weight: 600; color: #252525;">${cat.label}</span>
        <span class="breakdown-score" style="font-weight: 700; color: ${val >= 80 ? '#10B981' : val >= 65 ? '#FF5841' : '#EF4444'};">${val}%</span>
      </div>
      <div class="progress-track" style="height: 6px; background: #E5E7EB; border-radius: 9999px; overflow: hidden; margin-bottom: 8px;">
        <div class="progress-fill" style="width: ${val}%; height: 100%; background: ${val >= 80 ? '#10B981' : val >= 65 ? '#FF5841' : '#EF4444'}; border-radius: 9999px;"></div>
      </div>
      <p class="breakdown-note" style="margin: 0; font-size: 12px; color: #6B7280;">${cat.desc}</p>
    `;
    grid.appendChild(card);
  });
}

/**
 * Populate Strengths, Weaknesses, and Missed Concepts
 */
function renderFeedbackDetails(report) {
  const strengthsList = document.getElementById('strengthsList');
  if (strengthsList) {
    strengthsList.innerHTML = '';
    const items = report.strengths || [
      'Accurately explained core computer science principles.',
      'Communicated clearly with structured thoughts.',
      'Demonstrated understanding of performance trade-offs.'
    ];
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      strengthsList.appendChild(li);
    });
  }

  const weaknessesList = document.getElementById('weaknessesList');
  if (weaknessesList) {
    weaknessesList.innerHTML = '';
    const items = report.weaknesses || report.areasForImprovement || [
      'Provide more concrete production metrics and code examples.',
      'Discuss edge-case resilience and failover strategies in distributed architecture.'
    ];
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      weaknessesList.appendChild(li);
    });
  }

  const missedList = document.getElementById('missedConceptsList');
  if (missedList) {
    missedList.innerHTML = '';
    const items = report.missedConcepts || ['Concurrency Control', 'Idempotency', 'Caching Strategies', 'Zero-Downtime Deployments'];
    items.forEach((c) => {
      const tag = document.createElement('span');
      tag.className = 'missed-tag';
      tag.textContent = c;
      missedList.appendChild(tag);
    });
  }
}

/**
 * Render Question Review Accordion
 */
function renderQuestionAccordion(data) {
  const container = document.getElementById('questionsAccordion');
  if (!container) return;

  const questions = data.questions || [];
  const answers = data.answers || {};
  const evaluations = data.evaluations || {};

  container.innerHTML = '';

  questions.forEach((qObj, idx) => {
    const qIdxStr = String(idx);
    const qText = typeof qObj === 'string' ? qObj : (qObj.question || `Question ${idx + 1}`);
    const answerText = answers[qIdxStr] || answers[qObj.id] || 'No answer submitted.';
    const evalData = evaluations[qIdxStr] || evaluations[qObj.id] || {};

    const score = evalData.overallScore ?? evalData.score ?? 0;
    const feedbackText = evalData.feedback || evalData.overallFeedback || 'Evaluated based on standard criteria.';
    const idealAnswer = evalData.idealAnswer || evalData.modelAnswer || qObj.idealAnswer || 
      'An effective response starts by clearly defining the core concept, follows up with practical production trade-offs, and finishes with a real-world scenario illustrating optimal resolution.';

    const item = document.createElement('div');
    item.className = `accordion-item ${idx === 0 ? 'open' : ''}`;

    item.innerHTML = `
      <button type="button" class="accordion-header" aria-expanded="${idx === 0 ? 'true' : 'false'}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; cursor: pointer; text-align: left; gap: 12px; margin-bottom: 8px;">
        <span class="q-badge" style="background: rgba(255, 88, 65, 0.08); color: #FF5841; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px; flex-shrink: 0;">Q${idx + 1}</span>
        <span class="q-title" style="flex-grow: 1; font-weight: 600; color: #252525; font-size: 14px;">${qText}</span>
        <span class="q-score badge" style="background: ${score >= 80 ? '#ECFDF5' : score >= 60 ? 'rgba(255, 88, 65, 0.06)' : '#FEF2F2'}; color: ${score >= 80 ? '#059669' : score >= 60 ? '#FF5841' : '#DC2626'}; font-weight: 700; font-size: 13px; padding: 4px 8px; border-radius: 6px; flex-shrink: 0;">${score}/100</span>
        <i data-lucide="chevron-down" class="accordion-arrow" style="color: #9CA3AF; transition: transform 0.2s; flex-shrink: 0;"></i>
      </button>
      <div class="accordion-content" style="padding: 16px 20px; background: #F9FAFB; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px; margin-top: -8px; margin-bottom: 12px; display: ${idx === 0 ? 'block' : 'none'};">
        <div class="qa-block" style="margin-bottom: 14px;">
          <h4 class="qa-title" style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280;">Your Answer:</h4>
          <p class="qa-text" style="margin: 0; font-size: 14px; line-height: 1.6; color: #252525; white-space: pre-wrap;">${answerText}</p>
        </div>
        <div class="qa-block qa-feedback" style="margin-bottom: 14px; padding: 12px 14px; background: #FFFFFF; border-left: 3px solid #FF5841; border-radius: 4px;">
          <h4 class="qa-title" style="margin: 0 0 4px 0; font-size: 13px; color: #FF5841; font-weight: 600;">Interviewer Feedback:</h4>
          <p class="qa-text" style="margin: 0; font-size: 14px; color: #374151; line-height: 1.5;">${feedbackText}</p>
        </div>
        <div class="qa-block qa-ideal" style="padding: 12px 14px; background: #ECFDF5; border-left: 3px solid #10B981; border-radius: 4px;">
          <h4 class="qa-title" style="margin: 0 0 4px 0; font-size: 13px; color: #065F46; font-weight: 600;">Ideal Model Response:</h4>
          <p class="qa-text" style="margin: 0; font-size: 14px; color: #047857; line-height: 1.5;">${idealAnswer}</p>
        </div>
      </div>
    `;

    const headerBtn = item.querySelector('.accordion-header');
    const contentBox = item.querySelector('.accordion-content');
    const arrow = item.querySelector('.accordion-arrow');

    headerBtn.addEventListener('click', () => {
      const isOpen = contentBox.style.display !== 'none';
      if (isOpen) {
        contentBox.style.display = 'none';
        headerBtn.setAttribute('aria-expanded', 'false');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      } else {
        contentBox.style.display = 'block';
        headerBtn.setAttribute('aria-expanded', 'true');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    });

    container.appendChild(item);
  });
}

/**
 * Render Improvement Plan
 */
function renderImprovementPlan(plan) {
  const container = document.getElementById('improvementPlanContent');
  if (!container) return;

  const topics = Array.isArray(plan) && plan.length > 0 ? plan : [
    { title: 'System Design: Distributed Cache Strategies', desc: 'Study Cache-aside, Write-through, and cache stampede mitigations.' },
    { title: 'Database Optimization & Indexing', desc: 'Master composite B-Tree indexes, query execution plans, and normalization tradeoffs.' },
    { title: 'Concurrency & Race Condition Handling', desc: 'Review mutexes, optimistic locking, and event loop microtask sequencing.' }
  ];

  container.innerHTML = '';

  topics.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'plan-topic-item';
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      margin-bottom: 10px;
    `;

    const topicTitle = t.title || t.name || t.topic || `Focus Area ${i + 1}`;
    const topicDesc = t.desc || t.description || 'Deep dive into recommended best practices to improve interview performance.';

    item.innerHTML = `
      <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255, 88, 65, 0.08); color: #FF5841; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;">${i + 1}</div>
      <div style="flex-grow: 1;">
        <h4 style="margin: 0 0 2px 0; font-size: 14px; font-weight: 600; color: #252525;">${topicTitle}</h4>
        <p style="margin: 0; font-size: 13px; color: #6B7280;">${topicDesc}</p>
      </div>
      <a href="learning.html" class="btn btn-outline btn-sm" style="flex-shrink: 0; text-decoration: none;">Study Topic</a>
    `;

    container.appendChild(item);
  });
}

/**
 * Setup Button Interactions
 */
function setupActionButtons(interviewData) {
  // Retake Interview: prepopulate config in sessionStorage
  const retakeBtn = document.getElementById('retakeBtn');
  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      const config = {
        jobRole: interviewData.jobRole,
        interviewType: interviewData.interviewType,
        difficulty: interviewData.difficulty,
        experienceLevel: interviewData.experienceLevel || 'Intermediate',
        questionCount: interviewData.questionCount || 5
      };
      sessionStorage.setItem('avenir_retake_config', JSON.stringify(config));
      window.location.href = 'interview-setup.html';
    });
  }

  // Download PDF Report
  const downloadBtn = document.getElementById('downloadPdfBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      generateBrandedPdfReport(interviewData);
    });
  }
}

/**
 * Generate Printable Branded PDF Report
 */
function generateBrandedPdfReport(data) {
  const report = data.report || {};
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('Please allow popups to view and download your interview PDF report.');
    return;
  }

  const score = report.overallScore ?? 75;
  const questions = data.questions || [];
  const answers = data.answers || {};
  const evaluations = data.evaluations || {};

  let questionsHtml = '';
  questions.forEach((q, idx) => {
    const qText = typeof q === 'string' ? q : (q.question || `Question ${idx + 1}`);
    const ansText = answers[String(idx)] || answers[q.id] || 'No answer submitted.';
    const ev = evaluations[String(idx)] || evaluations[q.id] || {};
    const qScore = ev.overallScore ?? ev.score ?? 0;

    questionsHtml += `
      <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #E5E7EB; page-break-inside: avoid;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <strong style="color: #FF5841; font-size: 14px;">Question ${idx + 1}</strong>
          <span style="font-weight: bold; color: ${qScore >= 80 ? '#10B981' : '#FF5841'};">${qScore}/100</span>
        </div>
        <p style="font-size: 15px; font-weight: 600; color: #252525; margin: 0 0 10px 0;">${qText}</p>
        <div style="background: #F9FAFB; padding: 10px 14px; border-radius: 6px; margin-bottom: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold;">Candidate Response</div>
          <div style="font-size: 13px; color: #252525; white-space: pre-wrap; margin-top: 4px;">${ansText}</div>
        </div>
        <div style="background: rgba(255, 88, 65, 0.06); padding: 10px 14px; border-radius: 6px; border-left: 3px solid #FF5841;">
          <div style="font-size: 11px; text-transform: uppercase; color: #C53678; font-weight: bold;">Evaluator Feedback</div>
          <div style="font-size: 13px; color: #374151; margin-top: 4px;">${ev.feedback || ev.overallFeedback || 'Standard review applied.'}</div>
        </div>
      </div>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>AVENIR AI Interview Report - ${data.jobRole || 'Interview'}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #252525; margin: 0; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #FF5841; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; }
        .logo span { color: #FF5841; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #F3F4F6; margin-right: 6px; }
        .score-box { text-align: right; }
        .score-num { font-size: 40px; font-weight: 800; color: #FF5841; line-height: 1; }
        .section-title { font-size: 18px; font-weight: 700; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; margin: 28px 0 16px 0; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="logo">AVENIR<span>AI</span></div>
          <h1 style="margin: 6px 0 4px 0; font-size: 20px;">Candidate Evaluation Report</h1>
          <div style="margin-top: 8px;">
            <span class="badge">${data.jobRole || 'Software Developer'}</span>
            <span class="badge">${data.interviewType || 'Technical'}</span>
            <span class="badge" style="text-transform: capitalize;">${data.difficulty || 'Medium'}</span>
          </div>
        </div>
        <div class="score-box">
          <div class="score-num">${score}%</div>
          <div style="font-size: 12px; color: #6B7280; font-weight: bold; text-transform: uppercase;">Overall Score</div>
        </div>
      </div>

      <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 6px 0; font-size: 14px; text-transform: uppercase; color: #6B7280;">Executive Summary</h3>
        <p style="margin: 0; font-size: 14px; line-height: 1.5;">${report.executiveSummary || report.overallFeedback || 'Completed mock interview evaluation session.'}</p>
      </div>

      <div class="section-title">Question by Question Breakdown</div>
      ${questionsHtml}

      <div class="no-print" style="margin-top: 30px; text-align: center;">
        <button onclick="window.print()" style="background: linear-gradient(110deg, #FF5841 0%, #C53678 100%); color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 15px;">Print / Save as PDF</button>
      </div>

      <script>
        window.addEventListener('load', () => {
          setTimeout(() => {
            window.print();
          }, 400);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
