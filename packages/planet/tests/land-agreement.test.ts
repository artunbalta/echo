/**
 * One land predicate (plan §4: isLand). The registry decides assignability from 49 sample points
 * per cell; walkability decides where you can stand. If those two ever disagreed about a point, a
 * parcel could be assignable and unwalkable at the same time. They cannot, because both call
 * isLand, and this proves it point by point rather than trusting the import.
 *
 * Run:  node --import tsx --test packages/planet/tests/land-agreement.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, cellToLatLng, getResolution } from "h3-js";

import { latLngToVec3 } from "../lib/geo.js";
import { landFractionOfCell } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { createTangentPatch } from "../lib/scene.js";
import { sampleBiomeMask } from "../lib/biome-mask.js";
import { biome, calibratePlanet, createTerrain, isLand } from "../lib/terrain.js";
import { globeHeightAt } from "../lib/globe.js";
import { walkableAt } from "../lib/walkable.js";
import { loadGoldens, SEED, shippedCalibration } from "./helpers/shipped.js";

const field = createTerrain(SEED);
const calibration = shippedCalibration(SEED, () => calibratePlanet(field, PLANET_PARAMS.landFractionTarget));
const RADIUS = PLANET_PARAMS.radiusKm;

test("the registry's land fraction and walkability agree on every sample point of 400 parcels", () => {
  const inventory = seedInventory(PLANET_PARAMS.startResolution, PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution);
  let parcels = 0;
  let points = 0;
  for (let i = 0; i < inventory.length; i += 700) {
    const cell = inventory[i]!;
    const patch = createTangentPatch(cell, RADIUS);
    const children = cellToChildren(cell, getResolution(cell) + 2);
    let walkableCount = 0;
    for (const child of children) {
      const [lat, lng] = cellToLatLng(child);
      const direction = latLngToVec3(lat, lng);
      const local = patch.toLocal(direction);
      assert.ok(local, `${child} projected to the far hemisphere`);
      const viaRegistry = isLand(field, calibration.seaLevel, direction);
      const viaWalkable = walkableAt(patch, field, calibration.seaLevel, local[0], local[1]);
      assert.equal(viaWalkable, viaRegistry, `${cell}/${child}: registry says ${viaRegistry}, walkable says ${viaWalkable}`);
      if (viaWalkable) walkableCount++;
      points++;
    }
    assert.equal(landFractionOfCell(field, calibration.seaLevel, cell), walkableCount / children.length);
    parcels++;
  }
  assert.ok(parcels >= 400, `only ${parcels} parcels`);
  assert.equal(points, parcels * 49);
});

test("the biome mask's land bit is the same predicate", () => {
  const cell = seedInventory(PLANET_PARAMS.startResolution, PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution)[12345]!;
  const patch = createTangentPatch(cell, RADIUS);
  const mask = sampleBiomeMask(patch, field, calibration, 300, 10);
  for (let j = 0; j < mask.size; j += 3) {
    for (let i = 0; i < mask.size; i += 3) {
      const x = -mask.extentM + i * mask.stepM;
      const y = -mask.extentM + j * mask.stepM;
      assert.equal(mask.isLandAt(x, y), isLand(field, calibration.seaLevel, patch.toDirection(x, y)));
      assert.equal(mask.isLandAt(x, y), mask.biomeAt(x, y) !== "ocean");
    }
  }
});

test("the globe path decides water the same way: biome via globeHeightAt is ocean exactly where isLand is false", () => {
  const golden = loadGoldens(SEED);
  const directions = golden ? golden.sphere.map((g) => g.direction) : [];
  // Plus a band of points straddling the shoreline, where the two could disagree if they ever do.
  const cell = seedInventory(PLANET_PARAMS.startResolution, PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution)[777]!;
  const patch = createTangentPatch(cell, RADIUS);
  for (let i = 0; i < 2000; i++) directions.push(patch.toDirection(((i * 37) % 1400) - 700, ((i * 91) % 1400) - 700));
  let water = 0;
  for (const d of directions) {
    const viaGlobe = biome(globeHeightAt(field, calibration, d), field.moisture(d), field.temperature(d)) !== "ocean";
    assert.equal(viaGlobe, isLand(field, calibration.seaLevel, d));
    if (!viaGlobe) water++;
  }
  assert.ok(water > 0 && water < directions.length, "the sample should straddle the shoreline");
});
