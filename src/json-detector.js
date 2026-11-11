import { readJsonDocument } from './json-format.mjs';
import { isLocalTextFile } from './editor-route.mjs';

if (window.top === window && !isLocalTextFile(location.href) && readJsonDocument(document) !== null) {
  let requested = false;
  let revision = 0;
  function update(settings = {}) {
    const enabled = settings.jsonFormatterEnabled !== false;
    if (globalThis.dinkitJsonViewer) { globalThis.dinkitJsonViewer.setEnabled(enabled); return; }
    if (!enabled || requested) return;
    requested = true;
    try {
      chrome.runtime.sendMessage({ type: 'DINKIT_JSON_VIEWER' }, () => {
        // An extension reload or navigation may close the message channel.
        try { void chrome.runtime.lastError; } catch { /* Context invalidated. */ }
        requested = false;
      });
    } catch { requested = false; }
  }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.hys_settings) { revision++; update(changes.hys_settings.newValue); }
    });
    chrome.storage.sync.get('hys_settings', data => {
      try { if (!chrome.runtime.lastError && revision === 0) update(data.hys_settings); } catch { /* Context invalidated. */ }
    });
  } catch { /* Keep the original page when the extension is unavailable. */ }
}
