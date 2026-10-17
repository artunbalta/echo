/**
 * The planet's villages, as an index the landing globe can draw (DECISIONS C41).
 *
 * WHY A FILE AND NOT A FUNCTION CALL. Whether a cell holds a settlement is a pure function of the
 * seed (L2), but asking it of all 284,004 cells is ~25 s of geography plus ~2 minutes of society —
 * a cost no page load can pay and no serverless instance should. So it is paid once, here, and the
 * answer is written beside the page that needs it. It is a CACHE of the prior and never a source of
 * truth (L1): `tests/villageIndex.test.ts` recomputes a sample from the seed and fails if this file
 * has drifted from it, which is what happens the day SETTLEMENT_RATE or the geography moves.
 *
 * WHAT COUNTS. A settled cell whose own land fraction is at least {@link MIN_LAND}: Lostrenreef,
 * beside the demo cell, is a settlement with land 0.00 — its habitability comes from the 3 km disk
 * around it — and a light in the open sea would be a village nobody can walk to.
 *
 *   npm run index:villages -w @echo/planet
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chooseCommons } from "../lib/commons.js";
import { geographySampler } from "../lib/geography.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { seedInventory } from "../lib/rounds.js";
import { settlementAt } from "../lib/society.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";
import { VILLAGE_LIGHT_MIN_LAND as MIN_LAND } from "../lib/village.js";

const SEED = process.env.PLANET_SEED ?? "echo-capacity-1";
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, `../../../apps/web/public/planet/villages-${SEED}.json`);

const t0 = Date.now();
const field = createTerrain(SEED);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
const commons = chooseCommons(PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution, landFraction, PLANET_PARAMS.minLandFraction);
const geography = geographySampler(field, calibration, PLANET_PARAMS.radiusKm, { commons: commons.cells });
const inventory = seedInventory(PLANET_PARAMS.startResolution, commons.reserved);

const cells: string[] = [];
const capacity: number[] = [];
let done = 0;
for (const cell of inventory) {
  // Day 0 is enough: whether a settlement EXISTS, and its capacity, do not depend on the day.
  const s = settlementAt(SEED, cell, geography(cell), 0);
  if (s !== null && landFraction(cell) >= MIN_LAND) {
    cells.push(cell);
    capacity.push(s.capacity);
  }
  if (++done % 20000 === 0) console.log(`${done.toLocaleString()} / ${inventory.length.toLocaleString()} cells, ${cells.length.toLocaleString()} villages, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ seed: SEED, minLand: MIN_LAND, cells, capacity }));
console.log(`${SEED}: ${cells.length.toLocaleString()} villages on land in ${inventory.length.toLocaleString()} cells, ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT}`);
