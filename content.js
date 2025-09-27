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
  'a[href*="/shorts/"]',
  '#related ytd-compact-video-renderer a[href*="/shorts/"]',
  '#endpoint[title="Shorts"]',
  'ytd-mini-guide-entry-renderer[aria-label="Shorts"]'
]

function removeShortsOnce(root = document) {
  let removed = 0

  // 1) Ẩn phần tử có selector cụ thể
  SELECTORS.forEach(sel => {
    root.querySelectorAll(sel).forEach(el => {
      // Với anchor /shorts/, ẩn toàn bộ container video nếu có
      if (el.tagName === 'A' && el.getAttribute('href').startsWith('/shorts/')) {
        const wrap = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer')
        if (wrap) {
          wrap.style.display = 'none'
          removed++
        }
      } else if (
        el.tagName.startsWith('YTD-') || // renderer đặc trưng của Shorts
        el.matches('ytd-reel-shelf-renderer, ytd-reel-video-renderer, ytd-rich-section-renderer[is-shorts]')
      ) {
        el.style.display = 'none'
        removed++
      }
    })
  })

  // 2) Trong results: các khối có đường dẫn shorts trong tiêu đề
  document.querySelectorAll('ytd-video-renderer a#thumbnail[href*="/shorts/"]').forEach(a => {
    const container = a.closest('ytd-video-renderer')
    if (container) container.style.display = 'none'
    removed++
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
  await handleShortsRedirect()
  await startObserver()
})()
