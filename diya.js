/* -----------------------------------------------------------
   Diya Class — Diwali Countdown Calendar
   States: unlit → lighting → lit (permanent — diyas stay lit)
   Payloads: "text" | "assets/image.png" | "mp4:assets/vid.mp4"
----------------------------------------------------------- */

const FLAME_ANIM_STEP    = 1 / 45;   // ~45 frames for flame to grow
const CONTENT_DELAY_MS   = 9000;     // image content visible duration
const CONTENT_FADE_MS    = 1800;     // image content fade duration
const DIYA_SHAKE_FRAMES  = 20;
const DIYA_SHAKE_MAG     = 0.025;
const FLAME_HOLD_MIN     = 14;       // min frames a flame pose is held before swapping
const FLAME_HOLD_MAX     = 34;       // max frames a flame pose is held before swapping
const FLAME_BLEND_SPEED  = 0.8;      // crossfade speed between flame poses (lower = slower morph)

/* ── Fisher–Yates shuffle — returns a fresh randomized traversal order ── */
function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomHoldFrames() {
  return Math.floor(FLAME_HOLD_MIN + Math.random() * (FLAME_HOLD_MAX - FLAME_HOLD_MIN + 1));
}

class Diya {
  constructor(cfg, images, openSound, lockedSound, flameFrames) {
    this.id          = cfg.id;

    // Per-layout normalized positions: { landscape:{x,y,w,h}, portrait:{x,y,w,h} }.
    // Falls back to legacy top-level x/y/w/h for backwards compatibility.
    this.positions   = cfg.pos || null;
    const initial    = this.positions
      ? (this.positions[typeof activeLayoutName !== "undefined" ? activeLayoutName : "landscape"] || this.positions.landscape)
      : cfg;
    this.x           = initial.x;      // normalized 0–1
    this.y           = initial.y;
    this.w           = initial.w;
    this.h           = initial.h;

    this.payload     = cfg.payload || null;
    this.ring        = cfg.ring || 1;   // 1 = outer (10), 2 = middle (4), 3 = center (1)
    this.theme       = cfg.theme       || "";
    this.description = cfg.description || "";
    this.emoji       = cfg.emoji       || "🪔";
    this.special     = cfg.special     || false;
    this.tint        = cfg.tint        || null;    // [R, G, B] jewel tone for special diyas
    this.cardImage   = cfg.cardImage   || null;    // optional background photo for the reveal card

    this.images      = images;
    this.openSound   = openSound;
    this.lockedSound = lockedSound;
    this.flameFrames = flameFrames || [];

    // State machine
    this.state             = "unlit";   // "unlit" | "lighting" | "lit"
    this.animProgress      = 0;         // 0→1  flame grow

    // Image content bounce
    this.contentProgress      = 0;
    this.contentAlpha         = 1;
    this.showingContent       = false;
    this.contentOpenedAt      = null;
    this.contentFadeStartedAt = null;

    this.shakeFrames = 0;
    this.flamePhase  = Math.random() * Math.PI * 2;  // unique residual-sway offset per diya

    // Flame flipbook — each diya walks its own randomized, never-repeating path
    // through the available frame poses, at its own irregular pace.
    const frameCount = this.flameFrames.length;
    this.flameOrder      = shuffledIndices(frameCount);
    this.flameOrderPos   = Math.floor(Math.random() * Math.max(frameCount, 1));
    this.flameCurrentIdx = frameCount ? this.flameOrder[this.flameOrderPos] : 0;
    this.flameNextIdx    = this.flameCurrentIdx;
    this.flameBlend      = 1;   // 0→1 crossfade progress current→next frame
    this.flameHoldFrames = randomHoldFrames();
  }

  /* ── Advances to the next randomized flame pose in this diya's private shuffled path ── */
  advanceFlameFrame() {
    const frameCount = this.flameFrames.length;
    if (frameCount < 2) return;

    this.flameOrderPos++;
    if (this.flameOrderPos >= this.flameOrder.length) {
      this.flameOrder    = shuffledIndices(frameCount);
      this.flameOrderPos = 0;
      // Avoid an immediate repeat when the freshly shuffled order starts
      // with the pose we just left.
      if (this.flameOrder[0] === this.flameCurrentIdx) {
        [this.flameOrder[0], this.flameOrder[1]] = [this.flameOrder[1], this.flameOrder[0]];
      }
    }

    this.flameNextIdx    = this.flameOrder[this.flameOrderPos];
    this.flameBlend      = 0;
    this.flameHoldFrames = randomHoldFrames();
  }

