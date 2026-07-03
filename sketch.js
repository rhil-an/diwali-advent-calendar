/* -----------------------------------------------------------
   Diwali Countdown Calendar — Main Engine
   - Loads background + config
   - Manages 15 Diya instances
   - Floating ember particles (replace snow)
   - Progressive amber scene brightness as diyas are lit
   - Text card DOM overlay for cultural content
   - Video popup (same approach as advent-calendar)
----------------------------------------------------------- */

let bg;                 // the active layout's background (points at one of the two below)
let bgLandscape;
let bgPortrait;
let activeLayoutName = "landscape";
let diyas       = [];
let diyaImages  = {};
let flameFrames = [];
let openSound;
let lockedSound;
let diyaConfig  = null;
let creditsConfig = null;

// Title scroll banner — dynamic canvas object, editable via config or setText()
let scrollBanner = null;
let scrollBannerImg = null; // banner artwork, separate image asset from the scene background

// Mandala — 3 concentric layers that bloom into view as each ring of
// diyas is completed (ring 1 = outer/10, ring 2 = middle/4, ring 3 = center/1)
let mandalaImages = {};
const MANDALA_RING_COUNT = 3;
let ringDiyas   = { 1: [], 2: [], 3: [] };
let ringAlpha   = { 1: 0, 2: 0, 3: 0 };   // smoothed 0-1 display alpha per ring
let ringBurst   = { 1: 0, 2: 0, 3: 0 };   // frames remaining in "just completed" glow pulse
let ringWasDone = { 1: false, 2: false, 3: false };

// Video overlay
let videoElement        = null;
let videoOverlayWrapper = null;

// Text/reveal card
let revealCardEl  = null;
let dimOverlayEl  = null;

// Embers
let embers     = [];
let canvasEl   = null;
let canvasScale = 1;

// Mobile detection — drives performance budgets and cover-fill scaling
const isMobile = (() => {
  try { return navigator.maxTouchPoints > 0 || /Mobi/i.test(navigator.userAgent); }
  catch (_) { return false; }
})();

// Offscreen background cache — pre-scales source JPEG once; blitted 1:1 every frame
let bgCache      = null;
let bgCacheDirty = true;

function preload() {
  const cb = Date.now();
  diyaConfig = loadJSON("assets/diwali_days.json?v=" + cb);
  // Both background variants are preloaded so switching orientation is instant.
  bgLandscape = loadImage("images/advent-background.jpg?v=" + cb);
  bgPortrait  = loadImage("images/advent-background-portrait.jpg?v=" + cb);
  bg = bgLandscape;
  scrollBannerImg = loadImage(`assets/banner/title-banner.png?v=${cb}`);

  mandalaImages.outer  = loadImage(`assets/mandala/mandala-outer.png?v=${cb}`);
  mandalaImages.middle = loadImage(`assets/mandala/mandala-middle.png?v=${cb}`);
  mandalaImages.center = loadImage(`assets/mandala/mandala-center.png?v=${cb}`);

  // Pre-load any image payloads
  const imgPayloads = collectImagePayloads(diyaConfig);
  imgPayloads.forEach((p) => {
    const path = resolveImagePath(p);
    if (path) diyaImages[p] = loadImage(path);
  });

  // Pre-load flame flipbook frames (each diya plays these back in its own randomized order)
  for (let i = 1; i <= 8; i++) {
    const n = String(i).padStart(2, "0");
    flameFrames.push(loadImage(`assets/flame/flame_${n}.png?v=${cb}`));
  }

  // Audio — fail silently if files missing
  openSound   = new Audio("assets/open.mp3");
  lockedSound = new Audio("assets/locked.mp3");
  openSound.addEventListener("error",   () => { openSound   = null; });
  lockedSound.addEventListener("error", () => { lockedSound = null; });
}

