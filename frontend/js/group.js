// AVENIR AI - Group Interview
// Create/join rooms, participate in group mock interviews

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof checkAuthState === 'function') await checkAuthState();

  const createForm = document.getElementById('createRoomForm');
  const joinForm = document.getElementById('joinRoomForm');
  const lobbyView = document.getElementById('lobbyView') || document.getElementById('roomView');
  const createJoinView = document.getElementById('createJoinView');
  const interviewArea = document.getElementById('groupInterviewArea');

  let currentRoom = null;
  let currentUser = null;
  let pollInterval = null;

  if (typeof waitForAuthInit === 'function') {
    currentUser = await waitForAuthInit();
  } else if (typeof firebase !== 'undefined' && firebase.auth) {
    currentUser = firebase.auth().currentUser;
    firebase.auth().onAuthStateChanged(user => {
      if (user) currentUser = user;
    });
  }

  if (createForm) createForm.addEventListener('submit', createRoom);
  if (joinForm) joinForm.addEventListener('submit', joinRoom);

  initSidebar();

  // Check if returning to an active room
  const savedRoomId = sessionStorage.getItem('groupRoomId');
  if (savedRoomId) {
    loadRoom(savedRoomId);
  }

  async function createRoom(e) {
    e.preventDefault();
    const btn = createForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      const jobRole = document.getElementById('groupJobRole')?.value || 'Software Developer';
      const interviewType = document.getElementById('groupInterviewType')?.value || 'Technical Interview';
      const maxParticipants = parseInt(document.getElementById('maxParticipants')?.value) || 4;

      const data = await createGroupRoom({ jobRole, interviewType, maxParticipants });
      currentRoom = data.room || data;
      sessionStorage.setItem('groupRoomId', currentRoom.roomId || currentRoom.id);
      showRoomLobby();
      showToast('Room created! Share the code with others.', 'success');
    } catch (err) {
      console.error('Failed to create room:', err);
      showToast(err.message || 'Failed to create room.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Create Room'; }
    }
  }

  async function joinRoom(e) {
    e.preventDefault();
    const codeInput = document.getElementById('roomCodeInput');
    const code = (codeInput?.value || '').trim().toUpperCase();
    if (!code || code.length < 4) {
      showToast('Please enter a valid room code.', 'error');
      return;
    }

    const btn = joinForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining...'; }

    try {
      const data = await joinGroupRoom(code);
      currentRoom = data.room || data;
      sessionStorage.setItem('groupRoomId', currentRoom.roomId || currentRoom.id);
      showRoomLobby();
      showToast('Joined room successfully!', 'success');
    } catch (err) {
      console.error('Failed to join room:', err);
      showToast(err.message || 'Failed to join room. Check the code and try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Join Room'; }
    }
  }

  async function loadRoom(roomId) {
    showLoading(true);
    try {
      const data = await getGroupRoom(roomId);
      currentRoom = data.room || data;
      showRoomLobby();
    } catch (err) {
      console.error('Failed to load room:', err);
      sessionStorage.removeItem('groupRoomId');
      showToast('Room not found or expired.', 'error');
    } finally {
      showLoading(false);
    }
  }

  function showRoomLobby() {
    if (createJoinView) createJoinView.style.display = 'none';
    if (lobbyView) lobbyView.style.display = 'block';

    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const roomInfo = document.getElementById('roomInfo');
    const participantsList = document.getElementById('participantsList');
    const startSessionBtn = document.getElementById('startSessionBtn');
    const leaveBtn = document.getElementById('leaveRoomBtn');

    if (roomCodeDisplay) {
      roomCodeDisplay.textContent = currentRoom.roomCode || '';
    }

    if (roomInfo) {
      roomInfo.innerHTML = `
        <p><strong>Role:</strong> ${escapeHtml(currentRoom.jobRole || '')}</p>
        <p><strong>Type:</strong> ${escapeHtml(currentRoom.interviewType || '')}</p>
        <p><strong>Host:</strong> ${escapeHtml(currentRoom.hostName || 'Host')}</p>
        <p><strong>Status:</strong> <span class="badge badge-${currentRoom.status === 'waiting' ? 'warning' : 'success'}">${capitalize(currentRoom.status || 'waiting')}</span></p>
      `;
    }

    renderParticipants(currentRoom.participants || []);

    const isHost = currentUser && currentRoom.hostId === currentUser.uid;
    if (startSessionBtn) {
      startSessionBtn.style.display = isHost ? 'inline-flex' : 'none';
      startSessionBtn.disabled = (currentRoom.participants || []).length < 2;
      startSessionBtn.onclick = startSession;
    }

    if (leaveBtn) leaveBtn.onclick = leaveRoom;

    // Copy code button
    const copyBtn = document.getElementById('copyCodeBtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(currentRoom.roomCode || '').then(() => {
          showToast('Room code copied!', 'success');
        }).catch(() => {
          showToast('Failed to copy. Code: ' + (currentRoom.roomCode || ''), 'info');
        });
      };
    }

    // Start polling for updates
    startPolling();

    // If session already started, show interview area
    if (currentRoom.status === 'in_progress' && currentRoom.questions) {
      showGroupInterview();
    }
  }

  function renderParticipants(participants) {
    const list = document.getElementById('participantsList');
    if (!list) return;
    list.innerHTML = participants.map(p => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #E5E7EB;">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(110deg,#FF5841 0%,#C53678 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">
          ${getInitials(p.displayName || p.name)}
        </div>
        <div style="flex:1;">
          <strong>${escapeHtml(p.displayName || p.name || 'Participant')}</strong>
          ${p.isHost ? '<span class="badge badge-primary" style="margin-left:8px;font-size:10px;">Host</span>' : ''}
        </div>
        <span style="width:10px;height:10px;border-radius:50%;background:#16a34a;"></span>
      </div>
    `).join('');
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!currentRoom) return;
      try {
        const data = await getGroupRoom(currentRoom.roomId || currentRoom.id);
        currentRoom = data.room || data;
        renderParticipants(currentRoom.participants || []);

        const startBtn = document.getElementById('startSessionBtn');
        if (startBtn && currentUser && currentRoom.hostId === currentUser.uid) {
          startBtn.disabled = (currentRoom.participants || []).length < 2;
        }

        if (currentRoom.status === 'in_progress' && currentRoom.questions) {
          showGroupInterview();
        }

        if (currentRoom.status === 'completed') {
          clearInterval(pollInterval);
          showGroupResults();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000);
  }

  async function startSession() {
    const btn = document.getElementById('startSessionBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
    try {
      // The backend handles generating questions and updating room status
      const data = await submitGroupAnswer(currentRoom.roomId || currentRoom.id, { action: 'start' });
      currentRoom = data.room || data || currentRoom;
      if (currentRoom.questions) showGroupInterview();
    } catch (err) {
      showToast('Failed to start session.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Session'; }
    }
  }

  function showGroupInterview() {
    if (!interviewArea) return;
    clearInterval(pollInterval);
    interviewArea.style.display = 'block';
    if (lobbyView && lobbyView !== interviewArea) {
      // Keep lobby visible but show interview below
    }

    const questions = currentRoom.questions || [];
    let currentQ = 0;

    function renderQuestion() {
      if (currentQ >= questions.length) {
        showGroupResults();
        return;
      }
      const q = questions[currentQ];
      interviewArea.innerHTML = `
        <div class="card" style="padding:32px;margin-top:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <span class="badge badge-primary">Question ${currentQ + 1} of ${questions.length}</span>
            <span class="badge">Group Session</span>
          </div>
          <h3 style="margin:0 0 20px;">${escapeHtml(typeof q === 'string' ? q : q.question || '')}</h3>
          <textarea id="groupAnswer" class="form-input" rows="6" placeholder="Type your answer here..." style="width:100%;resize:vertical;"></textarea>
          <div style="display:flex;gap:12px;margin-top:16px;">
            <button id="submitGroupAnswer" class="btn btn-primary">Submit Answer</button>
            <button id="skipGroupQuestion" class="btn btn-outline">Skip</button>
          </div>
          <div id="groupFeedback" style="display:none;margin-top:24px;"></div>
        </div>
      `;

      document.getElementById('submitGroupAnswer').addEventListener('click', async () => {
        const answer = document.getElementById('groupAnswer').value.trim();
        const btn = document.getElementById('submitGroupAnswer');
        btn.disabled = true;
        btn.textContent = 'Evaluating...';

        try {
          const result = await submitGroupAnswer(currentRoom.roomId || currentRoom.id, {
            questionIndex: currentQ,
            answer: answer || '(No answer provided)'
          });

          const evaluation = result.evaluation || result;
          const feedback = document.getElementById('groupFeedback');
          if (feedback) {
            feedback.style.display = 'block';
            feedback.innerHTML = `
              <div style="text-align:center;margin-bottom:16px;">
                <div style="font-size:48px;font-weight:800;color:${getScoreColor(evaluation.overallScore)}">${evaluation.overallScore || 0}</div>
                <p style="color:#6B7280;">Score</p>
              </div>
              ${evaluation.strengths && evaluation.strengths.length > 0 ? `<p style="color:#16a34a;"><strong>Strengths:</strong> ${evaluation.strengths.join(', ')}</p>` : ''}
              ${evaluation.weaknesses && evaluation.weaknesses.length > 0 ? `<p style="color:#dc2626;"><strong>Areas to improve:</strong> ${evaluation.weaknesses.join(', ')}</p>` : ''}
              <button id="nextGroupQ" class="btn btn-primary" style="margin-top:16px;">Next Question</button>
            `;
            document.getElementById('nextGroupQ').addEventListener('click', () => {
              currentQ++;
              renderQuestion();
            });
          }
        } catch (err) {
          showToast('Failed to submit answer.', 'error');
          btn.disabled = false;
          btn.textContent = 'Submit Answer';
        }
      });

      document.getElementById('skipGroupQuestion').addEventListener('click', () => {
        currentQ++;
        renderQuestion();
      });
    }

    renderQuestion();
  }

  function showGroupResults() {
    if (interviewArea) {
      interviewArea.innerHTML = `
        <div class="card" style="padding:32px;text-align:center;">
          <h2 style="color:#252525;">Group Session Complete!</h2>
          <p style="color:#6B7280;">All questions have been answered. Check your dashboard for detailed results.</p>
          <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
            <a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>
            <button class="btn btn-outline" onclick="location.reload()">New Session</button>
          </div>
        </div>
      `;
    }
    sessionStorage.removeItem('groupRoomId');
  }

  function leaveRoom() {
    if (!confirm('Are you sure you want to leave this room?')) return;
    sessionStorage.removeItem('groupRoomId');
    clearInterval(pollInterval);
    currentRoom = null;
    if (lobbyView) lobbyView.style.display = 'none';
    if (interviewArea) interviewArea.style.display = 'none';
    if (createJoinView) createJoinView.style.display = '';
    showToast('Left the room.', 'info');
  }

  // Helpers
  function getInitials(name) { return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
  function getScoreColor(s) { if (s >= 75) return '#16a34a'; if (s >= 50) return '#FF5841'; return '#dc2626'; }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
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

  // Cleanup on page leave
  window.addEventListener('beforeunload', () => {
    if (pollInterval) clearInterval(pollInterval);
  });
});

