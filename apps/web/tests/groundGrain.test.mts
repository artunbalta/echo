/**
 * The metre-scale grain (task A28, DECISIONS C18), on the node side: everything about it that can
 * be checked without a GPU.
 *
 * WHAT THIS FILE CANNOT DO, said first so nobody reads more into it than is here. The grain is
 * drawn by a fragment patch and this file runs the TypeScript twin, `grainAt`. A twin that agreed
 * with nothing would pass every test below. What pins the twin to the shader is
 * tests/e2e/groundGrain.spec.ts, which renders the SHIPPED material under flat white light on a
 * plane whose pixel size it knows exactly and compares the pixels against this same twin. So the
 * two files are one guard in two halves, and neither is worth anything alone.
 *
 * Renderer-free: everything here is arithmetic over @echo/planet's own arrays and the module's own
 * exported constants.
 *
 * Run:  node --import tsx --test apps/web/tests/groundGrain.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BIOMES,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  DEMO_CELL,
  PARCEL_REGION_K,
  PLANET_PARAMS,
  buildRegionScene,
  createTerrain,
  linearRgb,
  type Biome,
  type Calibration,
} from "@echo/planet";

import { PALETTE } from "../src/game/three/palette";
import { paintRegionGround } from "../src/game/world/groundColour";
import {
  GRAIN_AXIS_BYTES,
  GRAIN_CLAMP,
  GRAIN_CUT_PX,
  GRAIN_FULL_PX,
  GRAIN_OCTAVES,
  GRAIN_PAIRS,
  GRAIN_SWING,
  GRAIN_UNIT_SD,
  GROUND_GRAIN_FRAGMENT,
  grainAt,
  grainAxis,
  grainedColour,
} from "../src/game/world/groundGrain";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8"),
) as { calibration: Calibration; demoCell: string; seed: string };
const SEED = golden.seed;
const CALIBRATION = golden.calibration;
const FIELD = createTerrain(SEED);
const PARCEL_CELL = "8482589ffffffff";

const build = (cell: string) =>
  buildRegionScene(cell, PARCEL_REGION_K, FIELD, CALIBRATION, PLANET_PARAMS.radiusKm, {
    resolution: DEFAULT_REGION_OPTIONS.resolution,
    heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM,
  });

const SHADOW = linearRgb([(PALETTE.shadow >> 16) & 0xff, (PALETTE.shadow >> 8) & 0xff, PALETTE.shadow & 0xff]);
const lumaLinear = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const stat = (v: number[]) => {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return { mean: m, sd: Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length) };
};

/** A pixel size small enough that every octave in the ladder is at full strength. */
const ALL_OCTAVES_MPP = Math.min(...GRAIN_OCTAVES.map((o) => o.lambdaM)) / GRAIN_FULL_PX / 4;

// ── the two materials each ground swings between ────────────────────────────────

test("A28: every ground the paint can label swings between two named palette materials", () => {
  const byHex = new Map<number, string>();
  for (const [name, hex] of Object.entries(PALETTE)) if (typeof hex === "number") byHex.set(hex, name);
  // The sea floor is the one biome with no pair, deliberately: nothing stands on it, it is under a
  // sheet at 0.86 opacity, and groundColour.ts leaves its colour exactly as the builder wrote it.
  const expected = BIOMES.filter((b) => b !== "ocean");
  for (const biome of expected) {
    const pair = GRAIN_PAIRS[biome];
    assert.ok(pair, `${biome} has no grain pair, so the ground a person stands on there has no metre-scale variation at all`);
    assert.notEqual(pair[0], pair[1], `${biome}'s pair is the same colour twice, so its axis is zero and the grain is off`);
    for (const hex of pair) {
      assert.ok(byHex.has(hex), `${biome} swings toward 0x${hex.toString(16)}, which is not a named entry in PALETTE`);
    }
  }
  assert.equal(GRAIN_PAIRS.ocean, undefined, "the sea floor was given a grain pair; it is under a sheet and nothing stands on it");
});

