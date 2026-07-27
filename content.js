// ============ SETTINGS ============
const STORAGE_KEY = 'hys_settings'
const DEFAULT_SETTINGS = {
  enabled: true, // bật ẩn Shorts
  shortsRedirect: 'block', // 'block' | 'watch'
  customSeekEnabled: true,
  seekSeconds: 20
}

let cachedSettings = { ...DEFAULT_SETTINGS }

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
      cachedSettings = merged
      chrome.storage.sync.set({ [STORAGE_KEY]: merged }, resolve)
    })
  })
}

// Khởi tạo cache từ storage
getSettings().then(s => {
  cachedSettings = s
})

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
  if (msg?.type === 'HYS_SEEK_UPDATE') {
    cachedSettings.customSeekEnabled = msg.customSeekEnabled
    cachedSettings.seekSeconds = msg.seekSeconds
    setSettings({
      customSeekEnabled: msg.customSeekEnabled,
      seekSeconds: msg.seekSeconds
    })
  }
})

// ============ CORE: VIDEO SPEED CONTROL ============
function showSpeedIndicator(video, speed) {
  const player = video.closest('#movie_player') || video.parentElement
  if (!player) return

  let indicator = player.querySelector('.hys-speed-indicator')
  if (!indicator) {
    indicator = document.createElement('div')
    indicator.className = 'hys-speed-indicator'
    Object.assign(indicator.style, {
      position: 'absolute',
      top: '60px',
      left: '50%',
      transform: 'translate(-50%, 0)',
      backgroundColor: 'rgba(28, 28, 28, 0.85)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: '600',
      zIndex: '2000',
      pointerEvents: 'none',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      opacity: '0',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.1)',
      fontFamily: 'Roboto, Arial, sans-serif'
    })
    player.appendChild(indicator)
  }

  indicator.textContent = `Speed: ${speed.toFixed(1)}x`
  indicator.style.opacity = '1'
  indicator.style.transform = 'translate(-50%, 0)'

  if (indicator.timeoutId) {
    clearTimeout(indicator.timeoutId)
  }

  indicator.timeoutId = setTimeout(() => {
    indicator.style.opacity = '0'
    indicator.style.transform = 'translate(-50%, -8px)'
  }, 1000)
}

// ============ CORE: VIDEO CUSTOM SEEK INDICATOR ============
let seekAccumulator = 0
let seekAccumulatorTimeout = null

function showSeekIndicator(video, delta) {
  const player = video.closest('#movie_player') || video.parentElement
  if (!player) return

  if (seekAccumulatorTimeout && (Math.sign(seekAccumulator) === Math.sign(delta))) {
    seekAccumulator += delta
  } else {
    seekAccumulator = delta
  }

  if (seekAccumulatorTimeout) {
    clearTimeout(seekAccumulatorTimeout)
  }

  let indicator = player.querySelector('.hys-seek-indicator')
  if (!indicator) {
    indicator = document.createElement('div')
    indicator.className = 'hys-seek-indicator'
    Object.assign(indicator.style, {
      position: 'absolute',
      top: '50%',
      transform: 'translate(-50%, -50%) scale(0.9)',
      backgroundColor: 'rgba(28, 28, 28, 0.85)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      padding: '12px 22px',
      borderRadius: '24px',
      fontSize: '16px',
      fontWeight: '700',
      zIndex: '2001',
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      opacity: '0',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.15)',
      fontFamily: 'Roboto, Arial, sans-serif'
    })
    player.appendChild(indicator)
  }

  indicator.style.left = delta > 0 ? '70%' : '30%'
  const text = seekAccumulator > 0 ? `+${seekAccumulator}s ▶▶` : `◀◀ ${seekAccumulator}s`
  indicator.textContent = text
  indicator.style.opacity = '1'
  indicator.style.transform = 'translate(-50%, -50%) scale(1)'

  seekAccumulatorTimeout = setTimeout(() => {
    indicator.style.opacity = '0'
    indicator.style.transform = 'translate(-50%, -50%) scale(0.9)'
    seekAccumulator = 0
    seekAccumulatorTimeout = null
  }, 800)
}

// ============ CORE: PERSISTENT PLAYBACK RATE ============
let persistedSpeed = 1.0
let shouldForcePersistedSpeed = false
let isApplyingSpeed = false

// Đọc tốc độ đã lưu lúc khởi động
getSettings().then(settings => {
  if (settings.userSpeed) {
    persistedSpeed = settings.userSpeed
  }
})

// Lắng nghe sự kiện nạp video mới (loadedmetadata)
document.addEventListener('loadedmetadata', e => {
  if (e.target.tagName === 'VIDEO') {
    shouldForcePersistedSpeed = true
    applyPersistedSpeed(e.target)
  }
}, true)

// Lắng nghe sự kiện bắt đầu chạy video
document.addEventListener('play', e => {
  if (e.target.tagName === 'VIDEO') {
    applyPersistedSpeed(e.target)
  }
}, true)

// Hàm áp dụng tốc độ phát
function applyPersistedSpeed(video) {
  if (isApplyingSpeed) return
  getSettings().then(settings => {
    if (settings.enabled && settings.userSpeed) {
      const targetSpeed = settings.userSpeed
      if (video.playbackRate !== targetSpeed) {
        isApplyingSpeed = true
        video.playbackRate = targetSpeed
        isApplyingSpeed = false
      }
    }
  })
}

