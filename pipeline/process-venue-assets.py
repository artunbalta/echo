#!/usr/bin/env python3
"""Post-process generated venue art (§5): chroma-key the magenta background out of the
props, autocrop to content, and downscale to the committed target sizes; the plaza tile is
just downscaled (it must stay seamless). Requires Pillow. Idempotent: consumes *_raw.png
and writes <name>.png next to them, then removes the raws."""
import os
from PIL import Image

A = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "assets", "venue")

# name -> target width (props are keyed; plaza is not). Matches VenueScene footprints.
PROPS = {"booth": 112, "stage": 160, "portal": 48}


def chroma_key(img, tol=70):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - 255) < tol and g < 110 and abs(b - 255) < tol and r > 150 and b > 150:
                px[x, y] = (r, g, b, 0)
    return img


def autocrop(img, pad=2):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    l, t, r, b = bb
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def to_w(img, w):
    return img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)


def main():
    for name, w in PROPS.items():
        raw = os.path.join(A, f"{name}_raw.png")
        if not os.path.exists(raw):
            continue
        im = to_w(autocrop(chroma_key(Image.open(raw))), w)
        im.save(os.path.join(A, f"{name}.png"))
        os.remove(raw)
        print(f"  {name}: {im.size}")

    raw = os.path.join(A, "plaza_raw.png")
    if os.path.exists(raw):
        Image.open(raw).convert("RGB").resize((64, 64), Image.LANCZOS).save(os.path.join(A, "plaza.png"))
        os.remove(raw)
        print("  plaza: (64, 64)")


if __name__ == "__main__":
    main()