test("A28: the axis is a RELATIVE contrast, so it can never invert the ground or reach the ink", () => {
  // The swing multiplies (colour - ink) by axis * GRAIN_SWING * m, and m is clamped at GRAIN_CLAMP.
  // If the worst product reached 1 the floor would pass through PALETTE.shadow and out the far side,
  // which the art bible bans outright. This is the arithmetic that makes that impossible rather
  // than unlikely, and it is checked against the widest pair in the table rather than an average.
  let widest = 0;
  let widestBiome = "";
  for (const biome of BIOMES) {
    for (const c of grainAxis(biome)) {
      assert.ok(Number.isFinite(c), `${biome}'s axis has a ${c} in it`);
      assert.ok(Math.abs(c) < 1, `${biome}'s axis component is ${c}; a relative contrast of two positive albedos cannot reach 1`);
      if (Math.abs(c) > widest) {
        widest = Math.abs(c);
        widestBiome = biome;
      }
    }
  }
  const worst = widest * GRAIN_SWING * GRAIN_CLAMP;
  assert.ok(
    worst < 0.5,
    `the worst swing any fragment can take is ${worst.toFixed(3)} of (colour - ink), on ${widestBiome}; past 1 the floor would go through the ink and past 0.5 it is close enough to be one recipe change away`,
  );
  // And the sea floor's axis is exactly zero, which is how the attribute masks itself.
  assert.deepEqual([...grainAxis("ocean")], [0, 0, 0], "the sea floor has a non-zero grain axis");
});

// ── the signal ──────────────────────────────────────────────────────────────────

test("A28: the grain is zero-mean and unit-spread, AT THE ORIGIN as well as far from it", () => {
  // THE SECOND HALF OF THIS IS THE WHOLE TEST, and it exists because the first version of the hash
  // was wrong in exactly the place this world is looked at. Every multiply-and-xor mixer returns
  // zero for the cell (0, 0) unless a constant is added first, and the region's own frame puts the
  // camera at (0, 0): measured over the parcel's 6,045 real camera rays, the signal's mean came
  // back at -0.83 of a standard deviation while the same function over a 1.6 km patch gave -0.001,
  // and the whole near floor rendered 4.3% darker than the paint said it should be. A test that
  // sampled only far from the origin would have called that hash perfect.
  const far: number[] = [];
  for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) far.push(grainAt(-800 + i * 4, -800 + j * 4, ALL_OCTAVES_MPP));
  const f = stat(far);
  assert.ok(Math.abs(f.mean) < 0.05, `over 160,000 points on a 1.6 km patch the grain has a mean of ${f.mean.toFixed(4)} standard deviations, so it is darkening or lightening the ground on average`);
  assert.ok(f.sd > 0.9 && f.sd < 1.15, `the grain's spread is ${f.sd.toFixed(4)} where GRAIN_UNIT_SD (${GRAIN_UNIT_SD}) claims 1; the constant that turns the ladder into standard deviations is wrong`);

  // The ground inside one lattice cell of the anchor, which is where a person spawns and stands.
  const atOrigin: number[] = [];
  for (let i = 0; i < 240; i++) for (let j = 0; j < 240; j++) atOrigin.push(grainAt(-6 + i * 0.05, -6 + j * 0.05, ALL_OCTAVES_MPP));
  const o = stat(atOrigin);
  assert.ok(
    Math.abs(o.mean) < 0.35,
    `the 12 m of ground the camera sits over has a grain mean of ${o.mean.toFixed(4)} standard deviations against ${f.mean.toFixed(4)} far away: the hash is degenerate at the origin, which is the one place this world is always looked at`,
  );
  assert.ok(o.sd > 0.7, `and its spread there is only ${o.sd.toFixed(3)}`);
});

