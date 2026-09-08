/**
 * The placer obeys the registry, and the demo registry dresses the demo disk within the ceiling.
 *
 * Two kinds of test, because one is not enough. The rules are unit-tested with hand-built inputs,
 * so a rule the placer quietly dropped would fail even though the placer and the property test
 * would still agree with each other. Then the property test runs the real demo disk: every
 * instance stands on exact land, every exclusion removed something, every land biome received at
 * least three classes, the whole thing is a pure function of its inputs, and the ceiling holds.
 *
 * Run:  node --import tsx --test packages/planet/tests/assets.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  allowed,
  ColliderIndex,
  DEMO_ASSET_CLASSES,
  excluded,
  INSTANCE_CEILING,
  NO_EXCLUSIONS,
  placeAssets,
  spawnFalloff,
  type AssetClass,
  type Exclusions,
  type PlacedAsset,
} from "../lib/assets.js";
import { classesForBiomes } from "../lib/assets.js";
import { sampleBiomeMask, type BiomeMask } from "../lib/biome-mask.js";
import { DEMO_CELL, DEMO_LAND_BIOMES } from "../lib/demo-cell.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { PARCEL_REGION_K, SCATTER_FALLOFF } from "../lib/parcel.js";
import {
  createSceneHeight,
  createTangentPatch,
  sceneHeightAt,
  DEFAULT_DETAIL,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
} from "../lib/scene.js";
import { calibratePlanet, createTerrain, isLand, type Biome } from "../lib/terrain.js";
import { regionBound, spawnPointFor } from "../lib/walkable.js";
import { SEED, shippedCalibration } from "./helpers/shipped.js";

const field = createTerrain(SEED);
const calibration = shippedCalibration(SEED, () => calibratePlanet(field, PLANET_PARAMS.landFractionTarget));
const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);
const bound = regionBound(DEMO_CELL, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
// 10 m, as biome-mask.ts asks of any caller with a water band.
const mask = sampleBiomeMask(patch, field, calibration, bound.radiusM, 10);
const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;
// The falloff every parcel is dressed with. `densityPerKm2` is a NEAR FIELD density, so a test
// that placed without this would dress fifteen square kilometres of rainforest at woodland
// density, hit the ceiling, and prove nothing about the world anyone walks in.
const options = {
  heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM,
  bound,
  densityScale: spawnFalloff(spawn.x, spawn.y, SCATTER_FALLOFF.fullM, SCATTER_FALLOFF.farM, SCATTER_FALLOFF.farFactor, SCATTER_FALLOFF.cutoffM),
};
/** The densest class this cell actually has, so the test never names a class the cell lacks. */
const denseId = [...DEMO_ASSET_CLASSES].sort((a, b) => b.densityPerKm2 - a.densityPerKm2)[0]!.id;
/** A class with a collider, likewise chosen rather than named. */
const colliderId = DEMO_ASSET_CLASSES.find((c) => c.collider)!.id;
/** A clustered class. */
const clusteredId = DEMO_ASSET_CLASSES.find((c) => c.cluster)!.id;
const byId = new Map(DEMO_ASSET_CLASSES.map((c) => [c.id, c] as const));

// ── the rules, with hand-built inputs ───────────────────────────────────────────

const probe: AssetClass = {
  id: "probe",
  biomes: { desert: 0.5, beach: 0 },
  densityPerKm2: 100,
  altitude: { min: 0.01, max: 0.05 },
  waterDistanceM: { min: 30, max: 200 },
  excludes: ["water", "path", "footprint", "sightline"],
  lod: { nearM: 50, farM: 200 },
  collider: { radiusM: 1, heightM: 1 },
  scale: [1, 1],
  castsShadow: false,
};

