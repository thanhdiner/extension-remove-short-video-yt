/**
 * Focus Firewall - Blocked Landing Page Logic
 */

// --- Helper Functions ---

// Pick one of eight reminders on each blocked-page visit.
// Remember the last one so repeated attempts don't show the same reminder twice.
const MOTIVATION_QUOTES = [
  '5 năm nữa, m sẽ sống cuộc đời mình mơ ước, hay vẫn ngồi đây hối hận vì những năm tháng đã lãng phí?',
  'M muốn tự do tài chính ở tuổi 35, nhưng hôm nay m đã làm gì để xứng đáng với tương lai đó?',
  'M không thiếu thời gian để thay đổi cuộc đời. M đang tự tay ném nó đi từng ngày.',
  'Người khác đang xây dựng tương lai của họ. Còn m đang dành tuổi trẻ để xem cuộc đời của người khác.',
  'Điều đáng sợ không phải là thất bại. Mà là 5 năm nữa, m vẫn ở nguyên chỗ cũ và biết rõ tại sao.',
  'Mỗi lần m chọn lướt thêm, m đang chọn trì hoãn cuộc sống mà chính mình khao khát.',
  'M có thể kiếm lại tiền, nhưng không thể mua lại tuổi 21 mà m đang lãng phí.',
  'Đừng để vài năm nữa, thứ duy nhất m có là câu nói: Giá như ngày đó mình cố gắng hơn.'
];

function showRandomMotivationQuote() {
  const quoteElement = document.getElementById('motivation-quote');
  if (!quoteElement) return;

  let previousIndex = -1;
  try {
    const rawSavedIndex = localStorage.getItem('focusFirewallLastMotivationQuote');
    const savedIndex = Number(rawSavedIndex);
    if (rawSavedIndex !== null && Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < MOTIVATION_QUOTES.length) {
      previousIndex = savedIndex;
    }
  } catch (e) {
    // Storage can be unavailable; random selection still works.
  }

  const choices = MOTIVATION_QUOTES.length - (previousIndex >= 0 ? 1 : 0);
  let index = Math.floor(Math.random() * choices);
  if (previousIndex >= 0 && index >= previousIndex) index += 1;
  quoteElement.dataset.i18n = `quote${index}`;
  quoteElement.textContent = window.dinkitI18n.t(`quote${index}`);

  try {
    localStorage.setItem('focusFirewallLastMotivationQuote', String(index));
  } catch (e) {
    // Don't block the page when storage is unavailable.
  }
}

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

document.addEventListener('DOMContentLoaded', () => {
  showRandomMotivationQuote();

  const params = new URLSearchParams(window.location.search);
  // DNR inserts the URL verbatim. Preserve its original query and escapes.
  const fullUrl = window.location.search.startsWith('?url=') ? window.location.search.slice(5) + window.location.hash : (params.get('url') || '');
  let displayUrl = fullUrl || window.dinkitI18n.t('blockedPage');
  
  // Strip protocol and query parameters for clean display
  try {
    if (displayUrl.startsWith('http')) {
      const urlObj = new URL(displayUrl);
      displayUrl = urlObj.hostname + urlObj.pathname;
    }
  } catch (e) {}

  const blockedUrl = document.getElementById('blocked-url');
  blockedUrl.textContent = displayUrl;
  if (!fullUrl) blockedUrl.dataset.i18n = 'blockedPage';

  // Log the blocked attempt using the full URL
  if (fullUrl) {
    logBlockedAttempt(fullUrl);
  }

  // Focus status monitoring
  updateFocusInfo();

  // "Back to work" button handler
  document.getElementById('back-btn').addEventListener('click', () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab) {
        chrome.tabs.remove(tab.id);
      } else {
        window.history.back();
      }
    });
  });
});

async function logBlockedAttempt(url) {
  try {
    const data = await chrome.storage.local.get(['blockedAttempts', 'blockRules', 'dailyLimits', 'settings']);
    const blockedAttempts = data.blockedAttempts || [];
    const blockRules = data.blockRules || [];
    const dailyLimits = data.dailyLimits || [];
    const settings = data.settings || {};
    const enabledPresets = settings.enabledPresets || [];
    const now = Date.now();

    // Verify if this URL matches any block rules, daily limits, or active presets
    const limitRules = dailyLimits;
    
    const presetRules = [];
    if (enabledPresets.includes('youtube_learning')) {
      presetRules.push(parseUserRule('youtube.com/shorts'));
      presetRules.push(parseUserRule('youtube.com/feed/trending'));
      presetRules.push(parseUserRule('youtube.com/feed/explore'));
    }
    if (enabledPresets.includes('social_hard_block')) {
      presetRules.push(parseUserRule('facebook.com'));
      presetRules.push(parseUserRule('instagram.com'));
      presetRules.push(parseUserRule('tiktok.com'));
      presetRules.push(parseUserRule('x.com'));
      presetRules.push(parseUserRule('twitter.com'));
    }
    if (enabledPresets.includes('reddit_research')) {
      presetRules.push(parseUserRule('reddit.com/r/popular'));
      presetRules.push(parseUserRule('reddit.com/r/all'));
    }

    const allRules = [...blockRules, ...limitRules, ...presetRules];
    const matchesAny = allRules.some(rule => doesUrlMatchRule(url, rule));

    if (matchesAny) {
      // Deduplicate: do not log the exact same url blocked within the last 5 seconds
      const lastAttempt = blockedAttempts[blockedAttempts.length - 1];
      if (!lastAttempt || lastAttempt.url !== url || (now - lastAttempt.timestamp) > 5000) {
        blockedAttempts.push({ url, timestamp: now });
        await chrome.storage.local.set({ blockedAttempts });
      }
    }
  } catch (e) {
    console.error('Failed to log blocked attempt:', e);
  }
}

let timerInterval = null;

async function updateFocusInfo() {
  try {
    const data = await chrome.storage.local.get(['focus']);
    const focus = data.focus || { active: false };
    const focusInfo = document.getElementById('focus-info');

    if (focus.active && focus.endsAt > Date.now()) {
      focusInfo.style.display = 'block';
      const task = document.getElementById('focus-task');
      task.textContent = focus.task || window.dinkitI18n.t('productiveWork');
      if (focus.task) delete task.dataset.i18n;
      else task.dataset.i18n = 'productiveWork';

      if (timerInterval) clearInterval(timerInterval);

      const tick = () => {
        const remaining = focus.endsAt - Date.now();
        if (remaining <= 0) {
          document.getElementById('focus-time').textContent = '00:00';
          clearInterval(timerInterval);
          focusInfo.style.display = 'none';
        } else {
          const totalSecs = Math.floor(remaining / 1000);
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          document.getElementById('focus-time').textContent = 
            `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
      };

      tick();
      timerInterval = setInterval(tick, 1000);
    } else {
      focusInfo.style.display = 'none';
    }
  } catch (e) {
    console.error('Error loading focus state:', e);
  }
}
