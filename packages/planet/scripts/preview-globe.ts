/**
 * The globe, rendered (build order step 4).
 *
 * lib/globe.ts produces typed arrays and deliberately knows nothing about a renderer, which is what
 * lets the agreement test run in a test process. The cost of that split is that nothing proves the
 * arrays are right by looking at them. This script pays that cost: a small z buffered rasteriser
 * that takes exactly the buffers a WebGL layer would take and writes a PNG.
 *
 * It is a verification tool, not the product. The real globe is React and three.js at step 9. But
 * if this image is wrong, that one will be wrong too, and this one can be checked in a terminal.
 *
 * THE ONE THING THIS FILE OWES THE SEAM (DECISIONS C3). `buildParcelMesh` fills `colours` with
 * LINEAR values, because that is what a three colour attribute takes; a shader encodes them for the
 * display and nothing in the mesh does. This script has no shader, so it does that last step
 * itself: the framebuffer below is linear, lambert and the box filter both belong in linear, and
 * `linearToSrgb` runs once per channel where the bytes are written. It was NOT doing that between
 * cb9d62c and this repair, which is how the promise above inverted: the shipped globe was right and
 * its preview rendered a black sea. `checkTheColours` at the bottom is the guard that now measures
 * EVERY biome in the frame, because an ocean-only version was walked straight through.
 *
 * Run:  npm run preview:globe -w @echo/planet
 *   or  node --import tsx packages/planet/scripts/preview-globe.ts [--lat 20] [--lng -40] [--claimed 0.3]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { latLngToVec3, type Vec3 } from "../lib/geo.js";
import {
  buildParcelMesh,
  buildParcelOutlines,
  createRegistryIndex,
  paintParcel,
  setParcelExtrusion,
} from "../lib/globe.js";
import { DEFAULT_GLOBE_OPTIONS } from "../lib/globe.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { chooseCommons } from "../lib/commons.js";
import { landFractionSampler } from "../lib/land.js";
import { seedInventory } from "../lib/rounds.js";
import {
  BIOME_COLOUR,
  BIOME_COLOUR_LINEAR,
  calibratePlanet,
  createTerrain,
  linearRgb,
  linearToSrgb,
  srgbToLinear,
  type Rgb,
} from "../lib/terrain.js";
import { encodePng } from "./png.js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i]!;
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  const isFlag = next === undefined || next.startsWith("--");
  args.set(token.slice(2), isFlag ? "true" : next!);
  if (!isFlag) i++;
}

const SEED = args.get("seed") ?? "echo-planet-1";
const WIDTH = Number(args.get("width") ?? 1400);
const HEIGHT = Number(args.get("height") ?? 1400);
const CAM_LAT = Number(args.get("lat") ?? 18);
const CAM_LNG = Number(args.get("lng") ?? -35);
const CLAIMED = Number(args.get("claimed") ?? 0.22);
const REGISTRY_RES = Number(args.get("res") ?? PLANET_PARAMS.startResolution);
const RELIEF = Number(args.get("relief") ?? 2);
const SUPERSAMPLE = 2;
const OUT_DIR = resolve(args.get("out") ?? "packages/planet/preview");

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Owner colours: distinct hues at one saturation, so ownership reads as a category not a ramp. */
function ownerColour(index: number): Rgb {
  const hue = (index * 137.508) % 360;
  const c = 0.52;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.42;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const started = Date.now();
console.log(`Globe preview, seed ${SEED}, registry at resolution ${REGISTRY_RES}, relief subdivisions ${RELIEF}.`);

const field = createTerrain(SEED);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
// The commons are chosen against the terrain, because a pentagon in open ocean is relocated onto
// land. The registry is what is left after every reserved cell, commons and vacated pentagons both.
const plan = chooseCommons(1, landFractionSampler(field, calibration.seaLevel, 2), PLANET_PARAMS.minLandFraction);
const registryCells = seedInventory(REGISTRY_RES, plan.reserved);
const registry = createRegistryIndex(registryCells);
// Not parcels, but still part of the planet, and section 6.4 wants them legible as landmarks, so
// they are meshed too and given their own colour rather than left as holes.
const commons = plan.reserved;
void registry;
const surface = buildParcelMesh([...registryCells, ...commons], field, calibration, { reliefSubdivisions: RELIEF });
console.log(`  ${n(surface.triangleCount)} triangles from ${n(surface.cells.length)} parcel boundaries`);

// Claim a share of the parcels, so owner colour and the extrusion from section 6.1 are both visible.
const COMMONS_COLOUR: Rgb = [226, 198, 122];
const VACATED_COLOUR: Rgb = [128, 132, 140];
for (const cell of commons) {
  // A commons is gold. A pentagon a commons moved off is withheld but is not a gathering place,
  // so it reads as neither parcel nor commons.
  paintParcel(surface, cell, plan.cells.includes(cell) ? COMMONS_COLOUR : VACATED_COLOUR);
}
console.log(`  ${n(plan.relocated)} of 12 commons relocated onto land, ${n(plan.reserved.length - plan.cells.length)} pentagons vacated`);

const claimable = new Set(registryCells);
const random = mulberry32(0x0be1);
let claimed = 0;
for (const cell of surface.cells) {
  if (!claimable.has(cell)) continue;
  if (random() >= CLAIMED) continue;
  paintParcel(surface, cell, ownerColour(claimed));
  setParcelExtrusion(surface, cell, true);
  claimed++;
}
console.log(`  ${n(claimed)} parcels claimed and extruded, ${n(surface.cells.length - claimed)} left as terrain`);

const outlines = buildParcelOutlines([...registryCells, ...commons], field, calibration);
console.log(`  ${n(outlines.segmentCount)} outline segments`);

// ── the rasteriser ──────────────────────────────────────────────────────────────

const W = WIDTH * SUPERSAMPLE;
const H = HEIGHT * SUPERSAMPLE;
// LINEAR, throughout. Both operations run on this buffer are ones that only mean anything in
// linear: multiplying by lambert is what light does to a surface, and averaging the supersamples is
// what a sensor does to the light landing on one pixel. The sRGB encode happens once, at the byte.
const colour = new Float32Array(W * H * 3);
const alpha = new Float32Array(W * H);
const depth = new Float32Array(W * H).fill(Infinity);
// The shade of the ocean face that won the depth test at each subsample, 0 for everything else, so
// the guard at the bottom can find pixels whose colour is known exactly. See checkTheSea.
// The shade of the face that won the depth test at each subsample, and which biome painted it, so
// the guard at the bottom can find pixels whose colour is known exactly. Biome -1 is anything the
// table does not name: a parcel a claim has painted over, or the background.
const faceShade = new Float32Array(W * H);
const faceBiome = new Int8Array(W * H).fill(-1);
const OCEAN_LINEAR = BIOME_COLOUR_LINEAR.ocean;

/**
 * Every biome's linear colour, rounded the way the mesh fill already rounded it, so a face can be
 * identified by exact Float32 equality against the table it was filled from.
 *
 * This started as one entry, ocean, and that was not enough. A reviewer sent the ten LAND biomes
 * back to the pre-C3 bytes while leaving ocean linear: the sea stayed blue, the guard printed
 * "1.1% off" and PASSED, on a chalky washed-out planet where the pixels matching rainforest fell
 * from 11,826 to 20 and grassland from 54,202 to 28. C3's seam is about every consumer of the
 * buffer, so the guard has to be too.
 */
const BIOME_KEYS: Array<{ biome: Biome; key: [number, number, number]; want: [number, number, number] }> =
  (Object.keys(BIOME_COLOUR_LINEAR) as Biome[]).map((biome) => ({
    biome,
    // What IDENTIFIES a face in the buffer: the table the buffer was filled from, rounded the way
    // the fill rounded it. This has to be the table under test, or no face would be recognised.
    key: BIOME_COLOUR_LINEAR[biome].map((c) => Math.fround(c)) as [number, number, number],
    // What the face SHOULD be, derived here from the sRGB byte table through the transfer function
    // this file names, and NEVER from BIOME_COLOUR_LINEAR. Deriving both from the same table is
    // the same bug this guard exists to catch, one level up: the first version of the widened
    // guard compared the table against itself, and sending the ten land biomes back to pre-C3
    // bytes printed eleven reassuring percentages under a chalky white planet.
    want: BIOME_COLOUR[biome].map((c) => srgbToLinear(c / 255)) as [number, number, number],
  }));

const camDir = latLngToVec3(CAM_LAT, CAM_LNG);
const DISTANCE = 3.4;
const camPos: Vec3 = [camDir[0] * DISTANCE, camDir[1] * DISTANCE, camDir[2] * DISTANCE];
const forward: Vec3 = [-camDir[0], -camDir[1], -camDir[2]];
const worldUp: Vec3 = Math.abs(camDir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
const right = normalise(cross(forward, worldUp));
const up = normalise(cross(right, forward));
// Frame the planet rather than guess a field of view: the limb of a unit sphere seen from
// DISTANCE subtends asin(1/DISTANCE), and we want that to fill 88% of the half frame.
const LIMB = Math.asin(Math.min(1, (1 + DEFAULT_GLOBE_OPTIONS.reliefScale) / DISTANCE));
const focal = ((H / 2) * 0.88) / Math.tan(LIMB);
// Lit from over the camera's left shoulder, the convention that makes relief read as relief.
const light = normalise([
  camDir[0] * 0.82 + right[0] * -0.34 + up[0] * 0.38,
  camDir[1] * 0.82 + right[1] * -0.34 + up[1] * 0.38,
  camDir[2] * 0.82 + right[2] * -0.34 + up[2] * 0.38,
]);

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalise(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** World position to screen, returning null behind the camera. */
function project(x: number, y: number, z: number): [number, number, number] | null {
  const vx = x - camPos[0];
  const vy = y - camPos[1];
  const vz = z - camPos[2];
  const zv = vx * forward[0] + vy * forward[1] + vz * forward[2];
  if (zv <= 0.01) return null;
  const xv = vx * right[0] + vy * right[1] + vz * right[2];
  const yv = vx * up[0] + vy * up[1] + vz * up[2];
  return [W / 2 + (focal * xv) / zv, H / 2 - (focal * yv) / zv, zv];
}

let drawn = 0;
const px3 = new Float64Array(9);

for (let f = 0; f < surface.triangleCount; f++) {
  let behind = false;
  for (let v = 0; v < 3; v++) {
    const o = f * 9 + v * 3;
    const p = project(surface.positions[o]!, surface.positions[o + 1]!, surface.positions[o + 2]!);
    if (!p) { behind = true; break; }
    px3[v * 3] = p[0];
    px3[v * 3 + 1] = p[1];
    px3[v * 3 + 2] = p[2];
  }
  if (behind) continue;

  const ax = px3[0]!, ay = px3[1]!, az = px3[2]!;
  const bx = px3[3]!, by = px3[4]!, bz = px3[5]!;
  const cx = px3[6]!, cy = px3[7]!, cz = px3[8]!;

  // Screen space winding culls the far side of the planet without a dot product per face.
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area >= 0) continue;
  drawn++;

  // Float32 equality is exact here rather than lucky: the buffer was filled from this same table,
  // and Math.fround is the rounding the fill already did. An ocean parcel a claim has painted over
  // fails this and is simply not measured, which is correct.
  const faceBiomeIndex = BIOME_KEYS.findIndex(
    ({ key }) =>
      surface.colours[f * 9]! === key[0] &&
      surface.colours[f * 9 + 1]! === key[1] &&
      surface.colours[f * 9 + 2]! === key[2],
  );

  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));

  for (let py = minY; py <= maxY; py++) {
    for (let pxi = minX; pxi <= maxX; pxi++) {
      const sx = pxi + 0.5;
      const sy = py + 0.5;
      const w0 = ((bx - ax) * (sy - ay) - (by - ay) * (sx - ax)) / area;
      const w1 = ((cx - bx) * (sy - by) - (cy - by) * (sx - bx)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const z = w2 * az + w1 * bz + w0 * cz;
      const o = py * W + pxi;
      if (z >= depth[o]!) continue;
      depth[o] = z;

      // Normals interpolate, so the planet shades as a smooth sphere.
      let nx = w2 * surface.normals[f * 9]! + w1 * surface.normals[f * 9 + 3]! + w0 * surface.normals[f * 9 + 6]!;
      let ny = w2 * surface.normals[f * 9 + 1]! + w1 * surface.normals[f * 9 + 4]! + w0 * surface.normals[f * 9 + 7]!;
      let nz = w2 * surface.normals[f * 9 + 2]! + w1 * surface.normals[f * 9 + 5]! + w0 * surface.normals[f * 9 + 8]!;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const lambert = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
      const shade = 0.42 + 0.72 * lambert;

      // Colour does NOT interpolate: one parcel, one fill, a crisp edge at the boundary.
      for (let k = 0; k < 3; k++) {
        colour[o * 3 + k] = Math.min(1, surface.colours[f * 9 + k]! * shade);
      }
      alpha[o] = 1;
      faceShade[o] = faceBiomeIndex < 0 ? 0 : shade;
      faceBiome[o] = faceBiomeIndex;
    }
  }
}

// Outlines last, depth tested with a bias so they sit on the surface rather than in it.
const OUTLINE: Rgb = [22, 24, 28];
// Chosen as bytes, like every other colour in this file, and therefore converted before it touches
// the framebuffer. Blending it in the buffer's own space is also the only way the 0.25/0.75 mix
// means what it says: an sRGB number lerped into a linear one is neither colour.
const OUTLINE_LINEAR = linearRgb(OUTLINE);
let outlineHits = 0;
for (let s = 0; s < outlines.segmentCount; s++) {
  const a = project(outlines.positions[s * 6]!, outlines.positions[s * 6 + 1]!, outlines.positions[s * 6 + 2]!);
  const b = project(outlines.positions[s * 6 + 3]!, outlines.positions[s * 6 + 4]!, outlines.positions[s * 6 + 5]!);
  if (!a || !b) continue;
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
  if (steps > W) continue;
  for (let t = 0; t <= steps; t++) {
    const f = steps === 0 ? 0 : t / steps;
    const px = Math.round(a[0] + (b[0] - a[0]) * f);
    const py = Math.round(a[1] + (b[1] - a[1]) * f);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const z = a[2] + (b[2] - a[2]) * f;
    const o = py * W + px;
    if (alpha[o] === 0 || z > depth[o]! + 0.004) continue;
    outlineHits++;
    colour[o * 3] = colour[o * 3]! * 0.25 + OUTLINE_LINEAR[0] * 0.75;
    colour[o * 3 + 1] = colour[o * 3 + 1]! * 0.25 + OUTLINE_LINEAR[1] * 0.75;
    colour[o * 3 + 2] = colour[o * 3 + 2]! * 0.25 + OUTLINE_LINEAR[2] * 0.75;
    // This pixel is no longer the sea, whatever it was a moment ago.
    faceShade[o] = 0;
    faceBiome[o] = -1;
  }
}

/**
 * A linear framebuffer value as the byte a PNG carries: the return trip across DECISIONS C3's seam,
 * and the one line whose absence rendered a black sea.
 */
const byte = (linear: number): number =>
  Math.round(linearToSrgb(linear < 0 ? 0 : linear > 1 ? 1 : linear) * 255);

// Box filter the supersampled buffer down, which is the whole of the antialiasing, and encode.
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
const nS = SUPERSAMPLE * SUPERSAMPLE;
// One brightest pure pixel PER BIOME, not one for the sea.
const brightest = BIOME_KEYS.map(() => ({ shade: 0, px: [0, 0, 0] as [number, number, number] }));
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    let r = 0, g = 0, b = 0, aSum = 0;
    for (let sy = 0; sy < SUPERSAMPLE; sy++) {
      for (let sx = 0; sx < SUPERSAMPLE; sx++) {
        const o = (y * SUPERSAMPLE + sy) * W + (x * SUPERSAMPLE + sx);
        r += colour[o * 3]!; g += colour[o * 3 + 1]!; b += colour[o * 3 + 2]!; aSum += alpha[o]!;
      }
    }
    const o = (y * WIDTH + x) * 4;
    const cover = aSum / nS;
    pixels[o] = byte(cover > 0 ? r / aSum : 0);
    pixels[o + 1] = byte(cover > 0 ? g / aSum : 0);
    pixels[o + 2] = byte(cover > 0 ? b / aSum : 0);
    pixels[o + 3] = Math.round(cover * 255);
    // The brightest pixel that is nothing but ONE biome: every subsample covered by a face of the
    // same biome and none of them touched by an outline. A pixel like that has a colour that can be
    // predicted exactly rather than eyeballed, which is what makes the guard below a measurement.
    if (aSum === nS) {
      const first = faceBiome[(y * SUPERSAMPLE) * W + x * SUPERSAMPLE]!;
      if (first >= 0) {
        let pure = true;
        let shadeSum = 0;
        for (let sy = 0; sy < SUPERSAMPLE && pure; sy++) {
          for (let sx = 0; sx < SUPERSAMPLE; sx++) {
            const so = (y * SUPERSAMPLE + sy) * W + (x * SUPERSAMPLE + sx);
            if (faceBiome[so] !== first || faceShade[so] === 0) { pure = false; break; }
            shadeSum += faceShade[so]!;
          }
        }
        const perSub = shadeSum / nS;
        if (pure && perSub > brightest[first]!.shade) {
          brightest[first] = { shade: perSub, px: [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!] };
        }
      }
    }
  }
}

