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

// Video overlay — singleton custom player
// Maps each video-day number to its source file placeholder.
const VIDEO_DAYS = {
  3:  "assets/videos/day3.mp4",
  6:  "assets/videos/day6.mp4",
  11: "assets/videos/day11.mp4",
  13: "assets/videos/day13.mp4",
  15: "assets/videos/day15.mp4",
};

// Non-null while the player is visible (read by isOverlayOpen).
let videoOverlayWrapper  = null;
// Singleton DOM refs — built once in initVideoPlayer(), reused every playback.
let videoPlayerContainer = null;
let videoPlayerEl        = null;
let videoPlayPauseBtn    = null;
let videoVolumeSlider    = null;
let videoFullscreenBtn   = null;
let videoSeekBar         = null;  // full-width seek <input type="range">
let videoTimeEl          = null;  // "M:SS / M:SS" text span
let videoClickFeedbackEl = null;  // center play/pause ripple overlay
let idleTimer            = null;  // auto-hide controls after 2500 ms inactivity

// Text/reveal card
let revealCardEl = null;
let dimOverlayEl = null;

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

  // Day 14 — Govardhan Puja     → festive sparkler
  14: "assets/lamp-items/festivesparkler.png",
};
let springPopupEl    = null;
let springPopupTimer = null;

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
  initVideoPlayer();
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
  const isSpringDay = Boolean(SPRING_POPUP_DAYS[d.id]);

  if (d.state === "unlit") {
    if (!d.canOpen(isRingUnlocked(d.ring))) {
      d.triggerLocked();
      return;
    }
    const result = d.light();
    if (isSpringDay) {
      // Spring days: show 3D popup only — no info card
      showSpringPopup(d);
    } else {
      if (result?.type === "video") {
        const src = result.src;
        d.onLit = () => playVideo(src, d);
      } else if (result?.type === "text") {
        d.onLit = () => showRevealCard(d);
      }
    }
    return;
  }

  if (d.state === "lit") {
    if (isSpringDay) {
      // Re-click: retrigger the popup, skip the info card
      showSpringPopup(d);
      return;
    }
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
   Spring popup — jack-in-the-box image reveal
----------------------------------------------------------- */

function showSpringPopup(diya) {
  if (!SPRING_POPUP_DAYS[diya.id]) return;
  teardownSpringPopup();

  const imgSrc     = SPRING_POPUP_DAYS[diya.id];
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

  const img = document.createElement("img");
  img.src = imgSrc;
  img.alt = `Day ${diya.id} surprise`;
  springPopupEl.appendChild(img);

  // Append to body so position:fixed coordinates are always in viewport space,
  // unaffected by any transforms on ancestor elements.
  document.body.appendChild(springPopupEl);

  springPopupTimer = setTimeout(dismissSpringPopup, 10000);
}

function dismissSpringPopup() {
  if (!springPopupEl) return;
  springPopupEl.classList.add("spring-popup-out");
  // Remove from DOM once the exit animation finishes.
  const el = springPopupEl;
  el.addEventListener("animationend", () => el.remove(), { once: true });
  springPopupEl    = null;
  springPopupTimer = null;
}

function teardownSpringPopup() {
  if (springPopupTimer) { clearTimeout(springPopupTimer); springPopupTimer = null; }
  if (springPopupEl)    { springPopupEl.remove(); springPopupEl = null; }
}

/* -----------------------------------------------------------
   Custom video player — singleton DOM structure, reused per playback
----------------------------------------------------------- */

/* ── Format seconds as M:SS (e.g. 75 → "1:15") ── */
function fmtVideoTime(secs) {
  if (!isFinite(secs) || isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ── Idle-timer: resets the 2500 ms countdown; adds/removes .idle class ── */
function resetIdleTimer() {
  if (!videoPlayerContainer) return;
  videoPlayerContainer.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (videoPlayerContainer) videoPlayerContainer.classList.add("idle");
  }, 2500);
}

/* ── Center ripple: briefly shows ▶/⏸ icon in the middle of the player ── */
function showVideoClickFeedback(isNowPaused) {
  if (!videoClickFeedbackEl) return;
  videoClickFeedbackEl.textContent = isNowPaused ? "⏸" : "▶";
  videoClickFeedbackEl.classList.remove("animate");
  // Force a style recalculation so the animation always restarts
  void videoClickFeedbackEl.offsetWidth;
  videoClickFeedbackEl.classList.add("animate");
}

function initVideoPlayer() {
  if (videoPlayerContainer) return;

  const host = document.getElementById("canvas-container");

  // ── Wrapper (fullscreen target) ───────────────────────────
  videoPlayerContainer = document.createElement("div");
  videoPlayerContainer.className = "video-overlay-wrapper";
  videoPlayerContainer.style.display = "none";

  // ── <video> — no default controls, playsinline for mobile ──
  videoPlayerEl = document.createElement("video");
  videoPlayerEl.className = "video-overlay";
  videoPlayerEl.setAttribute("playsinline", "");
  videoPlayerEl.setAttribute("webkit-playsinline", ""); // iOS inline playback
  videoPlayerEl.playsInline = true;
  videoPlayerEl.onended = exitVideo;
  videoPlayerEl.onerror = () => {
    const l = videoPlayerContainer && videoPlayerContainer.querySelector(".video-loading");
    if (l) l.textContent = "Unable to load video.";
  };

  // ── Controls bar — column layout: seek bar on top, buttons row below ──
  const controlsBar = document.createElement("div");
  controlsBar.className = "video-controls-bar";

  // ── Seek row — full-width interactive range input ──────────
  const seekRow = document.createElement("div");
  seekRow.className = "video-seek-row";

  videoSeekBar = document.createElement("input");
  videoSeekBar.type = "range";
  videoSeekBar.className = "video-seek-bar";
  videoSeekBar.min = "0";
  videoSeekBar.max = "100";
  videoSeekBar.step = "0.1";
  videoSeekBar.value = "0";
  videoSeekBar.setAttribute("aria-label", "Seek");
  videoSeekBar.style.setProperty("--seek-pct", "0%");
  // Dragging immediately scrubs the video
  videoSeekBar.addEventListener("input", (e) => {
    if (!videoPlayerEl || !isFinite(videoPlayerEl.duration)) return;
    const pct = parseFloat(e.target.value);
    videoPlayerEl.currentTime = (pct / 100) * videoPlayerEl.duration;
    videoSeekBar.style.setProperty("--seek-pct", `${pct}%`);
  });

  seekRow.appendChild(videoSeekBar);

  // ── Buttons row — left group | right group ─────────────────
  const buttonsRow = document.createElement("div");
  buttonsRow.className = "video-buttons-row";

  // Left group: Play/Pause, Volume slider, Time readout
  const leftGroup = document.createElement("div");
  leftGroup.className = "video-controls-left";

  videoPlayPauseBtn = document.createElement("button");
  videoPlayPauseBtn.className = "video-ctrl-btn video-ctrl-playpause";
  videoPlayPauseBtn.setAttribute("aria-label", "Play / Pause");
  videoPlayPauseBtn.textContent = "⏸";
  videoPlayPauseBtn.addEventListener("click", togglePlayPause);

  videoVolumeSlider = document.createElement("input");
  videoVolumeSlider.type = "range";
  videoVolumeSlider.className = "video-ctrl-volume";
  videoVolumeSlider.min = "0";
  videoVolumeSlider.max = "1";
  videoVolumeSlider.step = "0.05";
  videoVolumeSlider.value = "1";
  videoVolumeSlider.setAttribute("aria-label", "Volume");
  videoVolumeSlider.style.setProperty("--vol-pct", "100%");
  videoVolumeSlider.addEventListener("input", (e) => {
    const vol = parseFloat(e.target.value);
    if (videoPlayerEl) videoPlayerEl.volume = vol;
    videoVolumeSlider.style.setProperty("--vol-pct", `${vol * 100}%`);
  });

  videoTimeEl = document.createElement("span");
  videoTimeEl.className = "video-time";
  videoTimeEl.textContent = "0:00 / 0:00";

  leftGroup.appendChild(videoPlayPauseBtn);
  leftGroup.appendChild(videoVolumeSlider);
  leftGroup.appendChild(videoTimeEl);

  // Right group: Fullscreen ONLY (Exit is the top-right button)
  const rightGroup = document.createElement("div");
  rightGroup.className = "video-controls-right";

  videoFullscreenBtn = document.createElement("button");
  videoFullscreenBtn.className = "video-ctrl-btn video-ctrl-fullscreen";
  videoFullscreenBtn.setAttribute("aria-label", "Enter fullscreen");
  videoFullscreenBtn.textContent = "⛶";
  videoFullscreenBtn.addEventListener("click", toggleVideoFullscreen);

  rightGroup.appendChild(videoFullscreenBtn);

  buttonsRow.appendChild(leftGroup);
  buttonsRow.appendChild(rightGroup);

  controlsBar.appendChild(seekRow);
  controlsBar.appendChild(buttonsRow);

  // ── Loading indicator ─────────────────────────────────────
  const loading = document.createElement("div");
  loading.className = "video-loading";
  loading.textContent = "Loading…";

  // ── Video event listeners ─────────────────────────────────
  videoPlayerEl.addEventListener("play",  () => {
    if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "⏸";
    resetIdleTimer();
  });
  videoPlayerEl.addEventListener("pause", () => {
    if (videoPlayPauseBtn) videoPlayPauseBtn.textContent = "▶";
  });
  videoPlayerEl.addEventListener("loadeddata", () => {
    const l = videoPlayerContainer && videoPlayerContainer.querySelector(".video-loading");
    if (l) l.style.display = "none";
  });
  videoPlayerEl.addEventListener("canplay", () => {
    const l = videoPlayerContainer && videoPlayerContainer.querySelector(".video-loading");
    if (l) l.style.display = "none";
  });

  // Seek bar + time counter — driven by timeupdate
  videoPlayerEl.addEventListener("timeupdate", () => {
    const cur = videoPlayerEl.currentTime;
    const dur = videoPlayerEl.duration;
    const pct = (isFinite(dur) && dur > 0) ? (cur / dur) * 100 : 0;
    if (videoSeekBar) {
      videoSeekBar.value = pct;
      videoSeekBar.style.setProperty("--seek-pct", `${pct}%`);
    }
    if (videoTimeEl) videoTimeEl.textContent =
      `${fmtVideoTime(cur)} / ${fmtVideoTime(dur)}`;
  });

  // ── Click-to-toggle play/pause on the video element itself ──
  videoPlayerEl.addEventListener("click", () => {
    togglePlayPause();
    showVideoClickFeedback(videoPlayerEl.paused);
  });

  // ── Idle-timer event listeners — mouse movement or touch resets the clock ──
  videoPlayerContainer.addEventListener("mousemove",  resetIdleTimer);
  videoPlayerContainer.addEventListener("touchstart", resetIdleTimer, { passive: true });

  // ── Center play/pause ripple feedback element ──────────────
  videoClickFeedbackEl = document.createElement("div");
  videoClickFeedbackEl.className = "video-click-feedback";
  videoPlayerContainer.appendChild(videoClickFeedbackEl);

  // ── Fullscreen icon swap on fullscreenchange ──────────────
  const onFsChange = () => {
    if (!videoFullscreenBtn) return;
    if (isVideoInFullscreen()) {
      videoFullscreenBtn.textContent = "⊡";
      videoFullscreenBtn.setAttribute("aria-label", "Exit fullscreen");
    } else {
      videoFullscreenBtn.textContent = "⛶";
      videoFullscreenBtn.setAttribute("aria-label", "Enter fullscreen");
      // Unlock orientation whenever we leave fullscreen
      try { screen.orientation.unlock(); } catch (_) {}
    }
  };
  document.addEventListener("fullscreenchange",       onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  document.addEventListener("mozfullscreenchange",    onFsChange);

  // ── Keyboard shortcuts — only active while the player is visible ──────────
  document.addEventListener("keydown", (e) => {
    // ESC is always handled if we're in fullscreen
    if (e.key === "Escape" && isVideoInFullscreen()) {
      document.exitFullscreen && document.exitFullscreen().catch(() => {});
      try { screen.orientation.unlock(); } catch (_) {}
      return;
    }

    // All other shortcuts only fire while the player overlay is open
    if (!videoOverlayWrapper) return;

    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlayPause();
        showVideoClickFeedback(videoPlayerEl.paused);
        resetIdleTimer();
        break;
      case "f":
        e.preventDefault();
        toggleVideoFullscreen();
        break;
      case "ArrowRight":
        e.preventDefault();
        if (videoPlayerEl && isFinite(videoPlayerEl.duration)) {
          videoPlayerEl.currentTime = Math.min(
            videoPlayerEl.currentTime + 2, videoPlayerEl.duration
          );
        }
        resetIdleTimer();
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (videoPlayerEl) {
          videoPlayerEl.currentTime = Math.max(videoPlayerEl.currentTime - 2, 0);
        }
        resetIdleTimer();
        break;
    }
  });

  // ── Exit button — top-right, always visible, outside the controls bar ──
  const exitBtn = document.createElement("button");
  exitBtn.className = "video-exit-btn";
  exitBtn.setAttribute("aria-label", "Exit video");
  exitBtn.textContent = "✕";
  exitBtn.addEventListener("click", exitVideo);

  // ── Assemble & mount ──────────────────────────────────────
  videoPlayerContainer.appendChild(videoPlayerEl);
  videoPlayerContainer.appendChild(controlsBar);
  videoPlayerContainer.appendChild(exitBtn);
  videoPlayerContainer.appendChild(loading);
  host.appendChild(videoPlayerContainer);
}

/* ── Predicate: is the video container currently the fullscreen element ── */
function isVideoInFullscreen() {
  return Boolean(
    document.fullscreenElement       === videoPlayerContainer ||
    document.webkitFullscreenElement === videoPlayerContainer ||
    document.mozFullScreenElement    === videoPlayerContainer
  );
}

/* ── Toggle play / pause ── */
function togglePlayPause() {
  if (!videoPlayerEl) return;
  if (videoPlayerEl.paused) videoPlayerEl.play();
  else                      videoPlayerEl.pause();
}

/* ── Toggle fullscreen on the player container ── */
function toggleVideoFullscreen() {
  if (!videoPlayerContainer) return;
  if (isVideoInFullscreen()) {
    (document.exitFullscreen ||
     document.webkitExitFullscreen ||
     document.mozCancelFullScreen
    ).call(document).catch(() => {});
    try { screen.orientation.unlock(); } catch (_) {}
  } else {
    const req = videoPlayerContainer.requestFullscreen ||
                videoPlayerContainer.webkitRequestFullscreen ||
                videoPlayerContainer.mozRequestFullScreen;
    if (req) {
      req.call(videoPlayerContainer)
        .then(() => {
          // Lock to landscape; iOS may reject — swallow the error silently
          try {
            const lockP = screen.orientation.lock("landscape");
            if (lockP && typeof lockP.catch === "function") lockP.catch(() => {});
          } catch (_) {}
        })
        .catch(() => {});
    }
  }
}

/* ── Clean exit: pause, dump src, hide overlay ── */
function exitVideo() {
  // Clear idle timeout and restore cursor before hiding
  clearTimeout(idleTimer);
  idleTimer = null;
  if (videoPlayerContainer) videoPlayerContainer.classList.remove("idle");

  if (isVideoInFullscreen()) {
    try { document.exitFullscreen(); } catch (_) {}
    try { screen.orientation.unlock(); } catch (_) {}
  }
  if (videoPlayerEl) {
    videoPlayerEl.pause();
    videoPlayerEl.src = "";
    videoPlayerEl.load();
  }
  if (videoPlayerContainer) {
    videoPlayerContainer.style.display = "none";
    const l = videoPlayerContainer.querySelector(".video-loading");
    if (l) { l.style.display = ""; l.textContent = "Loading…"; }
  }
  if (videoSeekBar) {
    videoSeekBar.value = "0";
    videoSeekBar.style.setProperty("--seek-pct", "0%");
  }
  if (videoTimeEl) videoTimeEl.textContent = "0:00 / 0:00";
  videoOverlayWrapper = null;
}

/* ── Show the player, set src, and begin playback ── */
function playVideo(src) {
  teardownRevealCard();
  teardownSpringPopup();   // dismiss any active 3D popup so it can't overlap the video
  initVideoPlayer();

  // Reset loading spinner
  const l = videoPlayerContainer.querySelector(".video-loading");
  if (l) { l.style.display = ""; l.textContent = "Loading…"; }

  // Restore volume from slider (user may have adjusted it previously)
  videoPlayerEl.volume = parseFloat(videoVolumeSlider ? videoVolumeSlider.value : "1");

  videoPlayerEl.src = src;
  videoPlayerEl.load();
  videoPlayerContainer.style.display = "";
  videoOverlayWrapper = videoPlayerContainer;

  // Start idle countdown as soon as the player is visible
  resetIdleTimer();

  const p = videoPlayerEl.play();
  if (p && typeof p.then === "function") {
    p.catch(() => { /* autoplay blocked — user can tap ▶ */ });
  }
}

function teardownVideoOverlay() {
  exitVideo();
}

/* -----------------------------------------------------------
   Radial / Petal lamp placement
   Reads the `radialLayout` block from the JSON config and overrides
   each Diya's x/y to sit on the mandala petals via polar coordinates.
   Each lamp is first placed at its exact geometric centre on the petal,
   then a small random "petal jitter" is added so they don't look rigid.
   The lamp's w/h from `pos` are always preserved.

   Geometry notes
   ─────────────
   • cx / cy      — mandala visual centre (fractions of canvas w & h).
   • outerRadius  — fraction of canvas WIDTH; same pixel offset used for
                    both x and y by scaling the y component by (width/height)
                    so the ring is a true circle in pixel space, not an ellipse.
   • angleOffset  — 0° = 3 o'clock, -90° = 12 o'clock (top of canvas).
   • jitterPx     — independent random pixel nudge on each axis, converted
                    to the matching fraction so it scales with the canvas.
----------------------------------------------------------- */

function computeRadialPositions(rl, diyasList) {
  const radCX = rl.cx ?? MANDALA_CX;
  const radCY = rl.cy ?? (MANDALA_CY + (MANDALA_RING_EXTRA_OFFSET_Y[1] || 0));

  const outerCfg  = rl.outer  || {};
  const middleCfg = rl.middle || {};
  const jitterPx  = rl.jitterPx ?? 20;

  const outerCount      = outerCfg.count          ?? 10;
  const outerRadius     = outerCfg.radius          ?? 0.32;
  const outerOffsetRad  = ((outerCfg.angleOffsetDeg  ?? -90) * Math.PI) / 180;

  const middleCount     = middleCfg.count          ?? 4;
  const middleRadius    = middleCfg.radius         ?? 0.13;
  const middleOffsetRad = ((middleCfg.angleOffsetDeg ?? 45) * Math.PI) / 180;

  // The radius is expressed as a fraction of canvas WIDTH. To keep the ring
  // circular in pixel space on a non-square canvas, scale the y-component by
  // (width / height) so that one unit of radius = the same number of pixels
  // in both axes.
  const aspect = width / height;

  const outerDiyas  = diyasList.filter(d => d.ring === 1).sort((a, b) => a.id - b.id);
  const middleDiyas = diyasList.filter(d => d.ring === 2).sort((a, b) => a.id - b.id);
  const centerDiyas = diyasList.filter(d => d.ring === 3);

  // ── Outer ring (lamps 1–10) ──────────────────────────────────────────────
  outerDiyas.forEach((d, i) => {
    const angle = outerOffsetRad + (TWO_PI / outerCount) * i;
    const jx    = (Math.random() * 2 - 1) * (jitterPx / width);
    const jy    = (Math.random() * 2 - 1) * (jitterPx / height);
    // Centre of the petal → then shift by -w/2, -h/2 to get the top-left corner
    d.x = radCX + outerRadius          * Math.cos(angle) - d.w / 2 + jx;
    d.y = radCY + outerRadius * aspect * Math.sin(angle) - d.h / 2 + jy;
  });

  // ── Middle ring (lamps 11–14) ────────────────────────────────────────────
  middleDiyas.forEach((d, i) => {
    const angle = middleOffsetRad + (TWO_PI / middleCount) * i;
    const jx    = (Math.random() * 2 - 1) * (jitterPx / width);
    const jy    = (Math.random() * 2 - 1) * (jitterPx / height);
    d.x = radCX + middleRadius          * Math.cos(angle) - d.w / 2 + jx;
    d.y = radCY + middleRadius * aspect * Math.sin(angle) - d.h / 2 + jy;
  });

  // ── Centre lamp (lamp 15) — dead-centre, no jitter ──────────────────────
  centerDiyas.forEach((d) => {
    d.x = radCX - d.w / 2;
    d.y = radCY - d.h / 2;
  });
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

  // Override x/y positions with radial/petal geometry when the config block exists.
  // pos.w and pos.h from the JSON are always preserved.
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
