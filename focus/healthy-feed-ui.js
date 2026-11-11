document.addEventListener('DOMContentLoaded', async () => {
  const mode = document.getElementById('feed-mode');
  const maxPosts = document.getElementById('feed-max-posts');
  const status = document.getElementById('feed-status');
  const warning = document.getElementById('feed-warning');
  const start = document.getElementById('feed-start');
  const sources = document.getElementById('feed-sources');
  const moreTopics = document.getElementById('feed-more-topics');
  const lessTopics = document.getElementById('feed-less-topics');
  const saveTopics = document.getElementById('feed-save-topics');
  const topicsStatus = document.getElementById('feed-topics-status');
  const compactPopup = !!document.getElementById('focus-root');
  let snapshot;
  let feedback = '';
  const tr = (key, values) => window.dinkitI18n?.t(key, values) || key;
  const translatedError = error => window.dinkitI18n?.error(error) || error;

  async function send(action, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type: 'healthy-feed', action, ...extra });
    if (!response || response.error) throw new Error(response?.error || 'Không kết nối được extension.');
    return response;
  }

  function updateStatus() {
    if (!snapshot) return;
    const { config, session, conflict } = snapshot;
    const phase = HealthyFeed.phase(session);
    start.disabled = config.mode === 'unrestricted' || phase === 'cooldown' || !!conflict;
    if (compactPopup) start.hidden = config.mode === 'unrestricted';
    const t = (key, values) => window.dinkitI18n ? window.dinkitI18n.t(key, values) : ({ feedContinue: 'Tiếp tục đọc cập nhật', readUpdates: 'Đọc cập nhật — 15 phút' }[key] || key);
    start.textContent = t(phase === 'active' ? 'feedContinue' : 'readUpdates');
    if (config.mode === 'unrestricted') status.textContent = compactPopup ? '' : t('feedChoose');
    else if (phase === 'active') status.textContent = t('feedActive', { test: session.id.startsWith('test:') ? t('feedTest') : '', count: session.ids.length, max: session.maxPosts, minutes: Math.max(1, Math.ceil((session.endsAt - Date.now()) / 60000)) });
    else if (phase === 'cooldown') status.textContent = t('feedCooldown', { minutes: Math.max(1, Math.ceil((session.cooldownUntil - Date.now()) / 60000)) });
    else status.textContent = t('feedReady', { max: config.maxPosts });
    const showConflict = conflict && (!compactPopup || config.mode !== 'unrestricted');
    warning.textContent = translatedError(feedback) || (showConflict ? tr(compactPopup ? 'feedConflictShort' : 'feedConflict') : '');
    warning.hidden = !feedback && !showConflict;
  }

  async function refresh() {
    const data = await chrome.storage.local.get(['settings', 'healthyFeedSession', 'healthyFeedTestSession', 'focus', 'blockRules', 'dailyLimits']);
    const settings = data.settings || {};
    const config = HealthyFeed.config(settings.healthyFeed);
    const matchesFacebookHome = rule => rule.host && ('www.facebook.com' === rule.host || 'www.facebook.com'.endsWith('.' + rule.host)) && (!rule.pathPrefix || rule.pathPrefix === '/');
    const conflict = (settings.enabledPresets || []).includes('social_hard_block') ||
      (data.focus?.active && (data.blockRules || []).some(matchesFacebookHome)) ||
      (Array.isArray(data.dailyLimits) && data.dailyLimits.some(rule => matchesFacebookHome(rule) && (rule.usedMs || 0) >= rule.minutes * 60000));
    const testSession = data.healthyFeedTestSession;
    const activeTest = testSession && HealthyFeed.phase(testSession) === 'active';
    snapshot = { config, session: activeTest ? testSession : data.healthyFeedSession || null, conflict: conflict ? 'Facebook đang bị chặn bởi Social Hard Block, Blocklist hoặc Daily Limits. Điều chỉnh quy tắc đó để dùng Healthy Feed.' : '' };
    mode.value = config.mode;
    mode.dispatchEvent(new Event('dinkit-mode-sync'));
    if (maxPosts) {
      maxPosts.value = config.maxPosts;
      maxPosts.dispatchEvent(new Event('dinkit-mode-sync'));
    }
    for (const [input, topics] of [[moreTopics, config.topics.more], [lessTopics, config.topics.less]]) {
      if (input && input.dataset.dirty !== 'true') {
        input.value = topics.join(', ');
        input.dispatchEvent(new Event('dinkit-topics-sync'));
      }
    }
    if (sources) {
      sources.replaceChildren();
      for (const [source, preference] of Object.entries(config.sources)) {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = `${source.replace('https://www.facebook.com/', '')} · ${tr(({ more: 'feedSourceMore', less: 'feedSourceLess', block: 'feedSourceBlock' })[preference])}`;
        const reset = document.createElement('button');
        reset.className = 'btn btn-primary';
        reset.textContent = tr('resetPreference');
        reset.addEventListener('click', async () => {
          try { await send('preference', { source, preference: 'reset' }); feedback = ''; await refresh(); }
          catch (error) { showError(error); }
        });
        item.append(text, reset);
        sources.appendChild(item);
      }
    }
    updateStatus();
  }

  async function configure() {
    feedback = '';
    try {
      await send('configure', { mode: mode.value, maxPosts: Number(maxPosts?.value || snapshot.config.maxPosts) });
      await refresh();
    } catch (error) {
      await refresh();
      showError(error);
    }
  }
  mode.addEventListener('change', configure);
  maxPosts?.addEventListener('change', configure);
  saveTopics?.addEventListener('click', async () => {
    const split = input => input.value.split(',').map(value => value.trim()).filter(Boolean);
    try {
      document.dispatchEvent(new Event('dinkit-topics-commit'));
      await send('topics', { more: split(moreTopics), less: split(lessTopics) });
      moreTopics.dataset.dirty = 'false';
      lessTopics.dataset.dirty = 'false';
      await refresh();
      topicsStatus.textContent = tr('topicsSaved');
    } catch (error) { topicsStatus.textContent = translatedError(error.message); }
  });
  start.addEventListener('click', async () => {
    feedback = '';
    start.disabled = true;
    try {
      await send('start');
      const tabs = await chrome.tabs.query({ url: ['https://*.facebook.com/*', 'http://*.facebook.com/*'] });
      const home = tabs.find(tab => HealthyFeed.route(tab.url) === 'feed');
      if (home) {
        await chrome.tabs.update(home.id, { active: true });
        await chrome.windows.update(home.windowId, { focused: true });
      } else await chrome.tabs.create({ url: 'https://www.facebook.com/' });
      await refresh();
    } catch (error) { start.disabled = false; showError(error); }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['settings', 'healthyFeedSession', 'healthyFeedTestSession', 'focus', 'blockRules', 'dailyLimits'].some(key => changes[key])) refresh().catch(showError);
  });
  function showError(error) { feedback = error.message; warning.hidden = false; warning.textContent = translatedError(feedback); }
  document.addEventListener('dinkit-language-change', () => { if (snapshot) refresh().catch(showError); });
  await refresh().catch(showError);
  setInterval(updateStatus, 1000);
});
