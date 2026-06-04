(function() {
  console.log('[Hide YouTube Shorts - NonStop MAIN] Script đã chạy trong Page Context.')

  // Lắng nghe sự kiện mở popup của YouTube ở Page Context (MAIN World) để lấy e.detail
  document.addEventListener('yt-popup-opened', e => {
    if (document.documentElement.classList.contains('hys-disabled')) return

    console.log('[Hide YouTube Shorts - NonStop MAIN] Phát hiện sự kiện mở popup.')
    const popup = document.querySelector('yt-confirm-dialog-renderer, ytmusic-you-there-renderer')
    if (popup) {
      let confirmButton = popup.querySelector('#confirm-button')
      if (!confirmButton && popup.shadowRoot) {
        confirmButton = popup.shadowRoot.querySelector('#confirm-button')
      }
      console.log('[Hide YouTube Shorts - NonStop MAIN] Nút xác nhận tìm thấy:', confirmButton)
      if (confirmButton) {
        console.log('[Hide YouTube Shorts - NonStop MAIN] Tự động click nút xác nhận.')
        confirmButton.click()
        const video = document.querySelector('video')
        if (video && video.paused) {
          video.play().catch(() => {})
        }
      }
    }
  }, true)
})()


