#!/usr/bin/env python3
"""Post-process roster portraits to docs/world-design/roster-portrait-spec.md.

Sibling of process-flow-assets.py, and deliberately NOT that script.

WHY A SEPARATE PROCESSOR. process-flow-assets.py chroma-keys flat magenta out of props and despills
the fringe with `r > g + 20 and b > g + 20`. That is safe for the world's green/brown/blue landscape
props but it DESTROYS a character palette, because game/art.ts's HAIRS/SHIRTS contain pinks and
purples that the key and despill both read as magenta spill:
    rose-pink hair #d05a7a -> despilled to #6e5a6e   (muddy grey)
    heather shirt  #7a55a0 -> keyed fully TRANSPARENT (a hole in the torso)
    rose shirt     #b05a86 -> keyed fully TRANSPARENT (a hole in the torso)
Its `key: false` branch is no use either: it center-crops to a SQUARE, which would crop a 2:3 bust
to a head. So the roster gets its own recipe. Portraits are generated on flat ink and NEVER keyed.

THE RECIPE — the pipeline, not the prompt, is what makes this pixel art. Asking a generative model
for "16-bit pixel art" reliably returns a smooth painting with a pixel motif (the raw generations
carry ~2300 unique colours and soft anti-aliased gradients). So:
    LANCZOS down to the target width   (area-averaging; keeps the face readable)
  + MEDIANCUT quantize, dither=NONE    (flat fills, hard value steps, real pixel grid)
dither=NONE is load-bearing: ordered dither across a whole portrait is exactly the noise the bible
forbids ("dither only at value transitions"), and it shimmers under integer upscaling.

Width 72 was chosen empirically: 40px destroys the face, 96px still reads as a shrunken painting,
72px shows a real pixel grid with the features intact (~4.5x the ~16px world sprite).

SHEET MODE quantizes ONCE over the whole sheet before slicing, so all eight portraits provably share
one palette rather than eight independently-chosen ones. That is the difference between a roster and
eight unrelated pictures, and it is why the set is generated as a single image.

Usage:
  process-roster-portraits.py [<dir>]                  # each <name>_raw.png -> <name>.png
  process-roster-portraits.py <dir> --sheet <cols> <rows>   # _sheet_raw.png -> sliced portraits
Requires Pillow. Idempotent: consumes *_raw.png and removes the raws.
"""
import json
import os
import sys
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(HERE, "..", "apps", "web", "public", "assets", "roster")


def to_w(im, w):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def quantize(im, cap):
    return im.quantize(colors=cap, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")


INK = (28, 19, 38)  # #1c1326


def _bg_of(im):
    """The tile background = most common colour along the top edge (always tile, never figure)."""
    px = im.load()
    counts = {}
    for y in range(min(3, im.height)):
        for x in range(im.width):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def flatten_bg(im, tol=70):
    """Force every background pixel to exact ink, erasing vignette, glow and cast shadow.

    Spec §2: the tile behind the figure is flat ink, everywhere. The model varied this per
    generation — one portrait came back with a glow around the head, another with a hard drop
    shadow that read dirty and detached the figure. Rather than ask the model again, erase it.
    The tolerance is generous enough to swallow a soft shadow but far below the distance to any
    figure colour (the darkest skin, #7c4f33, sits ~150 away from ink).
    """
    im = im.convert("RGB")
    bg = _bg_of(im)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) <= tol:
                px[x, y] = INK
    return im


def _mask(im):
    """1-bit image: white where the figure is, black on the flat ink tile. Run flatten_bg first."""
    m = Image.new("L", im.size, 0)
    mp = m.load()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y] != INK:
                mp[x, y] = 255
    return m


