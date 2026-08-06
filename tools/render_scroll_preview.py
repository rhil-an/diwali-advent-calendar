"""
Ports the ScrollBanner draw logic (scroll.js) to PIL so the ribbon's shape/
colors/position can be previewed against the real background image without
opening a browser.

Usage:
    python tools/render_scroll_preview.py [output.png]

Reads the scrollBanner block from assets/diwali_days.json. NOT a pixel-perfect
match (font metrics / antialiasing differ from p5.js+Cinzel), but faithfully
reproduces the geometry so layout + color choices can be sanity-checked.
"""
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1536, 1024
FONT_PATH = "C:/Windows/Fonts/georgiab.ttf"


def shape(t):
    u = 2 * t - 1
    return 1 - u * u


def hex_to_rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


class ScrollBanner:
    def __init__(self, cfg):
        self.text = cfg.get("text", "Diwali Advent Calendar")
        self.textColor = hex_to_rgb(cfg.get("textColor", "#6b1710"))
        self.textShadow = hex_to_rgb(cfg.get("textShadow", "#ffe2aa"))
        self.ribbonColor = hex_to_rgb(cfg.get("ribbonColor", "#e7c08a"))
        self.ribbonMid = hex_to_rgb(cfg.get("ribbonMid", "#d9a568"))
        self.ribbonDark = hex_to_rgb(cfg.get("ribbonDark", "#b97f45"))
        self.trimColor = hex_to_rgb(cfg.get("trimColor", "#5c3014"))
        self.x = cfg.get("x", 0.5)
        self.y = cfg.get("y", 0.083)
        self.w = cfg.get("w", 0.80)
        self.h = cfg.get("h", 0.145)
        self.arch = cfg.get("arch", 0.62)
        self.fontSizePx = cfg.get("fontSize", 46)

    def draw(self, base):
        cx = self.x * WIDTH
        cy = self.y * HEIGHT
        bannerW = self.w * WIDTH
        bannerH = self.h * HEIGHT
        halfW = bannerW / 2
        bandHalf = bannerH * 0.24
        archAmount = bannerH * self.arch
        curlR = bannerH * 0.30
        curlInset = bannerW * 0.075

        overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        def pt(x, y):
            return (cx + x, cy + y)

        # shadow
        pts = []
        steps = 24
        for i in range(steps + 1):
            t = i / steps
            x = -halfW + curlInset * 0.4 + t * (2 * halfW - curlInset * 0.8)
            y = bandHalf * 1.35 - archAmount * shape(t) + 5
            pts.append(pt(x, y))
        for i in range(steps, -1, -1):
            t = i / steps
            x = -halfW + curlInset * 0.4 + t * (2 * halfW - curlInset * 0.8)
            y = -bandHalf * 1.1 - archAmount * shape(t) + 5
            pts.append(pt(x, y))
        draw.polygon(pts, fill=(0, 0, 0, 60))

        # ribbon band
        x0 = -halfW + curlInset * 0.55
        x1 = halfW - curlInset * 0.55
        span = x1 - x0
        steps = 40

        base_pts = []
        for i in range(steps + 1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            base_pts.append(pt(x, -bandHalf - lift))
        for i in range(steps, -1, -1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            scallop = math.sin(t * math.pi * 18) * bandHalf * 0.08
            base_pts.append(pt(x, bandHalf - lift + scallop))
        draw.polygon(base_pts, fill=self.ribbonColor + (255,))

        dark_pts = []
        for i in range(steps + 1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            dark_pts.append(pt(x, bandHalf * 0.15 - lift))
        for i in range(steps, -1, -1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            scallop = math.sin(t * math.pi * 18) * bandHalf * 0.08
            dark_pts.append(pt(x, bandHalf - lift + scallop))
        draw.polygon(dark_pts, fill=self.ribbonDark + (85,))

        sheen_pts = []
        for i in range(steps + 1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            sheen_pts.append(pt(x, -bandHalf - lift))
        for i in range(steps, -1, -1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            sheen_pts.append(pt(x, -bandHalf * 0.35 - lift))
        draw.polygon(sheen_pts, fill=(255, 255, 255, 35))

        # end curls
        for dir_, cxLocal in ((-1, -halfW + curlInset), (1, halfW - curlInset)):
            t = 0.02 if dir_ < 0 else 0.98
            lift = archAmount * shape(t)
            cyLocal = -lift + bandHalf * 0.1
            ccx, ccy = pt(cxLocal, cyLocal)

            def ell(dx, dy, w, h, color, a=255):
                draw.ellipse([ccx + dx - w / 2, ccy + dy - h / 2, ccx + dx + w / 2, ccy + dy + h / 2], fill=color + (a,))

            ell(0, 0, curlR * 1.15, curlR * 2.05, self.ribbonDark)
            ell(dir_ * curlR * 0.12, 0, curlR * 0.95, curlR * 1.85, self.ribbonColor)
            ell(dir_ * curlR * 0.32, 0, curlR * 0.55, curlR * 1.55, self.ribbonMid)
            ell(dir_ * curlR * 0.44, -curlR * 0.25, curlR * 0.18, curlR * 0.9, (255, 255, 255), 60)
            draw.ellipse(
                [ccx - curlR * 1.15 / 2, ccy - curlR * 2.05 / 2, ccx + curlR * 1.15 / 2, ccy + curlR * 2.05 / 2],
                outline=self.trimColor + (255,),
                width=max(1, int(curlR * 0.05)),
            )

        # trim
        top_line = []
        for i in range(steps + 1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            top_line.append(pt(x, -bandHalf - lift))
        draw.line(top_line, fill=self.trimColor + (255,), width=max(2, int(bandHalf * 0.05)), joint="curve")

        bot_line = []
        for i in range(steps + 1):
            t = i / steps
            x = x0 + t * span
            lift = archAmount * shape(t)
            scallop = math.sin(t * math.pi * 18) * bandHalf * 0.08
            bot_line.append(pt(x, bandHalf - lift + scallop))
        draw.line(bot_line, fill=self.trimColor + (255,), width=max(2, int(bandHalf * 0.05)), joint="curve")

        # text (approximate — no per-char rotation, just placed along mean arch)
        fontPx = (self.fontSizePx / 1536) * WIDTH
        maxTextSpan = halfW * 1.62
        font = ImageFont.truetype(FONT_PATH, int(fontPx))
        bbox = draw.textbbox((0, 0), self.text, font=font)
        totalTextW = bbox[2] - bbox[0]
        if totalTextW > maxTextSpan:
            scale = maxTextSpan / totalTextW
            fontPx = max(fontPx * scale, WIDTH * 0.012)
            font = ImageFont.truetype(FONT_PATH, int(fontPx))
            bbox = draw.textbbox((0, 0), self.text, font=font)
            totalTextW = bbox[2] - bbox[0]

        usableSpan = min(maxTextSpan, totalTextW * 1.15)
        textArch = archAmount * 0.82
        cursor = -totalTextW / 2
        for ch in self.text:
            chbbox = draw.textbbox((0, 0), ch, font=font)
            chW = chbbox[2] - chbbox[0]
            chCenterX = cursor + chW / 2
            t = min(1, max(0, chCenterX / usableSpan + 0.5))
            lift = textArch * shape(t)
            tx, ty = pt(chCenterX, -lift)
            draw.text((tx, ty + fontPx * 0.05), ch, font=font, fill=self.textShadow + (200,), anchor="mm")
            draw.text((tx, ty), ch, font=font, fill=self.textColor + (255,), anchor="mm")
            cursor += chW

        base.paste(Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "tools/scroll_preview.png"
    json_path = "assets/diwali_days.json"

    bg = Image.open("assets/images/backgrounds/advent-background.jpg").convert("RGB").resize((WIDTH, HEIGHT))

    with open(json_path, encoding="utf-8") as f:
        cfg = json.load(f)

    banner = ScrollBanner(cfg.get("scrollBanner", {}))
    banner.draw(bg)
    bg.save(out_path)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