/**
 * THE GUARD. This script exists to be looked at, and the last thing that broke it was invisible to
 * every test in the package: `buildParcelMesh`'s colours went linear in cb9d62c, this rasteriser
 * kept writing them out as bytes, and the ocean fell from (43, 78, 109) to (6, 17, 34). Nobody
 * noticed until someone rendered it. So the render now checks itself.
 *
 * It measures the BYTES THAT WERE JUST WRITTEN, and it measures them the way a viewer will: take
 * the brightest pure-sea pixel out of the PNG, decode it with `srgbToLinear`, and it must be the
 * mesh's own ocean colour times the light that fell on it. One flat colour, one lambert term, and
 * averaging a constant over four subsamples returns the constant, so the expectation is exact.
 *
 * `byte` DOES NOT APPEAR IN THIS FUNCTION, and that is the whole design. The first version of this
 * guard predicted through `byte` and compared against pixels `byte` had written, so it passed
 * happily when the transfer was applied twice: it was measuring one call to a function against
 * another call to the same function, which is the exact family of dud guard this repair exists to
 * clear out. `srgbToLinear` is the independent side: it is the forward half of the seam, is used
 * nowhere in this file's output path, and terrain.test.ts pins it to the IEC curve.
 *
 * The tolerance is proportional because a byte is not a constant amount of light. Ocean is dark
 * enough that one byte at its red channel is 2.7% of it, so 4% is one byte of quantisation and no
 * more. The three breaks this guard has been watched catching land at 19% (a 1/2.2 gamma put in
 * place of the piecewise curve), 92% (the original, no transfer at all) and 620% (applied twice).
 *
 * A type could not have done this job; see the note in DECISIONS C3.
 */
