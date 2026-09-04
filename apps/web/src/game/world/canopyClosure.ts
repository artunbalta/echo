/**
 * Canopy closure (DECISIONS C17): the ground under the trees loses the sky the trees are standing
 * in front of, and the ground in the open loses nothing.
 *
 * THE COMPLAINT. Measured with 128 by 80 rays through the real camera on the frozen dusk frame,
 * 98.25% of the ground pixels on the ordinary parcel and 99.85% on the demo read BRIGHTER than the
 * median canopy pixel, at a ratio of 1.27 and 1.42. C17 rejects the global fix and says why: open
 * ground taking skylight and reading brighter than dark foliage is what dusk in the open looks
 * like, and cutting the exposure would make a desert and a beach wrong and darken an already dark
 * night. What is wrong is the same thing happening under a closed canopy.
 *
 * WHAT THE RENDERER IS ACTUALLY MISSING, measured rather than assumed. Muting each light in turn on
 * the shipped frame and re-reading the same ground rays: the ground's linear luminance is 0.0183 on
 * the parcel, of which the hemisphere fill carries 0.0126 (69%) and the key 0.0058 (31%); on the
 * demo it is 0.0227, split 0.0133 fill and 0.0094 key. On open sand the same measurement comes back
 * the other way round, 0.1594 fill against 0.4494 key, which is what a 16 degree sun on unshadowed
 * flat ground should give. So the forest floor is not short of KEY light: the key is already only a
 * third of it, because the shadow map works and the long dusk shadows in the frame are real. THE
 * FILL IS WHAT IS WRONG. A hemisphere light in three is occluded by no geometry at all, so a floor
 * with fourteen metres of leaf over it still receives every photon of sky that a beach does, and
 * that fill is two thirds of the light on the floor. That is the whole bug, and it is why this is
 * an occlusion term and not an exposure knob.
 *
 * SO THIS IS A SKY-OCCLUSION FIELD, and it is derived, not decorated.
 *
 * THE ANGULAR HALF. Treat the crowns as a layer of optical depth L, the crown area standing over a
 * square metre of ground. A ray leaving the floor at angle t from vertical crosses that layer over
 * a path 1/cos(t) long, so it survives with probability exp(-L/cos t). A diffuse floor weights its
 * hemisphere by cos t, so the fraction of the sky it still sees is
 *
 *     T(L) = 2 * integral(0..1) u * exp(-L/u) du = 2 * E3(L)
 *
 * with u = cos t and E3 the third exponential integral. T(0) = 2 * E3(0) = 1 and T(inf) = 0, and
 * the grazing directions do the work: at L = 0.6, the depth this world actually grows, a straight-up
 * ray survives at exp(-0.6) = 0.549 but the whole cosine-weighted sky survives at 0.383, because a
 * ray leaving at 60 degrees has twice the leaf to cross. Using exp(-L), which is the answer for the
 * vertical ray alone, would leave the floor 43% brighter than the hemisphere it is standing under.
 *
 * THE SPATIAL HALF, from the same integral. A crown of area A at height h, offset d horizontally,
 * hides the piece of sky it covers, and the same cos t weighting turns that into a kernel: the ray
 * that passes over a point d away leaves at tan(t) = d/h, and carrying the weight through gives
 *
 *     W_h(d) = h^2 / (pi * (h^2 + d^2)^2),     integral over the plane = 1
 *
 * a soft bell whose half width is the crown's own HEIGHT. That is the part a bare "is there a tree
 * directly overhead" test gets wrong: standing in a 26 m clearing under 13 m trees you have not got
 * the whole sky back, because the trees around the edge still cover the low half of it, and this
 * kernel says so without being told. It is also why the closure is smooth over ground that is a
 * lattice of hard-edged instances.
 *
 * WHAT COUNTS AS A CROWN. Two separate questions, answered by the two files that own them.
 * ASSET_CLASSES says WHETHER a thing is a tree: a class whose collider is at least
 * {@link CANOPY_HEIGHT_M} tall. That line is the registry's own, it is shared with the server, and
 * it is what separates a buttress tree from a fern without this file holding a list of names.
 * scatterGeometry.ts says HOW MUCH shade it casts: the crown area is the silhouette of the form the
 * scatter actually draws, everything above {@link CROWN_BASE_M}, rasterised from above off the very
 * BufferGeometry that is in the scene. So a dead tree, which is classified as canopy by its five
 * metre collider and drawn as bare sticks, contributes almost nothing, and nobody had to write that
 * down: it was measured off the mesh.
 *
 * WHERE IT IS APPLIED, and what that costs. Into the ground's vertex colour, on the same 12 m
 * lattice groundColour.ts already paints, once at build, and NOTHING per frame: no shader is
 * patched, no texture is uploaded and no material changes, so the ground goes on being one
 * MeshLambertMaterial with vertex colours and the largest surface in the frame costs exactly what
 * it cost before. Measured on the shipped routes: 17.0 ms on the parcel and 19.2 on the demo, of
 * which 7.5 and 7.4 are the splat, the rest being one exponential integral on the 5% of lattice
 * cells that carry canopy and one pass rewriting 39,144 and 28,776 vertex colours. That is against
 * a terrain build of 193 ms and a scatter build of 388, and it re-uploads only the colour
 * attribute. The colour is blended TOWARDS
 * PALETTE.shadow by the closure, so the ink is the floor by construction and no clamp is needed:
 * the darkest vertex measured on any of the three routes sits 2.47x above the ink in linear
 * luminance. That
 * blend is the art bible's rule, long soft ink shadows and never black, and it is why the shade is
 * blue and not grey.
 *
 * THE APPROXIMATION IS STATED RATHER THAN HIDDEN. The vertex colour multiplies BOTH lights, so
 * darkening it also dims the key, which already has its own shadow map. That is deliberate: at the
 * 16.3 degree dusk sun a fourteen metre tree throws its shadow forty-eight metres east, so the ground
 * directly under a crown is not in that crown's shadow at all and the shadow map leaves it fully
 * lit, which is exactly the ground this term exists to darken. The floor a person sees is the sum
 * of the two and the two are not double-counting the same photons; what is admitted is that a floor
 * ALREADY in shadow is darkened a second time, by the sky it has genuinely lost.
 *
 * WHAT THE MEASUREMENT SAYS ABOUT THE FOREST, which is worth more than the shading. Over the near
 * field of the ordinary parcel the crowns cover 0.61 square metres of every square metre of ground,
 * so L is about 0.6 and the floor keeps 38% of its sky. A real closed rainforest floor receives the
 * 1 to 2% C17 quotes, which is L near 5. This planet's rainforest is therefore about eight times
 * thinner than the thing it is named after: 4,500 buttress candidates per square kilometre against
 * a real 40,000 to 60,000 stems, with a drawn crown 7 m across against a real 15 to 25 m. No
 * shading term can close that gap honestly, and the part of the inversion that survives this change
 * is the forest being thin, not the floor being wrong. Making it a real rainforest is an
 * ASSET_CLASSES change and lands behind DECISIONS C5's one bump, not here.
 */

