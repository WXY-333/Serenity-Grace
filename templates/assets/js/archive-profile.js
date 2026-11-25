(function () {
  'use strict';
  var card = document.querySelector('.archive-profile');
  if (!card || card.dataset.profileReady) return;
  card.dataset.profileReady = 'true';
  var button = card.querySelector('.archive-profile-toggle');
  var social = card.querySelector('.archive-profile-social');
  var links = Array.from(social.querySelectorAll('a'));
  // Validate URLs before counting, so empty or unsupported entries use no slots.
  var visible = links.filter(function (link) {
    try {
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(link.getAttribute('href'), location.origin).protocol);
    } catch (error) { return false; }
  }).slice(0, 5);
  links.forEach(function (link) {
    if (!visible.includes(link)) link.remove();
  });
  visible.forEach(function (link, index) {
    var angle = visible.length === 1 ? 0 : -90 + index * 180 / (visible.length - 1);
    link.style.setProperty('--profile-angle', angle + 'deg');
    link.style.setProperty('--profile-delay', index * 0.1 + 's');
  });
  button.disabled = visible.length === 0;
  if (button.disabled) button.setAttribute('aria-label', '暂无联系方式');

  function setOpen(open) {
    card.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? '收起联系方式' : '展开联系方式');
    social.setAttribute('aria-hidden', String(!open));
    social.inert = !open;
    visible.forEach(function (link) { link.tabIndex = open ? 0 : -1; });
  }
  button.addEventListener('click', function () {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  card.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  var photo = card.querySelector('.archive-profile-photo img');
  var photoSpin;
  photo.parentElement.addEventListener('pointerenter', function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (photoSpin) photoSpin.cancel();
    photoSpin = photo.animate([
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-360deg)' }
    ], { duration: 500, easing: 'ease-in-out' });
  });
  photo.addEventListener('error', function () {
    photo.src = '/themes/theme-Serenity/assets/public/logo.webp';
  }, { once: true });
})();
