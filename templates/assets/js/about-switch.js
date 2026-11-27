(function () {
  'use strict';
  const host = document.querySelector('.about-switch');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = 'true';
  const slides = [host.querySelector('.about-stats'), host.querySelector('.about-weather')].filter(Boolean);
  const abort = new AbortController();
  let index = 0, gesture = null, suppressUntil = 0, side = 1, switchingTimer;
  try { index = slides.length > 1 && localStorage.getItem('serenity-about-component') === 'weather' ? 1 : 0; } catch (_) {}
  function render(offset = 0) {
    slides.forEach((slide, i) => {
      slide.style.setProperty('--slide-x', `${(i === index ? 0 : side * host.clientWidth) + offset}px`);
      slide.inert = !gesture?.dragging && i !== index;
      slide.setAttribute('aria-hidden', String(i !== index));
    });
  }
  function select(next) {
    clearTimeout(switchingTimer);
    host.classList.add('is-switching');
    switchingTimer = setTimeout(() => host.classList.remove('is-switching'), 380);
    index = ((next % 2) + 2) % 2;
    try { localStorage.setItem('serenity-about-component', index ? 'weather' : 'stats'); } catch (_) {}
    render();
  }
  if (slides.length > 1) {
  host.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dragging: false };
  }, { capture: true, signal: abort.signal });
  host.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      side = dx > 0 ? -1 : 1;
      host.classList.add('is-dragging');
      render();
      void host.offsetWidth;
      gesture.dragging = true;
      host.classList.add('is-dragging');
      host.setPointerCapture(event.pointerId);
      // End any bubble-spawning press before the carousel takes over.
      host.querySelector('canvas')?.dispatchEvent(new PointerEvent('pointerleave'));
    }
    gesture.dx = dx;
    // Let document-level cursor plugins keep tracking the physical pointer.
    event.preventDefault();
    render(dx);
  }, { capture: true, signal: abort.signal });
  function finish(event) {
    if (gesture?.id !== event.pointerId) return;
    const previous = gesture; gesture = null;
    host.classList.remove('is-dragging');
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (previous.dragging) {
      suppressUntil = performance.now() + 500;
      event.stopPropagation();
      const threshold = Math.min(70, host.clientWidth * .18);
      const changed = event.type !== 'pointercancel' && Math.abs(previous.dx) >= threshold;
      if (changed) side = previous.dx > 0 ? 1 : -1;
      select(changed ? index + 1 : index);
    } else render();
  }
  host.addEventListener('pointerup', finish, { capture: true, signal: abort.signal });
  host.addEventListener('pointercancel', finish, { capture: true, signal: abort.signal });
  host.addEventListener('click', event => {
    if (performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true, signal: abort.signal });
  host.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); select(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  }, { signal: abort.signal });
  } else {
    host.removeAttribute('tabindex');
    host.removeAttribute('aria-label');
    host.classList.add('is-single');
  }
  function fit() {
    const panel = host.closest('.about-card');
    const title = panel?.querySelector('.about-section-title');
    const text = host.parentElement.querySelector('.about-text');
    if (matchMedia('(max-width: 900px)').matches) {
      host.style.height = `${Math.min((panel ? panel.clientWidth + 2 : host.clientWidth) * 140 / 670, 100)}px`;
      host.style.removeProperty('margin-top');
    } else if (title && text) {
      host.style.marginTop = `${title.offsetTop - host.parentElement.offsetTop}px`;
      host.style.height = `${text.offsetTop + text.offsetHeight - title.offsetTop}px`;
    }
    render();
  }
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  const panel = host.closest('.about-card');
  if (panel) observer.observe(panel);
  fit();
  if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(() => { clearTimeout(switchingTimer); abort.abort(); observer.disconnect(); });
})();
