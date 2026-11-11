import { DEFAULT_LANGUAGE, LANGUAGE_KEY, normalizeLanguage, translate, translateError } from './i18n.mjs';
let language = DEFAULT_LANGUAGE;
function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = translate(language, element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = translate(language, element.dataset.i18nPlaceholder); });
  document.documentElement.lang = language;
}
function setLanguage(value) {
  language = normalizeLanguage(value);
  apply();
  document.dispatchEvent(new CustomEvent('dinkit-language-change', { detail: language }));
}
window.dinkitI18n = { t: (key, values) => translate(language, key, values), error: text => translateError(language, text), get language() { return language; }, apply };
let revision = 0;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[LANGUAGE_KEY]) { revision++; setLanguage(changes[LANGUAGE_KEY].newValue); }
});
chrome.storage.sync.get(LANGUAGE_KEY, data => { if (!chrome.runtime.lastError && revision === 0) setLanguage(data[LANGUAGE_KEY]); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
else apply();
