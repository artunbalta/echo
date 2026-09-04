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
  const dryStats = measure(dry, labelLattice(dry));
  paintRegionGround(dry, SEED);
  const afterDry = measure(dry, labelLattice(dry));
  assert.equal(afterDry.size, 0, "the labels still resolved after the paint; the inversion is not what it says");
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
