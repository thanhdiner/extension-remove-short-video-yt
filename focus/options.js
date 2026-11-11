const t = (key, values) => window.dinkitI18n.t(key, values);
/**
 * Focus Firewall - Options Dashboard Logic
 */

// --- Helper Functions ---

function normalizeHost(host) {
  let h = host.toLowerCase().trim();
  if (h.startsWith('www.')) {
    h = h.substring(4);
  }
  return h;
}

function parseUserRule(input) {
  let clean = input.trim().replace(/^https?:\/\//i, '');
  const slashIndex = clean.indexOf('/');
  let host = clean;
  let pathPrefix = '/';
  
  if (slashIndex !== -1) {
    host = clean.substring(0, slashIndex);
    pathPrefix = clean.substring(slashIndex);
    if (!pathPrefix.startsWith('/')) {
      pathPrefix = '/' + pathPrefix;
    }
  }
  
  return {
    raw: input,
    host: normalizeHost(host),
    pathPrefix: pathPrefix
  };
}

function doesUrlMatchRule(urlStr, rule) {
  try {
    const url = new URL(urlStr);
    if (rule.exactUrl) { url.hash = ''; return url.href === rule.exactUrl; }
    const urlHost = normalizeHost(url.hostname);
    const ruleHost = normalizeHost(rule.host);
    
    const hostMatches = (urlHost === ruleHost) || urlHost.endsWith('.' + ruleHost);
    if (!hostMatches) {
      return false;
    }
    
    if (rule.pathPrefix === '/') {
      return true;
    }
    
    let urlPath = url.pathname;
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }
    
    return urlPath.startsWith(rule.pathPrefix);
  } catch (e) {
    return false;
  }
}

// --- Migration Helper ---
async function migrateDailyLimits() {
  const data = await chrome.storage.local.get(['dailyLimits', 'usageToday']);
  const dailyLimits = data.dailyLimits;
  const usageToday = data.usageToday || {};
  
  if (dailyLimits && typeof dailyLimits === 'object' && !Array.isArray(dailyLimits)) {
    console.log('Migrating dailyLimits to array format...');
    const newLimits = [];
    for (const [domain, mins] of Object.entries(dailyLimits)) {
      const usedSecs = usageToday[domain] || 0;
      newLimits.push({
        id: Date.now() + '-' + Math.floor(Math.random() * 1000),
        raw: domain,
        host: normalizeHost(domain),
        pathPrefix: '/',
        minutes: mins,
        usedMs: usedSecs * 1000
      });
    }
    await chrome.storage.local.set({ dailyLimits: newLimits });
    console.log('dailyLimits migration complete:', newLimits);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await migrateDailyLimits();
  await renderOptions();
  startActiveTimers();
  document.addEventListener('dinkit-language-change', () => { renderOptions().catch(console.error); });

  // Listen for storage updates to refresh dashboard in real-time
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
      await renderOptions();
    }
  });

  // --- Blocklist Event Listeners ---
  document.getElementById('blocklist-add-btn').addEventListener('click', addBlocklistItem);
  document.getElementById('blocklist-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBlocklistItem();
  });

  // --- Daily Limits Event Listeners ---
  document.getElementById('limit-set-btn').addEventListener('click', setDailyLimitItem);
  document.getElementById('limit-time-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setDailyLimitItem();
  });

  // --- Preset Toggles ---
  setupPresetToggle('preset-youtube-cb', 'youtube_learning');
  setupPresetToggle('preset-social-cb', 'social_hard_block');
  setupPresetToggle('preset-reddit-cb', 'reddit_research');

  // Reddit Whitelist Save Button
  document.getElementById('reddit-whitelist-save-btn').addEventListener('click', saveRedditWhitelist);
  document.getElementById('reddit-whitelist-input').addEventListener('input', event => {
    event.target.dataset.dirty = 'true';
  });

  // --- Strict Mode Toggle ---
  const strictCb = document.getElementById('strict-mode-cb');
  strictCb.addEventListener('click', async (e) => {
    const data = await chrome.storage.local.get(['focus', 'settings']);
    const focus = data.focus || {};
    const settings = data.settings || {};

    if (focus.active && settings.strictMode) {
      e.preventDefault();
      alert(t('strictActive'));
      return;
    }

    settings.strictMode = strictCb.checked;
    await chrome.storage.local.set({ settings });
  });

  // --- Emergency Unlock ---
  document.getElementById('unlock-trigger-btn').addEventListener('click', triggerEmergencyUnlock);

  // --- Clear Pending Changes ---
  document.getElementById('clear-pending-btn').addEventListener('click', async () => {
    await chrome.storage.local.set({ pendingChanges: [] });
  });

  // --- Import / Export ---
  document.getElementById('export-settings-btn').addEventListener('click', exportSettings);
  document.getElementById('import-settings-btn').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importSettings(file);
    }
  });
});

