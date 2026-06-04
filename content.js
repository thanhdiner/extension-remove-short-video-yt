// ============ SETTINGS ============
const STORAGE_KEY = 'hys_settings'
const DEFAULT_SETTINGS = {
  enabled: true, // bật ẩn Shorts
  shortsRedirect: 'block' // 'block' | 'watch'
}

// ============ HELPERS ============
function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get([STORAGE_KEY], res => {
      resolve({ ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] || {}) })
    })
  })
}

function setSettings(patch) {
  return new Promise(resolve => {
    chrome.storage.sync.get([STORAGE_KEY], res => {
      const merged = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] || {}), ...patch }
      chrome.storage.sync.set({ [STORAGE_KEY]: merged }, resolve)
    })
  })
}

function isShortsUrl(url) {
  try {
    const u = new URL(url, location.origin)
    return u.pathname.startsWith('/shorts/')
  } catch {
    return false
  }
}

function shortsIdFromUrl(url) {
  try {
    const u = new URL(url, location.origin)
    // /shorts/VIDEOID  -> lấy phần sau
    return u.pathname.split('/')[2] || ''
  } catch {
    return ''
  }
}

// ============ CORE: HIDE NODES ============
const SELECTORS = [
  'ytd-reel-shelf-renderer',
  'ytd-reel-video-renderer',
  'ytd-rich-section-renderer[is-shorts]',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytd-rich-item-renderer[mini-mode][is-shorts]',
  'grid-shelf-view-model:has(a[href*="/shorts/"])',
  'ytd-shelf-renderer:has(a[href*="/shorts/"])',
  'ytd-guide-entry-renderer:has(a[href*="/shorts/"])',
  'ytd-mini-guide-entry-renderer:has(a[href*="/shorts/"])',
  'ytd-reel-item-renderer',
  'ytm-shorts-lockup-view-model-v2',
  'a[href*="/shorts/"]',
  '#related ytd-compact-video-renderer a[href*="/shorts/"]',
  '#endpoint[title="Shorts"]',
  'ytd-mini-guide-entry-renderer[aria-label="Shorts"]'
]

async function applySettingsClass() {
  const settings = await getSettings()
  if (settings.enabled) {
    document.documentElement.classList.remove('hys-disabled')
  } else {
    document.documentElement.classList.add('hys-disabled')
  }
}

function removeShortsOnce(root = document) {
  let removed = 0

  // 1) Ẩn phần tử có selector cụ thể
  SELECTORS.forEach(sel => {
    root.querySelectorAll(sel).forEach(el => {
      // Với anchor /shorts/, ẩn toàn bộ container video nếu có
      if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').includes('/shorts/')) {
        const wrap = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, yt-lockup-view-model, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')
        if (wrap) {
          wrap.setAttribute('hys-hidden', 'true')
          removed++
        } else {
          el.setAttribute('hys-hidden', 'true')
          removed++
        }
      } else if (
        el.tagName.startsWith('YTD-') || // renderer đặc trưng của Shorts
        el.matches('ytd-reel-shelf-renderer, ytd-reel-video-renderer, ytd-rich-section-renderer[is-shorts], grid-shelf-view-model, ytd-shelf-renderer')
      ) {
        el.setAttribute('hys-hidden', 'true')
        removed++
      }
    })
  })

  // 2) Trong results: các khối có đường dẫn shorts trong tiêu đề
  document.querySelectorAll('ytd-video-renderer a#thumbnail[href*="/shorts/"]').forEach(a => {
    const container = a.closest('ytd-video-renderer')
    if (container) {
      container.setAttribute('hys-hidden', 'true')
      removed++
    }
  })

  // 3) Trong trang history/homepage: ẩn các chip lọc mang tên "Shorts"
  root.querySelectorAll('yt-chip-cloud-chip-renderer, ytd-filter-chip-renderer, yt-tab-shape').forEach(chip => {
    const text = chip.textContent ? chip.textContent.trim() : ''
    const tabTitle = chip.getAttribute('tab-title') || ''
    const ariaLabel = chip.getAttribute('aria-label') || ''
    if (
      text.toLowerCase() === 'shorts' || 
      tabTitle.toLowerCase() === 'shorts' || 
      ariaLabel.toLowerCase() === 'shorts'
    ) {
      chip.setAttribute('hys-hidden', 'true')
      removed++
    }
  })

  return removed
}

let observer = null

async function startObserver() {
  const settings = await getSettings()
  if (!settings.enabled) return

  removeShortsOnce(document)

  if (observer) observer.disconnect()
  observer = new MutationObserver(muts => {
    let shouldScan = false
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        shouldScan = true
        break
      }
    }
    if (shouldScan) removeShortsOnce(document)
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
}

function stopObserver() {
  if (observer) observer.disconnect()
  observer = null
}

// ============ REDIRECT /shorts/ ============
async function handleShortsRedirect() {
  const settings = await getSettings()
  if (!settings.enabled) return

  if (isShortsUrl(location.href)) {
    if (settings.shortsRedirect === 'block') {
      // Chặn: về trang chủ
      location.replace('/')
    } else if (settings.shortsRedirect === 'watch') {
      // Chuyển sang dạng /watch?v=...
      const id = shortsIdFromUrl(location.href)
      if (id) location.replace(`/watch?v=${id}`)
      else location.replace('/')
    }
  }
}

// ============ MESSAGES ============
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === 'HYS_TOGGLE') {
    setSettings({ enabled: msg.enabled }).then(() => {
      applySettingsClass()
      if (msg.enabled) startObserver()
      else stopObserver()
    })
  }
  if (msg?.type === 'HYS_REDIRECT_MODE') {
    setSettings({ shortsRedirect: msg.mode })
  }
})

// ============ BOOT ============
;(async () => {
  await applySettingsClass()
  await handleShortsRedirect()
  await startObserver()
})()
