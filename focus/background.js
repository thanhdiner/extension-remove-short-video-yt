/**
 * Focus Firewall - Background Service Worker
 * Manages core extension state, time tracking, alarms, and declarativeNetRequest rules.
 */

importScripts('healthy-feed-core.js', 'healthy-feed-worker.js', '../dist/worker-language.js', '../dist/json-viewer-worker.js', '../dist/proxy-worker.js', '../dist/auth-worker.js');

const trackingState = {
  activeUrl: null,
  lastChecked: Date.now(),
  isFocused: true,
  isIdle: false
};

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
    
    // Host must match exactly OR urlHost must be a subdomain of ruleHost
    const hostMatches = (urlHost === ruleHost) || urlHost.endsWith('.' + ruleHost);
    if (!hostMatches) {
      return false;
    }
    
    // If rule pathPrefix is "/" then block entire host
    if (rule.pathPrefix === '/') {
      return true;
    }
    
    // Otherwise, URL pathname must start with rule pathPrefix
    let urlPath = url.pathname;
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }
    
    return urlPath.startsWith(rule.pathPrefix);
  } catch (e) {
    return false;
  }
}

function compileRuleToRegex(rule) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (rule.exactUrl) return `^${escape(rule.exactUrl)}$`;
  return `^https?://([a-z0-9-]+\\.)*${escape(rule.host)}(:[0-9]+)?${escape(rule.pathPrefix)}.*$`;
}

function getDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol.startsWith('http')) {
      return normalizeHost(parsed.hostname);
    }
  } catch (e) {}
  return null;
}

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

async function getActiveTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url) {
      return tabs[0].url;
    }
  } catch (e) {
    console.error('Error querying active tab URL:', e);
  }
  return null;
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

// --- Test Suite ---
function runTests() {
  const tests = [
    { rule: "youtube.com", url: "https://youtube.com", expected: true },
    { rule: "youtube.com", url: "https://www.youtube.com", expected: true },
    { rule: "youtube.com", url: "https://youtube.com/watch?v=abc", expected: true },
    { rule: "youtube.com", url: "https://www.youtube.com/shorts/abc", expected: true },
    
    { rule: "youtube.com/shorts", url: "https://youtube.com/shorts", expected: true },
    { rule: "youtube.com/shorts", url: "https://youtube.com/shorts/", expected: true },
    { rule: "youtube.com/shorts", url: "https://youtube.com/shorts/abc", expected: true },
    { rule: "youtube.com/shorts", url: "https://www.youtube.com/shorts/abc", expected: true },
    { rule: "youtube.com/shorts", url: "https://youtube.com", expected: false },
    { rule: "youtube.com/shorts", url: "https://youtube.com/", expected: false },
    { rule: "youtube.com/shorts", url: "https://youtube.com/watch?v=abc", expected: false },
    { rule: "youtube.com/shorts", url: "https://youtube.com/feed/subscriptions", expected: false },
    
    { rule: "reddit.com/r/all", url: "https://reddit.com/r/all", expected: true },
    { rule: "reddit.com/r/all", url: "https://reddit.com/r/all/", expected: true },
    { rule: "reddit.com/r/all", url: "https://www.reddit.com/r/all/top", expected: true },
    { rule: "reddit.com/r/all", url: "https://reddit.com", expected: false },
    { rule: "reddit.com/r/all", url: "https://reddit.com/r/reactjs", expected: false },
  ];

  console.log("--- STARTING FOCUS FIREWALL TESTS ---");
  let passed = 0;
  tests.forEach((t, i) => {
    const parsedRule = parseUserRule(t.rule);
    const result = doesUrlMatchRule(t.url, parsedRule);
    const isOk = result === t.expected;
    if (isOk) passed++;
    console.log(`Test ${i+1}: Rule[${t.rule}] URL[${t.url}] Expected[${t.expected}] Got[${result}] -> ${isOk ? "PASSED" : "FAILED"}`);
  });
  console.log(`--- TESTS COMPLETE: ${passed}/${tests.length} PASSED ---`);
}

