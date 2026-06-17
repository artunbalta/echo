#!/usr/bin/env python3
"""Post-process generated island art (BUILD-PLAN §0.A): chroma-key the magenta background out
of the decoration props, autocrop, and downscale to committed sizes; the ground tiles
(grass/water/sand) are kept opaque and resized to a tile multiple so they stay seamless under
TilingSprite. Requires Pillow. Idempotent: consumes *_raw.png, writes <name>.png, removes raws."""
import os
from PIL import Image

A = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "assets", "island")

# props -> target width (chroma-keyed + autocropped); tiles -> square size (kept seamless).
PROPS = {"tree": 36, "bush": 28, "flower": 16}
TILES = {"grass": 64, "water": 64, "sand": 48}


def chroma_key(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r > 110 and b > 110 and g < min(r, b) - 35:
                px[x, y] = (r, g, b, 0)
            elif r > g + 20 and b > g + 20:  # despill magenta fringe
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


def main():
    for name, w in PROPS.items():
        raw = os.path.join(A, f"{name}_raw.png")
        if not os.path.exists(raw):
            continue
        im = to_w(autocrop(chroma_key(Image.open(raw))), w)
        im.save(os.path.join(A, f"{name}.png"))
        os.remove(raw)
        print(f"  {name}: {im.size}")

    for name, s in TILES.items():
        raw = os.path.join(A, f"{name}_raw.png")
        if not os.path.exists(raw):
            continue
        # center-crop to square, then resize to the seamless tile size.
        im = Image.open(raw).convert("RGB")
        side = min(im.size)
        l = (im.width - side) // 2
        t = (im.height - side) // 2
        im = im.crop((l, t, l + side, t + side)).resize((s, s), Image.LANCZOS)
        im.save(os.path.join(A, f"{name}.png"))
        os.remove(raw)
        print(f"  {name}: {im.size}")


if __name__ == "__main__":
    main()