  /* ── Per-frame flame flipbook advance/crossfade (called every update() tick) ── */
  updateFlameFrame() {
    if (this.flameFrames.length < 2) return;

    if (this.flameBlend < 1) {
      this.flameBlend = Math.min(1, this.flameBlend + FLAME_ANIM_STEP * FLAME_BLEND_SPEED);
      if (this.flameBlend >= 1) this.flameCurrentIdx = this.flameNextIdx;
    }

    this.flameHoldFrames--;
    if (this.flameHoldFrames <= 0) this.advanceFlameFrame();
  }

  /* ── Re-point this diya at the given layout's coordinates. State (lit/unlit,
     flame animation, etc.) is untouched, so switching layouts never resets the
     scene — only the position/size changes. ── */
  setPosition(layoutName) {
    if (!this.positions) return;
    const p = this.positions[layoutName] || this.positions.landscape;
    if (!p) return;
    this.x = p.x;
    this.y = p.y;
    this.w = p.w;
    this.h = p.h;
  }

  /* ── Pixel helpers ── */
  px() { return this.x * width; }
  py() { return (this.y + WHEEL_OFFSET_Y) * height; }
  pw() { return this.w * width; }
  ph() { return this.h * height; }

  isHit(mx, my) {
    const x = this.px(), y = this.py(), w = this.pw(), h = this.ph();
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  /* ── Returns wick tip in pixel coords (shared by draw methods) ── */
  getWickTip() {
    const x = this.px(), y = this.py(), w = this.pw(), h = this.ph();
    // Must mirror the geometry in drawDiyaBody exactly
    const cx       = x + w * 0.44;
    const rimY     = y + h * 0.52;
    const bW       = w * 0.82;
    const bH       = h * 0.30;
    const spoutTipX = cx + bW * 0.50 + w * 0.19;
    const spoutTipY = rimY - bH * 0.22;
    return {
      x: spoutTipX,
      y: spoutTipY - bH * 0.18,   // short wick, just above spout tip
    };
  }

  /* ── Ignite ── */
  light() {
    if (this.state !== "unlit") return null;
    if (this.openSound) {
      try { this.openSound.currentTime = 0; this.openSound.play(); } catch (_) {}
    }
    this.state        = "lighting";
    this.animProgress = 0;

    if (this.isVideoPayload())  return { type: "video", src: this.payload.split(":")[1] };
    if (this.isTextPayload())   return { type: "text" };
    return null;
  }

  /* ── Reopen — lets an already-lit diya be clicked again to re-view its
     content, without replaying the ignite animation/sound ── */
  reopen() {
    if (this.state !== "lit") return null;

    if (this.isVideoPayload())  return { type: "video", src: this.payload.split(":")[1] };
    if (this.isTextPayload())   return { type: "text" };
    if (this.isImagePayload())  return { type: "image" };
    return null;
  }

  replayImageContent() {
    this.startContentReveal();
  }

  /* ── (Re)starts the canvas image-payload bounce-in reveal ── */
  startContentReveal() {
    this.showingContent       = true;
    this.contentProgress      = 0;
    this.contentAlpha         = 1;
    this.contentOpenedAt      = millis();
    this.contentFadeStartedAt = null;
  }

  /* ── Per-frame update ── */
  update() {
    if (this.state === "lighting") {
      this.animProgress += FLAME_ANIM_STEP;
      if (this.animProgress >= 1) {
        this.animProgress = 1;
        this.state = "lit";

        // Kick off image bounce reveal
        if (this.isImagePayload()) this.startContentReveal();
      }
    }

    if (this.state === "lighting" || this.state === "lit") {
      this.updateFlameFrame();
    }

    if (this.state === "lit" && this.showingContent) {
      this.advanceContentReveal();
    }

    if (this.shakeFrames > 0) this.shakeFrames--;
  }

  /* ── Per-frame draw ── */
  draw() {
    push();
    translate(this.getShakeOffset(), 0);

    if (this.state === "unlit") {
      this.drawUnlit();
    } else if (this.state === "lighting") {
      this.drawLighting();
    } else if (this.state === "lit") {
      this.drawLit();
      if (this.showingContent) this.drawImageContent();
    }

    pop();
  }

  /* ─────────── Visual methods ─────────── */

  drawUnlit() {
    const x = this.px(), y = this.py(), w = this.pw(), h = this.ph();
    this.drawDiyaBody(x, y, w, h, 0);
    this.drawDayLabel(x, y, w, h, 1);
  }

  drawLighting() {
    const x = this.px(), y = this.py(), w = this.pw(), h = this.ph();
    const t = this.animProgress;
    this.drawDiyaBody(x, y, w, h, t);
    const wick = this.getWickTip();
    const maxSize = this.special ? w * 0.46 : w * 0.30;
    this.drawFlame(wick.x, wick.y, maxSize * t, t);
    this.drawDayLabel(x, y, w, h, 1 - t);
  }

  drawLit() {
    const x = this.px(), y = this.py(), w = this.pw(), h = this.ph();
    this.drawDiyaBody(x, y, w, h, 1);
    const wick      = this.getWickTip();
    const flicker   = 1 + Math.sin(frameCount * 0.05 + this.flamePhase) * 0.07;
    const flameSize = this.special ? w * 0.46 * flicker : w * 0.30 * flicker;
    this.drawFlame(wick.x, wick.y, flameSize, 1);
    this.drawAmbientGlow(wick.x, wick.y, this.special ? w * 1.6 : w);
    this.drawDayLabel(x, y, w, h, 1);
  }

  /* ── Terracotta diya bowl ──
     Real diya proportions: ~2.75× wider than tall, very shallow.
     Shape: wide saucer with curved organic spout on right side.
  ── */
  drawDiyaBody(x, y, w, h, litProg) {
    // Bowl is offset slightly left so spout fits inside the hit-box
    const cx    = x + w * 0.44;
    const rimY  = y + h * 0.52;   // top rim of the bowl
    const bW    = w * 0.82;       // bowl width — wide relative to height
    const bH    = h * 0.30;       // bowl depth — very shallow (real ratio ~1:2.75)
    const baseY = rimY + bH;      // flat bottom of bowl

    // ── Colour palette (terracotta for plain, jewel tone for special) ──
    let cDark, cBody, cRim, cInner;

    if (this.special && this.tint) {
      const [tr, tg, tb] = this.tint;
      cDark  = color(Math.max(0, tr - 60), Math.max(0, tg - 30), Math.max(0, tb - 40));
      cBody  = litProg > 0
        ? lerpColor(color(tr - 30, tg - 15, tb - 20), color(tr + 30, tg + 25, tb + 20), litProg)
        : color(Math.max(0, tr - 40), Math.max(0, tg - 20), Math.max(0, tb - 30));
      cRim   = color(255, 210, 50);    // always gold for special diyas
      cInner = color(Math.max(0, tr - 70), Math.max(0, tg - 45), Math.max(0, tb - 55));
    } else {
      cDark  = color(58, 26, 8);
      cBody  = litProg > 0
        ? lerpColor(color(118, 58, 22), color(208, 108, 46), litProg)
        : color(88, 44, 18);
      cRim   = litProg > 0
        ? lerpColor(color(152, 80, 38), color(242, 148, 70), litProg)
        : color(120, 64, 32);
      cInner = color(38, 18, 6);
    }

    push();

    // ── 1. Drop shadow ──
    noStroke();
    fill(0, 0, 0, 50);
    ellipse(cx + w * 0.06, baseY + 7, bW * 0.88, 10);

    // ── 2. Outer bowl body ──
    // Near-straight walls (slight trapezoid), rounded only at the very base.
    fill(cBody);
    stroke(cDark);
    strokeWeight(1.5);
    beginShape();
    // left rim
    vertex(cx - bW * 0.50, rimY);
    // left wall: goes straight down, only curves slightly inward right at the base
    bezierVertex(
      cx - bW * 0.50, rimY + bH * 0.65,
      cx - bW * 0.46, baseY,
      cx - bW * 0.10, baseY
    );
    // flat base
    vertex(cx + bW * 0.10, baseY);
    // right wall: mirrors left
    bezierVertex(
      cx + bW * 0.46, baseY,
      cx + bW * 0.50, rimY + bH * 0.65,
      cx + bW * 0.50, rimY
    );
    endShape(CLOSE);

    // ── 3. Inner concave cavity (dark oval = depth illusion) ──
    noStroke();
    fill(cInner);
    ellipse(cx, rimY + bH * 0.18, bW * 0.72, bH * 0.55);

    // ── 4. Oil surface inside (warm sheen when lit) ──
    if (litProg > 0) {
      fill(105, 84, 22, 110 * litProg);
      ellipse(cx - w * 0.04, rimY + bH * 0.22, bW * 0.52, bH * 0.32);
    }

    // ── 5. Rim highlight ──
    noFill();
    stroke(cRim);
    strokeWeight(this.special ? 3.5 : 2.5);
    arc(cx, rimY, bW, bH * 0.28, PI, TWO_PI);

    // ── 5b. Special diya: gold beaded dots along rim + lotus motif ──
    if (this.special) {
      noStroke();
      fill(255, 215, 50);
      const dotCount = 8;
      for (let i = 0; i <= dotCount; i++) {
        const a = PI + (i / dotCount) * PI;
        ellipse(
          cx + cos(a) * bW * 0.47,
          rimY + sin(a) * bH * 0.14,
          w * 0.022, w * 0.022
        );
      }
      // Lotus motif inside bowl cavity
      this.drawLotus(cx - w * 0.04, rimY + bH * 0.38, bH * 0.28, cRim);
    }

    // ── 6. Spout (organic curved pinch of clay on the right side) ──
    const spoutBaseX = cx + bW * 0.47;
    const spoutBaseY = rimY + bH * 0.06;
    const spoutTipX  = spoutBaseX + w * 0.19;
    const spoutTipY  = rimY - bH * 0.22;  // slightly upturned

    fill(cBody);
    stroke(cDark);
    strokeWeight(1.5);
    beginShape();
    // Upper edge of spout (arcs up from bowl rim to tip)
    vertex(spoutBaseX, rimY);
    bezierVertex(
      spoutBaseX + w * 0.06, rimY - bH * 0.12,
      spoutTipX  - w * 0.05, spoutTipY - bH * 0.08,
      spoutTipX, spoutTipY
    );
    // Lower edge (returns back to bowl, slightly below rim)
    bezierVertex(
      spoutTipX  - w * 0.05, spoutTipY + bH * 0.14,
      spoutBaseX + w * 0.06, spoutBaseY + bH * 0.06,
      spoutBaseX, spoutBaseY
    );
    endShape(CLOSE);

    // ── 7. Wick ──
    const wickBaseX = spoutTipX - w * 0.01;
    const wickBaseY = spoutTipY;
    const wickTopX  = spoutTipX;
    const wickTopY  = spoutTipY - bH * 0.18;   // short wick

    noFill();
    stroke(litProg > 0.25 ? color(210, 162, 52) : color(38, 24, 8));
    strokeWeight(2);
    line(wickBaseX, wickBaseY, wickTopX, wickTopY);

    // Small cotton-ball at wick tip
    noStroke();
    fill(litProg > 0.25 ? color(225, 170, 65) : color(50, 34, 14));
    ellipse(wickTopX, wickTopY, w * 0.045, w * 0.045);

    pop();
  }

  /* ── Animated flame — crossfades between two frames of this diya's own
     randomized flipbook path, so every diya flickers through a unique,
     never-synchronized sequence of realistic flame poses ── */
  drawFlame(cx, cy, size, alpha) {
    if (size <= 0 || alpha <= 0) return;
    if (!this.flameFrames.length) return;

    // Light residual sway — most of the "life" now comes from the frame
    // swaps themselves, this just adds a little continuous motion between them.
    const wobble = Math.sin(frameCount * 0.05 + this.flamePhase) * size * 0.08;

    const cur  = this.flameFrames[this.flameCurrentIdx];
    const next = this.flameFrames[this.flameNextIdx];
    if (!cur || !next) return;

    const blend  = this.smoothBlend();
    const drawH  = size * 2.5;
    const drawW  = drawH * (cur.width / cur.height);

    push();
    noStroke();

    // Outer halo — soft warm bloom behind the sprite frames
    fill(255, 120, 0, 22 * alpha);
    ellipse(cx + wobble, cy - size * 1.1, size * 4.0, size * 4.5);

    push();
    translate(cx + wobble, cy);
    imageMode(CENTER);

    tint(255, 255 * alpha * (1 - blend));
    image(cur, 0, -drawH * 0.42, drawW, drawH);

    if (blend > 0) {
      tint(255, 255 * alpha * blend);
      image(next, 0, -drawH * 0.42, drawW, drawH);
    }

    noTint();
    pop();

    pop();
  }

  /* ── Eased 0→1 progress for the current frame crossfade (smoothstep) ── */
  smoothBlend() {
    const t = this.flameBlend;
    return t * t * (3 - 2 * t);
  }

  /* ── Soft radial glow around lit flame ── */
  drawAmbientGlow(cx, cy, w) {
    push();
    noStroke();
    // Fewer, wider steps on mobile to halve the ellipse draw-call count per lit diya
    const glowStep = (typeof isMobile !== "undefined" && isMobile) ? w * 0.52 : w * 0.30;
    for (let r = w * 1.8; r > w * 0.25; r -= glowStep) {
      fill(255, 168, 42, map(r, w * 0.25, w * 1.8, 32, 0));
      ellipse(cx, cy - w * 0.18, r * 2, r * 1.3);
    }
    pop();
  }

  /* ── Lotus motif painted inside special diya bowls ── */
  drawLotus(cx, cy, r, petalColor) {
    push();
    noStroke();
    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const a = (TWO_PI / petals) * i;
      push();
      translate(cx, cy);
      rotate(a);
      fill(red(petalColor), green(petalColor), blue(petalColor), 170);
      ellipse(0, -r * 0.62, r * 0.30, r * 0.70);
      pop();
    }
    // Centre dot
    fill(255, 235, 110, 230);
    ellipse(cx, cy, r * 0.32, r * 0.32);
    pop();
  }

