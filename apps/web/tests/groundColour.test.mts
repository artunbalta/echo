/**
 * The ground stopped being one flat colour, and this is what says so without a screenshot.
 *
 * Task A10 replaces every land vertex's `BIOME_COLOUR` with a recipe made of palette materials. It
 * is visual work, and visual work has a particular way of passing a test while shipping nothing:
 * the numbers this file asserts were chosen so that the four ways this change can quietly go wrong
 * each break one of them.
 *
 *   IT PAINTS NOTHING. The mean and the spread of every biome are pinned. A recipe that fell back
 *   to the table would move both.
 *
 *   IT PAINTS THE WRONG GROUND. The biome comes from the colour attribute, which is the only place
 *   the chunk carries it. If the eleven table reds ever stopped being distinct, or the raster
 *   stopped landing on the builder's lattice, a whole biome would be painted from another's recipe
 *   or from the wrong cell, and the frame would still look like a frame. Both are asserted.
 *
 *   IT PAINTS IN THE WRONG SPACE. DECISIONS C3 is a seam that is invisible until it is on a
 *   monitor. Mixing these same recipes in sRGB and converting afterwards moves rainforest's mean
 *   from (68, 54, 34) to (61, 49, 31) and savanna's spread from 20.9 to 25.9, so the pinned means
 *   are what catch it.
 *
 *   IT PAINTS NOISE. "More varied" is not the goal; more varied AND still ground is. The measure is
 *   the difference between two vertices one lattice step apart against the field's own spread:
 *   white noise at the lattice frequency gives sqrt(2) = 1.414, and structure gives a small number.
 *   Every biome is bounded, and the two that draw a LINE at the lattice limit, the frost net and the
 *   rock joints, are bounded separately and measured with the line switched off as well.
 *
 * Renderer-free: everything here is arithmetic over @echo/planet's own arrays.
 *
 * Run:  node --import tsx --test apps/web/tests/groundColour.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BIOMES,
  BIOME_COLOUR,
  BIOME_COLOUR_LINEAR,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  DEMO_CELL,
  PARCEL_REGION_K,
  PLANET_PARAMS,
  buildRegionScene,
  createTerrain,
  linearRgb,
  srgbToLinear,
  type Biome,
  type Calibration,
  type RegionScene,
} from "@echo/planet";

import { FOLLOW_CAMERA, initialFollowCamera } from "../src/game/world/followCamera";
import { PALETTE } from "../src/game/three/palette";
import { GROUND_MEAN_SRGB, paintRegionGround } from "../src/game/world/groundColour";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8"),
) as { calibration: Calibration; demoCell: string; seed: string };
assert.equal(golden.demoCell, DEMO_CELL, "the goldens were written for a different demo cell");

const SEED = golden.seed;
const CALIBRATION = golden.calibration;
const FIELD = createTerrain(SEED);

/** The ordinary parcel the phase is judged on: 100% rainforest, and the flattest possible read. */
const PARCEL_CELL = "8482589ffffffff";
/** 100% savanna, where the burn mosaic is the whole frame. */
const SAVANNA_CELL = "843c8a1ffffffff";
/** 100% tundra, where the frost net is. */
const TUNDRA_CELL = "8400001ffffffff";
/**
 * Grassland, taiga, and 12,109 beach vertices with no sea anywhere in the region: the elevation
 * band of DECISIONS C4 painting beach inland. It is here because that is the one input the beach
 * recipe cannot get from the mesh, and the answer has to be dry sand rather than a NaN.
 */
const DRY_BEACH_CELL = "84160a1ffffffff";

const build = (cell: string): RegionScene =>
  buildRegionScene(cell, PARCEL_REGION_K, FIELD, CALIBRATION, PLANET_PARAMS.radiusKm, {
    resolution: DEFAULT_REGION_OPTIONS.resolution,
    heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM,
  });

const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const lumaOfLinear = (r: number, g: number, b: number): number =>
  0.2126 * linearToSrgb(r) * 255 + 0.7152 * linearToSrgb(g) * 255 + 0.0722 * linearToSrgb(b) * 255;
const lumaOfBytes = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

/** Where each lattice point's biome was BEFORE the paint, since afterwards the colour is not a label. */
function labelLattice(region: RegionScene): { index: (x: number, z: number) => number; at: Int8Array } {
  const byRed = new Map<number, number>();
  BIOMES.forEach((b, i) => byRed.set(Math.fround(BIOME_COLOUR_LINEAR[b]![0]), i));
  const step = region.resolution;
  const half = Math.ceil(region.extentM / step) + 2;
  const n = 2 * half + 1;
  const at = new Int8Array(n * n).fill(-1);
  const index = (x: number, z: number) => (Math.round(-z / step) + half) * n + Math.round(x / step) + half;
  for (const chunk of region.chunks) {
    for (let o = 0; o < chunk.positions.length; o += 3) {
      at[index(chunk.positions[o]!, chunk.positions[o + 2]!)] = byRed.get(chunk.colours[o]!) ?? -1;
    }
  }
  return { index, at };
}

interface BiomeStats {
  n: number;
  meanSrgb: [number, number, number];
  lumaSd: number;
  /** |luma difference| between two vertices one lattice step apart, in sRGB units of 255. */
  neighbourDelta: { p50: number; p90: number; p99: number };
  minLuma: number;
}

