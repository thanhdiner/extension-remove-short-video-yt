const STORAGE_KEY = 'hys_settings';
const DEFAULT_SETTINGS = { enabled: true, shortsRedirect: 'block' };

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get([STORAGE_KEY], res => {
      resolve({ ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] || {}) });
    });
  });
}

function setSettings(patch) {
  return new Promise(resolve => {
    chrome.storage.sync.get([STORAGE_KEY], (res) => {
      const merged = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] || {}), ...patch };
      chrome.storage.sync.set({ [STORAGE_KEY]: merged }, resolve);
    });
  });
}

async function init() {
  const s = await getSettings();
  const toggle = document.getElementById('toggleEnabled');
  const mode = document.getElementById('redirectMode');

  toggle.checked = !!s.enabled;
  mode.value = s.shortsRedirect;

  document.getElementById('apply').addEventListener('click', async () => {
    const enabled = toggle.checked;
    const redirectMode = mode.value;

    await setSettings({ enabled, shortsRedirect: redirectMode });

    // Gửi message cho tab YouTube đang mở (nếu có)
    chrome.tabs.query({ url: ["*://www.youtube.com/*", "*://m.youtube.com/*"] }, (tabs) => {
      tabs.forEach(tab => {
        // Kiểm tra lastError trong callback để loại bỏ lỗi "Could not establish connection"
        chrome.tabs.sendMessage(tab.id, { type: 'HYS_TOGGLE', enabled }, () => {
          const err = chrome.runtime.lastError;
        });
        chrome.tabs.sendMessage(tab.id, { type: 'HYS_REDIRECT_MODE', mode: redirectMode }, () => {
          const err = chrome.runtime.lastError;
        });
      });
    });
    window.close();
  });
}

init();
