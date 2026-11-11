import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const delay = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition) {
  const deadline = Date.now() + 3000;
  while (!condition() && Date.now() < deadline) await delay(10);
  assert.ok(condition(), 'language UI did not reach the expected state');
}
function makeStorage() {
  const listeners = new Set();
  let sync = {};
  return { listeners, sync: {
    get: (key, callback) => callback({ [key]: sync[key] }),
    set: (patch, callback) => { const changes = {}; for (const [key,value] of Object.entries(patch)) changes[key] = { oldValue: sync[key], newValue: value }; sync = { ...sync, ...patch }; for (const listener of listeners) listener(changes, 'sync'); callback?.(); }
  }, get value() { return sync; } };
}
function chromeMock(shared) {
  return { runtime: { lastError: null, sendMessage: (_message, callback) => callback({ ok: true }), getURL: path => `chrome-extension://test/${path}` }, storage: { sync: shared.sync, local: { get: async () => ({}) }, onChanged: { addListener: listener => shared.listeners.add(listener), removeListener: listener => shared.listeners.delete(listener) } }, tabs: { create: () => {} } };
}
function createPage(markup, chrome, url) {
  const dom = new JSDOM(markup, { runScripts: 'outside-only', pretendToBeVisual: true, url });
  dom.window.chrome = chrome;
  dom.window.ResizeObserver = class { observe() {} disconnect() {} };
  return dom;
}
test('language selector on popup updates shared settings and extension pages', async () => {
  const shared = makeStorage();
  const popup = createPage('<!doctype html><div id="root"></div>', chromeMock(shared), 'https://dinkit.example/popup.html');
  const options = createPage(read('focus/options.html'), chromeMock(shared), 'https://dinkit.example/focus/options.html');
  try {
    options.window.eval(read('dist/language-runtime.js'));
    options.window.eval(read('focus/options-navigation.js'));
    popup.window.eval(read('dist/popup.js'));
    await until(() => [...popup.window.document.querySelectorAll('.tool-row')].some(button => button.textContent.includes('Ngôn ngữ')));
    const entry = [...popup.window.document.querySelectorAll('.tool-row')].find(button => button.textContent.includes('Ngôn ngữ'));
    assert.ok(entry, 'language entry appears in home list');
    entry.click(); await until(() => popup.window.document.querySelector('[role="combobox"]'));
    const select = popup.window.document.querySelector('[role="combobox"]');
    assert.ok(select);
    select.dispatchEvent(new popup.window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await until(() => [...popup.window.document.querySelectorAll('[role="option"]')].some(option => option.textContent === 'English'));
    const english = [...popup.window.document.querySelectorAll('[role="option"]')].find(option => option.textContent === 'English');
    assert.ok(english); english.click();
    await until(() => shared.value.dinkit_language === 'en' && options.window.document.querySelector('[data-i18n="rules"]').textContent === 'Rules' && popup.window.document.querySelector('h1').textContent === 'Language');
    assert.equal(shared.value.dinkit_language, 'en');
    assert.equal(options.window.document.querySelector('[data-i18n="rules"]').textContent, 'Rules');
    assert.equal(popup.window.document.querySelector('h1').textContent, 'Language');
    popup.window.document.querySelector('[aria-label="Back"]').click();
    await until(() => [...popup.window.document.querySelectorAll('.tool-row')].some(button => button.textContent.includes('Browser utilities')));
    assert.ok([...popup.window.document.querySelectorAll('.tool-row')].some(button => button.textContent.includes('Browser utilities')));
  } finally { popup.window.close(); options.window.close(); }
});

test('settings components and unsaved topics follow the shared language', async () => {
  const shared = makeStorage();
  const dom = createPage(read('focus/options.html'), chromeMock(shared), 'https://dinkit.example/focus/options.html');
  try {
    const w = dom.window;
    w.eval(read('dist/language-runtime.js'));
    w.eval(read('focus/options-navigation.js'));
    for (const script of ['options-selects', 'options-preset-help', 'options-accordions', 'options-topics']) w.eval(read(`dist/${script}.js`));
    await delay();
    assert.ok(w.document.body.textContent.includes('Chủ đề muốn xem và ẩn'));
    const input = w.document.querySelector('#feed-topics-mui input');
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Python');
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    await delay();
    shared.sync.set({ dinkit_language: 'en' }, () => {});
    await delay();
    assert.ok(w.document.body.textContent.includes('Topics to show and hide'));
    assert.ok(w.document.body.textContent.includes('Selected sources'));
    assert.equal(input.value, 'Python', 'switching language preserves the unsaved input');
    w.document.dispatchEvent(new w.Event('dinkit-topics-commit'));
    assert.equal(w.document.getElementById('feed-more-topics').value, 'Python');
    assert.equal(w.document.querySelector('[aria-label="About YouTube Learning Mode"]')?.getAttribute('aria-expanded'), 'false');
  } finally { dom.window.close(); }
});

test('switching language keeps an unsaved Reddit whitelist while rendering dynamic settings', async () => {
  const shared = makeStorage();
  const chrome = chromeMock(shared);
  chrome.storage.local.get = async () => ({ settings: { enabledPresets: ['reddit_research'], redditWhitelisted: ['old'], strictMode: false }, blockRules: [], dailyLimits: [], usageToday: {}, blockedAttempts: [], focus: {}, focusHistory: [], unlocks: [], pendingChanges: [] });
  chrome.storage.local.set = async () => {};
  const dom = createPage(read('focus/options.html'), chrome, 'https://dinkit.example/focus/options.html');
  try {
    const w = dom.window;
    w.eval(read('dist/language-runtime.js'));
    w.eval(read('focus/options-navigation.js'));
    w.eval(read('focus/options.js'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await delay();
    const input = w.document.getElementById('reddit-whitelist-input');
    assert.equal(input.value, 'old');
    input.value = 'new, draft';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    shared.sync.set({ dinkit_language: 'en' }, () => {});
    await delay();
    assert.equal(input.value, 'new, draft');
    assert.match(w.document.getElementById('blocklist-list').textContent, /No domains in blocklist/);
  } finally { dom.window.close(); }
});

test('blocked page and focus notification use the same language preference', async () => {
  const shared = makeStorage();
  const chrome = chromeMock(shared);
  chrome.storage.local.get = async () => ({ focus: { active: false } });
  const blocked = createPage(read('focus/blocked.html'), chrome, 'https://dinkit.example/focus/blocked.html');
  try {
    const w = blocked.window;
    w.eval(read('dist/language-runtime.js'));
    w.eval(read('focus/blocked.js'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await delay();
    const quote = w.document.getElementById('motivation-quote');
    const original = quote.textContent;
    assert.equal(w.document.querySelector('.title').textContent, 'Đã chặn.');
    shared.sync.set({ dinkit_language: 'en' }, () => {});
    await delay();
    assert.equal(w.document.querySelector('.title').textContent, 'Blocked.');
    assert.notEqual(quote.textContent, original);
    const worker = createPage('<!doctype html>', { storage: { sync: { get: async key => ({ [key]: shared.value[key] }) } } }, 'https://dinkit.example/');
    try {
      worker.window.eval(read('dist/worker-language.js'));
      assert.equal(await worker.window.dinkitWorkerMessage('focusFinished', { task: 'Plan' }), 'Focus session completed: “Plan”. Log your result in the popup.');
    } finally { worker.window.close(); }
  } finally { blocked.window.close(); }
});
