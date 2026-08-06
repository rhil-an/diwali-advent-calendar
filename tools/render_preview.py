"""
Renders a preview PNG of the background + mandala layers + diya markers,
replicating the positioning math in sketch.js / diya.js, so layout tweaks
can be visually checked without opening a browser.

Usage:
    python tools/render_preview.py [output.png]

Reads tunable constants from below — keep these in sync with sketch.js
when experimenting with new values (they are NOT read from sketch.js).
"""
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = "."

WIDTH, HEIGHT = 1536, 1024
SCROLL_DESIGN_WIDTH = 1536

FONT_CANDIDATES = [
    "C:/Windows/Fonts/georgia.ttf",
    "C:/Windows/Fonts/georgiab.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap_to_width(draw, text, font, max_w, max_lines):
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for i in range(1, len(words)):
        if len(lines) == max_lines - 1:
            current += " " + " ".join(words[i:])
            break
        test = current + " " + words[i]
        w = draw.textbbox((0, 0), test, font=font)[2]
        if w <= max_w:
            current = test
        else:
            lines.append(current)
            current = words[i]
    lines.append(current)
    return lines


def draw_scroll_banner(canvas, cfg, banner_img):
    scfg = cfg.get("scrollBanner") or {}
    if scfg.get("enabled") is False or not banner_img:
        return canvas
    text = scfg.get("text", "Diwali Advent Calendar")

    x = scfg.get("x", 0.5) * WIDTH
    y = scfg.get("y", 0.122) * HEIGHT
    banner_w = scfg.get("w", 0.62) * WIDTH
    banner_h = banner_w * (banner_img.height / banner_img.width)

    resized = banner_img.resize((int(banner_w), int(banner_h)), Image.LANCZOS)
    canvas.paste(resized, (int(x - banner_w / 2), int(y - banner_h / 2)), resized)

    if not text:
        return canvas

    safe = scfg.get("safeArea", {"x0": 0.15, "x1": 0.85, "y0": 0.28, "y1": 0.72})
    box_w = (safe["x1"] - safe["x0"]) * banner_w
    box_h = (safe["y1"] - safe["y0"]) * banner_h
    box_cx = x + (((safe["x0"] + safe["x1"]) / 2) - 0.5) * banner_w
    box_cy = y + (((safe["y0"] + safe["y1"]) / 2) - 0.5) * banner_h

    draw = ImageDraw.Draw(canvas)
    font_px = (scfg.get("fontSize", 60) / SCROLL_DESIGN_WIDTH) * WIDTH
    min_font_px = max(4, (scfg.get("minFontSize", 14) / SCROLL_DESIGN_WIDTH) * WIDTH)
    max_lines = scfg.get("maxLines", 2)
    line_height_mult = scfg.get("lineHeight", 1.08)

    while True:
        font = load_font(max(1, int(font_px)))
        lines = wrap_to_width(draw, text, font, box_w, max_lines)
        line_h = font_px * line_height_mult
        total_h = line_h * len(lines)
        max_line_w = max(draw.textbbox((0, 0), l, font=font)[2] for l in lines)
        if (total_h <= box_h and max_line_w <= box_w) or font_px <= min_font_px:
            break
        font_px = max(min_font_px, font_px * 0.94)

    line_h = font_px * line_height_mult
    start_y = box_cy - (line_h * (len(lines) - 1)) / 2
    text_color = scfg.get("textColor", "#7a1204")
    for i, line in enumerate(lines):
        ly = start_y + i * line_h
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        draw.text((box_cx - tw / 2 - bbox[0], ly - line_h / 2 - bbox[1] + (line_h - font_px) / 2),
                   line, font=font, fill=text_color)

    return canvas

MANDALA_CX = 0.5
MANDALA_CY = 0.60
WHEEL_OFFSET_Y = 0.0736
MANDALA_RING_EXTRA_OFFSET_Y = {1: 0, 2: -0.01, 3: -0.01}
MANDALA_R = {1: 280 / 1536, 2: 105 / 1536, 3: 40 / 1536}
MANDALA_SCALE = 1.25
MANDALA_IMG_KEY = {1: "outer", 2: "middle", 3: "center"}

RING_COLORS = {1: (0, 200, 255), 2: (0, 255, 0), 3: (255, 0, 255)}


def screen_blend(base: Image.Image, overlay: Image.Image, cx, cy):
    """Composite overlay (RGBA) onto base using 'screen' blend, centered at (cx, cy) in base's pixel coords."""
    ow, oh = overlay.size
    ox = int(round(cx - ow / 2))
    oy = int(round(cy - oh / 2))

    base_rgb = base.convert("RGB")
    bpx = base_rgb.load()
    opx = overlay.convert("RGBA").load()

    for y in range(oh):
        by = oy + y
        if by < 0 or by >= HEIGHT:
            continue
        for x in range(ow):
            bx = ox + x
            if bx < 0 or bx >= WIDTH:
                continue
            r, g, b, a = opx[x, y]
            if a == 0:
                continue
            af = a / 255.0
            br, bg, bb = bpx[bx, by]
            # screen blend, then alpha-composite the blended result over base by af
            sr = 255 - ((255 - br) * (255 - r)) // 255
            sg = 255 - ((255 - bg) * (255 - g)) // 255
            sb = 255 - ((255 - bb) * (255 - b)) // 255
            nr = int(br + (sr - br) * af)
            ng = int(bg + (sg - bg) * af)
            nb = int(bb + (sb - bb) * af)
            bpx[bx, by] = (nr, ng, nb)
    return base_rgb


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "tools/preview.png"
    json_path = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/assets/diwali_days.json"
    debug = "--debug" in sys.argv

    bg = Image.open(f"{ROOT}/assets/images/backgrounds/advent-background.jpg").convert("RGB").resize((WIDTH, HEIGHT))
    mandala = {
        "outer": Image.open(f"{ROOT}/assets/mandala/mandala-outer.png").convert("RGBA"),
        "middle": Image.open(f"{ROOT}/assets/mandala/mandala-middle.png").convert("RGBA"),
        "center": Image.open(f"{ROOT}/assets/mandala/mandala-center.png").convert("RGBA"),
    }
    try:
        banner_img = Image.open(f"{ROOT}/assets/banner/title-banner.png").convert("RGBA")
    except FileNotFoundError:
        banner_img = None

    canvas = bg

    with open(json_path, encoding="utf-8") as f:
        cfg = json.load(f)

    canvas = draw_scroll_banner(canvas, cfg, banner_img)

    centers = {}
    for r in (1, 2, 3):
        img = mandala[MANDALA_IMG_KEY[r]]
        size = int(round(2 * MANDALA_R[r] * WIDTH * MANDALA_SCALE))
        resized = img.resize((size, size), Image.LANCZOS)
        cx = MANDALA_CX * WIDTH
        cy = (MANDALA_CY + WHEEL_OFFSET_Y + MANDALA_RING_EXTRA_OFFSET_Y[r]) * HEIGHT
        centers[r] = (cx, cy, size)
        canvas = screen_blend(canvas, resized, cx, cy)

    draw = ImageDraw.Draw(canvas)

    if debug:
        for r, (cx, cy, size) in centers.items():
            color = RING_COLORS[r]
            draw.line([cx - 15, cy, cx + 15, cy], fill=color, width=2)
            draw.line([cx, cy - 15, cx, cy + 15], fill=color, width=2)
            draw.ellipse([cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2], outline=color, width=1)

    for d in cfg["diyas"]:
        ring = d.get("ring", 1)
        x = d["x"] * WIDTH
        y = (d["y"] + WHEEL_OFFSET_Y) * HEIGHT
        w = d["w"] * WIDTH
        h = d["h"] * HEIGHT
        color = RING_COLORS.get(ring, (255, 255, 255))
        if debug:
            draw.rectangle([x, y, x + w, y + h], outline=color, width=2)
            draw.ellipse([x + w / 2 - 3, y + h / 2 - 3, x + w / 2 + 3, y + h / 2 + 3], fill=color)
        else:
            # Rough stand-in for the diya bowl silhouette (see diya.js drawDiyaBody)
            bowl_cx = x + w * 0.44
            rim_y = y + h * 0.52
            bowl_w = w * 0.82
            bowl_h = h * 0.30
            draw.ellipse(
                [bowl_cx - bowl_w / 2, rim_y, bowl_cx + bowl_w / 2, rim_y + bowl_h],
                fill=(200, 100, 40),
                outline=(60, 26, 8),
            )
            flame_r = w * 0.12
            draw.ellipse(
                [bowl_cx + bowl_w * 0.35 - flame_r, rim_y - flame_r * 1.6, bowl_cx + bowl_w * 0.35 + flame_r, rim_y + flame_r * 0.4],
                fill=(255, 170, 40),
            )

    canvas.save(out_path)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
