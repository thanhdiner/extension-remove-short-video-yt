import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { isLocalTextFile, openTextEditor } from '../src/editor-route.mjs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('editor opens the active local TXT with an encoded URL and leaves other pages as blank workspaces', async () => {
  for (const url of ['file:///D:/notes/a%20%23%20%25.TXT?x=1', 'https://example.com/file.txt', 'file:///D:/notes/data.json', undefined]) {
    const created = [];
    const api = {
      runtime: { getURL: path => `chrome-extension://dinkit/${path}` },
      tabs: { query: async () => [{ url }], create: async spec => { created.push(spec); return spec; } }
    };
    await openTextEditor(api);
    const expected = `chrome-extension://dinkit/editor/editor.html${isLocalTextFile(url) ? `?file=${encodeURIComponent(url)}` : ''}`;
    assert.deepEqual(created, [{ url: expected }]);
  }
  for (const invalid of ['file:///D:/bad%zz.txt', 'not a URL', 'https://example.com/note.txt', 'file:///D:/note.txt.exe']) assert.equal(isLocalTextFile(invalid), false);
});

test('clicking the tool from an existing editor tab does not duplicate it', async () => {
  const tab = { id: 42, url: 'chrome-extension://dinkit/editor/editor.html?workspaceTest=one' };
  const api = { runtime: { getURL: path => `chrome-extension://dinkit/${path}` }, tabs: { query: async () => [tab], create: () => assert.fail('Duplicate editor') } };
  assert.equal(await openTextEditor(api), tab);
});

test('opening from another page focuses the existing editor without replacing its unsaved session', async () => {
  const existing = { id: 42, windowId: 3, url: 'chrome-extension://dinkit/editor/editor.html?file=old.txt' };
  const updates = [];
  const api = {
    runtime: { getURL: path => `chrome-extension://dinkit/${path}` },
    tabs: {
      query: async filter => filter.active ? [{ url: 'https://example.com' }] : [existing],
      create: () => assert.fail('Must reuse existing editor'),
      update: async (...args) => updates.push(args)
    },
    windows: { update: async (...args) => updates.push(args) }
  };
  assert.equal(await openTextEditor(api), existing);
  assert.deepEqual(updates, [[42, { active: true }], [3, { focused: true }]]);
});

test('local TXT routing ignores iframe, non-text and invalid URLs, and survives extension reload', () => {
  for (const options of [{}, { frame: true }, { type: 'text/html' }, { url: 'file:///D:/bad%zz.txt' }, { url: 'file:///D:/backup.json' }, { invalidated: true }]) {
    const redirected = [];
    const window = {};
    window.top = options.frame ? {} : window;
    const url = options.url || 'file:///D:/notes/%C4%91%E1%BB%93%20%C3%A1n.txt';
    vm.runInNewContext(read('dist/editor-detector.js'), {
      URL, window, document: { contentType: options.type || 'text/plain' },
      location: { href: url, replace: value => redirected.push(value) },
      chrome: { runtime: { getURL: path => { if (options.invalidated) throw Error('Extension context invalidated'); return `chrome-extension://dinkit/${path}`; } } }
    });
    assert.deepEqual(redirected, Object.keys(options).length ? [] : [`chrome-extension://dinkit/editor/editor.html?file=${encodeURIComponent(url)}`]);
  }
});

test('JSON detector yields TXT documents to the editor even when the text is valid JSON', () => {
  const window = {}; window.top = window;
  vm.runInNewContext(read('dist/json-detector.js'), {
    URL, window, location: { href: 'file:///D:/data.txt' },
    document: { get contentType() { assert.fail('TXT must route to the editor before JSON inspection'); } }
  });
});
