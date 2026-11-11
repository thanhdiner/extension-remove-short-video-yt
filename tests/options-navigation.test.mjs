import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = path => readFileSync(new URL(`../focus/${path}`, import.meta.url), 'utf8');

test('options navigation keeps existing controls and switches groups', () => {
  const dom = new JSDOM(read('options.html'), { runScripts: 'outside-only' });
  const { window } = dom;
  const { document } = window;
  const controls = ['blocklist-input','limit-domain-input','preset-youtube-cb','feed-mode','strict-mode-cb','pending-changes-card','unlock-trigger-btn','import-file-input','stat-wasted','focus-history-list'].map(id => document.getElementById(id));
  window.dinkitI18n = { t: key => ({rules:'Quy tắc',modes:'Chế độ',stats:'Thống kê',more:'Khác'})[key], apply: () => {} };
  window.eval(read('options-navigation.js'));
  assert.ok(controls.every(control => control.isConnected));
  assert.equal(document.querySelector('[data-page="rules"]').hidden, false);
  assert.equal(document.querySelector('[data-page="modes"]').hidden, true);
  document.querySelector('[data-options-page="modes"]').click();
  assert.equal(document.querySelector('[data-page="rules"]').hidden, true);
  assert.equal(document.querySelector('[data-page="modes"]').hidden, false);
  assert.equal(document.getElementById('feed-mode').closest('[data-page]').dataset.page, 'modes');
  assert.equal(document.querySelector('[data-options-page="modes"]').getAttribute('aria-current'), 'page');
  document.querySelector('[data-options-page="stats"]').click();
  assert.equal(document.getElementById('focus-history-list').closest('[data-page]').hidden, false);
  document.querySelector('[data-options-page="more"]').click();
  assert.equal(document.getElementById('unlock-trigger-btn').closest('[data-page]').hidden, false);
  dom.window.close();
});
