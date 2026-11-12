// AVENIR AI - Leaderboard
// Displays community rankings based on interview performance

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof checkAuthState === 'function') await checkAuthState();

  const podiumContainer = document.getElementById('podiumContainer');
  const tableBody = document.getElementById('leaderboardBody');
  const emptyState = document.getElementById('emptyState');
  let currentUserId = null;

  if (typeof waitForAuthInit === 'function') {
    const user = await waitForAuthInit();
    if (user) {
      currentUserId = user.uid;
      await loadLeaderboard();
    }
  } else if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        currentUserId = user.uid;
        await loadLeaderboard();
      }
    });
  }

  initSidebar();

  async function loadLeaderboard() {
    showLoading(true);
    try {
      const data = await getLeaderboard();
      const entries = data.leaderboard || data || [];

      if (entries.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (podiumContainer) podiumContainer.style.display = 'none';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      renderPodium(entries.slice(0, 3));
      renderTable(entries);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      showToast('Failed to load leaderboard data.', 'error');
    } finally {
      showLoading(false);
    }
  }

  function renderPodium(top3) {
    if (!podiumContainer) return;
    if (top3.length === 0) { podiumContainer.innerHTML = ''; return; }

    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const heights = ['160px', '200px', '130px'];
    const ranks = top3.length >= 3 ? [2, 1, 3] : top3.map((_, i) => i + 1);

    podiumContainer.innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:16px;padding:20px 0;">
        ${podiumOrder.map((entry, i) => {
          const actualRank = ranks[i];
          const idx = actualRank - 1;
          return `
            <div style="text-align:center;width:${actualRank === 1 ? '160px' : '140px'};">
              <div style="width:${actualRank === 1 ? '80px' : '64px'};height:${actualRank === 1 ? '80px' : '64px'};border-radius:50%;background:linear-gradient(110deg,#FF5841 0%,#C53678 100%);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:${actualRank === 1 ? '28px' : '22px'};font-weight:800;color:#fff;border:3px solid ${colors[idx]};">
                ${getInitials(entry.displayName)}
              </div>
              <div style="font-size:24px;">${medals[idx]}</div>
              <h4 style="margin:8px 0 4px;font-size:14px;color:#252525;">${escapeHtml(entry.displayName || 'Anonymous')}</h4>
              <p style="margin:0;font-size:24px;font-weight:800;color:#FF5841;">${Math.round(entry.avgScore || 0)}</p>
              <p style="margin:2px 0;font-size:12px;color:#6B7280;">${entry.totalInterviews || 0} interviews</p>
              <div style="height:${heights[i]};background:linear-gradient(to top,${colors[idx]}33,${colors[idx]}11);border-radius:8px 8px 0 0;margin-top:12px;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:32px;font-weight:800;color:${colors[idx]};">#${actualRank}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderTable(entries) {
    if (!tableBody) return;
    tableBody.innerHTML = entries.map((entry, i) => {
      const rank = i + 1;
      const isCurrentUser = entry.userId === currentUserId;
      return `
        <tr style="${isCurrentUser ? 'background:#FFF0ED;font-weight:600;' : ''}">
          <td style="font-weight:700;${rank <= 3 ? 'color:#FF5841;' : ''}">${rank}</td>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="user-avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(110deg,#FF5841 0%,#C53678 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">
                ${getInitials(entry.displayName)}
              </div>
              <span>${escapeHtml(entry.displayName || 'Anonymous')}${isCurrentUser ? ' <span style="color:#FF5841;font-size:12px;">(You)</span>' : ''}</span>
            </div>
          </td>
          <td>${entry.totalInterviews || 0}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:8px;background:#E5E7EB;border-radius:4px;max-width:120px;">
                <div style="height:100%;width:${Math.min(100, entry.avgScore || 0)}%;background:${getScoreColor(entry.avgScore)};border-radius:4px;"></div>
              </div>
              <span style="color:${getScoreColor(entry.avgScore)};font-weight:600;">${Math.round(entry.avgScore || 0)}</span>
            </div>
          </td>
          <td style="font-weight:700;color:${getScoreColor(entry.bestScore)};">${entry.bestScore || '--'}</td>
        </tr>
      `;
    }).join('');

    // Check if current user is on board
    const isOnBoard = entries.some(e => e.userId === currentUserId);
    const noteEl = document.getElementById('leaderboardNote');
    if (noteEl && !isOnBoard) {
      noteEl.style.display = 'block';
      noteEl.textContent = 'You are not on the leaderboard. Opt in from Settings to appear here.';
    }
  }

  // Helpers
  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  function getScoreColor(s) { if (s >= 75) return '#16a34a'; if (s >= 50) return '#FF5841'; return '#dc2626'; }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
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

