#!/usr/bin/env python3
"""Post-process the legend book's plates (landing §1a). Sibling of process-roster-portraits.py.

Same lesson, same recipe: the PIPELINE is what makes a generation pixel art, not the prompt. Asking
a model for "16-bit pixel art" returns a smooth painting with a pixel motif, so:
    LANCZOS to the target width  ->  MEDIANCUT quantize onto ONE palette shared by all seven plates

The shared palette is the point. Seven plates quantized independently would each pick their own
best-fit colours and the book would read as seven unrelated pictures bound together — the same class
of failure as a roster with two pixel densities, just in colour. Tiling them and quantizing once
makes palette coherence a property of the method rather than a lucky outcome.

Not chroma-keyed: these are full-bleed scenes, not props. See process-roster-portraits.py for why
the magenta key in process-flow-assets.py must never touch character or scene art.

Requires Pillow. Idempotent: consumes *_raw.png and removes the raws.
"""
import json
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "apps", "web", "public", "assets", "legend")


def main():
    man = os.path.join(D, "_manifest.json")
    if not os.path.exists(man):
        print("[legend] no _manifest.json — nothing to process.")
        return
    jobs = [j for j in json.load(open(man)) if os.path.exists(os.path.join(D, f"{j['name']}_raw.png"))]
    if not jobs:
        print("[legend] no raw plates to process.")
        return
    cap = int(jobs[0].get("cap", 28))

    sized = {}
    for job in jobs:
        w = int(job.get("size", 128))
        im = Image.open(os.path.join(D, f"{job['name']}_raw.png")).convert("RGB")
        sized[job["name"]] = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)

    # One palette, derived from all of them at once.
    tw = sum(i.width for i in sized.values())
    th = max(i.height for i in sized.values())
    strip = Image.new("RGB", (tw, th), (28, 19, 38))
    x = 0
    for i in sized.values():
        strip.paste(i, (x, 0))
        x += i.width
    pal = strip.quantize(colors=cap, method=Image.MEDIANCUT, dither=Image.NONE)
    print(f"  [legend] one shared {cap}-colour palette across {len(sized)} plates")

    for name, im in sized.items():
        # dither=NONE: ordered dither across a whole plate is the noise the bible forbids
        # ("dither only at value transitions") and it shimmers under integer upscaling.
        out = im.quantize(palette=pal, dither=Image.NONE).convert("RGB")
        out.save(os.path.join(D, f"{name}.png"))
        os.remove(os.path.join(D, f"{name}_raw.png"))
        print(f"  [legend] {name:<14} {out.size}")


if __name__ == "__main__":
    main()
