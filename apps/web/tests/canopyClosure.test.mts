/**
 * The ground under the trees is darker and the ground in the open is not, and this is what says so
 * without a screenshot (DECISIONS C17).
 *
 * WHAT THIS FILE IS DEFENDING AGAINST, and it is one thing above all others. C17 rejected a global
 * exposure cut, and a closure that came out constant would BE that cut with extra steps: it would
 * move every headline number the pixel measurement reports in exactly the right direction, on both
 * shipped routes, while making a beach and a desert wrong. Measured, that failure is invisible to
 * any average: on the ordinary parcel every ground pixel in the frame is within 15 m of a canopy
 * tree, so a constant and a real field darken the same visible floor by the same amount. So the
 * assertions below are all two-sided, and the second side is always ground that has no canopy over
 * it and must come back BIT FOR BIT unchanged.
 *
 * THE INDEPENDENT STATISTIC. Nothing here asks the closure whether it closed. Where a vertex is
 * shaded is checked against a count of canopy instances near it, taken straight off the placement
 * with no kernel, no silhouette and no exponential integral in it: the input the field is built
 * from, never the field. And skyTransmittance, the one piece of real analysis in the module, is
 * checked against a Simpson quadrature of the integral it claims to be, not against a second copy
 * of its own coefficients.
 *
 * THE WORLD IS THE APP'S. Every layer comes out of `parcelLayers`, in the order that file
 * documents, so a route that stopped building the closure layer fails here.
 *
 * Run:  node --import tsx --test apps/web/tests/canopyClosure.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import {
  createSceneHeight,
  createTangentPatch,
  createTerrain,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  linearRgb,
  PARCEL_REGION_K,
  PLANET_PARAMS,
  regionBound,
  spawnPointFor,
  walkableAt,
  type Calibration,
  type PlacedAsset,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import {
  CANOPY_HEIGHT_M,
  skyTransmittance,
  type CanopyClosureLayer,
} from "../src/game/world/canopyClosure";
import { localMToTile, tileToLocalM } from "../src/game/world/controller";
import type { MeasureChain } from "../src/game/world/measure";
import { parcelLayers, sliceOptionsFor } from "../src/game/world/parcelWorld";
import { PALETTE } from "../src/game/three/palette";
import type { LayerContext, WorldFrame } from "../src/game/world/PlanetWorld";
import type { ScatterLayer } from "../src/game/world/scatterLayer";
import type { TerrainLayer } from "../src/game/world/terrainChunks";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8"),
) as { calibration: Calibration; demoCell: string; seed: string };

const seed = golden.seed;
const calibration = golden.calibration;
const field = createTerrain(seed);
const heightScaleM = DEFAULT_SCENE_OPTIONS.heightScaleM;
const resolutionM = DEFAULT_REGION_OPTIONS.resolution;

/** The ordinary parcel the phase is judged on: 100% rainforest, and the densest canopy that ships. */
const PARCEL_CELL = "8482589ffffffff";
/**
 * The open one, and it is here because NEITHER shipped route has a square metre of open ground in
 * view: measured through the real camera, every ground pixel on the parcel is within 14.9 m of a
 * canopy tree and every one on the demo within 17.6 m. 87.9% of the ground within 120 m of this
 * cell's spawn is beach and 12.1% is sea, with palms standing on it, so one region holds open sand,
 * sand under a crown, and the negative this file exists to hold.
 */
const BEACH_CELL = "847b959ffffffff";

const chain = { armed: () => false, feedPosition: () => {} } as unknown as MeasureChain;

/**
 * A parcel world with no renderer, built from the app's own layer list.
 *
 * The frame is PlanetWorld's, reconstructed the way apps/web/tests/scatter.test.mts reconstructs
 * it, for the same reason: that constructor allocates a GL context in its second half and its first
 * half is arithmetic. The renderer stub is the two fields the terrain layer sets on `shadowMap`, so
 * anything else it starts asking for fails loudly here.
 */
