(function () {
/**
 * Focus Firewall - Content Script
 * Runs on youtube.com to block addictive elements based on the YouTube Learning Mode preset.
 */

const STYLE_ID = 'focus-firewall-styles';

function injectStyles(enabledPresets) {
  let styleEl = document.getElementById(STYLE_ID);
  if (styleEl) {
    styleEl.remove();
  }

  if (!enabledPresets || !enabledPresets.includes('youtube_learning')) {
    return;
  }

  styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    /* Hide Shorts shelf on homepage and search pages */
    ytd-reel-shelf-renderer,
    ytd-rich-shelf-renderer[is-shorts],
    ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
    ytd-rich-section-renderer:has(ytd-reel-shelf-renderer) {
      display: none !important;
    }

    /* Hide Shorts guide entries on left side nav (regular and mini nav) */
    ytd-guide-entry-renderer:has(a[href="/shorts"]),
    ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
    ytd-guide-entry-renderer:has(a[href^="/shorts"]),
    ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
    a[href="/shorts"],
    a[href^="/shorts"] {
      display: none !important;
    }

    /* Hide homepage main feed */
    ytd-browse[page-subtype="home"] #primary,
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer {
      display: none !important;
    }

    /* Hide sidebar recommendations on watch pages */
    #related,
    ytd-watch-next-secondary-results-renderer {
      display: none !important;
    }

    /* Hide comments section on watch pages */
    ytd-comments,
    #comments {
      display: none !important;
    }

    /* Hide autoplay toggle button to prevent enabling */
    .ytp-autonav-toggle-button-container,
    .ytp-button[data-tooltip-target-id="ytp-autonav-toggle-button"] {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);
}

function checkHomepageRedirect(enabledPresets) {
  if (location.hostname === 'music.youtube.com') return;
  if (enabledPresets && enabledPresets.includes('youtube_learning')) {
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname === '/index.html') {
      window.location.replace('/feed/subscriptions');
    }
  }
}

function disableAutoplay() {
  const toggleBtn = document.querySelector('.ytp-autonav-toggle-button');
  if (toggleBtn) {
    const isChecked = toggleBtn.getAttribute('aria-checked') === 'true';
    if (isChecked) {
      toggleBtn.click();
      console.log('Focus Firewall: Autoplay turned OFF.');
    }
  }
}

// Keep the latest settings locally so page mutations do not call an invalidated
// extension context after a reload.
let enabledPresets = [];
chrome.storage.local.get('settings', (data) => {
  if (chrome.runtime.lastError || !data) return;
  enabledPresets = data.settings?.enabledPresets || [];
  injectStyles(enabledPresets);
  checkHomepageRedirect(enabledPresets);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    enabledPresets = changes.settings.newValue?.enabledPresets || [];
    injectStyles(enabledPresets);
    checkHomepageRedirect(enabledPresets);
  }
});

let lastPath = window.location.pathname;
const observer = new MutationObserver(() => {
  try {
    if (!chrome.runtime?.id) { observer.disconnect(); return; }
  } catch (_) {
    observer.disconnect();
    return;
  }
  if (window.location.pathname !== lastPath) {
    lastPath = window.location.pathname;
    checkHomepageRedirect(enabledPresets);
  }
  if (enabledPresets.includes('youtube_learning')) disableAutoplay();
});

observer.observe(document.documentElement, { subtree: true, childList: true });

})();