// --- Rule Updater ---

let blockingRulesQueue = Promise.resolve();
function updateBlockingRules() {
  const operation = blockingRulesQueue.catch(() => {}).then(applyBlockingRules);
  blockingRulesQueue = operation;
  return operation;
}
async function applyBlockingRules() {
  const data = await chrome.storage.local.get([
    'blockRules',
    'dailyLimits',
    'usageToday',
    'settings',
    'focus',
    'unlocks'
  ]);

  const blockRules = data.blockRules || [];
  const dailyLimits = data.dailyLimits || [];
  const usageToday = data.usageToday || {};
  const settings = data.settings || { strictMode: false, enabledPresets: [], redditWhitelisted: [] };
  const focus = data.focus || { active: false };
  const unlocks = data.unlocks || [];
  const enabledPresets = settings.enabledPresets || [];

  const now = Date.now();
  const activeUnlocks = unlocks.filter(u => now - u.timestamp < u.duration * 60 * 1000);
  const unlockedDomains = activeUnlocks.map(u => u.domain);

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map(r => r.id);

  const rulesToAdd = [];
  let ruleId = 1;
  const extensionId = chrome.runtime.id;
  const rulesToBlock = [];

  // 1. Focus Mode Blocks
  if (focus.active) {
    blockRules.forEach(rule => {
      rulesToBlock.push(rule);
    });
  }

  // 2. Preset URL Blocks
  if (enabledPresets.includes('youtube_learning')) {
    rulesToBlock.push(parseUserRule('youtube.com/shorts'));
    rulesToBlock.push(parseUserRule('youtube.com/feed/trending'));
    rulesToBlock.push(parseUserRule('youtube.com/feed/explore'));
  }
  if (enabledPresets.includes('social_hard_block')) {
    rulesToBlock.push(parseUserRule('facebook.com'));
    rulesToBlock.push(parseUserRule('instagram.com'));
    rulesToBlock.push(parseUserRule('tiktok.com'));
    rulesToBlock.push(parseUserRule('x.com'));
    rulesToBlock.push(parseUserRule('twitter.com'));
  }
  if (enabledPresets.includes('reddit_research')) {
    rulesToBlock.push(parseUserRule('reddit.com/r/popular'));
    rulesToBlock.push(parseUserRule('reddit.com/r/all'));
  }

  // 3. Daily Limit Blocks
  for (const rule of dailyLimits) {
    const limitMs = rule.minutes * 60 * 1000;
    if ((rule.usedMs || 0) >= limitMs) {
      rulesToBlock.push(rule);
    }
  }

  // Generate Rules
  if (HealthyFeed.config(settings.healthyFeed).mode !== 'unrestricted') {
    rulesToAdd.push({
      id: ruleId++,
      priority: 5,
      action: { type: 'redirect', redirect: { regexSubstitution: `chrome-extension://${extensionId}/focus/blocked.html?url=\\0` } },
      condition: {
        regexFilter: '^https?://([a-z0-9-]+\\.)*facebook\\.com/(reels?|watch|videos)([/?#].*)?$',
        resourceTypes: ['main_frame']
      }
    });
  }

  for (const rule of rulesToBlock) {
    // Check if the rule host is unlocked via emergency unlock
    const isUnlocked = unlockedDomains.some(unlockedDom => {
      return rule.host === unlockedDom || rule.host.endsWith('.' + unlockedDom);
    });

    if (isUnlocked) {
      // Allow bypass rule
      rulesToAdd.push({
        id: ruleId++,
        priority: 10,
        action: { type: 'allow' },
        condition: {
          urlFilter: `||${rule.host}^`,
          resourceTypes: ['main_frame']
        }
      });
      continue;
    }

    const regexFilter = compileRuleToRegex(rule);
    rulesToAdd.push({
      id: ruleId++,
      priority: 5,
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: `chrome-extension://${extensionId}/focus/blocked.html?url=\\0`
        }
      },
      condition: {
        regexFilter: regexFilter,
        ...(rule.exactUrl ? { isUrlFilterCaseSensitive: true } : {}),
        resourceTypes: ['main_frame']
      }
    });
  }

  // Special handling for Reddit Research Mode whitelisted subreddits
  if (enabledPresets.includes('reddit_research')) {
    const isRedditUnlocked = unlockedDomains.some(u => u === 'reddit.com');
    if (!isRedditUnlocked) {
      const redditWhitelisted = settings.redditWhitelisted || [];
      
      // Inject Whitelist exceptions (higher priority than general subreddit block)
      redditWhitelisted.forEach(sub => {
        if (sub.trim()) {
          rulesToAdd.push({
            id: ruleId++,
            priority: 8,
            action: { type: 'allow' },
            condition: {
              regexFilter: `^https?://([a-z0-9-]+\\.)*reddit\\.com/r/${sub.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([/?#].*)?$`,
              resourceTypes: ['main_frame']
            }
          });
        }
      });

      // Block all other subreddits (priority 6, which is lower than whitelist but higher than default redirect)
      rulesToAdd.push({
        id: ruleId++,
        priority: 6,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: `chrome-extension://${extensionId}/focus/blocked.html?url=\\0`
          }
        },
        condition: {
          regexFilter: '^https?://([a-z0-9-]+\\.)*reddit\\.com/r/[a-zA-Z0-9_]+([/?#].*)?$',
          resourceTypes: ['main_frame']
        }
      });

      // Block search page
      rulesToAdd.push({
        id: ruleId++,
        priority: 6,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: `chrome-extension://${extensionId}/focus/blocked.html?url=\\0`
          }
        },
        condition: {
          regexFilter: '^https?://([a-z0-9-]+\\.)*reddit\\.com/search([/?#].*)?$',
          resourceTypes: ['main_frame']
        }
      });
    }
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rulesToAdd
  });
}

