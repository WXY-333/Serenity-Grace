(function () {
  'use strict';
  const states = new WeakMap();
  function svgUrl(source, color) {
    if (!source || !source.trim().startsWith('<')) return null;
    const doc = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.querySelector('parsererror') || root.localName !== 'svg') return null;
    // Resolve sprite references already present on this page before isolating the SVG.
    root.querySelectorAll('use').forEach(use => {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      if (!href.startsWith('#')) { use.remove(); return; }
      // References to symbols inside the uploaded SVG must remain local.
      if (doc.getElementById(href.slice(1))) return;
      const symbol = document.getElementById(href.slice(1));
      if (!symbol) { use.remove(); return; }
      const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      Array.from(symbol.childNodes).forEach(child => group.appendChild(doc.importNode(child, true)));
      if (!root.hasAttribute('viewBox') && symbol.hasAttribute('viewBox')) root.setAttribute('viewBox', symbol.getAttribute('viewBox'));
      use.replaceWith(group);
    });
    root.querySelectorAll('script,foreignObject,iframe,object,embed,style,audio,video,animate,animateMotion,animateTransform,set').forEach(el => el.remove());
    [root, ...root.querySelectorAll('*')].forEach(el => {
      // Keep presentation styles used by exported logos, without active CSS.
      if (el.hasAttribute('style')) {
        const allowed = /^(fill|fill-opacity|fill-rule|stroke|stroke-width|stroke-opacity|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|stroke-dashoffset|opacity|color|stop-color|stop-opacity|clip-path|clip-rule|mask|filter|transform)$/;
        Array.from(el.style).forEach(name => {
          const value = el.style.getPropertyValue(name).trim();
          if (allowed.test(name) && !/expression|javascript|@|var\(/i.test(value) &&
              !/url\(/i.test(value.replace(/url\(\s*['"]?#[\w.-]+['"]?\s*\)/gi, ''))) el.setAttribute(name, value);
        });
      }
      for (const attr of Array.from(el.attributes)) {
        if (/^on/i.test(attr.name) || attr.name === 'style' ||
            (/href$/i.test(attr.name) && !attr.value.startsWith('#')) ||
            (/url\(/i.test(attr.value) && !/^url\(\s*['"]?#/.test(attr.value))) el.removeAttribute(attr.name);
        else if (/currentColor/i.test(attr.value)) el.setAttribute(attr.name, attr.value.replace(/currentColor/gi, color));
      }
    });
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(root));
  }
  function update() {
    document.querySelectorAll('[data-icon-svg],.custom-icon-slot').forEach(slot => {
      const settings = { customSvg: slot.dataset.iconSvg, customImage: slot.dataset.iconImage };
      if (slot.tagName === 'IMG') {
        const url = svgUrl(settings.customSvg, getComputedStyle(slot).color);
        const original = states.get(slot)?.original ?? slot.getAttribute('src') ?? '';
        const sources = [...new Set([url, original, slot.dataset.iconFallbackSrc].filter(Boolean))];
        const key = JSON.stringify(sources);
        if (states.get(slot)?.key === key) return;
        states.set(slot, { key, original });
        let index = 0;
        slot.onerror = () => {
          if (++index < sources.length) slot.src = sources[index];
          else slot.onerror = null;
        };
        if (sources[0]) slot.src = sources[0];
        return;
      }
      if (!settings.customSvg && !settings.customImage) return;
      const color = getComputedStyle(slot.parentElement).color;
      const customImage = (settings.customImage || '').trim();
      const safeImage = customImage && !/^(javascript|vbscript):/i.test(customImage) ? customImage : '';
      const sources = [...new Set([svgUrl(settings.customSvg, color), safeImage].filter(Boolean))];
      const source = sources[0];
      if (!source) return;
      if (slot.dataset.iconSource === source) return;
      slot.dataset.iconSource = source;
      const img = new Image();
      let index = 0;
      img.alt = ''; img.className = 'serenity-custom-icon';
      img.style.cssText = 'width:1em;height:1em;object-fit:contain;vertical-align:middle;flex-shrink:0;';
      img.onload = () => {
        if (slot.dataset.iconSource !== source) return;
        // Only replace icon siblings, preserving link text and interaction.
        Array.from(slot.parentElement.children).forEach(el => {
          if (el !== slot && (el.matches('svg,i,.iconify,.nav-custom-icon') || el.dataset.iconFallback)) {
            el.dataset.iconFallback = 'true'; el.style.display = 'none';
          }
        });
        slot.replaceChildren(img); slot.style.display = 'inline-flex';
      };
      img.onerror = () => {
        if (slot.dataset.iconSource !== source) return;
        if (++index < sources.length) img.src = sources[index];
      };
      img.src = source;
    });
  }
  update();
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
