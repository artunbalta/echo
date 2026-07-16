#!/usr/bin/env python3
"""Post-process the landing's roster portraits (§1b). Sibling of process-flow-assets.py, and
deliberately NOT that script: portraits must not be chroma-keyed.

WHY A SEPARATE PROCESSOR. process-flow-assets.py keys flat magenta out of props and despills the
fringe with `r > g + 20 and b > g + 20`. That is safe for the world's assets (green/brown/blue
landscape props) but destroys a character palette, because game/art.ts's HAIRS/SHIRTS contain
pinks and purples that the key and despill both read as magenta spill:
    rose-pink hair #d05a7a -> despilled to #6e5a6e   (muddy grey)
    heather shirt  #7a55a0 -> keyed fully TRANSPARENT (a hole in the torso)
    rose shirt     #b05a86 -> keyed fully TRANSPARENT (a hole in the torso)
Its `key: false` branch is no use either: it center-crops to a SQUARE, which would crop the 2:3
bust to a head. So the roster gets its own recipe.

THE RECIPE: no key, no crop — resize, then QUANTIZE. The portraits are generated on a flat ink
(#1c1326) background as rectangular 2:3 tiles (which is what a fighting-game roster tile is anyway)
and are then forced onto a real pixel grid. Opaque RGB out.

WHY QUANTIZE. Asking an image model for "16-bit pixel art" reliably yields a *smooth painted
illustration with a pixel motif*, not pixel art: the raw 1k generations here carry ~2300 unique
colours and soft anti-aliased gradients. A plain LANCZOS downscale preserves that softness, and the
art bible's first anchor is "crisp pixels, nearest-neighbour" with flat fills and dither only at
value transitions. So the pipeline, not the prompt, is what makes it pixel art:
    LANCZOS to target width  (good area-averaging, keeps the face readable)
  + MEDIANCUT quantize to a small adaptive palette, dither=NONE  (flat fills, hard value steps)
Width was chosen empirically at 72px: 40px destroys the face, 96px still reads as painting, 72px
shows a real pixel grid with the features intact — and is ~4.5x the ~16px world sprite, satisfying
"more detailed than the standard 16-bit world sprite" (§1b).

Requires Pillow. Idempotent: consumes *_raw.png and removes the raws.
Usage: process-roster-portraits.py            (reads apps/web/public/assets/roster/_manifest.json)
"""
import json
import os
from PIL import Image

D = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "assets", "roster")

# Adaptive palette size. 32 holds a skin tone, a hair colour, a tunic, the ink ground and the
# bible's soft upper-left cast shadow without banding the face; 24 starts to posterize the eyes.
COLORS = 32


def main():
    manifest = os.path.join(D, "_manifest.json")
    if not os.path.exists(manifest):
        print("[roster] no _manifest.json — nothing to process.")
        return
    for job in json.load(open(manifest)):
        name = job["name"]
        raw = os.path.join(D, f"{name}_raw.png")
        if not os.path.exists(raw):
            continue
        im = Image.open(raw).convert("RGB")
        w = int(job.get("size", 72))
        im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
        # dither=NONE is load-bearing: ordered dither across a whole portrait is exactly the noise
        # the bible forbids ("dither only at value transitions"), and it shimmers under upscaling.
        im = im.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
        im.save(os.path.join(D, f"{name}.png"))
        os.remove(raw)
        print(f"  [roster] {name}: {im.size} ({COLORS} colours)")


if __name__ == "__main__":
    main()
