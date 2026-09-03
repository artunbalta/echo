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
import { circleBound, connected, regionBound, spawnInsideParcel, spawnPointFor, walkableAt } from "../lib/walkable.js";
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
