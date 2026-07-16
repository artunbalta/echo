#!/usr/bin/env node
/**
 * Derive the empty centre slot's silhouette FROM THE ROSTER ITSELF.
 *
 * WHY THIS EXISTS. Three hand-authored attempts at this shape failed, each in the same way: built
 * abstractly out of stacked tapering rectangles, they read as an object rather than a person — a
 * tombstone, then a chess pawn, then a pawn with an outline. The mistake was never the rendering, it
 * was the source. A shape invented in the abstract matches nothing, so it reads as nothing.
 *
 * The roster already contains the answer. Eight portraits, all normalised to the same canvas, the
 * same baseline and the same scale, so their masks are directly comparable. The shape that MOST OF
 * THEM SHARE is, by construction, the shape of a person in this lineup: head, neck, shoulders, at
 * exactly their crop. Overlay them, keep the pixels a majority agree on, and the hole is a
 * person-shaped hole rather than a guess at one. Match their outline and it reads instantly as
 * "someone is missing here, and it's you."
 *
 * Derived, not generated: this reads committed art and emits geometry. No model involved.
 *
 * Output: apps/web/src/app/_landing/vacancy.ts — flat run-length rows, on the portraits' own 72x108
 * grid, for INTERIOR and EDGE. Runs, not paths: they render as axis-aligned <rect>s that stay
 * exactly on the pixel grid at every integer scale, the same rule the portraits follow.
 *
 * Run: npm run gen:vacancy
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ROSTER = resolve(ROOT, "apps/web/public/assets/roster");
const OUT = resolve(ROOT, "apps/web/src/app/_landing/vacancy.ts");

/** A pixel is part of the shared body if at least this many of the eight portraits have ink there.
 *  A majority, not a union: a union would swallow every prop and every hairstyle and bloat into a
 *  blob. A majority keeps only what a person in this lineup always has. */
const MAJORITY = 5;

const ids = JSON.parse(readFileSync(resolve(ROSTER, "_manifest.json"), "utf8")).map((j) => j.name);

// Pillow does the pixel reading; node does the emit. Kept in one place so `npm run gen:vacancy`
// is a single command rather than a two-step ritual.
const py = `
import json, sys
from PIL import Image
ids = ${JSON.stringify(ids)}
D = ${JSON.stringify(ROSTER)}
masks, W, H = [], None, None
for i in ids:
    im = Image.open(f"{D}/{i}.png").convert("RGB")
    W, H = im.size
    px = im.load()
    # background = most common colour on the top edge; every portrait sits on flat ink by now.
    counts = {}
    for y in range(3):
        for x in range(W):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    bg = max(counts.items(), key=lambda kv: kv[1])[0]
    m = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if abs(r-bg[0]) + abs(g-bg[1]) + abs(b-bg[2]) > 26:
                m[y*W + x] = 1
    masks.append(m)

votes = [sum(m[i] for m in masks) for i in range(W*H)]
body = [1 if v >= ${MAJORITY} else 0 for v in votes]

# Fill interior holes row-wise (eyes, collars, a gap between hair and shoulder) so the vacancy is one
# solid absence rather than a stencil of somebody's face.
for y in range(H):
    row = [x for x in range(W) if body[y*W + x]]
    if row:
        for x in range(row[0], row[-1] + 1):
            body[y*W + x] = 1

edge = [0]*(W*H)
for y in range(H):
    for x in range(W):
        if not body[y*W + x]:
            continue
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if nx < 0 or ny < 0 or nx >= W or ny >= H or not body[ny*W + nx]:
                edge[y*W + x] = 1
                break

def runs(grid):
    out = []
    for y in range(H):
        x = 0
        while x < W:
            if grid[y*W + x]:
                x0 = x
                while x < W and grid[y*W + x]:
                    x += 1
                out.append([y, x0, x - x0])
            else:
                x += 1
    return out

print(json.dumps({
    "w": W, "h": H,
    "interior": runs(body),
    "edge": runs(edge),
    "coverage": round(100.0 * sum(body) / (W*H), 1),
}))
`;

const data = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

const src = `/**
 * The empty centre slot's shape — DERIVED FROM THE EIGHT PORTRAITS, not hand-drawn.
 *
 * GENERATED FILE. Do not edit by hand; run \`npm run gen:vacancy\` (pipeline/derive-vacancy.mjs).
 *
 * Every pixel here is one a MAJORITY of the roster's eight portraits agree is part of a person, on
 * their own ${data.w}x${data.h} canvas, at their baseline and their scale. So the hole is the head,
 * neck and shoulders they literally share, at exactly their crop — a vacancy in a lineup of people,
 * rather than a shape invented next to them. Three hand-authored versions failed precisely because
 * they were invented: a shape built from abstract tapering blocks matches nothing, so it reads as an
 * object (a tombstone, then a chess pawn) instead of an absence.
 *
 * Run-length rows [y, x, width] rather than a path: they render as axis-aligned rects that stay on
 * the pixel grid at every integer scale, which is the same rule the portraits obey.
 *
 * Derived from: ${ids.join(", ")}
 * Body covers ${data.coverage}% of the tile.
 */
export const VACANCY = {
  w: ${data.w},
  h: ${data.h},
  /** The absence itself. Flat fill, no gradient. */
  interior: ${JSON.stringify(data.interior)} as [number, number, number][],
  /** The 1px rim. This is where the echo-violet is spent. */
  edge: ${JSON.stringify(data.edge)} as [number, number, number][],
} as const;
`;

writeFileSync(OUT, src);
console.log(`[vacancy] derived from ${ids.length} portraits (majority >= ${MAJORITY}/${ids.length})`);
console.log(`[vacancy] ${data.w}x${data.h}, body covers ${data.coverage}% of the tile`);
console.log(`[vacancy] ${data.interior.length} interior runs, ${data.edge.length} edge runs -> ${OUT}`);
