(function () {
  'use strict';
  const signature = document.querySelector('.contact-signature');
  if (!signature || signature.dataset.ready) return;
  signature.dataset.ready = 'true';
  const svg = signature.querySelector('svg');
  const text = signature.querySelector('text');
  function fit() {
    const width = Math.max(180, text.getComputedTextLength() + 30);
    svg.setAttribute('viewBox', `0 0 ${width} 100`);
    signature.querySelector('path').setAttribute('d', `M12 82 Q${width * .42} 72 ${width - 15} 80`);
  }
  fit();
  if (document.fonts?.ready) document.fonts.ready.then(fit);
  if (document.fonts?.load) document.fonts.load('400 56px "Serenity Signature"', text.textContent).then(fit).catch(() => {});
  if (!('IntersectionObserver' in window)) {
    signature.classList.add('is-written');
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      signature.classList.add('is-written');
      observer.disconnect();
    }
  }, { threshold: .5 });
  observer.observe(signature);
  if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(() => observer.disconnect());
})();
