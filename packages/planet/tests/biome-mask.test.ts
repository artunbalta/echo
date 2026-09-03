/**
 * The biome mask is a cache of the exact function, and its water distance is a real distance.
 *
 * Run:  node --import tsx --test packages/planet/tests/biome-mask.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { biomeAtLocal, LAND_BIOMES, sampleBiomeMask, VEGETATION_DENSITY } from "../lib/biome-mask.js";
import { DEMO_CELL } from "../lib/demo-cell.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { createTangentPatch, sceneHeightAt, type TangentPatch } from "../lib/scene.js";
import { BIOMES, calibratePlanet, createTerrain, isLand } from "../lib/terrain.js";
import { SEED, shippedCalibration } from "./helpers/shipped.js";

const field = createTerrain(SEED);
const calibration = shippedCalibration(SEED, () => calibratePlanet(field, PLANET_PARAMS.landFractionTarget));
const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);

test("every grid point of the mask equals the exact function", () => {
  const mask = sampleBiomeMask(patch, field, calibration, 400, 10);
  assert.equal(mask.size, 81);
  for (let j = 0; j < mask.size; j++) {
    for (let i = 0; i < mask.size; i++) {
      const x = -400 + i * 10;
      const y = -400 + j * 10;
      const k = j * mask.size + i;
      assert.equal(BIOMES[mask.biomes[k]!], biomeAtLocal(patch, field, calibration, x, y));
      assert.ok(Math.abs(mask.heights[k]! - sceneHeightAt(patch, field, calibration, x, y)) < 1e-6);
      assert.equal(mask.index(x, y), k);
    }
  }
});

test("water distance is zero on water, positive on land, and within chamfer error of the true distance", () => {
  // The demo disk has open water, so the mask around the cell centre sees both.
  const extent = patch.extentM * 3;
  const step = 25;
  const mask = sampleBiomeMask(patch, field, calibration, extent, step);
  const waterPoints: Array<[number, number]> = [];
  for (let j = 0; j < mask.size; j++) {
    for (let i = 0; i < mask.size; i++) {
      const k = j * mask.size + i;
      const x = -extent + i * step;
      const y = -extent + j * step;
      if (mask.waterDistanceM[k] === 0) {
        assert.ok(!mask.isLandAt(x, y));
        waterPoints.push([x, y]);
      } else {
        assert.ok(mask.isLandAt(x, y));
        assert.ok(mask.waterDistanceM[k]! > 0);
      }
    }
  }
  assert.ok(waterPoints.length > 100, `the demo disk should hold water; found ${waterPoints.length} water points`);

  // Brute-force truth for a sample of land points. The 3-4 chamfer's ratio to Euclidean is
  // (3 + t) / (3 sqrt(1 + t^2)) for a slope t in [0, 1]: at least 2 sqrt 2 / 3 (the diagonal) and
  // at most sqrt 10 / 3 (slope 1/3). Anything outside that band is not this chamfer.
  let checked = 0;
  for (let j = 0; j < mask.size; j += 7) {
    for (let i = 0; i < mask.size; i += 7) {
      const k = j * mask.size + i;
      if (mask.waterDistanceM[k] === 0) continue;
      const x = -extent + i * step;
      const y = -extent + j * step;
      let truth = Infinity;
      for (const [wx, wy] of waterPoints) truth = Math.min(truth, Math.hypot(wx - x, wy - y));
      const got = mask.waterDistanceM[k]!;
      const lo = (2 * Math.SQRT2) / 3 - 1e-6;
      const hi = Math.sqrt(10) / 3 + 1e-6;
      assert.ok(got >= truth * lo && got <= truth * hi, `at (${x}, ${y}) chamfer ${got} vs true ${truth}`);
      checked++;
    }
  }
  assert.ok(checked > 20);
});

test("a square with no water has infinite water distance everywhere", () => {
  const dry: TangentPatch = { ...patch, toDirection: () => patch.toDirection(0, 0) };
  // The demo cell's centre is land (chosen so); a patch that answers that direction for every
  // coordinate is all land.
  const mask = sampleBiomeMask(dry, field, calibration, 50, 10);
  for (let k = 0; k < mask.size * mask.size; k++) assert.equal(mask.waterDistanceM[k], Infinity);
  assert.ok(mask.isLandAt(0, 0));
});

test("isLandExactAt is the predicate at the point, and can disagree with the grid between two points", () => {
  const mask = sampleBiomeMask(patch, field, calibration, patch.extentM * 3, 20);
  let disagreements = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 53) % 4000) - 2000 + 7.3;
    const y = ((i * 97) % 4000) - 2000 + 3.1;
    assert.equal(mask.isLandExactAt(x, y), isLand(field, calibration.seaLevel, patch.toDirection(x, y)));
    if (mask.isLandExactAt(x, y) !== mask.isLandAt(x, y)) disagreements++;
  }
  assert.ok(disagreements > 0, "on a coast, the grid and the point should disagree somewhere between grid points");
});

test("the vegetation table moved intact and the land biome list is the ten kinds", () => {
  assert.equal(Object.keys(VEGETATION_DENSITY).length, 11);
  assert.equal(VEGETATION_DENSITY.rainforest, 1);
  assert.equal(VEGETATION_DENSITY.ocean, 0);
  assert.equal(LAND_BIOMES.length, 10);
  assert.ok(!LAND_BIOMES.includes("ocean"));
});