// --- Active Tab Time Tracking ---

let trackingQueue = Promise.resolve();
function handleStateChange(reason, transition = {}) {
  const operation = trackingQueue.catch(() => {}).then(() => recordStateChange(reason, transition));
  trackingQueue = operation;
  return operation;
}
async function recordStateChange(reason, transition) {
  const now = Date.now();
  const elapsedMs = now - trackingState.lastChecked;
  const elapsedSecs = Math.round(elapsedMs / 1000);

  const data = await chrome.storage.local.get(['usageToday', 'dailyLimits', 'focus']);
  let usageToday = data.usageToday || {};
  let dailyLimits = data.dailyLimits || [];
  const focus = data.focus || { active: false };
  let limitExceededChanged = false;

  const activeUrl = await getActiveTabUrl();

  if (trackingState.activeUrl && trackingState.isFocused && !trackingState.isIdle && elapsedMs > 0) {
    const elapsed = elapsedMs; // in milliseconds

    // Update Daily Limits rules matching the active URL
    let limitsUpdated = false;
    for (const rule of dailyLimits) {
      if (doesUrlMatchRule(trackingState.activeUrl, rule)) {
        const oldUsed = rule.usedMs || 0;
        const newUsed = oldUsed + elapsed;
        rule.usedMs = newUsed;
        limitsUpdated = true;

        const limitMs = rule.minutes * 60 * 1000;
        if (oldUsed < limitMs && newUsed >= limitMs) {
          limitExceededChanged = true;
        }
      }
    }

    if (limitsUpdated) {
      await chrome.storage.local.set({ dailyLimits });
    }

    // Accumulate total usage for the previous domain (for Top 5 domains calculation)
    const prevDomain = getDomainFromUrl(trackingState.activeUrl);
    if (prevDomain) {
      usageToday[prevDomain] = (usageToday[prevDomain] || 0) + elapsedSecs;
    }
  }

  trackingState.activeUrl = activeUrl;
  trackingState.lastChecked = now;
  Object.assign(trackingState, transition);

  await chrome.storage.local.set({ usageToday });

  if (limitExceededChanged) {
    await updateBlockingRules();
    // Force reload active tab to trigger DNR rule immediately
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.reload(tabs[0].id);
    }
  }
}

