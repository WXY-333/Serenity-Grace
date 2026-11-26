// Shared background media for the weather card and liquid statistics texture.
export function isVideo(url) {
  try { return /\.(mp4|webm)$/i.test(new URL(url, location.href).pathname); }
  catch (_) { return false; }
}

export function backgroundVideo(url, crossOrigin = false) {
  const video = document.createElement('video');
  if (crossOrigin) video.crossOrigin = 'anonymous';
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.src = url;
  return video;
}

export function releaseVideo(video) {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

// Canvas drawImage on a GIF image does not reliably advance its animation.
// Decode and composite frames, including partial frames and disposal modes.
export async function gifBackground(url, signal) {
  const [{ parseGIF, decompressFrame }, response] = await Promise.all([
    import('./stats-vendor/gifuct-js.js'), fetch(url, { signal })
  ]);
  if (!response.ok) throw new Error('Background could not be loaded');
  const gif = parseGIF(await response.arrayBuffer());
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const frames = gif.frames.filter(frame => frame.image);
  if (!frames.length) throw new Error('GIF has no image frames');
  const canvas = document.createElement('canvas');
  canvas.width = gif.lsd.width;
  canvas.height = gif.lsd.height;
  const context = canvas.getContext('2d');
  const patch = document.createElement('canvas');
  const patchContext = patch.getContext('2d');
  let index = 0, previous, restore, next = 0;
  return {
    source: canvas,
    update(now) {
      if (now < next || signal.aborted) return false;
      if (index === 0) context.clearRect(0, 0, canvas.width, canvas.height);
      else if (previous?.disposalType === 2) {
        const d = previous.dims;
        context.clearRect(d.left, d.top, d.width, d.height);
      } else if (previous?.disposalType === 3 && restore) context.putImageData(restore, 0, 0);
      const frame = decompressFrame(frames[index], gif.gct, true);
      restore = frame.disposalType === 3 ? context.getImageData(0, 0, canvas.width, canvas.height) : null;
      patch.width = frame.dims.width;
      patch.height = frame.dims.height;
      patchContext.putImageData(new ImageData(frame.patch, patch.width, patch.height), 0, 0);
      context.drawImage(patch, frame.dims.left, frame.dims.top);
      previous = frame;
      index = (index + 1) % frames.length;
      next = now + Math.max(20, frame.delay || 100);
      return true;
    }
  };
}

// Weather backgrounds keep native image/GIF rendering; only videos replace img.
function initWeatherBackgrounds() {
document.querySelectorAll('img.aw-background').forEach(image => {
  if (!isVideo(image.currentSrc || image.src)) return;
  const video = backgroundVideo(image.currentSrc || image.src);
  video.className = image.className;
  image.replaceWith(video);
  const abort = new AbortController();
  let intersecting = true;
  const play = () => {
    if (!document.hidden && intersecting) video.play().catch(() => {});
    else video.pause();
  };
  const observer = new IntersectionObserver(entries => {
    intersecting = entries[0].isIntersecting;
    play();
  });
  observer.observe(video);
  document.addEventListener('visibilitychange', play, { signal: abort.signal });
  document.addEventListener('pointerdown', play, { signal: abort.signal });
  video.addEventListener('error', () => {
    image.src = new URL('../images/about-weather.jpg', import.meta.url).href;
    video.replaceWith(image);
    observer.disconnect(); abort.abort(); releaseVideo(video);
  }, { once: true, signal: abort.signal });
  play();
  if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(() => {
    observer.disconnect(); abort.abort(); releaseVideo(video);
  });
});

}
initWeatherBackgrounds();
(window.__pjaxPageInit = window.__pjaxPageInit || []).push(initWeatherBackgrounds);
