/**
 * Where a class's own form stops being worth its triangles: the derivation behind `lod.farM`.
 *
 * This is the measurement DECISIONS C22 asks for, and it lives in tests/ rather than in src/
 * because nothing at runtime needs it: it is how the numbers in packages/planet/lib/assets.ts were
 * arrived at, and tests/farBand.test.mts re-runs it against the shipped table so the table is
 * falsifiable rather than remembered.
 *
 * ITS RASTERISER IS ITS OWN, deliberately. scatterImpostor.ts has one, and sharing it would make
 * this file's answer depend on the same code that shaped the card it is judging; the previous
 * far-band guard failed exactly that way, asserting a card's cost from the constant it was counted
 * with. What IS shared is the card itself, because the card is the thing the renderer actually
 * draws.
 */
import * as THREE from "three";

import { CAMERA_FOV_DEG } from "../../src/game/world/PlanetWorld";
import { SCATTER_GEOMETRY } from "../../src/game/world/scatterGeometry";
import { impostorFor } from "../../src/game/world/scatterImpostor";
import { FOG_FAR_M, FOG_NEAR_M } from "../../src/game/world/skyLayer";

export { CAMERA_FOV_DEG, FOG_FAR_M, FOG_NEAR_M };

/** The two shipped viewport heights, in device pixels at pixelRatio 1. */
export const VIEWPORTS = [800, 1080] as const;
/** "A few pixels": what the switch from a form to its own card may cost, in whole frame pixels. */
export const CLASS_SWITCH_PIXELS = 2;

/**
 * The near end of the bisection bracket, metres.
 *
 * Not 1 m: nothing in this world is looked at from a metre, and a raster at that distance is
 * 857 px per metre times the supersample, which is where the degenerate case below spends its
 * time. Ten metres is nearer than the nearest `nearM` in the registry (shell, 40 m) and still
 * cheap to rasterise.
 */
const NEAR_BRACKET_M = 10;

/** Subpixel supersample per axis, so a form three pixels tall is measured and not quantised away. */
const SS = 4;
/** Horizontal azimuths the form is measured from. The card turns, so it reads the same at each. */
const AZIMUTHS = 12;

const TAN_HALF = Math.tan((CAMERA_FOV_DEG / 2) * Math.PI / 180);

/** Pixels per metre at distance `d` for a viewport `heightPx` tall. Square pixels, so one number. */
export const pixelsPerMetre = (heightPx: number, d: number) => heightPx / (2 * d * TAN_HALF);

/**
 * three's `THREE.Fog` in the fragment shader: `smoothstep(near, far, viewDepth)`, and the sky layer
 * pins the fog colour to the dome's own horizon stop, so a fragment at `far` carries none of its
 * own colour and neither does the sky behind it. What is left of a form at `d` is `1 - fog(d)`.
 */
export function fog(d: number): number {
  const t = Math.min(1, Math.max(0, (d - FOG_NEAR_M) / (FOG_FAR_M - FOG_NEAR_M)));
  return t * t * (3 - 2 * t);
}

/** Rasterise a triangle soup along one azimuth into a subpixel coverage mask. */
function raster(pos: Float32Array, phi: number, p: number, w: number, h: number, x0: number, y0: number, out: Uint8Array): void {
  const rx = -Math.sin(phi);
  const rz = Math.cos(phi);
  const tris = pos.length / 9;
  const sx = [0, 0, 0];
  const sy = [0, 0, 0];
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    for (let k = 0; k < 3; k++) {
      sx[k] = ((pos[o + k * 3]! * rx + pos[o + k * 3 + 2]! * rz) - x0) * p * SS;
      sy[k] = (pos[o + k * 3 + 1]! - y0) * p * SS;
    }
    const den = (sy[1]! - sy[2]!) * (sx[0]! - sx[2]!) + (sx[2]! - sx[1]!) * (sy[0]! - sy[2]!);
    if (Math.abs(den) < 1e-12) continue;
    const iL = Math.max(0, Math.floor(Math.min(sx[0]!, sx[1]!, sx[2]!)));
    const iH = Math.min(w - 1, Math.ceil(Math.max(sx[0]!, sx[1]!, sx[2]!)));
    const jL = Math.max(0, Math.floor(Math.min(sy[0]!, sy[1]!, sy[2]!)));
    const jH = Math.min(h - 1, Math.ceil(Math.max(sy[0]!, sy[1]!, sy[2]!)));
    for (let j = jL; j <= jH; j++) {
      for (let i = iL; i <= iH; i++) {
        const gx = i + 0.5;
        const gy = j + 0.5;
        const l0 = ((sy[1]! - sy[2]!) * (gx - sx[2]!) + (sx[2]! - sx[1]!) * (gy - sy[2]!)) / den;
        const l1 = ((sy[2]! - sy[0]!) * (gx - sx[2]!) + (sx[0]! - sx[2]!) * (gy - sy[2]!)) / den;
        if (l0 < 0 || l1 < 0 || 1 - l0 - l1 < 0) continue;
        out[j * w + i] = 1;
      }
    }
  }
}

