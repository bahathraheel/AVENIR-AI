/**
 * AVENIR AI - Interview Results & Performance Report Module
 * Fetches comprehensive evaluation report, renders score breakdown, question accordions,
 * and generates branded printable PDF reports according to AVENIR AI guidelines.
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
  const isInsufficientData = Boolean(
    data.isInsufficientData ||
    report.isInsufficientData ||
    (data.answeredCount === 0 && (data.skippedCount > 0 || (data.questions && data.questions.length > 0)))
  );

  const overallScore = isInsufficientData
    ? 0
    : (typeof report.overallScore === 'number'
        ? report.overallScore
        : (typeof data.overallScore === 'number' ? data.overallScore : 0));

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
    summaryEl.textContent = isInsufficientData
      ? 'Interview session incomplete. All questions were skipped without evaluable answers. Complete a full interview session to receive a valid score and competency profile.'
      : (report.executiveSummary || report.overallFeedback || 'Assessment completed based on individual answer analysis.');
  }

  // 1. Overall Score & Grade Badge
  renderOverallScore(overallScore, isInsufficientData);

  // 2. Category Scores Grid (Weighted: 30%, 25%, 20%, 15%, 10%)
  renderCategoryScores(report.categoryScores || data.categoryScores || {}, isInsufficientData);

  // 3. Strengths, Weaknesses & Missed Concepts
  renderFeedbackDetails(report, isInsufficientData);

  // 4. Questions & Answers Review Accordion
  renderQuestionAccordion(data);

  // 5. Recommended Improvement Plan
  renderImprovementPlan(report.improvementPlan || report.recommendations || report.recommendedPlan || []);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Render Large Score Circle and Readiness Badge
 */