// --- Midnight Reset ---

async function checkMidnightReset() {
  const data = await chrome.storage.local.get(['lastResetDate', 'pendingChanges', 'settings', 'blockRules', 'dailyLimits']);
  const today = getLocalDateString();
  
  if (data.lastResetDate !== today) {
    console.log('Midnight reset executing...');

    let blockRules = data.blockRules || [];
    let dailyLimits = data.dailyLimits || [];
    let settings = data.settings || { strictMode: false, enabledPresets: [], redditWhitelisted: [] };
    const pendingChanges = data.pendingChanges || [];

    pendingChanges.forEach(change => {
      if (change.type === 'removeBlock') {
        blockRules = blockRules.filter(p => p.raw !== change.pattern);
      } else if (change.type === 'reduceLimit') {
        if (change.value === null) {
          dailyLimits = dailyLimits.filter(r => r.id !== change.limitId);
        } else {
          const rule = dailyLimits.find(r => r.id === change.limitId);
          if (rule) {
            rule.minutes = change.value;
          }
        }
      } else if (change.type === 'disablePreset') {
        settings.enabledPresets = settings.enabledPresets.filter(p => p !== change.preset);
      }
    });

    // Reset usedMs for every daily limit rule
    dailyLimits.forEach(rule => {
      rule.usedMs = 0;
    });

    await chrome.storage.local.set({
      lastResetDate: today,
      usageToday: {},
      unlocks: [],
      pendingChanges: [],
      blockRules,
      dailyLimits,
      settings
    });

    console.log('Midnight reset completed.');
    return true;
  }
  return false;
}

// --- Event Listeners ---

chrome.tabs.onActivated.addListener(async () => {
  await handleStateChange('tab-activated');
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    await handleStateChange('tab-url-updated');
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await handleStateChange('window-focus-changed', { isFocused: windowId !== chrome.windows.WINDOW_ID_NONE });
});

chrome.idle.setDetectionInterval(30);
chrome.idle.onStateChanged.addListener(async (newState) => {
  await handleStateChange('idle-state-changed', { isIdle: newState === 'idle' || newState === 'locked' });
});

chrome.runtime.onStartup.addListener(async () => {
  trackingState.lastChecked = Date.now();
  trackingState.activeUrl = await getActiveTabUrl();
  await migrateDailyLimits();
  runTests();
  await checkMidnightReset();
  await updateBlockingRules();
  await restoreFocusSession();
});

