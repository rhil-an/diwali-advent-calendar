/* -----------------------------------------------------------
   Diwali Countdown Calendar — Main Engine
   - Loads background + config
   - Manages 15 Diya instances
   - Floating ember particles (replace snow)
   - Progressive amber scene brightness as diyas are lit
   - Text card DOM overlay for cultural content
   - Video popup (same approach as advent-calendar)
----------------------------------------------------------- */

let bg;
let diyas       = [];
let diyaImages  = {};
let flameFrames = [];
let openSound;
let lockedSound;
let diyaConfig  = null;
let creditsConfig = null;

// Global state lock — prevents overlapping lamp interactions.
// Set the instant a lamp starts its ignite (fire) animation, released the
// instant that animation completes (see Diya.onLit in handleDiyaInteraction).
// While true, ALL lamp clicks are ignored so a fast second click can never
// interrupt/overlap the first lamp's flame-growth + popup flow.
let isAnimating = false;

// Title scroll banner
let scrollBanner    = null;
let scrollBannerImg = null;

// Mandala layers and prototype geometry are driven by the calendar config.
let mandalaImages = {};
let MANDALA_RING_COUNT = 3;
let ringDiyas   = { 1: [], 2: [], 3: [] };
let ringAlpha   = { 1: 0, 2: 0, 3: 0 };
let ringBurst   = { 1: 0, 2: 0, 3: 0 };
let ringWasDone = { 1: false, 2: false, 3: false };
let prototypeMandala = null;

// Mandala geometry — set from config in hydrateDiyas()
let MANDALA_CX = 0.5;
let MANDALA_CY = 0.70;
let MANDALA_R  = { 1: 0.24, 2: 0.10, 3: 0.05 };
let MANDALA_RING_EXTRA_OFFSET_X = { 1: 0, 2: 0, 3: 0 };
let MANDALA_RING_EXTRA_OFFSET_Y = { 1: 0, 2: 0, 3: 0 };

const MANDALA_IMG_KEY = { 1: "outer", 2: "middle", 3: "center" };
const RING_EASE       = 0.06;
const RING_BURST_LEN  = 45;

// Video overlay — singleton custom player
// Maps each video-day number to its source file placeholder.
const VIDEO_DAYS = {
  1:  "assets/videos/card-stories/day-01-rows-of-diyas.mp4",
  3:  "assets/videos/bonus/rangoli-showcase.mp4",
  7:  "assets/videos/bonus/sparkler-play.mp4",
  12: "assets/videos/bonus/lantern-breeze.mp4",
  15: "assets/videos/bonus/floating-diya.mp4",
  16: "assets/videos/bonus/ganesha-blessing.mp4",
};

// Non-null while the player is visible (read by isOverlayOpen).
let videoOverlayWrapper  = null;
// Singleton DOM refs — built once in initVideoPlayer(), reused every playback.
// Playback UI (seeking, volume, fullscreen) is handled entirely by the
// browser's native <video controls> — no custom control DOM is built here.
let videoPlayerContainer = null;   // modal overlay wrapper (black backdrop)
let videoPlayerEl        = null;   // the <video> element itself

// Text/reveal card
let revealCardEl = null;
let dimOverlayEl = null;
let storyCardKeyboardReady = false;

// Spring popup — jack-in-the-box image reveal for targeted days.
//
// HOW IT WORKS:
//   When one of these day IDs is clicked the popup reads this object to get
//   the image src, injects a  <div class="spring-popup"><img></div>  into
//   document.body (position:fixed over the lamp), and auto-dismisses after
//   10 seconds.  The click handler (handleDiyaInteraction) and showSpringPopup()
//   already do all of this automatically — you only need to update the paths here.
//
// HOW TO CUSTOMISE:
//   • Replace any path with a local file  e.g. "assets/lamp-items/my-art.png"
//   • Or use an absolute URL             e.g. "https://cdn.example.com/day5.png"
//   • To add a new popup day, add its ID  e.g.  8: "assets/lamp-items/day8.png"
//   • To remove a popup day, delete its line (it will fall through to the
//     normal text/video card instead).
const SPRING_POPUP_DAYS = {
  // Day 2  — Cleaning the Home  → ritual kalash pot
  2:  "assets/lamp-items/kalashpot.png",

  // Day 5  — Traditional Dress  → diya lamp  (swap with your AI image later)
  5:  "assets/lamp-items/diyalamp.png",

  // Day 7  — Fireworks          → paper lantern  (swap with your AI image later)
  7:  "assets/lamp-items/paperlantern.png",

  // Day 10 — Diwali Around the World → diwali sweets as a gifting symbol
  10: "assets/lamp-items/diwali-sweets.png",

  // Day 20 — Govardhan Puja     → festive sparkler
  20: "assets/lamp-items/festivesparkler.png",
};
let springPopupEl    = null;
let springPopupTimer = null;

// Flame "flare up" — micro-interaction played on re-click of an already
// unlocked lamp, before its popup/card re-opens. See showFlameFlare().
let flameFlareEl = null;
const FLAME_FLARE_MS = 800; // must match the flame-burst keyframe duration in style.css

// Embers
let embers     = [];
let canvasEl   = null;
let canvasScale = 1;

/* -----------------------------------------------------------
   Sequential unlock + CSS two-circle moon phase
   Lamps must be opened in day order (1 → 15). The moon shadow
   slides via translateX using the lunar illumination table below.
----------------------------------------------------------- */

let currentUnlockedDay = 1;

// Temporary testing mode: every lamp can be opened directly, regardless of
// the calendar's normal day-by-day unlock order.
const SEQUENTIAL_UNLOCK_ENABLED = false;
let moonContainerEl    = null;
let moonShadowEl       = null;

// Progress is read from the current calendar configuration.
let totalDays          = 15;
let festivalStartDay   = 11;
let mainDiwaliDay      = 13;
let progressBadgeEl   = null;
let creditsLinkEl     = null;

// Illumination % per calendar day (from lunar-cycle CSV mapping)
const MOON_ILLUMINATION = {
  1:  100,
  2:  85,
  3:  76,
  4:  67,
  5:  57,
  6:  46, // Third Quarter
  7:  36,
  8:  26,
  9:  17,
  10: 10,
  11: 5,
  12: 1,
  13: 0,  // New Moon
  14: 1,  // Waxing Crescent
  15: 5,
};

function preload() {
  // Synchronous — no fetch() involved, so this is safe under file:// too.
  diyaConfig = loadEmbeddedDiyaConfig();
}

function setup() {
  // Nothing is drawn until loadCoreAssets() resolves: draw() and
  // resizeToViewport() both no-op via their `if (!bg) return;` guards below.
  loadCoreAssets()
    .then(finishSetup)
    .catch((err) => console.error("Failed to load calendar assets:", err));
}

/* ── Loads every image the calendar needs, then hands off to finishSetup()
   once they've all settled. Split out of setup() because it's async (see
   loadImageCompat() for why plain loadImage() can't be used here).

   No cache-busting query string here (unlike the old loadImage() calls) —
   these paths must match the <link rel="preload"> hrefs in index.html
   byte-for-byte or the browser starts a second, uncached fetch instead of
   reusing the preloaded response. It also lets normal HTTP caching speed
   up repeat visits, which a per-load "?v=timestamp" would otherwise defeat. ── */
async function loadCoreAssets() {
  const prototypeLayers = diyaConfig?.prototypeMandala?.layers || [];
  const assets = await Promise.all([
    loadImageCompat("assets/images/backgrounds/diwali-background.png"),
    loadImageCompat("assets/banner/title-banner.png"),
    loadImageCompat("assets/mandala/mandala-outer.png"),
    loadImageCompat("assets/mandala/mandala-middle.png"),
    loadImageCompat("assets/mandala/mandala-center.png"),
    ...prototypeLayers.map((layer) => loadImageCompat(layer.path)),
  ]);
  const [bgImg, bannerImg, outerImg, middleImg, centerImg] = assets;
  bg               = bgImg;
  scrollBannerImg  = bannerImg;
  mandalaImages.outer  = outerImg;
  mandalaImages.middle = middleImg;
  mandalaImages.center = centerImg;
  prototypeLayers.forEach((layer, index) => {
    mandalaImages[layer.key] = assets[index + 5];
  });

  flameFrames = await Promise.all(
    Array.from({ length: 8 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return loadImageCompat(`assets/flame/flame_${n}.png`);
    })
  );

  if (diyaConfig) await loadDiyaImagePayloads(diyaConfig);

  openSound   = new Audio("assets/open.mp3");
  lockedSound = new Audio("assets/locked.mp3");
  openSound.addEventListener("error",   () => { openSound   = null; });
  lockedSound.addEventListener("error", () => { lockedSound = null; });
}

/* ── Runs once loadCoreAssets() has resolved — the old body of setup(). ── */
function finishSetup() {
  if (!bg) {
    console.error("Diwali background image failed to load — check assets/images/backgrounds/diwali-background.png.");
    return;
  }

  let c = createCanvas(bg.width, bg.height);
  canvasEl = c;
  c.parent("canvas-container");
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));

  if (diyaConfig) hydrateDiyas(diyaConfig);

  resizeToViewport();
  initEmbers();
  initVideoPlayer();
  initMoonPhase();
  initProgressBadge();
}

/* -----------------------------------------------------------
   file:// compatibility — protocol-agnostic image loading
   p5.js's built-in loadImage() opens with a fetch() call (used only to
   sniff the response's Content-Type header for GIF detection) before it
   ever touches a plain <img> element. Browsers block fetch()/XHR against
   local files entirely under the file:// protocol (no HTTP server), so
   loadImage() fails immediately there — even though the <img>-based pixel
   loading it falls back to internally would have worked fine on its own.
   This is also why the site "just worked" under Live Server / GitHub
   Pages (both serve over http/https) but broke when index.html was opened
   directly by double-clicking it.

   loadImageCompat() below skips the fetch() and loads straight through a
   plain <img> (exactly how a static <img src="..."> tag would), then
   copies the decoded pixels into a real p5.Image via createImage() so the
   rest of the sketch can keep calling image()/tint()/etc. exactly as
   before — this works identically under file://, Live Server, and GitHub
   Pages, so there's no branching needed by protocol.
----------------------------------------------------------- */