async function buildWorld(cell: string, slice: boolean) {
  const patch = createTangentPatch(cell, PLANET_PARAMS.radiusKm);
  const bound = regionBound(cell, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
  const spawn = spawnPointFor(cell, field, calibration, PLANET_PARAMS.radiusKm)!;
  const toLocalM = (x: number, y: number) => tileToLocalM(x, y, TILE_M);
  const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, TILE_M);
  const sceneHeight = createSceneHeight(patch, field, calibration, { heightScaleM, resolution: resolutionM });
  const heightAtTile = (x: number, y: number) => {
    const [xm, ym] = toLocalM(x, y);
    return sceneHeight(xm, ym);
  };
  const frame: WorldFrame = {
    patch,
    tileM: TILE_M,
    heightScaleM,
    resolutionM,
    heightAtTile,
    walkableTile: (x, y) => {
      const [xm, ym] = toLocalM(x, y);
      return walkableAt(patch, field, calibration.seaLevel, xm, ym, bound);
    },
    toScene: (x, y, liftM = 0, out = new THREE.Vector3()) =>
      out.set(x * TILE_M, Math.max(0, heightAtTile(x, y)) + liftM, y * TILE_M),
    fromScene: (v) => [v.x / TILE_M, v.z / TILE_M],
    toLocalM,
    fromLocalM,
  };
  const scene = new THREE.Scene();
  const layers = parcelLayers({ chain, slice: sliceOptionsFor(slice ? "slice" : null, {}) });
  const byName = new Map(layers.map((l) => [l.name, l] as const));
  const ctx: LayerContext = {
    scene,
    camera: new THREE.PerspectiveCamera(),
    renderer: { shadowMap: { enabled: false, type: THREE.PCFShadowMap } } as unknown as THREE.WebGLRenderer,
    frame,
    field,
    calibration,
    seed,
    radiusKm: PLANET_PARAMS.radiusKm,
    region: { cell, k: PARCEL_REGION_K, bound, extentM: bound.radiusM, spawn, spawnTile: fromLocalM(spawn.x, spawn.y) },
    layer: (name) => byName.get(name) as never,
  };

  const terrain = byName.get("terrain") as TerrainLayer;
  const scatter = byName.get("scatter") as ScatterLayer;
  const closure = byName.get("canopy-closure") as CanopyClosureLayer | undefined;
  assert.ok(closure, "parcelLayers built no canopy-closure layer, so no ground is ever shaded (DECISIONS C17)");
  const signal = new AbortController().signal;
  await terrain.build(ctx, signal);
  await scatter.build(ctx, signal);

  // What the paint left, before the closure touched it. Snapshotted off the meshes the terrain
  // layer uploaded, which is what the closure writes into.
  const before = terrain.chunks.map((m) => Float32Array.from(m.geometry.getAttribute("color").array as Float32Array));
  await closure.build(ctx, signal);

  return { ctx, frame, spawn, terrain, scatter, closure, before };
}

interface Vertex {
  /** Scene position. */
  x: number;
  y: number;
  z: number;
  /** Linear luminance of the colour before and after the closure. */
  lumaBefore: number;
  lumaAfter: number;
  /** How much of its albedo the vertex kept: 1 is untouched. */
  kept: number;
  /** Canopy instances within NEAR_M, counted straight off the placement. */
  trees: number;
  /** Metres to the nearest canopy instance. */
  nearestTreeM: number;
  colourAfter: [number, number, number];
}

/** The radius the independent tree count is taken over: about one crown height, the kernel's scale. */
const NEAR_M = 15;

const lumaOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Every drawn land vertex, with what the closure did to it and how many trees are near it.
 *
 * The tree count is the INDEPENDENT half and it is deliberately dumb: a count of instances inside a
 * circle, off the placement, with no kernel and no crown in it. `CANOPY_HEIGHT_M` is imported
 * rather than retyped because it is the shipped line between a tree and a fern and a copy of it
 * here would be a test agreeing with itself.
 */
