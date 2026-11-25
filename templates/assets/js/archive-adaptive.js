/* Match the article column to the visible sidebar without dropping archive entries. */
(function () {
  'use strict';
  const main = document.querySelector('.archive-main');
  const sidebar = document.querySelector('.archive-sidebar');
  const list = main?.querySelector('.archive-list');
  const pagination = main?.querySelector('.pagination');
  if (!list || !sidebar || !pagination || main.dataset.adaptiveReady) return;
  main.dataset.adaptiveReady = 'true';
  const originalCards = Array.from(list.querySelectorAll('.archive-card'));
  if (!originalCards.length) return;
  const originalPagination = pagination.cloneNode(true);
  const desktop = window.matchMedia('(min-width: 901px)');
  const controller = new AbortController();
  let cards = null;
  let loading = false;
  let count = originalCards.length;
  let page = 0;
  let frame;

  function arrow(direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pagination-arrow';
    button.setAttribute('aria-label', direction < 0 ? '上一页' : '下一页');
    button.innerHTML = direction < 0
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
    return button;
  }
  const previous = arrow(-1);
  const next = arrow(1);
  const current = document.createElement('span');
  current.className = 'pagination-current';
  const controls = document.createElement('div');
  controls.className = 'pagination-controls';
  controls.append(previous, current, next);
  function render() {
    if (!cards || !desktop.matches || !main.isConnected) return;
    const pages = Math.ceil(cards.length / count);
    page = Math.min(page, pages - 1);
    const selected = cards.slice(page * count, (page + 1) * count);
    selected.forEach(card => {
      // Imported markup is inert: only reuse article cards, never remote scripts.
      card.removeAttribute('data-aos');
      card.classList.add('aos-animate');
    });
    list.replaceChildren(...selected);
    const info = originalPagination.querySelector('.pagination-info')?.cloneNode(true);
    pagination.replaceChildren(...(info ? [info] : []), controls);
    current.textContent = `${page + 1} / ${pages}`;
    previous.disabled = page === 0;
    next.disabled = page === pages - 1;
    previous.classList.toggle('disabled', previous.disabled);
    next.classList.toggle('disabled', next.disabled);
    if (typeof truncateArchiveMeta === 'function') truncateArchiveMeta();
  }
  function fit() {
    if (!cards || !desktop.matches || !main.isConnected) return;
    const first = list.querySelector('.archive-card');
    if (!first) return;
    const height = first.getBoundingClientRect().height;
    if (!height) return;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const target = sidebar.getBoundingClientRect().height;
    const nextCount = Math.min(cards.length, Math.max(1, Math.ceil((target + gap) / (height + gap))));
    if (nextCount !== count) {
      const anchor = page * count;
      count = nextCount;
      page = Math.floor(anchor / count);
    }
    render();
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  }
  [previous, next].forEach((button, index) => button.addEventListener('click', () => {
    page += index ? 1 : -1;
    render();
    main.scrollIntoView({ block: 'start' });
  }));

  async function load() {
    if (loading || cards || !desktop.matches) return;
    loading = true;
    const initialPage = Number(originalPagination.dataset.archivePage || 1);
    const documents = new Map([[initialPage, document]]);
    const queue = [document];
    const visited = new Set([window.location.href]);
    try {
      // Follow Halo's real archive URLs so custom routes and existing pagination work.
      for (let index = 0; index < queue.length; index += 1) {
        for (const link of queue[index].querySelectorAll('.archive-main .pagination a.pagination-arrow')) {
          const url = new URL(link.getAttribute('href'), window.location.href);
          if (url.origin !== location.origin || visited.has(url.href)) continue;
          visited.add(url.href);
          const response = await fetch(url.href, { signal: controller.signal });
          if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
          const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
          const nav = parsed.querySelector('.archive-main .pagination');
          if (!nav || !parsed.querySelector('.archive-list .archive-card')) throw new Error('Incomplete archive');
          const number = Number(nav.dataset.archivePage);
          if (!Number.isInteger(number) || number < 1) throw new Error('Invalid archive page');
          if (documents.has(number)) continue;
          documents.set(number, parsed);
          queue.push(parsed);
        }
      }
      const unique = new Map();
      Array.from(documents).sort((a, b) => a[0] - b[0]).forEach(([, doc]) => {
        doc.querySelectorAll('.archive-list .archive-card').forEach(card => {
          const href = card.getAttribute('href');
          if (!unique.has(href)) unique.set(href, card);
        });
      });
      cards = Array.from(unique.values());
      // Keep the same article near the start when opening a server-rendered page directly.
      const offset = Math.max(0, cards.indexOf(originalCards[0]));
      page = Math.floor(offset / count);
      fit();
    } catch (error) {
      // Preserve the complete server pagination when offline, throttled, or interrupted.
    } finally {
      loading = false;
    }
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  observer?.observe(sidebar);
  function onResize() {
    if (desktop.matches) {
      if (cards) schedule(); else load();
    } else if (cards) {
      list.replaceChildren(...originalCards);
      pagination.replaceChildren(...Array.from(originalPagination.childNodes, node => node.cloneNode(true)));
    }
  }
  window.addEventListener('resize', onResize);
  if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(() => {
    controller.abort();
    observer?.disconnect();
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(frame);
  });
  load();
})();