function renderOverallScore(score, isInsufficientData) {
  const scoreValEl = document.getElementById('overallScoreVal');
  const scoreCircle = document.getElementById('overallScoreCircle');
  const gradeBadge = document.getElementById('scoreGradeBadge');

  if (scoreValEl) scoreValEl.textContent = score;

  let gradeText = 'Proficient';
  let color = '#FF5841';
  let gradeClass = 'grade-proficient';

  if (isInsufficientData || score === 0) {
    gradeText = 'INSUFFICIENT DATA';
    color = '#EF4444';
    gradeClass = 'grade-needs-work';
  } else if (score >= 85) {
    gradeText = 'Interview Ready';
    color = '#10B981';
    gradeClass = 'grade-excellent';
  } else if (score >= 70) {
    gradeText = 'Solid Performer';
    color = '#FF5841';
    gradeClass = 'grade-good';
  } else if (score >= 50) {
    gradeText = 'Needs Practice';
    color = '#F59E0B';
    gradeClass = 'grade-needs-work';
  } else {
    gradeText = 'Significant Improvement Required';
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
 * Render Performance Breakdown Cards across 5 Weighted Categories
 */
function renderCategoryScores(catScores, isInsufficientData) {
  const grid = document.getElementById('categoryBreakdownGrid');
  if (!grid) return;

  const categories = [
    {
      key: 'technicalAccuracy',
      fallbackKey: 'technicalCorrectness',
      label: 'Technical Accuracy',
      weight: '30%',
      desc: 'Correctness of core syntax, algorithms, logic, and technical precision.'
    },
    {
      key: 'problemSolving',
      fallbackKey: 'reasoning',
      label: 'Problem Solving & Logic',
      weight: '25%',
      desc: 'Structured reasoning, edge cases, trade-offs, and analytical depth.'
    },
    {
      key: 'communication',
      fallbackKey: 'communicationClarity',
      label: 'Communication & Clarity',
      weight: '20%',
      desc: 'Structured explanations, clear progression of thought, and precise terminology.'
    },
    {
      key: 'completeness',
      fallbackKey: 'completeness',
      label: 'Completeness & Depth',
      weight: '15%',
      desc: 'Thorough answers addressing all sub-points and key dependencies.'
    },
    {
      key: 'practicalKnowledge',
      fallbackKey: 'practicality',
      label: 'Practical Knowledge',
      weight: '10%',
      desc: 'Real-world production tooling, best practices, and maintainability.'
    }
  ];

  grid.innerHTML = '';

  categories.forEach((cat) => {
    let rawVal = catScores[cat.key];
    if (rawVal === undefined || rawVal === null) {
      rawVal = catScores[cat.fallbackKey];
    }
    const val = isInsufficientData ? 0 : Math.round(Number(rawVal ?? 0));
    const scoreColor = val >= 80 ? '#10B981' : (val >= 60 ? '#FF5841' : '#EF4444');

    const card = document.createElement('div');
    card.className = 'score-breakdown-card';
    card.innerHTML = `
      <div class="card-top" style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
        <span class="breakdown-category" style="font-weight: 600; color: #1E1033;">
          ${cat.label} <small style="font-weight: 500; color: #6B7280;">(${cat.weight})</small>
        </span>
        <span class="breakdown-score" style="font-weight: 700; color: ${scoreColor};">${val}%</span>
      </div>
      <div class="progress-track" style="height: 6px; background: #EAE0FF; border-radius: 9999px; overflow: hidden; margin-bottom: 8px;">
        <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, val))}%; height: 100%; background: linear-gradient(90deg, #FF5841 0%, #C53678 100%); border-radius: 9999px;"></div>
      </div>
      <p class="breakdown-note" style="margin: 0; font-size: 12px; color: #6B7280;">${cat.desc}</p>
    `;
    grid.appendChild(card);
  });
}

/**
 * Populate Strengths, Weaknesses, and Missed Concepts
 */
function renderFeedbackDetails(report, isInsufficientData) {
  const strengthsList = document.getElementById('strengthsList');
  if (strengthsList) {
    strengthsList.innerHTML = '';
    const rawStrengths = report.strengths || report.keyStrengths || [];
    const filteredStrengths = isInsufficientData ? [] : rawStrengths.filter((s) => {
      const lower = String(s).toLowerCase();
      return !lower.includes('skip') && !lower.includes('none demonstrated') && !lower.includes('no answer');
    });

    if (filteredStrengths.length === 0) {
      const li = document.createElement('li');
      li.style.cssText = 'color: #6B7280; font-style: italic; list-style: none;';
      li.textContent = isInsufficientData
        ? 'No demonstrated strengths recorded (all questions were skipped).'
        : 'No specific strengths demonstrated during this session.';
      strengthsList.appendChild(li);
    } else {
      filteredStrengths.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        strengthsList.appendChild(li);
      });
    }
  }

  const weaknessesList = document.getElementById('weaknessesList');
  if (weaknessesList) {
    weaknessesList.innerHTML = '';
    const items = (report.weaknesses || report.areasForImprovement || []).length > 0
      ? (report.weaknesses || report.areasForImprovement)
      : (isInsufficientData
          ? ['Candidate skipped questions without submitting answers. Complete practice interviews to build proficiency.']
          : ['Continue practicing technical depth and edge-case handling.']);

    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      weaknessesList.appendChild(li);
    });
  }

  const missedList = document.getElementById('missedConceptsList');
  if (missedList) {
    missedList.innerHTML = '';
    const items = (report.missedConcepts && report.missedConcepts.length > 0)
      ? report.missedConcepts
      : ['Edge Cases', 'Architectural Trade-offs', 'Scalability', 'Error Handling'];

    items.forEach((c) => {
      const tag = document.createElement('span');
      tag.className = 'missed-tag';
      tag.textContent = c;
      missedList.appendChild(tag);
    });
  }
}

/**
 * Render Question Review Accordion with expected concepts, missing concepts, and marks explanation
 */