import type { AssetClass, PlacedAsset, RegionScene } from "@echo/planet";
import { linearRgb } from "@echo/planet";
import * as THREE from "three";

import { PALETTE } from "../three/palette";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";
import type { ScatterLayer } from "./scatterLayer";
import type { TerrainLayer } from "./terrainChunks";

/**
 * A class whose collider is at least this tall is a canopy tree; anything shorter is understorey.
 *
 * The line is drawn on ASSET_CLASSES's own numbers because that table is the shared contract and it
 * already carries the answer. Four metres because of where the gap in the registry is: the tallest
 * collider that is not a tree is a cactus at 2.4 m, then a boulder at 1.8 and a thicket at 1.6,
 * while the shortest thing that is a tree is a dead tree at 5 m, then an acacia at 6. Nothing in
 * the table sits between 2.4 and 5, so this threshold has a metre and a half of clearance on both
 * sides and no class is near it.
 *
 * The understorey is left out rather than forgotten, and the size of what is left out was measured
 * rather than asserted. Running the same field over every class that is NOT canopy, each with its
 * own form and its own height, the ordinary parcel's near field gains 0.048 of optical depth on top
 * of 0.606 and the demo's 0.040 on top of 0.523, which moves the transmittance by 6.6% and 5.6%.
 * That is because a fern's kernel is one metre wide: its whole shade is a third of a square metre,
 * and the lattice it would be drawn on is twelve metres. What a fern actually shades is the leaf it
 * is standing on, and the eye sees the fern.
 */
export const CANOPY_HEIGHT_M = 4;

