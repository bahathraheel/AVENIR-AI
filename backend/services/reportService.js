/**
 * Report Service
 * Formats interview analysis data and generates client-renderable HTML reports
 * styled according to AVENIR AI brand guidelines (White #FFFFFF, Sunset Orange #FF5841, Red Violet #C53678).
 */

const { EVALUATION_WEIGHTS, calculateWeightedScore } = require('./geminiService');

/**
 * Normalizes raw interview data into a standardized report structure
 * @param {object} rawData
 * @returns {object}
 */
const formatReportData = (rawData) => {
  if (!rawData) return null;

  const questions = rawData.questions || [];
  const answers = rawData.answers || {};
  const evaluations = rawData.evaluations || rawData.questionEvaluations || {};
  const report = rawData.report || {};

  // Check insufficient data
  const isInsufficientData = Boolean(
    rawData.isInsufficientData ||
    report.isInsufficientData ||
    (rawData.answeredCount === 0 && (rawData.skippedCount > 0 || questions.length > 0))
  );

  // Category scores using the 5 standardized weighted categories
  const rawCatScores = report.categoryScores || {};
  const categoryScores = {
    technicalAccuracy: typeof rawCatScores.technicalAccuracy === 'number'
      ? rawCatScores.technicalAccuracy
      : (isInsufficientData ? 0 : 0),
    problemSolving: typeof rawCatScores.problemSolving === 'number'
      ? rawCatScores.problemSolving
      : (isInsufficientData ? 0 : 0),
    communication: typeof rawCatScores.communication === 'number'
      ? rawCatScores.communication
      : (isInsufficientData ? 0 : 0),
    completeness: typeof rawCatScores.completeness === 'number'
      ? rawCatScores.completeness
      : (isInsufficientData ? 0 : 0),
    practicalKnowledge: typeof rawCatScores.practicalKnowledge === 'number'
      ? rawCatScores.practicalKnowledge
      : (isInsufficientData ? 0 : 0),
  };

  // If questions exist and category scores are empty, calculate averages from per-question evaluations
  const evalKeys = Object.keys(evaluations);
  if (evalKeys.length > 0 && Object.values(categoryScores).every((v) => v === 0) && !isInsufficientData) {
    let techSum = 0, probSum = 0, commSum = 0, compSum = 0, practSum = 0, validCount = 0;
    evalKeys.forEach((k) => {
      const ev = evaluations[k];
      if (ev && ev.status !== 'SKIPPED') {
        const cs = ev.categoryScores || {};
        techSum += Number(cs.technicalAccuracy || ev.technicalCorrectness || 0);
        probSum += Number(cs.problemSolving || ev.reasoning || 0);
        commSum += Number(cs.communication || ev.clarity || 0);
        compSum += Number(cs.completeness || 0);
        practSum += Number(cs.practicalKnowledge || ev.practicality || 0);
        validCount++;
      }
    });
    if (validCount > 0) {
      categoryScores.technicalAccuracy = Math.round(techSum / validCount);
      categoryScores.problemSolving = Math.round(probSum / validCount);
      categoryScores.communication = Math.round(commSum / validCount);
      categoryScores.completeness = Math.round(compSum / validCount);
      categoryScores.practicalKnowledge = Math.round(practSum / validCount);
    }
  }

  // Calculate overall score
  let overallScore = 0;
  if (!isInsufficientData) {
    if (typeof report.overallScore === 'number') {
      overallScore = report.overallScore;
    } else if (typeof rawData.overallScore === 'number') {
      overallScore = rawData.overallScore;
    } else {
      overallScore = calculateWeightedScore(categoryScores);
    }
  }

  // Contradiction guards
  let strengths = Array.isArray(report.strengths || report.keyStrengths)
    ? (report.strengths || report.keyStrengths)
    : [];
  let weaknesses = Array.isArray(report.weaknesses || report.areasForImprovement)
    ? (report.weaknesses || report.areasForImprovement)
    : [];

  if (isInsufficientData || overallScore === 0) {
    strengths = [];
    weaknesses = ['Candidate did not provide evaluable answers for interview questions.'];
  }

  const detailedQuestions = questions.map((q, index) => {
    const qKey = String(index);
    const evalData = evaluations[qKey] || evaluations[q.id] || null;
    const answerText = answers[qKey] || answers[q.id] || 'No answer recorded.';
    const isSkipped = answerText === '[Skipped]' || evalData?.status === 'SKIPPED';

    return {
      index: index + 1,
      id: q.id || index + 1,
      question: q.question || q.questionText || 'Interview Question',
      expectedTopics: q.expectedTopics || q.expectedConcepts || evalData?.expectedConcepts || [],
      expectedConcepts: evalData?.expectedConcepts || q.expectedConcepts || q.expectedTopics || [],
      correctlyExplained: evalData?.correctlyExplained || [],
      missingConcepts: evalData?.missingConcepts || (isSkipped ? (q.expectedTopics || ['All expected concepts skipped']) : []),
      marksJustification: evalData?.marksJustification || evalData?.explanationOfMarks || evalData?.feedback || '',
      technicalCorrectness: evalData?.technicalCorrectness ?? evalData?.categoryScores?.technicalAccuracy ?? 0,
      completeness: evalData?.completeness ?? evalData?.categoryScores?.completeness ?? 0,
      difficulty: q.difficulty || rawData.difficulty || 'medium',
      answer: answerText,
      evaluation: evalData,
      isSkipped,
    };
  });

  return {
    interviewId: rawData.id || rawData.interviewId || 'N/A',
    jobRole: rawData.jobRole || 'Software Professional',
    interviewType: rawData.interviewType || 'Technical',
    difficulty: rawData.difficulty || 'Medium',
    experienceLevel: rawData.experienceLevel || 'Mid-Level',
    createdAt: rawData.createdAt ? new Date(rawData.createdAt).toLocaleDateString() : new Date().toLocaleDateString(),
    completedAt: rawData.completedAt ? new Date(rawData.completedAt).toLocaleDateString() : new Date().toLocaleDateString(),
    overallScore,
    categoryScores,
    isInsufficientData,
    strengths,
    weaknesses,
    missedConcepts: report.missedConcepts || [],
    improvementPlan: report.improvementPlan || report.recommendations || [],
    recommendedTopics: report.recommendedTopics || [],
    nextSteps: report.nextSteps || (isInsufficientData
      ? 'Complete a full mock interview session with active responses to generate an accurate readiness profile.'
      : 'Continue practicing with targeted mock interviews and reviewing the feedback above.'),
    questions: detailedQuestions,
  };
};