/**
 * Every drawn vertex, grouped by the biome it had BEFORE the paint.
 *
 * The labels are taken as an argument rather than read here, and that is not tidiness. The label is
 * the colour, and after the paint the colour is no longer a label: an earlier version of this file
 * called `labelLattice` on an already-painted region, matched nothing, and every per-biome assertion
 * below passed over an empty map. `paintAndMeasure` is the only way in, so that cannot come back.
 */
function measure(region: RegionScene, { index, at }: ReturnType<typeof labelLattice>): Map<Biome, BiomeStats> {
  const acc = new Map<number, { n: number; r: number; g: number; b: number; y: number; y2: number; d: number[]; min: number }>();
  const get = (k: number) => {
    let a = acc.get(k);
    if (!a) acc.set(k, (a = { n: 0, r: 0, g: 0, b: 0, y: 0, y2: 0, d: [], min: Infinity }));
    return a;
  };
  for (const chunk of region.chunks) {
    const p = chunk.positions;
    const c = chunk.colours;
    for (let o = 0; o < c.length; o += 9) {
      const y = [0, 0, 0];
      for (let v = 0; v < 3; v++) {
        const q = o + v * 3;
        const a = get(at[index(p[q]!, p[q + 2]!)]!);
        a.n++;
        a.r += linearToSrgb(c[q]!) * 255;
        a.g += linearToSrgb(c[q + 1]!) * 255;
        a.b += linearToSrgb(c[q + 2]!) * 255;
        y[v] = lumaOfLinear(c[q]!, c[q + 1]!, c[q + 2]!);
        a.y += y[v]!;
        a.y2 += y[v]! * y[v]!;
        if (y[v]! < a.min) a.min = y[v]!;
      }
      // The two 12 m legs of the emitted triangle. The 17 m hypotenuse is left out so the ratio is
      // quoted at exactly one lattice step, and a leg whose two ends are DIFFERENT biomes is left
      // out too: the step from sand to sea floor is the biome table's own edge and was there before
      // this file existed, and counting it would report a coastline as though a recipe had drawn it.
      const label = [0, 1, 2].map((v) => at[index(p[o + v * 3]!, p[o + v * 3 + 2]!)]!);
      const a0 = get(label[0]!);
      if (label[0] === label[1]) a0.d.push(Math.abs(y[0]! - y[1]!));
      if (label[1] === label[2]) a0.d.push(Math.abs(y[1]! - y[2]!));
    }
  }
  const out = new Map<Biome, BiomeStats>();
  for (const [k, a] of acc) {
    if (k < 0) continue;
    a.d.sort((x, y) => x - y);
    const q = (f: number) => (a.d.length ? a.d[Math.min(a.d.length - 1, Math.floor(a.d.length * f))]! : 0);
    out.set(BIOMES[k]!, {
      n: a.n,
      meanSrgb: [a.r / a.n, a.g / a.n, a.b / a.n],
      lumaSd: Math.sqrt(Math.max(0, a.y2 / a.n - (a.y / a.n) ** 2)),
      neighbourDelta: { p50: q(0.5), p90: q(0.9), p99: q(0.99) },
      minLuma: a.min,
    });
  }
  return out;
}

/** Build, label, paint, measure, in the one order that gives an answer. */
function paintAndMeasure(cell: string): { region: RegionScene; stats: Map<Biome, BiomeStats> } {
  const region = build(cell);
  const labels = labelLattice(region);
  paintRegionGround(region, SEED);
  const stats = measure(region, labels);
  assert.ok(stats.size > 0, `${cell}: nothing was measured; the labels were read after the paint again`);
  return { region, stats };
}

// ── the label, and the lattice it lands on ──────────────────────────────────────

test("A10: the biome table inverts on the red channel, which is how a vertex knows what it is", () => {
  const reds = new Set(BIOMES.map((b) => Math.fround(BIOME_COLOUR_LINEAR[b]![0])));
  assert.equal(
    reds.size,
    BIOMES.length,
    "two biomes share a linear red; groundColour.ts would paint one of them with the other's recipe",
  );
});

test("A10: every vertex of both shipped routes lands on the raster and carries a biome", () => {
  for (const cell of [PARCEL_CELL, DEMO_CELL]) {
    const region = build(cell);
    const paint = paintRegionGround(region, SEED);
    // A stray means the builder's lattice moved out from under this file, and every signal in it
    // would then be read from the wrong cell: dark where the ground is not low, wet where there is
    // no water. It fails nothing at runtime, which is exactly why it is asserted here.
    assert.equal(paint.strays, 0, `${cell}: ${paint.strays} vertices fell outside the raster`);
    assert.equal(paint.unlabelled, 0, `${cell}: ${paint.unlabelled} vertices carried no biome`);
    assert.equal(paint.painted + paint.untouched, region.triangleCount * 3);
    assert.ok(paint.painted > 0, `${cell}: nothing was painted at all`);
  }
});

