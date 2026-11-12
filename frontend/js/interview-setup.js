/**
 * AVENIR AI - Interview Setup Wizard Module
 * Coordinates the 5-step interactive interview configuration flow.
 */

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  initInterviewSetupWizard();
});

function initInterviewSetupWizard() {
  // Setup State Object
  const state = {
    step: 1,
    jobRole: 'Software Developer',
    interviewType: 'Technical Interview',
    difficulty: 'Medium',
    experienceLevel: 'Intermediate',
    questionCount: 10,
    timerEnabled: true,
    timerDuration: 180 // seconds
  };

  // Restore state from sessionStorage if available
  try {
    const saved = sessionStorage.getItem('avenirSetupState');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state, parsed);
      // Always start from step 1 on fresh page load; only restore data
      state.step = 1;
    }
  } catch (e) { /* ignore */ }

  // Step Elements
  const stepContents = [
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3'),
    document.getElementById('step4'),
    document.getElementById('step5')
  ];

  const indicators = [
    document.getElementById('indicator1'),
    document.getElementById('indicator2'),
    document.getElementById('indicator3'),
    document.getElementById('indicator4'),
    document.getElementById('indicator5')
  ];

  // Initialize category summary with the default/restored selection
  function initCategorySummary() {
    const summary = document.getElementById('categorySummary');
    const label = document.getElementById('categorySelectedLabel');
    if (summary && label && state.interviewType) {
      label.textContent = state.interviewType;
      summary.classList.add('visible');
    }
    // Also mark the matching option card as selected
    const categoryContainer = document.getElementById('categoryOptions');
    if (categoryContainer && state.interviewType) {
      categoryContainer.querySelectorAll('.option-card').forEach((c) => {
        if (c.getAttribute('data-category') === state.interviewType) {
          c.classList.add('selected');
        } else {
          c.classList.remove('selected');
        }
      });
    }
  }

  /**
   * Navigate to specific step (1 - 5)
   */
  function showStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 5) return;
    state.step = stepNumber;

    // Toggle step content visibility
    stepContents.forEach((stepEl, idx) => {
      if (!stepEl) return;
      if (idx + 1 === stepNumber) {
        stepEl.classList.remove('hidden');
        stepEl.classList.add('active');
      } else {
        stepEl.classList.add('hidden');
        stepEl.classList.remove('active');
      }
    });

    // Update step indicator status
    indicators.forEach((indEl, idx) => {
      if (!indEl) return;
      indEl.classList.remove('active', 'completed');
      if (idx + 1 === stepNumber) {
        indEl.classList.add('active');
      } else if (idx + 1 < stepNumber) {
        indEl.classList.add('completed');
      }
    });

    // Update connector lines status
    const lines = [
      document.getElementById('line1'),
      document.getElementById('line2'),
      document.getElementById('line3'),
      document.getElementById('line4')
    ];
    lines.forEach((lineEl, idx) => {
      if (!lineEl) return;
      if (idx + 1 < stepNumber) {
        lineEl.classList.add('completed');
      } else {
        lineEl.classList.remove('completed');
      }
    });

    // If step 5, update review summary display
    if (stepNumber === 5) {
      updateReviewSummary();
    }

    // Scroll to setup top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function nextStep() {
    // Validation before advancing
    if (state.step === 1) {
      if (!state.jobRole || state.jobRole.trim() === '') {
        if (typeof showToast === 'function') {
          showToast('Please select or specify a target job role.', 'warning');
        } else {
          alert('Please select or specify a target job role.');
        }
        return;
      }
    }
    if (state.step === 2) {
      if (!state.interviewType || state.interviewType.trim() === '') {
        if (typeof showToast === 'function') {
          showToast('Please select an interview category to continue.', 'warning');
        } else {
          alert('Please select an interview category.');
        }
        return;
      }
    }
    if (state.step === 3) {
      if (!state.difficulty || state.difficulty.trim() === '') {
        if (typeof showToast === 'function') {
          showToast('Please select a difficulty level.', 'warning');
        } else {
          alert('Please select a difficulty level.');
        }
        return;
      }
    }
    if (state.step === 4) {
      if (!state.experienceLevel || state.experienceLevel.trim() === '') {
        if (typeof showToast === 'function') {
          showToast('Please select your experience level.', 'warning');
        } else {
          alert('Please select your experience level.');
        }
        return;
      }
    }
    saveStateToStorage();
    showStep(state.step + 1);
  }

  function saveStateToStorage() {
    try {
      sessionStorage.setItem('avenirSetupState', JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function prevStep() {
    showStep(state.step - 1);
  }

  // --- Step 1: Job Role Selection ---
  const roleCards = document.querySelectorAll('.role-card');
  const customRoleBox = document.getElementById('customRoleBox');
  const customRoleInput = document.getElementById('customRoleInput');

  roleCards.forEach((card) => {
    card.addEventListener('click', () => {
      roleCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const role = card.getAttribute('data-role');
      if (role === 'Other') {
        if (customRoleBox) customRoleBox.classList.remove('hidden');
        state.jobRole = customRoleInput ? customRoleInput.value.trim() : 'Software Developer';
        customRoleInput?.focus();
      } else {
        if (customRoleBox) customRoleBox.classList.add('hidden');
        state.jobRole = role;
      }
    });
  });

  if (customRoleInput) {
    customRoleInput.addEventListener('input', () => {
      const activeCard = document.querySelector('.role-card.selected');
      if (activeCard && activeCard.getAttribute('data-role') === 'Other') {
        state.jobRole = customRoleInput.value.trim();
      }
    });
  }

  // --- Step 2: Category Selection ---
  const categoryContainer = document.getElementById('categoryOptions');
  const categorySummary = document.getElementById('categorySummary');
  const categorySelectedLabel = document.getElementById('categorySelectedLabel');

  function updateCategorySummary(value) {
    if (categorySummary && categorySelectedLabel && value) {
      categorySelectedLabel.textContent = value;
      categorySummary.classList.add('visible');
    }
  }

  if (categoryContainer) {
    categoryContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.option-card');
      if (!card) return;

      categoryContainer.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const category = card.getAttribute('data-category');
      if (category) {
        state.interviewType = category;
        updateCategorySummary(category);
        saveStateToStorage();
      }
    });
  }

  // --- Step 3: Difficulty Selection ---
  const difficultyContainer = document.getElementById('difficultyOptions');
  if (difficultyContainer) {
    difficultyContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.option-card');
      if (!card) return;

      difficultyContainer.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const diff = card.getAttribute('data-difficulty');
      if (diff) {
        state.difficulty = diff;
      }
    });
  }

  // --- Step 4: Experience Level Selection ---
  const experienceContainer = document.getElementById('experienceOptions');
  if (experienceContainer) {
    experienceContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.option-card');
      if (!card) return;

      experienceContainer.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const exp = card.getAttribute('data-experience');
      if (exp) {
        state.experienceLevel = exp;
      }
    });
  }

  // --- Step 5: Parameters & Review ---
  function updateReviewSummary() {
    const roleEl = document.getElementById('summaryRole');
    if (roleEl) roleEl.textContent = state.jobRole;

    const catEl = document.getElementById('summaryCategory');
    if (catEl) catEl.textContent = state.interviewType;

    const diffEl = document.getElementById('summaryDifficulty');
    if (diffEl) diffEl.textContent = state.difficulty;

    const expEl = document.getElementById('summaryExperience');
    if (expEl) expEl.textContent = state.experienceLevel;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Question Count buttons
  const countButtons = document.querySelectorAll('.count-btn');
  countButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      countButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      const count = parseInt(btn.getAttribute('data-count'), 10);
      if (!isNaN(count)) {
        state.questionCount = count;
        const hiddenSelect = document.getElementById('questionCountSelect');
        if (hiddenSelect) hiddenSelect.value = count;
      }
    });
  });

  // Timer controls
  const enableTimerCheckbox = document.getElementById('enableTimer');
  const timerDurationSelect = document.getElementById('timerDuration');
  const timerDurationRow = document.getElementById('timerDurationRow');

  if (enableTimerCheckbox) {
    enableTimerCheckbox.addEventListener('change', () => {
      state.timerEnabled = enableTimerCheckbox.checked;
      if (timerDurationRow) {
        timerDurationRow.style.opacity = state.timerEnabled ? '1' : '0.4';
        timerDurationRow.style.pointerEvents = state.timerEnabled ? 'auto' : 'none';
      }
    });
  }

  if (timerDurationSelect) {
    timerDurationSelect.addEventListener('change', () => {
      const duration = parseInt(timerDurationSelect.value, 10);
      if (!isNaN(duration)) {
        state.timerDuration = duration;
      }
    });
  }

  // Step Navigation Buttons
  const step1NextBtn = document.getElementById('step1NextBtn');
  if (step1NextBtn) step1NextBtn.addEventListener('click', nextStep);

  const step2BackBtn = document.getElementById('step2BackBtn');
  if (step2BackBtn) step2BackBtn.addEventListener('click', prevStep);
  const step2NextBtn = document.getElementById('step2NextBtn');
  if (step2NextBtn) step2NextBtn.addEventListener('click', nextStep);

  const step3BackBtn = document.getElementById('step3BackBtn');
  if (step3BackBtn) step3BackBtn.addEventListener('click', prevStep);
  const step3NextBtn = document.getElementById('step3NextBtn');
  if (step3NextBtn) step3NextBtn.addEventListener('click', nextStep);

  const step4BackBtn = document.getElementById('step4BackBtn');
  if (step4BackBtn) step4BackBtn.addEventListener('click', prevStep);
  const step4NextBtn = document.getElementById('step4NextBtn');
  if (step4NextBtn) step4NextBtn.addEventListener('click', nextStep);

  const step5BackBtn = document.getElementById('step5BackBtn');
  if (step5BackBtn) step5BackBtn.addEventListener('click', prevStep);

  // Step Indicators Direct Click
  indicators.forEach((indicator, index) => {
    if (!indicator) return;
    indicator.addEventListener('click', () => {
      const targetStep = index + 1;
      // Allow clicking previously visited steps or next valid step
      if (targetStep < state.step || targetStep === state.step + 1) {
        showStep(targetStep);
      }
    });
  });

  // Launch Interview Button — with pre-flight validation and duplicate-submit guard
  const startInterviewBtn = document.getElementById('startInterviewBtn');
  let isSubmitting = false; // Guard against double-click

  if (startInterviewBtn) {
    startInterviewBtn.addEventListener('click', async () => {
      // Prevent duplicate submissions
      if (isSubmitting) return;

      const tClick = performance.now();
      const clickTimestamp = Date.now();
      console.log('[PERFORMANCE][1] Start Interview button clicked at: 0 ms');

      // ── Pre-flight frontend validation (specific messages) ──────────────
      if (!state.jobRole || state.jobRole.trim().length < 2) {
        showToast('Please select or enter a job role before starting.', 'warning');
        showStep(1);
        return;
      }
      if (!state.interviewType || state.interviewType.trim() === '') {
        showToast('Please select an interview category before starting.', 'warning');
        showStep(2);
        return;
      }
      if (!state.difficulty || state.difficulty.trim() === '') {
        showToast('Please select a difficulty level before starting.', 'warning');
        showStep(3);
        return;
      }
      if (!state.experienceLevel || state.experienceLevel.trim() === '') {
        showToast('Please select your experience level before starting.', 'warning');
        showStep(4);
        return;
      }
      if (!state.questionCount || state.questionCount < 1 || state.questionCount > 20) {
        showToast('Please select a valid number of questions (1 – 20).', 'warning');
        return;
      }

      // ── Lock submission ─────────────────────────────────────────────────
      isSubmitting = true;
      startInterviewBtn.disabled = true;
      const originalHtml = startInterviewBtn.innerHTML;
      startInterviewBtn.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Preparing Interview...
        </span>
      `;

      console.log('[AVENIR AI] Starting interview with config:', {
        jobRole: state.jobRole,
        interviewType: state.interviewType,
        difficulty: state.difficulty,
        experienceLevel: state.experienceLevel,
        questionCount: state.questionCount,
        timerEnabled: state.timerEnabled,
        timerDuration: state.timerDuration,
      });

      try {
        const payload = {
          jobRole: state.jobRole,
          interviewType: state.interviewType,
          difficulty: state.difficulty,
          experienceLevel: state.experienceLevel,
          questionCount: state.questionCount
        };

        const tReqStart = performance.now();
        console.log(`[PERFORMANCE][2] Request sent to backend at: ${Math.round(tReqStart - tClick)} ms`);

        const result = await generateQuestions(payload);

        const tResReceived = performance.now();
        const serverRoundtrip = Math.round(tResReceived - tReqStart);
        console.log(`[PERFORMANCE][3] Backend response received in: ${serverRoundtrip} ms`);

        if (!result || !result.interviewId) {
          throw new Error('Interview initialization failed. No session ID returned.');
        }

        console.log('[AVENIR AI] Interview session created:', result.interviewId,
          '| Questions:', result.questions?.length || 0);

        // Store interview session in sessionStorage for the interview room
        const sessionPayload = {
          interviewId: result.interviewId,
          questions: result.questions || [],
          config: {
            jobRole: state.jobRole,
            interviewType: state.interviewType,
            difficulty: state.difficulty,
            experienceLevel: state.experienceLevel,
            questionCount: state.questionCount,
            timerEnabled: state.timerEnabled,
            timerDuration: state.timerDuration
          },
          _performanceTiming: {
            tClick,
            clickTimestamp,
            preflightTime: Math.round(tReqStart - tClick),
            serverRoundtrip,
            backendMetrics: result._performance || null
          }
        };

        sessionStorage.setItem('avenir_interview_data', JSON.stringify(sessionPayload));
        // Clear setup state so next session starts fresh
        sessionStorage.removeItem('avenirSetupState');

        // Navigate to interview room
        window.location.href = 'interview-room.html';

      } catch (error) {
        console.error('[AVENIR AI] Interview start failed:', error.message);

        // Reset submission guard
        isSubmitting = false;
        startInterviewBtn.disabled = false;
        startInterviewBtn.innerHTML = `
          <span>Retry Starting Interview</span>
          <i data-lucide="refresh-cw"></i>
        `;
        if (window.lucide) window.lucide.createIcons();

        // User-friendly message explaining their selections are preserved
        let userMsg = error.message || 'AI service is temporarily busy. Your progress has been saved. Please try again shortly.';
        if (userMsg.includes('503') || userMsg.includes('busy') || userMsg.includes('demand') || userMsg.includes('failed')) {
          userMsg = 'AI service is temporarily busy. Your progress has been saved. Please try again shortly.';
        }

        // Show single clear notification
        showToast(userMsg, 'warning', 6000);
      }
    });
  }

  // Initialize wizard state visuals
  showStep(1);
  initCategorySummary();

  // Expose showStep globally so Edit buttons in Step 5 Review can jump back
  initInterviewSetupWizard._showStep = showStep;
}
