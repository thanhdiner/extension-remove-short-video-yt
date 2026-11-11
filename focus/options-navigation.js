(() => {
  const layout = document.querySelector('.layout-container');
  const left = document.querySelector('.col-left');
  const right = document.querySelector('.col-right');
  const cards = {
    blocklist: document.getElementById('blocklist-input').closest('.card'),
    limits: document.getElementById('limit-domain-input').closest('.card'),
    presets: document.getElementById('preset-youtube-cb').closest('.card'),
    feed: document.getElementById('feed-mode').closest('.card'),
    unlock: document.getElementById('unlock-form-container').closest('.card'),
    backup: document.getElementById('export-settings-btn').closest('.card'),
    status: document.getElementById('strict-mode-cb').closest('.card'),
    pending: document.getElementById('pending-changes-card'),
    stats: document.getElementById('stat-wasted').closest('.card'),
    domains: document.getElementById('top-domains-list').closest('.card'),
    history: document.getElementById('focus-history-list').closest('.card')
  };
  const groups = {
    rules: { title: 'Quy tắc', subtitle: 'Quản lý trang bị chặn và giới hạn sử dụng.', cards: [cards.status, cards.pending, cards.blocklist, cards.limits] },
    modes: { title: 'Chế độ', subtitle: 'Điều chỉnh các bộ lọc cho YouTube và Facebook.', cards: [cards.presets, cards.feed] },
    stats: { title: 'Thống kê', subtitle: 'Xem hoạt động và các phiên tập trung.', cards: [cards.stats, cards.domains, cards.history] },
    more: { title: 'Khác', subtitle: 'Mở khóa khẩn cấp và sao lưu cài đặt.', cards: [cards.unlock, cards.backup] }
  };
  // Keep the existing controls and their event handlers intact when grouping them.
  for (const [key, group] of Object.entries(groups)) {
    const section = document.createElement('section');
    section.className = 'options-page';
    section.dataset.page = key;
    section.hidden = key !== 'rules';
    section.setAttribute('aria-label', group.title);
    const heading = document.createElement('div');
    heading.className = 'page-heading';
    const title = document.createElement('h2'); title.dataset.i18n = key; title.textContent = window.dinkitI18n.t(key);
    heading.append(title);
    section.append(heading, ...group.cards);
    layout.append(section);
  }
  left.remove(); right.remove();
  window.dinkitI18n.apply();
  const show = page => {
    if (!groups[page]) return;
    for (const section of layout.querySelectorAll('.options-page')) section.hidden = section.dataset.page !== page;
    for (const button of document.querySelectorAll('[data-options-page]')) {
      if (button.dataset.optionsPage === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  };
  document.querySelectorAll('[data-options-page]').forEach(button => button.addEventListener('click', () => show(button.dataset.optionsPage)));
})();
