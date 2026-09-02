/**
 * The twelve commons, and the cost of moving one (section 6.4).
 *
 * The relocation rule is the only place in the design where the terrain is allowed to argue with
 * the geometry, so it needs the tightest invariant in the package: whatever happens, no pentagon
 * ever ends up in the registry. Not because the rule says so, though it does, but because every
 * inventory count in lib/rounds.ts assumes a parcel has seven children and a pentagon has six.
 *
 * Run:  node --import tsx --test packages/planet/tests/commons.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getPentagons, getResolution, gridDisk, isPentagon } from "h3-js";

import { chooseCommons } from "../lib/commons.js";
import { cellCountAtResolution } from "../lib/geo.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";
import { checkTiling } from "../lib/tiling.js";

const RES = PLANET_PARAMS.commonsResolution ?? 1;
const MIN_LAND = PLANET_PARAMS.minLandFraction;

/** A stable value in 0..1 for a cell, so a synthetic land field is reproducible. */
function cellHash(cell: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < cell.length; i++) {
    h ^= cell.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

test("a dry planet moves nothing, and the reserved set is exactly the twelve pentagons", () => {
  const plan = chooseCommons(RES, () => 1, MIN_LAND);

  assert.equal(plan.choices.length, 12);
  assert.equal(plan.relocated, 0);
  assert.equal(plan.stranded, 0);
  assert.deepEqual([...plan.cells].sort(), [...getPentagons(RES)].sort());
  assert.deepEqual([...plan.reserved].sort(), [...getPentagons(RES)].sort());
  assert.ok(plan.cells.every((c) => isPentagon(c)));
});

test("a drowned pentagon moves to land, and the pentagon it left is still withheld", () => {
  // Every pentagon is under water; everything else is land. All twelve must move.
  const pentagons = new Set(getPentagons(RES));
  const plan = chooseCommons(RES, (cell) => (pentagons.has(cell) ? 0 : 1), MIN_LAND);

  assert.equal(plan.relocated, 12);
  assert.equal(plan.stranded, 0);
  assert.ok(plan.cells.every((c) => !isPentagon(c)), "a commons stayed on a pentagon");

  // Twelve commons on land, plus the twelve pentagons they vacated, all held out of the registry.
  assert.equal(plan.cells.length, 12);
  assert.equal(plan.reserved.length, 24);
  assert.equal(new Set(plan.reserved).size, 24);
  for (const pentagon of pentagons) assert.ok(plan.reserved.includes(pentagon), `${pentagon} was released`);

  // Each commons really is next to its own pentagon, within the rings the search was allowed.
  for (const choice of plan.choices) {
    assert.ok(gridDisk(choice.pentagon, choice.rings).includes(choice.cell));
    assert.ok(choice.rings >= 1 && choice.rings <= 2);
  }
});

test("no pentagon is ever in the registry, which is what makes seven children safe", () => {
  // This is the invariant the whole subdivision arithmetic rests on. It has to survive relocation.
  const fields: Array<[string, (cell: string) => number]> = [
    ["all land", () => 1],
    ["all ocean", () => 0],
    ["pentagons drowned", (c) => (isPentagon(c) ? 0 : 1)],
    ["patchy", (c) => (cellHash(c) < 0.4 ? 0 : 1)],
    ["marginal", (c) => (cellHash(c) < 0.5 ? 0.1 : 0.9)],
  ];

  for (const [name, landFraction] of fields) {
    const plan = chooseCommons(RES, landFraction, MIN_LAND);
    assert.equal(plan.cells.length, 12, `${name}: not twelve commons`);
    assert.equal(new Set(plan.cells).size, 12, `${name}: two commons on one cell`);

    for (const pentagon of getPentagons(RES)) {
      assert.ok(plan.reserved.includes(pentagon), `${name}: pentagon ${pentagon} reached the registry`);
    }

    // And the registry seeded against it really does contain no pentagon, at any resolution.
    for (const startRes of [RES, RES + 1, RES + 3]) {
      const inventory = seedInventory(startRes, plan.reserved);
      assert.ok(!inventory.some((c) => isPentagon(c)), `${name}: a pentagon is in the resolution ${startRes} seed`);
    }
  }
});

test("a planet with no land anywhere strands every commons rather than inventing one", () => {
  const plan = chooseCommons(RES, () => 0, MIN_LAND);
  assert.equal(plan.relocated, 0);
  assert.equal(plan.stranded, 12);
  // Twelve commons still exist. A wet commons is a worse answer than a dry one and a better answer
  // than eleven commons, so the count is never allowed to drop.
  assert.equal(plan.cells.length, 12);
  assert.deepEqual([...plan.reserved].sort(), [...getPentagons(RES)].sort());
});

test("the registry plus everything withheld still tiles the sphere exactly", () => {
  const field = createTerrain("echo-capacity-1");
  const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget, 60_000);
  const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
  const plan = chooseCommons(RES, landFraction, MIN_LAND);

  // On the shipped seed some commons move. Whichever way it falls, nothing may be lost or double
  // counted: the parcels plus the withheld cells have to be the whole planet and nothing more.
  assert.ok(plan.relocated >= 0 && plan.relocated <= 12);
  for (const startRes of [RES, PLANET_PARAMS.startResolution]) {
    const cover = [...seedInventory(startRes, plan.reserved), ...plan.reserved];
    const result = checkTiling(cover, PLANET_PARAMS.floorResolution);
    assert.equal(result.ok, true, `resolution ${startRes}: ${JSON.stringify(result)}`);
  }

  // Reserving at resolution 1 removes whole lineages, so the seed count is exact and predictable.
  const seeded = seedInventory(RES, plan.reserved);
  assert.equal(seeded.length, cellCountAtResolution(RES) - plan.reserved.length);
  assert.ok(seeded.every((c) => getResolution(c) === RES));
});
