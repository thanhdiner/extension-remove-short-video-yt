import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function until(condition) {
  for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.ok(condition(), 'UI did not reach the expected state');
}
function fixture({ raw = '{"items":[{"n":9007199254740993123}],"s":"<img onerror=alert(1)>"}', enabled = true, type = 'application/json' } = {}) {
  const dom = new JSDOM('<body><pre></pre></body>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://api.example/data' });
  const w = dom.window;
  w.document.querySelector('pre').textContent = raw;
  Object.defineProperty(w.document, 'contentType', { value: type });
  w.scrollTo = () => {};
  let state = { hys_settings: { jsonFormatterEnabled: enabled, customSetting: 123 }, dinkit_language: 'vi' };
  const listeners = new Set();
  const messages = [];
  const copied = [];
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied.push(text); } } });
  function change(key, value) { const oldValue = state[key]; state = { ...state, [key]: value }; for (const listener of [...listeners]) listener({ [key]: { oldValue, newValue: value } }, 'sync'); }
  w.chrome = { runtime: { lastError: null, sendMessage: (message, callback) => { messages.push(message); callback?.({ ok: true }); } }, storage: { sync: { get: (key, callback) => callback({ [key]: state[key] }) }, onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } } };
  return { dom, w, change, messages, copied, raw, shadow: () => w.document.querySelector('#dinkit-json-viewer')?.shadowRoot };
}

test('JSON viewer folds, shows exact raw data, copies and responds to shared language', async () => {
  const f = fixture();
  try {
    f.w.eval(read('dist/json-viewer.js'));
    await until(() => f.shadow()?.querySelector('.key'));
    assert.ok(f.shadow().textContent.includes('9007199254740993123'));
    assert.equal(f.shadow().querySelector('img'), null, 'JSON markup is never interpreted as HTML');
    const rootFold = f.shadow().querySelector('.fold');
    rootFold.click();
    await until(() => f.shadow().querySelectorAll('.line').length === 1);
    assert.equal(f.shadow().querySelector('.fold').getAttribute('aria-expanded'), 'false');
    f.shadow().querySelector('[aria-label="Mở rộng tất cả"]').click();
    await until(() => f.shadow().querySelectorAll('.line').length > 1);
    f.change('dinkit_language', 'en');
    await until(() => f.shadow().querySelector('[aria-label="Copy"]'));
    f.shadow().querySelector('button[value="raw"]').click();
    await until(() => f.shadow().querySelector('pre'));
    assert.equal(f.shadow().querySelector('pre').textContent, f.raw);
    f.shadow().querySelector('[aria-label="Copy"]').click();
    await until(() => f.copied.length === 1);
    assert.equal(f.copied[0], f.raw);
    f.shadow().querySelector('button[value="formatted"]').click();
    await until(() => f.shadow().querySelector('.line'));
    f.shadow().querySelector('[aria-label="Copy"]').click();
    await until(() => f.copied.length === 2);
    assert.ok(f.copied[1].includes('\n'));
    assert.ok(f.copied[1].includes('9007199254740993123'));
  } finally { f.dom.window.close(); }
});

test('disabling restores the exact original DOM and re-enabling cannot duplicate the viewer', async () => {
  const f = fixture();
  const original = f.w.document.querySelector('pre');
  let clicks = 0;
  original.addEventListener('click', () => clicks++);
  try {
    f.w.eval(read('dist/json-viewer.js'));
    await until(() => f.shadow()?.querySelector('.line'));
    f.change('hys_settings', { jsonFormatterEnabled: false });
    assert.equal(f.shadow(), undefined);
    assert.equal(f.w.document.querySelector('pre'), original);
    assert.equal(original.textContent, f.raw);
    original.click(); assert.equal(clicks, 1, 'original event handlers survive');
    f.change('hys_settings', { jsonFormatterEnabled: true });
    f.w.eval(read('dist/json-viewer.js'));
    await until(() => f.shadow()?.querySelector('.line'));
    assert.equal(f.w.document.querySelectorAll('#dinkit-json-viewer').length, 1);
  } finally { f.dom.window.close(); }
});

