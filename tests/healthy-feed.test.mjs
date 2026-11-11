import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function fixture() {
  let listener, now = 1000000, data = { settings: { healthyFeed: { mode: 'information', maxPosts: 20 } } };
  const context = vm.createContext({ URL, Date: class extends Date { static now() { return now; } }, chrome: {
    runtime: { id: 'dinkit', getURL: path => `chrome-extension://dinkit/${path}`, onMessage: { addListener: fn => { listener = fn; } } },
    storage: { local: { get: async () => structuredClone(data), set: async patch => { await new Promise(r => setTimeout(r, 1)); data = { ...data, ...structuredClone(patch) }; } } }
  } });
  vm.runInContext(read('focus/healthy-feed-core.js'), context);
  vm.runInContext(read('focus/healthy-feed-worker.js'), context);
  const options = { id: 'dinkit', url: 'chrome-extension://dinkit/focus/options.html', tab: { id: 1 } };
  const facebook = { id: 'dinkit', url: 'https://www.facebook.com/', tab: { id: 2 } };
  return { H: context.HealthyFeed, options, facebook, data: () => data, set: patch => { data = { ...data, ...patch }; }, clock: t => { now = t; },
    send: (action, fields = {}, sender = options) => new Promise(resolve => listener({ type: 'healthy-feed', action, ...fields }, sender, resolve)) };
}

test('options opened as a tab can configure Healthy Feed; foreign pages cannot configure or count', async () => {
  const f = fixture();
  const configured = await f.send('configure', { mode: 'social', maxPosts: 30 });
  assert.equal(configured.config.mode, 'social');
  assert.equal(configured.config.maxPosts, 30);
  for (const sender of [{ ...f.options, id: 'other' }, { ...f.options, url: 'chrome-extension://dinkit/editor/editor.html' }, { ...f.facebook, url: 'https://facebook.com.evil.test/' }]) {
    assert.ok((await f.send('configure', { mode: 'unrestricted' }, sender)).error);
  }
  assert.ok((await f.send('configure', { mode: 'unrestricted' }, f.facebook)).error);
  assert.ok((await f.send('admit', { id: 'one' })).error);
});

test('concurrent feed requests across tabs share an exact quota and duplicate IDs do not consume it twice', async () => {
  const f = fixture();
  const started = await f.send('start');
  const responses = await Promise.all(Array.from({ length: 30 }, (_, i) => f.send('admit', { id: `post:${i}`, sessionId: started.session.id }, { ...f.facebook, tab: { id: i % 2 + 2 } })));
  assert.equal(responses.filter(r => r.allowed).length, 20);
  assert.equal(f.data().healthyFeedSession.ids.length, 20);
  assert.equal(f.H.phase(f.data().healthyFeedSession), 'cooldown');
  assert.equal((await f.send('admit', { id: 'post:0', sessionId: started.session.id }, f.facebook)).allowed, true);
  assert.equal((await f.send('admit', { id: 'post:0', sessionId: 'stale' }, f.facebook)).allowed, false);
  assert.ok((await f.send('start')).error);
  f.clock(f.data().healthyFeedSession.cooldownUntil + 1);
  assert.equal((await f.send('start')).session.ids.length, 0);
});

test('the short trial is limited to the home feed, one per cooldown and never resets the regular cooldown', async () => {
  const f = fixture();
  const started = await f.send('start');
  f.clock(started.session.endsAt + 1);
  assert.equal((await f.send('status')).testAvailable, true);
  assert.ok((await f.send('test')).error);
  const trial = await f.send('test', {}, f.facebook);
  assert.equal(trial.session.maxPosts, 10);
  const cooldown = f.data().healthyFeedSession.cooldownUntil;
  const result = await Promise.all(Array.from({ length: 11 }, (_, i) => f.send('admit', { id: `trial:${i}`, sessionId: trial.session.id }, f.facebook)));
  assert.equal(result.filter(r => r.allowed).length, 10);
  assert.equal(f.data().healthyFeedSession.cooldownUntil, cooldown);
  assert.ok((await f.send('test', {}, f.facebook)).error);
});

test('Strict Mode allows stronger filters and rejects weaker mode, topics, sources and higher quotas', async () => {
  const f = fixture();
  f.set({ settings: { strictMode: true, healthyFeed: { mode: 'information', maxPosts: 20, topics: { more: ['rust'], less: ['game'] }, sources: { 'https://www.facebook.com/ads': 'block' } } } });
  assert.ok((await f.send('configure', { mode: 'social', maxPosts: 20 })).error);
  assert.ok((await f.send('configure', { mode: 'information', maxPosts: 30 })).error);
  assert.ok((await f.send('topics', { more: ['rust', 'game'], less: ['game'] })).error);
  assert.ok((await f.send('topics', { more: ['rust'], less: [] })).error);
  assert.ok((await f.send('preference', { source: 'https://www.facebook.com/ads', preference: 'reset' }, f.facebook)).error);
  assert.equal((await f.send('topics', { more: [], less: ['game', 'drama'] })).config.topics.less.length, 2);
});

test('classification handles Vietnamese accents, whole topics, source preferences and all three modes', () => {
  const { H } = fixture();
  const info = H.config({ mode: 'information', sources: { 'https://www.facebook.com/preferred': 'more' }, topics: { less: ['bán hàng'], more: ['Python'] } });
  assert.equal(H.classify({ text: 'Nghiên cứu khoa học' }, info), '');
  assert.equal(H.classify({ text: 'Python' }, info), '');
  assert.equal(H.classify({ text: 'ban hang', source: 'https://www.facebook.com/preferred' }, info), 'hidden-topic');
  assert.equal(H.classify({ text: 'Anything', source: 'https://www.facebook.com/preferred', sponsored: true }, info), 'advertisement');
  assert.equal(H.classify({ text: 'Anything', source: 'https://www.facebook.com/preferred', suggested: true }, info), 'suggested');
  assert.equal(H.classify({ text: 'meme', friend: true }, H.config({ mode: 'social' })), '');
  assert.equal(H.classify({ text: 'ad', reel: true, sponsored: true }, H.config()), '');
  assert.equal(H.sourceKey('https://www.facebook.com/person/posts/1'), '');
  assert.equal(H.sourceKey('https://www.facebook.com/profile.php?id=123&x=1'), 'https://www.facebook.com/profile.php?id=123');
  assert.equal(H.route('https://facebook.com.evil.test/'), 'outside');
});
