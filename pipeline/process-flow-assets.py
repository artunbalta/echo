#!/usr/bin/env python3
"""Post-process generated flow art (Step 6). Generalizes process-island-assets.py to ANY flow dir:
reads each `apps/web/public/assets/<flow>/_manifest.json` (written by generate-flow-assets.mjs),
chroma-keys magenta out of props (autocrop + downscale), keeps ground tiles opaque + square (so
they stay seamless under TilingSprite), and writes <name>.png from <name>_raw.png. Requires Pillow.
Idempotent: consumes *_raw.png, removes raws. Usage: process-flow-assets.py [<flow> ...] (all if none)."""
import json
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "assets")


def chroma_key(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r > 110 and b > 110 and g < min(r, b) - 35:        # flat magenta → transparent
                px[x, y] = (r, g, b, 0)
            elif r > g + 20 and b > g + 20:                       # despill magenta fringe
                px[x, y] = (min(r, g + 20), g, min(b, g + 20), a)
    return img


def autocrop(img, pad=2):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    l, t, r, b = bb
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def to_w(img, w):
    return img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)


def process_dir(flow):
    d = os.path.join(ROOT, flow)
    manifest = os.path.join(d, "_manifest.json")
    if not os.path.exists(manifest):
        return
    jobs = json.load(open(manifest))
    for job in jobs:
        name, raw = job["name"], os.path.join(d, f"{job['name']}_raw.png")
        if not os.path.exists(raw):
            continue
        if job.get("key"):                                        # prop: chroma-key + autocrop + width
            im = to_w(autocrop(chroma_key(Image.open(raw))), int(job.get("size", 32)))
        else:                                                     # tile: center-crop square + resize, opaque
            im = Image.open(raw).convert("RGB")
            side = min(im.size)
            l, t = (im.width - side) // 2, (im.height - side) // 2
            s = int(job.get("size", 64))
            im = im.crop((l, t, l + side, t + side)).resize((s, s), Image.LANCZOS)
        im.save(os.path.join(d, f"{name}.png"))
        os.remove(raw)
        print(f"  [{flow}] {name}: {im.size}")


def main():
    flows = sys.argv[1:] or [f for f in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, f))]
    for flow in flows:
        process_dir(flow)


if __name__ == "__main__":
    main()
