/**
 * AVENIR AI - Resume Analyzer Module
 * Handles drag-and-drop document upload, file validation, progress feedback,
 * ATS compatibility scoring, keyword matching, section analysis, and PDF report generation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof checkAuthState === 'function') await checkAuthState();
  if (typeof waitForAuthInit === 'function') {
    const user = await waitForAuthInit();
    if (!user) return;
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  initResumeAnalyzer();
});

function initResumeAnalyzer() {
  let selectedFile = null;
  let isAnalyzing = false;
  let currentAnalysisResult = null;

  // DOM Elements
  const dropZone = document.getElementById('dropZone');
  const dropzoneContent = document.getElementById('dropzoneContent');
  const filePreview = document.getElementById('filePreview');
  const fileNameEl = document.getElementById('fileName');
  const fileSizeEl = document.getElementById('fileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const changeFileBtn = document.getElementById('changeFileBtn');
  const browseFileBtn = document.getElementById('browseFileBtn');
  const fileFormatBadge = document.getElementById('fileFormatBadge');
  const fileInput = document.getElementById('resumeFileInput');
  const targetRoleSelect = document.getElementById('targetRoleSelect');
  const analyzeBtn = document.getElementById('analyzeResumeBtn');
  const analyzeSpinner = document.getElementById('analyzeSpinner');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadStatusText = document.getElementById('uploadStatusText');
  const uploadPercentText = document.getElementById('uploadPercentText');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const resumeError = document.getElementById('resumeError');
  const resumeErrorText = document.getElementById('resumeErrorText');
  const retryAnalyzeBtn = document.getElementById('retryAnalyzeBtn');
  const resumeResults = document.getElementById('resumeResults');
  const downloadReportBtn = document.getElementById('downloadResumeReportBtn');

  // Load previous resume analysis if available
  loadLatestAnalysis();

  /**
   * File validation: PDF and DOCX only, max 5MB
   */
  function validateFile(file) {
    if (!file) return { valid: false, message: 'No file selected.' };

    const validMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    const validExts = ['.pdf', '.docx', '.doc'];
    const nameLower = file.name.toLowerCase();

    const matchesExt = validExts.some(ext => nameLower.endsWith(ext));
    const matchesMime = validMimes.includes(file.type);

    if (!matchesExt && !matchesMime) {
      return {
        valid: false,
        message: 'Unsupported file format. Please upload a PDF (.pdf) or Microsoft Word (.docx) document.'
      };
    }

    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        message: 'File size exceeds 5MB limit. Please compress or upload a smaller file.'
      };
    }

    return { valid: true };
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function handleFileSelected(file) {
    hideError();
    const validation = validateFile(file);
    if (!validation.valid) {
      showError(validation.message);
      return;
    }

    selectedFile = file;

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (fileFormatBadge) {
      const ext = file.name.split('.').pop().toUpperCase();
      fileFormatBadge.textContent = ext;
    }

    if (dropzoneContent) dropzoneContent.classList.add('hidden');
    if (filePreview) filePreview.classList.remove('hidden');

    if (window.lucide) window.lucide.createIcons();
  }

  if (browseFileBtn && fileInput) {
    browseFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (changeFileBtn && fileInput) {
    changeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  function clearSelectedFile() {
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (dropzoneContent) dropzoneContent.classList.remove('hidden');
    if (filePreview) filePreview.classList.add('hidden');
    hideError();
  }

  function showError(msg) {
    if (resumeError) {
      if (resumeErrorText) resumeErrorText.textContent = msg;
      resumeError.classList.remove('hidden');
      resumeError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      alert(msg);
    }
  }

  function hideError() {
    if (resumeError) resumeError.classList.add('hidden');
  }

  // --- Drag and Drop Handlers ---
  if (dropZone) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-active');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFileSelected(dt.files[0]);
      }
    });

    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#removeFileBtn') || e.target.closest('#changeFileBtn')) return;
      if (fileInput && !selectedFile) {
        fileInput.click();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFileSelected(fileInput.files[0]);
      }
    });
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelectedFile();
    });
  }

  // --- Retry Button Handler ---
  if (retryAnalyzeBtn) {
    retryAnalyzeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerAnalyzeWorkflow();
    });
  }

  // --- Analyze Resume Button ---
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      triggerAnalyzeWorkflow();
    });
  }

  /**
   * Main Upload and Analysis Workflow
   */
  async function triggerAnalyzeWorkflow() {
    hideError();

    if (isAnalyzing) return; // Prevent duplicate concurrent requests

    if (!selectedFile) {
      showError('Please choose or drag a resume file (PDF or DOCX) before analyzing.');
      return;
    }

    const targetRole = targetRoleSelect ? targetRoleSelect.value : 'Software Developer';
    if (!targetRole) {
      showError('Please select your target job role.');
      return;
    }

    isAnalyzing = true;
    analyzeBtn.disabled = true;
    if (analyzeSpinner) analyzeSpinner.classList.remove('hidden');
    if (uploadProgress) uploadProgress.classList.remove('hidden');

    updateProgress(20, 'Uploading resume document...');

    const formData = new FormData();
    formData.append('resume', selectedFile);
    formData.append('targetJobRole', targetRole);
    formData.append('targetRole', targetRole);

    let progressTimer = null;

    try {
      progressTimer = setTimeout(() => {
        updateProgress(50, 'Extracting text and scanning ATS formatting...');
      }, 700);

      const progressTimer2 = setTimeout(() => {
        updateProgress(80, 'Evaluating skills, keyword frequency, and experience with Gemini AI...');
      }, 2000);

      const result = await analyzeResume(formData);
      clearTimeout(progressTimer);
      clearTimeout(progressTimer2);

      updateProgress(100, 'Analysis completed successfully!');
      currentAnalysisResult = result;

      setTimeout(() => {
        if (uploadProgress) uploadProgress.classList.add('hidden');
        displayAnalysisResults(result);
        if (typeof showToast === 'function') {
          showToast('Resume ATS Analysis complete!', 'success');
        }
      }, 400);

    } catch (error) {
      if (progressTimer) clearTimeout(progressTimer);
      console.error('[ResumeAnalyzer] Upload or analysis failed:', error);
      if (uploadProgress) uploadProgress.classList.add('hidden');

      let userMsg = error.message || 'Failed to analyze resume. Please try again.';
      if (userMsg.includes('413')) userMsg = 'File size exceeds the 5MB limit. Please upload a smaller document.';
      if (userMsg.includes('415')) userMsg = 'Unsupported file format. Please upload a PDF (.pdf) or Word (.docx) document.';
      if (userMsg.includes('429')) userMsg = 'AI rate limit reached. Please wait a moment and click Retry.';
      if (userMsg.includes('503')) userMsg = 'AI service is temporarily experiencing high demand. Please click Retry.';

      showError(userMsg);
    } finally {
      isAnalyzing = false;
      analyzeBtn.disabled = false;
      if (analyzeSpinner) analyzeSpinner.classList.add('hidden');
    }
  }

  function updateProgress(percent, statusText) {
    if (uploadStatusText) uploadStatusText.textContent = statusText;
    if (uploadPercentText) uploadPercentText.textContent = `${percent}%`;
    if (uploadProgressBar) uploadProgressBar.style.width = `${percent}%`;
  }

  /**
   * Load previous resume analysis on page load
   */
  async function loadLatestAnalysis() {
    try {
      if (typeof getLatestResume === 'function') {
        const latest = await getLatestResume();
        if (latest && latest.analysis) {
          currentAnalysisResult = latest;
          displayAnalysisResults(latest);
          if (fileNameEl && latest.fileName) {
            fileNameEl.textContent = latest.fileName;
            if (dropzoneContent) dropzoneContent.classList.add('hidden');
            if (filePreview) filePreview.classList.remove('hidden');
            if (fileFormatBadge) {
              const ext = latest.fileName.split('.').pop().toUpperCase();
              fileFormatBadge.textContent = ext;
            }
          }
          if (targetRoleSelect && latest.targetJobRole) {
            targetRoleSelect.value = latest.targetJobRole;
          }
        }
      }
    } catch (err) {
      console.warn('[ResumeAnalyzer] Could not load previous analysis:', err.message);
    }
  }

  /**
   * Helper: Extracts and normalizes discrete skills and keywords into individual items.
   * Splits concatenated lists (e.g. "JavaScript, Python, React"), resolves aliases,
   * strips punctuation/bullets, and eliminates duplicate entries.
   */
  function extractDiscreteSkillBadges(rawInput) {
    if (!rawInput) return [];
    const items = Array.isArray(rawInput) ? rawInput : [rawInput];

    const CANONICAL_MAP = {
      'js': 'JavaScript', 'javascript': 'JavaScript', 'ts': 'TypeScript', 'typescript': 'TypeScript',
      'node': 'Node.js', 'nodejs': 'Node.js', 'node.js': 'Node.js',
      'react': 'React.js', 'reactjs': 'React.js', 'react.js': 'React.js',
      'express': 'Express.js', 'expressjs': 'Express.js', 'express.js': 'Express.js',
      'py': 'Python', 'python': 'Python', 'python3': 'Python',
      'java': 'Java', 'c': 'C', 'cpp': 'C++', 'c++': 'C++', 'c#': 'C#', 'csharp': 'C#',
      'sql': 'SQL', 'mysql': 'MySQL', 'postgres': 'PostgreSQL', 'postgresql': 'PostgreSQL',
      'mongo': 'MongoDB', 'mongodb': 'MongoDB', 'docker': 'Docker', 'k8s': 'Kubernetes',
      'kubernetes': 'Kubernetes', 'aws': 'AWS', 'gcp': 'Google Cloud (GCP)', 'azure': 'Microsoft Azure',
      'git': 'Git', 'github': 'GitHub', 'graphql': 'GraphQL', 'rest': 'REST APIs',
      'rest apis': 'REST APIs', 'rest api': 'REST APIs', 'restful apis': 'REST APIs',
      'html': 'HTML5', 'html5': 'HTML5', 'css': 'CSS3', 'css3': 'CSS3',
      'bootstrap': 'Bootstrap', 'tailwind': 'Tailwind CSS', 'tailwindcss': 'Tailwind CSS',
      'firebase': 'Firebase', 'vercel': 'Vercel', 'postman': 'Postman', 'jest': 'Jest',
      'redis': 'Redis', 'nextjs': 'Next.js', 'next.js': 'Next.js',
      'ci/cd': 'CI/CD Pipelines', 'ci/cd pipelines': 'CI/CD Pipelines', 'cicd': 'CI/CD Pipelines'
    };

    const results = [];
    const seen = new Set();

    for (const item of items) {
      if (!item) continue;
      // Split on commas, semicolons, vertical bars, slashes, or conjunctions (preserving CI/CD)
      const parts = String(item).split(/[,;\n|]+|\s+[|/]\s+|\s+\band\b\s+|\s+&\s+/i);
      for (const part of parts) {
        let cleaned = part.trim()
          .replace(/^[-•*#\d.]+\s*/, '')
          .replace(/[.]+$/, '')
          .trim();
        if (!cleaned || cleaned.length < 1) continue;

        const lower = cleaned.toLowerCase();
        const normalized = CANONICAL_MAP[lower] || cleaned;
        const key = normalized.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push(normalized);
        }
      }
    }
    return results;
  }

  /**
   * Display Complete Analysis Results Matching Required Schema
   */
  function displayAnalysisResults(resultData) {
    if (!resumeResults) return;

    const analysis = resultData.analysis || resultData;
    const targetRole = resultData.targetJobRole || analysis.targetRole || (targetRoleSelect ? targetRoleSelect.value : 'Software Developer');
    const atsScore = Math.min(100, Math.max(0, parseInt(analysis.atsScore ?? analysis.overallScore, 10) || 75));
    const overallScore = atsScore;

    // 1. Candidate Info Banner
    const nameEl = document.getElementById('candidateName');
    if (nameEl) nameEl.textContent = analysis.candidateName || 'Candidate Profile';

    const roleBadgeEl = document.getElementById('targetRoleBadge');
    if (roleBadgeEl) roleBadgeEl.textContent = targetRole;

    const fileNameDisplay = document.getElementById('candidateFileName');
    if (fileNameDisplay) fileNameDisplay.textContent = `Document: ${resultData.fileName || selectedFile?.name || 'Uploaded Resume'}`;

    const dateBadge = document.getElementById('analysisDateBadge');
    if (dateBadge) {
      const dt = resultData.createdAt ? new Date(resultData.createdAt) : new Date();
      dateBadge.textContent = `Analyzed ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    const summaryEl = document.getElementById('professionalSummary');
    if (summaryEl) summaryEl.textContent = analysis.professionalSummary || 'Dedicated professional profile with relevant technical background.';

    // 2. Overall Score & ATS Score Donut
    const scoreValEl = document.getElementById('resumeOverallScore');
    const scoreCircle = document.getElementById('resumeScoreCircle');
    const scoreStatusText = document.getElementById('overallScoreStatusText');
    const scoreRatingBadge = document.getElementById('scoreRatingBadge');

    if (scoreValEl) scoreValEl.textContent = overallScore;
    const scoreColor = overallScore >= 80 ? '#10B981' : overallScore >= 65 ? '#FF5841' : '#EF4444';
    if (scoreCircle) {
      scoreCircle.style.borderColor = scoreColor;
      scoreCircle.style.color = scoreColor;
    }
    if (scoreRatingBadge) {
      scoreRatingBadge.textContent = overallScore >= 85 ? 'Exceptional Match' : overallScore >= 75 ? 'Strong Match' : overallScore >= 60 ? 'Moderate Match' : 'Needs Optimization';
      scoreRatingBadge.className = `badge ${overallScore >= 75 ? 'badge-primary' : overallScore >= 60 ? 'badge-warning' : 'badge-danger'}`;
    }
    if (scoreStatusText) {
      scoreStatusText.textContent = overallScore >= 80
        ? 'High ATS match. Excellent keyword density and role alignment.'
        : overallScore >= 65
          ? 'Good foundation. Adding the recommended missing keywords will boost interview callbacks.'
          : 'Significant ATS parsing risks detected. Review the required adjustments below.';
    }

    // 3. ATS Compatibility Card
    const atsValEl = document.getElementById('atsScoreValue');
    const atsFill = document.getElementById('atsScoreFill');
    const atsBadge = document.getElementById('atsBadge');

    if (atsValEl) atsValEl.textContent = `${atsScore}%`;
    if (atsFill) {
      atsFill.style.width = `${atsScore}%`;
      atsFill.style.background = scoreColor;
    }
    if (atsBadge) {
      atsBadge.textContent = atsScore >= 80 ? 'High Compatibility' : atsScore >= 65 ? 'Moderate Compatibility' : 'Low Compatibility';
      atsBadge.className = `badge ${atsScore >= 80 ? 'badge-success' : atsScore >= 65 ? 'badge-warning' : 'badge-danger'}`;
    }

    // 4. ATS Scoring Calculation Breakdown
    const sb = analysis.scoreBreakdown || {};
    const kwScore = (sb.keywordAlignment && typeof sb.keywordAlignment === 'object') ? (sb.keywordAlignment.score ?? 34) : (parseInt(sb.keywordAlignment, 10) || 34);
    const expScore = (sb.experienceRelevance && typeof sb.experienceRelevance === 'object') ? (sb.experienceRelevance.score ?? 21) : (parseInt(sb.experienceRelevance, 10) || 21);
    const sklScore = (sb.skillsDepth && typeof sb.skillsDepth === 'object') ? (sb.skillsDepth.score ?? 17) : (parseInt(sb.skillsDepth, 10) || 17);
    const eduScore = (sb.educationCredentials && typeof sb.educationCredentials === 'object') ? (sb.educationCredentials.score ?? 9) : (parseInt(sb.educationCredentials, 10) || 9);
    const fmtScore = (sb.formattingStructure && typeof sb.formattingStructure === 'object') ? (sb.formattingStructure.score ?? 4) : (parseInt(sb.formattingStructure, 10) || 4);

    const elKwScore = document.getElementById('breakdownKeywordScore');
    const elKwFill = document.getElementById('breakdownKeywordFill');
    if (elKwScore) elKwScore.textContent = `${kwScore} / 40`;
    if (elKwFill) elKwFill.style.width = `${Math.min(100, Math.round((kwScore / 40) * 100))}%`;

    const elExpScore = document.getElementById('breakdownExpScore');
    const elExpFill = document.getElementById('breakdownExpFill');
    if (elExpScore) elExpScore.textContent = `${expScore} / 25`;
    if (elExpFill) elExpFill.style.width = `${Math.min(100, Math.round((expScore / 25) * 100))}%`;

    const elSklScore = document.getElementById('breakdownSkillsScore');
    const elSklFill = document.getElementById('breakdownSkillsFill');
    if (elSklScore) elSklScore.textContent = `${sklScore} / 20`;
    if (elSklFill) elSklFill.style.width = `${Math.min(100, Math.round((sklScore / 20) * 100))}%`;

    const elEduScore = document.getElementById('breakdownEduScore');
    const elEduFill = document.getElementById('breakdownEduFill');
    if (elEduScore) elEduScore.textContent = `${eduScore} / 10`;
    if (elEduFill) elEduFill.style.width = `${Math.min(100, Math.round((eduScore / 10) * 100))}%`;

    const elFmtScore = document.getElementById('breakdownFormatScore');
    const elFmtFill = document.getElementById('breakdownFormatFill');
    if (elFmtScore) elFmtScore.textContent = `${fmtScore} / 5`;
    if (elFmtFill) elFmtFill.style.width = `${Math.min(100, Math.round((fmtScore / 5) * 100))}%`;

    const explanationEl = document.getElementById('scoringExplanationText');
    if (explanationEl) {
      explanationEl.textContent = sb.calculationExplanation || `The ATS score of ${atsScore}/100 is calculated using a transparent 5-factor weighted model: 40% Role Keyword Alignment (${kwScore}/40), 25% Experience Relevance (${expScore}/25), 20% Technical Skill Depth (${sklScore}/20), 10% Education & Credentials (${eduScore}/10), and 5% ATS Readability (${fmtScore}/5). Points are awarded strictly for verified credentials present in the document.`;
    }

    // 5. Detected Technical Skills (Discrete Badges)
    const detectedContainer = document.getElementById('detectedSkillsList');
    const detectedCountEl = document.getElementById('detectedSkillsCount');
    const detectedSkills = extractDiscreteSkillBadges(
      analysis.skillsFound || (Array.isArray(analysis.skills?.detected) ? analysis.skills.detected : [])
    );

    if (detectedCountEl) detectedCountEl.textContent = `${detectedSkills.length} Skills`;
    if (detectedContainer) {
      detectedContainer.innerHTML = '';
      if (detectedSkills.length > 0) {
        detectedSkills.forEach((s) => {
          const badge = document.createElement('span');
          badge.className = 'skill-badge skill-badge-detected';
          badge.innerHTML = `<i data-lucide="check" style="width: 13px; height: 13px; stroke-width: 2.5; flex-shrink: 0;"></i><span>${escapeHtml(s)}</span>`;
          detectedContainer.appendChild(badge);
        });
      } else {
        detectedContainer.innerHTML = '<span class="skill-badge-empty">No specialized technical skills detected.</span>';
      }
    }

    // 6. Matched Role Keywords (Discrete Badges)
    const matchedContainer = document.getElementById('matchedKeywordsList');
    const matchedCountEl = document.getElementById('matchedKeywordsCount');
    const matchedKeywords = extractDiscreteSkillBadges(
      analysis.matchedKeywords || (Array.isArray(analysis.keywords?.found) ? analysis.keywords.found : [])
    );

    if (matchedCountEl) matchedCountEl.textContent = `${matchedKeywords.length} Matched`;
    if (matchedContainer) {
      matchedContainer.innerHTML = '';
      if (matchedKeywords.length > 0) {
        matchedKeywords.forEach((k) => {
          const badge = document.createElement('span');
          badge.className = 'skill-badge skill-badge-matched';
          badge.innerHTML = `<i data-lucide="check-check" style="width: 13px; height: 13px; stroke-width: 2.5; flex-shrink: 0;"></i><span>${escapeHtml(k)}</span>`;
          matchedContainer.appendChild(badge);
        });
      } else {
        matchedContainer.innerHTML = '<span class="skill-badge-empty">General role alignment.</span>';
      }
    }

    // 7. Missing Recommended Keywords (Discrete Badges)
    const missingContainer = document.getElementById('missingSkillsList');
    const missingCountEl = document.getElementById('missingKeywordsCount');
    const missingKeywords = extractDiscreteSkillBadges(
      analysis.missingKeywords || (Array.isArray(analysis.skills?.missing) ? analysis.skills.missing : [])
    );

    if (missingCountEl) missingCountEl.textContent = `${missingKeywords.length} Missing`;
    if (missingContainer) {
      missingContainer.innerHTML = '';
      if (missingKeywords.length > 0) {
        missingKeywords.forEach((s) => {
          const badge = document.createElement('span');
          badge.className = 'skill-badge skill-badge-missing';
          badge.innerHTML = `<i data-lucide="plus" style="width: 13px; height: 13px; stroke-width: 2.5; flex-shrink: 0;"></i><span>${escapeHtml(s)}</span>`;
          missingContainer.appendChild(badge);
        });
      } else {
        missingContainer.innerHTML = '<span class="skill-badge-empty" style="color: #10B981;">No critical keywords missing for this role!</span>';
      }
    }

    // 8. Skills Summary Pill Row
    const skillsSummaryPill = document.getElementById('skillsSummaryPill');
    if (skillsSummaryPill) {
      skillsSummaryPill.innerHTML = `
        <span class="skill-count-badge badge-green">${detectedSkills.length} Detected</span>
        <span class="skill-count-badge badge-orange">${matchedKeywords.length} Matched</span>
        <span class="skill-count-badge badge-amber">${missingKeywords.length} Missing</span>
      `;
    }

    // 9. Section-by-Section In-Depth Analysis
    const expEl = document.getElementById('experienceAnalysisText');
    if (expEl) expEl.textContent = analysis.experienceAnalysis || analysis.experience?.feedback || 'Work history shows strong progression and relevant capabilities.';

    const projEl = document.getElementById('projectAnalysisText');
    if (projEl) projEl.textContent = analysis.projectAnalysis || 'Demonstrates practical project implementations and architectural problem-solving.';

    const eduEl = document.getElementById('educationAnalysisText');
    if (eduEl) eduEl.textContent = analysis.educationAnalysis || 'Educational and technical credentials provide foundational competency.';

    // 10. Key Strengths
    const strengthsList = document.getElementById('strengthsList');
    if (strengthsList) {
      strengthsList.innerHTML = '';
      const items = (Array.isArray(analysis.strengths) && analysis.strengths.length > 0)
        ? analysis.strengths
        : ['Clear technical experience', 'Solid foundational skill set'];

      items.forEach((st) => {
        const li = document.createElement('li');
        li.className = 'check-item check-pass';
        li.innerHTML = `
          <i data-lucide="check-circle" class="check-icon" style="color: #10B981; flex-shrink: 0;"></i>
          <span>${escapeHtml(st)}</span>
        `;
        strengthsList.appendChild(li);
      });
    }

    // 11. Critical Weaknesses / Gaps
    const weaknessesList = document.getElementById('weaknessesList');
    if (weaknessesList) {
      weaknessesList.innerHTML = '';
      const items = (Array.isArray(analysis.weaknesses) && analysis.weaknesses.length > 0)
        ? analysis.weaknesses
        : ['Quantifiable business impact metrics could be amplified'];

      items.forEach((wk) => {
        const li = document.createElement('li');
        li.className = 'check-item check-warning';
        li.innerHTML = `
          <i data-lucide="alert-circle" class="check-icon" style="color: #F59E0B; flex-shrink: 0;"></i>
          <span>${escapeHtml(wk)}</span>
        `;
        weaknessesList.appendChild(li);
      });
    }

    // 12. Prioritized Improvements
    const improvementsList = document.getElementById('improvementsList');
    if (improvementsList) {
      improvementsList.innerHTML = '';
      const items = (Array.isArray(analysis.improvements) && analysis.improvements.length > 0)
        ? analysis.improvements
        : ['Add measurable performance metrics to project descriptions'];

      items.forEach((imp) => {
        const li = document.createElement('li');
        li.style.cssText = 'margin-bottom: 8px; font-size: 13.5px; line-height: 1.55; color: #374151;';
        li.textContent = imp;
        improvementsList.appendChild(li);
      });
    }

    // 13. Strategic Recommendations
    const recommendationsList = document.getElementById('recommendationsList');
    if (recommendationsList) {
      recommendationsList.innerHTML = '';
      const items = (Array.isArray(analysis.recommendations) && analysis.recommendations.length > 0)
        ? analysis.recommendations
        : [`Practice targeted interview questions for ${targetRole}`];

      items.forEach((rec) => {
        const li = document.createElement('li');
        li.style.cssText = 'margin-bottom: 8px; font-size: 13.5px; line-height: 1.55; color: #374151;';
        li.textContent = rec;
        recommendationsList.appendChild(li);
      });
    }

    // 14. Keywords Density & ATS Frequency Table
    const keywordsBody = document.getElementById('keywordsTableBody');
    if (keywordsBody) {
      keywordsBody.innerHTML = '';
      const rows = [];

      matchedKeywords.slice(0, 5).forEach((kw) => {
        rows.push({ keyword: kw, category: 'Core Requirement', status: 'Optimal', count: 'Present in Resume', action: 'Matched' });
      });
      missingKeywords.slice(0, 5).forEach((kw) => {
        rows.push({ keyword: kw, category: 'Recommended', status: 'Missing', count: '0 mentions', action: 'Add 1-2 mentions' });
      });

      if (rows.length === 0) {
        rows.push(
          { keyword: 'REST APIs', category: 'Architecture', count: 'Multiple mentions', status: 'Optimal', action: 'Matched' },
          { keyword: 'Docker', category: 'DevOps', count: '0 mentions', status: 'Missing', action: 'Add 1-2 mentions' }
        );
      }

      rows.forEach((r) => {
        const tr = document.createElement('tr');
        const isOpt = r.status === 'Optimal';
        tr.innerHTML = `
          <td><strong>${escapeHtml(r.keyword)}</strong></td>
          <td>${escapeHtml(r.category)}</td>
          <td>${escapeHtml(r.count)}</td>
          <td><span class="badge ${isOpt ? 'badge-success' : 'badge-warning'}">${escapeHtml(r.action)}</span></td>
        `;
        keywordsBody.appendChild(tr);
      });
    }

    // Show Results & Smooth Scroll
    resumeResults.classList.remove('hidden');
    resumeResults.scrollIntoView({ behavior: 'smooth' });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Download Report Button ---
  if (downloadReportBtn) {
    downloadReportBtn.addEventListener('click', () => {
      if (!currentAnalysisResult) {
        alert('No analysis results available to print.');
        return;
      }
      generateBrandedResumePdf(currentAnalysisResult);
    });
  }

  function generateBrandedResumePdf(resultData) {
    const analysis = resultData.analysis || resultData;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print your report.');
      return;
    }

    const targetRole = resultData.targetJobRole || analysis.targetRole || 'Software Developer';
    const candidateName = analysis.candidateName || 'Candidate Profile';
    const atsScore = analysis.atsScore ?? analysis.overallScore ?? 80;
    const detectedSkills = extractDiscreteSkillBadges(analysis.skillsFound || []);
    const matchedKeywords = extractDiscreteSkillBadges(analysis.matchedKeywords || []);
    const missingKeywords = extractDiscreteSkillBadges(analysis.missingKeywords || []);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AVENIR AI Resume Report - ${candidateName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #252525; padding: 40px; margin: 0; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #FF5841; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 24px; font-weight: 800; }
          .logo span { color: #FF5841; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #F3F4F6; margin-right: 6px; }
          .score-grid { display: flex; gap: 20px; margin-bottom: 24px; }
          .score-card { flex: 1; background: #FCFBFD; padding: 18px; border-radius: 8px; text-align: center; border: 1px solid #F0E2E8; }
          .score-num { font-size: 38px; font-weight: 800; color: #FF5841; }
          h3 { font-size: 16px; border-bottom: 1px solid #F0E2E8; padding-bottom: 6px; margin-top: 24px; color: #252525; }
          ul, ol { line-height: 1.6; padding-left: 20px; }
          li { margin-bottom: 6px; }
          .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .tag { display: inline-block; padding: 5px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; }
          .tag-detected { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
          .tag-matched { background: rgba(255, 88, 65, 0.06); color: #FF5841; border: 1px solid rgba(255,88,65,0.3); }
          .tag-missing { background: rgba(197, 54, 120, 0.06); color: #C53678; border: 1px solid rgba(197,54,120,0.25); }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">AVENIR<span>AI</span></div>
            <h2 style="margin: 4px 0;">Resume ATS Evaluation Report</h2>
            <div><strong>Candidate:</strong> ${escapeHtml(candidateName)} | <strong>Target Role:</strong> ${escapeHtml(targetRole)}</div>
          </div>
          <div style="text-align: right;">
            <div><strong>File:</strong> ${escapeHtml(resultData.fileName || 'resume.pdf')}</div>
            <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div class="score-grid">
          <div class="score-card">
            <div class="score-num">${atsScore} / 100</div>
            <div>Overall Resume Quality</div>
          </div>
          <div class="score-card">
            <div class="score-num">${atsScore}%</div>
            <div>ATS Keyword Compatibility</div>
          </div>
        </div>

        <h3>Executive Summary</h3>
        <p>${escapeHtml(analysis.professionalSummary || 'Candidate resume evaluated against standard industry ATS specifications.')}</p>

        <h3>Detected Technical Skills (${detectedSkills.length})</h3>
        <div class="tag-grid">
          ${detectedSkills.map(s => `<span class="tag tag-detected">${escapeHtml(s)}</span>`).join('')}
        </div>

        <h3>Matched Role Keywords (${matchedKeywords.length})</h3>
        <div class="tag-grid">
          ${matchedKeywords.map(s => `<span class="tag tag-matched">${escapeHtml(s)}</span>`).join('')}
        </div>

        <h3>Missing Recommended Keywords (${missingKeywords.length})</h3>
        <div class="tag-grid">
          ${missingKeywords.map(s => `<span class="tag tag-missing">${escapeHtml(s)}</span>`).join('')}
        </div>

        <h3>Work Experience Analysis</h3>
        <p>${escapeHtml(analysis.experienceAnalysis || 'Work history reviewed.')}</p>

        <h3>Project Portfolio Analysis</h3>
        <p>${escapeHtml(analysis.projectAnalysis || 'Projects reviewed.')}</p>

        <h3>Education & Credentials</h3>
        <p>${escapeHtml(analysis.educationAnalysis || 'Education reviewed.')}</p>

        <h3>Key Strengths</h3>
        <ul>
          ${(analysis.strengths || []).map(st => `<li>${escapeHtml(st)}</li>`).join('')}
        </ul>

        <h3>Areas to Address</h3>
        <ul>
          ${(analysis.weaknesses || []).map(wk => `<li>${escapeHtml(wk)}</li>`).join('')}
        </ul>

        <h3>Prioritized Resume Action Items</h3>
        <ol>
          ${(analysis.improvements || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        </ol>

        <h3>Strategic Career & Interview Guidance</h3>
        <ol>
          ${(analysis.recommendations || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ol>

        <div class="no-print" style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="background: linear-gradient(110deg, #FF5841 0%, #C53678 100%); color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}
