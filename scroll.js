/* -----------------------------------------------------------
   Scroll Banner — the "Countdown to Diwali" title ribbon
   Draws the standalone banner artwork (assets/banner/title-banner.png,
   generated separately from the scene background) and layers the title
   text on top of it. The text is auto-fit — shrunk and wrapped as needed —
   to a "safe area" rectangle calibrated to the artwork's blank interior,
   so edited text can never spill outside the ribbon no matter how long
   or short it is.
----------------------------------------------------------- */

const SCROLL_DESIGN_WIDTH = 1536; // reference width the numeric px fields were tuned against

class ScrollBanner {
  constructor(cfg = {}, bannerImg = null) {
    this.enabled    = cfg.enabled !== false;
    this.text       = cfg.text        || "Countdown to Diwali";
    this.textColor  = cfg.textColor   || "#7a1204";
    this.textShadow = cfg.textShadow  || "#ffe6b8";
    this.image      = bannerImg;

    // Layout — normalized (0-1) fractions of the canvas, so the banner
    // scales and repositions cleanly at any viewport size.
    this.x = cfg.x ?? 0.5;    // horizontal center
    this.y = cfg.y ?? 0.122;  // vertical center
    this.w = cfg.w ?? 0.62;   // overall width; height follows the image's own aspect ratio

    // The blank, decoration-free rectangle inside the banner artwork where
    // text is allowed to live, as fractions of the banner image's own
    // width/height (measured from assets/banner/title-banner.png). Keeping
    // this data-driven (rather than guessing from the canvas) is what
    // guarantees text never overlaps the ribbon's floral corners or rolled
    // ends even if the artwork is swapped out later.
    this.safeArea = cfg.safeArea || { x0: 0.15, x1: 0.85, y0: 0.28, y1: 0.72 };

    this.fontSizePx    = cfg.fontSize    ?? 60;  // starting/max size, tuned against SCROLL_DESIGN_WIDTH
    this.minFontSizePx = cfg.minFontSize ?? 14;  // never shrink smaller than this
    this.lineHeight    = cfg.lineHeight  ?? 1.08;
    this.maxLines      = cfg.maxLines    ?? 2;

    // Memoized text-fit result — recomputed only when banner size or text changes
    this._textCache    = null;
    this._textCacheKey = null;
  }

  /* ── Public API for dynamically changing the banner's text at runtime,
     e.g. from the browser console: scrollBanner.setText("Happy Diwali!") ── */
  setText(newText) {
    this.text = String(newText ?? "");
    this._textCache = null;
  }

  setColors({ textColor, textShadow } = {}) {
    if (textColor)  this.textColor  = textColor;
    if (textShadow) this.textShadow = textShadow;
  }

  /* ── Apply an active-layout banner block (position/size/fit), leaving the
     text and colours untouched. Called on load and whenever the responsive
     layout switches between landscape and portrait. ── */
  applyLayout(b = {}) {
    if (b.x != null)          this.x            = b.x;
    if (b.y != null)          this.y            = b.y;
    if (b.w != null)          this.w            = b.w;
    if (b.fontSize != null)   this.fontSizePx   = b.fontSize;
    if (b.minFontSize != null) this.minFontSizePx = b.minFontSize;
    if (b.lineHeight != null) this.lineHeight   = b.lineHeight;
    if (b.maxLines != null)   this.maxLines     = b.maxLines;
    if (b.safeArea)           this.safeArea     = b.safeArea;
    this._textCache = null;  // font size / safe-area may have changed
  }

  /* ── p5 fill()/stroke() don't reliably parse 8-digit #rrggbbaa hex across
     browsers, so alpha-blended tones are built through p5's color() instead ── */
  static withAlpha(hexColor, alpha) {
    const c = color(hexColor);
    return color(red(c), green(c), blue(c), alpha);
  }

  draw() {
    if (!this.enabled || !this.image) return;

    const cx = this.x * width;
    const cy = this.y * height;
    const bannerW = this.w * width;
    const bannerH = bannerW * (this.image.height / this.image.width);

    push();
    imageMode(CENTER);
    image(this.image, cx, cy, bannerW, bannerH);
    pop();

    if (this.text) this.drawFittedText(cx, cy, bannerW, bannerH);
  }

  /* ── Word-wraps + shrinks this.text until it fits entirely within the
     safe-area box (in both width and height), then draws it centered.
     This is what makes the banner text "un-overflowable": whatever the
     user types into the config, the loop below keeps backing off the font
     size and re-wrapping until it fits, down to a sane minimum. ── */
  drawFittedText(cx, cy, bannerW, bannerH) {
    const boxW  = (this.safeArea.x1 - this.safeArea.x0) * bannerW;
    const boxH  = (this.safeArea.y1 - this.safeArea.y0) * bannerH;
    const boxCx = cx + (((this.safeArea.x0 + this.safeArea.x1) / 2) - 0.5) * bannerW;
    const boxCy = cy + (((this.safeArea.y0 + this.safeArea.y1) / 2) - 0.5) * bannerH;

    push();
    textFont("Cinzel, Georgia, serif");
    textStyle(BOLD);
    textAlign(CENTER, CENTER);

    // Cache key encodes every input that affects the fit result.
    // Rounded to integers so sub-pixel jitter never busts the cache.
    const cacheKey = `${Math.round(bannerW)}|${Math.round(bannerH)}|${this.text}|${this.fontSizePx}|${this.minFontSizePx}`;
    let lines, fontPx;

    if (this._textCache && this._textCacheKey === cacheKey) {
      ({ lines, fontPx } = this._textCache);
    } else {
      fontPx = (this.fontSizePx / SCROLL_DESIGN_WIDTH) * width;
      const minFontPx = Math.max(4, (this.minFontSizePx / SCROLL_DESIGN_WIDTH) * width);
      lines = [this.text];
      for (;;) {
        textSize(fontPx);
        lines = ScrollBanner.wrapToWidth(this.text, boxW, this.maxLines);
        const lineH    = fontPx * this.lineHeight;
        const totalH   = lineH * lines.length;
        const maxLineW = Math.max(...lines.map((l) => textWidth(l)));
        const fits     = totalH <= boxH && maxLineW <= boxW;
        if (fits || fontPx <= minFontPx) break;
        fontPx = Math.max(minFontPx, fontPx * 0.94);
      }
      this._textCache    = { lines, fontPx };
      this._textCacheKey = cacheKey;
    }

    textSize(fontPx);
    const lineH  = fontPx * this.lineHeight;
    const startY = boxCy - (lineH * (lines.length - 1)) / 2;

    for (let i = 0; i < lines.length; i++) {
      const ly = startY + i * lineH;
      noStroke();
      fill(ScrollBanner.withAlpha(this.textShadow, 170));
      text(lines[i], boxCx, ly + fontPx * 0.045);
      fill(this.textColor);
      text(lines[i], boxCx, ly);
    }

    pop();
  }

  /* ── Greedy word-wrap against the current p5 text state (font/size must
     already be set via textSize()/textFont() before calling). Caps the
     result at maxLines by cramming any overflow words onto the last line
     (the caller's shrink loop will then keep reducing font size until that
     last line also fits, rather than ever truncating the title). ── */
  static wrapToWidth(str, maxW, maxLines) {
    const words = String(str).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      if (lines.length === maxLines - 1) {
        current += " " + words.slice(i).join(" ");
        break;
      }
      const test = current + " " + words[i];
      if (textWidth(test) <= maxW) {
        current = test;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
    return lines;
  }
}