function loadImageCompat(path) {
  return new Promise((resolve) => {
    const raw = new Image();
    raw.onload = () => {
      const pImg = createImage(raw.naturalWidth || raw.width, raw.naturalHeight || raw.height);
      pImg.drawingContext.drawImage(raw, 0, 0);
      pImg.modified = true;
      resolve(pImg);
    };
    raw.onerror = () => {
      console.error("Failed to load image:", path);
      resolve(null); // never reject — one missing asset shouldn't block the rest of the calendar
    };
    raw.src = path;
  });
}

/* ── Loads any "assets/image.png"-style day payloads (see resolveImagePath)
   the same fetch-free way as the core art above. Currently unused by the
   shipped diwali_days.json (every day is "text" or "mp4:..."), but kept so
   a future image-payload day works without touching this loader. ── */
async function loadDiyaImagePayloads(config) {
  const payloads = collectImagePayloads(config);
  await Promise.all(payloads.map(async (p) => {
    if (diyaImages[p]) return;
    const path = resolveImagePath(p);
    if (path) diyaImages[p] = await loadImageCompat(path);
  }));
}

/* ── Reads the calendar config from window.DIWALI_DAYS_DATA (set by
   assets/diwali-days-data.js, loaded as a plain <script> tag in index.html)
   instead of fetching assets/diwali_days.json directly — the same fetch()
   restriction described above also applies to p5's loadJSON(). Regenerate
   assets/diwali-days-data.js from assets/diwali_days.json via
   tools/sync_diwali_days_js.py whenever the JSON changes. ── */
function loadEmbeddedDiyaConfig() {
  if (window.DIWALI_DAYS_DATA) return window.DIWALI_DAYS_DATA;
  console.error(
    "window.DIWALI_DAYS_DATA not found — is assets/diwali-days-data.js " +
    "included in index.html before sketch.js?"
  );
  return null;
}

function draw() {
  if (!bg) return;

  clear();
  image(bg, 0, 0, width, height);

  if (scrollBanner) scrollBanner.draw();

  updateMandalaReveal();
  drawMandalaLayers();

  drawSceneBrightness();
  drawCredits();
  drawEmbers();
  drawNextUnlockHint();

  for (let d of diyas) {
    d.update();
    const sequentiallyLocked = SEQUENTIAL_UNLOCK_ENABLED && d.state === "unlit" && d.id > currentUnlockedDay;
    d.draw({ locked: sequentiallyLocked });
  }
}

function windowResized() {
  resizeToViewport();
}

function resizeToViewport() {
  if (!bg) return;
  const scale = Math.min(windowWidth / bg.width, windowHeight / bg.height);
  canvasScale = scale;
  const newW = Math.max(1, Math.round(bg.width  * scale));
  const newH = Math.max(1, Math.round(bg.height * scale));
  resizeCanvas(newW, newH);
  if (canvasEl && canvasEl.elt) {
    canvasEl.elt.style.setProperty("width",  `${newW}px`, "important");
    canvasEl.elt.style.setProperty("height", `${newH}px`);
  }
  rebuildEmbers();
  syncMoonPosition();
  syncProgressBadgePosition();
  syncCreditsLinkPosition();
}

/* -----------------------------------------------------------
   Moon phase — CSS two-circle overlap
   Illumination 100% → shadow fully off (translateX 100%)
   Illumination   0% → shadow fully covers (translateX 0%)
   Days 1–13 wane (shadow exits to the right);
   days 14–15 wax (shadow exits to the left) for the opposite crescent.
----------------------------------------------------------- */

function initMoonPhase() {
  moonContainerEl = document.getElementById("moon-container");
  moonShadowEl    = document.getElementById("moon-shadow");
  updateMoonPhase(currentUnlockedDay);
  syncMoonPosition();
}

function updateMoonPhase(day) {
  if (!moonShadowEl) moonShadowEl = document.getElementById("moon-shadow");
  if (!moonShadowEl) return;

  const clamped = Math.max(1, Math.min(totalDays, day | 0));
  const distanceFromNewMoon = Math.abs(clamped - mainDiwaliDay);
  const illum = totalDays === 15
    ? (MOON_ILLUMINATION[clamped] ?? 0)
    : Math.min(100, Math.round((distanceFromNewMoon / (mainDiwaliDay - 1)) * 100));

  // Positive X = waning (lit on the left as shadow slides right).
  // Negative X = waxing after new moon (crescent grows on the opposite side).
  const tx = clamped > mainDiwaliDay ? -illum : illum;
  moonShadowEl.style.transform = `translateX(${tx}%)`;
}

/* -----------------------------------------------------------
   Progress badge — "X / 15" readout of how many days are unlocked
----------------------------------------------------------- */

function initProgressBadge() {
  const container = document.getElementById("canvas-container");
  if (!container) return;

  progressBadgeEl = document.createElement("div");
  progressBadgeEl.className = "progress-badge";
  progressBadgeEl.setAttribute("aria-live", "polite");
  progressBadgeEl.setAttribute("aria-label", "Days unlocked");
  container.appendChild(progressBadgeEl);

  updateProgressBadge();
  syncProgressBadgePosition();
}

function updateProgressBadge() {
  if (!progressBadgeEl) return;
  const unlocked = Math.min(Math.max(currentUnlockedDay - 1, 0), totalDays);
  progressBadgeEl.textContent = unlocked + " / " + totalDays;
}

function syncMoonPosition() {
  if (!moonContainerEl) moonContainerEl = document.getElementById("moon-container");
  if (!moonContainerEl || !canvasEl || !canvasEl.elt) return;

  const canvas = canvasEl.elt;
  const parent = canvas.parentElement;
  if (!parent) return;

  const cr = canvas.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const size = Math.max(28, Math.round(cr.width * 0.085));

  // Upper sky, slightly left of centre — sits in the night band above the garland
  moonContainerEl.style.width  = `${size}px`;
  moonContainerEl.style.height = `${size}px`;
  moonContainerEl.style.left   = `${cr.left - pr.left + cr.width * 0.22 - size / 2}px`;
  moonContainerEl.style.top    = `${cr.top  - pr.top  + cr.height * 0.07 - size / 2}px`;
}

/* ── Keeps the progress badge tucked just under the bottom-right corner of
   the "Countdown to Diwali" scroll banner, so it reads as an accent on the
   banner rather than a floating HUD element. Falls back to a fixed inset
   near the canvas's top-right corner if the banner hasn't hydrated yet.
   Uses `right`/`top` (not `left`) so it tracks the canvas's own edges
   regardless of how much letterbox space surrounds it. ── */
function syncProgressBadgePosition() {
  if (!progressBadgeEl || !canvasEl || !canvasEl.elt) return;

  const canvas = canvasEl.elt;
  const parent = canvas.parentElement;
  if (!parent) return;

  const cr = canvas.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();

  let rightFrac = 0.05;
  let topFrac   = 0.045;

  if (scrollBanner && scrollBanner.image && scrollBanner.image.width) {
    // Mirrors the box math in ScrollBanner.draw(): bannerW is a fraction of
    // canvas width; bannerH follows the banner artwork's own aspect ratio.
    const bannerWFrac = scrollBanner.w;
    const bannerHFrac = bannerWFrac * (width / height) *
      (scrollBanner.image.height / scrollBanner.image.width);

    const bannerRightFrac  = scrollBanner.x + bannerWFrac / 2;
    const bannerBottomFrac = scrollBanner.y + bannerHFrac / 2;

    rightFrac = Math.max(0.01, 1 - bannerRightFrac);
    topFrac   = bannerBottomFrac + 0.012; // small gap below the ribbon
  }

  progressBadgeEl.style.right = `${pr.right - cr.right + cr.width * rightFrac}px`;
  progressBadgeEl.style.top   = `${cr.top - pr.top + cr.height * topFrac}px`;
}

/* Keeps the contributors icon inside the lower-right edge of the calendar
   artwork, even when the canvas is letterboxed within a wider viewport. */
function syncCreditsLinkPosition() {
  if (!creditsLinkEl) creditsLinkEl = document.getElementById("credits-link");
  if (!creditsLinkEl || !canvasEl || !canvasEl.elt) return;

  const canvas = canvasEl.elt;
  const parent = canvas.parentElement;
  if (!parent) return;

  const cr = canvas.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const inset = Math.max(10, Math.round(cr.width * 0.025));

  creditsLinkEl.style.right = `${pr.right - cr.right + inset}px`;
  creditsLinkEl.style.bottom = `${pr.bottom - cr.bottom + inset}px`;
}

/* -----------------------------------------------------------
   Amber scene brightness — grows as more diyas are lit
----------------------------------------------------------- */

