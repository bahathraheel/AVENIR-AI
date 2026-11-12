// AVENIR AI - Settings
// User preferences, goals, account management

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof checkAuthState === 'function') await checkAuthState();

  const settingsForm = document.getElementById('settingsForm');
  const saveBtn = document.getElementById('saveSettingsBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  const deleteModal = document.getElementById('deleteAccountModal');
  const confirmDeleteBtn = document.getElementById('confirmDeleteAccountBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteAccountBtn');
  const deleteConfirmInput = document.getElementById('deleteConfirmInput');
  const changePasswordForm = document.getElementById('changePasswordForm');

  let currentSettings = {};

  if (typeof waitForAuthInit === 'function') {
    const user = await waitForAuthInit();
    if (user) await loadSettings(user);
  } else if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) await loadSettings(user);
    });
  }

  if (settingsForm) settingsForm.addEventListener('submit', saveSettings);
  if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (typeof logoutUser === 'function') logoutUser(); });
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', () => { if (deleteModal) deleteModal.style.display = 'flex'; });
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => { if (deleteModal) deleteModal.style.display = 'none'; });
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', deleteAccount);
  if (changePasswordForm) changePasswordForm.addEventListener('submit', changePassword);

  // Enable delete button only when user types DELETE
  if (deleteConfirmInput) {
    deleteConfirmInput.addEventListener('input', () => {
      if (confirmDeleteBtn) confirmDeleteBtn.disabled = deleteConfirmInput.value.trim() !== 'DELETE';
    });
  }

  initSidebar();

  async function loadSettings(user) {
    showLoading(true);
    try {
      try {
        const data = await getUserProfile();
        currentSettings = (data.profile || data).preferences || {};
      } catch {
        const doc = await db.collection('users').doc(user.uid).get();
        currentSettings = doc.exists ? (doc.data().preferences || {}) : {};
      }

      // Populate form
      setInputValue('dailyGoal', currentSettings.dailyGoal || 1);
      setInputValue('weeklyTarget', currentSettings.weeklyTarget || 5);
      setChecked('leaderboardOptIn', currentSettings.leaderboardOptIn !== false);
      setChecked('timerEnabled', currentSettings.timerEnabled !== false);
      setChecked('emailReminders', currentSettings.emailReminders || false);
      setChecked('practiceReminders', currentSettings.practiceReminders || false);
      setInputValue('reminderTime', currentSettings.reminderTime || '09:00');
    } catch (err) {
      console.error('Failed to load settings:', err);
      showToast('Failed to load settings.', 'error');
    } finally {
      showLoading(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
      const settings = {
        dailyGoal: parseInt(getInputValue('dailyGoal')) || 1,
        weeklyTarget: parseInt(getInputValue('weeklyTarget')) || 5,
        leaderboardOptIn: getChecked('leaderboardOptIn'),
        timerEnabled: getChecked('timerEnabled'),
        emailReminders: getChecked('emailReminders'),
        practiceReminders: getChecked('practiceReminders'),
        reminderTime: getInputValue('reminderTime') || '09:00',
      };

      // Validate ranges
      if (settings.dailyGoal < 1) settings.dailyGoal = 1;
      if (settings.dailyGoal > 20) settings.dailyGoal = 20;
      if (settings.weeklyTarget < 1) settings.weeklyTarget = 1;
      if (settings.weeklyTarget > 50) settings.weeklyTarget = 50;

      await updateUserSettings(settings);
      currentSettings = settings;
      showToast('Settings saved successfully!', 'success');
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast('Failed to save settings. Please try again.', 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Settings'; }
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    const currentPw = document.getElementById('currentPassword')?.value;
    const newPw = document.getElementById('newPassword')?.value;
    const confirmPw = document.getElementById('confirmNewPassword')?.value;
    const btn = changePasswordForm.querySelector('button[type="submit"]');

    if (!currentPw || !newPw || !confirmPw) {
      showToast('Please fill all password fields.', 'error');
      return;
    }

    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    if (newPw.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

    try {
      const user = firebase.auth().currentUser;
      // Re-authenticate
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
      await user.reauthenticateWithCredential(credential);
      await user.updatePassword(newPw);

      showToast('Password updated successfully!', 'success');
      changePasswordForm.reset();
    } catch (err) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password') {
        showToast('Current password is incorrect.', 'error');
      } else if (err.code === 'auth/weak-password') {
        showToast('New password is too weak. Use at least 8 characters.', 'error');
      } else {
        showToast('Failed to update password. Please try again.', 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    }
  }

  async function deleteAccount() {
    if (deleteConfirmInput && deleteConfirmInput.value.trim() !== 'DELETE') {
      showToast('Please type DELETE to confirm.', 'error');
      return;
    }

    if (confirmDeleteBtn) { confirmDeleteBtn.disabled = true; confirmDeleteBtn.textContent = 'Deleting...'; }

    try {
      const user = firebase.auth().currentUser;
      if (!user) throw new Error('Not authenticated');

      // Delete user data from Firestore
      const uid = user.uid;
      try {
        await db.collection('users').doc(uid).delete();
      } catch (e) { console.warn('Could not delete user doc:', e); }
      try {
        await db.collection('learningProgress').doc(uid).delete();
      } catch (e) { console.warn('Could not delete learning doc:', e); }

      // Delete interviews
      try {
        const interviews = await db.collection('interviews').where('userId', '==', uid).get();
        const batch = db.batch();
        interviews.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      } catch (e) { console.warn('Could not delete interviews:', e); }

      // Delete resumes
      try {
        const resumes = await db.collection('resumes').where('userId', '==', uid).get();
        const batch2 = db.batch();
        resumes.forEach(doc => batch2.delete(doc.ref));
        await batch2.commit();
      } catch (e) { console.warn('Could not delete resumes:', e); }

      // Delete Firebase auth account
      await user.delete();

      showToast('Account deleted. Goodbye!', 'info');
      setTimeout(() => window.location.href = 'index.html', 1500);
    } catch (err) {
      console.error('Delete account error:', err);
      if (err.code === 'auth/requires-recent-login') {
        showToast('Please log out and log back in, then try again.', 'error');
      } else {
        showToast('Failed to delete account. Please try again.', 'error');
      }
    } finally {
      if (confirmDeleteBtn) { confirmDeleteBtn.disabled = false; confirmDeleteBtn.textContent = 'Delete My Account'; }
      if (deleteModal) deleteModal.style.display = 'none';
    }
  }

  // Helpers
  function setInputValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
  function getInputValue(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }
  function getChecked(id) { const el = document.getElementById(id); return el ? el.checked : false; }
  function showLoading(show) { const l = document.getElementById('loadingOverlay'); if (l) l.style.display = show ? 'flex' : 'none'; }
  function showToast(msg, type) { const t = document.createElement('div'); t.className = `alert alert-${type}`; t.textContent = msg; t.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;padding:12px 24px;border-radius:8px;'; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); }

  function initSidebar() {
    const toggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (toggle && sidebar) toggle.addEventListener('click', () => { sidebar.classList.toggle('open'); if (overlay) overlay.classList.toggle('active'); });
    if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); });
    document.querySelectorAll('[data-action="logout"], .logout-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); if (typeof logoutUser === 'function') logoutUser(); });
    });
  }
});

