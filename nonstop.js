(function() {
  // Lắng nghe sự kiện mở popup của YouTube ở Page Context (MAIN World) để lấy e.detail
  document.addEventListener('yt-popup-opened', e => {
    if (document.documentElement.classList.contains('hys-disabled')) return

    const nodeName = e.detail?.nodeName || ''
    if (nodeName === 'YT-CONFIRM-DIALOG-RENDERER' || nodeName === 'YTMUSIC-YOU-THERE-RENDERER') {
      const confirmButton = document.querySelector('ytd-popup-container #confirm-button, ytmusic-popup-container #confirm-button, #confirm-button')
      if (confirmButton) {
        confirmButton.click()
        const video = document.querySelector('video')
        if (video && video.paused) {
          video.play().catch(() => {})
        }
      }
    }
  }, true)
})()