function vertices(w: Awaited<ReturnType<typeof buildWorld>>): Vertex[] {
  const canopyIds = new Set(
    w.scatter.classes().filter((c) => c.collider && c.collider.heightM >= CANOPY_HEIGHT_M).map((c) => c.id),
  );
  const trees: Array<[number, number]> = [];
  for (const p of w.scatter.placement()!.placed as readonly PlacedAsset[]) {
    if (!canopyIds.has(p.classId)) continue;
    const [tx, ty] = w.frame.fromLocalM(p.x, p.y);
    trees.push([tx * w.frame.tileM, ty * w.frame.tileM]);
  }
  // A grid over the instances, so this is a few million distance tests and not four hundred
  // thousand times twelve thousand.
  const CELL = 32;
  const grid = new Map<string, Array<[number, number]>>();
  for (const t of trees) {
    const k = `${Math.floor(t[0] / CELL)},${Math.floor(t[1] / CELL)}`;
    const list = grid.get(k);
    if (list) list.push(t);
    else grid.set(k, [t]);
  }
  // Exact inside `radius`, which is all either caller needs: the box is ceil(radius / CELL) cells
  // each way, so it reaches at least 3 * 32 = 96 m for the 80 m question and 32 m for the 15 m one.
  // `nearest` past the box is therefore not the true nearest, and nothing here reads it as one:
  // the only use is the predicate "further than 80 m", which the box does answer.
  const around = (x: number, z: number, radius: number) => {
    let n = 0;
    let nearest = Infinity;
    const r = Math.ceil(radius / CELL);
    const ci = Math.floor(x / CELL);
    const cj = Math.floor(z / CELL);
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        for (const t of grid.get(`${i},${j}`) ?? []) {
          const d = Math.hypot(t[0] - x, t[1] - z);
          if (d < nearest) nearest = d;
          if (d <= radius) n++;
        }
      }
    }
    return { n, nearest };
  };

  const out: Vertex[] = [];
  const seen = new Set<number>();
  const step = w.terrain.region!.resolution;
  for (let c = 0; c < w.terrain.chunks.length; c++) {
    const p = w.terrain.chunks[c]!.geometry.getAttribute("position").array as Float32Array;
    const after = w.terrain.chunks[c]!.geometry.getAttribute("color").array as Float32Array;
    const before = w.before[c]!;
    for (let o = 0; o < p.length; o += 3) {
      if (p[o + 1]! < 0) continue;
      // One reading per lattice point: a vertex is shared by up to six triangles and two chunks.
      const key = (Math.round(p[o]! / step) + 1e4) * 1e5 + Math.round(-p[o + 2]! / step) + 1e4;
      if (seen.has(key)) continue;
      seen.add(key);
      const lb = lumaOf(before[o]!, before[o + 1]!, before[o + 2]!);
      const la = lumaOf(after[o]!, after[o + 1]!, after[o + 2]!);
      // A radius wide enough that the nearest tree is always found: the grid ring above is exact
      // inside `radius`, so the nearest is only trustworthy out to it, and everything past it is
      // reported as "further than this".
      const near = around(p[o]!, p[o + 2]!, 80);
      out.push({
        x: p[o]!,
        y: p[o + 1]!,
        z: p[o + 2]!,
        lumaBefore: lb,
        lumaAfter: la,
        kept: lb > 0 ? la / lb : 1,
        trees: around(p[o]!, p[o + 2]!, NEAR_M).n,
        nearestTreeM: near.nearest,
        colourAfter: [after[o]!, after[o + 1]!, after[o + 2]!],
      });
    }
  }
  return out;
}

const parcel = await buildWorld(PARCEL_CELL, false);
const beach = await buildWorld(BEACH_CELL, false);
const parcelV = vertices(parcel);
const beachV = vertices(beach);

