export function currentSiteFromTab(tab) {
  try {
    const url = new URL(tab?.url);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.hostname.toLowerCase();
  } catch { return ''; }
}

export function getCurrentProxySite() {
  return new Promise(resolve => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        try { resolve(chrome.runtime.lastError ? '' : currentSiteFromTab(tabs?.[0])); }
        catch { resolve(''); }
      });
    } catch { resolve(''); }
  });
}
