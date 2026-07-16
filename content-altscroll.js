(function() {
  'use strict';

  let enabled = true;
  let scrollMultiplier = 5;
  let isSmooth = true;

  function loadSettings() {
    chrome.storage.sync.get(['hys_settings'], (result) => {
      const settings = result['hys_settings'] || {};
      enabled = settings.altScrollEnabled !== false;
      if (settings.scrollSpeed) {
        scrollMultiplier = parseFloat(settings.scrollSpeed);
      }
      if (settings.smoothScroll !== undefined) {
        isSmooth = settings.smoothScroll;
      }
    });
  }

  // Load initially
  loadSettings();

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.hys_settings) {
      const settings = changes.hys_settings.newValue || {};
      enabled = settings.altScrollEnabled !== false;
      if (settings.scrollSpeed) {
        scrollMultiplier = parseFloat(settings.scrollSpeed);
      }
      if (settings.smoothScroll !== undefined) {
        isSmooth = settings.smoothScroll;
      }
    }
  });

  // Listen for message triggers
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ALTSCROLL_UPDATE') {
      enabled = message.enabled;
      scrollMultiplier = parseFloat(message.scrollSpeed);
      isSmooth = message.smoothScroll;
    }
  });

  window.addEventListener('wheel', (e) => {
    if (!enabled) return;
    if (e.altKey) {
      e.preventDefault();

      // Helper to find scrollable parent
      function getScrollParent(node) {
        if (node == null) {
          return window;
        }
        if (node === document.body || node === document.documentElement) {
          return window;
        }

        const overflowY = window.getComputedStyle(node).overflowY;
        const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';

        if (isScrollable && node.scrollHeight > node.clientHeight) {
          return node;
        }
        return getScrollParent(node.parentNode);
      }

      const target = getScrollParent(e.target);
      
      let delta = e.deltaY;
      // Normalize delta
      if (e.deltaMode === 1) { 
        delta *= 40; 
      } else if (e.deltaMode === 2) {
        delta *= window.innerHeight;
      }

      const finalDelta = delta * scrollMultiplier;
      const behavior = isSmooth ? 'smooth' : 'auto';

      if (target === window) {
        window.scrollBy({ top: finalDelta, behavior: behavior });
      } else {
        target.scrollBy({ top: finalDelta, behavior: behavior });
      }
    }
  }, { passive: false });
})();