def _body_bbox(im, erode=5):
    """Bounding box of the figure's BODY MASS, with thin protrusions eroded away.

    This is the fix for a real defect the 2-portrait test surfaced: Maren carries a fishing gaff
    whose hook rises above her head, so her raw bounding box was taller than Sorrel's, and scaling
    on raw bbox height rendered her head visibly SMALLER. That is exactly the "same roster, two
    pixel sizes" failure the whole spec exists to prevent — introduced, ironically, by the props
    that make the silhouettes work.

    A MinFilter erosion deletes anything thinner than the kernel (a gaff shaft, a feather, a spear)
    while leaving head and shoulders intact, so the measurement lands on the body every time. The
    scale it yields is then applied to the UNERODED figure, so the props still ship — they just no
    longer get a vote on how big the person is.
    """
    body = _mask(im).filter(ImageFilter.MinFilter(erode))
    bb = body.getbbox()
    return bb or _mask(im).getbbox()


def normalize(im, out_w, out_h, fill=0.94):
    """Re-anchor a figure deterministically: one scale, one baseline, centred. Spec §3.

    THE reason this exists: asked explicitly and directly to run the bust off the bottom edge, two
    independent generations floated it anyway, at y=95 and y=100 — different amounts, so no shared
    baseline. A model re-decides framing on every call, so framing cannot be prompted; it must be
    computed. We measure the figure and place it ourselves.

    `fill` is the per-character crop nudge from the cast table: the deliberate variance §4 asks for
    ("vary the crop slightly"), chosen by us rather than drifted into by the model. It is the share
    of canvas height the BODY occupies, so it must stay under 1.0 or the head is cropped at the top.
    """
    im = flatten_bg(im)
    bb = _body_bbox(im)
    if not bb:
        return im.resize((out_w, out_h), Image.LANCZOS)
    l, t, r, b = bb
    body_h = max(1, b - t)
    body_cx = (l + r) / 2

    # Scale on BODY height, not raw bbox height — see _body_bbox. This is what keeps every head the
    # same size and kills two apparent zoom levels in one roster.
    scale = (out_h * fill) / body_h
    big = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)

    canvas = Image.new("RGB", (out_w, out_h), INK)
    # Seat the body's bottom on the canvas floor and centre on the body's own centre-x. Props are
    # free to run off the top or the sides; that reads as natural and costs nothing.
    dx = round(out_w / 2 - body_cx * scale)
    dy = round(out_h - b * scale)
    canvas.paste(big, (dx, dy))
    return canvas


def process_sheet(d, cols, rows):
    raw = os.path.join(d, "_sheet_raw.png")
    if not os.path.exists(raw):
        print(f"[roster] no _sheet_raw.png in {d}")
        return 1
    jobs = json.load(open(os.path.join(d, "_manifest.json")))
    cap = int(jobs[0].get("cap", 24))
    w = int(jobs[0].get("size", 72))

    sheet = Image.open(raw).convert("RGB")
    # Quantize the WHOLE sheet first: one palette for the set, by construction, not by hope.
    sheet = quantize(sheet, cap)
    print(f"  [roster] sheet {sheet.size} quantized to {cap} colours (shared by all cells)")

    h = int(round(w * 3 / 2))
    cw, ch = sheet.width // cols, sheet.height // rows
    for i, job in enumerate(jobs):
        if i >= cols * rows:
            break
        cx, cy = i % cols, i // cols
        cell = sheet.crop((cx * cw, cy * ch, (cx + 1) * cw, (cy + 1) * ch))
        out = normalize(cell, w, h, fill=float(job.get("fill", 1.0)))
        # Re-quantize after resize: LANCZOS reintroduces intermediate colours at every edge. The
        # palette is already the sheet's, so this only snaps the resampled pixels back onto it.
        out = quantize(out, cap)
        out.save(os.path.join(d, f"{job['name']}.png"))
        print(f"  [roster] {job['name']:<14} {job.get('cast', ''):<8} {out.size}  fill={job.get('fill', 1.0)}")
    os.remove(raw)
    return 0


def shared_palette(images, cap):
    """One palette for the whole set, derived from the whole set.

    Quantizing each portrait independently gives each its own best-fit 24 colours, so eight
    portraits arrive with eight different palettes and the roster reads as eight unrelated pictures
    — the same class of failure as two pixel densities, just in colour. Tiling them into one strip
    and quantizing that once yields a single palette every portrait is then mapped onto, so palette
    coherence is a property of the method rather than a lucky outcome.
    """
    w = sum(i.width for i in images)
    h = max(i.height for i in images)
    strip = Image.new("RGB", (w, h), INK)
    x = 0
    for i in images:
        strip.paste(i, (x, 0))
        x += i.width
    return strip.quantize(colors=cap, method=Image.MEDIANCUT, dither=Image.NONE)