test("A10: a lattice point shared by two chunks still has exactly one colour", () => {
  // The builder promises this and packages/planet asserts it on its own output; the paint happens
  // afterwards and could break it by computing per vertex instead of per lattice point, which would
  // show up as a hairline seam along every chunk boundary.
  const region = build(DEMO_CELL);
  paintRegionGround(region, SEED);
  const seen = new Map<number, [number, number, number]>();
  const step = region.resolution;
  let checked = 0;
  for (const chunk of region.chunks) {
    for (let o = 0; o < chunk.positions.length; o += 3) {
      const key = (Math.round(chunk.positions[o]! / step) + 4096) * 8192 + Math.round(-chunk.positions[o + 2]! / step) + 4096;
      const here3: [number, number, number] = [chunk.colours[o]!, chunk.colours[o + 1]!, chunk.colours[o + 2]!];
      const was = seen.get(key);
      if (!was) {
        seen.set(key, here3);
        continue;
      }
      checked++;
      assert.deepEqual(here3, was, "one lattice point came back with two colours");
    }
  }
  assert.ok(checked > 100_000, `only ${checked} repeats were compared; the mesh is not a soup any more`);
});

// ── determinism ─────────────────────────────────────────────────────────────────

test("A10: the floor does not crawl between reloads, and never draws a random number", () => {
  const random = Math.random;
  const a = build(PARCEL_CELL);
  const b = build(PARCEL_CELL);
  try {
    Math.random = () => {
      throw new Error("groundColour reached Math.random; the floor would be different on every reload");
    };
    paintRegionGround(a, SEED);
    paintRegionGround(b, SEED);
  } finally {
    Math.random = random;
  }
  for (let i = 0; i < a.chunks.length; i++) {
    assert.deepEqual(a.chunks[i]!.colours, b.chunks[i]!.colours, `chunk ${i} differs between two builds of one cell`);
  }
  // And a different seed is a different planet, which is what salting from the seed is for.
  const c = build(PARCEL_CELL);
  paintRegionGround(c, "some-other-planet");
  assert.notDeepEqual(c.chunks[0]!.colours, a.chunks[0]!.colours, "two seeds gave one floor");
});

// ── what it paints ──────────────────────────────────────────────────────────────

test("A10: the sea floor is left exactly as the builder wrote it", () => {
  const region = build(DEMO_CELL);
  const before = region.chunks.map((c) => c.colours.slice());
  const paint = paintRegionGround(region, SEED);
  const ocean = linearRgb(BIOME_COLOUR.ocean);
  let seabed = 0;
  for (let i = 0; i < region.chunks.length; i++) {
    const now = region.chunks[i]!.colours;
    const was = before[i]!;
    for (let o = 0; o < now.length; o += 3) {
      if (was[o] !== Math.fround(ocean[0])) continue;
      seabed++;
      assert.equal(now[o], was[o], "the sea floor was repainted; it is under a sheet at 0.86 opacity");
    }
  }
  assert.ok(seabed > 1000, "the demo cell is 45% ocean and this found almost none of it");
  assert.equal(paint.untouched, seabed);
});

test("A10: each biome's mean and spread are what they were measured at", () => {
  const seen = new Set<Biome>();
  for (const cell of [PARCEL_CELL, DEMO_CELL, SAVANNA_CELL, TUNDRA_CELL, DRY_BEACH_CELL]) {
    for (const [biome, stats] of paintAndMeasure(cell).stats) {
      if (biome === "ocean") continue;
      seen.add(biome);
      const pinned = GROUND_MEAN_SRGB[biome];
      assert.ok(pinned, `${cell}: ${biome} has no pinned mean`);
      // Four per channel, and the tightness is the point rather than an accident. The pinned value
      // is the mean over ten regions and the between-region spread is 0 to 2 on every biome here,
      // so four is snug, and snug is what catches the colour space: the identical recipes mixed in
      // sRGB land rainforest on (61, 49, 31) against (68, 54, 34) and savanna on (145, 140, 87)
      // against (152, 143, 89), which slack of twelve waves through and this does not.
      //
      // Beach is the exception at twelve, because its recipe is driven by how far the ground is
      // from its own water and that genuinely differs: the demo coast is the wettest measured, at
      // 196 against a pooled 205, while an inland beach with no sea at all sits at 209.
      const slack = biome === "beach" ? 12 : 4;
      for (let c = 0; c < 3; c++) {
        assert.ok(
          Math.abs(stats.meanSrgb[c]! - pinned[c]!) <= slack,
          `${cell} ${biome} channel ${c}: ${stats.meanSrgb[c]!.toFixed(1)} against a pinned ${pinned[c]}, slack ${slack}`,
        );
      }
      // A biome that is one flat colour has a spread of zero, which is the state this task exists to
      // end. Four levels of 255 is a floor, not a target; the measured spreads run 5 to 21.
      assert.ok(stats.lumaSd > 4, `${cell} ${biome}: luma spread is only ${stats.lumaSd.toFixed(2)}; the floor is flat`);
    }
  }
  // Five cells were chosen to cover these five between them; a vacuous pass is a pass over nothing.
  for (const biome of ["rainforest", "beach", "savanna", "tundra", "grassland"] as const) {
    assert.ok(seen.has(biome), `${biome} was never measured; the cells above no longer contain it`);
  }
});