/**
 * Geometry above this height, in the class's own frame at scale 1, is crown.
 *
 * Head height, which is the honest line: what is over a walking person is sky they cannot see, and
 * what is beside them is not. Every canopy form the scatter draws is cleanly above it (a palm's
 * fronds start at 10.2 m and a buttress crown at 10.6), and it is measured against the FORM rather
 * than the collider so that a class drawn as bare sticks contributes the shade bare sticks cast.
 *
 * It does not have to separate the canopy from the understorey, because CANOPY_HEIGHT_M has already
 * done that on the class: a vine tangle reaches 3.6 m and would be over this line, and it is never
 * offered to the rasteriser at all.
 */
export const CROWN_BASE_M = 3;

/**
 * How many crown heights out the kernel is carried before it is cut off.
 *
 * W_h has a fat tail: the mass inside radius R is R^2 / (h^2 + R^2), so three heights holds 90% of
 * it and ten would hold 99%. The ladder, on the parcel's 12,131 canopy instances at a 13.7 m crown:
 * 1h costs 1.6 ms, 2h 2.5, 3h 4.1, 4h 6.0, 6h 11.2 and 8h 18.5, and the field 3h draws differs from
 * the 8h one by a mean 0.0041 and a worst 0.0347 of optical depth over the 9,307 cells either of
 * them touches, which at these depths is under a percent of transmittance. So three: a 41 m reach,
 * seven lattice cells across, for a quarter of the cost of the answer that cannot be told from it.
 *
 * The 10% that is cut off is not thrown away. It is renormalised back onto the cells that WERE
 * written, so every instance deposits exactly its own crown area on the lattice however it falls
 * between the lattice points, and a tree near the edge of the raster does not lose its shade.
 */
const KERNEL_REACH_HEIGHTS = 3;

/** PALETTE.shadow in the linear space the colour attribute is read in (DECISIONS C3). */
const SHADOW = linearRgb([
  (PALETTE.shadow >> 16) & 0xff,
  (PALETTE.shadow >> 8) & 0xff,
  PALETTE.shadow & 0xff,
]);

// ── the exponential integral ────────────────────────────────────────────────────

/**
 * E1(x), the exponential integral, Abramowitz and Stegun 5.1.53 and 5.1.56.
 *
 * Both are polynomial fits the handbook gives error bounds for, 2e-7 below 1 and 2e-8 above it, and
 * `packages/planet` has no special functions to borrow. The alternative was to quadrature T(L)
 * directly at every lattice point, which is a few thousand exp() calls per point for a number this
 * gets in nine multiplies; tests/canopyClosure.test.mts checks this against a 4,096 step Simpson
 * rule over the original integral rather than against a second copy of these coefficients.
 */
function expInt1(x: number): number {
  if (x <= 0) return Infinity;
  if (x < 1) {
    return (
      -Math.log(x) -
      0.57721566 +
      x * (0.99999193 + x * (-0.24991055 + x * (0.05519968 + x * (-0.00976004 + x * 0.00107857))))
    );
  }
  // 5.1.56: x e^x E1(x) = (x^4 + a3 x^3 + a2 x^2 + a1 x + a0) / (x^4 + b3 x^3 + b2 x^2 + b1 x + b0)
  const num = x * (x * (x * (x + 8.5733287401) + 18.059016973) + 8.6347608925) + 0.2677737343;
  const den = x * (x * (x * (x + 9.5733223454) + 25.6329561486) + 21.0996530827) + 3.9584969228;
  return (Math.exp(-x) * num) / (x * den);
}

/**
 * The fraction of a diffuse floor's sky that survives a canopy of optical depth `L`: 2 * E3(L).
 *
 * E3 comes off E1 by the recurrence E(n+1)(x) = (e^-x - x En(x)) / n, twice, which is exact
 * arithmetic on top of the one fitted function.
 */
export function skyTransmittance(L: number): number {
  if (!(L > 0)) return 1;
  const e = Math.exp(-L);
  const e1 = expInt1(L);
  const e2 = e - L * e1;
  const e3 = (e - L * e2) / 2;
  return e3 * 2;
}

// ── the crown of a drawn form ───────────────────────────────────────────────────

export interface Crown {
  /** Silhouette area of everything above CROWN_BASE_M, seen from above, square metres at scale 1. */
  areaM2: number;
  /** Area-weighted height of that silhouette, metres at scale 1. The kernel's half width. */
  heightM: number;
}

