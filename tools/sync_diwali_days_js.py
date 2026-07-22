"""
Regenerates assets/diwali-days-data.js from assets/diwali_days.json.

WHY THIS FILE EXISTS
---------------------
The calendar used to load its config with p5's loadJSON(), which performs a
fetch() under the hood. Browsers block fetch()/XHR requests to local files
when index.html is opened directly via file:// (no HTTP server) — Live
Server and GitHub Pages both serve over http(s), which is why the site
"worked everywhere except double-clicking index.html".

The fix is to embed the same JSON as a plain JS global (assets/diwali-days-data.js
sets `window.DIWALI_DAYS_DATA`), loaded via a normal <script src> tag. Script
tags are not subject to that fetch/CORS restriction, so this works identically
under file://, Live Server, and GitHub Pages.

assets/diwali_days.json remains the single source of truth (and is still what
the other tools/*.py tuning scripts read/write). Run this script whenever you
edit diwali_days.json (by hand or via another tool) to keep the embedded copy
in sync:

    python tools/sync_diwali_days_js.py
"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = REPO_ROOT / "assets" / "diwali_days.json"
JS_PATH = REPO_ROOT / "assets" / "diwali-days-data.js"

HEADER = """/* -----------------------------------------------------------
   AUTO-GENERATED — do not hand-edit.
   Source of truth: assets/diwali_days.json
   Regenerate with: python tools/sync_diwali_days_js.py

   Embeds the calendar config as a JS global instead of a .json file that
   has to be fetch()'d, so the page keeps working when opened directly via
   the file:// protocol (see tools/sync_diwali_days_js.py docstring).
----------------------------------------------------------- */
"""


def main():
    with open(JSON_PATH, encoding="utf-8") as f:
        cfg = json.load(f)

    body = json.dumps(cfg, indent=2, ensure_ascii=False)
    js = f"{HEADER}window.DIWALI_DAYS_DATA = {body};\n"

    JS_PATH.write_text(js, encoding="utf-8")
    print(f"Wrote {JS_PATH.relative_to(REPO_ROOT)} from {JSON_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
