"""
One-off utility: the AI-generated title banner comes back as flat RGB with a
baked-in checkerboard standing in for "transparency" (no real alpha channel).
This flood-fills the checkerboard from the image borders/corners and converts
it to a true alpha channel, then crops to the opaque content's bounding box.

Usage:
    python tools/extract_banner_alpha.py <input.png> <output.png>
"""

import sys
import cv2
import numpy as np


def extract_alpha(src_path, dst_path, neutral_thresh=12, light_thresh=170, feather=2):
    img = cv2.imread(src_path, cv2.IMREAD_COLOR)  # BGR
    if img is None:
        raise SystemExit(f"Could not read {src_path}")
    h, w = img.shape[:2]

    # The checkerboard alternates between two near-neutral (R~=G~=B) light
    # shades. Classify every pixel by color first (vectorized, no drift),
    # then only treat a checkerish blob as background if it's *connected to
    # the image border* — this keeps any similarly pale tones fully enclosed
    # inside the artwork (e.g. gold highlights) untouched.
    b, g, r = img[:, :, 0].astype(np.int16), img[:, :, 1].astype(np.int16), img[:, :, 2].astype(np.int16)
    chan_max = np.maximum(np.maximum(b, g), r)
    chan_min = np.minimum(np.minimum(b, g), r)
    candidate_bg = ((chan_max - chan_min) <= neutral_thresh) & (chan_min >= light_thresh)
    candidate_bg = candidate_bg.astype(np.uint8)

    num_labels, labels = cv2.connectedComponents(candidate_bg, connectivity=4)
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border_labels.discard(0)  # label 0 = non-candidate pixels, never background

    bg_mask = np.isin(labels, list(border_labels))

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    if feather > 0:
        alpha = cv2.GaussianBlur(alpha, (0, 0), feather)

    b, g, r = cv2.split(img)
    rgba = cv2.merge([b, g, r, alpha])

    ys, xs = np.where(alpha > 4)
    if len(xs) == 0:
        raise SystemExit("Nothing opaque detected — check tolerance.")
    pad = 4
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, w - 1)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, h - 1)
    rgba = rgba[y0:y1 + 1, x0:x1 + 1]

    cv2.imwrite(dst_path, rgba)
    print(f"Saved {dst_path}  size={rgba.shape[1]}x{rgba.shape[0]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    extract_alpha(sys.argv[1], sys.argv[2])