export interface FormPair {
  form: Float32Array;
  card: Float32Array;
  reachM: number;
  yLowM: number;
  yHighM: number;
}

/** One class's own form and its own card, both at the class's largest instance scale. */
export function formPair(id: string, scale: number): FormPair {
  const builder = SCATTER_GEOMETRY[id];
  if (!builder) throw new Error(`[farBand] no form for class "${id}"`);
  const g = builder();
  const card = impostorFor(id);
  const f = (g.getAttribute("position").array as Float32Array).slice();
  const c = (card.geometry.getAttribute("position").array as Float32Array).slice();
  for (let i = 0; i < f.length; i++) f[i] = f[i]! * scale;
  for (let i = 0; i < c.length; i++) c[i] = c[i]! * scale;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const p = card.profile;
  const reachM =
    Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z), p.widthBottomM / 2, p.widthTopM / 2) * scale * 1.05 + 0.01;
  const yLowM = Math.min(bb.min.y, p.footM) * scale - 0.01;
  const yHighM = Math.max(bb.max.y, p.footM + p.heightM) * scale + 0.01;
  g.dispose();
  return { form: f, card: c, reachM, yLowM, yHighM };
}

/**
 * What the switch costs at one distance: the mean over azimuths of the pixels the form covers and
 * its card does not, or the other way round, weighted by the contrast the fog has left at `d`.
 *
 * The weighting is not a softening. Past `FOG_FAR_M` a fragment is exactly the fog colour and so is
 * the sky and the ground behind it, so a silhouette out there differs from its stand-in by nothing
 * at all; counting those pixels whole would be measuring a picture nobody is shown.
 */
/** The switch split by DIRECTION, and the two silhouettes it is a difference of. */
export interface SignedSwitch {
  /** Pixels `form` covers and `card` does not — what substituting the cheap form ERODES. */
  eroded: number;
  /** Pixels `card` covers and `form` does not — what it DILATES. */
  dilated: number;
  /** Mean covered pixels of each form, so `cardArea / formArea` says how much silhouette is lost. */
  formArea: number;
  cardArea: number;
}

/**
 * The same raster as {@link switchPixelsRaw}, keeping the SIGN it throws away.
 *
 * An unsigned XOR count cannot tell a form that has shrunk from one that has merely wobbled, and
 * the difference decides whether a substitution is a stand-in or a bias. A coarsened solid loses
 * area on EVERY instance in the same direction — three's primitives put their vertices on the
 * circumscribing radius and cut the chord between, so the bounding box is untouched while the area
 * between the vertices goes. A BOUNDING BOX THEREFORE CANNOT SEE A COARSENING, and reading one as
 * evidence that a form kept its size is a mistake this function exists to stop repeating.
 */
export function signedSwitchPixels(pair: FormPair, heightPx: number, d: number): SignedSwitch {
  const p = pixelsPerMetre(heightPx, d);
  const w = Math.ceil(2 * pair.reachM * p * SS) + 4;
  const h = Math.ceil((pair.yHighM - pair.yLowM) * p * SS) + 4;
  const a = new Uint8Array(w * h);
  const b = new Uint8Array(w * h);
  const out: SignedSwitch = { eroded: 0, dilated: 0, formArea: 0, cardArea: 0 };
  for (let k = 0; k < AZIMUTHS; k++) {
    const phi = (k / AZIMUTHS) * Math.PI * 2;
    a.fill(0);
    b.fill(0);
    raster(pair.form, phi, p, w, h, -pair.reachM, pair.yLowM, a);
    raster(pair.card, phi, p, w, h, -pair.reachM, pair.yLowM, b);
    let eroded = 0, dilated = 0, fa = 0, ca = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i]) fa++;
      if (b[i]) ca++;
      if (a[i] && !b[i]) eroded++;
      else if (b[i] && !a[i]) dilated++;
    }
    out.eroded += eroded / (SS * SS);
    out.dilated += dilated / (SS * SS);
    out.formArea += fa / (SS * SS);
    out.cardArea += ca / (SS * SS);
  }
  out.eroded /= AZIMUTHS;
  out.dilated /= AZIMUTHS;
  out.formArea /= AZIMUTHS;
  out.cardArea /= AZIMUTHS;
  return out;
}

