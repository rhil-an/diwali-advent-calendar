"""
Computes new x/y/w/h for ring-2 and ring-3 diyas (lamps), scaling them toward
the mandala center and shifting up, so they + the middle/center mandala art
nest inside the outer flower's hole instead of poking past its petals.

Prints a JSON snippet with the new coordinates, and optionally writes a
transformed diwali_days.json copy for preview rendering.
"""
import json
import math
import sys

WIDTH, HEIGHT = 1536, 1024
WHEEL_OFFSET_Y = 0.0736
MANDALA_CX = 0.5
MANDALA_CY = 0.60

CX = MANDALA_CX * WIDTH
CY = (MANDALA_CY + WHEEL_OFFSET_Y) * HEIGHT

# Tunables
LAMP_SCALE = 0.80      # shrink factor applied to each lamp's radius from center
LAMP_UP_SHIFT_PX = 22  # additional upward shift (px) applied after scaling
SIZE_SCALE = 0.88      # shrink factor applied to lamp w/h


def transform(d):
    x = d["x"] * WIDTH
    y = (d["y"] + WHEEL_OFFSET_Y) * HEIGHT
    w = d["w"] * WIDTH
    h = d["h"] * HEIGHT
    ccx = x + w / 2
    ccy = y + h / 2

    dx = (ccx - CX) * LAMP_SCALE
    dy = (ccy - CY) * LAMP_SCALE - LAMP_UP_SHIFT_PX

    new_w = w * SIZE_SCALE
    new_h = h * SIZE_SCALE
    new_ccx = CX + dx
    new_ccy = CY + dy
    new_x = new_ccx - new_w / 2
    new_y = new_ccy - new_h / 2

    return {
        "x": round(new_x / WIDTH, 4),
        "y": round(new_y / HEIGHT - WHEEL_OFFSET_Y, 4),
        "w": round(new_w / WIDTH, 4),
        "h": round(new_h / HEIGHT, 4),
    }


def main():
    with open("assets/diwali_days.json", encoding="utf-8") as f:
        cfg = json.load(f)

    for d in cfg["diyas"]:
        if d["ring"] in (2, 3):
            new_vals = transform(d)
            print(d["id"], d["ring"], new_vals)
            d.update(new_vals)

    if len(sys.argv) > 1:
        with open(sys.argv[1], "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        print("Wrote", sys.argv[1])


if __name__ == "__main__":
    main()
