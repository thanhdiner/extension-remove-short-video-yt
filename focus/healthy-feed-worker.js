/* Only the service worker writes session state; serialize requests across tabs. */
let healthyFeedQueue = Promise.resolve();

async function handleHealthyFeed(message, sender) {
  // Options pages opened as a tab also have sender.tab; validate their URL.
  const extensionPage = sender.id === chrome.runtime.id && ['popup.html', 'focus/popup.html', 'focus/options.html']
    .some(path => sender.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL(path));
  const facebookPage = sender.id === chrome.runtime.id && HealthyFeed.route(sender.url || '') !== 'outside';
  if (!extensionPage && !facebookPage) throw new Error('Unsupported sender.');
  const data = await chrome.storage.local.get(['settings', 'healthyFeedSession', 'healthyFeedTestSession', 'healthyFeedTestUsedFor']);
  const settings = data.settings || {};
  let config = HealthyFeed.config(settings.healthyFeed);
  let regularSession = data.healthyFeedSession || null;
  let testSession = data.healthyFeedTestSession || null;
  let testUsedFor = data.healthyFeedTestUsedFor;
  const testActive = testSession && HealthyFeed.phase(testSession) === 'active';
  let session = testActive ? testSession : regularSession;
  let allowed;

  if (message.action === 'configure') {
    if (!extensionPage) throw new Error('Open extension settings to change feed mode.');
    const next = HealthyFeed.config({ ...config, mode: message.mode, maxPosts: message.maxPosts });
    const ranks = { information: 2, social: 1, unrestricted: 0 };
    if (settings.strictMode && (ranks[next.mode] < ranks[config.mode] || next.maxPosts > config.maxPosts)) {
      throw new Error('Strict Mode đang bật: không thể nới chế độ hoặc tăng hạn mức.');
    }
    config = next;
    await chrome.storage.local.set({ settings: { ...settings, healthyFeed: config } });
  } else if (message.action === 'topics') {
    if (!extensionPage) throw new Error('Open extension settings to change feed topics.');
    if (!Array.isArray(message.more) || !Array.isArray(message.less) || message.more.length > 20 || message.less.length > 20) {
      throw new Error('Tối đa 20 chủ đề cho mỗi danh sách.');
    }
    const next = HealthyFeed.config({ ...config, topics: { more: message.more, less: message.less } });
    if (settings.strictMode && (next.topics.more.some(topic => !config.topics.more.includes(topic)) ||
      config.topics.less.some(topic => !next.topics.less.includes(topic)))) {
      throw new Error('Strict Mode đang bật: không thể nới bộ lọc chủ đề.');
    }
    config = next;
    await chrome.storage.local.set({ settings: { ...settings, healthyFeed: config } });
  } else if (message.action === 'preference') {
    const key = HealthyFeed.sourceKey(message.source);
    if (!key || !['more', 'less', 'block', 'reset'].includes(message.preference)) throw new Error('Nguồn không hợp lệ.');
    const preferenceRank = { more: 0, reset: 1, less: 2, block: 3 };
    if (settings.strictMode && preferenceRank[message.preference] < preferenceRank[config.sources[key] || 'reset']) throw new Error('Strict Mode đang bật: không thể nới bộ lọc nguồn.');
    if (!Object.hasOwn(config.sources, key) && Object.keys(config.sources).length >= 1000) throw new Error('Đã đạt giới hạn 1.000 nguồn.');
    if (message.preference === 'reset') delete config.sources[key];
    else config.sources[key] = message.preference;
    await chrome.storage.local.set({ settings: { ...settings, healthyFeed: config } });
  } else if (message.action === 'start') {
    if (!testActive) {
      const result = HealthyFeed.start(regularSession, config);
      if (result.error) throw new Error(result.error);
      regularSession = session = result.session;
      await chrome.storage.local.set({ healthyFeedSession: session });
    }
  } else if (message.action === 'test') {
    if (!facebookPage || HealthyFeed.route(sender.url) !== 'feed') throw new Error('Mở trang chủ Facebook để thử Healthy Feed.');
    if (config.mode === 'unrestricted' || !regularSession || HealthyFeed.phase(regularSession) !== 'cooldown' ||
      testUsedFor === regularSession.id || testActive) throw new Error('Phiên thử đã dùng hoặc chưa sẵn sàng.');
    const now = Date.now();
    session = testSession = {
      id: `test:${now}`, startedAt: now, endsAt: now + 2 * 60 * 1000,
      cooldownUntil: Math.max(regularSession.cooldownUntil, now + 2 * 60 * 1000),
      maxPosts: 10, ids: []
    };
    testUsedFor = regularSession.id;
    await chrome.storage.local.set({ healthyFeedTestSession: testSession, healthyFeedTestUsedFor: testUsedFor });
  } else if (message.action === 'admit') {
    if (!facebookPage || HealthyFeed.route(sender.url) !== 'feed') throw new Error('Post counting is limited to the home feed.');
    if (typeof message.id !== 'string' || !message.id || message.id.length > 600 || message.sessionId !== session?.id || config.mode === 'unrestricted') {
      allowed = false;
    } else {
      const result = HealthyFeed.admit(session, message.id);
      allowed = result.allowed;
      if (result.session !== session) {
        if (testActive && result.session.ids.length === result.session.maxPosts) result.session.cooldownUntil = testSession.cooldownUntil;
        session = result.session;
        await chrome.storage.local.set(testActive ? { healthyFeedTestSession: session } : { healthyFeedSession: session });
      }
    }
  } else if (message.action !== 'status') throw new Error('Unknown feed action.');
  const testAvailable = config.mode !== 'unrestricted' && !testActive &&
    !!regularSession && HealthyFeed.phase(regularSession) === 'cooldown' && testUsedFor !== regularSession.id;
  return { config, session, allowed, testAvailable };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'healthy-feed') return;
  healthyFeedQueue = healthyFeedQueue.then(() => handleHealthyFeed(message, sender));
  healthyFeedQueue.then(reply, error => reply({ error: error.message }));
  healthyFeedQueue = healthyFeedQueue.catch(() => {});
  return true;
});
