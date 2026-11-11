import { isLocalTextFile } from './editor-route.mjs';

if (window.top === window && isLocalTextFile(location.href) && document.contentType === 'text/plain') {
  try {
    location.replace(`${chrome.runtime.getURL('editor/editor.html')}?file=${encodeURIComponent(location.href)}`);
  } catch { /* Keep the original document if the extension has been reloaded. */ }
}