function drawSceneBrightness() {
  const litCount = diyas.filter((d) => d.isLit()).length;
  if (litCount === 0) return;

  const ratio = litCount / Math.max(diyas.length, 1);
  const ctx   = drawingContext;
  const grad  = ctx.createLinearGradient(0, height, 0, 0);
  const maxA  = 0.28 * ratio;

  grad.addColorStop(0,    `rgba(255, 130, 0, ${maxA})`);
  grad.addColorStop(0.35, `rgba(255, 100, 0, ${maxA * 0.45})`);
  grad.addColorStop(0.75, `rgba(255, 200, 50, ${maxA * 0.10})`);
  grad.addColorStop(1,    `rgba(255, 220, 80, 0)`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/* -----------------------------------------------------------
   "Next lamp" hint — soft pulsing glow behind whichever diya is next
   in the sequential-unlock order, so it's easy to spot at a glance
   once the mandala fills up with already-lit lamps. Purely decorative;
   reads currentUnlockedDay/diya state but never modifies it.
----------------------------------------------------------- */

function drawNextUnlockHint() {
  if (isAnimating) return;

  const next = diyas.find((d) => d.id === currentUnlockedDay && d.state === "unlit");
  if (!next) return;

  const cx = next.px() + next.pw() / 2;
  const cy = next.py() + next.ph() / 2;
  const w  = next.pw();

  // 0.1–1.0 breathing pulse, independent of the flame-flicker timing elsewhere.
  const pulse = 0.55 + Math.sin(frameCount * 0.06) * 0.45;
  const r     = w * (0.95 + pulse * 0.35);

  const ctx  = drawingContext;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0,    `rgba(255, 214, 110, ${0.32 * pulse})`);
  grad.addColorStop(0.55, `rgba(255, 170, 40, ${0.16 * pulse})`);
  grad.addColorStop(1,    "rgba(255, 140, 0, 0)");

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

/* -----------------------------------------------------------
   Mandala reveal — 3 concentric layers bloom into color as each
   ring of diyas is completed
----------------------------------------------------------- */

function ringLitFraction(ringNumber) {
  const members = ringDiyas[ringNumber];
  if (!members || members.length === 0) return 0;
  return members.filter((d) => d.isLit()).length / members.length;
}

function updateMandalaReveal() {
  for (let r = 1; r <= MANDALA_RING_COUNT; r++) {
    const target = ringLitFraction(r);
    ringAlpha[r] += (target - ringAlpha[r]) * RING_EASE;
    if (target >= 1) ringAlpha[r] = 1;

    const justCompleted = target >= 1 && !ringWasDone[r];
    if (justCompleted) {
      ringBurst[r]   = RING_BURST_LEN;
      ringWasDone[r] = true;
    } else if (target < 1) {
      ringWasDone[r] = false;
    }

    if (ringBurst[r] > 0) ringBurst[r]--;
  }
}

function drawMandalaLayers() {
  if (prototypeMandala) {
    drawPrototypeMandala();
    return;
  }
  if (!mandalaImages.outer) return;

  push();
  imageMode(CENTER);
  const ctx = drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let r = 1; r <= MANDALA_RING_COUNT; r++) {
    const alpha = ringAlpha[r];
    if (alpha <= 0.002) continue;

    const img = mandalaImages[MANDALA_IMG_KEY[r]];
    if (!img) continue;

    const burstT   = ringBurst[r] / RING_BURST_LEN;
    const pulse    = 1 + Math.sin(burstT * Math.PI) * 0.12;
    const glowMult = 1 + burstT * 0.6;

    const size = 2 * MANDALA_R[r] * width * pulse;
    const cx   = (MANDALA_CX + MANDALA_RING_EXTRA_OFFSET_X[r]) * width;
    const cy   = (MANDALA_CY + MANDALA_RING_EXTRA_OFFSET_Y[r]) * height;

    ctx.globalAlpha = Math.min(1, alpha * glowMult);
    image(img, cx, cy, size, size);
  }

  ctx.restore();
  pop();
}

// Asset-free visual exploration for the 21-day format. Guides stay visible
// from the first frame; each ring grows warmer as its lamps are completed.
function drawPrototypeMandala() {
  const layout = diyaConfig?.radialLayout;
  if (!layout?.rings) return;

  const cx = (layout.cx ?? 0.5) * width;
  const cy = (layout.cy ?? 0.62) * height;
  const layers = prototypeMandala?.layers || [];
  const hasLayerAssets = layers.some((layer) => mandalaImages[layer.key]);

  if (hasLayerAssets) {
    push();
    imageMode(CENTER);
    for (const layer of layers) {
      const img = mandalaImages[layer.key];
      if (!img) continue;
      const reveal = ringAlpha[layer.ring] || 0;
      const alpha = Math.min(0.92, (layer.baseAlpha ?? 0.2) + reveal * 0.62);
      tint(255, alpha * 255);
      const size = width * (layer.size ?? 0.5);
      image(img, cx, cy, size, size);
    }
    noTint();
    pop();
    return;
  }

  const aspect = width / height;

  const color = prototypeMandala.guideColor || [244, 183, 67];

  push();
  noFill();
  strokeWeight(Math.max(1.2, width * 0.003));
  for (const cfg of layout.rings) {
    const ring = cfg.ring;
    const radius = (cfg.radius ?? 0.2) * width;
    const alpha = ringAlpha[ring] || 0;
    const burst = (ringBurst[ring] || 0) / RING_BURST_LEN;
    const count = cfg.ids?.length || 1;

    stroke(color[0], color[1], color[2], 44 + alpha * 160);
    ellipse(cx, cy, radius * 2, radius * 2);
    for (let i = 0; i < count; i++) {
      const angle = ((cfg.angleOffsetDeg ?? -90) * Math.PI) / 180 + (TWO_PI / count) * i;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      const petalSize = width * (0.046 + burst * 0.012);
      ellipse(x, y, petalSize, petalSize * aspect);
    }
  }
  const centreRadius = width * 0.052;
  stroke(255, 211, 92, 90 + (ringAlpha[4] || 0) * 165);
  ellipse(cx, cy, centreRadius * 2, centreRadius * 2);
  pop();
}

/* -----------------------------------------------------------
   Credits text
----------------------------------------------------------- */

function drawCredits() {
  if (!creditsConfig || !creditsConfig.enabled || !creditsConfig.text) return;
  push();
  fill(creditsConfig.color || "#FFD700");
  noStroke();
  textSize((creditsConfig.fontSize || 16) * canvasScale);
  textFont("Cinzel, Georgia, serif");
  textStyle(NORMAL);
  textAlign(LEFT, BOTTOM);
  text(creditsConfig.text, (creditsConfig.x || 0.36) * width, (creditsConfig.y || 0.97) * height);
  pop();
}

/* -----------------------------------------------------------
   Mouse interaction
----------------------------------------------------------- */

let _tapReleased = true;

function _tapIsOnCanvas(event) {
  if (!event || !event.target) return true;
  return Boolean(canvasEl && event.target === canvasEl.elt);
}

function mouseReleased(event) {
  _tapReleased = true;
  return _tapIsOnCanvas(event) ? false : true;
}

function mousePressed(event) {
  if (!_tapIsOnCanvas(event)) {
    _tapReleased = true;
    return true;
  }

  if (!_tapReleased) return false;
  _tapReleased = false;

  if (isOverlayOpen()) return false;

  for (let d of diyas) {
    if (!d.isHit(mouseX, mouseY)) continue;
    handleDiyaInteraction(d);
    break;
  }

  return false;
}

function isOverlayOpen() {
  return Boolean(revealCardEl || springPopupEl || videoOverlayWrapper);
}

/* ── Global state lock helpers ──
   setAnimationLock(true)  — engaged the instant a lamp starts igniting.
   setAnimationLock(false) — released the instant that lamp's fire animation
   reaches "lit" (see Diya.update()/onLit below), right before its popup opens.
   Also toggles a CSS class on the canvas container as a pointer-events
   fallback, so stray/rapid clicks can't even reach the canvas mid-animation. */
function setAnimationLock(active) {
  isAnimating = active;
  const container = document.getElementById("canvas-container");
  if (container) container.classList.toggle("animation-locked", active);
}

/* ── Shared dispatcher for "what should open after this lamp lights/flares" —
   used by both the first-ignite and re-click paths in handleDiyaInteraction()
   below, so the type→popup mapping only lives in one place. ── */
function getLampExperience(diya, result) {
  if (diya.experience) return diya.experience;
  if (result?.type === "video") return { type: "bonus-video", media: { kind: "video", src: result.src } };
  if (result?.type === "image") return { type: "popup-image", media: { kind: "image", src: result.src } };
  return { type: "info-card", media: diya.cardImage ? { kind: "image", src: diya.cardImage } : null };
}

function openDiyaContent(d, result) {
  const experience = getLampExperience(d, result);
  if (experience.type === "bonus-video") {
    playVideo(experience.media?.src);
    return;
  }
  if (experience.type === "popup-image") {
    showSpringPopup(d, experience.media?.src);
    return;
  }
  if (experience.type === "info-card" || experience.type === "event-card") {
    showInfoCard(d, experience);
    return;
  }
  showInfoCard(d, {
    type: "info-card",
    title: d.theme,
    description: d.description,
    media: d.cardImage ? { kind: "image", src: d.cardImage } : null
  });
}

function handleDiyaInteraction(d) {
  // Guard clause: ignore every click while a lamp's fire animation is
  // still playing, so a fast second click can never interrupt/overlap it.
  if (isAnimating) return;

  if (d.state === "unlit") {
    // In normal calendar mode, days ahead of the current unlock point stay locked.
    if (SEQUENTIAL_UNLOCK_ENABLED && d.id > currentUnlockedDay) {
      d.triggerLocked(); // canvas shake + locked sound
      return;
    }

    // Lock immediately — this diya is about to start its fire animation.
    setAnimationLock(true);

    const result = d.light();

    if (d.id === currentUnlockedDay) {
      currentUnlockedDay = Math.min(currentUnlockedDay + 1, totalDays + 1);
      updateMoonPhase(Math.min(currentUnlockedDay, totalDays));
      updateProgressBadge();
    }

    // Fires exactly once, the frame the flame finishes growing and the
    // diya's state flips from "lighting" → "lit" (Diya.update()). This is
    // the canvas equivalent of an `animationend` listener — release the
    // lock first, then open whatever popup/video/card this lamp triggers.
    d.onLit = () => {
      setAnimationLock(false);
      openDiyaContent(d, result);
    };
    return;
  }

  // Re-click of an already-unlocked lamp (d.id <= currentUnlockedDay, i.e.
  // it has already been lit). Delay the popup/card slightly and play a
  // quick "flare up" flame animation first, so the re-click feels alive
  // rather than opening the content instantly.
  if (d.state === "lit") {
    // isAnimating was already checked at the top of this function — engage
    // the lock now so a spam-click can't interrupt the flare mid-flight.
    setAnimationLock(true);
    showFlameFlare(d);

    setTimeout(() => {
      teardownFlameFlare();
      setAnimationLock(false);
      openDiyaContent(d, d.reopen());
    }, FLAME_FLARE_MS);

    return;
  }
}

/* -----------------------------------------------------------
   Text / cultural reveal card (DOM overlay)
----------------------------------------------------------- */

function getStoryEpisode(experience, diyaId) {
  const chapters = Object.entries(window.DIWALI_EXPERIENCES || {})
    .filter(([, item]) => item.type === "story-video" || item.type === "story-card")
    .map(([day]) => Number(day))
    .sort((a, b) => a - b);
  const index = chapters.indexOf(diyaId);
  return index === -1 ? null : { number: index + 1, total: chapters.length };
}

function getCardMeta(exp, diya) {
  const chapter = getStoryEpisode(exp, diya.id);
  if (chapter) return { label: "The diya's journey", badge: `Chapter ${chapter.number} of ${chapter.total}` };
  if (exp.type === "bonus-video") return { label: "Festival interlude", badge: `Calendar day ${diya.id}` };
  if (exp.type === "event-card") return { label: "Diwali festival day", badge: `Calendar day ${diya.id}` };
  return { label: "Discover Diwali", badge: `Calendar day ${diya.id}` };
}

function showRevealCard(diya, result = null, experience = null) {
  teardownRevealCard();

  const container = document.getElementById("canvas-container");

  dimOverlayEl = document.createElement("div");
  dimOverlayEl.className = "dim-overlay";
  // Only close when the click lands on the backdrop itself, not when it
  // bubbles up from a click inside the card (now a child of the overlay).
  dimOverlayEl.addEventListener("click", (e) => {
    if (e.target === dimOverlayEl) teardownRevealCard();
  });

  revealCardEl = document.createElement("div");
  revealCardEl.className = "reveal-card";
  revealCardEl.setAttribute("role", "dialog");
  revealCardEl.setAttribute("aria-modal", "true");
  revealCardEl.setAttribute("aria-label", diya.theme);

  const exp = experience || getLampExperience(diya, result);
  const media = exp.media || null;
  const isVideo = media?.kind === "video" && media.available !== false;
  const imageSrc = !isVideo ? (media?.kind === "image" ? media.src : media?.poster || diya.cardImage) : null;
  const hasImage = Boolean(imageSrc);
  const isComingSoon = media?.kind === "video" && media.available === false;
  const story = exp.story || diya.story || diya.description;
  const fact = exp.fact || (diya.story ? diya.description : "");
  const hasStoryAndNote = Boolean(story && fact && story !== fact);
  const chapter = getStoryEpisode(exp, diya.id);
  const meta = getCardMeta(exp, diya);
  const title = exp.title || (chapter ? "The Diya's Journey" : diya.theme);
  const revealAfterPlayback = isVideo || isComingSoon;
  if (hasImage) revealCardEl.classList.add("has-image", "image-loading");
  if (isVideo) revealCardEl.classList.add("has-video");
  if (revealAfterPlayback) revealCardEl.classList.add("video-first", "story-details-hidden");
  if (exp.type === "bonus-video") revealCardEl.classList.add("is-bonus-video");

  revealCardEl.innerHTML = `
    <div class="card-header">
      <button class="reveal-card-close" aria-label="Close">×</button>
      ${isVideo ? `<video class="story-card-video" controls playsinline preload="metadata" aria-label="${title} video"><source src="${media.src}" type="video/mp4"></video>` : ""}
      ${hasImage ? '<div class="card-image-photo" role="img" aria-label="' + diya.theme + '"></div><div class="card-image-scrim"></div>' : ""}
      <div class="card-header-info">
        <span class="card-experience-label">${meta.label}</span>
        <span class="card-badge">${diya.emoji} ${meta.badge}</span>
        <div class="card-title">${title}</div>
        <div class="card-divider"></div>
      </div>
    </div>
    <div class="card-body-wrap">
      <div class="card-body">
        ${isVideo ? '<p class="video-stage-copy">Watch the film to unlock this reflection.</p>' : ""}
        ${isVideo ? '<button class="story-skip" type="button">Read the reflection now</button>' : ""}
        <p class="story-copy">${story}</p>
        ${isComingSoon ? '<p class="story-video-placeholder">This chapter is being filmed.</p><button class="story-skip" type="button">Read the chapter</button>' : ""}
        ${isVideo ? '<button class="story-replay" type="button">Replay story</button>' : ""}
        ${hasStoryAndNote ? `<details class="tradition-note"><summary>About this tradition</summary><p>${fact}</p></details>` : ""}
        <button class="story-card-done" type="button">Continue the countdown</button>
      </div>
    </div>
  `;

  revealCardEl.querySelector(".reveal-card-close").addEventListener("click", teardownRevealCard);
  revealCardEl.querySelector(".story-card-done").addEventListener("click", teardownRevealCard);

  const storyVideo = revealCardEl.querySelector(".story-card-video");
  const revealDetails = () => {
    revealCardEl?.classList.remove("story-details-hidden");
    storyVideo?.classList.add("has-finished");
  };
  revealCardEl.querySelectorAll(".story-skip").forEach((button) => {
    button.addEventListener("click", revealDetails);
  });
  if (storyVideo) {
    storyVideo.addEventListener("loadedmetadata", () => {
      if (storyVideo.videoHeight > storyVideo.videoWidth) {
        revealCardEl?.classList.add("has-portrait-video");
      }
    }, { once: true });
    storyVideo.addEventListener("ended", revealDetails, { once: true });
    revealCardEl.querySelector(".story-replay").addEventListener("click", () => {
      storyVideo.currentTime = 0;
      storyVideo.play().catch(() => {});
    });
  }

  container.appendChild(dimOverlayEl);
  // Card lives inside the overlay so the overlay's flexbox centers it.
  dimOverlayEl.appendChild(revealCardEl);

  if (hasImage) {
    const preload = new Image();
    preload.onload = () => {
      const photoEl = revealCardEl && revealCardEl.querySelector(".card-image-photo");
      if (!photoEl) return;
      photoEl.style.backgroundImage = `url("${imageSrc}")`;
      revealCardEl.classList.remove("image-loading");
    };
    preload.onerror = () => {
      if (!revealCardEl) return;
      revealCardEl.classList.remove("has-image", "image-loading");
      revealCardEl.querySelector(".card-image-photo")?.remove();
      revealCardEl.querySelector(".card-image-scrim")?.remove();
    };
    preload.src = imageSrc;
  }

  if (!storyCardKeyboardReady) {
    storyCardKeyboardReady = true;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && revealCardEl) teardownRevealCard();
    });
  }
}

