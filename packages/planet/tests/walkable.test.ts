/**
 * Walkability and the spawn point (plan B2: folded into C0-1's acceptance).
 *
 * The exhaustive part is the point. 4,677 assignable parcels on the shipped seed have a submerged
 * centre; every one of them must spawn on dry ground INSIDE the parcel, found the same way every
 * time. The list is a fixture written by scripts/find-submerged-centres.ts so the test does not
 * re-measure the planet; the fixture carries the calibration it was measured under, and the test
 * proves that calibration is the goldens' before trusting the list.
 *
 * Run:  node --import tsx --test packages/planet/tests/walkable.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cellToCenterChild, getResolution } from "h3-js";

import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { createTangentPatch } from "../lib/scene.js";
import { calibratePlanet, createTerrain, isLand, type Calibration } from "../lib/terrain.js";
import { circleBound, connected, nearestWaterFrom, regionBound, spawnInsideParcel, spawnPointFor, walkableAt } from "../lib/walkable.js";
import { DEMO_CELL } from "../lib/demo-cell.js";
import { SEED, shippedCalibration } from "./helpers/shipped.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(here, "fixtures", `submerged-centres.${SEED}.json`), "utf8")) as {
  seed: string;
  resolution: number;
  seaLevel: number;
  peakElevation: number;
  assignable: number;
  submerged: number;
  cells: string[];
};
assert.equal(fixture.seed, SEED, "the fixture was measured on a different seed; rerun scripts/find-submerged-centres.ts");

const field = createTerrain(SEED);
const calibration: Calibration = shippedCalibration(SEED, () => calibratePlanet(field, PLANET_PARAMS.landFractionTarget));
const RADIUS = PLANET_PARAMS.radiusKm;

test("the fixture was measured under the shipped calibration, and is what the plan measured", () => {
  assert.ok(Math.abs(fixture.seaLevel - calibration.seaLevel) < 1e-9, `fixture sea level ${fixture.seaLevel} vs shipped ${calibration.seaLevel}`);
  assert.ok(Math.abs(fixture.peakElevation - calibration.peakElevation) < 1e-9);
  assert.equal(fixture.cells.length, fixture.submerged);
  const share = fixture.submerged / fixture.assignable;
  assert.ok(share > 0.02 && share < 0.04, `share was ${share}`);
});

test("every assignable parcel with a submerged centre spawns on dry ground inside the parcel, at depth 3", () => {
  const depths = new Map<number, number>();
  for (const cell of fixture.cells) {
    const spawn = spawnPointFor(cell, field, calibration, RADIUS);
    assert.ok(spawn, `${cell}: no dry descendant to depth 5`);
    assert.ok(isLand(field, calibration.seaLevel, spawn.direction), `${cell}: spawn ${spawn.childCell} is water`);
    assert.ok(spawnInsideParcel(spawn), `${cell}: spawn ${spawn.childCell} is not inside the parcel`);
    assert.equal(spawn.cell, cell);
    depths.set(spawn.depth, (depths.get(spawn.depth) ?? 0) + 1);
  }
  console.log(`spawn depths over ${fixture.cells.length} submerged-centre parcels:`, Object.fromEntries(depths));
  // Pinned to what the fixture measured: every one at depth 3. A deeper search for any parcel is
  // a change in the field or the ordering and must be looked at, not logged.
  assert.equal(depths.get(3), fixture.cells.length);
});

test("ordinary assignable parcels spawn inside and dry too, and a dry centre spawns at the centre", () => {
  const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
  const inventory = seedInventory(PLANET_PARAMS.startResolution, PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution);
  let checked = 0;
  let centred = 0;
  for (let i = 0; i < inventory.length; i += 431) {
    const cell = inventory[i]!;
    if (landFraction(cell) < PLANET_PARAMS.minLandFraction) continue;
    const spawn = spawnPointFor(cell, field, calibration, RADIUS);
    assert.ok(spawn, `${cell}: no spawn`);
    assert.ok(isLand(field, calibration.seaLevel, spawn.direction));
    assert.ok(spawnInsideParcel(spawn));
    if (spawn.childCell === cellToCenterChild(cell, getResolution(cell) + 3)) centred++;
    checked++;
  }
  assert.ok(checked > 300, `only ${checked} parcels checked`);
  // Most centres are dry, so most spawns are the centre child: the natural place to stand.
  assert.ok(centred / checked > 0.9, `only ${centred}/${checked} spawned at the centre child`);
});

test("spawnPointFor is a pure function of its inputs", () => {
  const cell = fixture.cells[17]!;
  const a = spawnPointFor(cell, field, calibration, RADIUS);
  const b = spawnPointFor(cell, field, calibration, RADIUS);
  assert.deepEqual(a, b);
});

test("the region bound is the hexagonal union: inside the cell, inside a neighbour, out past the ring", () => {
  const bound = regionBound(DEMO_CELL, 1, RADIUS);
  const anchor = createTangentPatch(DEMO_CELL, RADIUS);
  assert.ok(bound.contains(0, 0));
  // Along the x axis: the anchor cell, then a neighbour, then nothing. The neighbour's far edge is
  // about three cell inradii out; the circle radius the bound reports is larger than that.
  assert.ok(bound.contains(anchor.extentM * 0.9, 0));
  assert.ok(bound.contains(anchor.extentM * 2.0, 0), "the neighbour along +x should be inside");
  assert.ok(!bound.contains(bound.radiusM + 1, 0));
  assert.ok(!bound.contains(anchor.extentM * 3.2, 0), "past the ring");
  assert.ok(bound.radiusM > anchor.extentM * 2.5 && bound.radiusM < anchor.extentM * 3.2, `radius ${bound.radiusM} vs extent ${anchor.extentM}`);
  // The bound is what walkableAt refuses on, and only that: just inside is land or water as the
  // field says, just outside is never walkable.
  const cell = fixture.cells[3]!;
  const patch = createTangentPatch(cell, RADIUS);
  const spawn = spawnPointFor(cell, field, calibration, RADIUS)!;
  const r = Math.hypot(spawn.x, spawn.y);
  assert.ok(walkableAt(patch, field, calibration.seaLevel, spawn.x, spawn.y, circleBound(r + 1)));
  assert.ok(!walkableAt(patch, field, calibration.seaLevel, spawn.x, spawn.y, circleBound(r - 1)));
  // The centre of this parcel is water by construction of the fixture.
  assert.ok(!walkableAt(patch, field, calibration.seaLevel, 0, 0));
});

test("connected: a wall blocks, a gap in it connects, off-grid points are unreachable, endpoints snap to walkable nodes", () => {
  const opts = { stepM: 2, extentM: 60 };
  // A wall across the whole search square at x in (9, 12).
  const wall = (x: number) => !(x > 9 && x < 12);
  assert.ok(!connected(wall, [0, 0], [30, 0], opts), "the wall should block");
  assert.ok(connected(wall, [0, 0], [5, 5], opts), "the near side is one region");
  // The same wall with a gap at y in (40, 46): reachable only by walking round through the gap.
  const gapWall = (x: number, y: number) => !(x > 9 && x < 12 && !(y > 40 && y < 46));
  assert.ok(connected(gapWall, [0, 0], [30, 0], opts), "the gap should connect");
  assert.ok(!connected(wall, [0, 0], [100, 0], opts), "outside the search square");
  assert.ok(!connected(() => false, [0, 0], [1, 1], opts));
  // An endpoint 0.9 m from a grid node on a 2 m grid still counts if a node around it is walkable.
  assert.ok(connected(wall, [0.9, 0.9], [4.1, 3.1], opts));
  // But an endpoint whose four surrounding nodes are all water is not on the ground.
  const island = (x: number, y: number) => Math.hypot(x, y) < 1;
  assert.ok(!connected(island, [0, 0], [10, 10], opts));
});

/**
 * Which way the sea is (bug 2). The instrument the spawn's heading is built on.
 *
 * The expectation comes from a brute-force scan of the same square, which is a different algorithm
 * over the same predicate: every grid point in a box, nearest wet one wins. `nearestWaterFrom`
 * walks rings outward and stops at the first that is wet, so if the two agree the ring order is
 * finding the NEAREST water and not merely some water.
 */