function setup() {
  activeLayoutName = chooseLayoutName();

  let c = createCanvas(10, 10);   // real size is set by applyLayout()/resizeToViewport()
  canvasEl = c;
  c.parent("canvas-container");
  pixelDensity(isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  frameRate(isMobile ? 30 : 60);

  if (diyaConfig) {
    ensureImagesLoaded(diyaConfig);
    hydrateDiyas(diyaConfig);
    applyLayout(activeLayoutName);
  } else {
    loadJSON("assets/diwali_days.json?v=" + Date.now(), (data) => {
      diyaConfig = data;
      ensureImagesLoaded(data);
      hydrateDiyas(data);
      applyLayout(activeLayoutName);
      resizeToViewport();
    });
  }

  resizeToViewport();
  initEmbers();
}

/* -----------------------------------------------------------
   Responsive layout selection (landscape vs portrait)
----------------------------------------------------------- */

// Portrait layout kicks in when the viewport is taller than it is wide
// (aspect ratio below the configured breakpoint, default 1.0).
function chooseLayoutName() {
  const bp = (diyaConfig && diyaConfig.layoutBreakpoint) || 1.0;
  return (windowWidth / windowHeight) < bp ? "portrait" : "landscape";
}

// Swaps the whole scene to a layout variant: background image, mandala
// geometry, banner placement, credits, and every diya's position — all by id,
// so lit/unlit state is preserved across the switch.
function applyLayout(name) {
  if (!diyaConfig || !diyaConfig.layouts || !diyaConfig.layouts[name]) return;
  activeLayoutName = name;
  const L = diyaConfig.layouts[name];

  bg = name === "portrait" ? bgPortrait : bgLandscape;
  bgCacheDirty = true;

  const m = L.mandala || {};
  MANDALA_CX    = m.cx ?? 0.5;
  MANDALA_CY    = m.cy ?? 0.60;
  MANDALA_SCALE = m.scale ?? 1.25;
  WHEEL_OFFSET_Y = L.wheelOffsetY ?? 0;
  if (m.radii) {
    MANDALA_R = { 1: +m.radii["1"], 2: +m.radii["2"], 3: +m.radii["3"] };
  }
  MANDALA_RING_EXTRA_OFFSET_Y = m.ringExtraOffsetY
    ? { 1: +m.ringExtraOffsetY["1"] || 0, 2: +m.ringExtraOffsetY["2"] || 0, 3: +m.ringExtraOffsetY["3"] || 0 }
    : { 1: 0, 2: 0, 3: 0 };

  for (const d of diyas) d.setPosition(name);

  if (scrollBanner) scrollBanner.applyLayout(L.banner || {});

  if (creditsConfig && L.credits) {
    creditsConfig.x        = L.credits.x ?? creditsConfig.x;
    creditsConfig.y        = L.credits.y ?? creditsConfig.y;
    creditsConfig.fontSize = L.credits.fontSize ?? creditsConfig.fontSize;
  }
}

// Re-evaluate which layout the current viewport wants, switch if needed, then re-fit.
function handleViewportChange() {
  const want = chooseLayoutName();
  if (want !== activeLayoutName) applyLayout(want);
  resizeToViewport();
}

function draw() {
  if (!bg) return;

  clear();
  if (!bgCache || bgCacheDirty) buildBgCache();
  if (bgCache) image(bgCache, 0, 0);
  else         image(bg, 0, 0, width, height);

  if (scrollBanner) scrollBanner.draw();

  updateMandalaReveal();
  drawMandalaLayers();

  drawSceneBrightness();
  drawCredits();
  drawEmbers();

  for (let d of diyas) {
    d.update();
    d.draw();
  }
}

function windowResized() {
  handleViewportChange();
}

// iOS/Safari report stale window dimensions immediately after a rotation,
// so re-evaluate the layout + re-fit again shortly after it settles.
window.addEventListener("orientationchange", () => setTimeout(handleViewportChange, 200));

function resizeToViewport() {
  if (!bg) return;
  // Mobile uses cover scaling (fills viewport edge-to-edge, clipping the image edges).
  // Desktop uses contain scaling (letterboxes to preserve the full scene).
  const scale = isMobile
    ? Math.max(windowWidth / bg.width, windowHeight / bg.height)
    : Math.min(windowWidth / bg.width, windowHeight / bg.height);
  canvasScale = scale;
  const newW = Math.max(1, Math.round(bg.width  * scale));
  const newH = Math.max(1, Math.round(bg.height * scale));
  resizeCanvas(newW, newH);
  bgCacheDirty = true;
  if (canvasEl && canvasEl.elt) {
    canvasEl.elt.style.width  = `${newW}px`;
    canvasEl.elt.style.height = `${newH}px`;
  }
  rebuildEmbers();
}

function buildBgCache() {
  if (!bg) return;
  if (bgCache) bgCache.remove();
  bgCache = createGraphics(width, height);
  bgCache.image(bg, 0, 0, width, height);
  bgCacheDirty = false;
}

/* -----------------------------------------------------------
   Amber scene brightness — grows as more diyas are lit
----------------------------------------------------------- */

function drawSceneBrightness() {
  const litCount = diyas.filter((d) => d.isLit()).length;
  if (litCount === 0) return;

  const ratio = litCount / Math.max(diyas.length, 1);

  const ctx  = drawingContext;
  const grad = ctx.createLinearGradient(0, height, 0, 0);
  const maxA = 0.28 * ratio;

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
   Mandala reveal — 3 concentric layers bloom into color as each
   ring of diyas (outer 10 / middle 4 / center 1) is completed
----------------------------------------------------------- */

// These are set per active layout by applyLayout() (see layouts in diwali_days.json).
// Defaults mirror the landscape layout so the scene renders even before a layout applies.
let MANDALA_CX = 0.5;
let MANDALA_CY = 0.60;
// Nudges the whole diya wheel + mandala bloom down together (fraction of canvas height),
// without disturbing their relative alignment.
let WHEEL_OFFSET_Y = 0.0736;
// Extra per-ring vertical nudge (fraction of canvas height) for the mandala image layers only.
let MANDALA_RING_EXTRA_OFFSET_Y = { 1: 0, 2: -0.01, 3: -0.01 };
// Radii as a fraction of the canvas width, so they scale at any viewport size.
let MANDALA_R  = { 1: 280 / 1536, 2: 105 / 1536, 3: 40 / 1536 };
// Blows up each mandala layer beyond the radius the diyas sit on, so the diyas nest
// into/overlap the petals instead of floating just outside the flower's edge.
let MANDALA_SCALE = 1.25;
const MANDALA_IMG_KEY = { 1: "outer", 2: "middle", 3: "center" };
const RING_EASE      = 0.06;   // per-frame lerp speed toward target alpha
const RING_BURST_LEN = 45;     // frames the "just completed" glow pulse lasts

function ringLitFraction(ringNumber) {
  const members = ringDiyas[ringNumber];
  if (!members || members.length === 0) return 0;
  const lit = members.filter((d) => d.isLit()).length;
  return lit / members.length;
}

function isRingUnlocked(ringNumber) {
  if (ringNumber <= 1) return true;
  return ringLitFraction(ringNumber - 1) >= 1;
}

function updateMandalaReveal() {
  for (let r = 1; r <= MANDALA_RING_COUNT; r++) {
    const target = ringLitFraction(r);
    ringAlpha[r] += (target - ringAlpha[r]) * RING_EASE;

    const justCompleted = target >= 1 && !ringWasDone[r];
    if (justCompleted) {
      ringBurst[r] = RING_BURST_LEN;
      ringWasDone[r] = true;
    } else if (target < 1) {
      ringWasDone[r] = false;
    }

    if (ringBurst[r] > 0) ringBurst[r]--;
  }
}

function drawMandalaLayers() {
  if (!mandalaImages.outer) return;

  push();
  imageMode(CENTER);
  const ctx = drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = "screen"; // black pixels contribute nothing — no fringing

  for (let r = 1; r <= MANDALA_RING_COUNT; r++) {
    const alpha = ringAlpha[r];
    if (alpha <= 0.002) continue;

    const img = mandalaImages[MANDALA_IMG_KEY[r]];
    if (!img) continue;

    const burstT   = ringBurst[r] / RING_BURST_LEN;           // 1 → 0 over the pulse
    const pulse    = 1 + Math.sin(burstT * Math.PI) * 0.12;   // brief scale-up bump
    const glowMult = 1 + burstT * 0.6;                        // brief brightness bump

    const size = 2 * MANDALA_R[r] * width * pulse * MANDALA_SCALE;
    const cx   = MANDALA_CX * width;
    const cy   = (MANDALA_CY + WHEEL_OFFSET_Y + MANDALA_RING_EXTRA_OFFSET_Y[r]) * height;

    ctx.globalAlpha = Math.min(1, alpha * glowMult);
    image(img, cx, cy, size, size);
  }

  ctx.restore();
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

// Guards against p5 1.x firing mousePressed twice per tap on mobile
// Chrome/Android (touch + synthesized mouse event). Reset on release.
let _tapReleased = true;

/* ── True when the tap landed on a DOM element (reveal card, close button,
   dim overlay, rotate hint) rather than the p5 canvas. In those cases we must
   NOT return false: p5 turns a false return into event.preventDefault(), which
   on touch devices cancels the synthesized click and stops DOM buttons (like
   the card's × close button) from working. Only canvas taps should be
   suppressed to block scroll/zoom gestures. ── */
function _tapIsOnCanvas(event) {
  if (!event || !event.target) return true;        // no event info → assume canvas
  return Boolean(canvasEl && event.target === canvasEl.elt);
}

function mouseReleased(event) {
  _tapReleased = true;
  return _tapIsOnCanvas(event) ? false : true;
}

function mousePressed(event) {
  // Taps on DOM overlays/buttons must pass through untouched so their own
  // click handlers fire (especially on touch devices).
  if (!_tapIsOnCanvas(event)) {
    _tapReleased = true;
    return true;
  }

  if (!_tapReleased) return false;
  _tapReleased = false;

  // Require the current card/video to be closed before another diya can be
  // interacted with — prevents opening a second card on top of the first.
  if (isOverlayOpen()) return false;

  for (let d of diyas) {
    if (!d.isHit(mouseX, mouseY)) continue;
    handleDiyaInteraction(d);
    break; // one diya at a time
  }

  return false;
}

/* ── True while a reveal card or video overlay is on screen. Used to block
   diya interaction until the user explicitly closes what's currently open. ── */
function isOverlayOpen() {
  return Boolean(revealCardEl || videoOverlayWrapper);
}

/* ── Diya-click logic shared here for readability. ── */
function handleDiyaInteraction(d) {
  if (d.state === "unlit") {
    if (!d.canOpen(isRingUnlocked(d.ring))) {
      d.triggerLocked();
      return;
    }

    const result = d.light();
    if (result?.type === "video") {
      playVideo(result.src, d);
    } else if (result?.type === "text") {
      showRevealCard(d);
    }
    return;
  }

  if (d.state === "lit") {
    // Diyas stay lit permanently, but can be clicked again to re-view content
    const result = d.reopen();
    if (result?.type === "video") {
      playVideo(result.src, d);
    } else if (result?.type === "text") {
      showRevealCard(d);
    } else if (result?.type === "image") {
      d.replayImageContent();
    }
    return;
  }

  // "lighting" — ignore clicks mid-animation
}

/* -----------------------------------------------------------
   Text / cultural reveal card (DOM overlay)
----------------------------------------------------------- */

function showRevealCard(diya) {
  teardownRevealCard();
  teardownVideoOverlay();

  const container = document.getElementById("canvas-container");

  // Dim background
  dimOverlayEl = document.createElement("div");
  dimOverlayEl.className = "dim-overlay";
  dimOverlayEl.addEventListener("click", teardownRevealCard);

  // Card
  revealCardEl = document.createElement("div");
  revealCardEl.className = "reveal-card";

  const daysUntil = 11 - diya.id;
  const phase = diya.id >= 11
    ? `Day ${diya.id - 10} of Diwali`
    : daysUntil === 1
      ? "1 day until Diwali"
      : `${daysUntil} days until Diwali`;

  const hasImage = Boolean(diya.cardImage);
  if (hasImage) {
    revealCardEl.classList.add("has-image", "image-loading");
  }

  revealCardEl.innerHTML = `
    <button class="reveal-card-close" aria-label="Close">×</button>
    ${hasImage ? '<div class="card-image-photo" role="img" aria-label="' + diya.theme + '"></div><div class="card-image-scrim"></div>' : ""}
    <div class="card-content">
      <span class="card-badge">${diya.emoji} ${phase}</span>
      <div class="card-title">${diya.theme}</div>
      <div class="card-divider"></div>
      <div class="card-body">${diya.description}</div>
    </div>
  `;

  revealCardEl.querySelector(".reveal-card-close").addEventListener("click", teardownRevealCard);

  container.appendChild(dimOverlayEl);
  container.appendChild(revealCardEl);

  // Preload the photo separately so a missing/slow image degrades gracefully
  // to the plain text-card look instead of leaving a blank panel.
  if (hasImage) {
    const preload = new Image();
    preload.onload = () => {
      const photoEl = revealCardEl && revealCardEl.querySelector(".card-image-photo");
      if (!photoEl) return; // card was closed before the image finished loading
      photoEl.style.backgroundImage = `url("${diya.cardImage}")`;
      revealCardEl.classList.remove("image-loading");
    };
    preload.onerror = () => {
      if (!revealCardEl) return;
      console.warn(`Card image failed to load: ${diya.cardImage}`);
      revealCardEl.classList.remove("has-image", "image-loading");
      revealCardEl.querySelector(".card-image-photo")?.remove();
      revealCardEl.querySelector(".card-image-scrim")?.remove();
    };
    preload.src = diya.cardImage;
  }
}

function teardownRevealCard() {
  if (revealCardEl)  { revealCardEl.remove();  revealCardEl  = null; }
  if (dimOverlayEl)  { dimOverlayEl.remove();  dimOverlayEl  = null; }
}

/* -----------------------------------------------------------
   MP4 video overlay (same as advent-calendar)
----------------------------------------------------------- */

function playVideo(src, diyaInstance) {
  teardownVideoOverlay();
  teardownRevealCard();

  const container = document.getElementById("canvas-container");
  videoOverlayWrapper = document.createElement("div");
  videoOverlayWrapper.className = "video-overlay-wrapper";

  const closeBtn = document.createElement("button");
  closeBtn.className = "video-close-btn";
  closeBtn.setAttribute("aria-label", "Close video");
  closeBtn.textContent = "×";

  const loading = document.createElement("div");
  loading.className = "video-loading";
  loading.textContent = "Loading…";

  videoElement = document.createElement("video");
  videoElement.src         = src;
  videoElement.autoplay    = true;
  videoElement.muted       = true;
  videoElement.controls    = true;
  videoElement.playsInline = true;
  videoElement.className   = "video-overlay";
  videoElement.style.cssText = "width:auto;height:auto;max-width:95vw;max-height:95vh;object-fit:contain;opacity:0;";

  let cleaned = false;
  let handleResize = null;

  const cleanUp = () => {
    if (cleaned) return;
    cleaned = true;
    if (handleResize) window.removeEventListener("resize", handleResize);
    teardownVideoOverlay();
    if (diyaInstance) diyaInstance.handleVideoFinished();
  };

  closeBtn.onclick      = cleanUp;
  videoElement.onended  = cleanUp;
  videoElement.onerror  = () => { loading.textContent = "Unable to load video."; };

  const applyFit = () => {
    if (!videoElement) return;
    const maxW = window.innerWidth * 0.95, maxH = window.innerHeight * 0.95;
    const vw = videoElement.videoWidth || maxW, vh = videoElement.videoHeight || maxH;
    if (vw <= 0 || vh <= 0) { videoElement.style.width = `${maxW}px`; videoElement.style.height = `${maxH}px`; return; }
    const ratio = vw / vh;
    let w = Math.min(maxW, maxH * ratio), h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    videoElement.style.maxWidth  = `${maxW}px`;
    videoElement.style.maxHeight = `${maxH}px`;
    videoElement.style.width     = `${w}px`;
    videoElement.style.height    = `${h}px`;
  };

  const reveal = () => { loading.remove(); videoElement.style.opacity = "1"; };

  videoElement.addEventListener("loadedmetadata", applyFit,           { once: true });
  videoElement.addEventListener("loadeddata",     () => { applyFit(); reveal(); }, { once: true });
  videoElement.addEventListener("canplay",        () => { applyFit(); reveal(); }, { once: true });

  handleResize = applyFit;
  window.addEventListener("resize", handleResize);

  videoOverlayWrapper.appendChild(closeBtn);
  videoOverlayWrapper.appendChild(videoElement);
  videoOverlayWrapper.appendChild(loading);
  container.appendChild(videoOverlayWrapper);

  const p = videoElement.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      videoElement.muted  = false;
      videoElement.volume = 1;
    }).catch(() => {
      videoElement.muted    = false;
      videoElement.controls = true;
    });
  }
  applyFit();
}