def process_singles(d):
    man = os.path.join(d, "_manifest.json")
    if not os.path.exists(man):
        print(f"[roster] no _manifest.json in {d}")
        return 1
    jobs = [j for j in json.load(open(man)) if os.path.exists(os.path.join(d, f"{j['name']}_raw.png"))]
    if not jobs:
        print("[roster] no raw portraits to process")
        return 1
    cap = int(jobs[0].get("cap", 24))

    # 1. Normalise every figure first (one scale, one baseline, flat ink) — see normalize().
    normed = {}
    for job in jobs:
        w = int(job.get("size", 72))
        h = int(round(w * 3 / 2))
        raw = os.path.join(d, f"{job['name']}_raw.png")
        normed[job["name"]] = normalize(Image.open(raw).convert("RGB"), w, h, fill=float(job.get("fill", 0.94)))

    # 2. Derive ONE palette from all of them, then map each onto it.
    pal = shared_palette(list(normed.values()), cap)
    print(f"  [roster] one shared {cap}-colour palette derived across {len(normed)} portraits")

    for job in jobs:
        name = job["name"]
        im = normed[name].quantize(palette=pal, dither=Image.NONE).convert("RGB")
        im.save(os.path.join(d, f"{name}.png"))
        os.remove(os.path.join(d, f"{name}_raw.png"))
        print(f"  [roster] {name:<14}{job.get('cast', ''):<8} {im.size}  fill={job.get('fill')}")
    return 0


def adopt(name, raw_path, fill, d=None):
    """Fold ONE externally-supplied portrait into the existing set, without touching the others.

    For a hand-picked image (e.g. one chosen out of an earlier run's gallery) rather than a fresh
    generation. It gets the same treatment every other portrait got — flatten the tile to ink,
    measure the body, seat it on the floor, scale to its `fill` — and is then mapped onto the palette
    the EXISTING finals already share, rather than re-deriving a palette across the whole set.

    That direction matters. Re-deriving would perturb seven already-approved portraits to accommodate
    one newcomer; mapping the newcomer onto their palette leaves those seven byte-identical and still
    lands the new one in one shared palette. The roster stays coherent and the diff stays honest.
    """
    d = os.path.abspath(d or DEFAULT_DIR)
    jobs = json.load(open(os.path.join(d, "_manifest.json")))
    cap = int(jobs[0].get("cap", 24))
    w = int(jobs[0].get("size", 72))
    h = int(round(w * 3 / 2))

    existing = [
        Image.open(os.path.join(d, f"{j['name']}.png")).convert("RGB")
        for j in jobs
        if j["name"] != name and os.path.exists(os.path.join(d, f"{j['name']}.png"))
    ]
    if not existing:
        print("[roster] no existing portraits to borrow a palette from")
        return 1

    pal = shared_palette(existing, cap)
    im = normalize(Image.open(raw_path).convert("RGB"), w, h, fill=fill)
    im = im.quantize(palette=pal, dither=Image.NONE).convert("RGB")
    out = os.path.join(d, f"{name}.png")
    im.save(out)
    print(f"  [roster] adopted {name}: {im.size} fill={fill}, mapped onto the palette of "
          f"{len(existing)} existing portraits ({cap} colours)")
    return 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--adopt" in sys.argv:
        i = sys.argv.index("--adopt")
        name, raw_path, fill = sys.argv[i + 1], sys.argv[i + 2], float(sys.argv[i + 3])
        return adopt(name, raw_path, fill)
    d = os.path.abspath(args[0]) if args else os.path.abspath(DEFAULT_DIR)
    if "--sheet" in sys.argv:
        i = sys.argv.index("--sheet")
        cols, rows = int(sys.argv[i + 1]), int(sys.argv[i + 2])
        return process_sheet(d, cols, rows)
    return process_singles(d)


if __name__ == "__main__":
    sys.exit(main())