function renderQuestionAccordion(data) {
  const container = document.getElementById('questionsAccordion');
  if (!container) return;

  const questions = data.questions || [];
  const answers = data.answers || {};
  const evaluations = data.questionEvaluations || data.report?.questionEvaluations || data.evaluations || {};

  container.innerHTML = '';

  questions.forEach((qObj, idx) => {
    const qIdxStr = String(idx);
    const qText = typeof qObj === 'string' ? qObj : (qObj.question || qObj.questionText || `Question ${idx + 1}`);
    const answerEntry = answers[qIdxStr] ?? answers[qObj.id] ?? '';
    const answerText = typeof answerEntry === 'object' && answerEntry !== null
      ? (answerEntry.code || JSON.stringify(answerEntry))
      : String(answerEntry || 'No answer submitted.');

    const evalData = evaluations[qIdxStr] || evaluations[qObj.id] || {};
    const isSkipped = answerText === '[Skipped]' || answerText.trim() === '' || evalData.status === 'SKIPPED';
    const score = isSkipped ? 0 : (evalData.overallScore ?? evalData.score ?? 0);

    const expectedConcepts = evalData.expectedConcepts || qObj.expectedConcepts || qObj.expectedTopics || [];
    const correctlyExplained = evalData.correctlyExplained || [];
    const missingConcepts = evalData.missingConcepts || (isSkipped ? expectedConcepts : []);
    const marksJustification = evalData.marksJustification || evalData.explanationOfMarks || evalData.feedback || (isSkipped ? 'Question was skipped by candidate. 0 marks awarded.' : 'Evaluated according to technical criteria.');
    const idealAnswer = evalData.idealAnswer || evalData.modelAnswer || qObj.idealAnswer ||
      'An effective response starts by clearly defining the core concept, follows up with practical production trade-offs, and finishes with a real-world scenario illustrating optimal resolution.';

    const techScore = evalData.categoryScores?.technicalAccuracy ?? evalData.technicalCorrectness ?? score;
    const compScore = evalData.categoryScores?.completeness ?? evalData.completeness ?? score;

    const item = document.createElement('div');
    item.className = `accordion-item ${idx === 0 ? 'open' : ''}`;

    const scoreBadgeHtml = isSkipped
      ? `<span class="q-score badge" style="background: #FEF2F2; color: #DC2626; font-weight: 700; font-size: 13px; padding: 4px 8px; border-radius: 6px; flex-shrink: 0; border: 1px solid #FECACA;">SKIPPED (0/100)</span>`
      : `<span class="q-score badge" style="background: ${score >= 80 ? '#ECFDF5' : score >= 60 ? 'rgba(255, 88, 65, 0.08)' : '#FEF2F2'}; color: ${score >= 80 ? '#059669' : score >= 60 ? '#FF5841' : '#DC2626'}; font-weight: 700; font-size: 13px; padding: 4px 8px; border-radius: 6px; flex-shrink: 0;">${score}/100</span>`;

    const expectedChips = expectedConcepts.length > 0
      ? `<div style="margin-bottom: 10px;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #6B7280; display: block; margin-bottom: 4px;">Expected Concepts:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${expectedConcepts.map((c) => `<span style="background: #F3F4F6; color: #374151; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500;">${c}</span>`).join('')}
          </div>
        </div>`
      : '';

    const correctChips = correctlyExplained.length > 0
      ? `<div style="margin-bottom: 10px;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #059669; display: block; margin-bottom: 4px;">Correctly Explained Concepts:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${correctlyExplained.map((c) => `<span style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">✓ ${c}</span>`).join('')}
          </div>
        </div>`
      : '';

    const missingChips = missingConcepts.length > 0
      ? `<div style="margin-bottom: 10px;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #DC2626; display: block; margin-bottom: 4px;">Missing Concepts / Gaps:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${missingConcepts.map((m) => `<span style="background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600;">✗ ${m}</span>`).join('')}
          </div>
        </div>`
      : '';

    item.innerHTML = `
      <button type="button" class="accordion-header" aria-expanded="${idx === 0 ? 'true' : 'false'}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: #FFFFFF; border: 1px solid #EAE0FF; border-radius: 8px; cursor: pointer; text-align: left; gap: 12px; margin-bottom: 8px;">
        <span class="q-badge" style="background: rgba(255, 88, 65, 0.08); color: #FF5841; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px; flex-shrink: 0;">Q${idx + 1}</span>
        <span class="q-title" style="flex-grow: 1; font-weight: 600; color: #1E1033; font-size: 14px;">${qText}</span>
        ${scoreBadgeHtml}
        <i data-lucide="chevron-down" class="accordion-arrow" style="color: #9CA3AF; transition: transform 0.2s; flex-shrink: 0;"></i>
      </button>
      <div class="accordion-content" style="padding: 18px 20px; background: #FAF7FF; border: 1px solid #EAE0FF; border-top: none; border-radius: 0 0 8px 8px; margin-top: -8px; margin-bottom: 12px; display: ${idx === 0 ? 'block' : 'none'};">
        
        <!-- Metrics Row -->
        <div style="display: flex; gap: 12px; margin-bottom: 14px; font-size: 12px;">
          <span style="background: #FFFFFF; border: 1px solid #EAE0FF; padding: 4px 10px; border-radius: 6px; color: #1E1033;"><strong>Technical Correctness:</strong> ${techScore}%</span>
          <span style="background: #FFFFFF; border: 1px solid #EAE0FF; padding: 4px 10px; border-radius: 6px; color: #1E1033;"><strong>Completeness:</strong> ${compScore}%</span>
        </div>

        <!-- Candidate Answer -->
        <div class="qa-block" style="margin-bottom: 14px;">
          <h4 class="qa-title" style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; font-weight: 700;">Candidate's Answer:</h4>
          <p class="qa-text" style="margin: 0; font-size: 14px; line-height: 1.6; color: #1E1033; background: #FFFFFF; padding: 12px; border-radius: 6px; border: 1px solid #EAE0FF; white-space: pre-wrap;">${answerText}</p>
        </div>

        <!-- Concept Badges -->
        ${expectedChips}
        ${correctChips}
        ${missingChips}

        <!-- Marks Explanation -->
        <div class="qa-block qa-feedback" style="margin-bottom: 14px; padding: 12px 14px; background: #FFF5F4; border-left: 3px solid #FF5841; border-radius: 4px;">
          <h4 class="qa-title" style="margin: 0 0 4px 0; font-size: 12px; color: #FF5841; font-weight: 700; text-transform: uppercase;">Marks Justification & Feedback:</h4>
          <p class="qa-text" style="margin: 0; font-size: 13px; color: #374151; line-height: 1.5;">${marksJustification}</p>
        </div>

        <!-- Ideal Model Response -->
        <div class="qa-block qa-ideal" style="padding: 12px 14px; background: #ECFDF5; border-left: 3px solid #10B981; border-radius: 4px;">
          <h4 class="qa-title" style="margin: 0 0 4px 0; font-size: 12px; color: #065F46; font-weight: 700; text-transform: uppercase;">Ideal Model Answer & Key Concepts:</h4>
          <p class="qa-text" style="margin: 0; font-size: 13px; color: #047857; line-height: 1.5;">${idealAnswer}</p>
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
      border: 1px solid #EAE0FF;
      border-radius: 8px;
      margin-bottom: 10px;
    `;

    const topicTitle = typeof t === 'string' ? t : (t.title || t.name || t.topic || `Focus Area ${i + 1}`);
    const topicDesc = typeof t === 'string' ? 'Targeted skill enhancement based on interview gaps.' : (t.desc || t.description || 'Deep dive into recommended best practices to improve interview performance.');

    item.innerHTML = `
      <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #FF5841 0%, #C53678 100%); color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 13px;">${i + 1}</div>
      <div style="flex-grow: 1;">
        <h4 style="margin: 0 0 2px 0; font-size: 14px; font-weight: 600; color: #1E1033;">${topicTitle}</h4>
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
  const isInsufficientData = Boolean(
    data.isInsufficientData ||
    report.isInsufficientData ||
    (data.answeredCount === 0 && (data.skippedCount > 0 || (data.questions && data.questions.length > 0)))
  );

  const score = isInsufficientData ? 0 : (report.overallScore ?? data.overallScore ?? 0);
  const questions = data.questions || [];
  const answers = data.answers || {};
  const evaluations = data.questionEvaluations || data.report?.questionEvaluations || data.evaluations || {};

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to view and download your interview PDF report.');
    return;
  }

  let questionsHtml = '';
  questions.forEach((q, idx) => {
    const qText = typeof q === 'string' ? q : (q.question || q.questionText || `Question ${idx + 1}`);
    const ansEntry = answers[String(idx)] ?? answers[q.id] ?? '';
    const ansText = typeof ansEntry === 'object' && ansEntry !== null ? (ansEntry.code || JSON.stringify(ansEntry)) : String(ansEntry || 'No answer submitted.');
    const ev = evaluations[String(idx)] || evaluations[q.id] || {};
    const isSkipped = ansText === '[Skipped]' || ansText.trim() === '' || ev.status === 'SKIPPED';
    const qScore = isSkipped ? 0 : (ev.overallScore ?? ev.score ?? 0);

    const correctlyExplained = ev.correctlyExplained || [];
    const missingConcepts = ev.missingConcepts || (isSkipped ? ['Question was skipped'] : []);

    questionsHtml += `
      <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #EAE0FF; page-break-inside: avoid;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <strong style="color: #FF5841; font-size: 14px;">Question ${idx + 1}</strong>
          <span style="font-weight: bold; color: ${isSkipped ? '#EF4444' : (qScore >= 80 ? '#10B981' : '#FF5841')};">${isSkipped ? 'SKIPPED (0/100)' : `${qScore}/100`}</span>
        </div>
        <p style="font-size: 15px; font-weight: 600; color: #1E1033; margin: 0 0 10px 0;">${qText}</p>
        <div style="background: #FAF7FF; padding: 10px 14px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #EAE0FF;">
          <div style="font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold;">Candidate Response</div>
          <div style="font-size: 13px; color: #1E1033; white-space: pre-wrap; margin-top: 4px;">${ansText}</div>
        </div>
        ${correctlyExplained.length > 0 ? `<div style="font-size: 12px; color: #065F46; margin-bottom: 4px;"><strong>Correctly Explained:</strong> ${correctlyExplained.join(', ')}</div>` : ''}
        ${missingConcepts.length > 0 ? `<div style="font-size: 12px; color: #991B1B; margin-bottom: 4px;"><strong>Missing / Needs Work:</strong> ${missingConcepts.join(', ')}</div>` : ''}
        <div style="background: #FFF5F4; padding: 10px 14px; border-radius: 6px; border-left: 3px solid #FF5841; margin-top: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; color: #C53678; font-weight: bold;">Marks Awarded Justification</div>
          <div style="font-size: 13px; color: #374151; margin-top: 4px;">${ev.marksJustification || ev.explanationOfMarks || ev.feedback || 'Evaluated against expected technical concepts.'}</div>
        </div>
      </div>
    `;
  });

  const catScores = report.categoryScores || data.categoryScores || {};
  const catItems = [
    { label: 'Technical Accuracy (30%)', val: isInsufficientData ? 0 : Math.round(Number(catScores.technicalAccuracy ?? 0)) },
    { label: 'Problem Solving & Logic (25%)', val: isInsufficientData ? 0 : Math.round(Number(catScores.problemSolving ?? 0)) },
    { label: 'Communication & Clarity (20%)', val: isInsufficientData ? 0 : Math.round(Number(catScores.communication ?? 0)) },
    { label: 'Completeness & Depth (15%)', val: isInsufficientData ? 0 : Math.round(Number(catScores.completeness ?? 0)) },
    { label: 'Practical Knowledge (10%)', val: isInsufficientData ? 0 : Math.round(Number(catScores.practicalKnowledge ?? 0)) }
  ];

  const catBarsHtml = catItems.map((c) => `
    <div style="margin-bottom: 10px;">
      <div style="display:flex; justify-content:space-between; font-size: 12px; font-weight: 600; color: #1E1033; margin-bottom: 3px;">
        <span>${c.label}</span>
        <span style="color: ${c.val >= 80 ? '#10B981' : (c.val >= 60 ? '#FF5841' : '#EF4444')}; font-weight: bold;">${c.val}%</span>
      </div>
      <div style="background: #EAE0FF; height: 6px; border-radius: 3px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #FF5841 0%, #C53678 100%); width: ${c.val}%; height: 100%;"></div>
      </div>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>AVENIR AI Interview Report - ${data.jobRole || 'Interview'}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E1033; margin: 0; padding: 40px; background: #FFFFFF; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #FF5841; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; color: #1E1033; }
        .logo span { background: linear-gradient(135deg, #FF5841 0%, #C53678 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #FAF7FF; border: 1px solid #EAE0FF; margin-right: 6px; }
        .score-box { text-align: right; }
        .score-num { font-size: 44px; font-weight: 800; color: #FF5841; line-height: 1; }
        .section-title { font-size: 18px; font-weight: 700; border-bottom: 1px solid #EAE0FF; padding-bottom: 6px; margin: 28px 0 16px 0; color: #1E1033; }
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
          <h1 style="margin: 6px 0 4px 0; font-size: 20px; color: #1E1033;">Candidate Assessment Report</h1>
          <div style="margin-top: 8px;">
            <span class="badge">${data.jobRole || 'Software Developer'}</span>
            <span class="badge">${data.interviewType || 'Technical'}</span>
            <span class="badge" style="text-transform: capitalize;">${data.difficulty || 'Medium'}</span>
          </div>
        </div>
        <div class="score-box">
          <div class="score-num">${score}%</div>
          <div style="font-size: 12px; color: #6B7280; font-weight: bold; text-transform: uppercase;">Overall Score</div>
          ${isInsufficientData ? '<div style="color: #EF4444; font-size: 11px; font-weight: bold; margin-top: 4px;">INSUFFICIENT DATA</div>' : ''}
        </div>
      </div>

      <div style="background: #FFF5F4; border: 1px solid #FFE4E1; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; color: #FF5841; font-weight: 700;">Executive Summary</h3>
        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1E1033;">${report.executiveSummary || report.overallFeedback || 'Completed mock interview evaluation session.'}</p>
      </div>

      <div style="background: #FAF7FF; border: 1px solid #EAE0FF; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #1E1033;">Weighted Competency Breakdown</h3>
        ${catBarsHtml}
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