/**
 * The crown of one class, measured off the geometry the scatter put in the scene.
 *
 * RASTERISED, not summed. Adding up the triangles' own projected areas counts the top and the
 * bottom of every closed blob and counts the overlap between a buttress tree's two crowns twice: on
 * the shipped form it reads 85.6 square metres where the silhouette is 29.0, which is 2.95x the
 * shade and would have been invisible in a screenshot. It would also be inconsistent between forms,
 * because a palm's crown is single-sided cards and sums to 1.04x its own silhouette, so the error is
 * three times worse on one tree than on the other. A tenth-metre grid over the form's own bounds is
 * a few thousand cells and runs once per class per build.
 */
export function crownOf(geometry: THREE.BufferGeometry, baseM = CROWN_BASE_M, cellM = 0.1): Crown {
  const p = geometry.getAttribute("position").array as ArrayLike<number>;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const tris: number[] = [];
  for (let o = 0; o < p.length; o += 9) {
    // The whole triangle, if any corner of it is crown: a face that spans the line belongs to the
    // thing above it. The alternative, its centroid, drops the skirt of a canopy blob.
    //
    // What that lets in is the trunk, where a trunk crosses the line, and it was measured rather
    // than argued about: against the strict rule of "every corner above it", the buttress tree is
    // identical to the hundredth of a square metre because its trunk stands inside its own crown's
    // footprint, and the palm gains 0.08 of its 7.61, which is 1.1%.
    if (Math.max(p[o + 1]!, p[o + 4]!, p[o + 7]!) < baseM) continue;
    tris.push(p[o]!, p[o + 2]!, p[o + 3]!, p[o + 5]!, p[o + 6]!, p[o + 8]!, (p[o + 1]! + p[o + 4]! + p[o + 7]!) / 3);
    for (let k = 0; k < 9; k += 3) {
      if (p[o + k]! < minX) minX = p[o + k]!;
      if (p[o + k]! > maxX) maxX = p[o + k]!;
      if (p[o + k + 2]! < minZ) minZ = p[o + k + 2]!;
      if (p[o + k + 2]! > maxZ) maxZ = p[o + k + 2]!;
    }
  }
  if (tris.length === 0) return { areaM2: 0, heightM: 0 };

  const nx = Math.max(1, Math.ceil((maxX - minX) / cellM));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cellM));
  // The highest crown surface over each cell, so the height is the height of the sky the cell
  // hides and not the average of a blob's own top and bottom faces.
  const top = new Float32Array(nx * nz).fill(-Infinity);
  for (let t = 0; t < tris.length; t += 7) {
    const ax = tris[t]!;
    const az = tris[t + 1]!;
    const bx = tris[t + 2]!;
    const bz = tris[t + 3]!;
    const cx = tris[t + 4]!;
    const cz = tris[t + 5]!;
    const y = tris[t + 6]!;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cellM));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / cellM));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cellM));
    const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - minZ) / cellM));
    for (let j = j0; j <= j1; j++) {
      const z = minZ + (j + 0.5) * cellM;
      for (let i = i0; i <= i1; i++) {
        const x = minX + (i + 0.5) * cellM;
        const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
        const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
        const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
        if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
        const k = j * nx + i;
        if (y > top[k]!) top[k] = y;
      }
    }
  }
  let cells = 0;
  let sumY = 0;
  for (let k = 0; k < top.length; k++) {
    if (top[k] === -Infinity) continue;
    cells++;
    sumY += top[k]!;
  }
  return cells === 0 ? { areaM2: 0, heightM: 0 } : { areaM2: cells * cellM * cellM, heightM: sumY / cells };
}

// ── the field ───────────────────────────────────────────────────────────────────

export interface ClosureStats {
  /** Classes read as canopy, and the crown measured off each one's drawn form. */
  crowns: Record<string, { areaM2: number; heightM: number; instances: number }>;
  /** Instances splatted, the cell writes that took, and the distinct cells left carrying canopy. */
  splatted: number;
  cellWrites: number;
  cellsWithCanopy: number;
  /** Vertices whose colour was darkened, and vertices left exactly as the paint wrote them. */
  darkened: number;
  untouched: number;
  /** The optical depth over the drawn land: how much crown stands over a square metre of ground. */
  opticalDepth: { p50: number; p95: number; max: number; meanOverDressed: number };
  /** The transmittance the darkest vertex kept, and how far above PALETTE.shadow it left the floor. */
  minTransmittance: number;
  darkestOverShadow: number;
  /** Wall clock for the whole thing, milliseconds, and the splat's share of it. */
  millis: number;
  splatMillis: number;
}

