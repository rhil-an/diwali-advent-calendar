"""
Rebuilds assets/mandala/mandala-outer.png as a 10-petal ring (36 degrees apart)
so it matches the 10 outer diyas, one-to-one.

Approach: the original artwork (assets/mandala/mandala-outer-12petal-backup.png)
is a ring of 12 identical lotus petals every 30 degrees. We extract one petal
cell (an angular wedge around a source petal) and paste 10 rotated copies onto
a fresh black canvas at 36-degree spacing, starting with a petal at the top
(matching the original artwork's orientation and the top outer diya).

Composited with a "lighten" (max) blend so overlapping pixels near the seams
never go darker than either source, and the wedge mask edges are feathered so
petal boundaries blend smoothly instead of showing a hard cut line.
"""

from PIL import Image
import numpy as np

SRC_PATH = "assets/mandala/mandala-outer-12petal-backup.png"
OUT_PATH = "assets/mandala/mandala-outer.png"

N_PETALS = 10
TOP_ANGLE = -90.0          # degrees; -90 = straight up (matches original artwork + top diya)
WEDGE_HALF_DEG = 15.0       # half-width of the source wedge extracted per petal (matches original 30deg spacing)
FEATHER_DEG = 4.0          # soft falloff width at each wedge edge, in degrees


def build():
    im = Image.open(SRC_PATH).convert("RGB")
    w, h = im.size
    cx, cy = w / 2, h / 2

    yy, xx = np.mgrid[0:h, 0:w]
    angle_grid = np.degrees(np.arctan2(yy - cy, xx - cx))

    canvas = np.zeros((h, w, 3), dtype=np.float32)

    for k in range(N_PETALS):
        target_angle = TOP_ANGLE + k * (360.0 / N_PETALS)

        # Rotate the whole source image so the petal that currently sits at
        # TOP_ANGLE lands exactly on target_angle.
        rot = im.rotate(-(target_angle - TOP_ANGLE), resample=Image.BICUBIC, center=(cx, cy))
        rot_arr = np.array(rot).astype(np.float32)

        # Signed angular distance from target_angle, wrapped to [-180, 180]
        d = (angle_grid - target_angle + 180) % 360 - 180
        abs_d = np.abs(d)

        # Soft-edged wedge mask: 1 inside the wedge, fades to 0 over FEATHER_DEG
        # at the boundary, so adjacent petals blend instead of showing a hard seam.
        mask = np.clip((WEDGE_HALF_DEG - abs_d) / FEATHER_DEG + 0.5, 0.0, 1.0)
        mask3 = mask[..., None]

        contribution = rot_arr * mask3
        canvas = np.maximum(canvas, contribution)

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGB")
    out.save(OUT_PATH)
    print(f"Saved {OUT_PATH} ({out.size[0]}x{out.size[1]}, {N_PETALS} petals every {360/N_PETALS:.0f} deg)")


if __name__ == "__main__":
    build()