  /* ── Day number label on unlit diya ── */
  drawDayLabel(x, y, w, h, alpha) {
    if (alpha <= 0) return;
    // Position text in the visual centre of the shallow bowl
    // Bowl: rimY = y + h*0.52, depth bH = h*0.30 → centre at y + h*0.67
    const bowlCentreX = x + w * 0.44;
    const bowlCentreY = y + h * 0.67;
    const bH = h * 0.30;
    push();
    noStroke();
    fill(255, 218, 128, 255 * alpha);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textFont("Georgia");
    textSize(bH * 0.58);   // fits comfortably in the shallow cavity
    text(this.id, bowlCentreX, bowlCentreY);
    pop();
  }

  /* ── Image payload bounce-in ── */
  drawImageContent() {
    const img = this.images[this.payload];
    if (!img) return;

    const s  = this.easeOutBack(this.contentProgress);
    const cx = this.px() + this.pw() / 2;
    const cy = this.py() + this.ph() / 2;

    push();
    translate(cx, cy);
    scale(s);
    imageMode(CENTER);
    tint(255, constrain(this.contentAlpha, 0, 1) * 255);
    image(img, 0, 0);
    noTint();
    pop();
  }

  advanceContentReveal() {
    if (this.contentProgress < 1) {
      this.contentProgress = Math.min(1, this.contentProgress + FLAME_ANIM_STEP);
    }

    if (!this.contentOpenedAt) return;
    const now = millis();

    if (!this.contentFadeStartedAt && now - this.contentOpenedAt >= CONTENT_DELAY_MS) {
      this.contentFadeStartedAt = now;
    }

    if (this.contentFadeStartedAt) {
      this.contentAlpha = 1 - constrain((now - this.contentFadeStartedAt) / CONTENT_FADE_MS, 0, 1);
      if (this.contentAlpha <= 0) {
        this.showingContent = false; // content hidden, diya stays lit
      }
    }
  }

  easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /* ── Locked shake ── */
  triggerLocked() {
    if (this.lockedSound) {
      try { this.lockedSound.currentTime = 0; this.lockedSound.play(); } catch (_) {}
    }
    this.shakeFrames = DIYA_SHAKE_FRAMES;
  }

  getShakeOffset() {
    if (this.shakeFrames <= 0) return 0;
    const t = 1 - this.shakeFrames / DIYA_SHAKE_FRAMES;
    return Math.sin(t * Math.PI * 6) * this.pw() * DIYA_SHAKE_MAG * (1 - t * 0.6);
  }

  /* ── Predicates ── */
  isLit()          { return this.state === "lit" || this.state === "lighting"; }
  /* ── ringUnlocked is a boolean computed by the caller (sketch.js) from
     whether every diya in the previous ring is fully lit ── */
  canOpen(ringUnlocked) { return Boolean(ringUnlocked); }
  handleVideoFinished() { /* diya stays lit after video closes */ }
  isVideoPayload() { return typeof this.payload === "string" && this.payload.startsWith("mp4:"); }
  isTextPayload()  { return this.payload === "text"; }
  isImagePayload() { return this.payload && !this.isVideoPayload() && !this.isTextPayload(); }
}