export interface ClosureField {
  /** Optical depth per lattice cell, row major, (2 * half + 1) square. */
  L: Float32Array;
  half: number;
  n: number;
  stepM: number;
  /** Lattice index of a scene position, or -1 for one off the raster. */
  indexOfScene(x: number, z: number): number;
}

/**
 * Splat every canopy instance's crown onto the ground lattice and return the optical depth.
 *
 * The lattice is the mesh's own, laid out exactly as groundColour.ts lays it out, because these two
 * write to the same vertices and a raster half a step off would shade the wrong ground.
 */
export function canopyOpticalDepth(
  region: RegionScene,
  placed: readonly PlacedAsset[],
  crowns: ReadonlyMap<string, Crown>,
  frame: WorldFrame,
): { field: ClosureField; splatted: number; cellWrites: number; millis: number } {
  const t0 = performance.now();
  const stepM = region.resolution;
  const half = Math.ceil(region.extentM / stepM) + 2;
  const n = 2 * half + 1;
  const L = new Float32Array(n * n);
  const cellArea = stepM * stepM;

  // One scratch buffer for the kernel, sized for the largest reach any crown here asks for, so the
  // inner loop allocates nothing across forty thousand instances.
  //
  // Sized off the INSTANCES rather than off the classes' declared scale range, because the range is
  // a third table to keep in step and getting it wrong is silent: a stamp wider than this buffer
  // reads `undefined` off the end of it, and undefined times a number is NaN, which would go into
  // the optical depth and come out as a black cell nobody could trace.
  let maxReachM = 0;
  for (const p of placed) {
    const crown = crowns.get(p.classId);
    if (!crown || crown.areaM2 <= 0) continue;
    const reach = KERNEL_REACH_HEIGHTS * crown.heightM * p.scale;
    if (reach > maxReachM) maxReachM = reach;
  }
  const side = 2 * Math.max(1, Math.ceil(maxReachM / stepM)) + 1;
  const weight = new Float64Array(side * side);

  let splatted = 0;
  let cellWrites = 0;
  for (const p of placed) {
    const crown = crowns.get(p.classId);
    if (!crown || crown.areaM2 <= 0) continue;
    const area = crown.areaM2 * p.scale * p.scale;
    const h = crown.heightM * p.scale;
    const reach = KERNEL_REACH_HEIGHTS * h;
    const cells = Math.max(1, Math.ceil(reach / stepM));
    const [tx, ty] = frame.fromLocalM(p.x, p.y);
    const fi = (tx * frame.tileM) / stepM + half;
    const fj = (-ty * frame.tileM) / stepM + half;
    const ci = Math.round(fi);
    const cj = Math.round(fj);
    const h2 = h * h;

    // Two passes over the same stamp: the weights, then the total, so the truncated tail is put
    // back onto the cells that were written and every instance deposits exactly its own crown.
    let total = 0;
    let w = 0;
    for (let dj = -cells; dj <= cells; dj++) {
      const jj = cj + dj;
      const dz = (jj - fj) * stepM;
      for (let di = -cells; di <= cells; di++, w++) {
        const ii = ci + di;
        if (ii < 0 || ii >= n || jj < 0 || jj >= n) {
          weight[w] = 0;
          continue;
        }
        const dx = (ii - fi) * stepM;
        const d2 = dx * dx + dz * dz;
        if (d2 > reach * reach) {
          weight[w] = 0;
          continue;
        }
        const k = h2 + d2;
        const value = h2 / (Math.PI * k * k);
        weight[w] = value;
        total += value;
      }
    }
    if (total <= 0) continue;
    // The kernel is a density per square metre and the lattice samples it per CELL, so the sum is
    // multiplied by the cell area before it is normalised; what lands is area / cellArea, which is
    // the optical depth this instance contributes where it contributes it.
    const scale = area / (total * cellArea);
    w = 0;
    for (let dj = -cells; dj <= cells; dj++) {
      const jj = cj + dj;
      for (let di = -cells; di <= cells; di++, w++) {
        if (weight[w] === 0) continue;
        L[jj * n + ci + di]! += weight[w]! * scale;
        cellWrites++;
      }
    }
    splatted++;
  }

  const field: ClosureField = {
    L,
    half,
    n,
    stepM,
    indexOfScene(x, z) {
      const i = Math.round(x / stepM) + half;
      const j = Math.round(-z / stepM) + half;
      return i < 0 || i >= n || j < 0 || j >= n ? -1 : j * n + i;
    },
  };
  return { field, splatted, cellWrites, millis: performance.now() - t0 };
}

