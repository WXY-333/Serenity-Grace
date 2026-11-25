(function () {
  'use strict';
  const scriptSource = document.currentScript?.src;
  const base = scriptSource ? new URL('about-effects-vendor/', scriptSource).href : '';
  const gallery = document.querySelector('.about-effect-gallery');
  if (!base || !gallery || gallery.dataset.initialized) return;
  gallery.dataset.initialized = 'true';
  const stage = gallery.querySelector('.about-effect-stage');
  const status = gallery.querySelector('.about-effect-status');
  const abort = new AbortController();
  const character = document.querySelector('.about-character-card');
  if (character) {
    character.setAttribute('role', 'button');
    character.setAttribute('aria-label', '展开或收起人物卡片');
    character.setAttribute('aria-expanded', 'false');
    function toggleCharacter(event) {
      if (!matchMedia('(hover: none)').matches) return;
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      const expanded = character.classList.toggle('is-expanded');
      character.setAttribute('aria-expanded', String(expanded));
    }
    character.addEventListener('click', toggleCharacter, { signal: abort.signal });
    character.addEventListener('keydown', toggleCharacter, { signal: abort.signal });
  }
  let slider, busy = false, timer;
  function script(url) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = url;
      const timeout = setTimeout(() => {
        element.remove();
        reject(new Error('Animation script timed out'));
      }, 8000);
      element.onload = () => { clearTimeout(timeout); resolve(); };
      element.onerror = () => { clearTimeout(timeout); element.remove(); reject(new Error('Animation script unavailable')); };
      document.head.appendChild(element);
    });
  }
  async function vendor() {
    if (!window.__serenityFluxReady) window.__serenityFluxReady = (async () => {
      if (!window.SerenityEffectsJQuery) {
        await script(base + 'jquery.js');
        window.SerenityEffectsJQuery = window.jQuery.noConflict(true);
      }
      if (!window.flux?.slider) await script(base + 'flux.js');
      const flux = window.flux;
      // The original predates unprefixed CSS transition events.
      const $ = window.SerenityEffectsJQuery;
      $.fn.transitionEnd = function (callback) {
        return this.each(function () {
          $(this).one('transitionend webkitTransitionEnd oTransitionEnd', function (event) {
            callback.call(this, event);
          });
        });
      };
      flux.browser.init();
      flux.browser.supportsTransitions = true;
      flux.browser.supports3d = CSS.supports('perspective', '1000px');
      return flux;
    })();
    try { return await window.__serenityFluxReady; }
    catch (error) { window.__serenityFluxReady = null; throw error; }
  }
  function resize() { stage.style.transform = `scale(${gallery.clientWidth / 1024})`; }
  const observer = new ResizeObserver(resize);
  observer.observe(gallery);
  resize();
  function normalized(url) {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        resolve({ image });
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }
  (async () => {
    const urls = Array.from(gallery.querySelectorAll('.about-effect-sources img'), img => img.src);
    if (!urls.length) { status.textContent = '请在主题设置中选择轮播图片'; return; }
    const images = (await Promise.all(urls.map(normalized))).filter(Boolean);
    if (!gallery.isConnected || abort.signal.aborted) return;
    if (!images.length) { status.textContent = '图片暂时无法加载'; return; }
    const memoryKey = 'serenity-about-gallery-image';
    let startIndex = 0;
    try {
      const saved = localStorage.getItem(memoryKey);
      const rememberedIndex = images.findIndex(({ image }) => image.src === saved);
      if (rememberedIndex >= 0) startIndex = rememberedIndex;
      // Writing can be blocked even when reading succeeds.
      localStorage.setItem(memoryKey, images[startIndex].image.src);
    } catch (_) {
      startIndex = Math.floor(Math.random() * images.length);
    }
    // Rotate the sources so Flux starts at the remembered image and retains their order.
    const orderedImages = images.slice(startIndex).concat(images.slice(0, startIndex));
    let currentIndex = 0, initializing = false, activeEffect = gallery.dataset.transition;
    const effects2d = ['bars', 'blinds', 'blocks', 'blocks2', 'concentric', 'dissolve', 'slide', 'swipe', 'warp', 'zip'];
    const failedEffects = new Set();
    function rememberCurrentImage() {
      try { localStorage.setItem(memoryKey, orderedImages[currentIndex].image.src); }
      catch (_) { /* Storage is optional; the gallery still works without it. */ }
    }
    function resetStage() {
      clearTimeout(timer);
      slider?.stop();
      slider = null;
      window.SerenityEffectsJQuery?.(stage).off('fluxTransitionEnd swipeLeft swipeRight');
      stage.replaceChildren(...orderedImages.map(({ image }) => image.cloneNode()));
    }
    async function initialize(displayIndex = currentIndex) {
      if (initializing || abort.signal.aborted) return false;
      initializing = true;
      // Retry the dependency load once. A rejected promise must not poison later visits.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const flux = await vendor();
          if (abort.signal.aborted) return false;
          resetStage();
          slider = new flux.slider(stage, { autoplay: false, pagination: false, width: 1024, height: 576,
            onTransitionEnd: () => { busy = false; clearTimeout(timer); } });
          // Flux performs its own asynchronous image load, even for cached images.
          // Starting a transition before it finishes lets setupImages remove its tiles.
          const createdSlider = slider;
          await new Promise((resolve, reject) => {
            const deadline = performance.now() + 5000;
            function ready() {
              if (abort.signal.aborted || performance.now() > deadline) {
                reject(new Error('Slider initialization interrupted'));
              } else if (createdSlider.imageLoadedCount >= orderedImages.length) resolve();
              else setTimeout(ready, 20);
            }
            ready();
          });
          if (abort.signal.aborted) return false;
          slider.currentImageIndex = displayIndex;
          slider.setNextIndex(displayIndex + 1);
          slider.setupImages();
          stage.querySelectorAll('.image1, .image2').forEach(el => {
            el.style.backgroundSize = '1024px 576px'; el.style.backgroundPosition = 'center';
          });
          status.hidden = true;
          initializing = false;
          return true;
        } catch (_) {
          if (abort.signal.aborted) return false;
        }
      }
      initializing = false;
      resetStage();
      // If no animation library can load, keep the image visible and allow a tap to retry.
      stage.replaceChildren(orderedImages[currentIndex].image.cloneNode());
      status.hidden = false;
      status.textContent = '?????????????';
      return false;
    }
    function transitionTo(target, effect) {
      if (abort.signal.aborted) return;
      busy = true;
      activeEffect = effect;
      gallery.dataset.activeTransition = effect;
      // Completion events can fire synchronously; arm the watchdog first.
      const source = slider.currentImageIndex;
      timer = setTimeout(() => recover(target, effect, source), 5000);
      try { slider.showImage(target, effect); }
      catch (_) { recover(target, effect, source); }
    }
    async function recover(target, failedEffect, source) {
      if (abort.signal.aborted) return;
      failedEffects.add(failedEffect);
      const alternatives = effects2d.filter(effect => !failedEffects.has(effect));
      // Reset the damaged transition without advancing twice or creating a new effect.
      if (!await initialize(source)) { busy = false; return; }
      if (!alternatives.length) {
        currentIndex = target;
        slider.currentImageIndex = target;
        slider.setNextIndex(target + 1);
        slider.setupImages();
        rememberCurrentImage();
        busy = false;
        return;
      }
      const effect = alternatives[Math.floor(Math.random() * alternatives.length)];
      transitionTo(target, effect);
    }
    resetStage();
    await initialize();
    let touchStart = null, lastTouchTap = -Infinity;
    async function next(event) {
      if (event.type === 'click' && performance.now() - lastTouchTap < 800) return;
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (busy || initializing || images.length < 2) return;
      busy = true;
      if (!slider && !await initialize()) { busy = false; return; }
      if (abort.signal.aborted) return;
      const target = (currentIndex + 1) % orderedImages.length;
      const effect = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'dissolve' : activeEffect;
      // Keep the outgoing frame while recovery retries the same destination.
      transitionTo(target, effect);
      currentIndex = target;
      rememberCurrentImage();
    }
    // Handle a touch tap directly; some mobile pages suppress the synthetic click.
    // Ignore scroll gestures and the click generated after an already handled tap.
    gallery.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' && event.isPrimary) {
        touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    }, { signal: abort.signal });
    gallery.addEventListener('pointermove', event => {
      if (touchStart?.id === event.pointerId &&
          Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 12) touchStart = null;
    }, { signal: abort.signal });
    gallery.addEventListener('pointercancel', () => { touchStart = null; }, { signal: abort.signal });
    gallery.addEventListener('pointerup', event => {
      const tap = touchStart;
      touchStart = null;
      if (tap?.id !== event.pointerId ||
          Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) return;
      lastTouchTap = performance.now();
      next(event);
    }, { signal: abort.signal });
    gallery.addEventListener('click', next, { signal: abort.signal });
    gallery.addEventListener('keydown', next, { signal: abort.signal });
  })().catch(() => { status.textContent = '图片效果加载失败，请刷新重试'; });
  if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(() => {
    abort.abort(); observer.disconnect(); clearTimeout(timer); slider?.stop();
  });
})();
