import { DEFAULT_LANGUAGE, LANGUAGE_KEY, normalizeLanguage, translate, translateError } from './i18n.mjs';
if (!globalThis.dinkitContentLanguage) {
  let language = DEFAULT_LANGUAGE;
  const listeners = new Set();
  const setLanguage = value => { const next = normalizeLanguage(value); if (language === next) return; language = next; listeners.forEach(callback => callback()); };
  globalThis.dinkitContentLanguage = { t: (key, values) => translate(language, key, values), error: text => translateError(language, text), subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); } };
  try {
    let revision = 0;
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'sync' && changes[LANGUAGE_KEY]) { revision++; setLanguage(changes[LANGUAGE_KEY].newValue); } });
    chrome.storage.sync.get(LANGUAGE_KEY, data => { try { if (!chrome.runtime.lastError && revision === 0) setLanguage(data[LANGUAGE_KEY]); } catch (_) {} });
  } catch (_) { /* The extension was reloaded while this page was open. */ }
}