export function switchPixelsRaw(pair: FormPair, heightPx: number, d: number): number {
  const { eroded, dilated } = signedSwitchPixels(pair, heightPx, d);
  return eroded + dilated;
}

/** The same, weighted by the contrast the fog has left at the view depth a prop at `d` gets. */
export function switchPixels(pair: FormPair, heightPx: number, d: number, viewDepthFactor = 1): number {
  return switchPixelsRaw(pair, heightPx, d) * (1 - fog(d * viewDepthFactor));
}

/**
 * The nearest distance at which the switch costs no more than `CLASS_SWITCH_PIXELS`.
 *
 * NEAREST, and that is the whole rule: every metre past it is a full form drawn where two triangles
 * would be indistinguishable, which is triangles spent on nothing. Bisected on
 * [`NEAR_BRACKET_M`, 1200] m, which brackets every shipped form: the cost falls monotonically past
 * the near field because the raster shrinks as 1/d^2 and the fog only takes more. BOTH ENDS of the
 * bracket are asserted before the loop runs, because a bracket that does not contain the answer is
 * how this function returns a number that means nothing.
 */
export function deriveFarM(id: string, scale: number, heightPx: number, viewDepthFactor = 1, budget = CLASS_SWITCH_PIXELS): number {
  return deriveFarMForPair(formPair(id, scale), id, heightPx, viewDepthFactor, budget);
}

/**
 * The same bisection over a pair that is already built, so a test can hand it a DEGENERATE one.
 *
 * `deriveFarM` builds its pair from the registry and the shipped card, which is right for the
 * table and useless for testing the bracket: there is no class id whose card is its own form. This
 * takes the pair, so tests/farBand.test.mts can build that pair itself and check that the near-end
 * assertion below actually fires.
 */
export function deriveFarMForPair(pair: FormPair, id: string, heightPx: number, viewDepthFactor = 1, budget = CLASS_SWITCH_PIXELS): number {
  let low = NEAR_BRACKET_M;
  let high = 1200;
  if (switchPixels(pair, heightPx, high, viewDepthFactor) > budget) throw new Error(`[farBand] ${id} never falls to ${budget} px inside ${high} m`);
  // AND THE NEAR END, which is the half that was missing and the one that matters.
  //
  // MEASURED: with `impostorFor` returning the class's own full form as its card, the switch cost
  // is 0 at every distance, so the loop below never sets `low` and simply walks `high` down toward
  // the bracket's near end. The raster it builds grows as 1/d^2 - 27 ms at 200 m, 2.3 s at 20 m,
  // and past 600 s before the bisection is done - so the derivation HANGS on the one substitution
  // it exists to catch instead of failing with a message. A guard that hangs reads, to whoever is
  // waiting, exactly like a slow test.
  //
  // The bracket is only meaningful while the form and its card are still telling apart at the near
  // end, so that is asserted rather than assumed.
  const nearCost = switchPixels(pair, heightPx, low, viewDepthFactor);
  if (nearCost <= budget) {
    throw new Error(
      `[farBand] ${id}: the form and its card differ by ${nearCost.toFixed(2)} px even at ${low} m, which is under the ` +
        `${budget} px budget, so there is no distance at which the switch starts costing anything. The card is not the ` +
        `class's own card: bind a far mesh to the form itself and this is what it looks like.`,
    );
  }
  for (let i = 0; i < 22; i++) {
    const mid = (low + high) / 2;
    if (switchPixels(pair, heightPx, mid, viewDepthFactor) > budget) low = mid;
    else high = mid;
  }
  return high;
}
