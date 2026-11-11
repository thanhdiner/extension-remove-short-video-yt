(function () {
  // YouTube reuses yt-confirm-dialog-renderer for unrelated actions, including
  // unsubscribe. Only act on a positively identified inactivity prompt.
  const inactivityTitles = new Set([
    'video paused. continue watching?',
    'video paused. continue watching',
    'video đã tạm dừng. tiếp tục xem?',
    'video đã tạm dừng. tiếp tục xem',
  ])

  document.addEventListener('yt-popup-opened', () => {
    if (document.documentElement.classList.contains('hys-disabled')) return
    for (const popup of document.querySelectorAll('yt-confirm-dialog-renderer, ytmusic-you-there-renderer')) {
      if (!popup.getClientRects().length) continue
      const title = popup.querySelector('#title') || popup.shadowRoot?.querySelector('#title')
      const text = (title?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (!inactivityTitles.has(text)) continue
      const confirm = popup.querySelector('#confirm-button') || popup.shadowRoot?.querySelector('#confirm-button')
      if (!confirm) continue
      confirm.click()
      const video = document.querySelector('video')
      if (video?.paused) video.play().catch(() => {})
      break
    }
  }, true)
})()
