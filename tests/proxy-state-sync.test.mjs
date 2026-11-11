import test from 'node:test';
import assert from 'node:assert/strict';
import { createProxyStateSync } from '../src/proxy-state-sync.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const reads = [], commits = [], errors = [], timers = new Map();
  let nextTimer = 0;
  const sync = createProxyStateSync({
    read: () => { const task = deferred(); reads.push(task); return task.promise; },
    commit: value => commits.push(value), fail: error => errors.push(error),
    schedule: callback => { timers.set(++nextTimer, callback); return nextTimer; }, cancel: id => timers.delete(id),
  });
  const flush = async () => { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); await Promise.resolve(); };
  return { sync, reads, commits, errors, timers, flush };
}

test('old Chrome state cannot flip a switch back while a mutation is pending or after it commits', async () => {
  const f = fixture();
  const old = f.sync.refresh();
  assert.equal(f.sync.begin(), true);
  assert.equal(f.sync.begin(), false, 'duplicate edits are blocked immediately');
  f.sync.notify(); f.sync.notify();
  assert.equal(f.timers.size, 0, 'events belonging to the save do not cause redundant snapshots');
  f.sync.finish({ enabled: true });
  f.reads[0].resolve({ enabled: false });
  await old;
  assert.deepEqual(f.commits, [{ enabled: true }]);
});

test('a burst of storage and proxy events performs one read and discards older snapshots', async () => {
  const f = fixture();
  const original = f.sync.refresh();
  f.sync.notify(); f.sync.notify(); f.sync.notify();
  assert.equal(f.timers.size, 1);
  f.reads[0].resolve({ stale: true }); await original;
  assert.equal(f.commits.length, 0);
  await f.flush();
  assert.equal(f.reads.length, 2);
  f.reads[1].resolve({ current: true }); await Promise.resolve();
  assert.deepEqual(f.commits, [{ current: true }]);
});

test('failed saves refresh current state and a closed panel ignores pending callbacks', async () => {
  const f = fixture();
  f.sync.begin(); f.sync.finish();
  assert.equal(f.reads.length, 1);
  f.reads[0].resolve({ restored: true }); await Promise.resolve();
  assert.deepEqual(f.commits, [{ restored: true }]);
  const pending = f.sync.refresh();
  f.sync.notify(); f.sync.dispose();
  f.reads[1].reject(new Error('late storage failure')); await pending;
  f.sync.finish({ late: true }); f.sync.notify();
  assert.equal(f.commits.length, 1);
  assert.equal(f.errors.length, 0);
  assert.equal(f.timers.size, 0);
});
