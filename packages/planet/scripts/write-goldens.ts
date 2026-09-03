/**
 * Golden values for the shipped planet (plan B2, I-4).
 *
 * The calibration and a fixed set of field samples, written once from node and then asserted by
 * `agreement.test.ts` on every run, and by the cross-engine e2e test in Chromium, WebKit and
 * Firefox. A seed, a tuning constant or a noise-library upgrade that changes the planet the users
 * own fails the test; an engine that rounds differently fails the e2e.
 *
 * Run:  node --import tsx packages/planet/scripts/write-goldens.ts [seed]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fibonacciSphere, calibratePlanet, createTerrain, normalisedHeight } from "../lib/terrain.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { createTangentPatch, sceneHeightAt } from "../lib/scene.js";
import { DEMO_CELL } from "../lib/demo-cell.js";
import { spawnPointFor } from "../lib/walkable.js";

const seed = process.argv[2] ?? "echo-capacity-1";
const field = createTerrain(seed);
const calibration = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);

// 64 directions spread over the sphere, plus 32 points inside the demo cell's patch, so the
// goldens cover both the globe path and the walkable path.
const sphere = fibonacciSphere(64).map((d) => ({
  direction: d,
  elevation: field.elevation(d),
  moisture: field.moisture(d),
  temperature: field.temperature(d),
  height: normalisedHeight(field.elevation(d), calibration),
}));

const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);
const local: Array<{ x: number; y: number; height: number }> = [];
for (let i = 0; i < 32; i++) {
  // A deterministic spiral over the patch; no randomness so the file is reproducible.
  const r = (i / 31) * patch.extentM * 2.5;
  const a = i * 2.399963;
  const x = r * Math.cos(a);
  const y = r * Math.sin(a);
  local.push({ x, y, height: sceneHeightAt(patch, field, calibration, x, y) });
}

const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm);

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../tests/fixtures", `goldens.${seed}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      seed,
      params: PLANET_PARAMS,
      calibration,
      demoCell: DEMO_CELL,
      demoSpawn: spawn,
      sphere,
      local,
    },
    null,
    1,
  ) + "\n",
);
console.log(`wrote ${out}: seaLevel ${calibration.seaLevel}, peak ${calibration.peakElevation}, spawn ${spawn?.childCell} depth ${spawn?.depth}`);
