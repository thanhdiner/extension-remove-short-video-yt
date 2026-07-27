const STORAGE_KEY = 'hys_settings';
const DEFAULT_SETTINGS = { 
  enabled: true, 
  shortsRedirect: 'block', 
  notebookEnabled: true,
  altScrollEnabled: true,
  scrollSpeed: 5,
  smoothScroll: true,
  customSeekEnabled: true,
  seekSeconds: 20
};

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
  const toggleNotebook = document.getElementById('toggleNotebook');
  const toggleAltScroll = document.getElementById('toggleAltScroll');
  const smoothInput = document.getElementById('smoothScroll');
  
  const speedInput = document.getElementById('speed');
  const speedValue = document.getElementById('speedValue');
  const mode = document.getElementById('redirectMode');

  const toggleCustomSeek = document.getElementById('toggleCustomSeek');
  const seekInput = document.getElementById('seekSeconds');
  const seekValue = document.getElementById('seekValue');

  // Load checkboxes and values
  toggle.checked = !!s.enabled;
  toggleNotebook.checked = s.notebookEnabled !== false;
  toggleAltScroll.checked = s.altScrollEnabled !== false;
  smoothInput.checked = s.smoothScroll !== false;
  toggleCustomSeek.checked = s.customSeekEnabled !== false;
  
  speedInput.value = s.scrollSpeed || 5;
  speedValue.textContent = (s.scrollSpeed || 5) + 'x';

  seekInput.value = s.seekSeconds || 20;
  seekValue.textContent = (s.seekSeconds || 20) + 's';

  function updateSliderProgress(input) {
    const min = parseFloat(input.min || 1);
    const max = parseFloat(input.max || 20);
    const val = parseFloat(input.value);
    const percent = ((val - min) / (max - min)) * 100;
    input.style.setProperty('--value-percent', `${percent}%`);
  }

  // Initial progress update
  updateSliderProgress(speedInput);
  updateSliderProgress(seekInput);

  // Sync slider label and visual progress bar
  speedInput.addEventListener('input', () => {
    speedValue.textContent = speedInput.value + 'x';
    updateSliderProgress(speedInput);
  });

  seekInput.addEventListener('input', () => {
    seekValue.textContent = seekInput.value + 's';
    updateSliderProgress(seekInput);
  });

  // Initialize and sync custom select dropdown
  initCustomSelect();
  syncCustomSelect(s.shortsRedirect);

  document.getElementById('apply').addEventListener('click', async () => {
    const enabled = toggle.checked;
    const notebookEnabled = toggleNotebook.checked;
    const altScrollEnabled = toggleAltScroll.checked;
    const smoothScroll = smoothInput.checked;
    const scrollSpeed = parseFloat(speedInput.value);
    const redirectMode = mode.value;
    const customSeekEnabled = toggleCustomSeek.checked;
    const seekSeconds = parseInt(seekInput.value, 10) || 20;

    await setSettings({ 
      enabled, 
      shortsRedirect: redirectMode, 
      notebookEnabled,
      altScrollEnabled,
      scrollSpeed,
      smoothScroll,
      customSeekEnabled,
      seekSeconds
    });

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
        chrome.tabs.sendMessage(tab.id, { 
          type: 'HYS_SEEK_UPDATE', 
          customSeekEnabled, 
          seekSeconds 
        }, () => {
          const err = chrome.runtime.lastError;
        });
      });
    });

    // Gửi message cho tab NotebookLM đang mở (nếu có)
    chrome.tabs.query({ url: ["https://notebooklm.google.com/*", "https://*.notebooklm.google.com/*"] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'NOTEBOOK_TOGGLE', enabled: notebookEnabled }, () => {
          const err = chrome.runtime.lastError;
        });
      });
    });

    // Gửi message cho tất cả các tab đang chạy AltScroll
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          type: 'ALTSCROLL_UPDATE', 
          enabled: altScrollEnabled, 
          scrollSpeed,
          smoothScroll
        }, () => {
          const err = chrome.runtime.lastError;
        });
      });
    });

    window.close();
  });
}

function initCustomSelect() {
  const trigger = document.getElementById("modeTrigger");
  const optionsList = document.getElementById("modeOptions");
  const options = document.querySelectorAll(".custom-option");
  const nativeSelect = document.getElementById("redirectMode");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isExpanded = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", !isExpanded);
    optionsList.classList.toggle("hidden");
  });

  options.forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      nativeSelect.value = val;
      
      syncCustomSelect(val);

      optionsList.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", () => {
    optionsList.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      optionsList.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

function syncCustomSelect(value) {
  const triggerValue = document.querySelector(".custom-select-value");
  const options = document.querySelectorAll(".custom-option");
  
  const option = Array.from(options).find(opt => opt.dataset.value === value);
  if (option && triggerValue) {
    triggerValue.textContent = option.querySelector("span").textContent;
  }

  options.forEach((opt) => {
    const isSel = opt.dataset.value === value;
    opt.classList.toggle("selected", isSel);
    opt.setAttribute("aria-selected", isSel ? "true" : "false");
  });
}

init();
