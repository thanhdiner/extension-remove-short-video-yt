import { createAuthStore } from './auth-store.mjs';

// Extension-origin IndexedDB is inaccessible from website content scripts.
let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const open = indexedDB.open('dinkit-authenticator', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('vault');
    open.onsuccess = () => { const db = open.result; db.onversionchange = () => { db.close(); connection = null; }; resolve(db); };
    open.onerror = () => { connection = null; reject(new Error('authStorageError')); };
  });
  return connection;
}
async function transaction(mode, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vault', mode), store = tx.objectStore('vault');
    const request = mode === 'readonly' ? store.get('state') : store.put(value, 'state');
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('authStorageError'));
  });
}
const run = createAuthStore({ read: () => transaction('readonly'), write: value => transaction('readwrite', value) });
export function isAuthSender(sender, id, origin) {
  return sender.id === id && sender.url === origin + 'popup.html';
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'DINKIT_AUTH' || !isAuthSender(sender, chrome.runtime.id, chrome.runtime.getURL(''))) return;
  run(message).then(result => reply({ ok: true, ...result }), error => reply({ ok: false, error: /^auth[A-Z]\w*$/.test(error.message) ? error.message : 'authStorageError' }));
  return true;
});