chrome.runtime.onInstalled.addListener(async () => {
  const keys = [
    'settings',
    'blockRules',
    'dailyLimits',
    'usageToday',
    'blockedAttempts',
    'focus',
    'focusHistory',
    'unlocks',
    'pendingChanges',
    'lastResetDate'
  ];
  const storageData = await chrome.storage.local.get(keys);
  
  const initialData = {};
  if (!storageData.settings) {
    initialData.settings = { strictMode: false, enabledPresets: [], redditWhitelisted: [] };
  }
  if (storageData.blockRules) {
    const needsMigration = storageData.blockRules.some(r => typeof r === 'string');
    if (needsMigration) {
      initialData.blockRules = storageData.blockRules.map(r => typeof r === 'string' ? parseUserRule(r) : r);
    }
  } else {
    initialData.blockRules = [];
  }
  if (storageData.dailyLimits) {
    const needsMigration = typeof storageData.dailyLimits === 'object' && !Array.isArray(storageData.dailyLimits);
    if (!needsMigration) {
      initialData.dailyLimits = storageData.dailyLimits;
    }
  } else {
    initialData.dailyLimits = [];
  }
  if (!storageData.usageToday) {
    initialData.usageToday = {};
  }
  if (!storageData.blockedAttempts) {
    initialData.blockedAttempts = [];
  }
  if (!storageData.focus) {
    initialData.focus = {
      active: false,
      task: '',
      startedAt: 0,
      endsAt: 0,
      durationMinutes: 0,
      pendingLog: false
    };
  }
  if (!storageData.focusHistory) {
    initialData.focusHistory = [];
  }
  if (!storageData.unlocks) {
    initialData.unlocks = [];
  }
  if (!storageData.pendingChanges) {
    initialData.pendingChanges = [];
  }
  if (!storageData.lastResetDate) {
    initialData.lastResetDate = getLocalDateString();
  }

  if (Object.keys(initialData).length > 0) {
    await chrome.storage.local.set(initialData);
  }

  await chrome.alarms.clearAll();
  await chrome.alarms.create('periodic-1min', { periodInMinutes: 1 });

  trackingState.lastChecked = Date.now();
  trackingState.activeUrl = await getActiveTabUrl();
  await migrateDailyLimits();
  runTests();
  await updateBlockingRules();
  await restoreFocusSession();
});

let focusCompletionQueue = Promise.resolve();
async function restoreFocusSession() {
  await finishFocusIfExpired();
  const { focus } = await chrome.storage.local.get(['focus']);
  if (focus?.active && Number.isFinite(focus.endsAt)) {
    await chrome.alarms.create('focus-session-timer', { when: Math.max(Date.now() + 1, focus.endsAt) });
  }
}
function finishFocusIfExpired() {
  const operation = focusCompletionQueue.catch(() => {}).then(async () => {
    const { focus } = await chrome.storage.local.get(['focus']);
    if (!focus?.active || Date.now() < focus.endsAt) return;
    await chrome.storage.local.set({ focus: { ...focus, active: false, pendingLog: true } });
    await chrome.notifications.create('focus-ended', {
      type: 'basic', iconUrl: chrome.runtime.getURL('focus-toolkit-icon128.png'),
      title: 'Focus Firewall',
      message: await globalThis.dinkitWorkerMessage('focusFinished', { task: focus.task }), priority: 2
    });
    await updateBlockingRules();
  });
  focusCompletionQueue = operation;
  return operation;
}

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-1min') {
    await handleStateChange('periodic-flush');
    const didReset = await checkMidnightReset();

    await finishFocusIfExpired();
    if (didReset) await updateBlockingRules();
  } else if (alarm.name === 'focus-session-timer') {
    await finishFocusIfExpired();
  } else if (alarm.name.startsWith('emergency-unlock-end-')) {
    const domain = alarm.name.substring('emergency-unlock-end-'.length);
    console.log(`Emergency unlock alarm ended for ${domain}`);
    await updateBlockingRules();
    
    // Reload tabs that match this domain
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && getDomainFromUrl(tab.url) === domain) {
        chrome.tabs.reload(tab.id);
      }
    }
  }
});