test("A10: the floor is darker than the canopy the globe still draws, and the open ground is not", () => {
  const measured = new Map<Biome, BiomeStats>();
  for (const cell of [PARCEL_CELL, SAVANNA_CELL, TUNDRA_CELL, DRY_BEACH_CELL, DEMO_CELL]) {
    for (const [biome, stats] of paintAndMeasure(cell).stats) if (!measured.has(biome)) measured.set(biome, stats);
  }
  for (const biome of ["rainforest", "taiga", "savanna", "grassland", "beach"] as const) {
    assert.ok(measured.has(biome), `${biome} was never measured; this test would pass over nothing`);
  }
  // Under a canopy. The biome table is what that canopy looks like from orbit and the globe is right
  // to keep it; this is the ground under it, which no orbital view has ever seen.
  for (const biome of ["rainforest", "forest", "taiga"] as const) {
    const stats = measured.get(biome);
    if (!stats) continue;
    const ratio = lumaOfBytes(stats.meanSrgb) / lumaOfBytes(BIOME_COLOUR[biome]);
    assert.ok(ratio < 0.8, `${biome} floor is ${(ratio * 100).toFixed(0)}% of its canopy; it is meant to be well under`);
  }
  // Open ground, where the two views are looking at the same surface. Savanna is the loosest of
  // these at 0.84, because a tenth of a savanna is charcoal at any moment.
  for (const biome of ["savanna", "grassland", "beach", "desert"] as const) {
    const stats = measured.get(biome);
    if (!stats) continue;
    const ratio = lumaOfBytes(stats.meanSrgb) / lumaOfBytes(BIOME_COLOUR[biome]);
    assert.ok(ratio > 0.8, `${biome} drifted to ${(ratio * 100).toFixed(0)}% of the table with no canopy to explain it`);
  }
});

test("A10: nothing on the ground is painted in the ink a shadow is drawn in", () => {
  // The bible bans black, and `char` is the darkest material any recipe reaches for. A blend cannot
  // go below its darkest input, so this is really a check that no recipe reaches past the palette.
  const floor = lumaOfBytes([(PALETTE.char >> 16) & 0xff, (PALETTE.char >> 8) & 0xff, PALETTE.char & 0xff]);
  const ink = lumaOfBytes([(PALETTE.shadow >> 16) & 0xff, (PALETTE.shadow >> 8) & 0xff, PALETTE.shadow & 0xff]);
  assert.ok(floor > ink * 2, "the darkest ground material is no longer clear of the ink");
  for (const cell of [SAVANNA_CELL, PARCEL_CELL]) {
    for (const [biome, stats] of paintAndMeasure(cell).stats) {
      if (biome === "ocean") continue;
      assert.ok(stats.minLuma >= floor - 0.5, `${cell} ${biome}: a vertex at luma ${stats.minLuma.toFixed(1)}, under ${floor.toFixed(1)}`);
    }
  }
});

// ── is it ground, or is it fizz ─────────────────────────────────────────────────

test("A10: the variation is structure, and the edges in it are edges somebody drew", () => {
  // THE MEDIAN, not the mean, and that choice is the whole test. Two vertices a lattice step apart
  // differing a lot is not by itself a fault: a burn scar and a frost trough are LINES, and a line
  // is supposed to be a step. What separates a line from fizz is the distribution. White noise puts
  // the median pair and the tail at the same place; a drawn line leaves most pairs flat and puts
  // everything in the tail.
  //
  // Measured, per 255: savanna's median pair differs by 3.1 and its 99th by 64.7, which is a flat
  // sward with a fire's edge across it. The frost net was tuned against exactly this number and
  // nothing else could have caught it: at 55 m polygons the tundra's mean ratio looked like
  // bare-rock's, while its MEDIAN pair differed by 9.2 of a 14.8 spread, which is not a net, it is
  // a field of noise with a net-shaped correlation. At 90 m the median is 5.0 and the 90th is 23.6.
  const medianBound = 0.4;
  let checked = 0;
  for (const cell of [PARCEL_CELL, DEMO_CELL, SAVANNA_CELL, TUNDRA_CELL, DRY_BEACH_CELL]) {
    for (const [biome, stats] of paintAndMeasure(cell).stats) {
      if (biome === "ocean") continue;
      checked++;
      const ratio = stats.neighbourDelta.p50 / stats.lumaSd;
      assert.ok(
        ratio <= medianBound,
        `${cell} ${biome}: the MEDIAN pair 12 m apart differs by ${stats.neighbourDelta.p50.toFixed(2)} against a spread of ${stats.lumaSd.toFixed(2)} (${ratio.toFixed(2)}); that is not an edge, that is everywhere`,
      );
      // And no single step is a wall. The largest step any recipe draws is the edge of a burn,
      // where charcoal meets standing thatch: measured, the savanna's 99th percentile pair differs
      // by 71.6 of 255 and the other biomes' by 11 to 35. That edge is meant to be sharp, because
      // a fire front stops at something, and one pair in a hundred is where an edge should live.
      assert.ok(
        stats.neighbourDelta.p99 < 90,
        `${cell} ${biome}: the worst percent of pairs step by ${stats.neighbourDelta.p99.toFixed(1)} levels`,
      );
    }
  }
  // The five cells above hold eight biome-and-cell pairs between them; a vacuous pass is a pass.
  assert.ok(checked >= 8, `only ${checked} biome-and-cell pairs were bounded`);
});

