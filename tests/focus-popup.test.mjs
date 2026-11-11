import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve, 25));
async function fixture(initial = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="focus-root"></div></body></html>', { url: 'https://dinkit.example/focus/popup.html', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window: w } = dom;
  await wait();
  let values = { focus: { active: false, pendingLog: false }, settings: { strictMode: false, enabledPresets: [] }, dailyLimits: [], blockRules: [], usageToday: {}, blockedAttempts: [], focusHistory: [], ...initial };
  const listeners = [];
  let optionsOpened = 0;
  w.chrome = { storage: { local: {
    get: async keys => Object.fromEntries(keys.filter(key => key in values).map(key => [key, structuredClone(values[key])])),
    set: async patch => { values = { ...values, ...structuredClone(patch) }; for (const listener of listeners) listener(Object.fromEntries(Object.keys(patch).map(k => [k, { newValue: patch[k] }])), 'local'); }
  }, sync: { get: (_key, callback) => callback({}), set: (_value, callback) => callback() }, onChanged: { addListener: callback => listeners.push(callback), removeListener: callback => { const index = listeners.indexOf(callback); if (index >= 0) listeners.splice(index, 1); } } }, runtime: {
    lastError: null, openOptionsPage: () => optionsOpened++,
    sendMessage: async message => { if (message.action === 'configure') { values.settings.healthyFeed = { ...values.settings.healthyFeed, mode: message.mode }; return { ok: true }; } return { ok: true }; }
  }, tabs: { query: async () => [], create: async () => {}, update: async () => {} }, windows: { update: async () => {} } };
  w.eval(read('dist/focus-popup.js'));
  w.eval(read('focus/healthy-feed-core.js'));
  w.eval(read('focus/healthy-feed-ui.js'));
  w.eval(read('focus/popup.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait();
  return { w, dom, data: () => values, set: patch => w.chrome.storage.local.set(patch), optionsOpened: () => optionsOpened };
}

test('MUI focus controls start, stop and log a session with strict mode respected', async () => {
  const f = await fixture();
  try {
    const d = f.w.document;
    assert.ok(d.querySelector('.MuiTextField-root'));
    assert.equal(d.getElementById('status-badge-label').textContent, 'OFF');
    const start = d.querySelector('[data-duration="25"]');
    assert.ok(start.classList.contains('MuiButton-root'));
    start.click(); await wait();
    assert.equal(d.getElementById('input-error').style.display, 'block');
    d.getElementById('task-input').value = 'Học bài';
    start.click(); await wait();
    assert.equal(f.data().focus.task, 'Học bài');
    assert.equal(f.data().focus.durationMinutes, 25);
    assert.equal(d.getElementById('status-badge-label').textContent, 'ON');
    assert.equal(d.getElementById('focus-active-view').style.display, 'block');
    await f.set({ settings: { strictMode: true, enabledPresets: [] } }); await wait();
    assert.equal(d.getElementById('stop-focus-btn').style.display, 'none');
    await f.set({ settings: { strictMode: false, enabledPresets: [] } }); await wait();
    d.getElementById('stop-focus-btn').click(); await wait();
    assert.equal(f.data().focus.pendingLog, true);
    d.getElementById('log-done-btn').click(); await wait();
    assert.equal(f.data().focusHistory.at(-1).result, 'Done');
    assert.equal(f.data().focus.pendingLog, false);
    d.getElementById('open-rules-btn').click(); assert.equal(f.optionsOpened(), 1);
  } finally { f.dom.window.close(); }
});

test('MUI Healthy Feed select syncs the saved mode and dispatches configuration', async () => {
  const f = await fixture({ settings: { strictMode: false, enabledPresets: [], healthyFeed: { mode: 'social' } } });
  try {
    const d = f.w.document;
    const native = d.getElementById('feed-mode');
    assert.equal(native.value, 'social');
    const control = d.querySelector('[role="combobox"]');
    assert.ok(control);
    assert.equal(control.textContent, 'Xã hội');
    control.dispatchEvent(new f.w.MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait();
    const option = [...d.querySelectorAll('[role="option"]')].find(el => el.textContent === 'Thông tin');
    assert.ok(option, 'MUI menu should open');
    option.click(); await wait();
    assert.equal(f.data().settings.healthyFeed.mode, 'information');
    assert.equal(native.value, 'information');
  } finally { f.dom.window.close(); }
});
