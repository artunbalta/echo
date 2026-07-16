import sharp from "sharp";
import palette from "./roster-palette.json";

// Deliberately NOT `import "server-only"`, unlike the repo's other lib modules. That guard exists to
// keep SECRETS off the client (supabaseAdmin.ts, ml.ts); this module holds none — it is pure pixel
// arithmetic over buffers, and its sharp import already makes it unusable in a browser. Importing
// server-only here would only make the module unloadable outside a React Server Component, which
// would mean the parity check below could never run it, and an unverifiable port is the one thing
// this file must not be. Callers that DO hold secrets keep their own server-only guard.

/**
 * The roster portrait pipeline, ported to Node so it can run in a serverless function.
 *
 * WHY A PORT EXISTS AT ALL. The canonical pipeline is pipeline/process-roster-portraits.py — Python
 * + Pillow. A Vercel serverless function cannot shell out to python3 or import Pillow, so the
 * pipeline as written CANNOT run in the request path. That was the single biggest risk in the photo
 * path, because a runtime portrait that skips it is a painterly image with a pixel filter, at the
 * wrong scale, on the wrong palette, sitting next to eight that are none of those things.
 *
 * The ALGORITHM ports cleanly, and this is that port. sharp (already present, used by Next's image
 * optimiser) does lanczos3 resampling, which is the same family Pillow's LANCZOS uses; everything
 * else here is plain pixel arithmetic and is identical by construction.
 *
 * ONE DELIBERATE DIFFERENCE from the Python: the palette is NOT re-derived. It is read from the
 * committed roster-palette.json (see pipeline/derive-palette.mjs). Re-deriving at runtime would need
 * all eight originals in the request path AND would perturb eight approved portraits to accommodate
 * one newcomer. Freezing it means a generated portrait lands on exactly the roster's colours.
 *
 * Parity against the Python is measured, not assumed: see pipeline/verify-pipeline-parity.mjs.
 */

const INK: [number, number, number] = [28, 19, 38]; // #1c1326
const OUT_W = 72;
const OUT_H = 108;

/** Distance beyond which a pixel is "not the tile". Matches flatten_bg(tol=70) in the Python. */
const BG_TOL = 70;
/** Erosion kernel for body-mass measurement. Matches _body_bbox(erode=5). */
const ERODE = 5;

const PALETTE = palette.colors as [number, number, number][];

interface Raw {
  data: Buffer;
  w: number;
  h: number;
}

async function toRaw(input: Buffer): Promise<Raw> {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** The tile background: most common colour along the top edge. Never the figure. */
function bgOf({ data, w }: Raw): [number, number, number] {
  const counts = new Map<string, number>();
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const k = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let best = "";
  let n = -1;
  for (const [k, v] of counts) if (v > n) ((n = v), (best = k));
  return best.split(",").map(Number) as [number, number, number];
}

/**
 * Force every background pixel to exact ink, erasing vignette, glow and cast shadow.
 * The model varies all three per generation, so they are erased rather than requested.
 */
function flattenBg(im: Raw): Raw {
  const bg = bgOf(im);
  const { data, w, h } = im;
  for (let p = 0; p < w * h; p++) {
    const i = p * 3;
    const d =
      Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (d <= BG_TOL) {
      data[i] = INK[0];
      data[i + 1] = INK[1];
      data[i + 2] = INK[2];
    }
  }
  return im;
}

/**
 * Bounding box of the figure's BODY MASS, thin protrusions eroded away.
 *
 * A prop that rises above the head (a gaff, a feather, a spear) inflates a raw bounding box and,
 * scaled on, renders that character's head visibly smaller than everyone else's — the "two pixel
 * sizes in one roster" failure, introduced by the very props that make silhouettes work. Eroding
 * first deletes anything thinner than the kernel and leaves head and shoulders, so the measurement
 * lands on the body every time. The resulting scale is applied to the UNERODED figure.
 *
 * The erosion runs on a downscaled proxy so the kernel is proportional to the OUTPUT grid, not to
 * whatever resolution the model happened to return. A 5px kernel means one thing on a 72px canvas
 * and nothing at all on a 1700px one.
 */
function bodyBox(im: Raw): { l: number; t: number; r: number; b: number } | null {
  const { data, w, h } = im;

  // FULL RESOLUTION, kernel 5, exactly as Pillow's MinFilter(5) runs in the Python.
  //
  // An earlier version of this port eroded a 72px proxy instead, on the reasoning that a 5px kernel
  // is proportionally meaningless on a ~1700px generation and huge on a 72px canvas. That reasoning
  // is right in the abstract and WRONG here, and the parity check caught it: the proxy erosion ate
  // far more of the body, shrank the measured body height, scaled the figure up, and seated its head
  // at y=0 where the Python puts it at y=15. Being "more correct" than the canonical pipeline is a
  // divergence — the eight portraits that already shipped were made by the Python's weak full-res
  // erosion, and a ninth that disagrees is the inconsistency this whole exercise exists to prevent.
  // Match the original, warts and all; change both together or neither.
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 3;
    mask[p] = data[i] === INK[0] && data[i + 1] === INK[1] && data[i + 2] === INK[2] ? 0 : 1;
  }

  // Separable min-filter: erode along x, then along y. Identical result to the square kernel, at
  // O(w*h*k*2) instead of O(w*h*k^2) — the difference between ~40M and ~110M ops on a 2k image.
  const k = Math.floor(ERODE / 2);
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let keep = 1;
      for (let dx = -k; dx <= k && keep; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w || !mask[y * w + nx]) keep = 0;
      }
      tmp[y * w + x] = keep;
    }
  const er = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let keep = 1;
      for (let dy = -k; dy <= k && keep; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h || !tmp[ny * w + x]) keep = 0;
      }
      er[y * w + x] = keep;
    }

  let src = er;
  if (!er.some(Boolean)) src = mask; // erosion ate everything: fall back to the raw mask
  let l = w,
    t = h,
    r = -1,
    b = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (src[y * w + x]) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
  return r < 0 ? null : { l, t, r, b };
}