const mean = (a: readonly number[]) => a.reduce((s, v) => s + v, 0) / a.length;

// ── (a) the two sides: shaded under the crowns, untouched in the open ───────────

/**
 * The bracket the whole file turns on.
 *
 * The upper bound is not a taste: a floor that kept more than 70% of its albedo under the densest
 * canopy this world grows would not be visible as shade at all, and the measured value at the
 * shipped constants is 0.533. The lower bound is EXACT, and it is exact on purpose: "nearly
 * unchanged" is the tolerance a constant closure would slip through, so it is bit equality.
 *
 * EIGHTY METRES is where the open half is read, and it is a bound rather than a taste too. The
 * kernel is cut off at three crown heights and the tallest crown the scatter draws is 13.72 m at
 * scale 1, 21.9 m at the buttress tree's largest scale of 1.6, so nothing can reach past 65.8 m.
 * Eighty is that with a lattice step and a bit of room, and the assertion is therefore about the
 * cutoff as much as about the field: a kernel that grew a longer tail would fail here.
 */
test("ground under the crowns is shaded, and ground with no tree over it is untouched to the bit", () => {
  const shaded = parcelV.filter((v) => v.trees >= 8);
  const open = parcelV.filter((v) => v.nearestTreeM > 80);
  assert.ok(shaded.length > 200, `only ${shaded.length} vertices have ${8} canopy trees within ${NEAR_M} m`);
  assert.ok(open.length > 1000, `only ${open.length} vertices are more than 80 m from a canopy tree`);

  const keptShaded = mean(shaded.map((v) => v.kept));
  assert.ok(
    keptShaded < 0.7,
    `ground under the densest canopy kept ${(keptShaded * 100).toFixed(1)}% of its albedo, which is not shade a ` +
      `person can see; at the shipped constants it keeps 53.3%`,
  );

  const moved = open.filter((v) => v.lumaAfter !== v.lumaBefore);
  assert.equal(
    moved.length,
    0,
    `${moved.length} of ${open.length} vertices with no canopy tree within 80 m were darkened anyway ` +
      `(worst kept ${Math.min(...moved.map((v) => v.kept)).toFixed(4)} at ${moved[0] ? `(${moved[0].x.toFixed(0)}, ${moved[0].z.toFixed(0)})` : ""}). ` +
      `That is a closure that is not a function of the trees, which is DECISIONS C17's rejected global cut with extra steps.`,
  );

  console.log(
    `closure: ${shaded.length} vertices under 8+ trees keep ${(keptShaded * 100).toFixed(1)}% of their albedo, ` +
      `${open.length} with no tree within 80 m keep exactly 100%`,
  );
});

// ── (b) it tracks the trees, and the trees are counted somewhere else ───────────

test("the shade follows the crowns: more trees near a vertex, less albedo kept, monotonically", () => {
  const bins = [0, 1, 3, 6, 10, 15];
  const kept = bins.map((lo, i) => {
    const hi = bins[i + 1] ?? Infinity;
    const set = parcelV.filter((v) => v.trees >= lo && v.trees < hi);
    return { lo, hi, n: set.length, kept: set.length ? mean(set.map((v) => v.kept)) : NaN };
  });
  const usable = kept.filter((b) => b.n >= 50);
  assert.ok(usable.length >= 5, `only ${usable.length} tree-count bins have 50 vertices in them`);
  console.log(
    "closure vs trees within 15 m: " +
      usable.map((b) => `${b.lo}-${b.hi === Infinity ? "" : b.hi}: ${b.n} verts kept ${(b.kept * 100).toFixed(1)}%`).join(", "),
  );

  for (let i = 1; i < usable.length; i++) {
    assert.ok(
      usable[i]!.kept < usable[i - 1]!.kept,
      `ground with ${usable[i]!.lo}-${usable[i]!.hi} trees within ${NEAR_M} m kept ` +
        `${(usable[i]!.kept * 100).toFixed(1)}% of its albedo and ground with ${usable[i - 1]!.lo}-${usable[i - 1]!.hi} kept ` +
        `${(usable[i - 1]!.kept * 100).toFixed(1)}%: the shade does not follow the trees, so it is not canopy closure`,
    );
  }
  // And the span has to be a span. Monotone alone is satisfied by a field that varies by a percent.
  const span = usable[0]!.kept / usable[usable.length - 1]!.kept;
  assert.ok(
    span > 1.8,
    `the darkest tree bin keeps ${(usable[usable.length - 1]!.kept * 100).toFixed(1)}% and the emptiest ` +
      `${(usable[0]!.kept * 100).toFixed(1)}%, a span of ${span.toFixed(2)}x: too flat to be a canopy and too flat to be seen`,
  );
});

