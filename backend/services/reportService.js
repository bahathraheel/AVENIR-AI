/**
 * Report Service
 * Formats interview analysis data and generates client-renderable HTML reports
 * styled according to AVENIR AI brand guidelines.
 */

/**
 * Normalizes raw interview data into a standardized report structure
 * @param {object} rawData
 * @returns {object}
 */
const formatReportData = (rawData) => {
  if (!rawData) return null;

  const questions = rawData.questions || [];
  const answers = rawData.answers || {};
  const evaluations = rawData.evaluations || {};
  const report = rawData.report || {};

  // Compute average score across question evaluations if report.overallScore is missing
  let computedAverage = 0;
  const evalKeys = Object.keys(evaluations);
  if (evalKeys.length > 0) {
    const sum = evalKeys.reduce((acc, key) => acc + (evaluations[key]?.overallScore || 0), 0);
    computedAverage = Math.round(sum / evalKeys.length);
  }

  const overallScore = report.overallScore !== undefined ? report.overallScore : computedAverage;

  const categoryScores = report.categoryScores || {
    technicalCorrectness: 75,
    relevance: 80,
    clarity: 78,
    completeness: 72,
    problemSolving: 76,
    communication: 80,
  };

  const detailedQuestions = questions.map((q, index) => {
    const qKey = String(index);
    const evalData = evaluations[qKey] || evaluations[q.id] || null;
    const answerText = answers[qKey] || answers[q.id] || 'No answer recorded.';

    return {
      index: index + 1,
      id: q.id || index + 1,
      question: q.question || 'Interview Question',
      expectedTopics: q.expectedTopics || [],
      difficulty: q.difficulty || rawData.difficulty || 'medium',
      answer: answerText,
      evaluation: evalData,
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
    strengths: report.strengths || [],
    weaknesses: report.weaknesses || [],
    missedConcepts: report.missedConcepts || [],
    improvementPlan: report.improvementPlan || [],
    recommendedTopics: report.recommendedTopics || [],
    nextSteps: report.nextSteps || 'Continue practicing with targeted mock interviews.',
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
    technicalCorrectness: 'Technical Correctness',
    relevance: 'Relevance',
    clarity: 'Clarity',
    completeness: 'Completeness',
    problemSolving: 'Problem Solving',
    communication: 'Communication',
  };

  const categoryBars = Object.entries(data.categoryScores)
    .map(([key, score]) => {
      const label = categoryLabels[key] || key;
      return `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #252525;">
            <span>${label}</span>
            <span style="color: #FF7900;">${score}%</span>
          </div>
          <div style="background-color: #E5E7EB; border-radius: 6px; height: 10px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #FF7900 0%, #FF9A32 100%); width: ${Math.min(100, Math.max(0, score))}%; height: 100%; border-radius: 6px;"></div>
          </div>
        </div>
      `;
    })
    .join('');

  const questionsHtml = data.questions
    .map((item) => {
      const evalScore = item.evaluation?.overallScore !== undefined ? `${item.evaluation.overallScore}%` : 'N/A';
      const strengthsList = (item.evaluation?.strengths || []).map((s) => `<li>${s}</li>`).join('');
      const weaknessesList = (item.evaluation?.weaknesses || []).map((w) => `<li>${w}</li>`).join('');

      return `
        <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; margin-bottom: 16px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #F3F4F6; padding-bottom: 10px; margin-bottom: 12px;">
            <span style="font-weight: 700; color: #FF7900; font-size: 14px;">QUESTION ${item.index} (${item.difficulty.toUpperCase()})</span>
            <span style="background: #FFF7ED; color: #FF7900; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 13px; border: 1px solid #FF9A32;">Score: ${evalScore}</span>
          </div>
          <p style="font-weight: 600; color: #252525; margin: 0 0 10px 0; font-size: 15px;">${item.question}</p>
          <div style="background: #F3F4F6; border-left: 3px solid #252525; padding: 10px 14px; margin-bottom: 14px; border-radius: 0 4px 4px 0;">
            <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #6B7280; display: block; margin-bottom: 4px;">Candidate's Answer:</span>
            <p style="margin: 0; font-size: 13px; color: #374151; white-space: pre-wrap;">${item.answer}</p>
          </div>
          ${
            item.evaluation
              ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px;">
              ${strengthsList ? `<div><strong style="color: #059669;">Strengths:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${strengthsList}</ul></div>` : ''}
              ${weaknessesList ? `<div><strong style="color: #DC2626;">Areas to Improve:</strong><ul style="margin: 4px 0 0 18px; padding: 0;">${weaknessesList}</ul></div>` : ''}
            </div>
            ${item.evaluation.correctAnswer ? `<div style="margin-top: 10px; font-size: 13px; color: #4B5563; background: #FAF5FF; padding: 8px 12px; border-radius: 4px; border-left: 3px solid #9333EA;"><strong>Key Model Concepts:</strong> ${item.evaluation.correctAnswer}</div>` : ''}
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
      color: #252525;
      background-color: #F8FAFC;
      margin: 0;
      padding: 32px;
      line-height: 1.5;
    }
    .report-container {
      max-width: 900px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #FF7900;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .logo-brand {
      font-size: 26px;
      font-weight: 800;
      color: #FF7900;
      letter-spacing: -0.5px;
    }
    .logo-brand span {
      color: #252525;
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
      background: #F3F4F6;
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .overall-card {
      background: #FFFFFF;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      border: 2px solid #FF9A32;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .overall-number {
      font-size: 48px;
      font-weight: 800;
      color: #FF7900;
      line-height: 1;
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
      </div>
      <div>
        <div style="font-weight: 700; font-size: 15px; margin-bottom: 12px; color: #252525;">Core Competency Breakdown</div>
        ${categoryBars}
      </div>
    </div>

    <!-- Executive Summary Strengths & Weaknesses -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px;">
      <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 18px;">
        <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 16px;">Key Strengths</h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #166534;">
          ${data.strengths.map((s) => `<li style="margin-bottom: 6px;">${s}</li>`).join('') || '<li>Consistent communication and professional tone.</li>'}
        </ul>
      </div>
      <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 18px;">
        <h3 style="color: #991B1B; margin: 0 0 10px 0; font-size: 16px;">Priority Focus Areas</h3>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #991B1B;">
          ${data.weaknesses.map((w) => `<li style="margin-bottom: 6px;">${w}</li>`).join('') || '<li>Deeper dive into edge cases and concurrency required.</li>'}
        </ul>
      </div>
    </div>

    <!-- Detailed Questions -->
    <h3 style="font-size: 18px; border-bottom: 2px solid #F3F4F6; padding-bottom: 8px; margin-bottom: 20px; color: #252525;">Question by Question Breakdown</h3>
    ${questionsHtml}

    <!-- Next Steps -->
    <div style="background: #252525; color: #FFFFFF; border-radius: 8px; padding: 24px; margin-top: 32px;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #FF9A32;">Recommended Next Steps</h3>
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #F3F4F6;">${data.nextSteps}</p>
      ${
        data.recommendedTopics.length > 0
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