function teardownVideoOverlay() {
  if (videoOverlayWrapper) { videoOverlayWrapper.remove(); videoOverlayWrapper = null; }
  if (videoElement)        { videoElement.pause(); videoElement = null; }
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

  // Standalone, editable title scroll (see scroll.js) — banner artwork is its own
  // image asset (assets/banner/title-banner.png), separate from the background.
  scrollBanner = new ScrollBanner(data.scrollBanner || {}, scrollBannerImg);
  window.scrollBanner = scrollBanner; // handy for live edits from the browser console

  diyas = data.diyas.map((cfg) => new Diya(cfg, diyaImages, openSound, lockedSound, flameFrames));

  ringDiyas = { 1: [], 2: [], 3: [] };
  for (const d of diyas) {
    if (!ringDiyas[d.ring]) ringDiyas[d.ring] = [];
    ringDiyas[d.ring].push(d);
  }
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

function ensureImagesLoaded(config) {
  collectImagePayloads(config).forEach((p) => {
    if (diyaImages[p]) return;
    const path = resolveImagePath(p);
    if (path) diyaImages[p] = loadImage(path);
  });
}

function resolveImagePath(payload) {
  if (!payload || payload.startsWith("mp4:") || payload === "text") return null;
  if (payload.startsWith("assets/") || payload.startsWith("./assets/")) return payload;
  return `assets/${payload}.png`; // short names: "star" → "assets/star.png"
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

    // Float upward with gentle horizontal drift
    e.y -= e.speed;
    e.x += Math.sin(frameCount * 0.05 + e.phase) * 0.4;

    // Respawn at bottom when reaching top
    if (e.y < -e.size) {
      e.y = height + random(30);
      e.x = random(width);
    }
  }
}

function rebuildEmbers() {
  embers = [];
  const count = isMobile
    ? Math.max(15, Math.round(30 * (canvasScale || 1)))
    : Math.max(60, Math.round(120 * (canvasScale || 1)));
  for (let i = 0; i < count; i++) {
    embers.push({
      x:         random(width),
      y:         random(height),
      speed:     random(0.35, 1.4),
      size:      random(2, 5),
      warmth:    random(0, 95),      // shifts orange→yellow
      baseAlpha: random(0.35, 1.0),
      phase:     random(TWO_PI),
    });
  }
}