// --- Active Countdown Timers (For Unlock & Focus) ---
let unlockInterval = null;

function startActiveTimers() {
  if (unlockInterval) clearInterval(unlockInterval);

  unlockInterval = setInterval(async () => {
    const data = await chrome.storage.local.get(['unlocks']);
    const unlocks = data.unlocks || [];
    const now = Date.now();
    const activeUnlock = unlocks.find(u => now - u.timestamp < u.duration * 60 * 1000);

    const activeContainer = document.getElementById('unlock-active-container');
    const formContainer = document.getElementById('unlock-form-container');

    if (activeUnlock) {
      formContainer.style.display = 'none';
      activeContainer.style.display = 'block';

      document.getElementById('active-unlock-domain').textContent = activeUnlock.domain;
      const remainingMs = (activeUnlock.timestamp + activeUnlock.duration * 60 * 1000) - now;
      if (remainingMs <= 0) {
        activeContainer.style.display = 'none';
        formContainer.style.display = 'block';
      } else {
        const secs = Math.floor(remainingMs / 1000);
        const mins = Math.floor(secs / 60);
        const remainingSecs = secs % 60;
        document.getElementById('active-unlock-timer').textContent = 
          `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
      }
    } else {
      activeContainer.style.display = 'none';
      formContainer.style.display = 'block';
    }
  }, 1000);
}

// --- Render Helper ---

async function renderOptions() {
  const data = await chrome.storage.local.get([
    'blockRules',
    'dailyLimits',
    'usageToday',
    'blockedAttempts',
    'focus',
    'focusHistory',
    'unlocks',
    'pendingChanges',
    'settings'
  ]);

  const blockRules = data.blockRules || [];
  const dailyLimits = data.dailyLimits || [];
  const usageToday = data.usageToday || {};
  const blockedAttempts = data.blockedAttempts || [];
  const focus = data.focus || { active: false };
  const focusHistory = data.focusHistory || [];
  const unlocks = data.unlocks || [];
  const pendingChanges = data.pendingChanges || [];
  const settings = data.settings || { strictMode: false, enabledPresets: [], redditWhitelisted: [] };

  const isFocusActive = focus.active;
  const isStrictActive = settings.strictMode;

  // 1. Render Blocklist
  const blocklistList = document.getElementById('blocklist-list');
  blocklistList.innerHTML = '';
  if (blockRules.length === 0) {
    blocklistList.innerHTML = `<li class="label">${t('emptyBlocklist')}</li>`;
  } else {
    blockRules.forEach(rule => {
      const li = document.createElement('li');
      li.textContent = rule.raw;
      
      const isPendingRemoval = pendingChanges.some(c => c.type === 'removeBlock' && c.pattern === rule.raw);
      if (isPendingRemoval) {
        const span = document.createElement('span');
        span.className = 'text-yellow';
        span.style.fontSize = '14px';
        span.textContent = t('pendingRemoval');
        li.appendChild(span);
      } else {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = t('remove');
        removeBtn.addEventListener('click', () => removeBlocklistItem(rule.raw, isFocusActive, isStrictActive));
        li.appendChild(removeBtn);
      }
      blocklistList.appendChild(li);
    });
  }

  // 2. Render Daily Limits
  const limitsList = document.getElementById('limits-list');
  limitsList.innerHTML = '';
  if (dailyLimits.length === 0) {
    limitsList.innerHTML = `<li class="label">${t('emptyLimits')}</li>`;
  } else {
    dailyLimits.forEach(rule => {
      const li = document.createElement('li');
      
      const usedSecs = Math.floor((rule.usedMs || 0) / 1000);
      const usedMins = Math.floor(usedSecs / 60);
      li.textContent = t('limitUsage', { rule: rule.raw, minutes: rule.minutes, used: usedMins });

      const isPendingRemoval = pendingChanges.some(c => c.type === 'reduceLimit' && c.limitId === rule.id && c.value === null);
      const isPendingReduction = pendingChanges.some(c => c.type === 'reduceLimit' && c.limitId === rule.id && c.value !== null);

      if (isPendingRemoval) {
        const span = document.createElement('span');
        span.className = 'text-yellow';
        span.style.fontSize = '14px';
        span.textContent = t('pendingDelete');
        li.appendChild(span);
      } else if (isPendingReduction) {
        const pendingValue = pendingChanges.find(c => c.type === 'reduceLimit' && c.limitId === rule.id).value;
        const span = document.createElement('span');
        span.className = 'text-yellow';
        span.style.fontSize = '14px';
        span.textContent = t('pendingLimit', { minutes: pendingValue });
        li.appendChild(span);
      } else {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = t('delete');
        removeBtn.addEventListener('click', () => removeDailyLimitItem(rule.id, isFocusActive, isStrictActive));
        li.appendChild(removeBtn);
      }
      limitsList.appendChild(li);
    });
  }

  // 3. Render Presets
  const enabledPresets = settings.enabledPresets || [];
  document.getElementById('preset-youtube-cb').checked = enabledPresets.includes('youtube_learning');
  document.getElementById('preset-social-cb').checked = enabledPresets.includes('social_hard_block');
  document.getElementById('preset-reddit-cb').checked = enabledPresets.includes('reddit_research');

  // Nested Reddit Whitelist Section
  const redditWhitelistSection = document.getElementById('reddit-whitelist-section');
  if (enabledPresets.includes('reddit_research')) {
    redditWhitelistSection.style.display = 'flex';
    const input = document.getElementById('reddit-whitelist-input');
    if (input.dataset.dirty !== 'true') input.value = (settings.redditWhitelisted || []).join(', ');
  } else {
    redditWhitelistSection.style.display = 'none';
  }

  // 4. Strict Mode and Status Cards
  document.getElementById('strict-mode-cb').checked = settings.strictMode;
  const focusStatusText = document.getElementById('focus-status-text');
  if (focus.active) {
    focusStatusText.textContent = `${t('statusOn')} ("${focus.task}")`;
    focusStatusText.className = 'value font-bold text-red';
  } else {
    focusStatusText.textContent = t('statusOff');
    focusStatusText.className = 'value font-bold';
  }

  // 5. Render Pending Changes
  const pendingCard = document.getElementById('pending-changes-card');
  const pendingList = document.getElementById('pending-changes-list');
  const clearPendingBtn = document.getElementById('clear-pending-btn');

  if (pendingChanges.length > 0) {
    pendingCard.style.display = 'block';
    pendingList.innerHTML = '';
    pendingChanges.forEach(change => {
      const li = document.createElement('li');
      if (change.type === 'removeBlock') {
        li.textContent = t('pendingBlock', { name: change.pattern });
      } else if (change.type === 'reduceLimit') {
        const rule = dailyLimits.find(r => r.id === change.limitId);
        const name = rule ? rule.raw : 'Unknown Limit';
        if (change.value === null) {
          li.textContent = t('pendingLimitRemove', { name });
        } else {
          li.textContent = t('pendingLimitIncrease', { name, minutes: change.value });
        }
      } else if (change.type === 'disablePreset') {
        li.textContent = t('pendingPreset', { name: change.preset });
      }
      pendingList.appendChild(li);
    });
    clearPendingBtn.style.display = !isFocusActive ? 'inline-block' : 'none';
  } else {
    pendingCard.style.display = 'none';
  }

  // 6. Analytics Section
  // A. Wasted time today
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
  document.getElementById('stat-wasted').textContent = formatStatsTime(wastedSecs);

  // B. Blocked attempts today
  const midnight = new Date();
  midnight.setHours(0,0,0,0);
  const midnightTimestamp = midnight.getTime();
  const todayBlocksCount = blockedAttempts.filter(a => a.timestamp >= midnightTimestamp).length;
  document.getElementById('stat-blocks').textContent = todayBlocksCount;

  // C. Focus completed / failed today
  const todayCompleted = focusHistory.filter(h => h.timestamp >= midnightTimestamp && h.result === 'Done').length;
  const todayFailed = focusHistory.filter(h => h.timestamp >= midnightTimestamp && h.result === 'Failed').length;
  document.getElementById('stat-focus-done').textContent = todayCompleted;
  document.getElementById('stat-focus-failed').textContent = todayFailed;

  // D. Emergency unlock used today
  const todayUnlocks = unlocks.filter(u => {
    const d = new Date(u.timestamp);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dt}` === getLocalDateString();
  });
  document.getElementById('stat-unlock-used').textContent = t(todayUnlocks.length > 0 ? 'yes' : 'no');

  // 7. Top 5 Domains
  const topList = document.getElementById('top-domains-list');
  topList.innerHTML = '';
  
  const sortedDomains = Object.entries(usageToday)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedDomains.length === 0) {
    topList.innerHTML = `<li class="label">${t('emptyUsage')}</li>`;
  } else {
    sortedDomains.forEach(([domain, secs]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${domain}</span><span class="val">${formatStatsTime(secs)}</span>`;
      topList.appendChild(li);
    });
  }

  // 8. Focus Session Log History
  const historyList = document.getElementById('focus-history-list');
  historyList.innerHTML = '';
  
  const recentHistory = [...focusHistory].reverse().slice(0, 5);
  if (recentHistory.length === 0) {
    historyList.innerHTML = `<li class="label">${t('emptySessions')}</li>`;
  } else {
    recentHistory.forEach(h => {
      const li = document.createElement('li');
      const locale = window.dinkitI18n.language === 'vi' ? 'vi-VN' : 'en-US';
      const timeStr = new Date(h.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(h.timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      const duration = h.durationMinutes || 0;
      
      li.innerHTML = `
        <div class="history-header">
          <span class="history-task">${h.task}</span>
          <span class="history-result ${h.result === 'Done' ? 'res-done' : 'res-failed'}">${t(h.result === 'Done' ? 'done' : 'failed')}</span>
        </div>
        <div class="history-meta">
          <span>${t('sessionDuration', { minutes: duration })}</span>
          <span>${t('sessionDateTime', { date: dateStr, time: timeStr })}</span>
        </div>
      `;
      historyList.appendChild(li);
    });
  }

  const triggerBtn = document.getElementById('unlock-trigger-btn');
  const activeUnlock = unlocks.find(u => Date.now() - u.timestamp < u.duration * 60 * 1000);

  if (activeUnlock) {
    triggerBtn.disabled = true;
  } else if (todayUnlocks.length >= 1) {
    triggerBtn.disabled = true;
    document.getElementById('unlock-error').textContent = t('unlockLimit');
    document.getElementById('unlock-error').style.display = 'block';
  } else {
    triggerBtn.disabled = false;
    document.getElementById('unlock-error').style.display = 'none';
  }
}

// --- Preset Toggle Logic Helper ---

function setupPresetToggle(elementId, presetName) {
  const cb = document.getElementById(elementId);
  cb.addEventListener('click', async (e) => {
    const data = await chrome.storage.local.get(['focus', 'settings', 'pendingChanges']);
    const focus = data.focus || {};
    const settings = data.settings || {};
    const pendingChanges = data.pendingChanges || [];
    const enabledPresets = settings.enabledPresets || [];

    const isFocusActive = focus.active;
    const isStrictActive = settings.strictMode;

    if (cb.checked) {
      if (!enabledPresets.includes(presetName)) {
        enabledPresets.push(presetName);
        settings.enabledPresets = enabledPresets;
        await chrome.storage.local.set({ settings });
      }
    } else {
      if (isFocusActive && isStrictActive) {
        e.preventDefault();
        alert(t('strictActive'));
        return;
      }

      if (!isFocusActive && isStrictActive) {
        e.preventDefault();
        const alreadyPending = pendingChanges.some(c => c.type === 'disablePreset' && c.preset === presetName);
        if (!alreadyPending) {
          pendingChanges.push({ type: 'disablePreset', preset: presetName });
          await chrome.storage.local.set({ pendingChanges });
          alert(t('strictPreset'));
        }
      } else {
        const idx = enabledPresets.indexOf(presetName);
        if (idx !== -1) {
          enabledPresets.splice(idx, 1);
          settings.enabledPresets = enabledPresets;
          await chrome.storage.local.set({ settings });
        }
      }
    }
  });
}

// --- Action Implementations ---

// Add Blocklist
async function addBlocklistItem() {
  const input = document.getElementById('blocklist-input');
  const errorEl = document.getElementById('blocklist-error');
  const value = input.value.trim().toLowerCase();

  if (!value) {
    errorEl.textContent = t('enterDomain');
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';

  const data = await chrome.storage.local.get(['blockRules']);
  let blockRules = data.blockRules || [];

  const parsed = parseUserRule(value);

  if (blockRules.some(r => r.raw === parsed.raw)) {
    errorEl.textContent = t('duplicateDomain');
    errorEl.style.display = 'block';
    return;
  }

  blockRules.push(parsed);
  await chrome.storage.local.set({ blockRules });
  input.value = '';
}

// Remove Blocklist
async function removeBlocklistItem(rawRule, isFocusActive, isStrictActive) {
  if (isFocusActive && isStrictActive) {
    alert(t('strictActive'));
    return;
  }

  const data = await chrome.storage.local.get(['blockRules', 'pendingChanges']);
  let blockRules = data.blockRules || [];
  let pendingChanges = data.pendingChanges || [];

  if (isStrictActive && !isFocusActive) {
    const alreadyPending = pendingChanges.some(c => c.type === 'removeBlock' && c.pattern === rawRule);
    if (!alreadyPending) {
      pendingChanges.push({ type: 'removeBlock', pattern: rawRule });
      await chrome.storage.local.set({ pendingChanges });
      alert(t('strictBlockRemoval'));
    }
  } else {
    blockRules = blockRules.filter(r => r.raw !== rawRule);
    await chrome.storage.local.set({ blockRules });
  }
}

// Set Daily Limit
async function setDailyLimitItem() {
  const domainInput = document.getElementById('limit-domain-input');
  const timeInput = document.getElementById('limit-time-input');
  const errorEl = document.getElementById('limits-error');

  let domain = domainInput.value.trim().toLowerCase();
  const minsStr = timeInput.value.trim();

  if (!domain || !minsStr) {
    errorEl.textContent = t('enterLimit');
    errorEl.style.display = 'block';
    return;
  }
  const mins = parseInt(minsStr, 10);
  if (isNaN(mins) || mins < 0) {
    errorEl.textContent = t('positiveNumber');
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';

  // Parse using shared parseUserRule logic
  const parsedRule = parseUserRule(domain);

  const data = await chrome.storage.local.get(['dailyLimits', 'focus', 'settings', 'pendingChanges']);
  let dailyLimits = data.dailyLimits || [];
  const focus = data.focus || {};
  const settings = data.settings || {};
  const pendingChanges = data.pendingChanges || [];

  const existingRule = dailyLimits.find(r => r.raw === parsedRule.raw);
  const isFocusActive = focus.active;
  const isStrictActive = settings.strictMode;

  const isStrengthening = (existingRule === undefined) || (mins < existingRule.minutes);

  if (isStrengthening) {
    if (existingRule) {
      existingRule.minutes = mins;
    } else {
      dailyLimits.push({
        id: Date.now() + '-' + Math.floor(Math.random() * 1000),
        raw: parsedRule.raw,
        host: parsedRule.host,
        pathPrefix: parsedRule.pathPrefix,
        minutes: mins,
        usedMs: 0
      });
    }
    await chrome.storage.local.set({ dailyLimits });
    domainInput.value = '';
    timeInput.value = '';
  } else {
    if (isFocusActive && isStrictActive) {
      alert(t('strictActive'));
      return;
    }

    if (!isFocusActive && isStrictActive) {
      const alreadyPending = pendingChanges.some(c => c.type === 'reduceLimit' && c.limitId === existingRule.id);
      if (!alreadyPending) {
        pendingChanges.push({ type: 'reduceLimit', limitId: existingRule.id, value: mins });
        await chrome.storage.local.set({ pendingChanges });
        alert(t('strictLimitIncrease'));
        domainInput.value = '';
        timeInput.value = '';
      } else {
        alert(t('pendingAlready'));
      }
    } else {
      existingRule.minutes = mins;
      await chrome.storage.local.set({ dailyLimits });
      domainInput.value = '';
      timeInput.value = '';
    }
  }
}

// Remove Daily Limit
async function removeDailyLimitItem(limitId, isFocusActive, isStrictActive) {
  if (isFocusActive && isStrictActive) {
    alert(t('strictActive'));
    return;
  }

  const data = await chrome.storage.local.get(['dailyLimits', 'pendingChanges']);
  let dailyLimits = data.dailyLimits || [];
  let pendingChanges = data.pendingChanges || [];

  if (isStrictActive && !isFocusActive) {
    const alreadyPending = pendingChanges.some(c => c.type === 'reduceLimit' && c.limitId === limitId && c.value === null);
    if (!alreadyPending) {
      pendingChanges.push({ type: 'reduceLimit', limitId: limitId, value: null });
      await chrome.storage.local.set({ pendingChanges });
      alert(t('strictLimitRemove'));
    }
  } else {
    dailyLimits = dailyLimits.filter(r => r.id !== limitId);
    await chrome.storage.local.set({ dailyLimits });
  }
}

// Save Reddit Whitelist Subreddits
async function saveRedditWhitelist() {
  const input = document.getElementById('reddit-whitelist-input');
  const feedback = document.getElementById('reddit-whitelist-feedback');
  
  const subs = input.value.split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || {};
  settings.redditWhitelisted = subs;
  
  await chrome.storage.local.set({ settings });
  input.dataset.dirty = 'false';
  
  feedback.style.display = 'block';
  setTimeout(() => {
    feedback.style.display = 'none';
  }, 3000);
}

// Trigger Emergency Unlock
async function triggerEmergencyUnlock() {
  const domainInput = document.getElementById('unlock-domain-input');
  const reasonInput = document.getElementById('unlock-reason-input');
  const errorEl = document.getElementById('unlock-error');

  let domain = domainInput.value.trim().toLowerCase();
  const reason = reasonInput.value.trim();

  if (!domain || !reason) {
    errorEl.textContent = t('enterUnlock');
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';

  domain = domain.replace(/^https?:\/\//i, '');
  if (domain.startsWith('www.')) domain = domain.substring(4);
  const slashIdx = domain.indexOf('/');
  if (slashIdx !== -1) domain = domain.substring(0, slashIdx);

  const data = await chrome.storage.local.get(['unlocks']);
  const unlocks = data.unlocks || [];
  const now = Date.now();

  const today = getLocalDateString();
  const todayUnlocks = unlocks.filter(u => {
    const d = new Date(u.timestamp);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dt}` === today;
  });

  if (todayUnlocks.length >= 1) {
    errorEl.textContent = t('unlockLimit');
    errorEl.style.display = 'block';
    return;
  }

  const newUnlock = {
    timestamp: now,
    domain: domain,
    reason: reason,
    duration: 5
  };

  unlocks.push(newUnlock);
  await chrome.storage.local.set({ unlocks });

  chrome.alarms.create(`emergency-unlock-end-${domain}`, { delayInMinutes: 5 });

  domainInput.value = '';
  reasonInput.value = '';

  alert(t('unlockActivated', { domain }));
}

// --- General Utility Helpers ---

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function formatStatsTime(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return '0m';
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.round((totalSecs % 3600) / 60);
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

// --- Import / Export Functions ---

function generateBackupFilename() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `focus-firewall-backup-${year}-${month}-${date}.json`;
}

async function exportSettings() {
  const statusEl = document.getElementById('import-export-status');
  statusEl.style.display = 'none';
  
  try {
    const data = await chrome.storage.local.get([
      'settings',
      'blockRules',
      'dailyLimits',
      'pendingChanges'
    ]);

    const payload = {
      app: "Focus Firewall",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        settings: data.settings || {},
        blockRules: data.blockRules || [],
        dailyLimits: data.dailyLimits || [],
        enabledPresets: data.settings?.enabledPresets || [],
        presetConfig: data.settings?.presetConfig || {},
        pendingChanges: data.pendingChanges || []
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateBackupFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    statusEl.textContent = t('exported');
    statusEl.className = 'success-text';
    statusEl.style.display = 'block';
  } catch (e) {
    statusEl.textContent = t('exportFailed', { error: e.message });
    statusEl.className = 'error-text';
    statusEl.style.display = 'block';
  }
}

function validateBackupJson(json) {
  if (!json || typeof json !== 'object') {
    return t('invalidBackup');
  }
  if (json.app !== "Focus Firewall") {
    return t('invalidBackup');
  }
  if (json.schemaVersion !== 1) {
    return t('unsupportedSchema');
  }
  if (!json.data || typeof json.data !== 'object') {
    return t('noBackupData');
  }
  const data = json.data;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
  if (!object(data) || (data.settings !== undefined && !object(data.settings)) ||
      (data.blockRules !== undefined && (!Array.isArray(data.blockRules) || !data.blockRules.every(rule => typeof rule === 'string' || (object(rule) && typeof rule.raw === 'string')))) ||
      (data.dailyLimits !== undefined && (!Array.isArray(data.dailyLimits) || !data.dailyLimits.every(rule => object(rule) && typeof rule.raw === 'string' && Number.isInteger(Number(rule.minutes)) && Number(rule.minutes) >= 0))) ||
      (data.enabledPresets !== undefined && !strings(data.enabledPresets)) ||
      (data.pendingChanges !== undefined && (!Array.isArray(data.pendingChanges) || !data.pendingChanges.every(object)))) return t('invalidBackup');
  const settings = data.settings || {};
  if ((settings.enabledPresets !== undefined && !strings(settings.enabledPresets)) ||
      (settings.redditWhitelisted !== undefined && !strings(settings.redditWhitelisted)) ||
      (settings.strictMode !== undefined && typeof settings.strictMode !== 'boolean') ||
      (settings.healthyFeed !== undefined && !object(settings.healthyFeed))) return t('invalidBackup');
  return null;
}

function importSettings(file) {
  const statusEl = document.getElementById('import-export-status');
  statusEl.style.display = 'none';

  if (file.size > 1024 * 1024) {
    statusEl.textContent = t('fileTooLarge');
    statusEl.className = 'error-text';
    statusEl.style.display = 'block';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const json = JSON.parse(text);

      const validationError = validateBackupJson(json);
      if (validationError) {
        statusEl.textContent = t('importFailed', { error: validationError });
        statusEl.className = 'error-text';
        statusEl.style.display = 'block';
        return;
      }

      const replace = confirm(t('importConfirm'));

      if (replace) {
        await replaceSettings(json.data);
      } else {
        await mergeSettings(json.data);
      }

      statusEl.textContent = t('imported');
      statusEl.className = 'success-text';
      statusEl.style.display = 'block';

      document.getElementById('import-file-input').value = '';
    } catch (err) {
      statusEl.textContent = t('invalidJson');
      statusEl.className = 'error-text';
      statusEl.style.display = 'block';
    }
  };
  reader.onerror = () => {
    statusEl.textContent = t('readFailed');
    statusEl.className = 'error-text';
    statusEl.style.display = 'block';
  };
  reader.readAsText(file);
}

async function replaceSettings(imported) {
  const blockRules = [];
  if (Array.isArray(imported.blockRules)) {
    imported.blockRules.forEach(rule => {
      const raw = rule.raw || rule;
      if (typeof raw === 'string' && raw.trim()) {
        blockRules.push(parseUserRule(raw));
      }
    });
  }

  const dailyLimits = [];
  if (Array.isArray(imported.dailyLimits)) {
    imported.dailyLimits.forEach(rule => {
      const raw = rule.raw;
      const minutes = parseInt(rule.minutes, 10);
      if (typeof raw === 'string' && !isNaN(minutes) && minutes >= 0) {
        const parsed = parseUserRule(raw);
        if (rule.exactUrl === raw) {
          try { const url = new URL(raw); if (['http:', 'https:'].includes(url.protocol) && !url.hash && url.href === raw) { parsed.exactUrl = raw; parsed.host = normalizeHost(url.hostname); parsed.pathPrefix = url.pathname; } } catch {}
        }
        dailyLimits.push({
          id: rule.id || (Date.now() + '-' + Math.floor(Math.random() * 1000)),
          raw: parsed.raw,
          host: parsed.host,
          pathPrefix: parsed.pathPrefix,
          ...(parsed.exactUrl ? { exactUrl: parsed.exactUrl } : {}),
          minutes: minutes,
          usedMs: 0
        });
      }
    });
  }

  const settings = imported.settings || {};
  if (Array.isArray(imported.enabledPresets)) {
    settings.enabledPresets = imported.enabledPresets;
  }
  if (imported.presetConfig) {
    settings.presetConfig = imported.presetConfig;
  }
  if (settings.strictMode === undefined) {
    settings.strictMode = false;
  }

  const pendingChanges = imported.pendingChanges || [];
  const focus = {
    active: false,
    task: '',
    startedAt: 0,
    endsAt: 0,
    durationMinutes: 0,
    pendingLog: false
  };
  const usageToday = {};
  const blockedAttempts = [];
  const unlocks = [];

  await chrome.storage.local.set({
    settings,
    blockRules,
    dailyLimits,
    pendingChanges,
    focus,
    usageToday,
    blockedAttempts,
    unlocks
  });
}

async function mergeSettings(imported) {
  const currentData = await chrome.storage.local.get([
    'blockRules',
    'dailyLimits',
    'settings',
    'pendingChanges'
  ]);
  let blockRules = currentData.blockRules || [];
  let dailyLimits = currentData.dailyLimits || [];
  let settings = currentData.settings || {};
  let pendingChanges = currentData.pendingChanges || [];

  if (Array.isArray(imported.blockRules)) {
    imported.blockRules.forEach(rule => {
      const raw = rule.raw || rule;
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = parseUserRule(raw);
        const exists = blockRules.some(r => r.raw === parsed.raw);
        if (!exists) {
          blockRules.push(parsed);
        }
      }
    });
  }

  if (Array.isArray(imported.dailyLimits)) {
    imported.dailyLimits.forEach(rule => {
      const raw = rule.raw;
      const minutes = parseInt(rule.minutes, 10);
      if (typeof raw === 'string' && !isNaN(minutes) && minutes >= 0) {
        const parsed = parseUserRule(raw);
        if (rule.exactUrl === raw) {
          try { const url = new URL(raw); if (['http:', 'https:'].includes(url.protocol) && !url.hash && url.href === raw) { parsed.exactUrl = raw; parsed.host = normalizeHost(url.hostname); parsed.pathPrefix = url.pathname; } } catch {}
        }
        const existing = dailyLimits.find(r => r.raw === parsed.raw && r.exactUrl === parsed.exactUrl);
        if (existing) {
          existing.minutes = minutes;
        } else {
          dailyLimits.push({
            id: rule.id || (Date.now() + '-' + Math.floor(Math.random() * 1000)),
            raw: parsed.raw,
            host: parsed.host,
            pathPrefix: parsed.pathPrefix,
            ...(parsed.exactUrl ? { exactUrl: parsed.exactUrl } : {}),
            minutes: minutes,
            usedMs: 0
          });
        }
      }
    });
  }

  const importedSettings = imported.settings || {};
  const currentSettings = settings;
  const currentPresets = currentSettings.enabledPresets || [];
  const importedPresets = imported.enabledPresets || importedSettings.enabledPresets || [];
  const mergedPresets = Array.from(new Set([...currentPresets, ...importedPresets]));

  settings = {
    ...currentSettings,
    ...importedSettings,
    enabledPresets: mergedPresets,
    redditWhitelisted: importedSettings.redditWhitelisted || currentSettings.redditWhitelisted || []
  };

  if (Array.isArray(imported.pendingChanges)) {
    imported.pendingChanges.forEach(change => {
      const exists = pendingChanges.some(c => JSON.stringify(c) === JSON.stringify(change));
      if (!exists) {
        pendingChanges.push(change);
      }
    });
  }

  await chrome.storage.local.set({
    settings,
    blockRules,
    dailyLimits,
    pendingChanges
  });
}
