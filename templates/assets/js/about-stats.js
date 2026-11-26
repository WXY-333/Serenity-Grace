import * as THREE from "./stats-vendor/three.module.js";

/* ================================================================
   Liquid Glass  –  metaball refraction over typography
   ================================================================ */

/* ── Constants ──────────────────────────────────────────── */
const MAX_DROPLETS = 40;
const FIXED_DT_MS = 8;
const MAX_FRAME_DT_MS = 100;
const MAX_CATCHUP = 6;

/* ── Renderer ───────────────────────────────────────────── */
const app = document.querySelector(".stats-bubbles");
if (app && !app.dataset.ready) {
try {
app.dataset.ready = "true";
let disposed = false, frame;
const events = new AbortController();
function fitMobileHeight() {
  const stats = app.parentElement;
  if (stats.closest('.about-switch')) return;
  if (matchMedia('(max-width: 900px)').matches) {
    const panel = stats.closest('.about-card');
    const width = panel ? panel.clientWidth + 2 : stats.clientWidth;
    stats.style.height = `${Math.min(width * 140 / 670, 100)}px`;
    stats.style.removeProperty('margin-top');
  } else {
    const panel = stats.closest('.about-card');
    const title = panel?.querySelector('.about-section-title');
    const text = stats.parentElement.querySelector('.about-text');
    if (title && text) {
      // Layout coordinates stay stable while the whole panel animates into view.
      const offset = title.offsetTop - stats.parentElement.offsetTop;
      stats.style.marginTop = `${offset}px`;
      stats.style.height = `${text.offsetTop + text.offsetHeight - title.offsetTop}px`;
    } else stats.style.removeProperty('height');
  }
}
fitMobileHeight();
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.setSize(app.clientWidth, app.clientHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/* ── Background typography texture ──────────────────────── */
const bgCanvas = document.createElement("canvas");
const bgCtx = bgCanvas.getContext("2d");
const bgTexture = new THREE.CanvasTexture(bgCanvas);
bgTexture.minFilter = THREE.LinearFilter;
bgTexture.magFilter = THREE.LinearFilter;

let backgroundImage;
const backgroundUrl = app.dataset.background || new URL('../images/about-weather.jpg', import.meta.url).href;
const image = new Image();
image.crossOrigin = 'anonymous';
image.onload = () => {
  if (disposed) return;
  backgroundImage = image;
  drawBackground();
};
image.onerror = () => { /* Keep the gradient if an attachment cannot be loaded with CORS. */ };
image.src = backgroundUrl;

function drawBackground() {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  bgCanvas.width = w;
  bgCanvas.height = h;

  const light = document.documentElement.dataset.theme === 'light';
  const palette = light ? ['#edf5f8', '#d3e5ef', '#c2d9e8', '#afcbdc'] : ['#393541', '#303947', '#293445', '#232c3b'];
  /* gradient background */
  const grd = bgCtx.createLinearGradient(0, 0, w * 0.6, h);
  grd.addColorStop(0, palette[0]);
  grd.addColorStop(0.35, palette[1]);
  grd.addColorStop(0.6, palette[2]);
  grd.addColorStop(1, palette[3]);
  bgCtx.fillStyle = grd;
  bgCtx.fillRect(0, 0, w, h);

  if (backgroundImage) {
    // Cover the canvas without distorting the attachment's aspect ratio.
    const factor = Math.max(w / backgroundImage.naturalWidth, h / backgroundImage.naturalHeight);
    const iw = backgroundImage.naturalWidth * factor, ih = backgroundImage.naturalHeight * factor;
    bgCtx.drawImage(backgroundImage, (w - iw) / 2, (h - ih) / 2, iw, ih);
    const tint = bgCtx.createLinearGradient(0, 0, w, h);
    tint.addColorStop(0, light ? 'rgba(67,141,203,.28)' : 'rgba(15,48,94,.46)');
    tint.addColorStop(1, light ? 'rgba(37,81,170,.40)' : 'rgba(17,30,68,.60)');
    bgCtx.fillStyle = tint;
    bgCtx.fillRect(0, 0, w, h);
  }

  /* decorative colour waves */
  bgCtx.save();
  bgCtx.globalAlpha = light ? 0.12 : 0.08;
  for (let i = 0; i < 5; i++) {
    const cx = w * (0.2 + i * 0.18);
    const cy = h * (0.3 + Math.sin(i * 1.3) * 0.25);
    const rg = bgCtx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.35);
    const hue = 200 + i * 25;
    rg.addColorStop(0, `hsla(${hue}, 80%, 65%, 0.6)`);
    rg.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
    bgCtx.fillStyle = rg;
    bgCtx.fillRect(0, 0, w, h);
  }
  bgCtx.restore();

  // The lens must sample the statistics themselves, not only the gradient.
  const items = app.parentElement.querySelectorAll('.stat-item');
  bgCtx.textAlign = 'center';
  bgCtx.textBaseline = 'middle';
  items.forEach((item, index) => {
    const x = w * (index + .5) / items.length;
    const number = item.querySelector('.stat-num').textContent.trim();
    const label = item.querySelector('.stat-label').textContent.trim();
    const size = Math.min(h * .25, w / items.length * .38);
    bgCtx.fillStyle = backgroundImage ? '#ffffff' : light ? '#28516a' : '#edf3fa';
    bgCtx.font = `700 ${size}px sans-serif`;
    bgCtx.fillText(number, x, h * .43);
    bgCtx.font = `400 ${Math.max(11 * renderer.getPixelRatio(), size * .43)}px sans-serif`;
    bgCtx.fillText(label, x, h * .68);
  });
  bgCtx.strokeStyle = backgroundImage ? 'rgba(255,255,255,.45)' : light ? 'rgba(40,81,106,.3)' : 'rgba(237,243,250,.3)';
  bgCtx.lineWidth = renderer.getPixelRatio();
  for (let i = 1; i < items.length; i++) {
    const x = w * i / items.length;
    bgCtx.beginPath();
    bgCtx.moveTo(x, h * .32);
    bgCtx.lineTo(x, h * .75);
    bgCtx.stroke();
  }
  bgTexture.needsUpdate = true;
}

/* wait for font to load, then draw */
document.fonts.ready.then(() => {
  if (!disposed) drawBackground();
});
drawBackground();
const themeObserver = new MutationObserver(() => { if (!disposed) drawBackground(); });
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ── Droplet data (main + ghost trailing blobs) ─────────── */
const MAX_ENTRIES = MAX_DROPLETS * 2;
const dropletBuf = new Float32Array(MAX_ENTRIES * 4);
const dropletTex = new THREE.DataTexture(
  dropletBuf,
  MAX_ENTRIES,
  1,
  THREE.RGBAFormat,
  THREE.FloatType,
);
dropletTex.minFilter = THREE.NearestFilter;
dropletTex.magFilter = THREE.NearestFilter;
dropletTex.needsUpdate = true;

let drops = [];
let uid = 0;

function spawn(x, y, r, vx = 0, vy = 0) {
  if (drops.length >= MAX_DROPLETS) return null;
  const area = Math.PI * r * r;
  const angle = Math.random() * Math.PI * 2;
  const spd = 0.0003 + Math.random() * 0.0008;
  const d = {
    id: uid++,
    x,
    y,
    r,
    area,
    vx: vx || Math.cos(angle) * spd,
    vy: vy || Math.sin(angle) * spd,
    alive: true,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderSpeed: 0.3 + Math.random() * 0.5,
    /* soft-body state */
    softPrevX: x,
    softPrevY: y,
    softOffX: 0,
    softOffY: 0,
    softVelX: 0,
    softVelY: 0,
  };
  drops.push(d);
  return d;
}

/* seed */
for (let i = 0; i < 12; i++) {
  spawn(
    (Math.random() - 0.5) * 0.7,
    (Math.random() - 0.5) * 0.5,
    0.03 + Math.random() * 0.05,
  );
}

/* ── Liquid Glass shader ────────────────────────────────── */
const vertSrc = /* glsl */ `void main(){ gl_Position = vec4(position, 1.0); }`;

const fragSrc = /* glsl */ `
precision highp float;
#define MAX_N ${MAX_ENTRIES}

uniform vec2      uRes;
uniform sampler2D uData;
uniform sampler2D uBg;
uniform int       uCount;
uniform float     uTime;

void main(){
  vec2  uv  = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2  p   = (uv - 0.5) * vec2(asp, 1.0);

  /* ── Accumulate metaball field + lens displacement ── */
  float field = 0.0;
  vec2  grad  = vec2(0.0);
  vec2  lens  = vec2(0.0);   /* weighted pull toward blob centres */
  float lensW = 0.0;

  for(int i = 0; i < MAX_N; i++){
    if(i >= uCount) break;
    vec4  d = texture2D(uData, vec2((float(i)+0.5)/float(MAX_N), 0.5));
    vec2  c = d.xy;
    float r = d.z;
    if(r < 0.001) continue;
    vec2  delta = p - c;
    float dSq   = dot(delta, delta) + 1e-5;
    float contrib = r * r / dSq;
    field += contrib;
    grad  += -2.0 * contrib / dSq * delta;

    /* lens weight: smooth falloff from centre, no singularity */
    float w = r * r / (dSq + r * r);
    lens += (c - p) * w;
    lensW += w;
  }

  /* normalise lens displacement */
  lens /= (lensW + 0.001);
  float lensLen = length(lens);

  float thr  = 1.0;
  float edge = smoothstep(thr - 0.08, thr + 0.03, field);

  /* ── Lens-based refraction (no centre fold) ── */
  float refractStrength = 0.035;
  float mappedLens = atan(lensLen * 6.0) * refractStrength;
  vec2  refractDir = (lensLen > 1e-5) ? lens / lensLen : vec2(0.0);
  /* scale refraction by edge mask with wide soft ramp */
  float refractMask = smoothstep(thr - 0.2, thr + 1.5, field);
  vec2  refractedUV = clamp(uv + refractDir * mappedLens * refractMask, 0.001, 0.999);

  /* sample background */
  vec3  bgClean = texture2D(uBg, uv).rgb;

  /* ── Glass normal from gradient (atan-compressed) ── */
  float gradLen = length(grad);
  float nScale = atan(gradLen * 0.5) * 0.3;
  vec2  nGrad  = (gradLen > 1e-4) ? (grad / gradLen) * nScale : vec2(0.0);
  vec3  N = normalize(vec3(-nGrad, 1.0));
  vec3  L = normalize(vec3(0.3, 0.6, 1.0));
  vec3  V = vec3(0.0, 0.0, 1.0);
  vec3  H = normalize(L + V);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 180.0);

  /* Fresnel (Schlick) */
  float cosTheta = max(dot(N, V), 0.0);
  float fresnel  = 0.04 + 0.96 * pow(1.0 - cosTheta, 4.0);

  /* rim highlight at boundary */
  float rim = smoothstep(thr + 0.6, thr, field) * edge;

  /* subtle chromatic aberration */
  float caStr = 0.0018 * edge;
  vec3 bgCA;
  bgCA.r = texture2D(uBg, refractedUV + vec2(caStr, caStr * 0.5)).r;
  bgCA.g = texture2D(uBg, refractedUV).g;
  bgCA.b = texture2D(uBg, refractedUV - vec2(caStr, caStr * 0.5)).b;

  /* depth tint */
  float depth = smoothstep(thr, thr + 3.0, field);
  vec3  tint  = mix(vec3(1.0), vec3(0.93, 0.96, 1.0), depth * 0.45);

  /* compose glass */
  vec3 glassColor = bgCA * tint * (0.92 + 0.08 * diff)
                  + vec3(1.0) * spec * 0.85
                  + vec3(0.9, 0.95, 1.0) * rim * 0.22
                  + vec3(1.0) * fresnel * 0.10;

  /* soft shadow */
  float shadowField = smoothstep(thr - 0.35, thr - 0.05, field);
  vec3 bg = bgClean * (1.0 - shadowField * 0.06);

  /* thin white border */
  float borderOuter = smoothstep(thr - 0.10, thr - 0.01, field);
  float borderInner = smoothstep(thr + 0.0, thr + 0.06, field);
  float border = borderOuter * (1.0 - borderInner) * 0.28;

  vec3  col = mix(bg, glassColor, edge);
  col += vec3(1.0) * border;

  gl_FragColor = vec4(col, 1.0);
}
`;

const mat = new THREE.ShaderMaterial({
  vertexShader: vertSrc,
  fragmentShader: fragSrc,
  uniforms: {
    uRes: {
      value: new THREE.Vector2(
        renderer.domElement.width,
        renderer.domElement.height,
      ),
    },
    uData: { value: dropletTex },
    uBg: { value: bgTexture },
    uCount: { value: 0 },
    uTime: { value: 0 },
  },
});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

/* ── Input ──────────────────────────────────────────────── */
let aspect = app.clientWidth / app.clientHeight;
const mouse = { x: 999, y: 999, active: false, down: false };
let spawnCD = 0;

renderer.domElement.addEventListener("pointermove", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width - 0.5) * aspect;
  mouse.y = 0.5 - (e.clientY - rect.top) / rect.height;
  mouse.active = true;
});
renderer.domElement.addEventListener("pointerdown", () => {
  mouse.down = true;
});
renderer.domElement.addEventListener("pointerup", () => {
  mouse.down = false;
});
renderer.domElement.addEventListener("pointerleave", () => {
  mouse.active = false;
  mouse.down = false;
});

