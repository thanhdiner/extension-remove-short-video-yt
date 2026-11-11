import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { messages, normalizeLanguage, translate } from '../src/i18n.mjs';

test('every shared message has Vietnamese and English and supports interpolation', () => {
  for (const [key, pair] of Object.entries(messages)) {
    assert.equal(pair.length, 2, key);
    assert.ok(pair.every(value => typeof value === 'string' && value.length), key);
  }
  assert.equal(normalizeLanguage('fr'), 'vi');
  assert.equal(translate('vi', 'startMinutes', { minutes: 25 }), 'Bắt đầu 25 phút');
  assert.equal(translate('en', 'startMinutes', { minutes: 25 }), 'Start 25 minutes');
});

test('shared language setting updates options text without touching user values', async () => {
  const html = readFileSync(new URL('../focus/options.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://dinkit.example/' });
  const { window } = dom;
  const listeners = [];
  window.chrome = { runtime: { lastError: null }, storage: { sync: { get: (_key, callback) => callback({ dinkit_language: 'en' }) }, onChanged: { addListener: callback => listeners.push(callback) } } };
  window.eval(readFileSync(new URL('../dist/language-runtime.js', import.meta.url), 'utf8'));
  const find = key => window.document.querySelector(`[data-i18n="${key}"]`).textContent;
  assert.equal(find('rules'), 'Rules');
  const input = window.document.getElementById('blocklist-input');
  input.value = 'my-site.example';
  listeners[0]({ dinkit_language: { newValue: 'vi' } }, 'sync');
  assert.equal(find('rules'), 'Quy tắc');
  assert.equal(input.value, 'my-site.example');
  assert.equal(window.document.documentElement.lang, 'vi');
  dom.window.close();
});
