(() => {
  'use strict';
  const H = HealthyFeed;
  const fallback = {
    panelStart: 'Bắt đầu đọc · 15 phút', panelTest: 'Thử ngay 2 phút · 10 bài', panelCheck: 'Healthy Feed · cần kiểm tra', panelVideo: 'Reels và Watch đã tắt trong Healthy Feed. Mở trang chủ để đọc cập nhật.', panelVideoShort: 'Healthy Feed · Reels/Watch tắt', panelCooldown: 'Bạn đã xem hết bản tin hiện tại. Quay lại sau {minutes} phút.', panelFinishRead: ' Bạn vẫn có thể đọc nốt các bài đã mở.', panelTrialAvailable: ' Có thể thử ngay 2 phút; thời gian nghỉ vẫn giữ nguyên.', panelCooldownShort: 'Healthy Feed · nghỉ {minutes} phút', panelNoPosts: 'Chưa nhận diện được bài trong feed.', panelFiltered: 'Đã lọc {count} bài; chưa có bài phù hợp.', panelTrial: 'Thử nhanh', panelActive: '{label} · {count}/{max} bài · còn {clock}. {detail}', panelReady: 'Tối đa {max} bài · 15 phút · nghỉ 2 giờ sau phiên.', panelReadyShort: 'Healthy Feed · sẵn sàng', panelSourceMore: 'Ưu tiên nguồn', panelSourceLess: 'Ẩn nguồn', panelSourceBlock: 'Chặn nguồn', panelSourceSaved: 'Đã lưu lựa chọn nguồn.', showComments: 'Hiện bình luận', hideComments: 'Ẩn bình luận', panelReelsOff: 'Reels và Watch đã tắt trong Healthy Feed.', panelDrag: 'Kéo Healthy Feed', panelDragHint: 'Kéo để di chuyển', panelExpand: 'Mở Healthy Feed', panelCollapse: 'Thu gọn Healthy Feed'
  };
  const t = (key, values = {}) => globalThis.dinkitContentLanguage?.t(key, values) ?? (fallback[key] || key).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  const html = document.documentElement;
  let config = H.config();
  let session = null;
  let initialized = false;
  let lastUrl = location.href;
  let scanning = false;
  let scheduled = false;
  let discoverAll = true;
  let refreshAll = true;
  let lastPhase;
  let panel;
  let panelShadow;
  let panelText;
  let compactButton;
  let startButton;
  let testButton;
  let testAvailable = false;
  let testStarting = false;
  let statusPending = false;
  let statusRevision = 0;
  let panelCollapsed = false;
  let panelPhase = null;
  let panelPosition = null;
  let panelDrag = null;
  let notice = '';
  const records = new Map();
  const toolbarViews = new WeakMap();
  const dirtyPosts = new Set();
  const discoveryRoots = new Set();
  const viewTimers = new Map();
  const intersectingPosts = new Set();
  const VIEW_MS = 120;
  let creditedPosts = new WeakMap();
  let manuallyPlayed = new WeakSet();
  const admitted = new Set();
  const inFlight = new Set();
  const candidateSelector = '[data-pagelet^="FeedUnit"], [role="feed"] [role="article"], [role="main"] [role="article"]';
  const messageSelector = '[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"]';
  const permalinkSelector = 'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/photo.php"]';
  const authorSelector = 'h2 a[href], h3 a[href], h4 a[href], [role="heading"] a[href]';
  const reactionSelector = 'button[aria-label], [role="button"][aria-label]';
  const reelLinkSelector = 'a[href*="/reel/"], a[href*="/reels/"]';
  const reelRegionSelector = '[role="region"][aria-label="Reels" i]';
  const reelTitleSelector = 'h1, h2, h3, h4, [role="heading"], span';
  const sponsoredMenuSelector = '[aria-label*="sponsored content" i]';
  const menuScopeSelector = '[role="dialog"], [role="menu"], [aria-label="Menu" i]';
  const entertainmentSelector = `a[href*="/reel"], a[href*="/watch"], a[href*="/video"], a[href*="/gaming"], :is(${menuScopeSelector}) a[href], :is(${menuScopeSelector}) button, :is(${menuScopeSelector}) [role="button"], :is(${menuScopeSelector}) [role="link"], :is(${menuScopeSelector}) :is(h1, h2, h3, [role="heading"], span)`;
  if (H.route(location.href) === 'feed') html.setAttribute('data-ff-feed-gate', 'checking');

  async function request(action, extra = {}) {
    const result = await chrome.runtime.sendMessage({ type: 'healthy-feed', action, ...extra });
    if (!result || result.error) throw new Error(result?.error || 'Không kết nối được Focus Firewall. Hãy reload trang.');
    const oldSession = session?.id;
    const oldIds = session?.ids;
    const oldPhase = H.phase(session);
    config = result.config;
    session = result.session;
    testAvailable = !!result.testAvailable;
    if ((action !== 'admit' && action !== 'status') || oldSession !== session?.id || oldPhase !== H.phase(session) ||
      (action === 'status' && oldIds?.join('\n') !== session?.ids?.join('\n'))) refreshAll = true;
    if (oldSession !== session?.id) { admitted.clear(); creditedPosts = new WeakMap(); manuallyPlayed = new WeakSet(); }
    return result;
  }

  function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function makePanel() {
    if (panel?.isConnected || !document.body) return;
    panel = document.createElement('aside');
    panel.id = 'focus-firewall-feed';
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(320px, calc(100vw - 32px));width:calc(100vw - 32px)';
    const shadow = panel.attachShadow({ mode: 'closed' });
    panelShadow = shadow;
    shadow.innerHTML = `<style>
      :host { --surface:#292a27; --border:#575b50; --text:#f2f2ec; --muted:#b9bdb3; --accent:#a78bfa; --accent-end:#8794f6; --accent-text:#17151f; font:13px/1.4 system-ui,sans-serif; color:var(--text); }
      section { box-sizing:border-box; max-height:calc(100vh - 32px); overflow:auto; padding:12px 14px; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:0 8px 24px #0005; }
      strong { font-size:14px; } p { margin:8px 0 10px; }
      button { font:inherit; padding:8px 12px; border:0; border-radius:7px; background:linear-gradient(110deg,var(--accent),var(--accent-end)); color:var(--accent-text); cursor:pointer; font-weight:650; }
      button:disabled { opacity:.6; cursor:default; } button:focus-visible { outline:2px solid var(--text); outline-offset:2px; }
      .start,.test { width:100%; }
      .header,.compact { display:flex; align-items:center; gap:4px; }
      .header { justify-content:space-between; cursor:grab; touch-action:none; user-select:none; }
      .icon { padding:4px 6px; background:transparent; color:var(--muted); font-size:17px; line-height:1; }
      .icon:hover,.drag-handle:hover { background:#ffffff18; }
      .drag-handle { padding:4px 5px; background:transparent; color:var(--muted); cursor:grab; touch-action:none; user-select:none; }
      .drag-handle:active { cursor:grabbing; }
      .compact { display:none; }
      .expand { padding:5px 8px; background:transparent; color:var(--text); white-space:nowrap; }
      :host([data-ff-compact]) section { padding:4px 5px 4px 8px; border-radius:999px; }
      :host([data-ff-compact]) .expanded { display:none; }
      :host([data-ff-compact]) .compact { display:flex; }
    </style><section aria-label="Healthy Feed"><div class="compact"><button class="drag-handle" type="button" aria-label="Kéo Healthy Feed" title="Kéo để di chuyển">⋮⋮</button><button class="expand" type="button" aria-label="Mở Healthy Feed"></button></div><div class="expanded"><div class="header" title="Kéo để di chuyển"><strong>Healthy Feed</strong><button class="icon collapse" type="button" aria-label="Thu gọn Healthy Feed">−</button></div><p role="status" aria-live="polite"></p><button class="start" type="button">Bắt đầu đọc · 15 phút</button><button class="test" type="button">Thử ngay 2 phút · 10 bài</button></div></section>`;
    panelText = shadow.querySelector('[role="status"]');
    compactButton = shadow.querySelector('.expand');
    startButton = shadow.querySelector('.start');
    testButton = shadow.querySelector('.test');
    compactButton.addEventListener('click', () => { panelCollapsed = false; schedule(); });
    shadow.querySelector('.header').addEventListener('pointerdown', event => {
      if (!event.target.closest('button')) beginPanelDrag(event);
    });
    shadow.querySelector('.drag-handle').addEventListener('pointerdown', beginPanelDrag);
    shadow.querySelector('.collapse').addEventListener('click', () => { panelCollapsed = true; schedule(); });
    startButton.addEventListener('click', async () => {
      startButton.disabled = true;
      try { await request('start'); notice = ''; }
      catch (error) { notice = error.message; }
      schedule();
    });
    testButton.addEventListener('click', async () => {
      testStarting = true;
      testButton.disabled = true;
      try { await request('test'); notice = ''; }
      catch (error) { notice = error.message; }
      testStarting = false;
      schedule();
    });
    document.body.appendChild(panel);
  }

  function validPanelPosition(value) {
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) &&
      value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1 ? value : null;
  }

  function placePanel() {
    if (!panelPosition || !panel || panel.hidden || panelDrag) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.round(Math.max(0, innerWidth - rect.width) * panelPosition.x)}px`;
    panel.style.top = `${Math.round(Math.max(0, innerHeight - rect.height) * panelPosition.y)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function beginPanelDrag(event) {
    if (panelDrag || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const handle = event.currentTarget;
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    panelDrag = { handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    window.addEventListener('pointermove', movePanel, true);
    window.addEventListener('pointerup', endPanelDrag, true);
    window.addEventListener('pointercancel', endPanelDrag, true);
  }

  function movePanel(event) {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    const rect = panel.getBoundingClientRect();
    const dx = event.clientX - panelDrag.x;
    const dy = event.clientY - panelDrag.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !panelDrag.moved) return;
    panelDrag.moved = true;
    panel.style.left = `${Math.round(Math.max(0, Math.min(innerWidth - rect.width, panelDrag.left + dx)))}px`;
    panel.style.top = `${Math.round(Math.max(0, Math.min(innerHeight - rect.height, panelDrag.top + dy)))}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    event.preventDefault();
  }

  function endPanelDrag(event) {
    if (!panelDrag || event.pointerId !== panelDrag.pointerId) return;
    window.removeEventListener('pointermove', movePanel, true);
    window.removeEventListener('pointerup', endPanelDrag, true);
    window.removeEventListener('pointercancel', endPanelDrag, true);
    try { panelDrag.handle.releasePointerCapture?.(panelDrag.pointerId); } catch {}
    const moved = panelDrag.moved;
    panelDrag = null;
    if (!moved) return;
    const rect = panel.getBoundingClientRect();
    panelPosition = {
      x: rect.width < innerWidth ? Math.max(0, Math.min(1, parseFloat(panel.style.left) / (innerWidth - rect.width))) : 0,
      y: rect.height < innerHeight ? Math.max(0, Math.min(1, parseFloat(panel.style.top) / (innerHeight - rect.height))) : 0
    };
    chrome.storage.local.set({ healthyFeedPanelPosition: panelPosition }).catch(() => {});
  }

  function readable() {
    return session && Date.now() < session.endsAt && Date.now() < session.cooldownUntil;
  }

  function renderPanel() {
    makePanel();
    if (!panel) return;
    const route = H.route(location.href);
    const phase = H.phase(session);
    if (phase !== panelPhase) {
      panelCollapsed = phase === 'cooldown';
      panelPhase = phase;
    }
    panel.hidden = config.mode === 'unrestricted' || !['feed', 'video'].includes(route);
    panel.toggleAttribute('data-ff-compact', panelCollapsed);
    panel.style.width = panelCollapsed ? 'auto' : 'calc(100vw - 32px)';
    startButton.hidden = route !== 'feed' || phase !== 'ready';
    testButton.hidden = route !== 'feed' || phase !== 'cooldown' || !testAvailable;
    testButton.disabled = testStarting;
    setText(startButton, t('panelStart'));
    setText(testButton, t('panelTest'));
    const drag = panelShadow.querySelector('.drag-handle');
    drag.setAttribute('aria-label', t('panelDrag')); drag.title = t('panelDragHint');
    compactButton.setAttribute('aria-label', t('panelExpand'));
    panelShadow.querySelector('.header').title = t('panelDragHint');
    panelShadow.querySelector('.collapse').setAttribute('aria-label', t('panelCollapse'));
    if (notice) {
      setText(panelText, globalThis.dinkitContentLanguage?.error(notice) || notice);
      setText(compactButton, t('panelCheck'));
    } else if (route === 'video') {
      setText(panelText, t('panelVideo'));
      setText(compactButton, t('panelVideoShort'));
    } else if (phase === 'cooldown') {
      const minutes = Math.max(1, Math.ceil((session.cooldownUntil - Date.now()) / 60000));
      setText(panelText, t('panelCooldown', { minutes }) + (readable() ? t('panelFinishRead') : '') + (testAvailable ? t('panelTrialAvailable') : ''));
      setText(compactButton, t('panelCooldownShort', { minutes }));
    } else if (phase === 'active') {
      const remaining = Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000));
      const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      const filtered = [...records.values()].filter(meta => meta.reason).length;
      const detail = !records.size ? t('panelNoPosts')
        : filtered === records.size && !session.ids.length ? t('panelFiltered', { count: filtered }) : '';
      const label = session.id.startsWith('test:') ? t('panelTrial') : config.mode === 'information' ? 'Information' : 'Social';
      setText(panelText, t('panelActive', { label, count: session.ids.length, max: session.maxPosts, clock, detail }));
      setText(compactButton, `${label} · ${session.ids.length}/${session.maxPosts} · ${clock}`);
    } else {
      setText(panelText, t('panelReady', { max: config.maxPosts }));
      setText(compactButton, t('panelReadyShort'));
    }
    placePanel();
  }

  function extract(post) {
    const body = post.querySelector(messageSelector);
    const textClone = body ? null : post.cloneNode(true);
    textClone?.querySelectorAll('[data-ff-toolbar], [data-ff-comment], [role="article"] [role="article"]').forEach(el => el.remove());
    textClone?.querySelectorAll('h2, h3, h4, [role="heading"], nav, time').forEach(el => el.remove());
    textClone?.querySelectorAll(permalinkSelector).forEach(el => el.remove());
    textClone?.querySelectorAll('button, [role="button"]').forEach(el => {
      if (/^(like|comment|share|thich|binh luan|chia se)\b/.test(H.fold(el.getAttribute('aria-label') || el.textContent).trim())) el.remove();
    });
    const text = (body?.textContent || textClone?.textContent || '').trim();
    const links = [...post.querySelectorAll('a[href]')].filter(a => !a.closest('[data-ff-toolbar], [data-ff-comment]'));
    const heading = post.querySelector('h2, h3, h4, [role="heading"]');
    // Header author/group links are explicit source evidence. Do not guess from commenters.
    const sourceLinks = heading ? [...heading.querySelectorAll('a[href]')] : [];
    const source = sourceLinks.map(a => H.sourceKey(a.href)).find(Boolean) || '';
    const labels = [...post.querySelectorAll('a, span, [aria-label]')]
      .filter(el => !el.closest('[data-ff-toolbar], [data-ff-comment], [role="article"] [role="article"]')).slice(0, 160)
      .flatMap(el => [H.fold(el.getAttribute('aria-label')), H.fold(el.textContent?.trim())]);
    const hasLabel = expression => labels.some(label => expression.test(label));
    const shortVideo = [...post.querySelectorAll('video')].some(video => Number.isFinite(video.duration) && video.duration > 0 && video.duration <= 60);
    const reel = shortVideo || links.some(a => H.route(a.href) === 'video') || hasLabel(/^(reels|video ngan)$/);
    const sponsored = hasLabel(/^(sponsored|paid partnership|duoc tai tro|tai tro)$/);
    const suggested = hasLabel(/^(suggested for you|recommended for you|goi y cho ban|de xuat cho ban)$/);
    const friend = hasLabel(/^(friends|ban be)$/);
    const externalLink = links.some(a => {
      try { const u = new URL(a.href); return /^https?:$/.test(u.protocol) && (!/(^|\.)facebook\.com$/.test(u.hostname) || (u.pathname === '/l.php' && u.searchParams.has('u'))); }
      catch { return false; }
    });
    const permalink = links.map(a => {
      const u = new URL(a.href);
      if (!/(^|\.)facebook\.com$/.test(u.hostname)) return '';
      const match = u.pathname.match(/\/(?:posts|permalink)\/([^/]+)/);
      const id = match?.[1] || u.searchParams.get('story_fbid') || (u.pathname === '/photo.php' ? u.searchParams.get('fbid') : '');
      return id ? `post:${id}` : '';
    }).find(Boolean);
    // Deterministic fallback survives reload without storing the post text.
    let hash = 2166136261;
    for (const char of source + '\n' + H.fold(body?.textContent || text).slice(0, 1000)) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    }
    return { text, source, reel, sponsored, suggested, friend, externalLink, id: permalink || `text:${hash >>> 0}` };
  }

  function toolbar(post, meta) {
    let host = post.querySelector(':scope > [data-ff-toolbar]');
    if (host?.dataset.source !== meta.source) { host?.remove(); host = null; }
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-ff-toolbar', '');
    host.dataset.source = meta.source;
    const shadow = host.attachShadow({ mode: 'closed' });
    toolbarViews.set(host, shadow);
    shadow.innerHTML = `<style>
      :host{display:block;box-sizing:border-box;width:max-content;max-width:calc(100% - 24px);align-self:flex-start;margin:8px 12px;font:13px/1.4 system-ui}
      div{display:flex;gap:5px;flex-wrap:wrap}
      button{font:inherit;border:0;border-radius:6px;padding:6px 9px;background:#3b3d39;color:#f2f2ec;cursor:pointer;white-space:nowrap}
      button:hover{background:#494450}
      button:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
      p{width:max-content;max-width:100%;margin:5px 0 0;padding:4px 7px;border-radius:6px;background:#292a27;color:#f2f2ec}
      p:empty{display:none}
    </style><div></div><p role="status"></p>`;
    const row = shadow.querySelector('div');
    const status = shadow.querySelector('p');
    if (meta.source) {
      for (const [label, preference] of [['panelSourceMore', 'more'], ['panelSourceLess', 'less'], ['panelSourceBlock', 'block']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = t(label);
        button.dataset.dinkitLabel = label;
        button.title = meta.source;
        button.addEventListener('click', async event => {
          event.stopPropagation();
          try { await request('preference', { source: meta.source, preference }); status.textContent = t('panelSourceSaved'); schedule(); }
          catch (error) { status.textContent = globalThis.dinkitContentLanguage?.error(error.message) || error.message; }
        });
        row.appendChild(button);
      }
    }
    const comments = document.createElement('button');
    comments.type = 'button';
    comments.textContent = t('showComments');
    comments.dataset.dinkitComments = '';
    comments.setAttribute('aria-expanded', 'false');
    comments.addEventListener('click', event => {
      event.stopPropagation();
      const collapsed = post.toggleAttribute('data-ff-comments');
      comments.textContent = t(collapsed ? 'showComments' : 'hideComments');
      comments.setAttribute('aria-expanded', String(!collapsed));
    });
    row.appendChild(comments);
    post.setAttribute('data-ff-comments', '');
    post.appendChild(host);
  }

  function cancelView(post) {
    const timer = viewTimers.get(post);
    if (timer) clearTimeout(timer);
    viewTimers.delete(post);
  }

  function isViewable(post) {
    if (!post.isConnected || post.dataset.ffPost !== 'pending' || document.hidden || H.phase(session) !== 'active') return false;
    const rect = post.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const visibleHeight = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
    const visibleWidth = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
    // For a tall post, compare against the viewport so it can still qualify.
    return visibleHeight >= Math.min(rect.height, innerHeight) / 2 &&
      visibleWidth >= Math.min(rect.width, innerWidth) / 2;
  }

  function considerPost(post) {
    if (!isViewable(post)) { cancelView(post); return; }
    if (viewTimers.has(post) || inFlight.has(post)) return;
    const id = records.get(post)?.id;
    const timer = setTimeout(() => {
      viewTimers.delete(post);
      if (records.get(post)?.id === id && isViewable(post)) admitPost(post);
    }, VIEW_MS);
    viewTimers.set(post, timer);
  }

  async function admitPost(post) {
    const meta = records.get(post);
    if (!meta || inFlight.has(post) || !isViewable(post)) return;
    inFlight.add(post);
    const sessionId = session?.id;
    const postId = meta.id;
    try {
      const result = await request('admit', { id: postId, sessionId });
      if (result.allowed && session?.id === sessionId) {
        admitted.add(postId);
        creditedPosts.set(post, sessionId);
        if (post.isConnected && records.get(post)?.id === postId && post.dataset.ffPost === 'pending' && readable()) {
          post.dataset.ffPost = 'visible';
          intersection.unobserve(post);
          intersectingPosts.delete(post);
          cancelView(post);
        }
      }
      notice = '';
    } catch (error) { notice = error.message; }
    finally { inFlight.delete(post); schedule(); }
  }

  const intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { intersectingPosts.add(entry.target); considerPost(entry.target); }
      else { intersectingPosts.delete(entry.target); cancelView(entry.target); }
    }
  }, { threshold: [0, 0.5, 1] });

  let visibilityFrame = 0;
  function checkVisiblePosts() {
    visibilityFrame = 0;
    for (const post of intersectingPosts) considerPost(post);
    for (const post of viewTimers.keys()) considerPost(post);
  }
  function scheduleVisibilityCheck() {
    if (!visibilityFrame && (intersectingPosts.size || viewTimers.size)) visibilityFrame = requestAnimationFrame(checkVisiblePosts);
  }

  function releasePost(post) {
    intersection.unobserve(post);
    intersectingPosts.delete(post);
    cancelView(post);
    records.delete(post);
    dirtyPosts.delete(post);
    post.removeAttribute('data-ff-post');
    post.removeAttribute('data-ff-comments');
    post.querySelectorAll('[data-ff-toolbar]').forEach(el => el.remove());
    post.querySelectorAll('[data-ff-comment]').forEach(el => el.removeAttribute('data-ff-comment'));
  }

  function markShelf(shelf, attribute) {
    if (shelf.hasAttribute(attribute)) return;
    shelf.setAttribute(attribute, '');
    for (const post of records.keys()) if (shelf.contains(post)) releasePost(post);
  }

  function markEntertainmentMenu(root) {
    if (root.closest?.('[role="main"], #focus-firewall-feed')) return;
    const nodes = root.matches?.(entertainmentSelector) ? [root, ...root.querySelectorAll(entertainmentSelector)] : root.querySelectorAll(entertainmentSelector);
    for (const node of nodes) {
      if (node.closest('[role="main"], #focus-firewall-feed')) continue;
      let matched = false;
      if (node.hasAttribute('href')) {
        try {
          const url = new URL(node.getAttribute('href'), location.href);
          matched = /(^|\.)facebook\.com$/.test(url.hostname) &&
            (H.route(url.href) === 'video' || /^\/gaming(?:\/|$)/i.test(url.pathname));
        } catch {}
      }
      if (!matched && node.closest(menuScopeSelector)) {
        const label = H.fold(node.getAttribute('aria-label') || node.textContent).replace(/\s+/g, ' ').trim();
        matched = /^(reels?|gaming video|play games|video tro choi|choi game)(?:\b|$)/.test(label) ||
          (/^(entertainment|giai tri)$/.test(label) && node.matches('h1, h2, h3, [role="heading"], span'));
      }
      if (matched) {
        const parent = node.parentElement;
        const item = node.closest('li, [role="listitem"]') ||
          (parent?.tagName === 'DIV' && parent.children.length === 1 && !parent.matches(menuScopeSelector) ? parent : node);
        item.setAttribute('data-ff-entertainment-item', '');
      }
    }
  }

  function hideSponsoredShelves(root) {
    const menus = [...(root.matches?.(sponsoredMenuSelector) ? [root] : []), ...root.querySelectorAll(sponsoredMenuSelector)];
    for (const menu of menus) {
      if (!menu.closest('[role="main"], [role="complementary"]') || menu.closest('[data-ff-sponsored-shelf]')) continue;
      for (let shelf = menu.parentElement, depth = 0; shelf && depth < 20; shelf = shelf.parentElement, depth++) {
        if (shelf.matches('[role="feed"], [role="main"], [role="complementary"]')) break;
        const headings = shelf.querySelectorAll('h1, h2, h3, h4, [role="heading"]');
        if ([...headings].some(title => H.fold(title.textContent).replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim() === 'sponsored')) {
          markShelf(shelf, 'data-ff-sponsored-shelf');
          break;
        }
      }
    }
  }

  function hideReelShelves(root) {
    const regions = [...(root.matches?.(reelRegionSelector) ? [root] : []), ...root.querySelectorAll(reelRegionSelector)];
    for (const region of regions) {
      if (!region.closest('[role="main"]') || region.closest('[data-ff-reels-shelf]')) continue;
      for (let shelf = region.parentElement, depth = 0; shelf && depth < 10; shelf = shelf.parentElement, depth++) {
        if (shelf.matches('[role="feed"], [role="main"]')) break;
        const headings = shelf.querySelectorAll('h1, h2, h3, h4, [role="heading"]');
        if ([...headings].some(title => H.fold(title.textContent).trim() === 'reels')) {
          markShelf(shelf, 'data-ff-reels-shelf');
          break;
        }
      }
    }
    const titles = [...(root.matches?.(reelTitleSelector) ? [root] : []), ...root.querySelectorAll(reelTitleSelector)];
    for (const title of titles) {
      if (H.fold(title.textContent).trim() !== 'reels' || !title.closest('[role="main"]') ||
        title.closest('[data-ff-reels-shelf]')) continue;
      for (let shelf = title.parentElement, depth = 0; shelf && depth < 8; shelf = shelf.parentElement, depth++) {
        if (shelf.matches('[role="feed"], [role="main"]')) break;
        if (shelf.querySelectorAll(reelLinkSelector).length < 2) continue;
        markShelf(shelf, 'data-ff-reels-shelf');
        break;
      }
    }
  }

  function cleanup() {
    if (!records.size) return;
    intersection.disconnect();
    for (const post of viewTimers.keys()) cancelView(post);
    intersectingPosts.clear();
    for (const post of [...records.keys()]) releasePost(post);
    dirtyPosts.clear();
    discoveryRoots.clear();
  }

  function fallbackPost(element) {
    const main = element.closest('[role="main"]');
    if (!main) return null;
    const message = element.matches(messageSelector);
    const reaction = element.matches(reactionSelector);
    const isReaction = button => /^(like|comment|share|thich|binh luan|chia se)\b/.test(H.fold(button.getAttribute('aria-label') || button.textContent).trim());
    for (let parent = element.parentElement; parent && parent !== main && parent.getAttribute('role') !== 'feed'; parent = parent.parentElement) {
      if (parent.querySelectorAll(messageSelector).length > 1) break;
      const hasAuthor = !!parent.querySelector(authorSelector) || (reaction && [...parent.querySelectorAll('a[href]')].some(a => H.sourceKey(a.href)));
      if (!hasAuthor) continue;
      // A body marker is enough even when Facebook omits a permalink. For a
      // permalink-only post, wait until its reaction controls identify the card.
      if (message || [...parent.querySelectorAll('button, [role="button"]')].some(isReaction)) return parent;
    }
    return null;
  }

  function scan() {
    scheduled = false;
    if (!initialized || scanning) return;
    scanning = true;
    try {
      const route = H.route(location.href);
      const enabled = config.mode !== 'unrestricted';
      const feed = enabled && route === 'feed';
      html.toggleAttribute('data-ff-feed-active', feed);
      html.toggleAttribute('data-ff-feed-video', enabled && route === 'video');
      html.toggleAttribute('data-ff-entertainment-filter', enabled);
      if (enabled && discoverAll) markEntertainmentMenu(html);
      if (!feed) {
        html.removeAttribute('data-ff-feed-gate');
        cleanup();
        lastPhase = H.phase(session);
        renderPanel();
        return;
      }
      if (discoverAll) {
        // Run a page-wide discovery only at startup or after SPA navigation.
        discoveryRoots.clear();
        discoveryRoots.add(html);
        discoverAll = false;
      }
      for (const post of records.keys()) {
        if (!post.isConnected) {
          intersection.unobserve(post);
          intersectingPosts.delete(post);
          cancelView(post);
          records.delete(post);
        }
      }
      const candidates = new Set(refreshAll ? records.keys() : []);
      for (const post of dirtyPosts) if (post.isConnected) candidates.add(post);
      const findIn = (root, selector) => {
        const matches = root.matches?.(selector) ? [root] : [];
        return [...matches, ...root.querySelectorAll(selector)];
      };
      for (const root of discoveryRoots) {
        if (!root.isConnected) continue;
        const shelfScope = root === html ? root : root.closest('[role="feed"] > *, [role="main"] > *') || root;
        hideReelShelves(shelfScope);
        hideSponsoredShelves(shelfScope);
        for (const post of findIn(root, candidateSelector)) candidates.add(post);
        for (const marker of findIn(root, `${messageSelector}, ${permalinkSelector}, ${authorSelector}`)) {
          if (!marker.closest('[role="main"]')) continue;
          const post = marker.closest(candidateSelector) || fallbackPost(marker);
          if (post) candidates.add(post);
        }
        for (const marker of findIn(root, reactionSelector)) {
          if (!marker.closest('[role="main"]') || !/^(like|comment|share|thich|binh luan|chia se)\b/.test(H.fold(marker.getAttribute('aria-label')).trim())) continue;
          const post = marker.closest(candidateSelector) || fallbackPost(marker);
          if (post) candidates.add(post);
        }
      }
      discoveryRoots.clear();
      // The gate hides main from layout. Lift it before measuring pending posts.
      if (readable() && candidates.size) html.removeAttribute('data-ff-feed-gate');
      const phase = H.phase(session);
      for (const post of candidates) {
        if (!post.isConnected || post.closest('[data-ff-reels-shelf], [data-ff-sponsored-shelf]') || post.parentElement?.closest(candidateSelector)) continue;
        let meta = records.get(post);
        if (!meta || dirtyPosts.has(post)) {
          const previousId = meta?.id;
          const rootArticle = post.matches('[role="article"]') ? post : post.querySelector('[role="article"]');
          post.querySelectorAll('[role="article"], [aria-label="Comments"], [aria-label="Bình luận"], [data-testid="UFI2CommentsList/root"]').forEach(el => {
            if (el !== rootArticle) el.setAttribute('data-ff-comment', '');
          });
          meta = extract(post);
          if (previousId && previousId !== meta.id) cancelView(post);
          // A permalink changing to another permalink indicates a recycled card.
          if (previousId?.startsWith('post:') && meta.id.startsWith('post:') && previousId !== meta.id) creditedPosts.delete(post);
          records.set(post, meta);
        }
        const reason = H.classify(meta, config);
        meta.reason = reason;
        if (reason === 'reels') {
          intersection.unobserve(post);
          intersectingPosts.delete(post);
          cancelView(post);
          records.delete(post);
          post.remove();
          continue;
        }
        const alreadyCounted = !!session && (creditedPosts.get(post) === session.id || admitted.has(meta.id) || session.ids.includes(meta.id));
        const videoAllowed = !reason && readable() && alreadyCounted;
        post.querySelectorAll('video').forEach(video => {
          video.autoplay = false;
          video.removeAttribute('autoplay');
          if ((!videoAllowed || !manuallyPlayed.has(video)) && !video.paused) video.pause();
        });
        if (reason || !readable()) {
          if (post.dataset.ffPost !== 'hidden') post.dataset.ffPost = 'hidden';
          intersection.unobserve(post);
          intersectingPosts.delete(post);
          cancelView(post);
          continue;
        }
        toolbar(post, meta);
        if (alreadyCounted) {
          if (post.dataset.ffPost !== 'visible') post.dataset.ffPost = 'visible';
          intersection.unobserve(post);
          intersectingPosts.delete(post);
          cancelView(post);
        } else if (phase === 'active') {
          if (post.dataset.ffPost !== 'pending') {
            post.dataset.ffPost = 'pending';
            intersection.observe(post);
          }
          // Check posts already in view; later entries and scrolls use the observer.
          considerPost(post);
        } else {
          if (post.dataset.ffPost !== 'hidden') post.dataset.ffPost = 'hidden';
          intersection.unobserve(post);
          intersectingPosts.delete(post);
          cancelView(post);
        }
      }
      dirtyPosts.clear();
      refreshAll = false;
      lastPhase = phase;
      // Unknown Facebook layouts must not expose an unmetered home feed.
      html.toggleAttribute('data-ff-feed-gate', !readable() || !records.size);
      renderPanel();
    } finally { scanning = false; }
  }

  function schedule(discover = false, refresh = false) {
    if (discover) discoverAll = true;
    if (refresh) refreshAll = true;
    if (!scheduled) { scheduled = true; setTimeout(scan, 16); }
  }

  function syncStatus() {
    statusRevision++;
    if (statusPending) return;
    statusPending = true;
    (async () => {
      let revision;
      do {
        revision = statusRevision;
        await request('status');
      } while (revision !== statusRevision);
    })().catch(error => { notice = error.message; }).finally(() => {
      statusPending = false;
      schedule();
    });
  }

  document.addEventListener('click', event => {
    if (config.mode === 'unrestricted') return;
    const anchor = event.target.closest?.('a[href]');
    if (anchor && H.route(anchor.href) === 'video') {
      event.preventDefault(); event.stopImmediatePropagation();
      notice = t('panelReelsOff');
      schedule();
    }
  }, true);
  function authorizePlay(event) {
    if (!event.isTrusted) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    const post = event.target.closest?.('[data-ff-post="visible"]');
    const isPlay = event.target.tagName === 'VIDEO' || /^(play|phát|phát video)/i.test(event.target.closest?.('[aria-label]')?.getAttribute('aria-label') || '');
    if (post && isPlay) post.querySelectorAll('video').forEach(video => manuallyPlayed.add(video));
  }
  document.addEventListener('pointerdown', authorizePlay, true);
  document.addEventListener('keydown', authorizePlay, true);
  document.addEventListener('play', event => {
    if (config.mode !== 'unrestricted' && H.route(location.href) === 'feed' && event.target.tagName === 'VIDEO' &&
      (!readable() || event.target.closest('[data-ff-post="hidden"], [data-ff-post="pending"]') || !manuallyPlayed.has(event.target))) event.target.pause();
  }, true);
  document.addEventListener('loadedmetadata', event => {
    const post = event.target.closest?.('[data-ff-post]');
    if (post) { dirtyPosts.add(post); schedule(); }
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const post of viewTimers.keys()) cancelView(post);
    else {
      for (const post of records.keys()) if (post.dataset.ffPost === 'pending') considerPost(post);
      schedule(false, true);
    }
  });
  window.addEventListener('popstate', () => schedule(true, true));
  window.addEventListener('resize', placePanel);
  window.addEventListener('resize', scheduleVisibilityCheck);
  document.addEventListener('scroll', scheduleVisibilityCheck, { capture: true, passive: true });
  new MutationObserver(mutations => {
    let route;
    try { route = H.route(location.href); } catch { return; }
    if (config.mode === 'unrestricted') return;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) markEntertainmentMenu(mutation.target);
      if (mutation.type === 'childList') for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) markEntertainmentMenu(node);
      }
    }
    if (route !== 'feed') return;
    let changed = false;
    const discoverySelector = `${candidateSelector}, ${messageSelector}, ${permalinkSelector}, ${reactionSelector}, ${reelLinkSelector}, ${reelRegionSelector}, ${sponsoredMenuSelector}, h1, h2, h3, h4, [role="heading"], [role="main"]`;
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      if (!target || target.closest('[data-ff-toolbar], [data-ff-comment], [data-ff-reels-shelf], [data-ff-sponsored-shelf]')) continue;
      const post = target?.closest('[data-ff-post]');
      if (post) {
        if (mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].every(node =>
          node.nodeType === Node.ELEMENT_NODE && node.matches('[data-ff-toolbar], [data-ff-comment]'))) continue;
        dirtyPosts.add(post);
        if (mutation.type === 'attributes' && target.matches(`${reelLinkSelector}, ${reelRegionSelector}, ${sponsoredMenuSelector}`)) discoveryRoots.add(post);
        if (mutation.type === 'childList' && [...mutation.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE &&
          (node.matches(`${reelLinkSelector}, ${reelRegionSelector}, ${sponsoredMenuSelector}`) || node.querySelector(`${reelLinkSelector}, ${reelRegionSelector}, ${sponsoredMenuSelector}`) ||
            (node.matches('span') && H.fold(node.textContent).trim() === 'reels')))) discoveryRoots.add(post);
        changed = true;
        continue;
      }
      if (mutation.type === 'attributes') {
        const candidate = target.closest(candidateSelector);
        if (candidate) { discoveryRoots.add(candidate); changed = true; }
        else if (target.matches(`${reelLinkSelector}, ${reelRegionSelector}, ${sponsoredMenuSelector}`)) { discoveryRoots.add(target); changed = true; }
        continue;
      }
      if (mutation.type === 'characterData' && target.matches(reelTitleSelector) && H.fold(target.textContent).trim() === 'reels') {
        discoveryRoots.add(target);
        changed = true;
        continue;
      }
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.matches('[data-ff-toolbar], [data-ff-comment]')) continue;
        if (node.closest('[role="main"]') || node.matches('[role="main"]') || node.querySelector('[role="main"]') ||
          (node.closest('[role="complementary"]') && (node.matches(sponsoredMenuSelector) || node.querySelector(sponsoredMenuSelector)))) {
          if (node.matches(discoverySelector) || node.querySelector(discoverySelector) ||
            (node.matches('span') && H.fold(node.textContent).trim() === 'reels')) {
            discoveryRoots.add(node);
            changed = true;
          }
        }
      }
    }
    if (changed) schedule();
  }).observe(html, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'aria-label', 'data-pagelet'] });
  setInterval(() => {
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      notice = '';
      schedule(true, true);
    } else if (session?.id?.startsWith('test:') && H.phase(session) !== 'active') {
      if (!statusPending) syncStatus();
    } else if (initialized && lastPhase !== H.phase(session)) schedule(false, true);
    else if (initialized && !document.hidden) renderPanel();
  }, 1000);
  globalThis.dinkitContentLanguage?.subscribe(() => {
    if (panel) renderPanel();
    for (const post of records.keys()) {
      const host = post.querySelector(':scope > [data-ff-toolbar]');
      const shadow = host && toolbarViews.get(host);
      if (!shadow) continue;
      for (const button of shadow.querySelectorAll('[data-dinkit-label]')) button.textContent = t(button.dataset.dinkitLabel);
      const comments = shadow.querySelector('[data-dinkit-comments]');
      if (comments) comments.textContent = t(comments.getAttribute('aria-expanded') === 'true' ? 'hideComments' : 'showComments');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) config = H.config(changes.settings.newValue?.healthyFeed);
    if (changes.healthyFeedSession || changes.healthyFeedTestSession || changes.healthyFeedTestUsedFor) syncStatus();
    if (changes.healthyFeedPanelPosition && !panelDrag) {
      panelPosition = validPanelPosition(changes.healthyFeedPanelPosition.newValue);
      if (!panelPosition && panel) {
        panel.style.left = 'auto'; panel.style.top = 'auto';
        panel.style.right = '16px'; panel.style.bottom = '16px';
      }
    }
    if (changes.settings || changes.healthyFeedPanelPosition) schedule(false, !!changes.settings);
  });
  chrome.storage.local.get(['healthyFeedPanelPosition']).then(data => {
    if (panelPosition || panelDrag) return;
    panelPosition = validPanelPosition(data.healthyFeedPanelPosition);
    schedule();
  }).catch(() => {});
  request('status').then(() => { initialized = true; schedule(); }).catch(error => {
    // A failed bootstrap keeps the home feed closed, with a recoverable explanation.
    config = H.config({ mode: 'information' });
    notice = error.message;
    initialized = true;
    schedule();
  });
})();