// Lắng nghe thay đổi tốc độ phát (nhận diện đổi video hoặc người dùng tự đổi từ bánh răng YouTube)
document.addEventListener('ratechange', e => {
  if (e.target.tagName === 'VIDEO') {
    const video = e.target
    if (isApplyingSpeed) return

    if (shouldForcePersistedSpeed) {
      // Nếu YouTube tự reset tốc độ về 1.0 khi chuyển video, ép về tốc độ đã lưu
      getSettings().then(settings => {
        if (settings.enabled && settings.userSpeed) {
          const targetSpeed = settings.userSpeed
          if (video.playbackRate !== targetSpeed) {
            isApplyingSpeed = true
            video.playbackRate = targetSpeed
            isApplyingSpeed = false
          }
        }
        shouldForcePersistedSpeed = false
      })
    } else {
      // Nếu người dùng chủ động đổi tốc độ bằng menu bánh răng YouTube, lưu lại tốc độ mới
      const currentSpeed = video.playbackRate
      setSettings({ userSpeed: currentSpeed })
    }
  }
}, true)

document.addEventListener('keydown', e => {
  // Bỏ qua nếu sự kiện được giả lập từ chính extension
  if (e.hys_bypassed) return

  const active = document.activeElement
  if (active && (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.isContentEditable
  )) {
    return
  }

  // 1) Xử lý Shift + '-' hoặc Shift + '=' để tăng/giảm cỡ chữ phụ đề YouTube
  const isShiftMinus = e.key === '_' || (e.key === '-' && e.shiftKey)
  const isShiftEqual = e.key === '+' || (e.key === '=' && e.shiftKey)

  if (isShiftMinus || isShiftEqual) {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    const targetKey = isShiftMinus ? '-' : '='
    const targetCode = isShiftMinus ? 'Minus' : 'Equal'
    const targetKeyCode = isShiftMinus ? 189 : 187

    const syntheticEvent = new KeyboardEvent('keydown', {
      key: targetKey,
      code: targetCode,
      keyCode: targetKeyCode,
      which: targetKeyCode,
      bubbles: true,
      cancelable: true,
      view: window,
      shiftKey: false
    })

    Object.defineProperty(syntheticEvent, 'hys_bypassed', { value: true })
    const target = document.activeElement || document
    target.dispatchEvent(syntheticEvent)
    return
  }

  // 2) Xử lý phím '-' và '=' (không bấm Shift) để tăng/giảm tốc độ video
  if (e.key === '-' || e.key === '=') {
    const video = document.querySelector('video')
    if (!video) return

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    let currentSpeed = video.playbackRate

    if (e.key === '-') {
      currentSpeed = Math.round((currentSpeed - 0.1) * 10) / 10
      if (currentSpeed < 0.1) currentSpeed = 0.1
    } else {
      currentSpeed = Math.round((currentSpeed + 0.1) * 10) / 10
      if (currentSpeed > 16.0) currentSpeed = 16.0
    }

    isApplyingSpeed = true
    video.playbackRate = currentSpeed
    isApplyingSpeed = false
    
    setSettings({ userSpeed: currentSpeed })
    showSpeedIndicator(video, currentSpeed)
  }

  // 3) Xử lý phím ArrowRight và ArrowLeft để tua video theo số giây tùy chỉnh
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!cachedSettings.customSeekEnabled) return

    const active = document.activeElement
    if (active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.isContentEditable ||
      active.getAttribute('role') === 'textbox' ||
      active.classList.contains('ytp-progress-bar')
    )) {
      return
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return

    const video = document.querySelector('video')
    if (!video) return

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    const step = cachedSettings.seekSeconds ?? 20
    const delta = e.key === 'ArrowRight' ? step : -step
    let newTime = video.currentTime + delta
    newTime = Math.max(0, Math.min(video.duration || Infinity, newTime))
    video.currentTime = newTime

    showSeekIndicator(video, delta)
  }
}, true) // Sử dụng capture phase để chạy trước trình lắng nghe mặc định của YouTube

// ============ CORE: YOUTUBE NONSTOP (AUTO RESUME) ============
function handleYouTubeNonStop() {
  console.log('[Hide YouTube Shorts] Khởi tạo bộ lắng nghe NonStop thành công.')

  // Đề phòng khi video bị tạm dừng do hộp thoại xác nhận đang chờ sẵn (chạy ở Isolated World)
  document.addEventListener('pause', e => {
    if (e.target.tagName === 'VIDEO') {
      console.log('[Hide YouTube Shorts] Phát hiện sự kiện video pause.')
      const video = e.target
      getSettings().then(settings => {
        console.log('[Hide YouTube Shorts] Đã đọc settings:', settings)
        if (!settings.enabled) return
        setTimeout(() => {
          const popup = document.querySelector('yt-confirm-dialog-renderer, ytmusic-you-there-renderer')
          console.log('[Hide YouTube Shorts] Tìm kiếm popup trong DOM:', popup)
          if (popup) {
            // Tìm nút confirm trong cả Light DOM lẫn Shadow DOM của Web Component
            let confirmButton = popup.querySelector('#confirm-button')
            if (!confirmButton && popup.shadowRoot) {
              confirmButton = popup.shadowRoot.querySelector('#confirm-button')
            }
            console.log('[Hide YouTube Shorts] Tìm thấy nút xác nhận:', confirmButton)
            if (confirmButton) {
              console.log('[Hide YouTube Shorts] Đang tự động click nút xác nhận để xem tiếp.')
              confirmButton.click()
              video.play().catch(err => {
                console.log('[Hide YouTube Shorts] Lỗi tự động phát lại:', err)
              })
            }
          }
        }, 150)
      })
    }
  }, true)
}

// ============ BOOT ============
;(async () => {
  console.log('[Hide YouTube Shorts] Extension đang khởi động...')
  await applySettingsClass()
  await handleShortsRedirect()
  await startObserver()
  handleYouTubeNonStop()
})()