test("A28: the ladder is three scales far enough apart to be faded one at a time", () => {
  // WHAT THIS IS NOT. A test comparing the twin against its own GRAIN_OCTAVES cannot fail, because
  // the twin is built from them; the shape of an octave is pinned by tests/e2e/groundGrain.spec.ts,
  // which renders the shader and compares it against the twin, and by nothing in this file. What is
  // checked here is a RELATIONSHIP between four constants that the LOD scheme needs and that a
  // fourth octave squeezed into the ladder would quietly break: consecutive octaves must be far
  // enough apart that there is a pixel size at which one is at full strength and the next is dead,
  // or the fade is a fade of the whole ladder at once and the crossover with the vertex paint's
  // 36 m field stops being smooth.
  const ladder = [...GRAIN_OCTAVES].sort((a, b) => b.lambdaM - a.lambdaM);
  assert.ok(ladder.length >= 2, "the ladder has fewer than two octaves; there is nothing to bridge with");
  const mppFor = (k: number): number => {
    const hi = ladder[k - 1]!.lambdaM / GRAIN_FULL_PX;
    const next = k < ladder.length ? ladder[k]!.lambdaM : 0;
    const lo = next / GRAIN_CUT_PX;
    assert.ok(
      lo < hi,
      `the ${ladder[k - 1]!.lambdaM} m and ${next} m octaves cannot be separated by pixel size: at ${GRAIN_FULL_PX} pixels a period the first needs ${hi.toFixed(4)} m per pixel or less and the second is still alive down to ${lo.toFixed(4)}, so the ladder fades as one block`,
    );
    return Math.sqrt(Math.max(lo, 1e-6) * hi);
  };
  // And every octave in it actually carries something. Differencing the signal at two pixel sizes
  // isolates one octave's contribution, because the normaliser sums every weight whether the octave
  // is faded or not: an octave with zero weight, or one the fade never lets through, comes back flat.
  const cumulative: number[][] = ladder.map(() => []);
  for (let i = 0; i < 220; i++) {
    for (let j = 0; j < 220; j++) {
      const x = -330 + i * 3.1;
      const z = -330 + j * 2.9;
      for (let k = 1; k <= ladder.length; k++) cumulative[k - 1]!.push(grainAt(x, z, mppFor(k)));
    }
  }
  for (let k = 0; k < ladder.length; k++) {
    const own = k === 0 ? cumulative[0]! : cumulative[k]!.map((v, i) => v - cumulative[k - 1]![i]!);
    assert.ok(
      stat(own).sd > 0.1,
      `the ${ladder[k]!.lambdaM} m octave contributes a spread of ${stat(own).sd.toFixed(4)} standard deviations of its own; it is in the ladder and drawing nothing`,
    );
  }
});

test("A28: an octave is gone once the screen cannot resolve it", () => {
  // The fade is what stops the grain shimmering at the back of the frame, and it is a function of
  // the metres of ground one pixel covers rather than of a distance, so it holds on any viewport
  // and at any grazing angle. Both ends are checked: everything on up close, everything off far
  // away, and the far answer must be EXACTLY zero rather than small.
  const coarsest = Math.max(...GRAIN_OCTAVES.map((o) => o.lambdaM));
  const dead = coarsest / GRAIN_CUT_PX;
  const sample: number[] = [];
  for (let i = 0; i < 200; i++) for (let j = 0; j < 200; j++) sample.push(grainAt(i * 7.3, j * 5.1, dead * 1.001));
  assert.ok(sample.every((v) => v === 0), `the grain is still being drawn where one pixel covers ${(dead * 1.001).toFixed(2)} m of ground, which is under ${GRAIN_CUT_PX} pixels for even the coarsest octave`);
  // And it is not off everywhere: a floor with no grain at all would also pass the line above.
  const alive = stat(Array.from({ length: 40_000 }, (_, i) => grainAt((i % 200) * 0.37, Math.floor(i / 200) * 0.41, ALL_OCTAVES_MPP)));
  assert.ok(alive.sd > 0.8, `up close the grain's spread is ${alive.sd.toFixed(3)}, so it is faded out everywhere and draws nothing at all`);
  // The ladder in between is monotone: more metres per pixel is never more grain.
  let prev = Infinity;
  for (const mpp of [0.005, 0.02, 0.08, 0.3, 1.2, 4.8]) {
    const s = stat(Array.from({ length: 20_000 }, (_, i) => grainAt((i % 200) * 3.7, Math.floor(i / 200) * 4.1, mpp)));
    assert.ok(s.sd <= prev + 0.05, `the grain got LOUDER as the pixels got bigger, at ${mpp} m per pixel`);
    prev = s.sd;
  }
});

