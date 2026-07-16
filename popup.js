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

  // Initialize and sync custom select dropdown
  initCustomSelect();
  syncCustomSelect(s.shortsRedirect);

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
