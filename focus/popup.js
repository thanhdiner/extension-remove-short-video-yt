if (window.self !== window.top) document.body.classList.add('embedded');
/**
 * Focus Firewall - Popup Logic
 */

let timerInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await renderPopup();

  // Listen for storage changes to update popup in real-time
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
      await renderPopup();
    }
  });

  // Open Options page
  document.getElementById('open-rules-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelectorAll('.block-current-page').forEach(control => control.addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = document.getElementById('block-current-status');
    button.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'FOCUS_BLOCK_CURRENT_PAGE', scope: button.dataset.scope });
      status.textContent = result?.ok
        ? window.dinkitI18n.t('blockCurrentSuccess', { url: result.url })
        : window.dinkitI18n.t(result?.invalid ? 'blockCurrentInvalid' : 'blockCurrentError');
    } catch {
      status.textContent = window.dinkitI18n.t('blockCurrentError');
    } finally {
      button.disabled = false;
    }
  }));

  // Start Focus Session Buttons
  const startButtons = document.querySelectorAll('.btn-start');
  startButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskInput = document.getElementById('task-input');
      const taskText = taskInput.value.trim();
      const inputError = document.getElementById('input-error');

      if (!taskText) {
        inputError.style.display = 'block';
        taskInput.focus();
        return;
      }
      inputError.style.display = 'none';

      const durationMinutes = parseInt(btn.getAttribute('data-duration'), 10);
      const now = Date.now();
      
      const focusState = {
        active: true,
        task: taskText,
        startedAt: now,
        endsAt: now + durationMinutes * 60 * 1000,
        durationMinutes: durationMinutes,
        pendingLog: false
      };

      await chrome.storage.local.set({ focus: focusState });
      taskInput.value = ''; // clear input
    });
  });

  // Stop Focus Session Button
  document.getElementById('stop-focus-btn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['focus', 'settings']);
    const focus = data.focus || {};
    const settings = data.settings || {};

    if (settings.strictMode && focus.active) {
      alert(window.dinkitI18n?.t('strictStop') || 'Strict mode is active. You cannot stop this session.');
      return;
    }

    if (focus.active) {
      const updatedFocus = {
        ...focus,
        active: false,
        pendingLog: true
      };
      await chrome.storage.local.set({ focus: updatedFocus });
    }
  });

  // Done / Failed Logging Buttons
  document.getElementById('log-done-btn').addEventListener('click', () => logSessionResult('Done'));
  document.getElementById('log-failed-btn').addEventListener('click', () => logSessionResult('Failed'));
});

// Helper: formats active tab usage time
function formatWastedTime(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return '0m';
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Render UI based on state
async function renderPopup() {
  const data = await chrome.storage.local.get([
    'focus',
    'blockedAttempts',
    'usageToday',
    'dailyLimits',
    'blockRules',
    'settings'
  ]);

  const focus = data.focus || { active: false, pendingLog: false };
  const blockedAttempts = data.blockedAttempts || [];
  const usageToday = data.usageToday || {};
  const dailyLimits = data.dailyLimits || [];
  const blockRules = data.blockRules || [];
  const settings = data.settings || { strictMode: false };

  // 1. Status Badge
  const statusBadge = document.getElementById('status-badge');
  if (focus.active) {
    document.getElementById('status-badge-label').textContent = 'ON';
    statusBadge.classList.add('badge-on');
  } else {
    document.getElementById('status-badge-label').textContent = 'OFF';
    statusBadge.classList.remove('badge-on');
  }

  // 2. Wasted Time today
  let wastedSecs = 0;
  dailyLimits.forEach(rule => {
    wastedSecs += Math.floor((rule.usedMs || 0) / 1000);
  });
  for (const [domain, secs] of Object.entries(usageToday)) {
    const isBlocked = blockRules.some(r => domain === r.host || domain.endsWith('.' + r.host));
    const hasLimit = dailyLimits.some(r => domain === r.host || domain.endsWith('.' + r.host));
    if (isBlocked && !hasLimit) {
      wastedSecs += secs;
    }
  }
  document.getElementById('wasted-time-stat').textContent = formatWastedTime(wastedSecs);

  // 3. Blocked attempts today
  const midnight = new Date();
  midnight.setHours(0,0,0,0);
  const todayMidnightTimestamp = midnight.getTime();
  const todayBlocks = blockedAttempts.filter(a => a.timestamp >= todayMidnightTimestamp).length;
  document.getElementById('blocks-count-stat').textContent = todayBlocks;

  // 4. Views transition (Pending Log vs Active vs Inactive)
  const pendingContainer = document.getElementById('pending-log-container');
  const activeView = document.getElementById('focus-active-view');
  const inactiveView = document.getElementById('focus-inactive-view');

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (focus.pendingLog) {
    pendingContainer.style.display = 'block';
    activeView.style.display = 'none';
    inactiveView.style.display = 'none';
    document.getElementById('ended-task-name').textContent = focus.task || 'Focus Session';
  } else if (focus.active) {
    pendingContainer.style.display = 'none';
    activeView.style.display = 'block';
    inactiveView.style.display = 'none';
    
    document.getElementById('active-task-desc').textContent = focus.task || 'Focus Session';
    
    // Setup timer
    const timeRemainingEl = document.getElementById('active-time-remaining');
    const updateTimer = () => {
      const remaining = focus.endsAt - Date.now();
      if (remaining <= 0) {
        timeRemainingEl.textContent = '00:00';
        if (timerInterval) clearInterval(timerInterval);
      } else {
        const totalSecs = Math.floor(remaining / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        timeRemainingEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    };
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);

    // Strict Mode buttons handling
    const stopBtn = document.getElementById('stop-focus-btn');
    const strictWarning = document.getElementById('strict-warning');
    if (settings.strictMode) {
      stopBtn.style.display = 'none';
      strictWarning.style.display = 'block';
    } else {
      stopBtn.style.display = 'block';
      strictWarning.style.display = 'none';
    }
  } else {
    pendingContainer.style.display = 'none';
    activeView.style.display = 'none';
    inactiveView.style.display = 'block';
  }
}

// Log focus result to history
async function logSessionResult(result) {
  const data = await chrome.storage.local.get(['focus', 'focusHistory']);
  const focus = data.focus || {};
  let focusHistory = data.focusHistory || [];

  const logEntry = {
    task: focus.task,
    startedAt: focus.startedAt,
    durationMinutes: focus.durationMinutes,
    result: result,
    timestamp: Date.now()
  };

  focusHistory.push(logEntry);

  const resetFocus = {
    active: false,
    task: '',
    startedAt: 0,
    endsAt: 0,
    durationMinutes: 0,
    pendingLog: false
  };

  await chrome.storage.local.set({
    focus: resetFocus,
    focusHistory: focusHistory
  });
}