const SEA_TOLERANCE = 0.04;

function checkTheColours(): void {
  // Every biome the frame actually shows, not just the sea. The previous version measured ocean
  // alone and a reviewer walked straight through it: land back on pre-C3 bytes, sea left linear,
  // guard green, planet chalk.
  const seen = BIOME_KEYS.map((b, i) => ({ ...b, ...brightest[i]! })).filter((b) => b.shade > 0);
  if (seen.length < 3) {
    throw new Error(
      `only ${seen.length} biome(s) in this frame have a pixel of pure unoutlined colour, so almost ` +
      "nothing was checked. Either the camera is pointed somewhere empty, and the fix is --width up " +
      "or --res down, or buildParcelMesh has stopped filling BIOME_COLOUR_LINEAR, which is what a " +
      "break on the far side of the seam looks like from here.",
    );
  }
  const bad: string[] = [];
  const lines: string[] = [];
  for (const b of seen) {
    // What the PNG says, in light: the viewer's own decode of the bytes on disk. Against what the
    // mesh said, in light: this biome's colour under this pixel's own lambert term.
    const got = b.px.map((v) => srgbToLinear(v / 255));
    const want = b.want.map((c) => Math.min(1, c * b.shade));
    let worst = 0;
    let ratio = 1;
    for (let k = 0; k < 3; k++) {
      const r = got[k]! / (want[k]! || 1e-9);
      if (Math.abs(r - 1) > worst) { worst = Math.abs(r - 1); ratio = r; }
    }
    lines.push(`    ${b.biome.padEnd(11)} (${b.px.join(", ")}) at shade ${b.shade.toFixed(2)}, ${(worst * 100).toFixed(1)}% off`);
    if (worst > SEA_TOLERANCE) {
      bad.push(
        `${b.biome}: the brightest pure pixel came out (${b.px.join(", ")}), which decodes to ` +
        `${got.map((v) => v.toFixed(4)).join(", ")} of light where ${BIOME_COLOUR[b.biome].join(", ")} under ` +
        `this pixel's own shade ${b.shade.toFixed(3)} is ${want.map((v) => v.toFixed(4)).join(", ")}: ${ratio.toFixed(2)}x`,
      );
    }
  }
  if (bad.length) {
    throw new Error(
      `${bad.length} of ${seen.length} biomes are the wrong colour:\n  ` + bad.join("\n  ") +
      "\nThe mesh's colours are LINEAR (DECISIONS C3), and a PNG byte is sRGB, so the display " +
      "transfer is owed exactly once in between.",
    );
  }
  console.log(`  ${seen.length} biomes measured against the light the mesh asked for, one byte is 2.7%:`);
  console.log(lines.join("\n"));
}

mkdirSync(OUT_DIR, { recursive: true });
const path = resolve(OUT_DIR, `${SEED}-globe.png`);
writeFileSync(path, encodePng(WIDTH, HEIGHT, pixels));
console.log(`  ${n(drawn)} faces drawn, ${n(outlineHits)} outline pixels`);
console.log(`\n  ${path}`);
// After the write, deliberately: an image that fails the guard is an image somebody wants to look at.
checkTheColours();
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);

function n(x: number): string {
  return x.toLocaleString("en-US");
}