const EASTER_EGG_SPRITES = {
  kalash: "assets/images/easter-eggs/sprites/day-17-kalash.png",
  brassBowl: "assets/images/easter-eggs/sprites/day-17-brass-bowl.png",
  goldCoin: "assets/images/easter-eggs/sprites/day-17-gold-coin.png",
  pinkFlower: "assets/images/easter-eggs/sprites/day-18-pink-flower.png",
  goldSun: "assets/images/easter-eggs/sprites/day-18-gold-sun.png",
  tealLeaf: "assets/images/easter-eggs/sprites/day-18-teal-leaf.png",
  violetLotus: "assets/images/easter-eggs/sprites/day-18-violet-lotus.png",
  rice: "assets/images/easter-eggs/sprites/day-20-rice.png",
  curry: "assets/images/easter-eggs/sprites/day-20-curry.png",
  roti: "assets/images/easter-eggs/sprites/day-20-roti.png",
  mithai: "assets/images/easter-eggs/sprites/day-20-mithai.png",
  braceletThread: "assets/images/easter-eggs/day21/day-21-thread-spool.png",
  braceletBead: "assets/images/easter-eggs/day21/day-21-gold-bead.png",
  braceletCharm: "assets/images/easter-eggs/day21/day-21-lotus-charm.png",
  braceletTassel: "assets/images/easter-eggs/day21/day-21-red-tassel.png",
};

function easterSprite(key, alt) {
  return `<img class="easter-sprite" src="${EASTER_EGG_SPRITES[key]}" alt="${alt}">`;
}