// ── what it does to the ground ──────────────────────────────────────────────────

test("A28: the grain multiplies the light the ground kept, so it respects the canopy closure", () => {
  // DECISIONS C17 blends the ground toward PALETTE.shadow by the sky it lost, so a floor under a
  // closed canopy is (albedo - ink) * T + ink. The grain is applied to (colour - ink), which means
  // it carries the same T. Adding a fixed colour instead would make the mottle GLOW under the trees,
  // brightening exactly the ground C17 spent a layer darkening; this is the assertion that says so.
  const albedo = [0.15, 0.09, 0.04] as const;
  const axis = grainAxis("rainforest");
  for (const T of [1, 0.46, 0.2]) {
    const shaded = [0, 1, 2].map((i) => SHADOW[i]! + (albedo[i]! - SHADOW[i]!) * T) as [number, number, number];
    const open = grainedColour(albedo, axis, 2);
    const under = grainedColour(shaded, axis, 2);
    const openSwing = lumaLinear(open) - lumaLinear(albedo);
    const underSwing = lumaLinear(under) - lumaLinear(shaded);
    const ratio = underSwing / openSwing;
    // (colour - ink) is exactly T times what it was, so the absolute swing must be too.
    assert.ok(
      Math.abs(ratio - T) < 1e-6,
      `under a canopy keeping ${(T * 100).toFixed(0)}% of its sky the grain still swings ${(ratio * 100).toFixed(1)}% as far as it does in the open; it is being added to the ground rather than multiplied into it, and it will glow under the trees`,
    );
  }
});

