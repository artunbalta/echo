/**
 * The assignable cells whose centre is under water (plan F3, B2).
 *
 * Assignability is a fraction over 49 sample points, so a cell can be legally assigned while its
 * centre, where the old walkable scene stood the player, is sea. This writes the full list for the
 * shipped seed as a test fixture, so `walkable.test.ts` can prove `spawnPointFor` lands on dry
 * ground inside every one of them without re-measuring the planet on each run.
 *
 * Run:  node --import tsx packages/planet/scripts/find-submerged-centres.ts [seed]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cellToLatLng } from "h3-js";

import { latLngToVec3 } from "../lib/geo.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { chooseCommons } from "../lib/commons.js";
import { seedInventory } from "../lib/rounds.js";
import { calibratePlanet, createTerrain, normalisedHeight } from "../lib/terrain.js";

const seed = process.argv[2] ?? "echo-capacity-1";
const t0 = Date.now();
const field = createTerrain(seed);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const landFraction = landFractionSampler(field, calibration.seaLevel, 2);
const commons = chooseCommons(
  PLANET_PARAMS.commonsResolution ?? PLANET_PARAMS.startResolution,
  landFraction,
  PLANET_PARAMS.minLandFraction,
);
const inventory = seedInventory(PLANET_PARAMS.startResolution, commons.reserved);

let assignable = 0;
const submerged: string[] = [];
for (const cell of inventory) {
  if (landFraction(cell) < PLANET_PARAMS.minLandFraction) continue;
  assignable++;
  const [lat, lng] = cellToLatLng(cell);
  if (normalisedHeight(field.elevation(latLngToVec3(lat, lng)), calibration) <= 0) submerged.push(cell);
}
submerged.sort();

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../tests/fixtures", `submerged-centres.${seed}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      seed,
      resolution: PLANET_PARAMS.startResolution,
      seaLevel: calibration.seaLevel,
      peakElevation: calibration.peakElevation,
      assignable,
      submerged: submerged.length,
      cells: submerged,
    },
    null,
    0,
  ) + "\n",
);
console.log(
  `${seed}: ${assignable} assignable res-${PLANET_PARAMS.startResolution} cells, ${submerged.length} with a submerged centre ` +
    `(${((100 * submerged.length) / assignable).toFixed(2)}%) written to ${out} in ${Date.now() - t0} ms`,
);
