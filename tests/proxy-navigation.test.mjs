import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(condition) { for (let i = 0; i < 100 && !condition(); i++) await tick(); assert.ok(condition()); }
function fixture() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://dinkit.example/popup.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const pending = [];
  const event = { addListener() {}, removeListener() {} };
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.chrome = {
    storage: { sync: { get: (_key, callback) => callback({}), set: (_patch, callback) => callback?.() }, onChanged: event },
    runtime: { lastError: null, sendMessage: (message, callback) => { if (message.type === 'DINKIT_PROXY') pending.push(callback); } },
    tabs: { query: (_options, callback) => callback([{ url: 'https://example.com/path' }]) },
    proxy: { settings: { onChange: event } },
  };
  w.eval(readFileSync(new URL('../dist/popup.js', import.meta.url), 'utf8'));
  const openProxy = () => [...w.document.querySelectorAll('.tool-row')].find(button => button.textContent === 'Proxy').click();
  const ready = () => pending.shift()({ ok: true, config: { enabled: false, rules: [], profiles: [] }, control: 'controllable_by_this_extension', error: '' });
  return { dom, w, pending, openProxy, ready };
}

test('entering Proxy waits for ready content and returning preserves the mounted form without another loading frame', async () => {
  const f = fixture();
  try {
    await until(() => f.pending.length === 1 && f.w.document.querySelector('.tool-row'));
    f.openProxy(); await tick();
    assert.equal(f.w.document.querySelector('h1').textContent, 'DinKit', 'keep home visible while the initial configuration is pending');
    f.ready();
    await until(() => f.w.document.querySelector('h1').textContent === 'Proxy');
    const panel = f.w.document.querySelector('.proxy-panel');
    assert.equal(panel.parentElement.hidden, false);
    assert.ok([...panel.querySelectorAll('button')].some(button => button.textContent === 'Thêm trang hiện tại'), 'current tab and configuration appear together');
    [...panel.querySelectorAll('button')].find(button => button.textContent.includes('Thêm website')).click();
    await until(() => panel.querySelector('input[placeholder="example.com / *.example.com"]'));
    const input = panel.querySelector('input[placeholder="example.com / *.example.com"]');
    f.w.document.querySelector('[aria-label="Quay lại"]').click(); await tick();
    assert.equal(panel.parentElement.hidden, true);
    f.openProxy(); await tick();
    assert.equal(f.w.document.querySelector('.proxy-panel'), panel, 'reopening does not remount the panel');
    assert.equal(panel.querySelector('input[placeholder="example.com / *.example.com"]'), input, 'form DOM is preserved');
    assert.equal(panel.parentElement.hidden, false);
    assert.equal(f.pending.length, 0, 'navigation does not trigger a fresh read');
  } finally { f.dom.window.close(); }
});

test('a delayed Proxy load cannot override navigation to another tool', async () => {
  const f = fixture();
  try {
    await until(() => f.pending.length === 1 && f.w.document.querySelector('.tool-row'));
    f.openProxy();
    [...f.w.document.querySelectorAll('.tool-row')].find(button => button.textContent === 'YouTube').click();
    await until(() => f.w.document.querySelector('h1').textContent === 'YouTube');
    f.ready(); await tick();
    assert.equal(f.w.document.querySelector('h1').textContent, 'YouTube');
  } finally { f.dom.window.close(); }
});