test("nearestWaterFrom finds the nearest water, agrees with a brute-force scan, and says so twice", () => {
  const range = 420;
  const step = 8;
  let coastal = 0;
  let inland = 0;

  // Two coastal cells and one that is not: the demo, the beach cell beside it, and the ordinary
  // parcel the plan's routes open, whose nearest water is 6.9 km away.
  for (const cell of ["847b949ffffffff", "847b959ffffffff", "8482589ffffffff"]) {
    const patch = createTangentPatch(cell, RADIUS);
    const spawn = spawnPointFor(cell, field, calibration, RADIUS);
    assert.ok(spawn, `${cell} has no spawn`);
    const found = nearestWaterFrom(patch, field, calibration.seaLevel, spawn.x, spawn.y, { rangeM: range, stepM: step });

    // Brute force: every point of a square lattice inside the range, wettest-nearest wins.
    let bruteD = Infinity;
    for (let dy = -range; dy <= range; dy += 2) {
      for (let dx = -range; dx <= range; dx += 2) {
        const d = Math.hypot(dx, dy);
        if (d > range || d >= bruteD) continue;
        if (!isLand(field, calibration.seaLevel, patch.toDirection(spawn.x + dx, spawn.y + dy))) bruteD = d;
      }
    }

    if (!Number.isFinite(bruteD)) {
      assert.equal(found, null, `${cell}: the scan found no water in ${range} m and nearestWaterFrom found some`);
      inland++;
      continue;
    }
    assert.ok(found, `${cell}: the scan found water at ${bruteD.toFixed(1)} m and nearestWaterFrom found none`);
    coastal++;

    // Both are quantised, the scan to its 2 m lattice and the search to its own step, so they
    // agree to about a step and not to a metre. What is asserted is that neither found water the
    // other missed by more than that. WHAT THIS TOLERANCE CANNOT SEE, said out loud: which of two
    // wet headings ON THE SAME RING wins. They are the same radius, so the refined distances differ
    // by less than a step and this passes either way; taking the first index instead of the nearest
    // was tried and did not move a number here. What holds that is the deepEqual below, which fails
    // the moment the order stops being fixed.
    assert.ok(
      Math.abs(found.distanceM - bruteD) < step * 1.5,
      `${cell}: rings say ${found.distanceM.toFixed(1)} m and the scan says ${bruteD.toFixed(1)} m`,
    );

    // The point it returns is wet, and ONE METRE back along the same bearing is dry: it is the
    // WATERLINE and not merely a point in the sea.
    //
    // One metre, not four. At four this assertion could not see the bisection at all: deleting the
    // eight halvings outright left both tests in this file green, because the unrefined ring answer
    // comes back at 232.000 m against a true waterline at 225.100 on that bearing, and four metres
    // short of 232 is still water. The bisection resolves an 8 m step to 8/256 = 3 cm, so a metre
    // is thirty times its precision and seven times under the error it removes. Measured: refined
    // 225.031 m, unrefined 232.000 m.
    assert.ok(!isLand(field, calibration.seaLevel, patch.toDirection(found.x, found.y)), `${cell}: the answer is dry land`);
    const back = 1 - 1 / Math.max(1, found.distanceM);
    assert.ok(
      isLand(field, calibration.seaLevel, patch.toDirection(spawn.x + (found.x - spawn.x) * back, spawn.y + (found.y - spawn.y) * back)),
      `${cell}: one metre short of the waterline is already water, so the shore was not refined`,
    );

    const again = nearestWaterFrom(patch, field, calibration.seaLevel, spawn.x, spawn.y, { rangeM: range, stepM: step });
    assert.deepEqual(again, found, `${cell}: two identical searches gave two different shores`);
  }
  assert.equal(coastal, 2, "the coastal cells stopped being coastal, so this test proves nothing about water");
  assert.equal(inland, 1, "the inland cell found water, so the null case was never exercised");
});

test("nearestWaterFrom's range is a range: the ordinary parcel's sea is out past it, not absent", () => {
  const cell = "8482589ffffffff";
  const patch = createTangentPatch(cell, RADIUS);
  const spawn = spawnPointFor(cell, field, calibration, RADIUS)!;
  assert.equal(
    nearestWaterFrom(patch, field, calibration.seaLevel, spawn.x, spawn.y, { rangeM: 420, stepM: 8 }),
    null,
    "there is water within the fog on the parcel this test uses as its dry one",
  );
  // The negative control. The same point, the same function, a range that reaches: 6.9 km away
  // there is a sea, so the null above is the RANGE talking and not the search failing to look.
  const far = nearestWaterFrom(patch, field, calibration.seaLevel, spawn.x, spawn.y, { rangeM: 8000, stepM: 40 });
  assert.ok(far, "no water within 8 km of the ordinary parcel, so the null case above proves nothing");
  assert.ok(far.distanceM > 420, `the far search found water at ${far.distanceM.toFixed(0)} m, inside the range that found none`);
});
