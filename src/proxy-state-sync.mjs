// Coalesce Chrome's storage/proxy events and reject snapshots requested before
// a user edit. A mutation response already contains its committed state.
export function createProxyStateSync({ read, commit, fail, schedule = setTimeout, cancel = clearTimeout }) {
  let revision = 0;
  let pending = false;
  let disposed = false;
  let timer;
  function stopTimer() { if (timer !== undefined) cancel(timer); timer = undefined; }
  async function refresh() {
    stopTimer();
    if (disposed || pending) return;
    const current = ++revision;
    try {
      const value = await read();
      if (!disposed && !pending && current === revision) commit(value);
    } catch (error) { if (!disposed && !pending && current === revision) fail(error); }
  }
  return {
    refresh,
    notify() {
      if (disposed || pending) return;
      revision++;
      stopTimer();
      timer = schedule(refresh, 80);
    },
    begin() {
      if (disposed || pending) return false;
      pending = true;
      revision++;
      stopTimer();
      return true;
    },
    finish(value) {
      if (disposed) return;
      pending = false;
      revision++;
      if (value) commit(value);
      else refresh();
    },
    dispose() { disposed = true; revision++; stopTimer(); },
  };
}
