import { LANGUAGE_KEY, translate } from './i18n.mjs';
globalThis.dinkitWorkerMessage = async (key, values) => {
  try {
    const data = await chrome.storage.sync.get(LANGUAGE_KEY);
    return translate(data[LANGUAGE_KEY], key, values);
  } catch {
    return translate(undefined, key, values);
  }
};