// ── (c) the ink is the floor, and no material is painted in it ─────────────────

test("PALETTE.shadow is the floor of the shade and nothing reaches it", () => {
  const ink = linearRgb([(PALETTE.shadow >> 16) & 0xff, (PALETTE.shadow >> 8) & 0xff, PALETTE.shadow & 0xff]);
  const inkLuma = lumaOf(ink[0], ink[1], ink[2]);
  let below = 0;
  let darkest = Infinity;
  let darkestAt: Vertex | null = null;
  for (const v of [...parcelV, ...beachV]) {
    if (v.colourAfter[0] < ink[0] - 1e-6 || v.colourAfter[1] < ink[1] - 1e-6 || v.colourAfter[2] < ink[2] - 1e-6) below++;
    if (v.lumaAfter < darkest) {
      darkest = v.lumaAfter;
      darkestAt = v;
    }
  }
  assert.equal(
    below,
    0,
    `${below} vertices were darkened past PALETTE.shadow, which the art bible bans outright: a shadow is ink and ` +
      `never black, and a material painted below the ink is a hole in the floor`,
  );
  const over = darkest / inkLuma;
  assert.ok(
    over > 1.5,
    `the darkest ground vertex sits at ${over.toFixed(2)}x PALETTE.shadow's own luminance, so the deepest floor has ` +
      `become the shadow colour rather than ground standing in shadow`,
  );
  console.log(
    `ink floor: darkest vertex ${over.toFixed(2)}x PALETTE.shadow, at (${darkestAt!.x.toFixed(0)}, ${darkestAt!.z.toFixed(0)})`,
  );
});

// ── (d) the transmittance is the integral it says it is ────────────────────────

/**
 * 2 * integral(0..1) u exp(-L/u) du, by Simpson over 4,096 panels.
 *
 * Written out here rather than imported because it is the whole point: `skyTransmittance` reaches
 * the same number through E1's fitted polynomials and two recurrences, and a test that asked it
 * whether it agreed with itself would pass on any coefficients at all.
 */
function quadrature(L: number): number {
  const n = 4096;
  const f = (u: number) => (u <= 0 ? 0 : u * Math.exp(-L / u));
  let s = f(0) + f(1);
  for (let i = 1; i < n; i++) s += f(i / n) * (i % 2 ? 4 : 2);
  return 2 * ((s * (1 / n)) / 3);
}

