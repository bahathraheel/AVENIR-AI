// AVENIR AI - Learning Resources Module
// Generates and displays personalized 7-day learning roadmaps based on interview performance

document.addEventListener('DOMContentLoaded', async () => {
  // Authentication check
  if (typeof checkAuthState === 'function') await checkAuthState();
  if (typeof waitForAuthInit === 'function') {
    const user = await waitForAuthInit();
    if (!user) return;
  }

  // DOM Elements
  const roadmapContent = document.getElementById('roadmapContent');
  const generateBtn = document.getElementById('generatePlanBtn');
  const emptyGenerateBtn = document.getElementById('emptyGenerateBtn');
  const retryGenerateBtn = document.getElementById('retryGenerateBtn');
  const emptyState = document.getElementById('emptyState');
  const errorState = document.getElementById('learningErrorState');
  const errorMessageEl = document.getElementById('learningErrorMessage');
  const generationModal = document.getElementById('generationModalOverlay');

  let roadmapData = null;
  let completedTopics = new Set();
  let isGenerating = false;

  // Initialize
  await loadExistingRoadmap();
  loadLearningJobs();
  initSidebar();

  // Event Listeners
  if (generateBtn) generateBtn.addEventListener('click', () => generatePlan());
  if (emptyGenerateBtn) emptyGenerateBtn.addEventListener('click', () => generatePlan());
  if (retryGenerateBtn) retryGenerateBtn.addEventListener('click', () => generatePlan());

  /**
   * 1. Load Existing Roadmap from Backend/Firestore
   */
  async function loadExistingRoadmap() {
    showLoading(true);
    hideError();

    try {
      // Retrieve via backend API
      let progressRes = null;
      if (typeof getLearningProgress === 'function') {
        try {
          progressRes = await getLearningProgress();
        } catch (apiErr) {
          console.warn('[Learning] getLearningProgress API error, falling back to direct Firestore:', apiErr.message);
        }
      }

      // If backend returned valid data
      if (progressRes && (progressRes.topics || progressRes.roadmap)) {
        handleRoadmapLoaded(progressRes);
        return;
      }

      // Fallback: direct Firestore read
      const user = firebase.auth().currentUser;
      if (user && typeof db !== 'undefined' && db) {
        const docSnap = await db.collection('learningProgress').doc(user.uid).get();
        if (docSnap.exists) {
          const docData = docSnap.data();
          handleRoadmapLoaded(docData);
          return;
        }
      }

      // No roadmap exists yet -> show empty state & set zero statistics
      showEmptyState();
    } catch (err) {
      console.error('[Learning] Failed to load existing roadmap:', err);
      showEmptyState();
    } finally {
      showLoading(false);
    }
  }

  function handleRoadmapLoaded(data) {
    roadmapData = data.roadmap || data;
    completedTopics = new Set(data.completedTopics || []);

    const topics = roadmapData.topics || [];
    if (topics.length > 0) {
      if (emptyState) emptyState.style.display = 'none';
      renderRoadmap(roadmapData);
    } else {
      showEmptyState();
    }
  }

  function showEmptyState() {
    if (roadmapContent) roadmapContent.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    updateProgress(0, 0);
  }

  function showError(msg) {
    if (errorState) {
      errorState.style.display = 'block';
      if (errorMessageEl) errorMessageEl.textContent = msg || 'Failed to generate learning plan. Please try again.';
      errorState.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideError() {
    if (errorState) errorState.style.display = 'none';
  }

  /**
   * 2. Stepped Generation Animation Helper
   */
  async function animateStage(stageNum) {
    for (let i = 1; i <= 4; i++) {
      const stageEl = document.getElementById(`stage${i}`);
      if (!stageEl) continue;
      const icon = stageEl.querySelector('.stage-icon');
      const text = stageEl.querySelector('.stage-text');

      if (i < stageNum) {
        // Completed
        stageEl.style.background = '#ECFDF5';
        if (icon) {
          icon.style.background = '#10B981';
          icon.style.color = '#FFFFFF';
          icon.innerHTML = '✓';
        }
        if (text) text.style.color = '#065F46';
      } else if (i === stageNum) {
        // Active
        stageEl.style.background = 'var(--color-primary-light, #FFF0ED)';
        if (icon) {
          icon.style.background = 'var(--color-primary, #FF5841)';
          icon.style.color = '#FFFFFF';
          icon.innerHTML = '•';
        }
        if (text) {
          text.style.color = 'var(--color-primary, #FF5841)';
          text.style.fontWeight = '700';
        }
      } else {
        // Pending
        stageEl.style.background = '#F9FAFB';
        if (icon) {
          icon.style.background = '#E5E7EB';
          icon.style.color = '#6B7280';
          icon.innerHTML = String(i);
        }
        if (text) {
          text.style.color = '#6B7280';
          text.style.fontWeight = '500';
        }
      }
    }
  }

  /**
   * 3. Generate Learning Plan
   */
  async function generatePlan() {
    if (isGenerating) return; // Prevent duplicate requests
    isGenerating = true;
    hideError();

    // Disable buttons
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Generating...</span>';
    }
    if (emptyGenerateBtn) {
      emptyGenerateBtn.disabled = true;
      emptyGenerateBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Generating...</span>';
    }

    // Show stepped generation modal
    if (generationModal) {
      generationModal.style.display = 'flex';
      animateStage(1);
    }

    try {
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('Please sign in to generate a learning plan.');

      // Stage 1: Analyze interview performance & weak areas
      animateStage(1);
      await new Promise(r => setTimeout(r, 600));

      // Fetch user profile from Firestore or API
      let userProfile = {};
      try {
        if (typeof db !== 'undefined' && db) {
          const profileDoc = await db.collection('users').doc(user.uid).get();
          if (profileDoc.exists) userProfile = profileDoc.data();
        }
      } catch (_) {}

      // Stage 2: Creating personalized 7-day roadmap with Gemini AI
      animateStage(2);

      const requestPayload = {
        jobRole: userProfile.preferredRole || 'Software Developer',
        experienceLevel: userProfile.experienceLevel || 'Mid-Level',
        interviewCategory: 'Technical Interview',
      };

      // Call backend API
      const result = await generateLearningPlan(requestPayload);

      // Stage 3: Preparing curated resources & practice drills
      animateStage(3);
      await new Promise(r => setTimeout(r, 600));

      // Stage 4: Saving learning plan to your profile
      animateStage(4);
      await new Promise(r => setTimeout(r, 500));

      if (!result || (!result.topics && (!result.roadmap || !result.roadmap.topics))) {
        throw new Error('Received incomplete roadmap from AI service. Please try again.');
      }

      roadmapData = result.roadmap || result;
      completedTopics = new Set(result.completedTopics || []);

      // Render new roadmap
      if (emptyState) emptyState.style.display = 'none';
      renderRoadmap(roadmapData);

      showToast('7-Day Learning Roadmap generated successfully!', 'success');

      // Dismiss modal after brief success display
      setTimeout(() => {
        if (generationModal) generationModal.style.display = 'none';
      }, 700);

    } catch (err) {
      console.error('[Learning] Plan generation failed:', err);
      if (generationModal) generationModal.style.display = 'none';
      
      const errorMsg = err.message || 'Failed to generate learning plan. Please try again.';
      showError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      isGenerating = false;
      showLoading(false);
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<i data-lucide="sparkles"></i><span>Generate Learning Plan</span>';
      }
      if (emptyGenerateBtn) {
        emptyGenerateBtn.disabled = false;
        emptyGenerateBtn.innerHTML = '<i data-lucide="sparkles"></i><span>Generate My Learning Plan</span>';
      }
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }
  }

  /**
   * 4. Render Personalized Learning Roadmap
   */
  function renderRoadmap(data) {
    if (!roadmapContent) return;

    const topics = data.topics || (data.roadmap && data.roadmap.topics) || [];
    const sevenDayPlan = data.sevenDayPlan || (data.roadmap && data.roadmap.sevenDayPlan) || data.weeklyPlan || (data.roadmap && data.roadmap.weeklyPlan) || [];
    const objectives = data.objectives || (data.roadmap && data.roadmap.objectives) || [];
    const totalTopics = topics.length;

    // Calculate initial completed topics count
    const completedCount = topics.filter((_, i) => completedTopics.has(i.toString())).length;
    updateProgress(completedCount, totalTopics);

    let html = '';

    // Plan Meta & Strategic Objectives Header
    html += `
      <div class="dashboard-panel" style="margin-bottom: 24px; padding: 22px 26px; border-left: 4px solid var(--color-primary, #FF5841); background: #FFFFFF;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="badge badge-primary">${escapeHtml(data.jobRole || 'Software Developer')}</span>
              <span class="badge badge-secondary" style="background: var(--color-secondary-light, #F9EAF1); color: var(--color-secondary, #C53678); font-weight: 700;">${escapeHtml(data.experienceLevel || 'Mid-Level')}</span>
              <span class="badge" style="background: #F3F4F6; color: #4B5563;">7-Day Mastery Track</span>
            </div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #252525;">Your Personalized Interview Preparation Plan</h2>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="regeneratePlanBtn" style="flex-shrink: 0;">
            <i data-lucide="refresh-cw"></i>
            <span>Regenerate Plan</span>
          </button>
        </div>

        ${objectives.length > 0 ? `
          <div style="background: #F9FAFB; padding: 14px 18px; border-radius: 10px; border: 1px solid #E5E7EB;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; font-weight: 700;">Core Learning Objectives:</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${objectives.map(obj => `
                <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: #374151;">
                  <i data-lucide="target" style="width: 16px; height: 16px; color: var(--color-primary, #FF5841); flex-shrink: 0; margin-top: 2px;"></i>
                  <span>${escapeHtml(obj)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Section 1: Targeted Skill Mastery Topics
    if (topics.length > 0) {
      html += `
        <div class="section-title-row" style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
          <h3 class="section-main-heading">
            <i data-lucide="book-open" style="color:var(--color-primary,#FF5841);"></i>
            <span>Targeted Skill Mastery Topics</span>
          </h3>
          <span class="badge badge-primary">${totalTopics} Topics</span>
        </div>
      `;

      html += topics.map((topic, i) => {
        const isCompleted = completedTopics.has(i.toString());
        const priority = topic.priority || 'High';
        const priorityClass = priority.toLowerCase() === 'high'
          ? 'badge-priority-high'
          : priority.toLowerCase() === 'low'
            ? 'badge-priority-low'
            : 'badge-priority-medium';

        return `
          <article class="topic-card ${isCompleted ? 'completed' : ''}" id="topicCard_${i}">
            <div class="topic-header-row">
              <div class="topic-info-group" style="display: flex; align-items: flex-start; gap: 14px;">
                <label class="topic-checkbox-control" style="cursor: pointer; margin-top: 2px;" aria-label="Mark topic as completed">
                  <input type="checkbox" class="topic-checkbox" data-index="${i}" ${isCompleted ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: var(--color-primary, #FF5841); cursor: pointer;">
                </label>
                <div class="topic-title-area">
                  <h3 class="topic-heading" style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: #252525;">${escapeHtml(topic.name || topic.title || 'Core Competency Topic')}</h3>
                  <span class="topic-category-badge" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #F3F4F6; color: #4B5563; font-weight: 600;">${escapeHtml(topic.category || 'Interview Preparation')}</span>
                </div>
              </div>
              <div class="topic-badges-group">
                <span class="${priorityClass}">${escapeHtml(priority)} Priority</span>
              </div>
            </div>

            <p class="topic-desc-text" style="margin: 12px 0 16px 0; font-size: 14px; color: #4B5563; line-height: 1.6;">${escapeHtml(topic.description || 'Master core foundational principles, performance trade-offs, and practical execution.')}</p>

            <div class="topic-content-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #F3F4F6;">
              <!-- Recommended Resources -->
              <div class="resources-content-col">
                <div class="content-block-header" style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; color: #252525; margin-bottom: 8px;">
                  <i data-lucide="book-open" style="width: 15px; height: 15px; color: var(--color-primary, #FF5841);"></i>
                  <span>Recommended Resources</span>
                </div>
                <div class="resource-items-list" style="display: flex; flex-direction: column; gap: 6px;">
                  ${(topic.resources && topic.resources.length > 0) ? topic.resources.map(r => `
                    <a href="https://www.google.com/search?q=${encodeURIComponent(r)}" target="_blank" rel="noopener" class="resource-row-link" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 12px; color: #374151; text-decoration: none;" title="Search resource">
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90%;">${escapeHtml(r)}</span>
                      <i data-lucide="external-link" style="width: 12px; height: 12px; color: #9CA3AF; flex-shrink: 0;"></i>
                    </a>
                  `).join('') : '<span style="font-size:12px; color:#9CA3AF;">Official framework documentation</span>'}
                </div>
              </div>

              <!-- Practice Exercises -->
              <div class="exercises-content-col">
                <div class="content-block-header" style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; color: #252525; margin-bottom: 8px;">
                  <i data-lucide="terminal" style="width: 15px; height: 15px; color: var(--color-secondary, #C53678);"></i>
                  <span>Hands-on Exercises</span>
                </div>
                <div class="exercise-items-list" style="display: flex; flex-direction: column; gap: 6px;">
                  ${(topic.exercises && topic.exercises.length > 0) ? topic.exercises.map(e => `
                    <div class="exercise-row-item" style="display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 12px; color: #374151;">
                      <i data-lucide="code" style="width: 13px; height: 13px; color: var(--color-secondary, #C53678); flex-shrink: 0; margin-top: 2px;"></i>
                      <span>${escapeHtml(e)}</span>
                    </div>
                  `).join('') : '<span style="font-size:12px; color:#9CA3AF;">Live coding and algorithmic problem drills</span>'}
                </div>
              </div>
            </div>

            ${topic.interviewTask ? `
              <div style="margin-top: 14px; padding: 10px 14px; background: var(--color-primary-light, #FFF0ED); border-radius: 8px; border-left: 3px solid var(--color-primary, #FF5841); font-size: 13px; color: #252525;">
                <strong style="color: var(--color-primary, #FF5841);">Mock Interview Task:</strong> ${escapeHtml(topic.interviewTask)}
              </div>
            ` : ''}
          </article>
        `;
      }).join('');
    }

    // Section 2: 7-Day Guided Interview Preparation Roadmap
    if (sevenDayPlan.length > 0) {
      html += `
        <section class="seven-day-plan-section" style="margin-top: 36px;">
          <div class="section-title-row" style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
            <h3 class="section-main-heading">
              <i data-lucide="calendar" style="color:var(--color-primary,#FF5841);"></i>
              <span>7-Day Guided Interview Preparation Roadmap</span>
            </h3>
            <span class="badge badge-primary">Day-by-Day Schedule</span>
          </div>
          <div class="days-cards-grid">
      `;

      html += sevenDayPlan.map((d) => {
        const dayKey = `day_${d.day}`;
        const isDayDone = completedTopics.has(dayKey);
        const statusClass = isDayDone ? 'day-status-completed' : (d.status === 'completed' ? 'day-status-completed' : 'day-status-upcoming');
        const statusLabel = isDayDone ? 'Completed' : (d.status === 'completed' ? 'Completed' : 'Upcoming');

        return `
          <div class="day-card ${isDayDone ? 'completed-day' : ''}" id="dayCard_${d.day}" style="background: #FFFFFF; border: 1.5px solid ${isDayDone ? '#10B981' : '#E5E7EB'}; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px;">
            <div class="day-card-header" style="display: flex; justify-content: space-between; align-items: center;">
              <span class="day-number-badge" style="font-size: 12px; font-weight: 800; color: var(--color-primary, #FF5841); background: var(--color-primary-light, #FFF0ED); padding: 4px 10px; border-radius: 20px;">Day ${d.day}</span>
              <span class="day-status-badge ${statusClass}" id="dayBadge_${d.day}">${statusLabel}</span>
            </div>
            <h4 class="day-focus-title" style="margin: 0; font-size: 15px; font-weight: 700; color: #252525;">${escapeHtml(d.focus || `Day ${d.day} Study Target`)}</h4>
            
            <div class="day-goals-list" style="display: flex; flex-direction: column; gap: 6px;">
              ${(d.goals || []).map(g => `
                <div class="day-goal-item" style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #4B5563;">
                  <i data-lucide="check-circle" style="width: 14px; height: 14px; color: ${isDayDone ? '#10B981' : 'var(--color-primary, #FF5841)'}; flex-shrink: 0; margin-top: 1px;"></i>
                  <span>${escapeHtml(g)}</span>
                </div>
              `).join('')}
            </div>

            ${d.practiceTask ? `
              <div style="font-size: 12px; color: #374151; background: #F9FAFB; padding: 8px 10px; border-radius: 6px; border: 1px solid #E5E7EB;">
                <strong>Drill:</strong> ${escapeHtml(d.practiceTask)}
              </div>
            ` : ''}

            <label style="display:flex; align-items:center; gap:8px; margin-top:auto; padding-top:10px; border-top:1px solid #EEEEEE; font-size:12px; font-weight:600; cursor:pointer; color:#252525;">
              <input type="checkbox" class="day-checkbox" data-day="${d.day}" ${isDayDone ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--color-primary, #FF5841); cursor:pointer;">
              <span>Mark Day ${d.day} Complete</span>
            </label>
          </div>
        `;
      }).join('');

      html += `</div></section>`;
    }

    // AI Coaching Note
    html += `
      <div class="ai-disclaimer" style="margin-top: 28px;">
        <i data-lucide="info" class="disclaimer-icon"></i>
        <span>These learning recommendations are personalized by Gemini AI based on your actual interview evaluations and target role requirements. Complete drills daily to optimize interview readiness.</span>
      </div>
    `;

    roadmapContent.innerHTML = html;

    // Refresh icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }

    // Attach Regenerate Button listener
    const regenBtn = document.getElementById('regeneratePlanBtn');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => generatePlan());
    }

    // Attach Topic Checkboxes Handlers
    document.querySelectorAll('.topic-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = e.target.dataset.index;
        const card = document.getElementById(`topicCard_${idx}`);
        if (e.target.checked) {
          completedTopics.add(idx);
          if (card) card.classList.add('completed');
        } else {
          completedTopics.delete(idx);
          if (card) card.classList.remove('completed');
        }

        // Recalculate statistics immediately
        if (roadmapData && roadmapData.topics) {
          const total = roadmapData.topics.length;
          const completed = roadmapData.topics.filter((_, i) => completedTopics.has(i.toString())).length;
          updateProgress(completed, total);
        }

        // Persist to backend in background
        saveProgress();
      });
    });

    // Attach Day Checkboxes Handlers
    document.querySelectorAll('.day-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const day = e.target.dataset.day;
        const badge = document.getElementById(`dayBadge_${day}`);
        const dayCard = document.getElementById(`dayCard_${day}`);
        const dayKey = `day_${day}`;

        if (e.target.checked) {
          completedTopics.add(dayKey);
          if (badge) {
            badge.className = 'day-status-badge day-status-completed';
            badge.textContent = 'Completed';
          }
          if (dayCard) dayCard.style.borderColor = '#10B981';
        } else {
          completedTopics.delete(dayKey);
          if (badge) {
            badge.className = 'day-status-badge day-status-upcoming';
            badge.textContent = 'Upcoming';
          }
          if (dayCard) dayCard.style.borderColor = '#E5E7EB';
        }

        // Persist to backend in background
        saveProgress();
      });
    });
  }

  /**
   * 5. Calculate and Update Progress Statistics
   * Formula: (Completed topics / Total topics) * 100
   */
  function updateProgress(completed, total) {
    const validTotal = typeof total === 'number' && total >= 0 ? total : 0;
    const validCompleted = typeof completed === 'number' && completed >= 0 ? Math.min(completed, validTotal) : 0;

    const pct = validTotal > 0 ? Math.round((validCompleted / validTotal) * 100) : 0;
    const inProgress = Math.max(0, validTotal > 0 && validCompleted < validTotal ? 1 : 0);
    const upcoming = Math.max(0, validTotal - validCompleted - inProgress);

    const pctEl = document.getElementById('roadmapProgressPct');
    if (pctEl) pctEl.textContent = `${pct}%`;

    const completedEl = document.getElementById('completedTopicsCount');
    if (completedEl) completedEl.textContent = validCompleted;

    const inProgressEl = document.getElementById('inProgressTopicsCount');
    if (inProgressEl) inProgressEl.textContent = inProgress;

    const upcomingEl = document.getElementById('upcomingTopicsCount');
    if (upcomingEl) upcomingEl.textContent = upcoming;

    const ratioEl = document.getElementById('roadmapProgressRatio');
    if (ratioEl) ratioEl.textContent = `${validCompleted} of ${validTotal} Topics Mastered`;

    const barEl = document.getElementById('roadmapProgressBar');
    if (barEl) barEl.style.width = `${pct}%`;
  }

  /**
   * 6. Save Progress to Firestore / Backend
   */
  async function saveProgress() {
    try {
      const completedList = Array.from(completedTopics);
      if (typeof updateLearningProgress === 'function') {
        await updateLearningProgress({
          completedTopics: completedList,
          updatedAt: new Date().toISOString()
        });
      } else {
        const user = firebase.auth().currentUser;
        if (user && typeof db !== 'undefined' && db) {
          await db.collection('learningProgress').doc(user.uid).set({
            completedTopics: completedList,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    } catch (err) {
      console.warn('[Learning] Failed to save progress in Firestore:', err.message);
    }
  }

  /**
   * Helpers
   */
  function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function showLoading(show) {
    const l = document.getElementById('loadingOverlay') || document.querySelector('.loading-overlay');
    if (l) l.style.display = show ? 'flex' : 'none';
  }

  async function loadLearningJobs() {
    const listEl = document.getElementById('learningJobsList');
    if (!listEl) return;

    try {
      if (typeof getJobs === 'function') {
        const res = await getJobs({ limit: 6 });
        const jobs = (res && res.jobs) || [];

        if (jobs.length === 0) {
          listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);">No job matches available currently.</div>';
          return;
        }

        listEl.innerHTML = jobs.map(job => `
          <a href="${job.url}" target="_blank" rel="noopener" class="job-card-item">
            <div class="job-info">
              <div class="job-title">${escapeHtml(job.title)}</div>
              <div class="job-meta">
                <span>${escapeHtml(job.company)}</span>
                <span>&bull;</span>
                <span>${escapeHtml(job.location)}</span>
                ${job.remote ? '<span class="job-badge-remote">Remote</span>' : ''}
                ${job.tags && job.tags.length ? `<span>&bull;</span><span>${job.tags.slice(0, 3).map(t => escapeHtml(t)).join(', ')}</span>` : ''}
              </div>
            </div>
            <div class="job-apply-link">
              <span>Apply Now</span>
              <i data-lucide="arrow-up-right" style="width:14px;height:14px;"></i>
            </div>
          </a>
        `).join('');

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      }
    } catch (err) {
      console.warn('[Learning] Could not load career matches:', err.message);
    }
  }

  function initSidebar() {
    const toggle = document.getElementById('sidebarToggle') || document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.dashboard-sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }
  }
});
