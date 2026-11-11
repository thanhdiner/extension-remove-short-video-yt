"use strict";
(() => {
  let port = null, sequence = 0;
  const pending = new Map(), bound = new Set(), queues = new Map();
  function serial(url, action) {
    const task = (queues.get(url) || Promise.resolve()).catch(() => {}).then(action);
    queues.set(url, task);
    const cleanup = () => { if (queues.get(url) === task) queues.delete(url); };
    task.then(cleanup, cleanup);
    return task;
  }
  function unavailable(message) { return Object.assign(new Error(message), { code: "NATIVE_UNAVAILABLE" }); }
  function connect() {
    if (port) return port;
    if (typeof chrome.runtime.connectNative !== "function") throw unavailable("Native file host is unavailable");
    const active = chrome.runtime.connectNative("dinkit.editor"); port = active;
    active.onMessage.addListener(message => {
      if (message.type !== "fileResult") return;
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(Object.assign(new Error(message.error), { code: message.code })); else task.resolve(message.result);
    });
    active.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (port === active) port = null;
      bound.clear();
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(unavailable(error?.message || "Native file host disconnected")); }
      pending.clear();
    });
    return active;
  }
  function request(operation, data) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      try {
        const active = connect();
        const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error("File operation timed out. Check the file before retrying."), { code: "NATIVE_TIMEOUT" })); }, 30000);
        pending.set(id, { resolve, reject, timer });
        active.postMessage({ type: "file", id, operation, ...data });
      } catch (error) { const task = pending.get(id); if (task) clearTimeout(task.timer); pending.delete(id); reject(unavailable(error.message)); }
    });
  }
  async function bind(url, expectedHash) {
    try { const result = await request("bind", { url, expectedHash }); bound.add(url); return result.token; }
    catch (error) { bound.delete(url); if (["NATIVE_UNAVAILABLE", "DIRECT_SAVE_UNSUPPORTED"].includes(error.code)) return null; throw error; }
  }
  window.localFileAccess = {
    bind: (url, expectedHash) => serial(url, () => bind(url, expectedHash)),
    canSave: url => !!url && bound.has(url),
    save(url, expectedHash, bytes) { return serial(url, async () => {
      const token = await bind(url, expectedHash); if (!token) return null;
      const parts = [];
      for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
      // A disconnected write is ambiguous: do not open another writer automatically.
      return request("write", { token, expectedHash, data: btoa(parts.join("")) });
    }); }
  };
})();