test("allowed: biome weight, altitude band and water band each refuse on their own", () => {
  assert.ok(allowed(probe, "desert", 0.02, 100));
  assert.ok(!allowed(probe, "beach", 0.02, 100), "weight 0 must refuse");
  assert.ok(!allowed(probe, "tundra", 0.02, 100), "an absent biome must refuse");
  assert.ok(!allowed(probe, "desert", 0.005, 100), "below the altitude band");
  assert.ok(!allowed(probe, "desert", 0.06, 100), "above the altitude band");
  assert.ok(!allowed(probe, "desert", 0.02, 29.9), "too close to water");
  assert.ok(!allowed(probe, "desert", 0.02, 200.1), "too far from water");
  assert.ok(allowed(probe, "desert", 0.02, 30) && allowed(probe, "desert", 0.02, 200), "the band edges are inclusive");
  const inland: AssetClass = { ...probe, waterDistanceM: { min: 60, max: Infinity } };
  assert.ok(allowed(inland, "desert", 0.02, Infinity), "Infinity max means anywhere inland");
  assert.ok(!allowed(inland, "desert", 0.02, 59));
});

test("excluded: each exclusion kind fires for a class that lists it and not for one that does not", () => {
  // A synthetic mask: everything is land except x < 0.
  const fake = {
    ...mask,
    isLandAt: (x: number) => x >= 0,
    isLandExactAt: (x: number) => x >= 0,
  } as BiomeMask;
  const ex: Exclusions = {
    paths: [{ a: [0, 100], b: [100, 100], widthM: 10 }],
    footprints: [[[200, 200], [240, 200], [240, 240], [200, 240]]],
    sightlines: [{ a: [300, 0], b: [300, 100], widthM: 8 }],
  };
  const none: AssetClass = { ...probe, excludes: [] };
  assert.ok(excluded(probe, fake, ex, -5, 50), "water");
  assert.ok(!excluded(none, fake, ex, -5, 50));
  assert.ok(excluded(probe, fake, ex, 50, 104), "inside the path's half width");
  assert.ok(!excluded(probe, fake, ex, 50, 106), "outside the path's half width");
  assert.ok(!excluded(none, fake, ex, 50, 104));
  assert.ok(excluded(probe, fake, ex, 220, 220), "inside the footprint");
  assert.ok(!excluded(probe, fake, ex, 250, 220), "outside the footprint");
  assert.ok(!excluded(none, fake, ex, 220, 220));
  assert.ok(excluded(probe, fake, ex, 303, 50), "inside the sightline's half width");
  assert.ok(!excluded(probe, fake, ex, 305, 50));
});

// ── the demo disk ───────────────────────────────────────────────────────────────

/** Exclusions large enough to bite on a 4 km disk, all placed around the anchor centre. */
const exclusions: Exclusions = {
  paths: [{ a: [spawn.x - 300, spawn.y - 300], b: [spawn.x + 300, spawn.y + 300], widthM: 30 }],
  footprints: [
    [
      [spawn.x - 120, spawn.y - 120],
      [spawn.x + 120, spawn.y - 120],
      [spawn.x + 150, spawn.y],
      [spawn.x + 120, spawn.y + 120],
      [spawn.x - 120, spawn.y + 120],
      [spawn.x - 150, spawn.y],
    ],
  ],
  sightlines: [{ a: [spawn.x, spawn.y], b: [spawn.x + 400, spawn.y - 200], widthM: 40 }],
};

function place(ex: Exclusions, registry = DEMO_ASSET_CLASSES) {
  return placeAssets(mask, registry, SEED, ex, options);
}

test("every placed instance is allowed where it stands, inside the region, and on exact land", () => {
  const { placed, truncated, byClass } = place(exclusions);
  assert.ok(placed.length > 500, `only ${placed.length} instances on a 4 km disk`);
  assert.ok(!truncated, `the densities exceed the ceiling of ${INSTANCE_CEILING}`);
  let total = 0;
  for (const p of placed) {
    const cls = byId.get(p.classId)!;
    assert.ok(cls, p.classId);
    assert.ok(allowed(cls, p.biome, mask.heightAt(p.x, p.y), mask.waterDistanceAt(p.x, p.y)), `${p.classId} at (${p.x}, ${p.y}) in ${p.biome}`);
    assert.ok(!excluded(cls, mask, exclusions, p.x, p.y), `${p.classId} at (${p.x}, ${p.y}) is inside an exclusion`);
    assert.ok(bound.contains(p.x, p.y), "placed outside the region");
    if (cls.excludes.includes("water")) {
      // The exact predicate, not the grid: a shell in the sea is a fake.
      assert.ok(isLand(field, calibration.seaLevel, patch.toDirection(p.x, p.y)), `${p.classId} at (${p.x}, ${p.y}) stands in the water`);
    }
    assert.ok(p.z >= 0);
    assert.ok(p.scale >= cls.scale[0] && p.scale <= cls.scale[1]);
    total++;
  }
  assert.equal(Object.values(byClass).reduce((a, b) => a + b, 0), total);
  console.log(`demo disk: ${placed.length} instances`, byClass);
});