test("skyTransmittance is 2 E3(L), against a quadrature of the integral rather than against itself", () => {
  assert.equal(skyTransmittance(0), 1, "a floor with no canopy over it must keep all of its sky");
  let worst = 0;
  let worstAt = 0;
  for (let L = 0.01; L <= 6; L += 0.01) {
    const err = Math.abs(skyTransmittance(L) - quadrature(L));
    if (err > worst) {
      worst = err;
      worstAt = L;
    }
  }
  assert.ok(
    worst < 1e-5,
    `skyTransmittance is ${worst.toExponential(2)} away from the integral it claims to be, worst at L=${worstAt.toFixed(2)} ` +
      `(${skyTransmittance(worstAt).toFixed(6)} against ${quadrature(worstAt).toFixed(6)}). Either the E1 fit is wrong or the ` +
      `law is not the cosine-weighted one, and both mean the floor is shaded by an amount nothing derived.`,
  );
  // And it must not be the vertical-ray answer, which is the mistake this replaces: at the depths
  // this world actually grows, exp(-L) is a third brighter than the hemisphere is.
  const L = 0.6;
  assert.ok(
    skyTransmittance(L) < Math.exp(-L) * 0.8,
    `at L=${L} the transmittance is ${skyTransmittance(L).toFixed(4)} against exp(-L) = ${Math.exp(-L).toFixed(4)}: the ` +
      `grazing directions are not being charged for the extra leaf they cross`,
  );
  console.log(
    `transmittance: worst error ${worst.toExponential(2)} over L in [0.01, 6]; T(0.6) = ${skyTransmittance(0.6).toFixed(4)} ` +
      `against a vertical-ray exp(-0.6) = ${Math.exp(-0.6).toFixed(4)}`,
  );
});

// ── (e) a clearing reads as a clearing ─────────────────────────────────────────

test("the ground the scatter swept keeps more of its sky than the forest around it", () => {
  const spawn = parcel.frame.fromLocalM(parcel.spawn.x, parcel.spawn.y);
  const sx = spawn[0] * parcel.frame.tileM;
  const sz = spawn[1] * parcel.frame.tileM;
  const ex = parcel.scatter.exclusions()!;
  const polys = ex.footprints.map((poly) =>
    poly.map(([xm, ym]) => {
      const [tx, ty] = parcel.frame.fromLocalM(xm, ym);
      return [tx * parcel.frame.tileM, ty * parcel.frame.tileM] as [number, number];
    }),
  );
  // Point in convex polygon, written out rather than imported from assets.ts: a test that asks the
  // code under test whether it cleared what it cleared is proving nothing.
  const inside = (x: number, z: number) =>
    polys.some((poly) => {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
        if (cross === 0) continue;
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
      }
      return poly.length >= 3;
    });

  const swept = parcelV.filter((v) => inside(v.x, v.z));
  const ring = parcelV.filter((v) => {
    const d = Math.hypot(v.x - sx, v.z - sz);
    return d >= 25 && d <= 60;
  });
  assert.ok(swept.length >= 3, `the swept footprint holds only ${swept.length} lattice vertices`);
  assert.ok(ring.length >= 30, `the ring around it holds only ${ring.length} lattice vertices`);
  const inK = mean(swept.map((v) => v.kept));
  const outK = mean(ring.map((v) => v.kept));
  // 1.2, against a shipped 1.33 (60.0% inside, 45.1% out): a tenth of margin, because the clearing
  // is 25.6 by 19.2 m and the lattice is 12, so it is three vertices and a small move in the
  // placement can shift one of them. A constant closure reads 1.01 here and still fails.
  assert.ok(
    inK > outK * 1.2,
    `the swept clearing keeps ${(inK * 100).toFixed(1)}% of its albedo and the forest 25 to 60 m out keeps ` +
      `${(outK * 100).toFixed(1)}%: standing in the clearing is no brighter than standing in the trees, so the ground ` +
      `the scatter cleared does not read as cleared`,
  );
  console.log(
    `clearing: ${swept.length} swept vertices keep ${(inK * 100).toFixed(1)}%, ${ring.length} in the ring 25-60 m out keep ${(outK * 100).toFixed(1)}%`,
  );
});

// ── (f) the open route ─────────────────────────────────────────────────────────