/**
 * Darken the ground under the canopy, in place, on the meshes the terrain layer uploaded.
 *
 * It writes into the colour attribute rather than making a second one: the arrays are the terrain
 * layer's, they hold what groundColour.ts painted, and this is the last thing that touches them
 * before the first frame. Only the attribute is re-uploaded, and only once, at build.
 */
export function applyCanopyClosure(
  region: RegionScene,
  meshes: readonly THREE.Mesh[],
  placed: readonly PlacedAsset[],
  classes: readonly AssetClass[],
  geometryOf: (classId: string) => THREE.BufferGeometry | undefined,
  frame: WorldFrame,
): { stats: ClosureStats; field: ClosureField } {
  const t0 = performance.now();

  const counts = new Map<string, number>();
  for (const p of placed) counts.set(p.classId, (counts.get(p.classId) ?? 0) + 1);

  const crowns = new Map<string, Crown>();
  const report: ClosureStats["crowns"] = {};
  for (const cls of classes) {
    if (!cls.collider || cls.collider.heightM < CANOPY_HEIGHT_M) continue;
    const geometry = geometryOf(cls.id);
    if (!geometry) continue;
    const crown = crownOf(geometry);
    crowns.set(cls.id, crown);
    report[cls.id] = { areaM2: crown.areaM2, heightM: crown.heightM, instances: counts.get(cls.id) ?? 0 };
  }

  const { field, splatted, cellWrites, millis: splatMillis } = canopyOpticalDepth(region, placed, crowns, frame);

  // The transmittance per lattice cell, computed once for the cells that have any canopy over them
  // at all and read by every vertex sharing that cell. On the ordinary parcel 6,524 of the lattice's
  // 123,201 cells carry canopy, so this runs on 5% of it and the rest is a compare.
  const T = new Float32Array(field.L.length).fill(1);
  const depths: number[] = [];
  let minT = 1;
  for (let k = 0; k < field.L.length; k++) {
    const L = field.L[k]!;
    if (L <= 0) continue;
    const t = skyTransmittance(L);
    T[k] = t;
    depths.push(L);
    if (t < minT) minT = t;
  }

  let darkened = 0;
  let untouched = 0;
  let darkestLuma = Infinity;
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    const colour = mesh.geometry.getAttribute("color");
    if (!position || !colour) continue;
    const p = position.array as ArrayLike<number>;
    const c = colour.array as Float32Array;
    let moved = false;
    for (let o = 0; o < p.length; o += 3) {
      // The seabed keeps what the builder gave it, exactly as groundColour.ts leaves it: it is
      // under a sea plane, nothing stands in the water, and what colour the sea is belongs to the
      // layer drawing it.
      if (p[o + 1]! < 0) {
        untouched++;
        continue;
      }
      const k = field.indexOfScene(p[o]!, p[o + 2]!);
      if (k < 0 || T[k] === 1) {
        untouched++;
        continue;
      }
      const t = T[k]!;
      // Towards the ink, never past it: PALETTE.shadow is the floor by construction and the art
      // bible's "never black" holds however dense a future canopy gets.
      c[o] = SHADOW[0] + (c[o]! - SHADOW[0]) * t;
      c[o + 1] = SHADOW[1] + (c[o + 1]! - SHADOW[1]) * t;
      c[o + 2] = SHADOW[2] + (c[o + 2]! - SHADOW[2]) * t;
      const luma = 0.2126 * c[o]! + 0.7152 * c[o + 1]! + 0.0722 * c[o + 2]!;
      if (luma < darkestLuma) darkestLuma = luma;
      darkened++;
      moved = true;
    }
    if (moved) colour.needsUpdate = true;
  }

  depths.sort((a, b) => a - b);
  const at = (q: number) => (depths.length ? depths[Math.min(depths.length - 1, Math.floor(depths.length * q))]! : 0);
  const shadowLuma = 0.2126 * SHADOW[0] + 0.7152 * SHADOW[1] + 0.0722 * SHADOW[2];
  const stats: ClosureStats = {
    crowns: report,
    splatted,
    cellWrites,
    cellsWithCanopy: depths.length,
    darkened,
    untouched,
    opticalDepth: {
      p50: at(0.5),
      p95: at(0.95),
      max: depths.length ? depths[depths.length - 1]! : 0,
      meanOverDressed: depths.length ? depths.reduce((s, v) => s + v, 0) / depths.length : 0,
    },
    minTransmittance: minT,
    darkestOverShadow: Number.isFinite(darkestLuma) ? darkestLuma / shadowLuma : Infinity,
    millis: performance.now() - t0,
    splatMillis,
  };
  return { stats, field };
}