test("PlacedAsset.z is the macro height under the instance and NOT the ground the scene draws", () => {
  // THE CONTRACT, MEASURED. `z` is shared with the server, and its doc comment used to say "metres
  // above sea level", which a reader is entitled to hear as "the ground". It never quite was, and
  // since DECISIONS C2 it is not close: the scene adds a displacement on its own lattice that the
  // placer, which samples the macro field through a 10 m mask, has no way to see. The numbers below
  // are the ones written into PlacedAsset.z. If one of them moves, that comment is what has to move
  // with it, which is the whole reason this test states them rather than just bounding them.
  const registry = classesForBiomes(DEMO_LAND_BIOMES);
  const { placed } = placeAssets(mask, registry, SEED, NO_EXCLUSIONS, options);
  const drawn = createSceneHeight(patch, field, calibration, {
    heightScaleM: options.heightScaleM,
    resolution: DEFAULT_REGION_OPTIONS.resolution,
  });
  const macro = (x: number, y: number) => sceneHeightAt(patch, field, calibration, x, y) * options.heightScaleM;

  const stat = (v: number[]) => {
    const sorted = [...v].sort((a, b) => a - b);
    return { mean: v.reduce((a, b) => a + b, 0) / v.length, p95: sorted[Math.floor(sorted.length * 0.95)]!, max: sorted.at(-1)! };
  };
  const vsDrawn = stat(placed.map((p) => Math.abs(p.z - drawn(p.x, p.y))));
  const vsMacro = stat(placed.map((p) => Math.abs(p.z - macro(p.x, p.y))));

  assert.equal(placed.length, 43_108);
  // Against the MACRO field, z is only the mask's grid: nearest neighbour at 10 m across a slope.
  assert.ok(vsMacro.max > 0.5 && vsMacro.max < 1.0, `the grid term is now ${vsMacro.max} m, documented as 0.818`);
  assert.ok(vsMacro.mean > 0.12 && vsMacro.mean < 0.22, `the grid term's mean is now ${vsMacro.mean} m, documented as 0.163`);
  // Against the DRAWN ground, the displacement dominates it.
  assert.ok(vsDrawn.mean > 1.0 && vsDrawn.mean < 1.3, `the drawn gap's mean is now ${vsDrawn.mean} m, documented as 1.150`);
  assert.ok(vsDrawn.p95 < 2.6, `the drawn gap's p95 is now ${vsDrawn.p95} m, documented as 2.410`);
  assert.ok(vsDrawn.max > 3.5 && vsDrawn.max < 4.0, `the drawn gap's worst is now ${vsDrawn.max} m, documented as 3.799`);
  // A ceiling that holds by construction rather than by measurement: the displacement can move the
  // ground by at most its amplitude, and the grid can miss by at most the grid term.
  assert.ok(vsDrawn.max <= DEFAULT_DETAIL.amplitudeM + vsMacro.max, "the gap exceeds displacement plus grid, so something else has moved");

  // THE TEETH. It is not enough that the gap is nonzero; the point of the comment is that the gap
  // is dominated by something z cannot see. Measured 4.65x at the worst and 7.06x in the mean, so a
  // world that lost its relief, or a placer that started sampling the scene's own height, fails
  // here rather than quietly making the comment wrong.
  assert.ok(vsDrawn.max > 3 * vsMacro.max, `the drawn gap is only ${(vsDrawn.max / vsMacro.max).toFixed(2)}x the grid term`);
  assert.ok(vsDrawn.mean > 4 * vsMacro.mean, `the drawn gap's mean is only ${(vsDrawn.mean / vsMacro.mean).toFixed(2)}x the grid term`);

  // And what it would cost to believe the old comment: apps/web seats every instance through
  // frame.toScene and apps/web/tests/scatter.test.mts holds that to 0.15 m off the uploaded
  // triangles. Seated on z instead, 94.7% of this cell would miss that tolerance.
  const seatable = placed.filter((p) => Math.abs(p.z - drawn(p.x, p.y)) <= 0.15).length;
  assert.ok(seatable / placed.length < 0.1, `${((seatable / placed.length) * 100).toFixed(1)}% of instances would seat correctly on z, so z has become the ground`);
  console.log(
    `z against the drawn ground: mean ${vsDrawn.mean.toFixed(3)} m, p95 ${vsDrawn.p95.toFixed(3)} m, worst ${vsDrawn.max.toFixed(3)} m ` +
    `over ${placed.length} instances; the mask grid alone is ${vsMacro.mean.toFixed(3)} m and ${vsMacro.max.toFixed(3)} m`,
  );
});

