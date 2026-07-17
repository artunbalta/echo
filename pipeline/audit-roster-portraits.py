#!/usr/bin/env python3
"""Audit roster portraits against docs/world-design/roster-portrait-spec.md.

This is the acceptance bar for §1b's roster art, and it is deliberately mechanical: the first
attempt at these portraits "looked fine" one at a time and only failed as a SET, which is exactly
the kind of failure an eyeball misses and a measurement catches.

Checks, in spec order:
  grid      — effective pixel size. A generative model asked for 16-bit pixel art returns a smooth
              painting with a pixel motif; this estimates the real block size by round-tripping the
              image through nearest-neighbour downscale/upscale at k=1..4 and picking the k that
              survives losslessly. Spec: 1 delivered px = 1 art pixel, so k must be 1 for all.
  palette   — unique colour count against the spec's hard cap.
  bg        — background flatness: share of pixels on the flat ink tile.
  baseline  — every bust must terminate at the bottom edge (no floating figures).
  eyeline   — figure bbox top, as a proxy for a shared crop anchor across the set.
  silhouette— THE bar. Pairwise IoU of the binary figure masks. Colour is not identity; shape is.
              Fails if any pair > 0.90 (indistinguishable) or the mean > 0.80 (recolored dolls).

Usage:  audit-roster-portraits.py [<dir>]        (default apps/web/public/assets/roster)
Exit 0 = the set passes. Exit 1 = it does not, with the reason.
Requires Pillow.
"""
import json
import os
import sys
from itertools import combinations
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(HERE, "..", "apps", "web", "public", "assets", "roster")

# --- the spec, as numbers -------------------------------------------------------------------
PALETTE_CAP = 24
# Calibrated against the measured baseline, not invented. The rejected first attempt — eight
# recolors of one template — scored mean 0.630 / worst 0.842. A bar of 0.80/0.90 would have PASSED
# the set we threw away. These sit below the baseline so the set has to actually differ.
MAX_PAIR_IOU = 0.80
MAX_MEAN_IOU = 0.55
BG_TOL = 26          # how far from the tile ink a pixel may sit and still count as background
MIN_BG_SHARE = 0.25  # a bust on a tile should leave at least this much visible background


def bg_color(im):
    """The tile background = the most common colour along the top edge (always sky/ink, never figure)."""
    px = im.load()
    counts = {}
    for y in range(0, 3):
        for x in range(im.width):
            c = px[x, y]
            counts[c] = counts.get(c, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def mask_of(im):
    """Binary figure mask: anything not close to the tile background.

    Uses a generous tolerance so the figure's own cast shadow on the background does NOT count as
    figure — otherwise a heavier shadow would masquerade as a bigger silhouette and the IoU check
    would compare shadows instead of people.
    """
    bg = bg_color(im)
    px = im.load()
    m = bytearray(im.width * im.height)
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y][:3]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            m[y * im.width + x] = 1 if d > BG_TOL else 0
    return m


