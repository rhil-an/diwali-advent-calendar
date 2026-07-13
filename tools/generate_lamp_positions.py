"""
generate_lamp_positions.py
--------------------------
Generates diya lamp positions for assets/diwali_days.json using a
serpentine grid with per-cell random jitter.

Layout
------
15 lamps are arranged in a 3-column x 5-row serpentine grid so that
day numbers always flow in a predictable top-to-bottom reading order
(like a traditional advent calendar), while the jitter offsets make
the arrangement look organic rather than mechanical.

Serpentine order:
  Row 0  L->R : days  1  2  3
  Row 1  R->L : days  6  5  4
  Row 2  L->R : days  7  8  9
  Row 3  R->L : days 12 11 10
  Row 4  L->R : days 13 14 15

Special Diwali days (11-15, ring 2/3) fall naturally in rows 3-4
at the bottom of the canvas.

Jitter
------
x-jitter: +/- X_JITTER  (organic horizontal variance)
y-jitter: +/- Y_JITTER  (subtle; keeps rows visually separated)

Both jitter values are chosen so that no two adjacent lamps overlap
even in the worst case.

Usage
-----
    python tools/generate_lamp_positions.py            # new random layout
    python tools/generate_lamp_positions.py --seed 42  # reproducible
    python tools/generate_lamp_positions.py --dry-run  # preview, no write
"""

import json
import math
import random
import argparse
from pathlib import Path

# ---------------------------------------------------------------------------
# Grid configuration
# ---------------------------------------------------------------------------

COLS = 3
ROWS = 5

# Usable canvas area (normalised 0-1).
# Top margin leaves room for the scroll banner; bottom margin adds breathing room.
X_START, X_END = 0.10, 0.90
Y_START, Y_END = 0.15, 0.93

# Jitter (normalised, half-range).
# X_JITTER is large enough for visible organic placement.
# Y_JITTER is tight so row banding stays clear; guaranteed no vertical overlap
# with the 0.12 hit-box height and 0.156 row pitch (gap = 0.036 > 2*Y_JITTER).
X_JITTER = 0.055
Y_JITTER = 0.015

# Hit-box sizes (normalised), preserved from the original JSON format.
# Ring 1 lamps (days 1-10) are slightly larger than ring 2/3 (days 11-15).
RING1_W,  RING1_H  = 0.078, 0.120
RING23_W, RING23_H = 0.070, 0.108

# ---------------------------------------------------------------------------
# Serpentine grid generation
# ---------------------------------------------------------------------------

def _grid_centers() -> list[tuple[float, float]]:
    """
    Return (cx, cy) grid-cell centres for the serpentine sequence,
    in day order (index 0 = day 1, index 14 = day 15).
    """
    x_span = X_END - X_START
    y_span = Y_END - Y_START

    # Evenly-spaced column and row centres.
    col_centers = [X_START + x_span * (c + 0.5) / COLS for c in range(COLS)]
    row_centers = [Y_START + y_span * (r + 0.5) / ROWS for r in range(ROWS)]

    centers: list[tuple[float, float]] = []
    for row in range(ROWS):
        cols = range(COLS) if row % 2 == 0 else range(COLS - 1, -1, -1)
        for col in cols:
            centers.append((col_centers[col], row_centers[row]))

    return centers


def generate_positions() -> dict[int, dict]:
    """
    Return {diya_id: pos_dict} for all 15 lamps.
    Each pos uses the same normalised {x, y, w, h} format as diwali_days.json,
    where x, y is the top-left corner of the hit-box.
    """
    centers = _grid_centers()
    positions: dict[int, dict] = {}

    for idx, (cx, cy) in enumerate(centers):
        day = idx + 1  # days are 1-indexed

        # Choose hit-box size based on ring membership.
        w, h = (RING23_W, RING23_H) if day >= 11 else (RING1_W, RING1_H)

        # Apply jitter to the cell centre then convert to top-left corner.
        jx = random.uniform(-X_JITTER, X_JITTER)
        jy = random.uniform(-Y_JITTER, Y_JITTER)

        # Clamp so the hit-box never strays outside the canvas.
        x = max(0.0, min(1.0 - w, cx + jx - w / 2))
        y = max(0.0, min(1.0 - h, cy + jy - h / 2))

        positions[day] = {
            "x": round(x, 4),
            "y": round(y, 4),
            "w": w,
            "h": h,
        }

    return positions


# ---------------------------------------------------------------------------
# JSON patch
# ---------------------------------------------------------------------------

def patch_json(json_path: Path, positions: dict[int, dict], dry_run: bool):
    data = json.loads(json_path.read_text(encoding="utf-8"))

    for diya in data["diyas"]:
        lamp_id = diya["id"]
        if lamp_id in positions:
            diya["pos"] = positions[lamp_id]

    output = json.dumps(data, indent=2, ensure_ascii=False)

    if dry_run:
        print("\n--- dry-run: JSON not written ---")
        print(output)
    else:
        json_path.write_text(output + "\n", encoding="utf-8")
        print(f"  Written: {json_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate serpentine-grid lamp positions with jitter."
    )
    parser.add_argument("--seed",    type=int,  default=None,
                        help="Random seed for reproducible output.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print new positions without writing to disk.")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
        print(f"Seed: {args.seed}")

    repo_root = Path(__file__).resolve().parent.parent
    json_path = repo_root / "assets" / "diwali_days.json"

    print("Generating serpentine-grid lamp positions...")
    positions = generate_positions()

    # Pretty-print a diagram showing row/col assignment.
    centers = _grid_centers()
    print("\nLayout (day -> row, col, centre):")
    for idx, (cx, cy) in enumerate(centers):
        day = idx + 1
        row, col = divmod(idx, COLS)
        p = positions[day]
        print(f"  Day {day:>2}  row={row} col={col}"
              f"  grid=({cx:.3f},{cy:.3f})"
              f"  placed=({p['x'] + p['w']/2:.4f},{p['y'] + p['h']/2:.4f})")

    patch_json(json_path, positions, dry_run=args.dry_run)

    if not args.dry_run:
        print("\nDone. Reload index.html in the browser to see the new layout.")
        print("Re-run this script to get a fresh jitter variation.")
        print("Use --seed N for a reproducible result.")


if __name__ == "__main__":
    main()