test("the exclusions removed something, and only from the classes that list them", () => {
  const withEx = place(exclusions).placed;
  const without = place(NO_EXCLUSIONS).placed;
  assert.ok(withEx.length < without.length, `exclusions removed nothing (${withEx.length} vs ${without.length})`);
  const inZone = (p: PlacedAsset) => excluded(byId.get(p.classId)!, mask, exclusions, p.x, p.y);
  const removed = without.filter(inZone);
  assert.ok(removed.length > 50, `the zones should catch many instances of the unexcluded layout; caught ${removed.length}`);
  assert.equal(withEx.filter(inZone).length, 0);
  // A class that lists no footprint exclusion keeps its instances inside the footprint.
  const openCls = DEMO_ASSET_CLASSES.find((c) => !c.excludes.includes("footprint"));
  if (openCls) {
    const open = withEx.filter((p) => p.classId === openCls.id);
    const openInside = open.filter((p) => excluded({ ...openCls, excludes: ["footprint"] }, mask, exclusions, p.x, p.y));
    assert.ok(openInside.length > 0, `${openCls.id} lists no footprint exclusion, so some should stand inside it`);
  }
});

test("a water band provably removes candidates", () => {
  const base = byId.get(denseId)!;
  const banded: AssetClass = { ...base, id: "banded", waterDistanceM: { min: 300, max: Infinity } };
  const free: AssetClass = { ...base, id: "free", waterDistanceM: undefined };
  const a = place(NO_EXCLUSIONS, [banded]).placed;
  const b = place(NO_EXCLUSIONS, [free]).placed;
  assert.ok(a.length < b.length, `the band removed nothing (${a.length} vs ${b.length})`);
  for (const p of a) assert.ok(mask.waterDistanceAt(p.x, p.y) >= 300);
});

test("the layout is a pure function of mask, registry, seed and exclusions", () => {
  const a = place(exclusions);
  const b = place(exclusions);
  assert.deepEqual(a, b);
  const other = placeAssets(mask, DEMO_ASSET_CLASSES, SEED + "-2", exclusions, options);
  assert.notDeepEqual(a.placed.slice(0, 20), other.placed.slice(0, 20));
});

test("lod moves no instance: two farM tables three kilometres apart, one placement, bit for bit", () => {
  // DECISIONS C22's first constraint, and the one that decides whether it is a renderer change or a
  // world change. `lod` says which of two geometries is DRAWN; it must never reach the placer. If
  // it did, moving farM would relay the scatter under people's feet and the change would need a
  // terrainVersion rather than ASSET_REGISTRY_VERSION.
  const near = DEMO_ASSET_CLASSES.map((c) => ({ ...c, lod: { nearM: 1, farM: 2 } }));
  const far = DEMO_ASSET_CLASSES.map((c) => ({ ...c, lod: { nearM: 2999, farM: 3000 } }));
  const a = placeAssets(mask, near, SEED, exclusions, options);
  const b = placeAssets(mask, far, SEED, exclusions, options);
  assert.equal(a.placed.length, b.placed.length, `${a.placed.length} instances against ${b.placed.length}: lod moved the placement`);
  assert.deepEqual(a.byClass, b.byClass, "lod changed how many instances a class received");
  // Field by field rather than deepEqual on the whole array, so a failure names the instance and
  // the field instead of printing forty thousand objects.
  for (let i = 0; i < a.placed.length; i++) {
    const x = a.placed[i]!;
    const y = b.placed[i]!;
    for (const key of ["classId", "x", "y", "z", "biome", "scale", "rotation", "cluster"] as const) {
      assert.equal(
        x[key],
        y[key],
        `instance ${i} of ${a.placed.length}: ${key} is ${String(x[key])} with farM 2 m and ${String(y[key])} with ` +
          `farM 3,000 m. The placer has started reading lod, so a level-of-detail edit is now a world edit.`,
      );
    }
  }
  // The control: the two tables really are different objects, or this compares a thing with itself.
  assert.notDeepEqual(near[0]!.lod, far[0]!.lod);
  console.log(`  ${a.placed.length} instances placed identically under farM 2 m and farM 3,000 m`);
});

