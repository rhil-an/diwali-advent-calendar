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
let diyaAccessConfig = { allDoors: false };

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

function preload() {
  const cb = Date.now();
  diyaConfig = loadJSON("assets/diwali_days.json?v=" + cb);
  bg = loadImage("images/advent-background.jpg?v=" + cb);

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
  let c = createCanvas(bg.width, bg.height);
  canvasEl = c;
  c.parent("canvas-container");
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  resizeToViewport();

  if (diyaConfig) {
    ensureImagesLoaded(diyaConfig);
    hydrateDiyas(diyaConfig);
  } else {
    loadJSON("assets/diwali_days.json?v=" + Date.now(), (data) => {
      diyaConfig = data;
      ensureImagesLoaded(data);
      hydrateDiyas(data);
    });
  }

  initEmbers();
}

function draw() {
  if (!bg) return;

  clear();
  image(bg, 0, 0, width, height);

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

function mousePressed() {
  // Require the current card/video to be closed before another diya can be
  // interacted with — prevents opening a second card on top of the first.
  if (isOverlayOpen()) return;

  const currentDay = resolveCurrentDay();

  for (let d of diyas) {
    if (!d.isHit(mouseX, mouseY)) continue;
    handleDiyaInteraction(d, currentDay);
    break; // one diya at a time
  }
}

/* ── True while a reveal card or video overlay is on screen. Used to block
   diya interaction until the user explicitly closes what's currently open. ── */
function isOverlayOpen() {
  return Boolean(revealCardEl || videoOverlayWrapper);
}

/* ── Diya-click logic shared here for readability. ── */
function handleDiyaInteraction(d, currentDay) {
  if (d.state === "unlit") {
    if (!d.canOpen(currentDay)) {
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
   Unlock / day resolution
----------------------------------------------------------- */

function resolveCurrentDay() {
  if (diyaAccessConfig.allDoors) return 99; // unlock all
  // In production: compute days remaining until Diwali
  // For now, fall back to calendar day
  return new Date().getDate();
}

/* -----------------------------------------------------------
   Config hydration
----------------------------------------------------------- */

function hydrateDiyas(data) {
  if (!data || !Array.isArray(data.diyas)) {
    console.error("Diwali config missing or malformed — expected data.diyas array.");
    return;
  }

  diyaAccessConfig.allDoors = Boolean(data.ALL_DOORS);
  creditsConfig = data.credits || null;

  diyas = data.diyas.map((cfg) => new Diya(cfg, diyaImages, openSound, lockedSound, flameFrames));
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
  const count = Math.max(60, Math.round(120 * (canvasScale || 1)));
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