test("a beach is not darkened: the open sand is untouched and only the ground under the palms moves", () => {
  const stats = beach.closure.stats()!;
  // The same 80 m the parcel's open half uses, and for the same reason: it is past every kernel's
  // cutoff. This cell has buttress trees inland as well as palms on the sand, and at 40 m it caught
  // 121 vertices that a 21.9 m crown legitimately reaches.
  const open = beachV.filter((v) => v.nearestTreeM > 80);
  const under = beachV.filter((v) => v.trees >= 3);
  assert.ok(open.length > 1000 && under.length > 100, `${open.length} open and ${under.length} shaded vertices`);

  const movedOpen = open.filter((v) => v.lumaAfter !== v.lumaBefore).length;
  assert.equal(
    movedOpen,
    0,
    `${movedOpen} of ${open.length} beach vertices with no canopy tree within 80 m were darkened anyway, so the shade ` +
      `is reaching ground no crown stands over and open sand is being dimmed`,
  );

  const keptUnder = mean(under.map((v) => v.kept));
  assert.ok(keptUnder < 0.85, `sand under the palms kept ${(keptUnder * 100).toFixed(1)}% of its albedo, which is no shade at all`);

  // And the whole region, so this is a statement about the ground and not about a sample of it.
  const untouched = stats.untouched / (stats.untouched + stats.darkened);
  assert.ok(
    untouched > 0.8,
    `only ${(untouched * 100).toFixed(1)}% of this beach cell's vertices were left alone: a closure that reaches most ` +
      `of an open coast is an exposure cut, which is the option DECISIONS C17 rejected`,
  );
  console.log(
    `beach: ${(untouched * 100).toFixed(1)}% of the region untouched, ${open.length} open vertices unchanged, ` +
      `${under.length} under palms keep ${(keptUnder * 100).toFixed(1)}%`,
  );
});

// ── (g) C17 and C20 are two mechanisms and they still agree ────────────────────

/**
 * DECISIONS C20 stopped everything under 1.7 m casting a shadow, and thicket is 1.6. This file's
 * subject is the OTHER mechanism that darkens a floor, and the question it has to answer is whether
 * the picture still says the same thing about a bush now that the shadow map says nothing about it.
 *
 * THE TWO THRESHOLDS ARE FAR APART AND THE ORDER IS THE POINT. C17's canopy line is
 * {@link CANOPY_HEIGHT_M}, 4 m, and C20's is 1.7. So every class the closure reads as canopy clears
 * C20's bar with two and a bit metres to spare, and not one crown stopped casting. What C20 silenced
 * is entirely below what C17 ever counted: thicket, fallen-log, berry-bush, driftwood, shore-rock,
 * none of which the closure has ever had a crown for. The mechanisms cannot have swapped roles.
 *
 * SO THE GROUND UNDER A BUSH IS DARK FOR THE CLOSURE'S REASON, and this measures that it still is.
 * The bush is not what darkens it and never was, at either mechanism: it is 1.6 m of leaf on a 12 m
 * lattice, under crowns that are. Measured here, every thicket on all three routes stands on ground
 * the closure has already darkened, which is what C20's "its shadow disappears into the bands the
 * canopy is already casting" claims and is the half of that claim a node test can reach.
 *
 * IT IS MEASURED ON THE BEACH ROUTE because a comparison against a clearing needs a clearing, and
 * neither dense route has one: over both, not one lattice vertex has nothing standing within 12 m
 * of it. That is C17's own finding about these two cells, arriving again.
 */
