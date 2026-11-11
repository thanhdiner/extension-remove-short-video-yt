import { useEffect, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGE_KEY, normalizeLanguage, translate } from './i18n.mjs';
export function useLanguage() {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const onChange = (changes, area) => {
      if (area === 'sync' && changes[LANGUAGE_KEY]) { revision++; setLanguage(normalizeLanguage(changes[LANGUAGE_KEY].newValue)); }
    };
    chrome.storage.onChanged.addListener(onChange);
    chrome.storage.sync.get(LANGUAGE_KEY, result => {
      if (active && revision === 0 && !chrome.runtime.lastError) setLanguage(normalizeLanguage(result[LANGUAGE_KEY]));
    });
    return () => { active = false; chrome.storage.onChanged.removeListener(onChange); };
  }, []);
  const changeLanguage = value => new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [LANGUAGE_KEY]: normalizeLanguage(value) }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
  return { language, t: (key, values) => translate(language, key, values), changeLanguage };
}
