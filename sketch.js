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

// Title scroll banner
let scrollBanner    = null;
let scrollBannerImg = null;

// Mandala — 3 concentric layers that bloom into view as each ring of
// diyas is completed (ring 1 = outer/10, ring 2 = middle/4, ring 3 = center/1)
let mandalaImages = {};
const MANDALA_RING_COUNT = 3;
let ringDiyas   = { 1: [], 2: [], 3: [] };
let ringAlpha   = { 1: 0, 2: 0, 3: 0 };
let ringBurst   = { 1: 0, 2: 0, 3: 0 };
let ringWasDone = { 1: false, 2: false, 3: false };

// Mandala geometry — set from config in hydrateDiyas()
let MANDALA_CX = 0.5;
let MANDALA_CY = 0.70;
let MANDALA_R  = { 1: 0.24, 2: 0.10, 3: 0.05 };
let MANDALA_RING_EXTRA_OFFSET_X = { 1: 0, 2: 0, 3: 0 };
let MANDALA_RING_EXTRA_OFFSET_Y = { 1: 0, 2: 0, 3: 0 };

const MANDALA_IMG_KEY = { 1: "outer", 2: "middle", 3: "center" };
const RING_EASE       = 0.06;
const RING_BURST_LEN  = 45;

// Video overlay
let videoElement        = null;
let videoOverlayWrapper = null;

// Text/reveal card
let revealCardEl = null;
let dimOverlayEl = null;

// Embers
let embers     = [];
let canvasEl   = null;
let canvasScale = 1;

function preload() {
  const cb = Date.now();
  diyaConfig = loadJSON("assets/diwali_days.json?v=" + cb);

  bg = loadImage("images/diwali-background.png?v=" + cb);

  scrollBannerImg = loadImage(`assets/banner/title-banner.png?v=${cb}`);

  mandalaImages.outer  = loadImage(`assets/mandala/mandala-outer.png?v=${cb}`);
  mandalaImages.middle = loadImage(`assets/mandala/mandala-middle.png?v=${cb}`);
  mandalaImages.center = loadImage(`assets/mandala/mandala-center.png?v=${cb}`);

  const imgPayloads = collectImagePayloads(diyaConfig);
  imgPayloads.forEach((p) => {
    const path = resolveImagePath(p);
    if (path) diyaImages[p] = loadImage(path);
  });

  for (let i = 1; i <= 8; i++) {
    const n = String(i).padStart(2, "0");
    flameFrames.push(loadImage(`assets/flame/flame_${n}.png?v=${cb}`));
  }

  openSound   = new Audio("assets/open.mp3");
  lockedSound = new Audio("assets/locked.mp3");
  openSound.addEventListener("error",   () => { openSound   = null; });
  lockedSound.addEventListener("error", () => { lockedSound = null; });
}

function setup() {
  let c = createCanvas(bg.width, bg.height);
  canvasEl = c;
  c.parent("canvas-container");
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));

  if (diyaConfig) {
    ensureImagesLoaded(diyaConfig);
    hydrateDiyas(diyaConfig);
  } else {
    loadJSON("assets/diwali_days.json?v=" + Date.now(), (data) => {
      diyaConfig = data;
      ensureImagesLoaded(data);
      hydrateDiyas(data);
      resizeToViewport();
    });
  }

  resizeToViewport();
  initEmbers();
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

  for (let d of diyas) {
    d.update();
    d.draw();
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
   Mandala reveal — 3 concentric layers bloom into color as each
   ring of diyas is completed
----------------------------------------------------------- */

function ringLitFraction(ringNumber) {
  const members = ringDiyas[ringNumber];
  if (!members || members.length === 0) return 0;
  return members.filter((d) => d.isLit()).length / members.length;
}

function isRingUnlocked(ringNumber) {
  if (ringNumber <= 1) return true;
  return ringLitFraction(ringNumber - 1) >= 1;
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
  return Boolean(revealCardEl || videoOverlayWrapper);
}

function handleDiyaInteraction(d) {
  if (d.state === "unlit") {
    if (!d.canOpen(isRingUnlocked(d.ring))) {
      d.triggerLocked();
      return;
    }
    const result = d.light();
    if (result?.type === "video") {
      // Delay video popup until flame animation finishes
      const src = result.src;
      d.onLit = () => playVideo(src, d);
    } else if (result?.type === "text") {
      // Delay card until flame animation finishes
      d.onLit = () => showRevealCard(d);
    }
    return;
  }

  if (d.state === "lit") {
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
}

/* -----------------------------------------------------------
   Text / cultural reveal card (DOM overlay)
----------------------------------------------------------- */

function showRevealCard(diya) {
  teardownRevealCard();
  teardownVideoOverlay();

  const container = document.getElementById("canvas-container");

  dimOverlayEl = document.createElement("div");
  dimOverlayEl.className = "dim-overlay";
  dimOverlayEl.addEventListener("click", teardownRevealCard);

  revealCardEl = document.createElement("div");
  revealCardEl.className = "reveal-card";

  const daysUntil = 11 - diya.id;
  const phase = diya.id >= 11
    ? `Day ${diya.id - 10} of Diwali`
    : daysUntil === 1
      ? "1 day until Diwali"
      : `${daysUntil} days until Diwali`;

  const hasImage = Boolean(diya.cardImage);
  if (hasImage) revealCardEl.classList.add("has-image", "image-loading");

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

  if (hasImage) {
    const preload = new Image();
    preload.onload = () => {
      const photoEl = revealCardEl && revealCardEl.querySelector(".card-image-photo");
      if (!photoEl) return;
      photoEl.style.backgroundImage = `url("${diya.cardImage}")`;
      revealCardEl.classList.remove("image-loading");
    };
    preload.onerror = () => {
      if (!revealCardEl) return;
      revealCardEl.classList.remove("has-image", "image-loading");
      revealCardEl.querySelector(".card-image-photo")?.remove();
      revealCardEl.querySelector(".card-image-scrim")?.remove();
    };
    preload.src = diya.cardImage;
  }
}

function teardownRevealCard() {
  if (revealCardEl) { revealCardEl.remove(); revealCardEl = null; }
  if (dimOverlayEl) { dimOverlayEl.remove(); dimOverlayEl = null; }
}

/* -----------------------------------------------------------
   MP4 video overlay
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

  closeBtn.onclick     = cleanUp;
  videoElement.onended = cleanUp;
  videoElement.onerror = () => { loading.textContent = "Unable to load video."; };

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
