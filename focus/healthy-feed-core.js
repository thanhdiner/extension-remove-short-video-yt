/* Shared local policy. No network requests or Facebook private APIs. */
(function (root) {
  'use strict';
  const MINUTE = 60 * 1000;
  const SESSION_MS = 15 * MINUTE;
  const COOLDOWN_MS = 120 * MINUTE;
  const MODES = ['information', 'social', 'unrestricted'];
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
  const words = value => fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const topicList = raw => {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter(value => typeof value === 'string').map(words)
      .filter(value => value.length >= 2 && value.length <= 40))].slice(0, 20);
  };
  const matchesTopic = (text, topic) => (` ${text} `).includes(` ${topic} `);
  const usefulTopics = [
    'cong nghe', 'lap trinh', 'nghien cuu', 'hoc tap', 'khoa hoc', 'giao duc', 'dai hoc',
    'tin tuc', 'thoi su', 'tri tue nhan tao', 'machine learning', 'open source', 'an ninh mang',
    'kinh te', 'tai chinh', 'technology', 'tech', 'programming', 'research', 'science',
    'education', 'university', 'software', 'cybersecurity', 'data science', 'gpt', 'llm', 'news'
  ];

  function config(raw = {}) {
    const sources = {};
    for (const [key, value] of Object.entries(raw?.sources || {}).slice(0, 1000)) {
      if (['more', 'less', 'block'].includes(value) && sourceKey(key) === key) sources[key] = value;
    }
    return {
      mode: MODES.includes(raw?.mode) ? raw.mode : 'unrestricted',
      maxPosts: [20, 25, 30].includes(Number(raw?.maxPosts)) ? Number(raw.maxPosts) : 25,
      sources,
      topics: { more: topicList(raw?.topics?.more), less: topicList(raw?.topics?.less) }
    };
  }

  function route(value) {
    try {
      const url = new URL(value, 'https://www.facebook.com');
      if (!/(^|\.)facebook\.com$/.test(url.hostname)) return 'outside';
      if (/^\/(reels?|watch|videos)(\/|$)/i.test(url.pathname)) return 'video';
      if (/^\/(?:home\.php|index\.php|feeds)?\/?$/i.test(url.pathname)) return 'feed';
      return 'other';
    } catch { return 'outside'; }
  }

  function sourceKey(value) {
    try {
      const url = new URL(value, 'https://www.facebook.com');
      if (!/(^|\.)facebook\.com$/.test(url.hostname)) return '';
      if (url.pathname === '/profile.php' && url.searchParams.get('id')) {
        return 'https://www.facebook.com/profile.php?id=' + encodeURIComponent(url.searchParams.get('id'));
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const excluded = /^(reels?|watch|videos|photo|photos|photo\.php|story\.php|permalink\.php|share|sharer|sharer\.php|l\.php|home\.php|index\.php|feeds|search|messages|gaming|marketplace|notifications|friends|help|login)$/i;
      if (!parts.length || excluded.test(parts[0])) return '';
      if (parts[0] === 'groups') return parts[1] ? 'https://www.facebook.com/groups/' + parts[1] : '';
      // Only source links, never guess a source from a post/permalink URL.
      return parts.length === 1 ? 'https://www.facebook.com/' + parts[0] : '';
    } catch { return ''; }
  }

  function classify(post, settings) {
    if (settings.mode === 'unrestricted') return '';
    if (post.reel) return 'reels';
    if (post.sponsored) return 'advertisement';
    const preference = settings.sources[post.source];
    if (preference === 'block') return 'blocked-source';
    const text = words(post.text);
    if (settings.topics?.less?.some(topic => matchesTopic(text, topic))) return 'hidden-topic';
    if (settings.mode === 'social') return '';
    if (post.suggested) return 'suggested';
    if (preference === 'less') return 'less-like-this';
    if (preference === 'more' || settings.topics?.more?.some(topic => matchesTopic(text, topic))) return '';
    if (/\b(meme|ragebait|rage bait|drama|shitpost|showbiz|gossip)\b/.test(text)) return 'entertainment';
    if (post.friend) return '';
    if (usefulTopics.some(topic => matchesTopic(text, topic))) return '';
    const uniqueWords = new Set(text.split(' ').filter(Boolean)).size;
    if (post.externalLink && text.length >= 80 && uniqueWords >= 10) return '';
    if (text.length >= 200 && uniqueWords >= 25) return '';
    return 'low-signal';
  }

  function phase(session, now = Date.now()) {
    if (!session) return 'ready';
    if (session.cooldownUntil && now >= session.cooldownUntil) return 'ready';
    if (now >= session.endsAt || session.ids.length >= session.maxPosts) return 'cooldown';
    return 'active';
  }

  function start(session, settings, now = Date.now()) {
    if (settings.mode === 'unrestricted') return { session, error: 'Chọn Information hoặc Social trước khi mở phiên đọc.' };
    const status = phase(session, now);
    if (status === 'active') return { session };
    if (status === 'cooldown') return { session, error: 'Phiên đọc đang nghỉ. Hãy quay lại khi hết thời gian chờ.' };
    return { session: { id: String(now), startedAt: now, endsAt: now + SESSION_MS, cooldownUntil: now + SESSION_MS + COOLDOWN_MS, maxPosts: settings.maxPosts, ids: [] } };
  }

  function admit(session, id, now = Date.now()) {
    if (!session || now >= session.endsAt || now >= session.cooldownUntil) return { session, allowed: false };
    if (session.ids.includes(id)) return { session, allowed: true };
    if (phase(session, now) !== 'active') return { session, allowed: false };
    const next = { ...session, ids: [...session.ids, id] };
    if (next.ids.length === next.maxPosts) next.cooldownUntil = now + COOLDOWN_MS;
    return { session: next, allowed: true };
  }

  const api = { config, route, sourceKey, classify, phase, start, admit, fold, SESSION_MS, COOLDOWN_MS };
  root.HealthyFeed = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