/**
 * Generates an HTML document styled with AVENIR AI branding for client-side printing/PDF export
 * @param {object} interviewData
 * @returns {string} HTML string
 */
const generatePDFReport = (interviewData) => {
  const data = formatReportData(interviewData);
  if (!data) return '<p>No interview data available to generate report.</p>';

  const categoryLabels = {
    technicalAccuracy: 'Technical Accuracy (30%)',
    problemSolving: 'Problem Solving & Logical Reasoning (25%)',
    communication: 'Communication & Clarity (20%)',
    completeness: 'Completeness & Depth (15%)',
    practicalKnowledge: 'Practical Knowledge (10%)',
  };

  const categoryBars = Object.entries(data.categoryScores)
    .map(([key, score]) => {
      const label = categoryLabels[key] || key;
      const barColor = score >= 80 ? '#10B981' : (score >= 60 ? '#FF5841' : '#EF4444');
      return `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #1E1033;">
            <span>${label}</span>
            <span style="color: ${barColor}; font-weight: 700;">${score}%</span>
          </div>
          <div style="background-color: #EAE0FF; border-radius: 6px; height: 10px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #FF5841 0%, #C53678 100%); width: ${Math.min(100, Math.max(0, score))}%; height: 100%; border-radius: 6px;"></div>
          </div>
        </div>
      `;
    })
    .join('');

  const questionsHtml = data.questions
    .map((item) => {
      const isSkipped = item.isSkipped || item.answer === '[Skipped]';
      const evalScore = isSkipped ? '0% (SKIPPED)' : (item.evaluation?.overallScore !== undefined ? `${item.evaluation.overallScore}%` : 'N/A');
      const strengthsList = (item.evaluation?.strengths || []).map((s) => `<li>${s}</li>`).join('');
      const weaknessesList = (item.evaluation?.weaknesses || []).map((w) => `<li>${w}</li>`).join('');

      const correctlyExplainedHtml = (item.correctlyExplained || []).length > 0
        ? `<div style="margin-top: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: #10B981; text-transform: uppercase;">Correctly Explained:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
              ${item.correctlyExplained.map((c) => `<span style="background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; font-size: 11px; padding: 2px 8px; border-radius: 4px;">${c}</span>`).join('')}
            </div>
          </div>`
        : '';

      const missingConceptsHtml = (item.missingConcepts || []).length > 0
        ? `<div style="margin-top: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: #EF4444; text-transform: uppercase;">Missing / Needs Improvement:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
              ${item.missingConcepts.map((m) => `<span style="background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; font-size: 11px; padding: 2px 8px; border-radius: 4px;">${m}</span>`).join('')}
            </div>
          </div>`
        : '';

      return `
        <div style="background: #FFFFFF; border: 1px solid #EAE0FF; border-radius: 8px; padding: 20px; margin-bottom: 16px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F3F4F6; padding-bottom: 10px; margin-bottom: 12px;">
            <span style="font-weight: 700; color: #FF5841; font-size: 14px;">QUESTION ${item.index} (${item.difficulty.toUpperCase()})</span>
            <span style="background: ${isSkipped ? '#FEF2F2' : '#FFF5F4'}; color: ${isSkipped ? '#EF4444' : '#FF5841'}; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 13px; border: 1px solid #FF5841;">Score: ${evalScore}</span>
          </div>
          <p style="font-weight: 600; color: #1E1033; margin: 0 0 10px 0; font-size: 15px;">${item.question}</p>
          <div style="background: #F9FAFB; border-left: 3px solid #1E1033; padding: 10px 14px; margin-bottom: 14px; border-radius: 0 4px 4px 0;">
            <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #6B7280; display: block; margin-bottom: 4px;">Candidate's Answer:</span>
            <p style="margin: 0; font-size: 13px; color: #374151; white-space: pre-wrap;">${item.answer}</p>
          </div>
          ${correctlyExplainedHtml}
          ${missingConceptsHtml}
          ${item.marksJustification
          ? `<div style="margin-top: 10px; font-size: 12px; color: #4B5563; background: #FFF7ED; padding: 8px 12px; border-radius: 4px; border-left: 3px solid #FF5841;">
                  <strong>Marks Awarded Justification:</strong> ${item.marksJustification}
                </div>`
          : ''
        }
          ${item.evaluation
          ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px; margin-top: 12px;">
              ${strengthsList ? `<div><strong style="color: #10B981;">Strengths:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${strengthsList}</ul></div>` : ''}
              ${weaknessesList ? `<div><strong style="color: #EF4444;">Areas to Improve:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${weaknessesList}</ul></div>` : ''}
            </div>
            ${item.evaluation.correctAnswer || item.evaluation.idealAnswer ? `<div style="margin-top: 10px; font-size: 13px; color: #4B5563; background: #FAF5FF; padding: 8px 12px; border-radius: 4px; border-left: 3px solid #C53678;"><strong>Key Model Concepts:</strong> ${item.evaluation.correctAnswer || item.evaluation.idealAnswer}</div>` : ''}
          `
          : ''
        }
        </div>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AVENIR AI - Comprehensive Interview Assessment</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1E1033;
      background-color: #FAF7FF;
      margin: 0;
      padding: 32px;
      line-height: 1.5;
    }
    .report-container {
      max-width: 900px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(197, 54, 120, 0.08);
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #FF5841;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .logo-brand {
      font-size: 26px;
      font-weight: 800;
      color: #1E1033;
      letter-spacing: -0.5px;
    }
    .logo-brand span {
      background: linear-gradient(135deg, #FF5841 0%, #C53678 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tagline {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6B7280;
      margin-top: 2px;
    }
    .score-banner {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 28px;
      background: #FFF5F4;
      border: 1px solid #FFE4E1;
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .overall-card {
      background: #FFFFFF;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      border: 2px solid #FF5841;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .overall-number {
      font-size: 48px;
      font-weight: 800;
      color: #FF5841;
      line-height: 1;
    }
    .insufficient-badge {
      display: inline-block;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 700;
      color: #DC2626;
      background: #FEE2E2;
      padding: 3px 8px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <div>
        <div class="logo-brand">AVENIR <span>AI</span></div>
        <div class="tagline">Your Future Starts Here.</div>
      </div>
      <div style="text-align: right; font-size: 13px; color: #6B7280;">
        <div><strong>Role:</strong> ${data.jobRole}</div>
        <div><strong>Type:</strong> ${data.interviewType} | <strong>Level:</strong> ${data.experienceLevel}</div>
        <div><strong>Date:</strong> ${data.completedAt}</div>
      </div>
    </div>

    <!-- Score Summary -->
    <div class="score-banner">
      <div class="overall-card">
        <div class="overall-number">${data.overallScore}%</div>
        <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #4B5563; margin-top: 6px;">Overall Score</div>
        ${data.isInsufficientData ? '<span class="insufficient-badge">INSUFFICIENT DATA</span>' : ''}
      </div>
      <div>
        <div style="font-weight: 700; font-size: 15px; margin-bottom: 12px; color: #1E1033;">Weighted Competency Breakdown</div>
        ${categoryBars}
      </div>
    </div>

    <!-- Executive Summary Strengths & Weaknesses -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px;">
      <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 18px;">
        <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 16px;">Key Strengths</h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #166534;">
          ${data.strengths.length > 0 ? data.strengths.map((s) => `<li style="margin-bottom: 6px;">${s}</li>`).join('') : '<li style="font-style: italic; color: #6B7280;">No demonstrated strengths recorded (questions skipped or incomplete).</li>'}
        </ul>
      </div>
      <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 18px;">
        <h3 style="color: #991B1B; margin: 0 0 10px 0; font-size: 16px;">Priority Focus Areas</h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #991B1B;">
          ${data.weaknesses.length > 0 ? data.weaknesses.map((w) => `<li style="margin-bottom: 6px;">${w}</li>`).join('') : '<li style="margin-bottom: 6px;">Practice comprehensive answers covering all edge cases.</li>'}
        </ul>
      </div>
    </div>

    <!-- Detailed Questions -->
    <h3 style="font-size: 18px; border-bottom: 2px solid #F3F4F6; padding-bottom: 8px; margin-bottom: 20px; color: #1E1033;">Individual Question Assessments</h3>
    ${questionsHtml}

    <!-- Next Steps -->
    <div style="background: #1E1033; color: #FFFFFF; border-radius: 8px; padding: 24px; margin-top: 32px;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #FF5841;">Recommended Next Steps</h3>
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #F3F4F6;">${data.nextSteps}</p>
      ${data.recommendedTopics && data.recommendedTopics.length > 0
      ? `
        <div style="font-size: 13px; color: #E5E7EB;">
          <strong>Suggested Topics:</strong> ${data.recommendedTopics.join(' • ')}
        </div>
      `
      : ''
    }
    </div>
  </div>
</body>
</html>
  `.trim();
};

module.exports = {
  formatReportData,
  generatePDFReport,
};
