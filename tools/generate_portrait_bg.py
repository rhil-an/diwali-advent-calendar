"""
Generate a Diwali-themed portrait background for mobile (1080x1920, 9:16).

Design brief:
  - Deep indigo/purple gradient sky matching the existing landscape background palette
  - Warm amber/gold horizontal glow band at the lower third (where diyas sit)
  - Geometric rangoli arc hints in the center-bottom area (mandala landing zone)
  - Soft bokeh orbs for celebratory depth
  - Star field in upper half
  - All key visual interest concentrated in the center column
    so cover-clipping the left/right edges on ultra-narrow phones is safe.

Output: assets/images/backgrounds/advent-background-portrait.jpg
"""

import os
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)
np.random.seed(42)

W, H = 1080, 1920
OUT  = os.path.join(os.path.dirname(__file__), "..", "images", "advent-background-portrait.jpg")

# ─── Canvas ───────────────────────────────────────────────────────────────────
img  = Image.new("RGB", (W, H))
draw = ImageDraw.Draw(img)


# ─── 1. Gradient sky: deep midnight indigo at top → dark violet at bottom ─────
sky_top    = np.array([12,  12,  50])    # #0C0C32 near-black indigo
sky_mid    = np.array([20,  15,  65])    # #14104B deep violet
sky_bottom = np.array([30,  16,  55])    # #1E1037 warm purple-black

arr = np.zeros((H, W, 3), dtype=np.float32)
for y in range(H):
    t = y / (H - 1)
    if t < 0.5:
        t2 = t / 0.5
        arr[y, :] = sky_top * (1 - t2) + sky_mid * t2
    else:
        t2 = (t - 0.5) / 0.5
        arr[y, :] = sky_mid * (1 - t2) + sky_bottom * t2

img = Image.fromarray(arr.astype(np.uint8))
draw = ImageDraw.Draw(img)


# ─── 2. Warm amber horizon glow (lower third — diya & mandala zone) ───────────
glow_arr = np.array(img, dtype=np.float32)
glow_cy  = int(H * 0.72)   # glow centre-line (72% down)
glow_h   = int(H * 0.38)   # half-height of glow spread

for y in range(H):
    dist = abs(y - glow_cy) / glow_h
    t    = max(0.0, 1 - dist)
    t    = t * t * (3 - 2 * t)          # smoothstep
    warm = np.array([60, 28, 0]) * t    # amber tint
    glow_arr[y, :] = np.clip(glow_arr[y, :] + warm, 0, 255)

img  = Image.fromarray(glow_arr.astype(np.uint8))
draw = ImageDraw.Draw(img)


# ─── Helper: draw a soft glowing ellipse ──────────────────────────────────────
def soft_ellipse(buf: np.ndarray, cx, cy, rx, ry, color, alpha_peak=0.6):
    """Add a feathered ellipse blob to a float32 H×W×3 buffer."""
    ys = np.arange(H)
    xs = np.arange(W)
    xv, yv = np.meshgrid(xs, ys)
    d = ((xv - cx) / max(rx, 1)) ** 2 + ((yv - cy) / max(ry, 1)) ** 2
    t = np.clip(1 - d, 0, 1)
    t = t * t * (3 - 2 * t)
    for c_idx, c_val in enumerate(color):
        buf[:, :, c_idx] = np.clip(
            buf[:, :, c_idx] + t * c_val * alpha_peak,
            0, 255
        )


# ─── 3. Bokeh orbs (celebratory out-of-focus lights) ─────────────────────────
bokeh_buf = np.array(img, dtype=np.float32)
bokeh_palette = [
    [255, 200, 60],    # warm gold
    [255, 140, 30],    # amber
    [255, 230, 100],   # light gold
    [200, 100, 255],   # purple accent
    [255, 180, 80],    # orange-gold
]
bokeh_configs = [
    # cx_frac, cy_frac, rx, ry, color_idx, alpha
    (0.50, 0.15, 90, 90, 0, 0.18),
    (0.22, 0.08, 55, 55, 2, 0.12),
    (0.78, 0.10, 70, 70, 1, 0.14),
    (0.12, 0.30, 40, 40, 3, 0.10),
    (0.88, 0.25, 45, 45, 4, 0.11),
    (0.35, 0.05, 30, 30, 0, 0.09),
    (0.65, 0.06, 35, 35, 2, 0.08),
    (0.50, 0.65, 140, 80, 1, 0.22),   # mandala zone warm glow
    (0.50, 0.82, 200, 120, 0, 0.28),  # base diya zone
    (0.15, 0.70, 60, 60, 3, 0.08),
    (0.85, 0.68, 55, 55, 4, 0.09),
    (0.30, 0.90, 50, 50, 0, 0.12),
    (0.70, 0.88, 45, 45, 2, 0.10),
]
for cx_f, cy_f, rx, ry, ci, al in bokeh_configs:
    soft_ellipse(bokeh_buf, W * cx_f, H * cy_f, rx, ry, bokeh_palette[ci], al)