def effective_pixel_size(im):
    """Largest k in 1..4 for which the image is exactly reconstructible from a k-block downscale.

    k=1 means every pixel is its own art pixel (what the spec demands). k>1 means the art was drawn
    on a coarser grid than it is delivered on — the "two pixel sizes in one roster" failure.
    """
    best = 1
    for k in (4, 3, 2):
        if im.width % k or im.height % k:
            continue
        small = im.resize((im.width // k, im.height // k), Image.NEAREST)
        back = small.resize((im.width, im.height), Image.NEAREST)
        if list(back.getdata()) == list(im.getdata()):
            best = k
            break
    return best


def iou(a, b, n):
    inter = union = 0
    for i in range(n):
        x, y = a[i], b[i]
        if x or y:
            union += 1
            if x and y:
                inter += 1
    return inter / union if union else 1.0


def head_iou(a, b, w, h, frac=0.42):
    """IoU restricted to the top of the canvas, where identity actually lives.

    Full-mask IoU turned out to be a near-useless metric here, and the evidence is blunt: the
    rejected set of eight recolored dolls scored mean 0.630, and the redesigned set of eight
    obviously-different people scored 0.621. Nine thousandths apart, opposite outcomes.

    The reason is that a bust's shoulders and chest fill the bottom ~60% of every tile and are
    necessarily similar, so they dominate the union and drown out the signal. Head outline, hair
    shape and the props that break the outline all live up top and are a small pixel fraction.
    Scoring only the top 42% measures the part a human actually reads a character by.
    """
    cut = int(h * frac)
    inter = union = 0
    for y in range(cut):
        for x in range(w):
            i = y * w + x
            p, q = a[i], b[i]
            if p or q:
                union += 1
                if p and q:
                    inter += 1
    return inter / union if union else 1.0


def write_silhouette_sheet(ims, masks, path, scale=3):
    """Black-on-parchment contact sheet of the masks — the literal 'black them out' test.

    The numeric IoU bar cannot see pose, attitude or expression, so this is the half of the test a
    human has to do. Rendered NEAREST at integer scale so the silhouettes stay on the pixel grid.
    """
    names = sorted(ims)
    w, h = next(iter(ims.values())).size
    pad = 4
    sheet = Image.new("RGB", ((w + pad) * len(names) * scale, h * scale), (244, 233, 208))
    for i, n in enumerate(names):
        cell = Image.new("RGB", (w, h), (244, 233, 208))
        cp = cell.load()
        m = masks[n]
        for y in range(h):
            for x in range(w):
                if m[y * w + x]:
                    cp[x, y] = (28, 19, 38)
        cell = cell.resize((w * scale, h * scale), Image.NEAREST)
        sheet.paste(cell, (i * (w + pad) * scale, 0))
    sheet.save(path)
    return path


def main():
    d = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR)
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    d = os.path.abspath(args[0] if args else DEFAULT_DIR)
    man = os.path.join(d, "_manifest.json")
    if not os.path.exists(man):
        print(f"[audit] no _manifest.json in {d}")
        return 1
    names = [j["name"] for j in json.load(open(man))]
    ims, missing = {}, []
    for n in names:
        p = os.path.join(d, f"{n}.png")
        if os.path.exists(p):
            ims[n] = Image.open(p).convert("RGB")
        else:
            missing.append(n)
    if missing:
        print(f"[audit] missing portraits: {', '.join(missing)}")
        return 1
    if not ims:
        print("[audit] nothing to audit")
        return 1

    fails = []
    print(f"auditing {len(ims)} portraits in {os.path.relpath(d, os.path.join(HERE, '..'))}\n")
    print(f"{'name':<14}{'size':<11}{'grid':<7}{'colors':<9}{'bg%':<8}{'baseline':<10}{'top':<6}")
    print("-" * 66)

    masks, sizes = {}, set()
    for n, im in ims.items():
        sizes.add(im.size)
        k = effective_pixel_size(im)
        colors = len(im.getcolors(maxcolors=1 << 24) or [])
        m = mask_of(im)
        masks[n] = m
        n_px = im.width * im.height
        bg_share = 1 - sum(m) / n_px
        ys = [y for y in range(im.height) if any(m[y * im.width + x] for x in range(im.width))]
        baseline, top = (max(ys), min(ys)) if ys else (-1, -1)

        flags = []
        if k != 1:
            flags.append(f"grid={k}")
            fails.append(f"{n}: art is drawn on a {k}px grid but delivered at 1px — mixed densities")
        if colors > PALETTE_CAP:
            flags.append("palette")
            fails.append(f"{n}: {colors} colours exceeds the {PALETTE_CAP} cap")
        if bg_share < MIN_BG_SHARE:
            flags.append("bg")
            fails.append(f"{n}: only {bg_share:.0%} background — the figure is not framed as a bust")
        if baseline < im.height - 2:
            flags.append("floats")
            fails.append(f"{n}: bust ends at y={baseline}, not the bottom edge ({im.height - 1})")
        print(
            f"{n:<14}{f'{im.width}x{im.height}':<11}{k:<7}{colors:<9}{bg_share*100:>5.1f}%  "
            f"{baseline:<10}{top:<6}{' '.join(flags)}"
        )

    print()
    if len(sizes) > 1:
        fails.append(f"portraits are not all the same canvas: {sorted(sizes)}")
        print(f"FAIL  mixed canvas sizes: {sorted(sizes)}")
    else:
        print(f"ok    one canvas for the whole set: {sizes.pop()}")

    # CROP ANCHOR. Checked as the baseline only, and the mask's TOP is deliberately not checked.
    #
    # An earlier version of this check compared the top of each mask and failed the set at a 25px
    # spread. That check was measuring the wrong thing twice over: props are *supposed* to break the
    # outline upward (a gaff, a feather, a spear shaft), and hair shape legitimately varies the head
    # outline by design — a tall topknot simply starts higher than a shaved skull. Penalising that
    # would penalise exactly what makes the silhouettes readable.
    #
    # The anchor invariant normalize() actually enforces is the BASELINE: every body is measured and
    # seated on the canvas floor, so no bust floats and none is cropped short. That is checked per
    # portrait above ("floats"), and it is the check that caught the real defect — the model floated
    # busts at y=95 and y=100 when asked directly not to. Scale consistency is likewise enforced by
    # construction (body height = fill x canvas height) rather than inferred from a mask edge here.
    floats = [n for n, im in ims.items()
              if max((y for y in range(im.height) if any(masks[n][y * im.width + x] for x in range(im.width))),
                     default=-1) < im.height - 2]
    if floats:
        print(f"FAIL  busts not seated on the canvas floor: {', '.join(floats)}")
    else:
        print(f"ok    every bust seated on the canvas floor (baseline y={im0h - 1 if (im0h := next(iter(ims.values())).height) else 0})")

    # --- THE silhouette test --------------------------------------------------------------
    print("\nsilhouette test — black them out, can you still tell them apart?")
    im0 = next(iter(ims.values()))
    w0, h0 = im0.size
    n_px = w0 * h0
    pairs = []
    for a, b in combinations(sorted(ims), 2):
        pairs.append((head_iou(masks[a], masks[b], w0, h0), iou(masks[a], masks[b], n_px), a, b))
    pairs.sort(reverse=True)
    mean_head = sum(p[0] for p in pairs) / len(pairs) if pairs else 0
    mean_full = sum(p[1] for p in pairs) / len(pairs) if pairs else 0
    print(f"  {'head IoU':<10}{'full IoU':<10}pair")
    for hv, fv, a, b in pairs[:5]:
        mark = "  <-- TOO ALIKE" if hv > MAX_PAIR_IOU else ""
        print(f"  {hv:<10.3f}{fv:<10.3f}{a} / {b}{mark}")
    if len(pairs) > 5:
        print(f"  ... {len(pairs) - 5} more pairs")
    print(
        f"\n  HEAD IoU (the bar): worst {pairs[0][0]:.3f} (cap {MAX_PAIR_IOU})  "
        f"mean {mean_head:.3f} (cap {MAX_MEAN_IOU})"
    )
    print(f"  full-mask IoU (context only, see head_iou): mean {mean_full:.3f}")
    if pairs and pairs[0][0] > MAX_PAIR_IOU:
        fails.append(f"{pairs[0][2]} and {pairs[0][3]} share a head outline (head IoU {pairs[0][0]:.3f})")
    if mean_head > MAX_MEAN_IOU:
        fails.append(f"mean head IoU {mean_head:.3f} — the set is one template recoloured")

    if "--silhouettes" in sys.argv:
        p = write_silhouette_sheet(ims, masks, os.path.join("/tmp", "roster_silhouettes.png"))
        print(f"\n  silhouette sheet -> {p}  (look at it; the number cannot see pose or attitude)")

    print()
    if fails:
        print(f"AUDIT FAILED ({len(fails)}):")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("AUDIT PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