// ── the layer ───────────────────────────────────────────────────────────────────

export interface CanopyClosureLayer extends WorldLayer {
  readonly name: "canopy-closure";
  /** What the build measured, or null before it. */
  stats(): ClosureStats | null;
  /** The optical depth field, for a test that wants to read it. Null before the build. */
  field(): ClosureField | null;
}

/**
 * The layer, which owns nothing and reaches for two things by name.
 *
 * IT IS ITS OWN LAYER, and the reason is the build order. The terrain has to be built before there
 * is a ground to darken and the scatter has to be built before there are trees to darken it with,
 * so this cannot live inside either one: putting it in the terrain layer would need the placement
 * that does not exist yet, and putting it in the scatter layer would hide a write to another
 * layer's buffers inside a build that is about instancing. parcelWorld.ts already documents the
 * order as load-bearing and this is one more line of it, in the open, where the next person reads
 * the order rather than discovering it.
 *
 * A world composed without one of them gets a warning and its ground unshaded, which is the same
 * shape of failure the scatter's missing-form path takes: thinner, and loud.
 *
 * IT MUST NOT RUN TWICE OVER ONE GROUND, because the darkening is a multiply and running it twice
 * squares it: an honest 0.44 becomes 0.19 and the floor is a hole. PlanetWorld.start disposes every
 * layer before it rebuilds, so the terrain layer hands back freshly built and freshly painted
 * arrays and there is no path in the app that can do it. `appliedTo` is here anyway, holding the
 * identity of the region it darkened, because "there is no path today" is how the seating bug got
 * in: a second call on the same region says so instead of quietly halving the world.
 */
export function canopyClosureLayer(): CanopyClosureLayer {
  let stats: ClosureStats | null = null;
  let field: ClosureField | null = null;
  let appliedTo: RegionScene | null = null;

  return {
    name: "canopy-closure",
    stats: () => stats,
    field: () => field,
    async build(ctx: LayerContext, signal: AbortSignal): Promise<void> {
      const terrain = ctx.layer<TerrainLayer>("terrain");
      const scatter = ctx.layer<ScatterLayer>("scatter");
      if (!terrain?.region || !scatter?.placement()) {
        console.warn(
          `[canopy-closure] no ${!terrain?.region ? "terrain" : "scatter"} layer built before this one, so the ` +
            `ground under the trees keeps the open sky's light. parcelWorld.ts documents the order this layer needs.`,
        );
        return;
      }
      const region = terrain.region;
      if (appliedTo === region) {
        console.warn(
          `[canopy-closure] this exact region has already been darkened once and darkening is a ` +
            `multiply, so a second pass would square it. Nothing was done. Rebuild the terrain layer first.`,
        );
        return;
      }

      // A macrotask before seventeen milliseconds of arithmetic, exactly as the terrain and the
      // scatter take one, so an unmount during the build lands here rather than after it. There is
      // no yield INSIDE the work below and there must not be: it is one synchronous pass over the
      // colour arrays, so this check is the only place an abort can be honoured, and honouring it
      // after the pass would leave the ground half darkened with nothing recording that it was.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal.aborted) return;

      const result = applyCanopyClosure(
        region,
        terrain.chunks,
        scatter.placement()!.placed,
        scatter.classes(),
        (id) => scatter.meshes.get(id)?.geometry,
        ctx.frame,
      );
      appliedTo = region;
      stats = result.stats;
      field = result.field;
    },
    dispose() {
      stats = null;
      field = null;
      appliedTo = null;
    },
  };
}