function getEasterEggMarkup(egg) {
  const common = (title, instruction, body) => `
    <div class="easter-game" data-game="${egg.kind}">
      <button class="reveal-card-close" aria-label="Exit card" title="Exit card">×</button>
      <span class="easter-game-kicker">Hidden festival moment</span>
      <h2>${title}</h2>
      <p class="easter-game-instruction">${instruction}</p>
      ${body}
      <p class="easter-game-status" aria-live="polite"></p>
    </div>`;

  if (egg.kind === "auspicious-tray") return common("Auspicious Finds", "Place each festive find on the tray.", `
    <div class="easter-tray">${[["kalash", "Kalash"], ["brassBowl", "Brass bowl"], ["goldCoin", "Gold coin"]].map(([item, label]) => `<span class="tray-slot" data-slot="${item}" aria-label="${label} slot"></span>`).join("")}</div>
    <div class="easter-choice-row">${[["kalash", "Kalash"], ["brassBowl", "Brass bowl"], ["goldCoin", "Gold coin"]].map(([item, label]) => `<button type="button" class="easter-choice image-choice" data-item="${item}" aria-label="Place ${label}">${easterSprite(item, label)}</button>`).join("")}</div>`);
  if (egg.kind === "rangoli-puzzle") {
    const rangoliTiles = [["pinkFlower", "Pink flower"], ["goldSun", "Gold sun"], ["tealLeaf", "Teal leaf"], ["violetLotus", "Violet lotus"]];
    const shuffledTiles = [...rangoliTiles, ...rangoliTiles]
      .sort(() => Math.random() - 0.5);
    return common("Rangoli Memory Match", "Turn over two tiles at a time and find all four matching pairs.", `
      <div class="rangoli-board rangoli-memory-board">${shuffledTiles.map(([sprite, label]) => `<button type="button" class="rangoli-piece memory-tile" data-match="${sprite}" aria-label="Turn over a rangoli tile"><span class="memory-tile-art">${easterSprite(sprite, label)}</span></button>`).join("")}</div>`);
  }
  if (egg.kind === "light-ripple") {
    const diyaImage = '<img src="assets/lamp-items/diyalamp.png" alt="">';
    const rippleDiyas = [[10, 20, 90], [30, 6, 170], [70, 6, 250], [90, 20, 330], [10, 72, 410], [30, 89, 490], [70, 89, 570], [90, 72, 650]];
    return common("The Light Ripple", "Light the centre diya and watch its warmth travel through the Diwali night.", `
      <div class="ripple-courtyard" aria-label="A dark courtyard waiting to be lit">
        <span class="ripple-halo" aria-hidden="true"></span>
        ${rippleDiyas.map(([x, y, delay]) => `<span class="ripple-diya" style="--x:${x}%; --y:${y}%; --delay:${delay}ms" aria-hidden="true">${diyaImage}</span>`).join("")}
        <button type="button" class="ripple-central-diya" aria-label="Light the central diya">${diyaImage}</button>
      </div>`);
  }
  if (egg.kind === "annakut-plate") return common("Build an Annakut Plate", "Add each offering to the festive platter.", `
    <div class="annakut-plate" aria-label="Offering platter"></div>
    <div class="easter-choice-row">${[["rice", "Rice"], ["curry", "Curry"], ["roti", "Roti"], ["mithai", "Mithai"]].map(([item, label]) => `<button type="button" class="easter-choice image-choice" data-item="${item}" aria-label="Add ${label}">${easterSprite(item, label)}</button>`).join("")}</div>`);
  if (egg.kind === "blessing-bracelet") {
    const braceletPieces = [["braceletThread", "Thread spool"], ["braceletBead", "Gold bead"], ["braceletCharm", "Lotus charm"], ["braceletTassel", "Red tassel"]];
    return common("Blessing Bracelet", "Place the spool, pull its loose strand to the gold knot, then finish the bracelet in order.", `
      <div class="bracelet-board" aria-label="Empty blessing bracelet">
        <span class="bracelet-thread" aria-hidden="true"></span>
        <span class="bracelet-knot bracelet-knot-left" aria-hidden="true"></span>
        <span class="bracelet-knot bracelet-knot-right" aria-hidden="true"></span>
        <span class="bracelet-thread-target" aria-hidden="true"></span>
        <button type="button" class="bracelet-strand-handle" disabled aria-label="Drag the loose thread end to the gold knot">✦</button>
        ${braceletPieces.map(([item, label]) => `<span class="bracelet-slot bracelet-slot-${item}" data-slot="${item}" aria-label="${label} position"></span>`).join("")}
      </div>
      <div class="easter-choice-row bracelet-choice-row">${braceletPieces.map(([item, label], index) => `<button type="button" class="easter-choice image-choice bracelet-choice" data-item="${item}" aria-label="Add ${label}"${index ? " disabled" : ""}>${easterSprite(item, label)}</button>`).join("")}</div>`);
  }
  return common("Tilak Blessing", "Tap the marks from top to bottom.", `
    <div class="tilak-board">${[2, 3, 1].map((mark) => `<button type="button" class="tilak-mark" data-mark="${mark}" aria-label="Tilak mark">●</button>`).join("")}</div>`);
}

function makeChoicesDraggable(game, choiceSelector, targetSelector, onDrop) {
  const target = game.querySelector(targetSelector);
  if (!target) return;
  game.querySelectorAll(choiceSelector).forEach((choice) => {
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let pointerActive = false;
    choice.addEventListener("pointerdown", (event) => {
      if (choice.disabled) return;
      startX = event.clientX;
      startY = event.clientY;
      dragging = false;
      pointerActive = true;
      choice.setPointerCapture?.(event.pointerId);
    });
    choice.addEventListener("pointermove", (event) => {
      if (!pointerActive || choice.disabled) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) < 8) return;
      dragging = true;
      choice.classList.add("is-dragging");
      choice.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    });
    choice.addEventListener("pointerup", (event) => {
      if (!pointerActive) return;
      pointerActive = false;
      choice.releasePointerCapture?.(event.pointerId);
      choice.classList.remove("is-dragging");
      choice.style.transform = "";
      if (!dragging || choice.disabled) return;
      choice.dataset.suppressClick = "true";
      const rect = target.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        onDrop(choice);
      }
    });
    choice.addEventListener("pointercancel", () => {
      pointerActive = false;
      choice.classList.remove("is-dragging");
      choice.style.transform = "";
    });
  });
}

function consumeDragClick(button) {
  if (button.dataset.suppressClick !== "true") return false;
  delete button.dataset.suppressClick;
  return true;
}

