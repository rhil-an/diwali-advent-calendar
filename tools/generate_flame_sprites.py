"""
Generate 8 diya flame sprite frames with transparent backgrounds.
Frames vary in height, lean, and flicker width to simulate natural
flame motion when cycled in a crossfade flipbook (diya.js).

Output: assets/flame/flame_01.png … flame_08.png
"""

import os
import math
import numpy as np
from PIL import Image, ImageFilter

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "flame")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Canvas size for each sprite (larger than the diya hit-box so the glow
# can extend above; the diya.js drawFlame() scales the sprite to fit).
W, H = 120, 200


def smooth(t):
    """Smoothstep for gentle gradient falloff."""
    return t * t * (3 - 2 * t)


def build_flame_mask(
    height_frac: float,      # 0-1  how tall the flame core is relative to H
    lean_frac: float,        # -1..1  horizontal lean of the flame tip
    width_frac: float,       # 0-1  base width multiplier
    tip_squash: float,       # 0-1  how much the tip narrows
) -> np.ndarray:
    """Return a float32 alpha mask (H×W, 0-1) shaped like a diya flame."""
    xs = np.linspace(-1, 1, W)
    ys = np.linspace(0, 1, H)
    xv, yv = np.meshgrid(xs, ys[::-1])  # yv=1 at bottom, yv=0 at top

    flame_h = height_frac             # normalised flame height in [0,1] coord space
    base_w  = 0.55 * width_frac       # half-width at the base

    # Elliptical cross-section: width narrows toward tip with a lean offset
    tip_x     = lean_frac * 0.4       # tip is offset from centre by lean
    t_along   = yv / max(flame_h, 0.01)   # 0 at tip, 1 at base (within flame height)
    t_along   = np.clip(t_along, 0, 1)

    # Cross-section width follows a smooth parabola: widest at base, pinched at tip
    half_w = base_w * (1 - smooth(1 - t_along) * tip_squash) * (1 - t_along * 0.1)

    # Centre x shifts toward lean_frac as we go up
    cx = tip_x * (1 - t_along)

    # Signed distance from the flame centre axis, normalised by half-width
    dist = (xv - cx) / np.maximum(half_w, 1e-6)

    # Core: 1 inside the flame body, falling off with squared distance
    core = np.clip(1 - dist ** 2, 0, 1)
    core *= np.clip(1 - (yv - flame_h) / 0.05, 0, 1)  # fade above tip
    core *= np.clip(yv / 0.12, 0, 1)                   # fade at very base (wax join)

    # Outer soft halo (wider than core)
    halo_w = half_w * 1.7
    halo_dist = (xv - cx) / np.maximum(halo_w, 1e-6)
    halo = np.clip(1 - halo_dist ** 2, 0, 1) ** 2
    halo *= np.clip(1 - (yv - flame_h * 1.15) / 0.08, 0, 1)
    halo *= np.clip(yv / 0.08, 0, 1)

    mask = np.clip(core * 0.9 + halo * 0.45, 0, 1)
    return mask.astype(np.float32)


def flame_rgba(mask: np.ndarray) -> np.ndarray:
    """
    Colour the flame with a warm gradient: white-yellow core → orange → red rim.
    Returns an RGBA uint8 array of shape (H, W, 4).
    """
    # Normalise mask so 1 = densest point
    m = mask / max(mask.max(), 1e-6)

    # Colour stops (inner → outer):  white, warm yellow, deep orange, blood orange
    # Each channel is a piecewise blend across the mask value [0,1].
    # m=1 → white-yellow centre;  m~0.5 → orange;  m<0.15 → dark red → transparent
    r = np.where(m > 0.75, 255,
        np.where(m > 0.45, np.interp(m, [0.45, 0.75], [255, 255]),
        np.where(m > 0.15, np.interp(m, [0.15, 0.45], [190, 255]),
                           np.interp(m, [0,    0.15], [80,  190]))))

    g = np.where(m > 0.75, np.interp(m, [0.75, 1.0], [240, 255]),
        np.where(m > 0.45, np.interp(m, [0.45, 0.75], [100, 240]),
        np.where(m > 0.15, np.interp(m, [0.15, 0.45], [30,  100]),
                           np.interp(m, [0,    0.15], [0,   30]))))

    b = np.where(m > 0.80, np.interp(m, [0.80, 1.0], [120, 200]),
        np.where(m > 0.50, np.interp(m, [0.50, 0.80], [0,  120]),
                           0.0))

    # Alpha: opaque in core, soft edge falloff
    a = np.clip(m * 1.6, 0, 1)
    a = smooth(a)  # smoothstep for softer anti-aliased edges

    rgba = np.stack([r, g, b, a * 255], axis=-1).astype(np.uint8)
    return rgba


# 8 flame pose definitions: (height_frac, lean_frac, width_frac, tip_squash)
POSES = [
    (0.72, 0.00, 1.00, 0.90),   # 01 — tall, straight, narrow tip
    (0.65, 0.15, 1.05, 0.85),   # 02 — medium, slight right lean
    (0.70, -0.10, 0.95, 0.88),  # 03 — medium-tall, slight left lean
    (0.60, 0.22, 1.10, 0.80),   # 04 — shorter, wider, right lean
    (0.75, -0.18, 0.92, 0.92),  # 05 — tallest, left lean, narrow
    (0.63, 0.08, 1.08, 0.82),   # 06 — medium, slightly puffed
    (0.68, -0.05, 1.02, 0.87),  # 07 — medium-tall, near-straight
    (0.58, 0.20, 1.12, 0.78),   # 08 — short, widest, right lean
]

for i, (hf, lf, wf, ts) in enumerate(POSES, start=1):
    mask = build_flame_mask(hf, lf, wf, ts)

    # Light Gaussian blur for smooth anti-aliasing
    mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=1.2))
    mask = np.array(mask_img).astype(np.float32) / 255.0

    rgba = flame_rgba(mask)
    img  = Image.fromarray(rgba, mode="RGBA")

    # Slight additional edge-softening pass on the alpha channel only
    r_c, g_c, b_c, a_c = img.split()
    a_c = a_c.filter(ImageFilter.GaussianBlur(radius=0.8))
    img = Image.merge("RGBA", (r_c, g_c, b_c, a_c))

    out_path = os.path.join(OUTPUT_DIR, f"flame_{i:02d}.png")
    img.save(out_path, format="PNG")
    print(f"Saved {out_path}")

print("All 8 flame sprites generated.")