const resizeObserver = new ResizeObserver(() => {
  if (disposed) return;
  fitMobileHeight();
  renderer.setSize(app.clientWidth, app.clientHeight);
  aspect = app.clientWidth / app.clientHeight;
  mat.uniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
  drawBackground();
});
resizeObserver.observe(app);
const statsPanel = app.closest('.about-card');
if (statsPanel) resizeObserver.observe(statsPanel);

/* ── Physics parameters ─────────────────────────────────── */
const DAMP = 0.993;
const MOUSE_R = 0.18;
const MOUSE_F = 0.004;
const TENSION_RANGE = 0.12;
const TENSION_F = 0.0004;
const MERGE_RATIO = 0.62;
const SPLIT_SPEED = 0.013;
const SPLIT_MIN_R = 0.04;
const MAX_SPEED = 0.015;
const BOUNCE = 0.4;
const WANDER_F = 0.00004;
const CENTER_PULL = 0.000008;

/* ── Forces (no gravity, random wander) ─────────────────── */
function applyForces(time) {
  for (const d of drops) {
    /* random wander */
    d.wanderAngle += (Math.random() - 0.5) * d.wanderSpeed;
    d.vx += Math.cos(d.wanderAngle) * WANDER_F;
    d.vy += Math.sin(d.wanderAngle) * WANDER_F;

    /* gentle pull toward center to keep them in view */
    d.vx -= d.x * CENTER_PULL;
    d.vy -= d.y * CENTER_PULL;

    /* mouse repulsion */
    if (mouse.active) {
      const dx = d.x - mouse.x;
      const dy = d.y - mouse.y;
      const dSq = dx * dx + dy * dy;
      const rr = MOUSE_R + d.r;
      if (dSq < rr * rr && dSq > 1e-5) {
        const dist = Math.sqrt(dSq);
        const s = 1 - dist / rr;
        const f = s * s * MOUSE_F;
        d.vx += (dx / dist) * f;
        d.vy += (dy / dist) * f;
      }
    }
  }

  /* pairwise surface tension */
  for (let i = 0; i < drops.length; i++) {
    const a = drops[i];
    for (let j = i + 1; j < drops.length; j++) {
      const b = drops[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dSq = dx * dx + dy * dy;
      const rng = TENSION_RANGE + a.r + b.r;
      if (dSq < rng * rng && dSq > 1e-5) {
        const dist = Math.sqrt(dSq);
        const s = 1 - dist / rng;
        const f = s * TENSION_F;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }
}

/* ── Integration + wall constraints ─────────────────────── */
function integrate() {
  for (const d of drops) {
    const sp = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
    if (sp > MAX_SPEED) {
      const s = MAX_SPEED / sp;
      d.vx *= s;
      d.vy *= s;
    }
    d.x += d.vx;
    d.y += d.vy;
    d.vx *= DAMP;
    d.vy *= DAMP;

    const wx = aspect * 0.5;
    const wy = 0.5;
    if (d.x - d.r < -wx) {
      d.x = -wx + d.r;
      d.vx = Math.abs(d.vx) * BOUNCE;
    }
    if (d.x + d.r > wx) {
      d.x = wx - d.r;
      d.vx = -Math.abs(d.vx) * BOUNCE;
    }
    if (d.y - d.r < -wy) {
      d.y = -wy + d.r;
      d.vy = Math.abs(d.vy) * BOUNCE;
    }
    if (d.y + d.r > wy) {
      d.y = wy - d.r;
      d.vy = -Math.abs(d.vy) * BOUNCE;
    }
  }
}

/* ── Merge (area-conserving) ────────────────────────────── */
function mergeDroplets() {
  for (let i = 0; i < drops.length; i++) {
    const a = drops[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < drops.length; j++) {
      const b = drops[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < (a.r + b.r) * MERGE_RATIO) {
        const na = a.area + b.area;
        a.x = (a.x * a.area + b.x * b.area) / na;
        a.y = (a.y * a.area + b.y * b.area) / na;
        a.vx = (a.vx * a.area + b.vx * b.area) / na;
        a.vy = (a.vy * a.area + b.vy * b.area) / na;
        a.r = Math.sqrt(na / Math.PI);
        a.area = na;
        b.alive = false;
      }
    }
  }
  drops = drops.filter((d) => d.alive);
}

/* ── Split (momentum-driven) ────────────────────────────── */
function splitDroplets() {
  const add = [];
  for (const d of drops) {
    if (d.r < SPLIT_MIN_R) continue;
    const sp = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
    if (sp < SPLIT_SPEED) continue;

    const ha = d.area * 0.5;
    const nr = Math.sqrt(ha / Math.PI);
    const nx = -d.vy / sp;
    const ny = d.vx / sp;
    const off = nr * 0.7;

    d.r = nr;
    d.area = ha;
    d.x -= nx * off;
    d.y -= ny * off;

    add.push({
      id: uid++,
      x: d.x + nx * off * 2,
      y: d.y + ny * off * 2,
      r: nr,
      area: ha,
      vx: d.vx + nx * sp * 0.35,
      vy: d.vy + ny * sp * 0.35,
      alive: true,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderSpeed: 0.3 + Math.random() * 0.5,
      softPrevX: d.x + nx * off * 2,
      softPrevY: d.y + ny * off * 2,
      softOffX: 0,
      softOffY: 0,
      softVelX: 0,
      softVelY: 0,
    });
  }
  for (const a of add) if (drops.length < MAX_DROPLETS) drops.push(a);
}

/* ── Auto-spawn (random position, no top bias) ──────────── */
let autoTimer = 0;
function autoSpawn() {
  autoTimer += FIXED_DT_MS;
  if (autoTimer > 2000 && drops.length < 10) {
    autoTimer = 0;
    spawn(
      (Math.random() - 0.5) * aspect * 0.6,
      (Math.random() - 0.5) * 0.6,
      0.025 + Math.random() * 0.03,
    );
  }
}

/* ── Click / drag spawn ─────────────────────────────────── */
function mouseSpawn() {
  if (!mouse.down || !mouse.active) return;
  spawnCD -= FIXED_DT_MS;
  if (spawnCD <= 0 && drops.length < MAX_DROPLETS) {
    spawnCD = 120;
    spawn(
      mouse.x + (Math.random() - 0.5) * 0.02,
      mouse.y + (Math.random() - 0.5) * 0.02,
      0.02 + Math.random() * 0.015,
    );
  }
}

/* ── Soft-body spring follow (like physics-demo) ────────── */
const SOFT_STIFFNESS = 0.22;
const SOFT_DAMPING = 0.6;

function updateSoftBodies() {
  for (const d of drops) {
    const dx = d.x - d.softPrevX;
    const dy = d.y - d.softPrevY;

    d.softVelX += (dx - d.softOffX) * SOFT_STIFFNESS;
    d.softVelY += (dy - d.softOffY) * SOFT_STIFFNESS;
    d.softVelX *= SOFT_DAMPING;
    d.softVelY *= SOFT_DAMPING;
    d.softOffX += d.softVelX;
    d.softOffY += d.softVelY;

    d.softPrevX = d.x;
    d.softPrevY = d.y;
  }
}

/* ── Fixed step ─────────────────────────────────────────── */
let simTime = 0;
function fixedUpdate() {
  simTime += FIXED_DT_MS;
  applyForces(simTime);
  integrate();
  mergeDroplets();
  splitDroplets();
  updateSoftBodies();
  autoSpawn();
  mouseSpawn();
}

/* ── Sync texture for shader (main + ghost trailing blobs) ── */
function sync() {
  dropletBuf.fill(0);
  const n = Math.min(drops.length, MAX_DROPLETS);
  for (let i = 0; i < n; i++) {
    const d = drops[i];
    /* main blob */
    dropletBuf[i * 4] = d.x;
    dropletBuf[i * 4 + 1] = d.y;
    dropletBuf[i * 4 + 2] = d.r;
    dropletBuf[i * 4 + 3] = 1;

    /* ghost trailing blob: positioned behind by softOffset,
       smaller radius → creates a teardrop tail via metaball merge */
    const ghostScale = 0.7;
    const trailStr = 3.5;
    const gi = (n + i) * 4;
    dropletBuf[gi] = d.x - d.softOffX * trailStr;
    dropletBuf[gi + 1] = d.y - d.softOffY * trailStr;
    dropletBuf[gi + 2] = d.r * ghostScale;
    dropletBuf[gi + 3] = 1;
  }
  dropletTex.needsUpdate = true;
  mat.uniforms.uCount.value = n * 2;
}

/* ── Main loop ──────────────────────────────────────────── */
let last = performance.now();
let acc = 0;
let paused = false;

document.addEventListener("visibilitychange", () => {
  paused = document.hidden || !visible;
  if (!paused) last = performance.now();
}, { signal: events.signal });

let visible = true;
const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; paused = document.hidden || !visible; last = performance.now(); });
visibility.observe(app);

(function loop() {
  if (disposed) return;
  if (paused) {
    frame = requestAnimationFrame(loop);
    return;
  }
  const now = performance.now();
  const dt = Math.min(now - last, MAX_FRAME_DT_MS);
  last = now;
  acc += dt;

  let g = 0;
  while (acc >= FIXED_DT_MS && g < MAX_CATCHUP) {
    fixedUpdate();
    acc -= FIXED_DT_MS;
    g++;
  }
  if (g >= MAX_CATCHUP) acc = 0;

  mat.uniforms.uTime.value = now * 0.001;
  sync();
  renderer.render(scene, camera);
  app.parentElement.classList.add("has-liquid-lens");
  frame = requestAnimationFrame(loop);
})();
function dispose() {
  disposed = true;
  cancelAnimationFrame(frame);
  events.abort();
  app.parentElement.classList.remove("has-liquid-lens");
  resizeObserver.disconnect();
  themeObserver.disconnect();
  visibility.disconnect();
  renderer.dispose(); mat.dispose(); bgTexture.dispose(); dropletTex.dispose();
  scene.children.forEach(mesh => mesh.geometry?.dispose());
  renderer.domElement.remove();
}
if (typeof window.__pjaxOnLeave === 'function') window.__pjaxOnLeave(dispose);
} catch (error) { app.dataset.unavailable = 'true'; }
}
