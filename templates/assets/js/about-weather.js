(function () {
  'use strict';
  const card = document.querySelector('.about-weather');
  if (!card || card.dataset.ready) return;
  card.dataset.ready = 'true';
  const panel = card.closest('.about-card');
  const combined = card.closest('.about-switch');
  const resize = () => {
    const desktop = matchMedia('(min-width: 901px)').matches;
    const shell = card.querySelector('.aw-shell');
    if (combined) {
      const scale = combined.clientHeight / (desktop ? 250 : 140);
      card.style.setProperty('--aw-scale', scale);
      shell.style.width = `${combined.clientWidth / scale}px`;
      shell.style.borderRadius = `${parseFloat(getComputedStyle(combined).borderRadius) / scale}px`;
      return;
    }
    let scale, height;
    if (desktop && panel) {
      const border = parseFloat(getComputedStyle(panel).borderTopWidth) || 0;
      height = panel.offsetHeight;
      const width = (combined ? panel.querySelector('.about-content') : card.parentElement).clientWidth * .36;
      scale = height / 250;
      card.style.width = `${width}px`;
      card.style.top = `${-border}px`;
      card.style.right = `${-border}px`;
      card.style.transform = 'none';
      shell.style.width = `${width / scale}px`;
    } else {
      card.style.removeProperty('width');
      card.style.removeProperty('top');
      card.style.removeProperty('right');
      card.style.removeProperty('transform');
      shell.style.removeProperty('width');
      const mobileWidth = combined ? panel.offsetWidth : card.clientWidth;
      scale = Math.min(mobileWidth / 670, 100 / 140);
      height = 140 * scale;
      shell.style.width = `${(combined ? panel.offsetWidth : card.clientWidth) / scale}px`;
    }
    const radius = panel ? getComputedStyle(panel).borderTopRightRadius : '20px';
    card.style.borderRadius = radius;
    shell.style.borderRadius = `${parseFloat(radius) / scale}px`;
    card.style.setProperty('--aw-scale', scale);
    card.style.height = `${height}px`;
    if (combined) {
      for (const prop of ['width', 'height', 'top', 'right', 'border-radius']) combined.style.setProperty(prop, card.style.getPropertyValue(prop));
      if (!desktop) combined.style.width = `${panel.offsetWidth}px`;
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(card.parentElement);
  if (panel) observer.observe(panel);
  resize();
  const key = card.dataset.key, location = (card.dataset.location || '北京').trim();
  const abort = new AbortController();
  const scene = card.querySelector('.aw-scene');
  const pointerTilt = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let tiltBounds;
  function resetTilt() {
    scene?.classList.remove('is-pointer-tilting');
    scene?.style.removeProperty('--aw-tilt-x');
    scene?.style.removeProperty('--aw-tilt-y');
    tiltBounds = null;
  }
  scene?.addEventListener('pointerenter', () => {
    tiltBounds = scene.getBoundingClientRect();
  }, { signal: abort.signal });
  scene?.addEventListener('pointermove', event => {
    if (!pointerTilt.matches || reducedMotion.matches || event.pointerType === 'touch' || event.buttons || combined?.classList.contains('is-dragging')) {
      resetTilt(); return;
    }
    const bounds = tiltBounds || scene.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    scene.classList.add('is-pointer-tilting');
    scene.style.setProperty('--aw-tilt-x', `${-y * 8}deg`);
    scene.style.setProperty('--aw-tilt-y', `${x * 8}deg`);
  }, { signal: abort.signal });
  for (const event of ['pointerleave', 'pointercancel', 'pointerdown']) {
    scene?.addEventListener(event, resetTilt, { signal: abort.signal });
  }
  window.addEventListener('resize', resetTilt, { signal: abort.signal });
  const status = card.querySelector('.aw-status');
  const field = name => card.querySelector(`[data-aw="${name}"]`);
  const cacheKey = `serenity-about-weather:${location}:${key || ''}`;
  let busy = false, snapshot;
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    cloud: '<path d="M6 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8Z"/>',
    rain: '<path d="M5 15a4 4 0 1 1 2-7 5 5 0 0 1 10 1 3 3 0 0 1 1 6M8 18l-1 3m6-3-1 3m6-3-1 3"/>',
    snow: '<path d="M5 14a4 4 0 1 1 2-7 5 5 0 0 1 10 1 3 3 0 0 1 1 6M7 19h.01M12 21h.01M17 19h.01"/>'
  };
  function icon(code) {
    const n = Number(code), type = n <= 3 ? 'sun' : n >= 20 && n <= 25 ? 'snow' : n >= 10 && n <= 19 ? 'rain' : 'cloud';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type]}</svg>`;
  }
  function date(value, zone) {
    const day = value ? new Date(value + 'T12:00:00') : new Date();
    field('weekday').textContent = day.toLocaleDateString('zh-CN', { weekday: 'long', ...(value ? {} : { timeZone: zone || 'Asia/Shanghai' }) });
    field('date').textContent = day.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', ...(value ? {} : { timeZone: zone || 'Asia/Shanghai' }) });
  }
  function showCurrent(value) {
    field('icon').innerHTML = icon(value.code);
    field('temperature').textContent = `${value.temperature}°C`;
    field('description').textContent = value.text;
  }
  function render(data) {
    snapshot = data;
    const now = data.now;
    date(null, now?.location?.timezone);
    field('city').textContent = (now || data.daily)?.location?.name || location;
    if (now) showCurrent(now.now);
    const metrics = card.querySelector('.aw-metrics');
    metrics.replaceChildren();
    for (const [name, label, unit] of [['humidity', '湿度', '%'], ['wind_speed', '风速', ' km/h']]) {
      const value = now?.now?.[name];
      if (value == null || value === '') continue;
      const row = document.createElement('div'), title = document.createElement('span'), number = document.createElement('span');
      title.textContent = label; number.textContent = value + unit; row.append(title, number); metrics.append(row);
    }
    metrics.hidden = !metrics.childElementCount;
    const forecast = card.querySelector('.aw-forecast');
    forecast.replaceChildren();
    (data.daily?.daily || []).slice(0, 3).forEach((day, i) => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'aw-day' + (i === 0 ? ' is-active' : '');
      item.innerHTML = icon(day.code_day);
      const label = document.createElement('span'), temperature = document.createElement('strong');
      label.textContent = i === 0 ? '今天' : new Date(day.date + 'T12:00:00').toLocaleDateString('zh-CN', { weekday: 'short' });
      temperature.textContent = `${day.low} / ${day.high}°`;
      item.append(label, temperature);
      item.setAttribute('aria-label', `${label.textContent}，${day.text_day}，${day.low}至${day.high}摄氏度`);
      item.addEventListener('click', () => {
        forecast.querySelectorAll('.aw-day').forEach(el => el.classList.toggle('is-active', el === item));
        if (i === 0 && data.now) { date(null, data.now.location.timezone); showCurrent(data.now.now); }
        else { date(day.date); showCurrent({ code: day.code_day, temperature: day.high, text: day.text_day }); }
      }, { signal: abort.signal });
      forecast.append(item);
    });
    status.hidden = !!data.now && !!data.daily;
    status.textContent = data.now ? '预报暂不可用，可稍后刷新' : '实时天气暂不可用';
  }
  async function request(endpoint) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    abort.signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 8000);
    try {
      const url = new URL(`https://api.seniverse.com/v3/weather/${endpoint}.json`);
      url.search = new URLSearchParams({ key, location, language: 'zh-Hans', unit: 'c', start: '0', days: '3' });
      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.results?.[0]) throw new Error('Weather unavailable');
      return data.results[0];
    } finally { clearTimeout(timeout); abort.signal.removeEventListener('abort', cancel); }
  }
  async function load(force = false) {
    if (busy || abort.signal.aborted) return;
    if (!key) { date(); field('city').textContent = location; status.textContent = '请在主题设置中填写天气 API Key'; field('description').textContent = '等待天气配置'; return; }
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached?.data) { render(cached.data); if (Date.now() - cached.time < 15 * 60 * 1000) return; }
      } catch (_) { /* Cache is optional. */ }
    }
    busy = true;
    // Seniverse's free tier permits one request per second.
    const result = await Promise.allSettled([request('now')]);
    await new Promise(resolve => {
      const finish = () => { clearTimeout(wait); abort.signal.removeEventListener('abort', finish); resolve(); };
      const wait = setTimeout(finish, 1100);
      abort.signal.addEventListener('abort', finish, { once: true });
      if (abort.signal.aborted) finish();
    });
    if (abort.signal.aborted) return;
    result.push(...await Promise.allSettled([request('daily')]));
    busy = false;
    if (abort.signal.aborted) return;
    const data = { now: result[0].status === 'fulfilled' ? result[0].value : null, daily: result[1].status === 'fulfilled' ? result[1].value : null };
    if (data.now || data.daily) {
      render(data);
      if (data.now && data.daily) try { localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), data })); } catch (_) {}
    } else {
      if (!snapshot) { date(); field('city').textContent = location; field('description').textContent = '天气暂不可用'; }
      status.hidden = false; status.textContent = snapshot ? '更新失败，保留上次天气' : '获取失败，请检查地点、密钥或稍后重试';
    }
  }
  load();
  if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(() => { abort.abort(); observer.disconnect(); });
})();