test("C17's closure still darkens the ground under a bush that C20 stopped casting", () => {
  const SHOULDER_M = 1.7;

  // The order of the two lines, and then every class between them, so this is a statement about the
  // registry and not about the two numbers.
  assert.ok(
    CANOPY_HEIGHT_M > SHOULDER_M,
    `C17 calls a ${CANOPY_HEIGHT_M} m thing canopy and C20 lets a ${SHOULDER_M} m thing cast: the closure would be ` +
      `reading crowns off classes with no shadow, which is the two mechanisms disagreeing about what a tree is`,
  );
  for (const w of [parcel, beach]) {
    for (const cls of w.scatter.classes()) {
      if (!cls.collider || cls.collider.heightM < CANOPY_HEIGHT_M) continue;
      assert.ok(
        cls.castsShadow && cls.collider.heightM >= SHOULDER_M,
        `${cls.id} is canopy to the closure at ${cls.collider.heightM} m and casts no shadow under C20, so its crown ` +
          `darkens the ground while the sun goes straight through it`,
      );
    }
  }

  const thicketsOf = (w: Awaited<ReturnType<typeof buildWorld>>) => {
    const out: Array<[number, number]> = [];
    for (const p of w.scatter.placement()!.placed as readonly PlacedAsset[]) {
      if (p.classId !== "thicket") continue;
      const [tx, ty] = w.frame.fromLocalM(p.x, p.y);
      out.push([tx * w.frame.tileM, ty * w.frame.tileM]);
    }
    return out;
  };
  const nearest = (xs: ReadonlyArray<readonly [number, number]>, x: number, z: number) => {
    let best = Infinity;
    for (const [px, pz] of xs) {
      const d = Math.hypot(px - x, pz - z);
      if (d < best) best = d;
    }
    return best;
  };

  const bushes = thicketsOf(beach);
  assert.ok(bushes.length > 100, `the beach route holds only ${bushes.length} thickets, so this proves nothing`);

  // Half a lattice step: the closest a 12 m vertex ever gets to standing under a 1.6 m bush.
  const under = beachV.filter((v) => nearest(bushes, v.x, v.z) <= 6);
  // Nothing standing near it at all, by both counts, which is what a clearing is.
  const clearing = beachV.filter((v) => v.nearestTreeM > 80 && nearest(bushes, v.x, v.z) > 30);
  assert.ok(under.length > 50, `only ${under.length} vertices sit under a thicket`);
  assert.ok(clearing.length > 200, `only ${clearing.length} vertices are open ground`);

  const keptUnder = mean(under.map((v) => v.kept));
  const keptOpen = mean(clearing.map((v) => v.kept));
  assert.ok(
    keptUnder < keptOpen * 0.9,
    `ground under a thicket keeps ${(keptUnder * 100).toFixed(1)}% of its albedo and open ground keeps ` +
      `${(keptOpen * 100).toFixed(1)}%: since C20 the bush casts no shadow either, so if the closure is not darkening ` +
      `this ground then a thicket now stands on a floor as bright as a clearing and reads as a sticker on it`,
  );
  // The other side, the one that says this is a field and not an exposure cut: the clearing has to
  // be untouched, not merely brighter.
  assert.ok(
    keptOpen > 0.999,
    `open ground kept ${(keptOpen * 100).toFixed(3)}% of its albedo rather than all of it, so the comparison above is ` +
      `between two darkened grounds and says nothing about a clearing`,
  );

  // The fact C20's argument rests on, on every route this file builds.
  const lines: string[] = [];
  for (const [name, w] of [["parcel", parcel], ["beach", beach]] as const) {
    const f = w.closure.field()!;
    const bs = thicketsOf(w);
    let covered = 0;
    for (const [x, z] of bs) {
      const i = f.indexOfScene(x, z);
      if (i >= 0 && f.L[i]! > 0.1) covered++;
    }
    const share = (100 * covered) / Math.max(1, bs.length);
    assert.ok(
      share > 95,
      `only ${share.toFixed(1)}% of ${name}'s ${bs.length} thickets stand under canopy the closure can measure, so ` +
        `${(100 - share).toFixed(1)}% of them now sit on ground nothing darkens and nothing shadows`,
    );
    lines.push(`${name} ${share.toFixed(1)}% of ${bs.length} thickets under measurable canopy`);
  }

  console.log(
    `C20 vs C17: beach ground under a thicket keeps ${(keptUnder * 100).toFixed(1)}% against a clearing's ` +
      `${(keptOpen * 100).toFixed(1)}% (${under.length} and ${clearing.length} vertices); ${lines.join(", ")}`,
  );
});
