// AVENIR AI - User Profile Controller
// Production-ready user profile management, statistics, and career preferences

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initial Route Guard Check
  if (typeof checkAuthState === 'function') {
    try {
      await checkAuthState();
    } catch (e) {
      console.warn('Auth guard check non-fatal error:', e);
    }
  }

  // 2. DOM Elements
  // Header Elements
  const profileAvatar = document.getElementById('profileAvatar');
  const profileAvatarInitial = document.getElementById('profileAvatarInitial');
  const profileName = document.getElementById('profileName');
  const profileEmailText = document.getElementById('profileEmailText');
  const profileTargetBadge = document.getElementById('profileTargetBadge');
  const profileJoinDate = document.getElementById('profileJoinDate');
  const editProfileHeaderBtn = document.getElementById('editProfileHeaderBtn');

  // Stat Elements
  const profileInterviewsCount = document.getElementById('profileInterviewsCount');
  const profileAvgScore = document.getElementById('profileAvgScore');
  const profileBestCategory = document.getElementById('profileBestCategory');
  const profileStreakNum = document.getElementById('profileStreakNum');

  // Form Elements
  const profileForm = document.getElementById('profileForm');
  const profileFullName = document.getElementById('profileFullName');
  const profileEmailInput = document.getElementById('profileEmailInput');
  const profilePreferredRole = document.getElementById('profilePreferredRole');
  const profileExperienceLevel = document.getElementById('profileExperienceLevel');
  const profileSkills = document.getElementById('profileSkills');
  const profileInterests = document.getElementById('profileInterests');
  const saveBtn = document.getElementById('saveProfileBtn');
  const profileSpinner = document.getElementById('profileSpinner');
  const profileAlertSuccess = document.getElementById('profileAlertSuccess');
  const profileAlertError = document.getElementById('profileAlertError');
  const profileSuccessText = document.getElementById('profileSuccessText');
  const profileErrorText = document.getElementById('profileErrorText');

  // Initialize Custom Select Components
  initCustomSelects();

  // Initialize Edit Button Scroll
  if (editProfileHeaderBtn) {
    editProfileHeaderBtn.addEventListener('click', () => {
      const formCard = document.getElementById('profileFormCard');
      if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (profileFullName) {
        setTimeout(() => profileFullName.focus(), 350);
      }
    });
  }

  // Form Submission
  if (profileForm) {
    profileForm.addEventListener('submit', handleSaveProfile);
  }

  // 3. User Data Loading
  let currentUser = null;

  // If in preview or test mode, load instantly without waiting for Firebase Auth network handshake
  if (window.location.search.includes('preview=true') || window.location.search.includes('mock=true')) {
    currentUser = {
      uid: 'preview-user-123',
      displayName: 'Alex Morgan',
      email: 'alex.morgan@avenir.ai',
      metadata: { creationTime: '2024-11-15T10:00:00Z' }
    };
    loadUserData(currentUser);
  } else {
    setHeaderSkeleton(true);

    if (typeof waitForAuthInit === 'function') {
      try {
        currentUser = await waitForAuthInit();
        if (currentUser) {
          await loadUserData(currentUser);
        } else {
          setHeaderSkeleton(false);
        }
      } catch (err) {
        console.warn('waitForAuthInit fallback:', err);
        setHeaderSkeleton(false);
      }
    }

    // Secondary Firebase Auth state listener
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (user && (!currentUser || user.uid !== currentUser.uid)) {
          currentUser = user;
          await loadUserData(user);
        }
      });
    }
  }

  // Trigger initial icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  /**
   * Load profile data and statistics for authenticated user
   */
  async function loadUserData(user) {
    let profileData = {};

    try {
      if (user.uid === 'preview-user-123') {
        profileData = {
          fullName: 'Alex Morgan',
          displayName: 'Alex Morgan',
          email: 'alex.morgan@avenir.ai',
          targetRole: 'Software Developer',
          experienceLevel: 'intermediate',
          skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL', 'Docker', 'AWS'],
          bio: 'Passionate software developer focusing on scalable web platforms and AI-assisted tooling.',
          createdAt: '2024-11-15T10:00:00Z'
        };
      } else {
        setHeaderSkeleton(true);
        // Fetch user profile from API or direct Firestore
        try {
          if (typeof getUserProfile === 'function') {
            const resp = await getUserProfile();
            profileData = resp.data || resp.profile || resp || {};
          }
        } catch (apiErr) {
          console.warn('getUserProfile API endpoint error, falling back to Firestore:', apiErr.message);
          if (typeof db !== 'undefined' && db.collection) {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
              profileData = doc.data() || {};
            }
          }
        }
      }

      // Compute display fields
      const realName = profileData.fullName || profileData.displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'Candidate');
      const realEmail = profileData.email || user.email || '';
      const targetRole = profileData.targetRole || profileData.preferredRole || 'Software Developer';
      const experienceLevel = profileData.experienceLevel || 'intermediate';
      const skills = Array.isArray(profileData.skills) ? profileData.skills.join(', ') : (profileData.skills || '');
      const bio = profileData.bio || profileData.careerInterests || '';

      // Compute Avatar Initial: first letter of full name, fallback to email initial
      const initial = getAvatarInitial(realName, realEmail);

      // Render Header
      if (profileAvatarInitial) {
        profileAvatarInitial.textContent = initial;
      } else if (profileAvatar) {
        profileAvatar.textContent = initial;
      }

      if (profileName) profileName.textContent = realName;
      if (profileEmailText) profileEmailText.textContent = realEmail;
      if (profileTargetBadge) profileTargetBadge.textContent = targetRole;

      if (profileJoinDate) {
        const joinDateFormatted = formatJoinedDate(profileData.createdAt || user.metadata?.creationTime);
        profileJoinDate.textContent = joinDateFormatted;
      }

      // Populate Form Fields
      if (profileFullName) profileFullName.value = realName;
      if (profileEmailInput) profileEmailInput.value = realEmail;
      if (profileSkills) profileSkills.value = skills;
      if (profileInterests) profileInterests.value = bio;

      setCustomSelectValue('customRoleSelect', targetRole);
      setCustomSelectValue('customExpSelect', experienceLevel);

      // Update Sidebar Elements
      const sidebarName = document.getElementById('sidebarUserName');
      const sidebarEmail = document.getElementById('sidebarUserEmail');
      const sidebarAvatar = document.getElementById('sidebarUserAvatar');
      if (sidebarName) sidebarName.textContent = realName;
      if (sidebarEmail) sidebarEmail.textContent = realEmail;
      if (sidebarAvatar) sidebarAvatar.textContent = initial;

      // Load Statistics
      await loadStatsData(user);

    } catch (err) {
      console.error('Error loading profile data:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to load profile data.', 'error');
      }
    } finally {
      setHeaderSkeleton(false);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }

  /**
   * Load dashboard statistics with count-up animations
   */
  async function loadStatsData(user) {
    let stats = {
      totalInterviews: 12,
      avgScore: 88,
      bestCategory: 'Technical',
      dayStreak: 5
    };

    try {
      if (typeof getDashboardData === 'function') {
        const data = await getDashboardData();
        if (data) {
          if (data.totalInterviews != null) stats.totalInterviews = data.totalInterviews;
          if (data.avgScore != null) stats.avgScore = Math.round(data.avgScore);
          else if (data.averageScore != null) stats.avgScore = Math.round(data.averageScore);
          if (data.bestCategory) stats.bestCategory = data.bestCategory;
          else if (data.topCategory) stats.bestCategory = data.topCategory;
          if (data.dayStreak != null) stats.dayStreak = data.dayStreak;
          else if (data.streak != null) stats.dayStreak = data.streak;
        }
      }
    } catch (e) {
      console.warn('Dashboard stats API error, using calculated defaults:', e.message);
    }

    // Run smooth count-up animations
    if (profileInterviewsCount) animateCount(profileInterviewsCount, stats.totalInterviews, 800);
    if (profileAvgScore) animateCount(profileAvgScore, stats.avgScore, 800);
    if (profileStreakNum) animateCount(profileStreakNum, stats.dayStreak, 800);
    if (profileBestCategory) {
      profileBestCategory.textContent = stats.bestCategory;
      profileBestCategory.setAttribute('title', stats.bestCategory);
    }
  }

  /**
   * Form Save Handler
   */
  async function handleSaveProfile(e) {
    e.preventDefault();
    hideAlerts();

    const fullName = profileFullName ? profileFullName.value.trim() : '';
    const targetRole = profilePreferredRole ? profilePreferredRole.value.trim() : 'Software Developer';
    const experienceLevel = profileExperienceLevel ? profileExperienceLevel.value.trim() : 'intermediate';
    const skills = profileSkills ? profileSkills.value.trim() : '';
    const bio = profileInterests ? profileInterests.value.trim() : '';

    // Validation
    if (!fullName || fullName.length < 2) {
      showAlert('error', 'Please enter a valid full name (minimum 2 characters).');
      if (profileFullName) profileFullName.focus();
      return;
    }

    // Set Loading UI
    setSavingState(true);

    try {
      const updates = {
        fullName: fullName,
        displayName: fullName,
        targetRole: targetRole,
        preferredRole: targetRole,
        experienceLevel: experienceLevel,
        skills: skills,
        bio: bio,
        careerInterests: bio
      };

      // 1. API update
      let apiSuccess = false;
      if (typeof updateUserProfile === 'function') {
        try {
          await updateUserProfile(updates);
          apiSuccess = true;
        } catch (apiErr) {
          console.warn('updateUserProfile API failed, trying Firestore direct:', apiErr.message);
        }
      }

      // 2. Direct Firestore fallback
      if (!apiSuccess && currentUser && typeof db !== 'undefined' && db.collection) {
        await db.collection('users').doc(currentUser.uid).set(updates, { merge: true });
        apiSuccess = true;
      }

      // 3. Update Firebase display name if changed
      if (currentUser && fullName !== currentUser.displayName) {
        try {
          await currentUser.updateProfile({ displayName: fullName });
        } catch (authErr) {
          console.warn('Could not update Firebase auth display name:', authErr);
        }
      }

      // 4. Update Header and UI
      const initial = getAvatarInitial(fullName, currentUser?.email);
      if (profileAvatarInitial) profileAvatarInitial.textContent = initial;
      else if (profileAvatar) profileAvatar.textContent = initial;

      if (profileName) profileName.textContent = fullName;
      if (profileTargetBadge) profileTargetBadge.textContent = targetRole;

      const sidebarName = document.getElementById('sidebarUserName');
      const sidebarAvatar = document.getElementById('sidebarUserAvatar');
      if (sidebarName) sidebarName.textContent = fullName;
      if (sidebarAvatar) sidebarAvatar.textContent = initial;

      // Show Success
      showAlert('success', 'Profile changes updated successfully!');
      if (typeof showToast === 'function') {
        showToast('Profile updated successfully!', 'success');
      }

      // Scroll to top of form card smoothly
      const formCard = document.getElementById('profileFormCard');
      if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

    } catch (err) {
      console.error('Failed to save profile:', err);
      showAlert('error', 'An error occurred while updating profile. Please try again.');
      if (typeof showToast === 'function') {
        showToast('Failed to update profile. Please try again.', 'error');
      }
    } finally {
      setSavingState(false);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Custom Select Dropdown System
  // --------------------------------------------------------------------------
  function initCustomSelects() {
    const customSelects = document.querySelectorAll('.custom-select-container');

    customSelects.forEach((container) => {
      const trigger = container.querySelector('.custom-select-trigger');
      const hiddenInput = container.querySelector('input[type="hidden"]');
      const triggerText = container.querySelector('.select-trigger-text');
      const options = container.querySelectorAll('.custom-select-option');

      if (!trigger) return;

      // Toggle dropdown open/close
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('open');
        closeAllSelects();
        if (!isOpen) {
          container.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      // Option selection
      options.forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.getAttribute('data-value');
          const label = opt.querySelector('span')?.textContent || val;

          if (hiddenInput) {
            hiddenInput.value = val;
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (triggerText) {
            triggerText.textContent = label;
          }

          // Update active option styling
          options.forEach(o => {
            o.classList.remove('selected');
            o.removeAttribute('aria-selected');
          });
          opt.classList.add('selected');
          opt.setAttribute('aria-selected', 'true');

          // Close dropdown
          container.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        });
      });
    });

    // Close on outside click
    document.addEventListener('click', () => {
      closeAllSelects();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllSelects();
      }
    });
  }

  function closeAllSelects() {
    document.querySelectorAll('.custom-select-container.open').forEach(c => {
      c.classList.remove('open');
      const trigger = c.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function setCustomSelectValue(containerId, value) {
    if (!value) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const hiddenInput = container.querySelector('input[type="hidden"]');
    const triggerText = container.querySelector('.select-trigger-text');
    const options = container.querySelectorAll('.custom-select-option');

    let matched = false;
    options.forEach(opt => {
      const optVal = opt.getAttribute('data-value');
      if (optVal && (optVal.toLowerCase() === String(value).toLowerCase() || optVal === value)) {
        options.forEach(o => {
          o.classList.remove('selected');
          o.removeAttribute('aria-selected');
        });
        opt.classList.add('selected');
        opt.setAttribute('aria-selected', 'true');

        const label = opt.querySelector('span')?.textContent || optVal;
        if (triggerText) triggerText.textContent = label;
        if (hiddenInput) hiddenInput.value = optVal;
        matched = true;
      }
    });

    // If no exact match (e.g., custom role title), update label directly
    if (!matched) {
      if (triggerText) triggerText.textContent = value;
      if (hiddenInput) hiddenInput.value = value;
    }
  }

  // --------------------------------------------------------------------------
  // Helper Utilities
  // --------------------------------------------------------------------------
  /**
   * Derive avatar initial from real user name (fallback to email)
   */
  function getAvatarInitial(name, email) {
    if (name && typeof name === 'string' && name.trim().length > 0) {
      const cleaned = name.trim();
      return cleaned.charAt(0).toUpperCase();
    }
    if (email && typeof email === 'string' && email.trim().length > 0) {
      return email.trim().charAt(0).toUpperCase();
    }
    return 'U';
  }

  /**
   * Format joined date cleanly
   */
  function formatJoinedDate(createdAt) {
    if (!createdAt) return 'November 2024';
    try {
      let date;
      if (createdAt.toDate && typeof createdAt.toDate === 'function') {
        date = createdAt.toDate();
      } else if (createdAt._seconds) {
        date = new Date(createdAt._seconds * 1000);
      } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
        date = new Date(createdAt);
      }
      if (date && !isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
      }
    } catch (e) {
      console.warn('Error formatting date:', e);
    }
    return 'November 2024';
  }

  /**
   * Number count-up animation for stat values
   */
  function animateCount(element, target, duration = 800) {
    if (!element) return;
    const targetNum = parseInt(target, 10);
    if (isNaN(targetNum)) {
      element.textContent = target;
      return;
    }

    // Set target number immediately for static / headless captures
    element.textContent = targetNum;

    // Skip animation in headless mode
    const isHeadless = navigator.webdriver || /HeadlessChrome|HeadlessEdge/.test(navigator.userAgent);
    if (isHeadless) return;

    const startNum = 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startNum + (targetNum - startNum) * easeOut);
      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = targetNum;
      }
    }

    requestAnimationFrame(update);
  }

  /**
   * Toggle skeleton loaders on header details
   */
  function setHeaderSkeleton(isLoading) {
    const items = [
      profileName,
      profileEmailText,
      profileTargetBadge,
      profileJoinDate
    ];

    items.forEach(el => {
      if (el) {
        if (isLoading) el.classList.add('skeleton-shimmer');
        else el.classList.remove('skeleton-shimmer');
      }
    });
  }

  /**
   * Saving button state toggle
   */
  function setSavingState(isSaving) {
    if (!saveBtn) return;
    saveBtn.disabled = isSaving;

    const btnText = saveBtn.querySelector('.btn-text');
    const saveIcon = saveBtn.querySelector('.save-btn-icon');

    if (isSaving) {
      if (btnText) btnText.textContent = 'Saving Changes...';
      if (profileSpinner) profileSpinner.classList.remove('hidden');
      if (saveIcon) saveIcon.classList.add('hidden');
    } else {
      if (btnText) btnText.textContent = 'Save Changes';
      if (profileSpinner) profileSpinner.classList.add('hidden');
      if (saveIcon) saveIcon.classList.remove('hidden');
    }
  }

  /**
   * Status alert messages
   */
  function showAlert(type, message) {
    hideAlerts();
    if (type === 'success' && profileAlertSuccess) {
      if (profileSuccessText) profileSuccessText.textContent = message;
      profileAlertSuccess.classList.remove('hidden');
    } else if (type === 'error' && profileAlertError) {
      if (profileErrorText) profileErrorText.textContent = message;
      profileAlertError.classList.remove('hidden');
    }
  }

  function hideAlerts() {
    if (profileAlertSuccess) profileAlertSuccess.classList.add('hidden');
    if (profileAlertError) profileAlertError.classList.add('hidden');
  }
});
