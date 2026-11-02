/**
 * The landing globe's village lights are a CACHE of the seed, never a source of truth (L1, C41).
 *
 * `apps/web/public/planet/villages-<seed>.json` is written by `npm run index:villages`, because asking
 * every one of 284,004 cells whether it holds a settlement is minutes of work no page can pay. This
 * test recomputes a uniform, hash-ordered sample of the real inventory from the seed and fails if the
 * file disagrees with it — which is exactly what happens the day SETTLEMENT_RATE or the geography
 * moves and nobody regenerates it. A light where no village stands, or a village with no light, is a
 * lie told on the landing page.
 *
 * Run:  node --import tsx --test packages/planet/tests/villageIndex.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chooseCommons } from "../lib/commons.js";
import { geographySampler } from "../lib/geography.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { settlementAt } from "../lib/society.js";
import { calibratePlanet, createTerrain, hashString } from "../lib/terrain.js";
import { VILLAGE_LIGHT_MIN_LAND } from "../lib/village.js";

const SEED = "echo-capacity-1";
const here = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(here, `../../../apps/web/public/planet/villages-${SEED}.json`);

test("the globe's village index agrees with the seed, cell for cell, on a uniform sample", () => {
  const index = JSON.parse(readFileSync(FILE, "utf8")) as { seed: string; minLand: number; cells: string[]; capacity: number[] };
  assert.equal(index.seed, SEED);
  assert.equal(index.minLand, VILLAGE_LIGHT_MIN_LAND, "the index was written against another land threshold; regenerate it");
  assert.equal(index.cells.length, index.capacity.length);
  const capacityOf = new Map(index.cells.map((c, i) => [c, index.capacity[i]]));

  const field = createTerrain(SEED);
  const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
  const land = landFractionSampler(field, calibration.seaLevel, 2);
  const commons = chooseCommons(PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution, land, PLANET_PARAMS.minLandFraction);
  const geography = geographySampler(field, calibration, PLANET_PARAMS.radiusKm, { commons: commons.cells });
  const sample = [...seedInventory(PLANET_PARAMS.startResolution, commons.reserved)]
    .map((c) => [hashString(`villageIndex/${c}`), c] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, 1500)
    .map(([, c]) => c);

  let villages = 0;
  for (const cell of sample) {
    const s = settlementAt(SEED, cell, geography(cell), 0);
    const lit = s !== null && land(cell) >= VILLAGE_LIGHT_MIN_LAND;
    assert.equal(capacityOf.has(cell), lit, `${cell}: ${lit ? "a village with no light" : "a light with no village"} — run npm run index:villages -w @echo/planet`);
    if (lit) {
      assert.equal(capacityOf.get(cell), s!.capacity, `${cell}: the index has its capacity wrong`);
      villages++;
    }
  }
  assert.ok(villages > 40, `only ${villages} villages in the sample — too few to be evidence`);
});