img  = Image.fromarray(np.clip(bokeh_buf, 0, 255).astype(np.uint8))
draw = ImageDraw.Draw(img)


# ─── 4. Star field (upper half only) ─────────────────────────────────────────
star_arr = np.array(img, dtype=np.float32)
for _ in range(320):
    sx = random.randint(0, W - 1)
    sy = random.randint(0, int(H * 0.55))
    brightness = random.uniform(0.3, 1.0)
    size = random.choice([1, 1, 1, 2])
    alpha = brightness * 0.7
    star_arr[sy, sx] = np.clip(
        star_arr[sy, sx] + np.array([255, 235, 190]) * alpha, 0, 255
    )
    if size == 2 and sx > 0 and sx < W - 1 and sy > 0 and sy < H - 1:
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            star_arr[sy+dy, sx+dx] = np.clip(
                star_arr[sy+dy, sx+dx] + np.array([255, 235, 190]) * alpha * 0.4,
                0, 255
            )

img  = Image.fromarray(star_arr.astype(np.uint8))
draw = ImageDraw.Draw(img)


# ─── 5. Rangoli arc rings (concentric, centered, lower-middle zone) ───────────
#   These form the visual "landing pad" for the p5 mandala overlay.
ring_cx = W // 2
ring_cy = int(H * 0.68)   # centre of the mandala / diya wheel in portrait layout

def draw_arc_dots(draw, cx, cy, radius, n_dots, color, dot_r=3):
    """Draw n_dots evenly spaced along a circle as small filled ellipses."""
    for i in range(n_dots):
        a = math.radians(i * 360 / n_dots - 90)
        x = cx + radius * math.cos(a)
        y = cy + radius * math.sin(a)
        draw.ellipse(
            [x - dot_r, y - dot_r, x + dot_r, y + dot_r],
            fill=color
        )

def draw_ring(draw, cx, cy, radius, color, width=2):
    """Faint thin circle ring."""
    bb = [cx - radius, cy - radius, cx + radius, cy + radius]
    draw.arc(bb, 0, 360, fill=color, width=width)

gold_dim  = (160, 120, 20, 55)   # RGBA with alpha for overlay approach
gold_mid  = (200, 160, 40, 70)
gold_brt  = (240, 200, 60, 90)

# Draw on a separate RGBA layer so we can alpha-blend
ring_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rdraw      = ImageDraw.Draw(ring_layer)

for r, col, w in [
    (300, (180, 130, 20, 35), 1),
    (250, (190, 140, 25, 45), 1),
    (200, (200, 150, 30, 55), 1),
    (160, (220, 170, 40, 65), 2),
    (120, (240, 190, 50, 75), 2),
    (80,  (255, 210, 60, 90), 2),
]:
    rdraw.arc([ring_cx-r, ring_cy-r, ring_cx+r, ring_cy+r], 0, 360, fill=col, width=w)

# Dot rings
for r, n, col in [
    (285, 40, (180, 130, 20, 50)),
    (195, 28, (210, 160, 35, 65)),
    (140, 20, (240, 195, 50, 80)),
]:
    draw_arc_dots(rdraw, ring_cx, ring_cy, r, n, col, dot_r=3)

# 8-petal lotus hint in the very centre
petal_r = 55
for i in range(8):
    a = math.radians(i * 45)
    px = ring_cx + petal_r * math.cos(a)
    py = ring_cy + petal_r * math.sin(a)
    rdraw.ellipse(
        [px - 18, py - 30, px + 18, py + 30],
        fill=(255, 210, 60, 60),
        outline=None
    )
    # rotate the ellipse — approximate by drawing two overlapping smaller ellipses
    rdraw.ellipse([px - 12, py - 22, px + 12, py + 22], fill=(255, 220, 80, 40))

# Merge ring layer
img = img.convert("RGBA")
img = Image.alpha_composite(img, ring_layer)
img = img.convert("RGB")
draw = ImageDraw.Draw(img)


# ─── 6. Golden vignette border (subtle frame) ─────────────────────────────────
vign_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vdraw      = ImageDraw.Draw(vign_layer)
for inset, alpha in [(0, 50), (20, 35), (40, 20), (80, 10)]:
    vdraw.rectangle(
        [inset, inset, W - inset, H - inset],
        outline=(200, 150, 30, alpha),
        width=2
    )
img = img.convert("RGBA")
img = Image.alpha_composite(img, vign_layer)
img = img.convert("RGB")


# ─── 7. Light Gaussian blur for polish ────────────────────────────────────────
img = img.filter(ImageFilter.GaussianBlur(radius=0.6))


# ─── 8. Save ──────────────────────────────────────────────────────────────────
img.save(OUT, format="JPEG", quality=92, optimize=True)
print(f"Portrait background saved to {OUT}")
print(f"Size: {img.size}")