// ── the beach, which is the one recipe driven by something outside itself ───────

test("A10: a beach darkens toward its own water, and has no gradient where there is no water", () => {
  const region = build(DEMO_CELL);
  const { index, at } = labelLattice(region);
  const beach = BIOMES.indexOf("beach");
  const oceanIndex = BIOMES.indexOf("ocean");
  // The same chamfer the paint runs, over the same heights, so the buckets below are the distances
  // the recipe saw and not a second opinion about them.
  const step = region.resolution;
  const half = Math.ceil(region.extentM / step) + 2;
  const n = 2 * half + 1;
  const height = new Float32Array(n * n).fill(NaN);
  for (const chunk of region.chunks) {
    for (let o = 0; o < chunk.positions.length; o += 3) {
      height[index(chunk.positions[o]!, chunk.positions[o + 2]!)] = chunk.positions[o + 1]!;
    }
  }
  const d = new Float32Array(n * n).fill(Infinity);
  for (let k = 0; k < n * n; k++) if (Number.isFinite(height[k]!) && height[k]! <= 0) d[k] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 0; s < n * n; s++) {
      const k = pass === 0 ? s : n * n - 1 - s;
      const i = k % n;
      const j = (k - i) / n;
      let best = d[k]!;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj;
          const ii = i + di;
          if (jj < 0 || jj >= n || ii < 0 || ii >= n) continue;
          best = Math.min(best, d[jj * n + ii]! + (di === 0 || dj === 0 ? 3 : 4));
        }
      }
      d[k] = best;
    }
  }

  const near: number[] = [];
  const far: number[] = [];
  paintRegionGround(region, SEED);
  for (const chunk of region.chunks) {
    for (let o = 0; o < chunk.positions.length; o += 3) {
      const k = index(chunk.positions[o]!, chunk.positions[o + 2]!);
      if (at[k] !== beach) continue;
      const metres = (d[k]! / 3) * step;
      const y = lumaOfLinear(chunk.colours[o]!, chunk.colours[o + 1]!, chunk.colours[o + 2]!);
      if (metres <= 24) near.push(y);
      else if (metres >= 130) far.push(y);
    }
  }
  assert.ok(near.length > 200 && far.length > 200, `only ${near.length} near and ${far.length} far beach vertices`);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(
    mean(far) - mean(near) > 20,
    `the wet end is only ${(mean(far) - mean(near)).toFixed(1)} levels darker than the dry end; the gradient is not there`,
  );
  assert.equal(at[index(0, 0)] === oceanIndex, false, "the anchor centre is under water; this cell is not the demo");

  // The same recipe where the elevation band of DECISIONS C4 puts a beach with no sea in the region
  // at all. `waterDistanceM` is Infinity there and the answer has to be dry sand: a NaN would paint
  // black, and the wet end would be a beach nowhere near water.
  const dry = build(DRY_BEACH_CELL);
  assert.equal(dry.hasWater, false, "the dry-beach cell grew a sea; pick another");
  // The paint FIRST, then the measurement. This block used to run `measure` on line one and the
  // paint on line two, so `dryStats` was the builder's flat table and the assertion below could
  // not see the paint at all. Proven, not suspected: firing the wet ramp with no water, which is
  // the one case this test names, darkened the dry beach by 46 levels on the red channel and the
  // test stayed green. This file's own header records the same bug being fixed once already and
  // says `paintAndMeasure` is the only way in; this block had hand-rolled the order backwards.
  const labels = labelLattice(dry);
  paintRegionGround(dry, SEED);
  const dryStats = measure(dry, labels);
  assert.ok(dryStats.size > 0, "the labels did not resolve after the paint, so nothing was measured");
  const stats = dryStats.get("beach")!;
  assert.ok(stats.n > 5000, `only ${stats.n} inland beach vertices`);
  assert.ok(
    lumaOfBytes(stats.meanSrgb) > lumaOfBytes(GROUND_MEAN_SRGB.beach!),
    "an inland beach came out darker than the pooled beach mean; the wet ramp fired with no water",
  );
  for (const chunk of dry.chunks) {
    for (const v of chunk.colours) assert.ok(Number.isFinite(v), "a NaN reached the colour attribute");
  }
});

// ── what it costs ───────────────────────────────────────────────────────────────

test("A10: the rewrite is a step in a build, not a frame cost", () => {
  // Measured on a fresh process, one call, which is exactly how it is paid: the world is built once
  // and this runs once inside that build. 26 ms on the ordinary parcel, 34 on the demo and 35 on the
  // largest cell measured, against region builds of 180, 188 and 252, so it is a sixth of a step
  // that already exists. Nothing here runs per frame. The bound is loose on purpose: it is a
  // regression guard against an accidental per-vertex terrain evaluation, which would cost seconds,
  // and not a benchmark of whichever machine is running the suite.
  const region = build(PARCEL_CELL);
  const paint = paintRegionGround(region, SEED);
  assert.ok(paint.millis < 400, `the ground colour took ${paint.millis.toFixed(0)} ms; something in it is sampling the field`);
  assert.equal(paint.latticePoints * 6 > paint.painted, true, "more colours were computed than vertices share");
});

// ── the palette is the only source of colour ────────────────────────────────────

