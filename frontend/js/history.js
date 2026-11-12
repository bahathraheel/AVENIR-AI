// AVENIR AI - Interview History
// Displays past interviews with filtering, pagination, and actions

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof checkAuthState === 'function') await checkAuthState();
  if (typeof waitForAuthInit === 'function') {
    const user = await waitForAuthInit();
    if (!user) return;
  }

  let allInterviews = [];
  let filteredInterviews = [];
  let currentPage = 1;
  const perPage = 10;

  const historyContainer = document.getElementById('historyList') || document.querySelector('.history-table tbody') || document.querySelector('.history-cards');
  const emptyState = document.getElementById('emptyState');
  const paginationContainer = document.getElementById('pagination');
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const difficultyFilter = document.getElementById('difficultyFilter');
  const deleteModal = document.getElementById('deleteModal');
  let deleteTargetId = null;

  await loadHistory();
  initFilters();
  initSidebar();

  async function loadHistory() {
    showLoading(true);
    try {
      const data = await getInterviewHistory(1, 200);
      allInterviews = data.interviews || data || [];
      applyFilters();
    } catch (err) {
      console.error('Failed to load history:', err);
      showToast('Failed to load interview history.', 'error');
    } finally {
      showLoading(false);
    }
  }

  function initFilters() {
    if (searchInput) searchInput.addEventListener('input', debounce(() => { currentPage = 1; applyFilters(); }, 300));
    if (typeFilter) typeFilter.addEventListener('change', () => { currentPage = 1; applyFilters(); });
    if (difficultyFilter) difficultyFilter.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  }

  function applyFilters() {
    let result = [...allInterviews];
    const search = (searchInput?.value || '').toLowerCase().trim();
    const type = typeFilter?.value || '';
    const diff = difficultyFilter?.value || '';

    if (search) result = result.filter(i => (i.jobRole || '').toLowerCase().includes(search) || (i.interviewType || '').toLowerCase().includes(search));
    if (type) result = result.filter(i => (i.interviewType || '').toLowerCase() === type.toLowerCase());
    if (diff) result = result.filter(i => (i.difficulty || '').toLowerCase() === diff.toLowerCase());

    filteredInterviews = result;
    renderHistory();
    renderPagination();
  }

  function renderHistory() {
    if (!historyContainer) return;
    const start = (currentPage - 1) * perPage;
    const page = filteredInterviews.slice(start, start + perPage);

    if (filteredInterviews.length === 0) {
      historyContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';

    // Check if we're rendering into a table tbody or a card container
    const isTable = historyContainer.tagName === 'TBODY';

    if (isTable) {
      historyContainer.innerHTML = page.map(interview => `
        <tr>
          <td>${formatDate(interview.createdAt)}</td>
          <td><strong>${escapeHtml(interview.jobRole || 'N/A')}</strong></td>
          <td><span class="badge">${escapeHtml(interview.interviewType || 'N/A')}</span></td>
          <td><span class="badge badge-${getDifficultyClass(interview.difficulty)}">${capitalize(interview.difficulty || 'N/A')}</span></td>
          <td><span class="score-badge" style="color:${getScoreColor(interview.overallScore)};font-weight:700;">${interview.overallScore != null ? Math.round(interview.overallScore) : '--'}</span></td>
          <td><span class="badge badge-${interview.status === 'completed' ? 'success' : 'warning'}">${capitalize(interview.status || 'unknown')}</span></td>
          <td class="actions-cell">
            <button class="btn btn-sm btn-outline" onclick="viewReport('${interview.interviewId || interview.id}')" title="View Report"><i data-lucide="eye"></i></button>
            <button class="btn btn-sm btn-outline" onclick="downloadReport('${interview.interviewId || interview.id}')" title="Download"><i data-lucide="download"></i></button>
            <button class="btn btn-sm btn-outline" onclick="retakeInterview('${interview.interviewId || interview.id}')" title="Retake"><i data-lucide="refresh-cw"></i></button>
            <button class="btn btn-sm btn-danger" onclick="confirmDelete('${interview.interviewId || interview.id}')" title="Delete"><i data-lucide="trash-2"></i></button>
          </td>
        </tr>
      `).join('');
    } else {
      historyContainer.innerHTML = page.map(interview => `
        <div class="card history-card" style="margin-bottom:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
            <div>
              <h3 style="margin:0 0 4px;font-size:16px;">${escapeHtml(interview.jobRole || 'N/A')}</h3>
              <p style="margin:0;color:#6B7280;font-size:14px;">${escapeHtml(interview.interviewType || '')} • ${capitalize(interview.difficulty || '')} • ${formatDate(interview.createdAt)}</p>
            </div>
            <div style="text-align:right;">
              <div style="font-size:28px;font-weight:700;color:${getScoreColor(interview.overallScore)}">${interview.overallScore != null ? Math.round(interview.overallScore) : '--'}</div>
              <span class="badge badge-${interview.status === 'completed' ? 'success' : 'warning'}">${capitalize(interview.status || 'unknown')}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" onclick="viewReport('${interview.interviewId || interview.id}')"><i data-lucide="eye"></i> View</button>
            <button class="btn btn-sm btn-outline" onclick="downloadReport('${interview.interviewId || interview.id}')"><i data-lucide="download"></i> PDF</button>
            <button class="btn btn-sm btn-outline" onclick="retakeInterview('${interview.interviewId || interview.id}')"><i data-lucide="refresh-cw"></i> Retake</button>
            <button class="btn btn-sm btn-danger" onclick="confirmDelete('${interview.interviewId || interview.id}')"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      `).join('');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function renderPagination() {
    if (!paginationContainer) return;
    const total = Math.ceil(filteredInterviews.length / perPage);
    if (total <= 1) { paginationContainer.innerHTML = ''; return; }

    let html = '';
    html += `<button class="page-btn${currentPage === 1 ? ' disabled' : ''}" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= currentPage - 2 && i <= currentPage + 2)) {
        html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
      } else if (i === currentPage - 3 || i === currentPage + 3) {
        html += `<span style="padding:0 8px;">…</span>`;
      }
    }
    html += `<button class="page-btn${currentPage === total ? ' disabled' : ''}" onclick="goToPage(${currentPage + 1})" ${currentPage === total ? 'disabled' : ''}>&raquo;</button>`;
    paginationContainer.innerHTML = html;
  }

  // Global functions for onclick handlers
  window.goToPage = (page) => {
    const total = Math.ceil(filteredInterviews.length / perPage);
    if (page < 1 || page > total) return;
    currentPage = page;
    renderHistory();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.viewReport = (id) => {
    window.location.href = `results.html?id=${id}`;
  };

  window.downloadReport = async (id) => {
    try {
      const data = await getInterview(id);
      if (!data) return showToast('Interview not found.', 'error');
      openPrintableReport(data);
    } catch (err) {
      showToast('Failed to download report.', 'error');
    }
  };

  window.retakeInterview = (id) => {
    const interview = allInterviews.find(i => (i.interviewId || i.id) === id);
    if (interview) {
      sessionStorage.setItem('retakeConfig', JSON.stringify({
        jobRole: interview.jobRole,
        interviewType: interview.interviewType,
        difficulty: interview.difficulty,
        experienceLevel: interview.experienceLevel
      }));
    }
    window.location.href = 'interview-setup.html';
  };

  window.confirmDelete = (id) => {
    deleteTargetId = id;
    if (deleteModal) {
      deleteModal.style.display = 'flex';
    } else {
      if (confirm('Are you sure you want to delete this interview record? This action cannot be undone.')) {
        performDelete(id);
      }
    }
  };

  // Modal confirm/cancel
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', () => { if (deleteTargetId) performDelete(deleteTargetId); });
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => { if (deleteModal) deleteModal.style.display = 'none'; deleteTargetId = null; });

  async function performDelete(id) {
    try {
      await deleteInterview(id);
      allInterviews = allInterviews.filter(i => (i.interviewId || i.id) !== id);
      applyFilters();
      showToast('Interview deleted successfully.', 'success');
    } catch (err) {
      showToast('Failed to delete interview.', 'error');
    }
    if (deleteModal) deleteModal.style.display = 'none';
    deleteTargetId = null;
  }

  function openPrintableReport(data) {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Interview Report - AVENIR AI</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:40px;color:#252525;}
      h1{color:#252525;}h1 span{color:#FF5841;}.score{font-size:48px;font-weight:800;color:#FF5841;text-align:center;}
      .section{margin:24px 0;padding:16px;border:1px solid #E5E7EB;border-radius:8px;}
      table{width:100%;border-collapse:collapse;}th,td{padding:8px 12px;border-bottom:1px solid #E5E7EB;text-align:left;}
      @media print{body{margin:20px;}}</style></head><body>
      <h1>AVENIR <span>AI</span> — Interview Report</h1>
      <p><strong>Role:</strong> ${escapeHtml(data.jobRole || '')}</p>
      <p><strong>Type:</strong> ${escapeHtml(data.interviewType || '')} | <strong>Difficulty:</strong> ${capitalize(data.difficulty || '')}</p>
      <p><strong>Date:</strong> ${formatDate(data.createdAt)}</p>
      <div class="score">${data.overallScore != null ? Math.round(data.overallScore) : '--'}/100</div>
      ${data.report ? `<div class="section"><h3>Summary</h3><p>${escapeHtml(data.report.nextSteps || '')}</p></div>` : ''}
      <div class="section"><h3>Questions & Answers</h3><table><tr><th>#</th><th>Question</th><th>Score</th></tr>
      ${(data.questions || []).map((q, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(typeof q === 'string' ? q : q.question || '')}</td>
      <td>${data.evaluations && data.evaluations[i] ? data.evaluations[i].overallScore : '--'}</td></tr>`).join('')}
      </table></div>
      <p style="color:#6B7280;text-align:center;margin-top:40px;">Generated by AVENIR AI — Your Future Starts Here.</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  }

  // Helpers
  function formatDate(d) {
    if (!d) return 'N/A';
    try {
      const date = d.toDate ? d.toDate() : new Date(d._seconds ? d._seconds * 1000 : d);
      return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    } catch { return 'N/A'; }
  }
  function getScoreColor(s) { if (s >= 75) return '#16a34a'; if (s >= 50) return '#FF5841'; return '#dc2626'; }
  function getDifficultyClass(d) { const m = { easy: 'success', medium: 'warning', hard: 'primary' }; return m[(d || '').toLowerCase()] || ''; }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function showLoading(show) { const l = document.getElementById('loadingOverlay'); if (l) l.style.display = show ? 'flex' : 'none'; }
  function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `alert alert-${type}`;
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;padding:12px 24px;border-radius:8px;';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

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

