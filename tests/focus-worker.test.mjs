import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function fixture(initial = {}) {
  const listeners = {}, notices = [], alarms = [], rules = [];
  let values = structuredClone(initial), now = 100000, applying = false;
  const event = name => ({ addListener: callback => { (listeners[name] ||= []).push(callback); } });
  const context = vm.createContext({
    URL, console: { log() {}, error() {} }, importScripts() {},
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    chrome: {
      runtime: { id: 'dinkit', getURL: path => `chrome-extension://dinkit/${path}`, onStartup: event('startup'), onInstalled: event('installed'), onMessage: event('message') },
      storage: { local: {
        get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in values).map(k => [k, structuredClone(values[k])])),
        set: async patch => { values = { ...values, ...structuredClone(patch) }; }
      }, onChanged: event('storage') },
      tabs: { query: async () => [{ id: 1, url: 'https://example.com/' }], reload: async () => {}, onActivated: event('tab'), onUpdated: event('updated') },
      windows: { WINDOW_ID_NONE: -1, onFocusChanged: event('window') },
      idle: { setDetectionInterval() {}, onStateChanged: event('idle') },
      alarms: { onAlarm: event('alarm'), create: async (...args) => alarms.push(args), clear: async () => true, clearAll: async () => { alarms.splice(0); } },
      notifications: { create: async (...args) => notices.push(args) },
      declarativeNetRequest: {
        getDynamicRules: async () => structuredClone(rules),
        updateDynamicRules: async ({ addRules }) => {
          assert.equal(applying, false, 'DNR updates must not overlap'); applying = true;
          await new Promise(resolve => setTimeout(resolve, 5));
          rules.splice(0, rules.length, ...structuredClone(addRules)); applying = false;
        }
      }
    },
    dinkitWorkerMessage: async () => 'Focus finished'
  });
  vm.runInContext(read('focus/healthy-feed-core.js'), context);
  vm.runInContext(read('focus/background.js'), context);
  return { context, listeners, notices, alarms, rules, data: () => values, set: patch => { values = { ...values, ...structuredClone(patch) }; }, clock: value => { now = value; } };
}

test('the dedicated focus alarm completes the session and notifies once, including concurrent periodic checks', async () => {
  const f = fixture({ focus: { active: true, task: 'Study', endsAt: 99999, durationMinutes: 25 }, settings: {} });
  await Promise.all([f.listeners.alarm[0]({ name: 'focus-session-timer' }), f.listeners.alarm[0]({ name: 'focus-session-timer' })]);
  assert.equal(f.data().focus.active, false);
  assert.equal(f.data().focus.pendingLog, true);
  assert.equal(f.notices.length, 1);
});

test('changing the deadline of an active focus session reschedules its alarm using the actual end time', async () => {
  const f = fixture();
  await f.listeners.storage[0]({ focus: { oldValue: { active: true, endsAt: 120000 }, newValue: { active: true, endsAt: 180000, durationMinutes: 25 } } }, 'local');
  assert.equal(f.alarms.length, 1);
  assert.equal(f.alarms[0][0], 'focus-session-timer');
  assert.equal(f.alarms[0][1].when, 180000);
});

test('blocking rule updates are serialized under simultaneous settings and usage events', async () => {
  const f = fixture({ focus: { active: true }, blockRules: [{ host: 'example.com', pathPrefix: '/', raw: 'example.com' }] });
  await Promise.all(Array.from({ length: 10 }, () => f.context.updateBlockingRules()));
  assert.equal(f.rules.length, 1);
});

test('quick block adds a zero-minute limit for the active page and installs its rule', async () => {
  const f = fixture({ dailyLimits: [], settings: {} });
  const listener = f.listeners.message.find(fn => fn({ type: 'FOCUS_BLOCK_CURRENT_PAGE' }, { id: 'other' }, () => {}) === undefined);
  const result = await new Promise(resolve => listener({ type: 'FOCUS_BLOCK_CURRENT_PAGE', scope: 'site' }, { id: 'dinkit', url: 'chrome-extension://dinkit/focus/popup.html' }, resolve));
  assert.equal(result.ok, true);
  assert.equal(f.data().dailyLimits[0].raw, 'example.com');
  assert.equal(f.data().dailyLimits[0].minutes, 0);
  assert.equal(f.rules.length, 1);
  assert.match(f.rules[0].condition.regexFilter, /example/);
  await new Promise(resolve => listener({ type: 'FOCUS_BLOCK_CURRENT_PAGE', scope: 'site' }, { id: 'dinkit', url: 'chrome-extension://dinkit/focus/popup.html' }, resolve));
  assert.equal(f.data().dailyLimits.length, 1);
});

