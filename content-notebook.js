(function() {
  'use strict';

  let enabled = false;
  let observer = null;
  function hideElement(element) {
    // Scoped CSS restores the site's own styles when this feature is disabled.
    if (element && element !== document.body && element !== document.documentElement) {
      element.setAttribute('data-dinkit-notebook-hidden', '');
    }
  }

  function hideYouTubeErrors() {
    if (!enabled) return;

    // Tìm và ẩn thẻ cha .ytp-error (chứa tất cả lỗi bên trong)
    const errorElements = document.querySelectorAll('.ytp-error');
    errorElements.forEach(element => {
      hideElement(element);
      
      // Ẩn hẳn video player chứa lỗi này
      const player = element.closest('.html5-video-player');
      if (player) {
        hideElement(player);
      }
      
      // Ẩn iframe YouTube chứa lỗi
      const iframe = element.closest('iframe');
      if (iframe && (iframe.src.includes('youtube.com') || iframe.src.includes('youtube-nocookie.com'))) {
        hideElement(iframe);
      }
    });
    
    // Ẩn tất cả iframe YouTube và container của chúng
    const youtubeIframes = document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"]');
    youtubeIframes.forEach(iframe => {
      // Đánh dấu iframe bị lỗi
      hideElement(iframe);
      
      // Ẩn container chứa iframe
      const container = iframe.closest('.youtube-container');
      if (container) {
        hideElement(container);
      }
      
      // Ẩn div wrapper trực tiếp
      const wrapper = iframe.parentElement;
      if (wrapper) {
        hideElement(wrapper);
      }
    });
    
    // Ẩn Source guide container
    const sourceGuides = document.querySelectorAll('.source-guide-container');
    sourceGuides.forEach(guide => {
      hideElement(guide);
    });
    
    // Thêm nút copy cho elements-container
    const elementsContainers = document.querySelectorAll('.elements-container');
    elementsContainers.forEach(container => {
      // Kiểm tra xem đã có nút copy chưa
      if (!container.querySelector(':scope > .copy-button')) {
        // Tạo nút copy
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-button';
        const copyText = key => globalThis.dinkitContentLanguage?.t(key) || ({ copy: 'Copy', copyCode: 'Copy code', copied: 'Copied!', copyFailed: 'Failed' })[key];
        let copyState = 'copy';
        const updateCopyLabel = () => { copyBtn.textContent = copyText(copyState); copyBtn.setAttribute('aria-label', copyText('copyCode')); };
        updateCopyLabel();
        copyBtn.dinkitUnsubscribe = globalThis.dinkitContentLanguage?.subscribe(updateCopyLabel);
        
        // Thêm sự kiện click
        copyBtn.addEventListener('click', function() {
          // Lấy text từ container
          const text = container.innerText.replace(copyBtn.innerText, '').trim();
          
          // Copy vào clipboard
          navigator.clipboard.writeText(text).then(() => {
            // Thay đổi text nút
            copyState = 'copied'; updateCopyLabel();
            copyBtn.classList.add('copied');
            
            // Trở lại sau 2 giây
            setTimeout(() => {
              copyState = 'copy'; updateCopyLabel();
              copyBtn.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy:', err);
            copyState = 'copyFailed'; updateCopyLabel();
            setTimeout(() => {
              copyState = 'copy'; updateCopyLabel();
            }, 2000);
          });
        });
        
        // Thêm nút vào container
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
    copyButtons.forEach(btn => { btn.dinkitUnsubscribe?.(); btn.remove(); });
    document.querySelectorAll('[data-dinkit-notebook-hidden]').forEach(element => element.removeAttribute('data-dinkit-notebook-hidden'));
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
