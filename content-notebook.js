(function() {
  'use strict';

  let enabled = false;
  let observer = null;

  function hideYouTubeErrors() {
    if (!enabled) return;

    // Tìm và ẩn thẻ cha .ytp-error (chứa tất cả lỗi bên trong)
    const errorElements = document.querySelectorAll('.ytp-error');
    errorElements.forEach(element => {
      element.style.display = 'none';
      
      // Ẩn hẳn video player chứa lỗi này
      const player = element.closest('.html5-video-player');
      if (player) {
        player.style.display = 'none';
      }
      
      // Ẩn iframe YouTube chứa lỗi
      const iframe = element.closest('iframe');
      if (iframe && (iframe.src.includes('youtube.com') || iframe.src.includes('youtube-nocookie.com'))) {
        iframe.style.display = 'none';
      }
    });
    
    // Ẩn tất cả iframe YouTube và container của chúng
    const youtubeIframes = document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"]');
    youtubeIframes.forEach(iframe => {
      // Đánh dấu iframe bị lỗi
      iframe.classList.add('youtube-error');
      iframe.style.display = 'none';
      
      // Ẩn container chứa iframe
      const container = iframe.closest('.youtube-container');
      if (container) {
        container.classList.add('hidden-video');
        container.style.display = 'none';
      }
      
      // Ẩn div wrapper trực tiếp
      const wrapper = iframe.parentElement;
      if (wrapper) {
        wrapper.style.display = 'none';
      }
    });
    
    // Ẩn Source guide container
    const sourceGuides = document.querySelectorAll('.source-guide-container');
    sourceGuides.forEach(guide => {
      guide.style.display = 'none';
    });
    
    // Thêm nút copy cho elements-container
    const elementsContainers = document.querySelectorAll('.elements-container');
    elementsContainers.forEach(container => {
      // Kiểm tra xem đã có nút copy chưa
      if (!container.querySelector('.copy-button')) {
        // Tạo nút copy
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-button';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute('aria-label', 'Copy code');
        
        // Thêm sự kiện click
        copyBtn.addEventListener('click', function() {
          // Lấy text từ container
          const text = container.innerText.replace('Copy', '').trim();
          
          // Copy vào clipboard
          navigator.clipboard.writeText(text).then(() => {
            // Thay đổi text nút
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            
            // Trở lại sau 2 giây
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy:', err);
            copyBtn.textContent = 'Failed';
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
            }, 2000);
          });
        });
        
        // Thêm nút vào container
        container.style.position = 'relative';
        container.insertBefore(copyBtn, container.firstChild);
      }
    });
  }

  function startOptimizer() {
    enabled = true;
    document.documentElement.classList.add('notebook-optimizer-active');
    
    // Chạy ẩn lỗi ngay
    hideYouTubeErrors();

    // Theo dõi thay đổi DOM
    if (!observer) {
      observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.addedNodes.length) {
            hideYouTubeErrors();
          }
        });
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    // Chạy lại sau 1 giây
    setTimeout(hideYouTubeErrors, 1000);
  }

  function stopOptimizer() {
    enabled = false;
    document.documentElement.classList.remove('notebook-optimizer-active');
    
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Gỡ nút copy và trả lại style cũ nếu cần
    const copyButtons = document.querySelectorAll('.copy-button');
    copyButtons.forEach(btn => btn.remove());
  }

  function init() {
    // Đọc cài đặt lưu trữ
    chrome.storage.sync.get(['hys_settings'], (res) => {
      const settings = res['hys_settings'] || {};
      const notebookEnabled = settings.notebookEnabled !== false;
      if (notebookEnabled) {
        startOptimizer();
      }
    });

    // Lắng nghe thay đổi cài đặt từ popup
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'NOTEBOOK_TOGGLE') {
        if (message.enabled) {
          startOptimizer();
        } else {
          stopOptimizer();
        }
      }
    });
  }

  // Chạy khi document sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
