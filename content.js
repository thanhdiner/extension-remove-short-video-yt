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
}, true) // Sử dụng capture phase để chạy trước trình lắng nghe mặc định của YouTube

// ============ CORE: YOUTUBE NONSTOP (AUTO RESUME) ============
function handleYouTubeNonStop() {
  // 1) Khi hộp thoại xác nhận được mở ra
  document.addEventListener('yt-popup-opened', e => {
    getSettings().then(settings => {
      if (!settings.enabled) return
      // Tránh đọc e.detail vì Chrome có thể chặn (null) do cơ chế bảo mật cô lập (isolated world)
      const popup = document.querySelector('yt-confirm-dialog-renderer, ytmusic-you-there-renderer')
      if (popup) {
        const confirmButton = popup.querySelector('#confirm-button')
        if (confirmButton) {
          confirmButton.click()
          const video = document.querySelector('video')
          if (video && video.paused) {
            video.play().catch(() => {})
          }
        }
      }
    })
  }, true)

  // 2) Đề phòng khi video bị tạm dừng do hộp thoại xác nhận đang chờ sẵn
  document.addEventListener('pause', e => {
    if (e.target.tagName === 'VIDEO') {
      const video = e.target
      getSettings().then(settings => {
        if (!settings.enabled) return
        setTimeout(() => {
          const popup = document.querySelector('yt-confirm-dialog-renderer, ytmusic-you-there-renderer')
          if (popup && popup.offsetWidth > 0 && popup.offsetHeight > 0) {
            const confirmButton = popup.querySelector('#confirm-button')
            if (confirmButton) {
              confirmButton.click()
              video.play().catch(() => {})
            }
          }
        }, 150)
      })
    }
  }, true)
}

// ============ BOOT ============
;(async () => {
  await applySettingsClass()
  await handleShortsRedirect()
  await startObserver()
  handleYouTubeNonStop()
})()
