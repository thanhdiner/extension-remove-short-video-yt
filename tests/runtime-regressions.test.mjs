import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { watchFocusFrame } from '../src/focus-frame.mjs';

test('iframe sizing measures content, schedules writes and settles after grow/shrink', () => {
  let notify, measured = 378.34, ready = 0, nextId = 0, disconnected = false;
  const callbacks = new Map(), writes = [];
  const content = { getBoundingClientRect: () => ({ height: measured }) };
  const style = { get height() { return writes.at(-1); }, set height(value) { writes.push(value); } };
  const frame = { style, contentDocument: { body: { scrollHeight: 480 }, querySelector: () => content } };
  class Observer {
    constructor(cb) { notify = cb; }
    observe(target) { assert.equal(target, content); }
    disconnect() { disconnected = true; }
  }
  const stop = watchFocusFrame(frame, () => ready++, {
    Observer, request: cb => { callbacks.set(++nextId, cb); return nextId; }, cancel: id => callbacks.delete(id),
  });
  const flush = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(cb => cb()); };
  notify(); notify();
  assert.equal(writes.length, 0, 'observer must not resize during its notification');
  assert.equal(callbacks.size, 1);
  flush();
  assert.deepEqual(writes, ['379px']);
  notify(); flush();
  assert.equal(writes.length, 1, 'unchanged content should not rewrite iframe height');
  measured = 800; notify(); flush();
  measured = 240.1; notify(); flush();
  assert.deepEqual(writes, ['379px', '500px', '241px']);
  assert.equal(ready, 1);
  notify(); stop(); flush();
  assert.equal(disconnected, true);
  assert.equal(callbacks.size, 0);
});

const settingsSource = readFileSync(new URL('../content.js', import.meta.url), 'utf8').split('function isShortsUrl')[0];
function makeContent({ invalidateBeforeCallback = false } = {}) {
  let alive = true, reads = 0, change;
  const runtime = {
    get id() { return alive ? 'test-extension' : undefined; },
    get lastError() { if (!alive) throw new Error('Extension context invalidated.'); return undefined; },
  };
  const chrome = { runtime, storage: {
    onChanged: { addListener(cb) { change = cb; } },
    sync: {
      get(_, cb) { reads++; queueMicrotask(() => { if (invalidateBeforeCallback) alive = false; cb({ hys_settings: { seekSeconds: 42 } }); }); },
      set(_, cb) { if (!alive) throw new Error('Extension context invalidated.'); cb(); },
    },
  } };
  const context = vm.createContext({ chrome });
  vm.runInContext(settingsSource + '\nglobalThis.read = getSettings; globalThis.write = setSettings;', context);
  return { context, invalidate: () => { alive = false; }, reads: () => reads, change: value => change({ hys_settings: { newValue: value } }, 'sync') };
}

test('content settings survive extension reload and later video metadata events', async () => {
  const content = makeContent();
  assert.equal((await content.context.read()).seekSeconds, 42);
  content.change({ seekSeconds: 15 });
  content.invalidate();
  for (let event = 0; event < 5; event++) assert.equal((await content.context.read()).seekSeconds, 15);
  await content.context.write({ userSpeed: 1.5 });
  assert.equal((await content.context.read()).userSpeed, 1.5);
  assert.equal(content.reads(), 1);
});

test('content initialization resolves if extension reload happens before storage callback', async () => {
  const content = makeContent({ invalidateBeforeCallback: true });
  assert.equal((await content.context.read()).seekSeconds, 20);
  await content.context.write({ seekSeconds: 30 });
  assert.equal((await content.context.read()).seekSeconds, 30);
});