// Storage Change listener (Syncs DNR rules and Focus timer Alarms)
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'local') {
    let shouldUpdateRules = false;
    
    if (changes.focus || changes.blockRules || changes.dailyLimits || changes.settings || changes.unlocks) {
      shouldUpdateRules = true;
    }
    
    if (shouldUpdateRules) {
      await updateBlockingRules();
    }

    if (changes.focus) {
      const newFocus = changes.focus.newValue;
      const oldFocus = changes.focus.oldValue;
      
      if (newFocus && newFocus.active && (!oldFocus?.active || newFocus.endsAt !== oldFocus.endsAt)) {
        await chrome.alarms.create('focus-session-timer', { when: Math.max(Date.now() + 1, newFocus.endsAt) });
      } else if ((!newFocus || !newFocus.active) && oldFocus && oldFocus.active) {
        await chrome.alarms.clear('focus-session-timer');
        console.log('Focus alarm cleared.');
      }
    }
  }
});
// Serialize popup changes in the service worker so they finish even if the popup closes.
let quickBlockQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'FOCUS_BLOCK_CURRENT_PAGE' || sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('focus/popup.html')) return;
  quickBlockQueue = quickBlockQueue.catch(() => {}).then(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let url;
    try { url = new URL(tab?.url); } catch { return { invalid: true }; }
    if (!['http:', 'https:'].includes(url.protocol) || !['site', 'exact'].includes(message.scope)) return { invalid: true };
    url.hash = '';
    url.username = '';
    url.password = '';
    const raw = message.scope === 'exact' ? url.href : url.hostname.toLowerCase();
    const parsed = parseUserRule(message.scope === 'exact' ? url.hostname + url.pathname : raw);
    parsed.raw = raw;
    if (message.scope === 'exact') parsed.exactUrl = raw;
    const { dailyLimits = [] } = await chrome.storage.local.get('dailyLimits');
    const existing = dailyLimits.find(rule => parsed.exactUrl ? rule.exactUrl === parsed.exactUrl : !rule.exactUrl && rule.host === parsed.host && rule.pathPrefix === '/');
    if (existing) existing.minutes = 0;
    else dailyLimits.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...parsed, minutes: 0, usedMs: 0 });
    await chrome.storage.local.set({ dailyLimits });
    await updateBlockingRules();
    if (Number.isInteger(tab.id)) await chrome.tabs.reload(tab.id);
    return { ok: true, url: raw };
  });
  quickBlockQueue.then(reply, () => reply({ ok: false }));
  return true;
});

let dinkitSettingsQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'DINKIT_SETTINGS_UPDATE' || sender.id !== chrome.runtime.id) return;
  dinkitSettingsQueue = dinkitSettingsQueue.catch(() => {}).then(async () => {
    const { hys_settings = {} } = await chrome.storage.sync.get('hys_settings');
    const next = { enabled: true, shortsRedirect: 'block', notebookEnabled: true, jsonFormatterEnabled: true, altScrollEnabled: true, scrollSpeed: 5, smoothScroll: true, customSeekEnabled: true, seekSeconds: 20, ...hys_settings, ...message.patch };
    await chrome.storage.sync.set({ hys_settings: next });
    const keys = Object.keys(message.patch);
    const send = (tab, payload) => chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    const tasks = [];
    if (keys.some(k => ['enabled', 'shortsRedirect', 'customSeekEnabled', 'seekSeconds'].includes(k))) {
      const tabs = await chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://music.youtube.com/*'] });
      for (const tab of tabs) {
        if (keys.includes('enabled')) tasks.push(send(tab, { type: 'HYS_TOGGLE', enabled: next.enabled }));
        if (keys.includes('shortsRedirect')) tasks.push(send(tab, { type: 'HYS_REDIRECT_MODE', mode: next.shortsRedirect }));
        if (keys.includes('customSeekEnabled') || keys.includes('seekSeconds')) tasks.push(send(tab, { type: 'HYS_SEEK_UPDATE', customSeekEnabled: next.customSeekEnabled, seekSeconds: next.seekSeconds }));
      }
    }
    if (keys.includes('notebookEnabled')) {
      const tabs = await chrome.tabs.query({ url: ['https://notebooklm.google.com/*', 'https://*.notebooklm.google.com/*'] });
      for (const tab of tabs) tasks.push(send(tab, { type: 'NOTEBOOK_TOGGLE', enabled: next.notebookEnabled }));
    }
    if (keys.some(k => ['altScrollEnabled', 'scrollSpeed', 'smoothScroll'].includes(k))) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) tasks.push(send(tab, { type: 'ALTSCROLL_UPDATE', enabled: next.altScrollEnabled, scrollSpeed: next.scrollSpeed, smoothScroll: next.smoothScroll }));
    }
    await Promise.all(tasks);
  });
  dinkitSettingsQueue.then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});