test("every land biome of the demo disk receives at least three classes", () => {
  const { placed } = place(exclusions);
  const classesByBiome = new Map<Biome, Set<string>>();
  for (const p of placed) {
    const set = classesByBiome.get(p.biome) ?? new Set<string>();
    set.add(p.classId);
    classesByBiome.set(p.biome, set);
  }
  for (const b of DEMO_LAND_BIOMES) {
    const classes = classesByBiome.get(b) ?? new Set();
    assert.ok(classes.size >= 3, `${b} has only ${[...classes].join(", ") || "nothing"}`);
  }
  console.log("classes per biome:", Object.fromEntries([...classesByBiome].map(([b, s]) => [b, [...s].sort()])));
});

test("cluster members carry the cluster index and centres do not", () => {
  const cls = byId.get(clusteredId)!;
  const { placed } = place(NO_EXCLUSIONS, [cls]);
  const members = placed.filter((p) => p.cluster !== undefined);
  const centres = placed.filter((p) => p.cluster === undefined);
  assert.ok(members.length > 0 && centres.length > 0, `${clusteredId}: ${members.length} members, ${centres.length} centres`);
  assert.ok(members.length <= centres.length * cls.cluster!.count);
});

test("the ceiling stops placement and says so", () => {
  const { placed, truncated } = placeAssets(mask, DEMO_ASSET_CLASSES, SEED, exclusions, { ...options, maxInstances: 300 });
  assert.equal(placed.length, 300);
  assert.ok(truncated);
});

test("the collider index finds what stands near a point, along a segment, and across a cell boundary", () => {
  const { placed } = place(exclusions);
  const index = new ColliderIndex(placed, DEMO_ASSET_CLASSES, 8);
  const withCollider = placed.filter((p) => byId.get(p.classId)!.collider);
  assert.equal(index.count, withCollider.length);
  const boulder = withCollider.find((p) => p.classId === colliderId)!;
  assert.ok(boulder, `no ${colliderId} placed`);
  assert.ok(index.queryCircle(boulder.x, boulder.y, 0.5).some((c) => c.x === boulder.x && c.y === boulder.y));
  assert.ok(!index.queryCircle(boulder.x + 500, boulder.y + 500, 0.1).some((c) => c.x === boulder.x && c.y === boulder.y));
  assert.ok(index.querySegment([boulder.x - 30, boulder.y], [boulder.x + 30, boulder.y], 0.5).some((c) => c.x === boulder.x && c.y === boulder.y));

  // A big collider just inside a cell, queried from just across the cell boundary: the disc
  // overlaps the query although the centres sit in different cells.
  const bigCls = [...DEMO_ASSET_CLASSES].filter((c) => c.collider).sort((a, b) => b.collider!.radiusM * b.scale[1] - a.collider!.radiusM * a.scale[1])[0]!;
  const big: PlacedAsset = { classId: bigCls.id, x: 7.9, y: 0, z: 0, biome: DEMO_LAND_BIOMES[0]!, scale: bigCls.scale[1], rotation: 0 };
  const small = new ColliderIndex([big], DEMO_ASSET_CLASSES, 8);
  assert.ok(small.maxRadiusM > 1, `largest collider radius is ${small.maxRadiusM}`);
  assert.equal(small.queryCircle(8.5, 0, 0.2).length, 1, "a query across the cell boundary must still see the disc");
  assert.equal(small.querySegment([8.5, 0], [20, 0], 0.2).length, 1);
  assert.equal(small.queryCircle(8.5 + small.maxRadiusM + 1, 0, 0.2).length, 0);
});