test('quick block exact URL preserves query and does not match other URLs', async () => {
  const f = fixture({ dailyLimits: [], settings: {} });
  f.context.chrome.tabs.query = async () => [{ id: 1, url: 'https://example.com/Watch?v=123#section' }];
  const listener = f.listeners.message[0];
  const result = await new Promise(resolve => listener({ type: 'FOCUS_BLOCK_CURRENT_PAGE', scope: 'exact' }, { id: 'dinkit', url: 'chrome-extension://dinkit/focus/popup.html' }, resolve));
  assert.equal(result.ok, true);
  const rule = f.data().dailyLimits[0];
  assert.equal(rule.exactUrl, 'https://example.com/Watch?v=123');
  const regex = new RegExp(f.rules[0].condition.regexFilter);
  assert.equal(f.rules[0].condition.isUrlFilterCaseSensitive, true);
  for (const url of ['https://example.com/Watch?v=124', 'https://example.com/Watch?v=1234', 'https://example.com/watch?v=123', 'https://example.com/Watch']) {
    assert.equal(regex.test(url), false);
    assert.equal(f.context.doesUrlMatchRule(url, rule), false);
  }
  assert.equal(regex.test(rule.exactUrl), true);
  assert.equal(f.context.doesUrlMatchRule(rule.exactUrl, rule), true);
});

test('DNR URL rules agree with matching on query strings, explicit ports and path prefixes', () => {
  const f = fixture();
  for (const [rule, url] of [
    [{ host: 'example.com', pathPrefix: '/' }, 'https://example.com/?a=1'],
    [{ host: 'example.com', pathPrefix: '/' }, 'https://example.com:8443/page'],
    [{ host: 'example.com', pathPrefix: '/watch' }, 'https://example.com/watch?v=123'],
    [{ host: 'example.com', pathPrefix: '/work' }, 'https://example.com/workspace'],
  ]) {
    assert.equal(f.context.doesUrlMatchRule(url, rule), true);
    assert.equal(new RegExp(f.context.compileRuleToRegex(rule)).test(url), true, url);
    assert.equal(new RegExp(f.context.compileRuleToRegex(rule)).test(url.replace('example.com', 'example.com.evil.test')), false);
  }
});

test('concurrent tracking events credit elapsed browsing time only once', async () => {
  const f = fixture({ usageToday: {}, dailyLimits: [{ host: 'example.com', pathPrefix: '/', minutes: 100, usedMs: 0 }] });
  await f.context.handleStateChange('initial');
  f.clock(110000);
  await Promise.all(Array.from({ length: 6 }, () => f.context.handleStateChange('simultaneous')));
  assert.equal(f.data().usageToday['example.com'], 10);
  assert.equal(f.data().dailyLimits[0].usedMs, 10000);
});

test('focus and idle transitions credit the preceding active interval and exclude inactive time', async () => {
  const f = fixture({ usageToday: {} });
  await f.context.handleStateChange('initial');
  f.clock(110000); await f.listeners.window[0](-1);
  assert.equal(f.data().usageToday['example.com'], 10);
  f.clock(120000); await f.listeners.window[0](1);
  assert.equal(f.data().usageToday['example.com'], 10);
  f.clock(130000); await f.listeners.idle[0]('idle');
  assert.equal(f.data().usageToday['example.com'], 20);
  f.clock(140000); await f.listeners.idle[0]('active');
  assert.equal(f.data().usageToday['example.com'], 20);
});

test('midnight reset applies pending strict-mode changes, resets usage/limits and retains unrelated settings', async () => {
  const f = fixture({
    lastResetDate: 'yesterday', usageToday: { 'example.com': 50 }, unlocks: [{ domain: 'example.com' }],
    settings: { strictMode: true, enabledPresets: ['youtube_learning', 'reddit_research'], healthyFeed: { mode: 'social' } },
    blockRules: [{ raw: 'remove.example' }, { raw: 'keep.example' }],
    dailyLimits: [{ id: 'change', minutes: 10, usedMs: 1000 }, { id: 'remove', minutes: 10, usedMs: 500 }],
    pendingChanges: [{ type: 'removeBlock', pattern: 'remove.example' }, { type: 'reduceLimit', limitId: 'change', value: 20 }, { type: 'reduceLimit', limitId: 'remove', value: null }, { type: 'disablePreset', preset: 'youtube_learning' }]
  });
  assert.equal(await f.context.checkMidnightReset(), true);
  assert.deepEqual(f.data().usageToday, {});
  assert.equal(f.data().dailyLimits.length, 1);
  assert.equal(f.data().dailyLimits[0].minutes, 20);
  assert.equal(f.data().dailyLimits[0].usedMs, 0);
  assert.equal(f.data().settings.healthyFeed.mode, 'social');
  assert.deepEqual(f.data().settings.enabledPresets, ['reddit_research']);
  assert.deepEqual(f.data().blockRules, [{ raw: 'keep.example' }]);
  assert.equal(await f.context.checkMidnightReset(), false);
});

test('extension installation/reload and browser startup restore the saved active Focus deadline', async () => {
  const f = fixture({ focus: { active: true, task: 'Keep running', endsAt: 180000, durationMinutes: 25 }, settings: { enabledPresets: [] } });
  await f.listeners.installed[0]();
  assert.equal(f.alarms.find(alarm => alarm[0] === 'focus-session-timer')?.[1].when, 180000);
  await f.listeners.startup[0]();
  assert.equal(f.alarms.filter(alarm => alarm[0] === 'focus-session-timer').length, 2);
  assert.equal(f.data().focus.active, true);
});