test("A10: every material the ground is made of is a named palette entry, in linear", () => {
  // Not a proof, a tripwire: the recipes mix inside the box these corners make, so a value blended
  // at a call site from something that is not in the palette shows up as a channel outside it.
  let lo = 1;
  let hi = 0;
  for (const hex of Object.values(PALETTE)) {
    for (const c of linearRgb([(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff])) {
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
  }
  assert.ok(lo < srgbToLinear(0.05) && hi > srgbToLinear(0.9), `the palette's own range is [${lo}, ${hi}]; the bound below would be vacuous`);
  const region = build(SAVANNA_CELL);
  paintRegionGround(region, SEED);
  for (const chunk of region.chunks) {
    for (let o = 0; o < chunk.colours.length; o++) {
      const v = chunk.colours[o]!;
      assert.ok(v >= lo - 1e-6 && v <= hi + 1e-6, `channel ${o} is ${v}, outside every colour this palette has`);
    }
  }
});

// ── the ground a person is STANDING ON (DECISIONS C18) ──────────────────────────

/**
 * WHY THERE IS A SECOND SPREAD MEASURE IN THIS FILE, and it is the seventh instance of the pattern
 * this project keeps writing down.
 *
 * The assertion above bounds each biome's spread over the WHOLE 4 km disk, where the rainforest's
 * albedo standard deviation is 10.4 levels of 255. Measured through the real camera on the frozen
 * dusk frame, over the ground a person is actually looking at, it was 1.1. The test passed on a
 * configuration nobody looks at: 43% of the ground rays in a shipped frame land inside ten metres,
 * the whole visible floor touches 25 distinct 12 m lattice cells, and the finest field the paint
 * had at the time was 72 m. So the disk bound is kept, because it catches a recipe that stopped
 * painting, and this one is added, because only this one is about the floor underfoot.
 *
 * THE INSTRUMENT IS CAMERA-FREE ON PURPOSE, and it is derived rather than picked. An eye `h` above
 * the ground sees a patch at horizontal distance `r` under a solid angle proportional to
 * `h / (r^2 + h^2)^1.5`, which is the inverse square law times the grazing cosine, and integrating
 * it says half of everything a standing person sees is inside `h * sqrt(3)` and 93% is inside 66 m.
 * At this game's own eye height, taken from FOLLOW_CAMERA rather than copied, that predicted median
 * is 7.8 m against the 10.7 m measured over 6,045 real camera rays. Weighting a disk that way is
 * the whole of "the ground a person can see" with no yaw, no field of view and no viewport in it,
 * and unlike one frame it does not depend on which way the player happens to be facing.
 *
 * It samples the DRAWN surface at 1 m, not the lattice, because the near floor is one triangle with
 * a Gouraud gradient across it and the lattice points are 12 m apart: measuring the corners would
 * be measuring something the eye never sees.
 */
const EYE_ABOVE_GROUND_M = (() => {
  const state = initialFollowCamera();
  return FOLLOW_CAMERA.chestM + state.boom * Math.sin(state.pitch);
})();

/** DECISIONS C18's own radius: the farthest ground ray in a shipped frame is 66 m. */
const NEAR_FIELD_M = 66;

/** The painted albedo of the drawn ground at a point, bilinear over the lattice. NaN off the mesh. */
function drawnLumaAt(lat: { n: number; half: number; step: number; luma: Float64Array }, x: number, z: number): number {
  const fi = x / lat.step + lat.half;
  const fj = -z / lat.step + lat.half;
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const tx = fi - i0;
  const tz = fj - j0;
  let v = 0;
  for (let dj = 0; dj < 2; dj++) {
    for (let di = 0; di < 2; di++) {
      const k = (j0 + dj) * lat.n + i0 + di;
      if (k < 0 || k >= lat.n * lat.n || Number.isNaN(lat.luma[k]!)) return NaN;
      v += lat.luma[k]! * (di ? tx : 1 - tx) * (dj ? tz : 1 - tz);
    }
  }
  return v;
}

/** The painted region as a lattice of albedo luma, with the biome each point had before the paint. */
function paintedLattice(cell: string): { n: number; half: number; step: number; luma: Float64Array; label: Int8Array } {
  const region = build(cell);
  const { index, at } = labelLattice(region);
  paintRegionGround(region, SEED);
  const step = region.resolution;
  const half = Math.ceil(region.extentM / step) + 2;
  const n = 2 * half + 1;
  const luma = new Float64Array(n * n).fill(NaN);
  for (const chunk of region.chunks) {
    for (let o = 0; o < chunk.positions.length; o += 3) {
      luma[index(chunk.positions[o]!, chunk.positions[o + 2]!)] = lumaOfLinear(chunk.colours[o]!, chunk.colours[o + 1]!, chunk.colours[o + 2]!);
    }
  }
  return { n, half, step, luma, label: at };
}

/**
 * The horizontal half angle the shipped camera actually sees: fov 50 at 1280 by 800.
 *
 * This exists because the first version of the assertion below integrated a full 360 degree disk
 * around the standing point, and a person is not a disk. The difference is not academic: over 121
 * standing points times 8 headings the disk reads a median of 3.33 on the ordinary parcel while the
 * wedge reads 2.50, and 63 percent of place-and-heading pairs come in under 3.0. Worse, the disk
 * version PASSED the very configuration DECISIONS C18 opens by calling flat, at 2.95 against its
 * own floor of 2.5, while that same paint reads 1.11 at the camera's own rays. A guard that cannot
 * separate the failure it names from the fix is not a guard.
 */
const CAMERA_HALF_ANGLE = Math.atan(Math.tan((50 * Math.PI) / 360) * (1280 / 800));

/**
 * The albedo spread a person standing at (x0, z0) and looking along `heading` sees, weighted by how
 * much of the eye each metre takes. Ground behind the shoulder is not seen and is not counted.
 */
function spreadFromHere(
  lat: ReturnType<typeof paintedLattice>,
  x0: number,
  z0: number,
  heading = 0,
): number | null {
  const h2 = EYE_ABOVE_GROUND_M * EYE_ABOVE_GROUND_M;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const cosLimit = Math.cos(CAMERA_HALF_ANGLE);
  let w = 0;
  let s = 0;
  let s2 = 0;
  for (let dz = -NEAR_FIELD_M; dz <= NEAR_FIELD_M; dz += 1) {
    for (let dx = -NEAR_FIELD_M; dx <= NEAR_FIELD_M; dx += 1) {
      const r2 = dx * dx + dz * dz;
      if (r2 > NEAR_FIELD_M * NEAR_FIELD_M) continue;
      // Inside the wedge the lens actually has. The point underfoot is always in it.
      if (r2 > 1 && (dx * fx + dz * fz) / Math.sqrt(r2) < cosLimit) continue;
      const y = drawnLumaAt(lat, x0 + dx, z0 + dz);
      if (Number.isNaN(y)) continue;
      const weight = EYE_ABOVE_GROUND_M / Math.pow(r2 + h2, 1.5);
      w += weight;
      s += weight * y;
      s2 += weight * y * y;
    }
  }
  if (w <= 0) return null;
  const m = s / w;
  return Math.sqrt(Math.max(0, s2 / w - m * m));
}

/** Every 120th drawn land point, which is a deterministic spread of standing places over the cell. */
function standingPoints(lat: ReturnType<typeof paintedLattice>): [number, number][] {
  const land: number[] = [];
  for (let k = 0; k < lat.luma.length; k++) {
    const b = lat.label[k]!;
    if (b >= 0 && BIOMES[b] !== "ocean" && !Number.isNaN(lat.luma[k]!)) land.push(k);
  }
  const stride = Math.max(1, Math.floor(land.length / 120));
  const out: [number, number][] = [];
  for (let c = 0; c < land.length; c += stride) {
    const k = land[c]!;
    out.push([((k % lat.n) - lat.half) * lat.step, -(Math.floor(k / lat.n) - lat.half) * lat.step]);
  }
  return out;
}

const median = (v: number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const pct = (v: number[], q: number): number => {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]!;
};

test("C18: the ground a person is STANDING ON is not one colour", () => {
  // Measured, median over about 120 standing points per cell: 3.36 on the ordinary parcel, 3.37 on
  // the demo, 7.53 on savanna, 7.08 on tundra and 4.57 on the three-biome cell. The 5th percentile
  // runs 1.88 to 3.84, so the bound below is not carried by a handful of lucky spots.
  //
  // 2.5 IS WHERE IT IS BECAUSE OF WHAT IT CATCHES, not because of the headroom it leaves. Pushing
  // the paint's whole noise ladder from 36 / 48 / 216 m out to 216 / 432 / 864, which is exactly
  // the failure DECISIONS C18 describes and which the disk assertion above passes with 9.0 levels
  // of its required 4, takes these medians to 2.01 and 1.98 on the two shipped routes. The bound
  // sits between that and the shipped 3.36, so the margin is 1.34x above and 1.24x below and both
  // numbers were measured rather than assumed.
  // 1.8 IS WHERE IT IS BECAUSE OF WHAT IT CAN AND CANNOT SEPARATE, measured at the camera's own
  // wedge rather than over a disk. Shipped, the five cells read 2.45, 2.44, 4.70, 5.43 and 3.46,
  // so the floor sits 1.36x under the tightest of them. An unpainted floor is one colour per biome
  // and reads essentially zero, which is the thing this has to catch and does.
  //
  // WHAT IT CANNOT SEPARATE, said plainly rather than left to be discovered. Putting the paint's
  // middle rung back to its pre-C18 72 m takes the two shipped routes to 2.21 and 2.15, which this
  // floor passes. That is not a hole in the bound, it is the honest size of that change at the
  // camera: the disk version of this statistic reported the same move as 2.95 to 3.33 and the
  // wedge reports it as 2.21 to 2.45, about a tenth of a level of 255. DECISIONS C18 records the
  // disk numbers and is corrected. A guard should not claim to discriminate what it cannot.
  const floor = 1.8;
  const p05Floor = 0.8;
  const measured: string[] = [];
  for (const cell of [PARCEL_CELL, DEMO_CELL, SAVANNA_CELL, TUNDRA_CELL, DRY_BEACH_CELL]) {
    const lat = paintedLattice(cell);
    const points = standingPoints(lat);
    // Eight headings per standing point, because which way a person is facing changes what they
    // see and the shipped heading is not special: measured, it ranks 27th of 36 at the spawn.
    const spreads = points
      .flatMap(([x, z]) => Array.from({ length: 8 }, (_, k) => spreadFromHere(lat, x, z, (k / 8) * Math.PI * 2)))
      .filter((v): v is number => v !== null);
    assert.ok(spreads.length > 60, `${cell}: only ${spreads.length} standing points had ground around them`);
    const mid = median(spreads);
    const sorted = [...spreads].sort((a, b) => a - b);
    measured.push(`${cell} median ${mid.toFixed(2)} p05 ${sorted[Math.floor(sorted.length * 0.05)]!.toFixed(2)}`);
    console.log(measured[measured.length - 1]);
    assert.ok(
      mid >= floor,
      `${cell}: standing anywhere on it, the albedo inside ${NEAR_FIELD_M} m has a spread of ${mid.toFixed(2)} levels of 255 weighted by how much of the eye each metre takes, under the ${floor} this floor has to carry. The whole-disk assertion in this file does not see that: a paint whose variation has all moved out past the near field still passes it.`,
    );
    assert.ok(
      pct(spreads, 0.05) >= p05Floor,
      `${cell}: the flattest twentieth of standing places sees ${pct(spreads, 0.05).toFixed(2)} levels, under ${p05Floor}; the median of ${mid.toFixed(2)} is being carried by the rest of the cell`,
    );
  }
});

test("C18: and the near field is ground rather than a step between two vertices", () => {
  // The other side of the same measurement. A paint could pass the bound above by putting all of
  // its near-field spread AT the lattice frequency, which is not a floor with variation in it, it
  // is a floor made of 12 m facets. So the median step between two lattice points a step apart is
  // bounded against the spread a standing person sees, rather than against the whole disk's, which
  // is the denominator the older fizz assertion in this file uses and is 3x larger.
  //
  // Measured: 0.70 on the ordinary parcel, 0.66 on the demo, 0.42 on savanna, 0.63 on tundra, and
  // white noise at the lattice would be 0.95.
  //
  // WHERE THIS GUARD STARTS WORKING, measured rather than claimed, by shortening the paint's finest
  // field and reading the ratio off the ordinary parcel: 36 m gives 0.704, 30 m 0.753, 26 m 0.776,
  // 22 m 0.796, 18 m 0.838, 15 m 0.881. So a bound of 0.80 fires from 18 m down and does NOT fire
  // at 22, which is already under the 24 m Nyquist of a 12 m lattice. That gap is real and it is
  // written here rather than papered over: what holds the 36 m floor is the ladder's own comment in
  // groundColour.ts and the older disk-based fizz assertion above, which fires on grassland at 15 m.
  //
  // THE NUMBERS ABOVE WERE TAKEN OVER A DISK, and the denominator is now the camera's own wedge,
  // which is smaller and therefore reads a smaller spread. The same shipped ground that gave 0.704
  // against the disk gives 0.93 against the wedge. Nothing about the ground changed; the ruler did.
  //
  // 0.95 is where the bound goes, and what it now means is worth being exact about, because the
  // honest reading is uncomfortable. White noise at the lattice would be 0.95, so a shipped 0.93 is
  // saying that across the near field the paint varies barely more than one step between two
  // vertices 12 m apart. That is the real state of the floor and it is not a measurement artefact:
  // inside 10 m, where 43.5% of the frame's ground rays land, the albedo standard deviation is 0.47
  // of one level of 255. Per-vertex colour on a 12 m lattice cannot carry a metre-scale thing, which
  // is why A28's fragment grain exists, and A28's swing was set to 0.16 after 0.24 was rendered,
  // looked at and REJECTED for making the floor underfoot the loudest thing in the frame.
  //
  // So this bound catches the floor collapsing onto the lattice and does NOT assert that the near
  // field is richly varied, because the design deliberately declined to buy that at the price it
  // costs. DECISIONS C18 is corrected to say so rather than to claim a spread the camera never sees.
  const bound = 0.95;
  for (const cell of [PARCEL_CELL, DEMO_CELL, SAVANNA_CELL, TUNDRA_CELL]) {
    const lat = paintedLattice(cell);
    const steps: number[] = [];
    for (let k = 0; k < lat.luma.length; k++) {
      const b = lat.label[k]!;
      if (b < 0 || BIOMES[b] === "ocean" || Number.isNaN(lat.luma[k]!)) continue;
      for (const kk of [k + 1, k + lat.n]) {
        if (kk >= lat.luma.length || lat.label[kk] !== b || Number.isNaN(lat.luma[kk]!)) continue;
        steps.push(Math.abs(lat.luma[kk]! - lat.luma[k]!));
      }
    }
    const points = standingPoints(lat);
    const near = median(points.map(([x, z]) => spreadFromHere(lat, x, z)).filter((v): v is number => v !== null));
    const ratio = median(steps) / near;
    assert.ok(steps.length > 10_000, `${cell}: only ${steps.length} lattice steps were compared`);
    assert.ok(
      ratio <= bound,
      `${cell}: the median step between two vertices 12 m apart is ${median(steps).toFixed(2)} levels against the ${near.toFixed(2)} a standing person sees across the whole near field (${ratio.toFixed(2)}); at that ratio the floor underfoot is not varied ground, it is the facets of the mesh`,
    );
  }
});