test('disabled, invalid, HTML and large JSON documents never replace original content', async () => {
  for (const options of [{ enabled: false }, { raw: '{invalid}' }, { type: 'text/html' }, { raw: ' '.repeat(5 * 1024 * 1024 + 1) }]) {
    const f = fixture(options);
    try { const original = f.w.document.body.innerHTML; f.w.eval(read('dist/json-viewer.js')); assert.equal(f.w.document.body.innerHTML, original); } finally { f.dom.window.close(); }
  }
});

test('detector only requests the viewer for eligible top-level documents and respects changes', () => {
  for (const [options, requests] of [[{}, 1], [{ enabled: false }, 0], [{ type: 'text/html' }, 0]]) {
    const f = fixture(options);
    try {
      f.w.eval(read('dist/json-detector.js'));
      assert.equal(f.messages.length, requests);
      if (options.enabled === false) { f.change('hys_settings', { jsonFormatterEnabled: true }); assert.equal(f.messages.length, 1); }
    } finally { f.dom.window.close(); }
  }
  const f = fixture();
  try {
    let initial;
    f.w.chrome.storage.sync.get = (_key, callback) => { initial = callback; };
    f.w.eval(read('dist/json-detector.js'));
    f.change('hys_settings', { jsonFormatterEnabled: false });
    initial({ hys_settings: { jsonFormatterEnabled: true } });
    assert.equal(f.messages.length, 0, 'stale reads cannot override a recent disable');
  } finally { f.dom.window.close(); }
});

test('worker injection checks sender, respects the preference, pins the document and handles failures', async () => {
  let listener;
  const injected = [];
  let enabled = true;
  let fail = false;
  const context = { chrome: { runtime: { id: 'dinkit', onMessage: { addListener: callback => { listener = callback; } } }, storage: { sync: { get: async () => ({ hys_settings: { jsonFormatterEnabled: enabled } }) } }, scripting: { executeScript: async spec => { if (fail) throw new Error('tab closed'); injected.push(spec); } } } };
  vm.runInNewContext(read('dist/json-viewer-worker.js'), context);
  const message = { type: 'DINKIT_JSON_VIEWER' };
  const sender = { id: 'dinkit', frameId: 0, tab: { id: 7 }, url: 'https://api.example/data', documentId: 'original-doc' };
  for (const patch of [{ id: 'other' }, { frameId: 2 }, { url: 'chrome://settings' }, { tab: {} }]) assert.equal(listener(message, { ...sender, ...patch }, () => {}), undefined);
  const send = (patch = {}) => new Promise(resolve => { assert.equal(listener(message, { ...sender, ...patch }, resolve), true); });
  assert.equal((await send()).ok, true);
  assert.equal(JSON.stringify(injected[0]), JSON.stringify({ target: { tabId: 7, documentIds: ['original-doc'] }, files: ['dist/json-viewer.js'] }));
  assert.equal((await send({ url: 'file:///D:/backup.json' })).ok, true);
  assert.equal(injected.length, 2, 'local JSON documents can request injection');
  enabled = false; await send(); assert.equal(injected.length, 2);
  enabled = true; fail = true; assert.equal((await send()).ok, false);
});

test('plain HTTP clipboard fallback cleans up and copy errors remain visible', async () => {
  const f = fixture();
  try {
    delete f.w.navigator.clipboard.writeText;
    let didCopy = false;
    f.w.document.execCommand = command => { didCopy = command === 'copy'; return didCopy; };
    f.w.eval(read('dist/json-viewer.js'));
    await until(() => f.shadow()?.querySelector('[aria-label="Sao chép"]'));
    f.shadow().querySelector('[aria-label="Sao chép"]').click();
    await until(() => f.shadow().querySelector('[role="status"]')?.textContent === 'Đã sao chép!');
    assert.equal(didCopy, true);
    assert.equal(f.w.document.querySelector('textarea'), null);
    f.w.document.execCommand = () => false;
    f.shadow().querySelector('[aria-label="Sao chép"]').click();
    await until(() => f.shadow().querySelector('[role="status"]')?.textContent === 'Sao chép thất bại');
    assert.equal(f.w.document.querySelector('textarea'), null);
  } finally { f.dom.window.close(); }
});
