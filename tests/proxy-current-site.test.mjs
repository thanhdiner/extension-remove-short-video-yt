import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSiteFromTab, getCurrentProxySite } from '../src/proxy-current-site.mjs';

test('current website uses only the active HTTP(S) hostname, including IPv6 and IDN', () => {
  for (const [url, expected] of [
    ['https://EXAMPLE.com:8443/private?q=secret#x', 'example.com'],
    ['http://[::1]:8080/path', '[::1]'],
    ['https://tên.vn/path', new URL('https://tên.vn').hostname],
    ['chrome://extensions/', ''], ['file:///D:/data.json', ''],
    ['chrome-extension://test/popup.html', ''], ['about:blank', ''], ['invalid', ''],
  ]) assert.equal(currentSiteFromTab({ url }), expected);
  assert.equal(currentSiteFromTab(undefined), '');
});

test('active tab lookup targets the current window and handles missing permission or closed context', async () => {
  const previous = globalThis.chrome;
  try {
    globalThis.chrome = { runtime: {}, tabs: { query: (options, callback) => {
      assert.deepEqual(options, { active: true, currentWindow: true });
      callback([{ url: 'https://active.example/path' }]);
    } } };
    assert.equal(await getCurrentProxySite(), 'active.example');
    chrome.runtime.lastError = { message: 'unavailable' };
    assert.equal(await getCurrentProxySite(), '');
    delete chrome.runtime.lastError;
    chrome.tabs.query = (_options, callback) => callback([]);
    assert.equal(await getCurrentProxySite(), '');
    chrome.tabs.query = () => { throw new Error('context invalidated'); };
    assert.equal(await getCurrentProxySite(), '');
  } finally { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; }
});
