import test from 'node:test';
import assert from 'node:assert/strict';
import { openPageRuler, togglePageRuler } from '../src/page-ruler.mjs';

test('ruler injects only into the active website, in the isolated world by default', async () => {
  let injection;
  const api = { tabs: { query: async () => [{ id: 7, url: 'https://example.com/' }] }, scripting: { executeScript: async value => { injection = value; } } };
  await openPageRuler({ title: 'Ruler' }, api);
  assert.deepEqual(injection.target, { tabId: 7 });
  assert.equal(injection.func, togglePageRuler);
  assert.deepEqual(injection.args, [{ title: 'Ruler' }]);
});

test('ruler reports restricted pages and injection failures without closing the popup', async () => {
  for (const url of ['chrome://settings/', 'chrome-extension://id/popup.html', 'about:blank', 'file:///test.html']) {
    await assert.rejects(openPageRuler({}, { tabs: { query: async () => [{ id: 1, url }] } }), /rulerUnavailable/);
  }
  await assert.rejects(openPageRuler({}, { tabs: { query: async () => [{ id: 1, url: 'https://chromewebstore.google.com/' }] }, scripting: { executeScript: async () => { throw Error('blocked'); } } }), /rulerUnavailable/);
});