function initFestivalEasterEgg(cardEl, egg, onComplete) {
  const game = cardEl.querySelector(".easter-game");
  if (!game) return;
  const status = game.querySelector(".easter-game-status");
  let completed = false;
  const complete = (message) => {
    if (completed) return;
    completed = true;
    game.classList.add("is-complete");
    status.textContent = message;
    setTimeout(onComplete, 1100);
  };

  if (egg.kind === "auspicious-tray") {
    const placeItem = (button) => {
      if (completed || button.disabled) return;
      const traySlot = game.querySelector(`.tray-slot[data-slot="${button.dataset.item}"]`);
      traySlot.innerHTML = button.innerHTML;
      traySlot.classList.add("is-filled");
      button.disabled = true;
      if (game.querySelectorAll(".easter-choice:disabled").length === 3) complete("Auspicious wishes gathered.");
    };
    game.querySelectorAll(".easter-choice").forEach((button) => button.addEventListener("click", () => {
      if (!consumeDragClick(button)) placeItem(button);
    }));
    makeChoicesDraggable(game, ".easter-choice", ".easter-tray", placeItem);
    return;
  }

  if (egg.kind === "rangoli-puzzle") {
    let firstTile = null;
    let resolvingPair = false;
    let matches = 0;
    game.querySelectorAll(".rangoli-piece").forEach((button) => button.addEventListener("click", () => {
      if (completed || resolvingPair || button.classList.contains("is-revealed") || button.classList.contains("is-matched")) return;
      button.classList.add("is-revealed");
      button.setAttribute("aria-label", "Rangoli tile revealed");
      if (!firstTile) {
        firstTile = button;
        status.textContent = "Find its matching tile.";
        return;
      }
      if (button.dataset.match === firstTile.dataset.match) {
        button.classList.add("is-matched");
        firstTile.classList.add("is-matched");
        matches += 1;
        firstTile = null;
        if (matches === 4) complete("Every rangoli pair is matched.");
        else status.textContent = `${4 - matches} pair${matches === 3 ? "" : "s"} left.`;
        return;
      }
      const previousTile = firstTile;
      firstTile = null;
      resolvingPair = true;
      status.textContent = "Not a match — remember where they are.";
      setTimeout(() => {
        [previousTile, button].forEach((tile) => {
          tile.classList.remove("is-revealed");
          tile.setAttribute("aria-label", "Turn over a rangoli tile");
        });
        resolvingPair = false;
      }, 750);
    }));
    return;
  }

  if (egg.kind === "light-ripple") {
    const courtyard = game.querySelector(".ripple-courtyard");
    const centralDiya = game.querySelector(".ripple-central-diya");
    centralDiya.addEventListener("click", () => {
      if (completed || courtyard.classList.contains("is-rippling")) return;
      courtyard.classList.add("is-rippling");
      centralDiya.disabled = true;
      status.textContent = "The light is travelling outward…";
      game.querySelectorAll(".ripple-diya").forEach((diya) => {
        setTimeout(() => diya.classList.add("is-lit"), Number.parseInt(diya.style.getPropertyValue("--delay"), 10));
      });
      setTimeout(() => complete("The whole courtyard glows for Diwali."), 900);
    });
    return;
  }

  if (egg.kind === "annakut-plate") {
    const plate = game.querySelector(".annakut-plate");
    const addOffering = (button) => {
      if (completed || button.disabled) return;
      plate.insertAdjacentHTML("beforeend", `<span>${button.innerHTML}</span>`);
      button.disabled = true;
      if (game.querySelectorAll(".easter-choice:disabled").length === 4) complete("Your offering plate is ready.");
    };
    game.querySelectorAll(".easter-choice").forEach((button) => button.addEventListener("click", () => {
      if (!consumeDragClick(button)) addOffering(button);
    }));
    makeChoicesDraggable(game, ".easter-choice", ".annakut-plate", addOffering);
    return;
  }

  if (egg.kind === "blessing-bracelet") {
    const assemblyOrder = ["braceletThread", "braceletBead", "braceletCharm", "braceletTassel"];
    let nextPieceIndex = 0;
    let strandWoven = false;
    const braceletBoard = game.querySelector(".bracelet-board");
    const enablePiece = (item) => {
      const choice = game.querySelector(`.bracelet-choice[data-item="${item}"]`);
      if (choice) choice.disabled = false;
    };
    const placePiece = (button) => {
      if (completed || button.disabled) return;
      if (button.dataset.item !== assemblyOrder[nextPieceIndex]) {
        status.textContent = "Follow the bracelet order shown on the board.";
        return;
      }
      if (nextPieceIndex === 1 && !strandWoven) {
        status.textContent = "First pull the loose strand across to the gold knot.";
        return;
      }
      const slot = game.querySelector(`.bracelet-slot[data-slot="${button.dataset.item}"]`);
      if (!slot) return;
      slot.innerHTML = button.innerHTML;
      slot.classList.add("is-filled");
      button.disabled = true;
      if (nextPieceIndex === 0) {
        nextPieceIndex = 1;
        braceletBoard.classList.add("has-spool");
        const strandHandle = game.querySelector(".bracelet-strand-handle");
        strandHandle.disabled = false;
        status.textContent = "Now drag the loose thread end to the gold knot.";
        return;
      }
      nextPieceIndex += 1;
      if (nextPieceIndex === assemblyOrder.length) complete("Your Bhai Dooj blessing bracelet is complete.");
      else {
        enablePiece(assemblyOrder[nextPieceIndex]);
        status.textContent = `Now add the ${assemblyOrder[nextPieceIndex] === "braceletCharm" ? "lotus charm" : "red tassel"}.`;
      }
    };

    const strandHandle = game.querySelector(".bracelet-strand-handle");
    const strandTarget = game.querySelector(".bracelet-thread-target");
    let strandPointerActive = false;
    let strandStartX = 0;
    let strandStartY = 0;
    let strandDragged = false;
    strandHandle.addEventListener("pointerdown", (event) => {
      if (strandHandle.disabled || completed || strandWoven) return;
      strandPointerActive = true;
      strandDragged = false;
      strandStartX = event.clientX;
      strandStartY = event.clientY;
      strandHandle.setPointerCapture?.(event.pointerId);
    });
    strandHandle.addEventListener("pointermove", (event) => {
      if (!strandPointerActive) return;
      const dx = event.clientX - strandStartX;
      const dy = event.clientY - strandStartY;
      if (Math.hypot(dx, dy) < 8) return;
      strandDragged = true;
      strandHandle.classList.add("is-dragging");
      strandHandle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.12)`;
    });
    strandHandle.addEventListener("pointerup", (event) => {
      if (!strandPointerActive) return;
      strandPointerActive = false;
      strandHandle.releasePointerCapture?.(event.pointerId);
      strandHandle.classList.remove("is-dragging");
      strandHandle.style.transform = "";
      if (!strandDragged) return;
      const targetBounds = strandTarget.getBoundingClientRect();
      const reachedTarget = event.clientX >= targetBounds.left && event.clientX <= targetBounds.right && event.clientY >= targetBounds.top && event.clientY <= targetBounds.bottom;
      if (!reachedTarget) {
        status.textContent = "Pull the glowing thread end onto the gold knot.";
        return;
      }
      strandWoven = true;
      strandHandle.disabled = true;
      braceletBoard.classList.add("is-woven");
      enablePiece("braceletBead");
      status.textContent = "The thread is woven. Add the gold bead next.";
    });
    strandHandle.addEventListener("pointercancel", () => {
      strandPointerActive = false;
      strandHandle.classList.remove("is-dragging");
      strandHandle.style.transform = "";
    });
    game.querySelectorAll(".bracelet-choice").forEach((button) => button.addEventListener("click", () => {
      if (!consumeDragClick(button)) placePiece(button);
    }));
    makeChoicesDraggable(game, ".bracelet-choice", ".bracelet-board", placePiece);
    return;
  }

  let next = 1;
  game.querySelectorAll(".tilak-mark").forEach((button) => button.addEventListener("click", () => {
    if (completed || button.disabled) return;
    if (Number(button.dataset.mark) === next) {
      button.disabled = true;
      button.classList.add("is-placed");
      next += 1;
      if (next === 4) complete("A blessing for the year ahead.");
    } else {
      status.textContent = "Begin with the top mark.";
    }
  }));
}

/* Simple information/event card: background image, title, and one clear
   description. Festival-day cards can also contain a hidden flip-card game. */
function showInfoCard(diya, experience) {
  teardownRevealCard();

  const container = document.getElementById("canvas-container");
  const imageSrc = experience.media?.kind === "image" ? experience.media.src : null;
  const description = experience.description || experience.fact || experience.story || diya.description;
  const diwaliDayNumber = diya.id - festivalStartDay + 1;
  const label = diwaliDayNumber >= 1 && diwaliDayNumber <= 5
    ? `Day ${diwaliDayNumber} of Diwali`
    : `${festivalStartDay - diya.id} days to Diwali`;
  const cardVideo = experience.cardVideo;
  const easterEgg = experience.easterEgg;
  const hasInteractiveBack = Boolean(cardVideo?.src || easterEgg);

  dimOverlayEl = document.createElement("div");
  dimOverlayEl.className = "dim-overlay";
  dimOverlayEl.addEventListener("click", (e) => {
    if (e.target === dimOverlayEl) teardownRevealCard();
  });

  revealCardEl = document.createElement("div");
  revealCardEl.className = "reveal-card info-card";
  if (hasInteractiveBack) revealCardEl.classList.add("video-treasure-card");
  if (imageSrc) revealCardEl.classList.add("has-image", "image-loading");
  else revealCardEl.classList.add("has-placeholder");
  revealCardEl.setAttribute("role", "dialog");
  revealCardEl.setAttribute("aria-modal", "true");
  revealCardEl.setAttribute("aria-label", experience.title || diya.theme);
  const frontFace = `
    <div class="card-header">
      <button class="reveal-card-close" aria-label="Close">×</button>
      ${imageSrc ? '<div class="card-image-photo" role="img" aria-label="' + (experience.title || diya.theme) + '"></div><div class="card-image-scrim"></div>' : '<div class="info-card-placeholder">✦</div>'}
      <div class="card-header-info">
        <span class="card-experience-label">${label}</span>
        <div class="card-title">${experience.title || diya.theme}</div>
        <div class="card-divider"></div>
      </div>
    </div>
    <div class="card-body-wrap"><div class="card-body"><p class="story-copy">${description}</p>${hasInteractiveBack ? `<button class="card-video-treasure" type="button" aria-label="${easterEgg?.label || cardVideo?.label || "Play hidden video"}"><span aria-hidden="true">${easterEgg?.icon || "🎁"}</span></button>` : ""}</div></div>
  `;
  const easterEggFace = () => easterEgg
    ? `<div class="card-flip-face card-flip-back card-game-back">${getEasterEggMarkup(easterEgg)}</div>`
    : "";
  const backFace = cardVideo?.src ? `
    <div class="card-flip-face card-flip-back">
      <video class="card-flip-video" controls playsinline preload="metadata" aria-label="${experience.title || diya.theme} video"><source src="${cardVideo.src}" type="video/mp4"></video>
    </div>
  ` : easterEggFace();
  revealCardEl.innerHTML = hasInteractiveBack
    ? `<div class="card-flip-stage"><div class="card-flip-face card-flip-front">${frontFace}</div>${backFace}</div>`
    : frontFace;
  // Delegate closing so the control keeps working after a replay replaces
  // the game face with fresh markup.
  revealCardEl.addEventListener("click", (event) => {
    if (event.target.closest(".reveal-card-close")) teardownRevealCard();
  });
  container.appendChild(dimOverlayEl);
  dimOverlayEl.appendChild(revealCardEl);

  const treasureButton = revealCardEl.querySelector(".card-video-treasure");
  const flipVideo = revealCardEl.querySelector(".card-flip-video");
  if (treasureButton && hasInteractiveBack) {
    let isFlipping = false;
    const resetEasterEgg = () => {
      if (!easterEgg || !revealCardEl) return;
      const completedGameFace = revealCardEl.querySelector(".card-game-back");
      if (!completedGameFace) return;
      completedGameFace.outerHTML = easterEggFace();
      initFestivalEasterEgg(revealCardEl, easterEgg, turnToFront);
    };
    const turnToFront = () => {
      if (isFlipping || !revealCardEl) return;
      isFlipping = true;
      flipVideo?.pause();
      revealCardEl.classList.remove("is-video-flipped");
      revealCardEl.addEventListener("transitionend", () => {
        isFlipping = false;
        resetEasterEgg();
      }, { once: true });
    };
    treasureButton.addEventListener("click", () => {
      if (isFlipping) return;
      isFlipping = true;
      revealCardEl.classList.add("is-video-flipped");
      revealCardEl.addEventListener("transitionend", () => {
        isFlipping = false;
        if (flipVideo) {
          flipVideo.currentTime = 0;
          flipVideo.play().catch(() => {});
        }
      }, { once: true });
    });
    flipVideo?.addEventListener("ended", turnToFront);
    if (easterEgg) initFestivalEasterEgg(revealCardEl, easterEgg, turnToFront);
  }

  if (imageSrc) {
    const preload = new Image();
    preload.onload = () => {
      const photoEl = revealCardEl?.querySelector(".card-image-photo");
      if (!photoEl) return;
      photoEl.style.backgroundImage = `url("${imageSrc}")`;
      revealCardEl.classList.remove("image-loading");
    };
    preload.onerror = () => {
      if (!revealCardEl) return;
      revealCardEl.classList.remove("has-image", "image-loading");
      revealCardEl.classList.add("has-placeholder");
      revealCardEl.querySelector(".card-image-photo")?.replaceWith(Object.assign(document.createElement("div"), { className: "info-card-placeholder", textContent: "✦" }));
      revealCardEl.querySelector(".card-image-scrim")?.remove();
    };
    preload.src = imageSrc;
  }
}

function teardownRevealCard() {
  const video = revealCardEl?.querySelector("video");
  if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  if (revealCardEl) { revealCardEl.remove(); revealCardEl = null; }
  if (dimOverlayEl) { dimOverlayEl.remove(); dimOverlayEl = null; }
}

/* -----------------------------------------------------------
   Spring popup — jack-in-the-box image reveal
----------------------------------------------------------- */

function showSpringPopup(diya, imageSrc) {
  if (!imageSrc) return;
  teardownSpringPopup();

  const imgSrc     = imageSrc;
  const canvasRect = canvasEl.elt.getBoundingClientRect();

  // Explicit scale: p5 logical coordinates → actual rendered viewport pixels.
  // This is robust even if CSS overrides the canvas element's dimensions.
  const scaleX = canvasRect.width  / width;
  const scaleY = canvasRect.height / height;

  // Lamp bounds in viewport pixels (for position: fixed).
  const lampL = canvasRect.left + diya.px() * scaleX;
  const lampT = canvasRect.top  + diya.py() * scaleY;
  const lampW = diya.pw() * scaleX;
  const lampH = diya.ph() * scaleY;

  // Popup: 2.5× the rendered lamp height (~150–200 px on typical screens).
  const SIZE = Math.round(lampH * 2.5);

  // Center the popup exactly on the lamp centre.
  // transform-origin: center center makes the spring animation grow from there.
  const popupL = lampL + lampW / 2 - SIZE / 2;
  const popupT = lampT + lampH / 2 - SIZE / 2;

  springPopupEl = document.createElement("div");
  springPopupEl.className = "spring-popup";
  springPopupEl.style.width  = `${SIZE}px`;
  springPopupEl.style.height = `${SIZE}px`;
  springPopupEl.style.left   = `${popupL}px`;
  springPopupEl.style.top    = `${popupT}px`;
  // Tapping the popup dismisses it early instead of waiting out the full
  // auto-dismiss timer (see dismissSpringPopup()).
  springPopupEl.addEventListener("click", dismissSpringPopup);

  const img = document.createElement("img");
  img.loading = "lazy"; // not needed on initial paint — only fetched once a lamp is clicked
  img.src = imgSrc;
  img.alt = `Day ${diya.id} surprise`;
  springPopupEl.appendChild(img);

  if (diya.experience?.foundLabel) {
    const foundLabel = document.createElement("div");
    foundLabel.className = "popup-found-label";
    foundLabel.textContent = diya.experience.foundLabel;
    springPopupEl.appendChild(foundLabel);
  }

  // Append to body so position:fixed coordinates are always in viewport space,
  // unaffected by any transforms on ancestor elements.
  document.body.appendChild(springPopupEl);

  springPopupTimer = setTimeout(dismissSpringPopup, 10000);
}

function dismissSpringPopup() {
  if (!springPopupEl) return;
  if (springPopupTimer) { clearTimeout(springPopupTimer); springPopupTimer = null; }
  springPopupEl.classList.add("spring-popup-out");
  // Remove from DOM once the exit animation finishes.
  const el = springPopupEl;
  el.addEventListener("animationend", () => el.remove(), { once: true });
  springPopupEl = null;
}

function teardownSpringPopup() {
  if (springPopupTimer) { clearTimeout(springPopupTimer); springPopupTimer = null; }
  if (springPopupEl)    { springPopupEl.remove(); springPopupEl = null; }
}

/* -----------------------------------------------------------
   Flame "flare up" — re-click micro-interaction
   The flame itself is canvas-rendered (see Diya.drawFlame), so this
   creates a small DOM glow overlay positioned over the lamp's wick tip
   (same viewport-sync technique as showSpringPopup) and toggles the
   .is-flaring class to play the CSS flame-burst keyframe animation.
----------------------------------------------------------- */

function showFlameFlare(diya) {
  teardownFlameFlare();

  const canvasRect = canvasEl.elt.getBoundingClientRect();
  const scaleX = canvasRect.width  / width;
  const scaleY = canvasRect.height / height;

  const wick      = diya.getWickTip();
  const w         = diya.pw();
  // Mirrors the flame geometry in Diya.drawLit()/drawFlame(): the flame
  // sprite's visual center sits a bit above the wick tip.
  const flameSize   = diya.special ? w * 0.46 : w * 0.30;
  const centerX     = wick.x;
  const centerY     = wick.y - flameSize * 1.05;
  const diameter    = flameSize * 3.2;

  flameFlareEl = document.createElement("div");
  flameFlareEl.className = "flame-flare";
  flameFlareEl.style.width  = `${diameter * scaleX}px`;
  flameFlareEl.style.height = `${diameter * scaleY}px`;
  flameFlareEl.style.left   = `${canvasRect.left + centerX * scaleX}px`;
  flameFlareEl.style.top    = `${canvasRect.top  + centerY * scaleY}px`;

  document.body.appendChild(flameFlareEl);

  // Force a style recalculation so the animation always (re)starts cleanly.
  void flameFlareEl.offsetWidth;
  flameFlareEl.classList.add("is-flaring");
}

// Caller (handleDiyaInteraction) owns the FLAME_FLARE_MS setTimeout and
// invokes this once the animation has finished playing.
function teardownFlameFlare() {
  if (flameFlareEl) { flameFlareEl.remove(); flameFlareEl = null; }
}

/* -----------------------------------------------------------
   Native video player — simple modal overlay, singleton DOM,
   reused per playback. All playback UI (seek, volume, fullscreen)
   is delegated entirely to the browser's native <video controls>.
----------------------------------------------------------- */

function initVideoPlayer() {
  if (videoPlayerContainer) return;

  // ── Modal overlay wrapper — pure black backdrop, centers its content ──
  videoPlayerContainer = document.createElement("div");
  videoPlayerContainer.className = "video-modal-overlay";
  videoPlayerContainer.style.display = "none";
  videoPlayerContainer.setAttribute("role", "dialog");
  videoPlayerContainer.setAttribute("aria-modal", "true");
  videoPlayerContainer.setAttribute("aria-label", "Video player");

  // ── Native <video> — browser supplies all playback/seek/fullscreen UI ──
  videoPlayerEl = document.createElement("video");
  videoPlayerEl.className = "native-video-player";
  // No src is ever assigned until a lamp is actually clicked (see playVideo()),
  // and preload="none" makes sure the browser doesn't eagerly buffer any of
  // the 5 videos on page load — all 15 days' heavy assets stay lazy.
  videoPlayerEl.setAttribute("preload", "none");
  videoPlayerEl.setAttribute("controls", "");
  videoPlayerEl.setAttribute("playsinline", "");
  videoPlayerEl.setAttribute("autoplay", "");
  videoPlayerEl.controls    = true;
  videoPlayerEl.playsInline = true;
  videoPlayerEl.autoplay    = true;
  videoPlayerEl.muted       = true;
  videoPlayerEl.onended = () => {
    videoPlayerHint.textContent = "Video finished — drag the progress bar or press play to watch again.";
    videoPlayerHint.hidden = false;
  };

  // ── Close ("X") button — top-right corner, always visible ──
  // Restore the original player lifecycle: it closes when the video ends.
  videoPlayerEl.onended = exitVideo;
  videoPlayerEl.muted = false;
  const closeBtn = document.createElement("button");
  closeBtn.className = "video-modal-close";
  closeBtn.setAttribute("aria-label", "Close video");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", exitVideo);

  // Clicking the black backdrop itself (not the video/button) also closes.
  videoPlayerContainer.addEventListener("click", (e) => {
    if (e.target === videoPlayerContainer) exitVideo();
  });

  // ESC closes whichever overlay is currently on top (video > reveal card >
  // spring popup), mirroring the existing backdrop-click / tap-to-dismiss
  // behaviour for each. Registered once here since initVideoPlayer() itself
  // is only ever called once (guarded by the early-return above).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (videoOverlayWrapper)   exitVideo();
    else if (revealCardEl)     teardownRevealCard();
    else if (springPopupEl)    dismissSpringPopup();
  });

  videoPlayerHint = document.createElement("p");
  videoPlayerHint.className = "video-player-hint";
  videoPlayerHint.textContent = "Playing muted — use the player controls to turn on sound.";

  videoPlayerEl.addEventListener("error", () => {
    videoPlayerHint.textContent = "This video could not load. Please check the MP4 file and try again.";
    videoPlayerHint.hidden = false;
  });

  videoPlayerContainer.appendChild(videoPlayerEl);
  videoPlayerContainer.appendChild(videoPlayerHint);
  videoPlayerContainer.appendChild(closeBtn);
  document.body.appendChild(videoPlayerContainer);
}

/* ── Clean exit: pause, dump src, hide overlay ── */
function exitVideo() {
  if (videoPlayerEl) {
    videoPlayerEl.pause();
    videoPlayerEl.src = "";
    videoPlayerEl.load();
  }
  if (videoPlayerContainer) videoPlayerContainer.style.display = "none";
  videoOverlayWrapper = null;
}

/* ── Show the player, set src, and begin playback ── */
function playVideo(src) {
  teardownRevealCard();
  teardownSpringPopup();   // dismiss any active 3D popup so it can't overlap the video
  initVideoPlayer();

  videoPlayerEl.muted = true;
  videoPlayerHint.textContent = "Playing muted — use the player controls to turn on sound.";
  videoPlayerHint.hidden = false;
  videoPlayerEl.preload = "auto";
  videoPlayerEl.muted = false;
  videoPlayerHint.hidden = true;
  videoPlayerEl.preload = "none";
  videoPlayerEl.src = src;
  videoPlayerEl.load();
  videoPlayerContainer.style.display = "flex";
  videoOverlayWrapper = videoPlayerContainer;

  const p = videoPlayerEl.play();
  if (p && typeof p.then === "function") {
    p.catch(() => { /* autoplay blocked — user can tap the native play button */ });
  }
}

function teardownVideoOverlay() {
  exitVideo();
}

/* -----------------------------------------------------------
   Radial / Petal lamp placement
   Reads the `radialLayout` block from the JSON config and overrides
   each Diya's x/y to sit on the mandala petals via polar coordinates.
   Layout layers are keyed by day ID (not unlock order): outer 1–10,
   middle 11/12/14/15, center 13. Chronological unlock (currentUnlockedDay)
   is unchanged. Ring lamps get a small seeded "petal jitter";
   the centre lamp does not. The lamp's w/h from `pos` are always preserved.

   Geometry notes
   ─────────────
   • cx / cy      — mandala visual centre (fractions of canvas w & h).
   • outerRadius  — fraction of canvas WIDTH; same pixel offset used for
                    both x and y by scaling the y component by (width/height)
                    so the ring is a true circle in pixel space, not an ellipse.
   • angleOffset  — 0° = 3 o'clock, -90° = 12 o'clock (top of canvas).
   • jitterPx     — maximum stable pixel nudge on each axis, converted to
                    the matching fraction so it scales with the canvas.
   • positionSeed — changing this number creates one new, repeatable layout.
----------------------------------------------------------- */

// Produces the same 0–1 value for a given seed/key pair. This deliberately
// avoids Math.random(), so a reload (or canvas resize) never rearranges lamps.
function seededLayoutUnit(seed, key) {
  let value = (Number(seed) || 1) >>> 0;
  const text = String(key);
  for (let i = 0; i < text.length; i++) {
    value = Math.imul(value ^ text.charCodeAt(i), 0x45d9f3b) >>> 0;
    value ^= value >>> 16;
  }
  return (value >>> 0) / 0x100000000;
}

function computeRadialPositions(rl, diyasList) {
  const radCX = rl.cx ?? MANDALA_CX;
  const radCY = rl.cy ?? (MANDALA_CY + (MANDALA_RING_EXTRA_OFFSET_Y[1] || 0));

  const outerCfg  = rl.outer  || {};
  const middleCfg = rl.middle || {};
  const jitterPx  = rl.jitterPx ?? 20;
  const positionSeed = rl.positionSeed ?? 20260731;

  const stableJitter = (id, axisSize, axis) =>
    (seededLayoutUnit(positionSeed, `${id}-${axis}`) * 2 - 1) * (jitterPx / axisSize);

  const outerRadius     = outerCfg.radius          ?? 0.32;
  const outerOffsetRad  = ((outerCfg.angleOffsetDeg  ?? -90) * Math.PI) / 180;

  const middleRadius    = middleCfg.radius         ?? 0.13;
  const middleOffsetRad = ((middleCfg.angleOffsetDeg ?? 45) * Math.PI) / 180;

  // Layout grouping is independent of chronological unlock order (1→15).
  // Day 13 (main Diwali) sits dead-centre; 14 & 15 remain on the middle ring.
  const outerLamps  = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const middleLamps = [11, 12, 14, 15];
  const centerLamp  = 13;

  const byId = Object.fromEntries(diyasList.map((d) => [d.id, d]));

  // New layouts declare their rings explicitly, making the placement scale to
  // any number of days without changing this engine again.
  if (Array.isArray(rl.rings)) {
    const ringAspect = width / height;
    for (const ring of rl.rings) {
      const ids = ring.ids || [];
      const radius = ring.radius ?? 0.2;
      const offset = ((ring.angleOffsetDeg ?? -90) * Math.PI) / 180;
      ids.forEach((id, i) => {
        const d = byId[id];
        if (!d) return;
        const angle = offset + (TWO_PI / ids.length) * i;
        const jx = stableJitter(id, width, "x");
        const jy = stableJitter(id, height, "y");
        d.x = radCX + radius * Math.cos(angle) - d.w / 2 + jx;
        d.y = radCY + radius * ringAspect * Math.sin(angle) - d.h / 2 + jy;
      });
    }
    const center = byId[rl.centerId];
    if (center) {
      center.x = radCX - center.w / 2;
      center.y = radCY - center.h / 2;
    }
    return;
  }

  // The radius is expressed as a fraction of canvas WIDTH. To keep the ring
  // circular in pixel space on a non-square canvas, scale the y-component by
  // (width / height) so that one unit of radius = the same number of pixels
  // in both axes.
  const aspect = width / height;

  // ── Outer ring (lamps 1–10) ──────────────────────────────────────────────
  outerLamps.forEach((id, i) => {
    const d = byId[id];
    if (!d) return;
    const angle = outerOffsetRad + (TWO_PI / outerLamps.length) * i;
    const jx    = stableJitter(id, width, "x");
    const jy    = stableJitter(id, height, "y");
    // Centre of the petal → then shift by -w/2, -h/2 to get the top-left corner
    d.x = radCX + outerRadius          * Math.cos(angle) - d.w / 2 + jx;
    d.y = radCY + outerRadius * aspect * Math.sin(angle) - d.h / 2 + jy;
  });

  // ── Middle ring (lamps 11, 12, 14, 15) ────────────────────────────────────
  middleLamps.forEach((id, i) => {
    const d = byId[id];
    if (!d) return;
    const angle = middleOffsetRad + (TWO_PI / middleLamps.length) * i;
    const jx    = stableJitter(id, width, "x");
    const jy    = stableJitter(id, height, "y");
    d.x = radCX + middleRadius          * Math.cos(angle) - d.w / 2 + jx;
    d.y = radCY + middleRadius * aspect * Math.sin(angle) - d.h / 2 + jy;
  });

  // ── Centre lamp (lamp 13 — main Diwali) — dead-centre, no jitter ─────────
  const center = byId[centerLamp];
  if (center) {
    center.x = radCX - center.w / 2;
    center.y = radCY - center.h / 2;
  }
}

/* -----------------------------------------------------------
   Config hydration
----------------------------------------------------------- */

function hydrateDiyas(data) {
  if (!data || !Array.isArray(data.diyas)) {
    console.error("Diwali config missing or malformed — expected data.diyas array.");
    return;
  }

  creditsConfig = data.credits || null;
  totalDays = data.diyas.length;
  festivalStartDay = Number(data.festivalStartDay) || Math.max(1, totalDays - 4);
  mainDiwaliDay = Number(data.mainDiwaliDay) || festivalStartDay + 2;
  prototypeMandala = data.prototypeMandala || null;
  MANDALA_RING_COUNT = Math.max(...data.diyas.map((d) => Number(d.ring) || 1));
  ringDiyas = {};
  ringAlpha = {};
  ringBurst = {};
  ringWasDone = {};
  for (let ring = 1; ring <= MANDALA_RING_COUNT; ring++) {
    ringDiyas[ring] = [];
    ringAlpha[ring] = 0;
    ringBurst[ring] = 0;
    ringWasDone[ring] = false;
  }

  // Read mandala geometry from flat config block
  const m = data.mandala || {};
  MANDALA_CX = m.cx ?? 0.5;
  MANDALA_CY = m.cy ?? 0.70;
  if (m.radii) {
    MANDALA_R = { 1: +m.radii["1"], 2: +m.radii["2"], 3: +m.radii["3"] };
  }
  MANDALA_RING_EXTRA_OFFSET_X = m.ringExtraOffsetX
    ? { 1: +m.ringExtraOffsetX["1"] || 0, 2: +m.ringExtraOffsetX["2"] || 0, 3: +m.ringExtraOffsetX["3"] || 0 }
    : { 1: 0, 2: 0, 3: 0 };
  MANDALA_RING_EXTRA_OFFSET_Y = m.ringExtraOffsetY
    ? { 1: +m.ringExtraOffsetY["1"] || 0, 2: +m.ringExtraOffsetY["2"] || 0, 3: +m.ringExtraOffsetY["3"] || 0 }
    : { 1: 0, 2: 0, 3: 0 };

  scrollBanner = new ScrollBanner(data.scrollBanner || {}, scrollBannerImg);
  if (data.banner) scrollBanner.applyLayout(data.banner);
  window.scrollBanner = scrollBanner;

  diyas = data.diyas.map((cfg) => new Diya(cfg, diyaImages, openSound, lockedSound, flameFrames));

  // Global lamp-size multiplier (see "lampScale" in diwali_days.json).
  // Applied right after construction — before ring bucketing/radial layout —
  // so every downstream calculation (hit-testing, flame/glow size, radial
  // centering) already sees the final scaled w/h. Each lamp's own midpoint
  // is preserved so scaling grows/shrinks it in place rather than shifting
  // it toward its top-left corner.
  const lampScale = Number(data.lampScale) > 0 ? Number(data.lampScale) : 1;
  if (lampScale !== 1) {
    for (const d of diyas) {
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      d.w *= lampScale;
      d.h *= lampScale;
      d.x = cx - d.w / 2;
      d.y = cy - d.h / 2;
    }
  }

  for (const d of diyas) {
    if (!ringDiyas[d.ring]) ringDiyas[d.ring] = [];
    ringDiyas[d.ring].push(d);
  }

  // Override x/y positions with radial/petal geometry when the config block exists.
  // pos.w and pos.h (already lamp-scaled above) are always preserved.
  if (data.radialLayout) computeRadialPositions(data.radialLayout, diyas);
}

function collectImagePayloads(config) {
  if (!config || !Array.isArray(config.diyas)) return [];
  const seen = new Set();
  for (const d of config.diyas) {
    const p = d?.payload;
    if (typeof p !== "string") continue;
    if (p.startsWith("mp4:") || p === "text") continue;
    seen.add(p);
  }
  return Array.from(seen);
}

function resolveImagePath(payload) {
  if (!payload || payload.startsWith("mp4:") || payload === "text") return null;
  if (payload.startsWith("assets/") || payload.startsWith("./assets/")) return payload;
  return `assets/${payload}.png`;
}

/* -----------------------------------------------------------
   Floating ember particles (upward, warm golden)
----------------------------------------------------------- */

function initEmbers() {
  rebuildEmbers();
}

function drawEmbers() {
  const litCount = diyas.filter((d) => d.isLit()).length;
  const intensityRatio = 0.15 + (litCount / Math.max(diyas.length, 1)) * 0.85;

  noStroke();
  for (let e of embers) {
    const a = e.baseAlpha * (0.5 + Math.sin(frameCount * 0.08 + e.phase) * 0.5) * intensityRatio;
    fill(255, 160 + e.warmth, 10, a * 220);
    ellipse(e.x, e.y, e.size);

    e.y -= e.speed;
    e.x += Math.sin(frameCount * 0.05 + e.phase) * 0.4;

    if (e.y < -e.size) {
      e.y = height + random(30);
      e.x = random(width);
    }
  }
}

function rebuildEmbers() {
  embers = [];
  const count = Math.max(60, Math.round(120 * (canvasScale || 1)));
  for (let i = 0; i < count; i++) {
    embers.push({
      x:         random(width),
      y:         random(height),
      speed:     random(0.35, 1.4),
      size:      random(2, 5),
      warmth:    random(0, 95),
      baseAlpha: random(0.35, 1.0),
      phase:     random(TWO_PI),
    });
  }
}