test("A28: no fragment of ground can be pushed past the ink a shadow is drawn in", () => {
  // Over the real painted vertices of both shipped routes, at the worst swing the clamp allows, in
  // both directions. The art bible bans black and PALETTE.shadow is the floor; C17 made the ink the
  // floor by construction and this says the grain did not undo that.
  const inkLuma = lumaLinear(SHADOW);
  let worst = Infinity;
  let checked = 0;
  for (const cell of [PARCEL_CELL, DEMO_CELL]) {
    const region = build(cell);
    const paint = paintRegionGround(region, SEED);
    for (let c = 0; c < region.chunks.length; c++) {
      const col = region.chunks[c]!.colours;
      const axisBytes = paint.grain[c]!;
      for (let o = 0; o < col.length; o += 3 * 97) {
        const axis = [axisBytes[o]! / 127, axisBytes[o + 1]! / 127, axisBytes[o + 2]! / 127] as const;
        if (axis[0] === 0 && axis[1] === 0 && axis[2] === 0) continue;
        const base = [col[o]!, col[o + 1]!, col[o + 2]!] as const;
        for (const m of [-GRAIN_CLAMP, GRAIN_CLAMP]) {
          const out = grainedColour(base, axis, m);
          for (const v of out) assert.ok(Number.isFinite(v) && v >= 0, `the grain produced ${v} on ${cell}`);
          worst = Math.min(worst, lumaLinear(out));
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 2000, `only ${checked} vertices were swung; this test is not looking at the routes`);
  assert.ok(
    worst > inkLuma,
    `the darkest ground a fragment can reach is ${worst.toExponential(3)} against the ink's ${inkLuma.toExponential(3)}: a floor painted below PALETTE.shadow is a hole, not a shadow`,
  );
  // Two-sided: it must be clear of the ink but not so far clear that the clamp is doing nothing.
  assert.ok(worst / inkLuma < 40, `the darkest reachable ground sits at ${(worst / inkLuma).toFixed(1)}x the ink, so nothing here is near the bound and this assertion is vacuous`);
});

// ── the attribute the paint writes ──────────────────────────────────────────────

test("A28: every drawn vertex carries its own biome's axis, and the sea floor carries none", () => {
  // The ordinary parcel is 100% rainforest and has no sea floor at all, so the untouched half of
  // this test is counted across both routes: the demo is 45% ocean and is where it comes from.
  let seabedSeen = 0;
  for (const cell of [PARCEL_CELL, DEMO_CELL]) {
    const region = build(cell);
    const before = region.chunks.map((c) => c.colours.slice());
    const paint = paintRegionGround(region, SEED);
    assert.equal(paint.grain.length, region.chunks.length, `${cell}: the grain axis is missing for some chunks`);
    let land = 0;
    let sea = 0;
    for (let c = 0; c < region.chunks.length; c++) {
      const chunk = region.chunks[c]!;
      const axis = paint.grain[c]!;
      assert.equal(axis.length, chunk.positions.length, `${cell} chunk ${c}: the axis array is not one triple per vertex`);
      for (let o = 0; o < chunk.positions.length; o += 3) {
        const moved = chunk.colours[o] !== before[c]![o] || chunk.colours[o + 1] !== before[c]![o + 1] || chunk.colours[o + 2] !== before[c]![o + 2];
        const zero = axis[o] === 0 && axis[o + 1] === 0 && axis[o + 2] === 0;
        if (moved) {
          land++;
          assert.equal(zero, false, `${cell}: a vertex the paint rewrote has a zero grain axis, so the ground it draws has no metre-scale variation`);
        } else {
          sea++;
          assert.equal(zero, true, `${cell}: a vertex the paint left alone carries a grain axis, so the sea floor is being mottled under its own sheet`);
        }
      }
    }
    assert.ok(land > 10_000, `${cell}: only ${land} painted vertices carried an axis`);
    seabedSeen += sea;
    // And the bytes are the table's, not something the paint made up.
    const rainforest = BIOMES.indexOf("rainforest");
    const fromTable = [GRAIN_AXIS_BYTES[rainforest * 3]!, GRAIN_AXIS_BYTES[rainforest * 3 + 1]!, GRAIN_AXIS_BYTES[rainforest * 3 + 2]!];
    assert.ok(fromTable.every((v) => v !== 0), "the rainforest axis rounded to zero in the Int8 attribute");
  }
  assert.ok(seabedSeen > 1000, `only ${seabedSeen} untouched vertices across both routes; the half of this test about the sea floor saw nothing`);
});

// ── the shader source, which the e2e guard renders ──────────────────────────────

test("A28: the shader carries the same numbers this file was measured with", () => {
  // Not a substitute for rendering it, which tests/e2e/groundGrain.spec.ts does. What this catches
  // is the ONE way the twin and the shader can drift without either of them being edited: a
  // constant changed here and interpolated into only one of the two. Every number the ladder is
  // made of has to appear in the generated source.
  for (const o of GRAIN_OCTAVES) {
    assert.ok(GROUND_GRAIN_FRAGMENT.includes(`${o.lambdaM}`), `the shader has no octave at ${o.lambdaM} m`);
  }
  assert.ok(GROUND_GRAIN_FRAGMENT.includes(`${GRAIN_UNIT_SD}`), "the shader does not normalise by GRAIN_UNIT_SD");
  assert.ok(GROUND_GRAIN_FRAGMENT.includes(`smoothstep( ${GRAIN_CUT_PX}.0, ${GRAIN_FULL_PX}.0`), "the shader's fade is not the one GRAIN_CUT_PX and GRAIN_FULL_PX describe");
  assert.ok(GROUND_GRAIN_FRAGMENT.includes(`clamp( m, -${GRAIN_CLAMP}.0, ${GRAIN_CLAMP}.0 )`), "the shader does not clamp at GRAIN_CLAMP");
  // Each octave is salted, and with a different salt, or the ladder is one field.
  const salts = [...GROUND_GRAIN_FRAGMENT.matchAll(/grainNoise\( p, [\d.]+, (\d+) \)/g)].map((m) => m[1]);
  assert.equal(salts.length, GRAIN_OCTAVES.length, `${salts.length} salted octaves in the shader against ${GRAIN_OCTAVES.length} in the ladder`);
  assert.equal(new Set(salts).size, salts.length, `two octaves share a salt (${salts.join(", ")}), so they are the same field`);
});