/**
 * The exact tile background every one of the eight committed portraits uses. Verified: all eight
 * have (28,18,35) at every background pixel.
 *
 * It is pinned rather than computed, and that is the fix for a real defect the parity check found.
 * The frozen palette holds THREE near-ink entries — (28,19,37) at distance 1.0, (28,21,39) at 2.2,
 * (28,18,35) at 3.2 — and exact ink is not one of them. A true nearest-colour search picks
 * (28,19,37); Pillow's palette matcher, which produced the committed eight, picks (28,18,35), which
 * is NOT the nearest. So the correct answer and the shipped answer disagree, and shipping the
 * "correct" one would give the ninth tile a background 3 units off the other eight. Invisible, but
 * wrong, and exactly the kind of drift this pipeline exists to prevent. Match the roster.
 */
const TILE_BG: [number, number, number] = [28, 18, 35];

/**
 * Nearest colour in the frozen roster palette. Euclidean in RGB, no dither — flat fills, hard steps.
 * Dither across a whole portrait is the noise the art bible forbids and it shimmers under integer
 * upscaling.
 *
 * Background pixels bypass the search entirely and are pinned to TILE_BG: the tile behind the figure
 * is a known flat constant, not something to rediscover per image.
 */
function snapToPalette(data: Buffer): Buffer {
  for (let p = 0; p < data.length / 3; p++) {
    const i = p * 3;
    if (data[i] === INK[0] && data[i + 1] === INK[1] && data[i + 2] === INK[2]) {
      data[i] = TILE_BG[0];
      data[i + 1] = TILE_BG[1];
      data[i + 2] = TILE_BG[2];
      continue;
    }
    let best = 0;
    let bd = Infinity;
    for (let c = 0; c < PALETTE.length; c++) {
      const dr = data[i] - PALETTE[c][0];
      const dg = data[i + 1] - PALETTE[c][1];
      const db = data[i + 2] - PALETTE[c][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) ((bd = d), (best = c));
    }
    data[i] = PALETTE[best][0];
    data[i + 1] = PALETTE[best][1];
    data[i + 2] = PALETTE[best][2];
  }
  return data;
}

/**
 * The whole pipeline: a raw generated image in, a 72x108 roster portrait out, on the roster's
 * baseline, scale and palette.
 *
 * @param fill share of canvas height the BODY occupies. Must stay under 1.0 or the head crops.
 */
export async function toRosterPortrait(input: Buffer, fill = 0.9): Promise<Buffer> {
  const im = flattenBg(await toRaw(input));
  const box = bodyBox(im);
  if (!box) {
    return sharp(im.data, { raw: { width: im.w, height: im.h, channels: 3 } })
      .resize(OUT_W, OUT_H, { kernel: "lanczos3" })
      .png()
      .toBuffer();
  }

  // Scale on BODY height, never raw bbox height. This is what keeps every head the same size.
  const bodyH = Math.max(1, box.b - box.t);
  const scale = (OUT_H * fill) / bodyH;
  const bw = Math.max(1, Math.round(im.w * scale));
  const bh = Math.max(1, Math.round(im.h * scale));
  const big = await sharp(im.data, { raw: { width: im.w, height: im.h, channels: 3 } })
    .resize(bw, bh, { kernel: "lanczos3" })
    .raw()
    .toBuffer();

  // Seat the body's bottom on the canvas floor and centre on its own centre-x. Props may run off
  // the top or the sides; that reads as natural and costs nothing.
  const dx = Math.round(OUT_W / 2 - ((box.l + box.r) / 2) * scale);
  const dy = Math.round(OUT_H - box.b * scale);

  const canvas = Buffer.alloc(OUT_W * OUT_H * 3);
  for (let p = 0; p < OUT_W * OUT_H; p++) {
    canvas[p * 3] = INK[0];
    canvas[p * 3 + 1] = INK[1];
    canvas[p * 3 + 2] = INK[2];
  }
  for (let y = 0; y < OUT_H; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= bh) continue;
    for (let x = 0; x < OUT_W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= bw) continue;
      const si = (sy * bw + sx) * 3;
      const di = (y * OUT_W + x) * 3;
      canvas[di] = big[si];
      canvas[di + 1] = big[si + 1];
      canvas[di + 2] = big[si + 2];
    }
  }

  return sharp(snapToPalette(canvas), { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
