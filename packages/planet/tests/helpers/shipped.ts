/**
 * The shipped planet, as the tests see it: one seed, one calibration, read from the goldens
 * fixture so every test that claims something about "the planet people stand on" is about the
 * same sea level lib/planet.ts serves (200k-sample calibration), not a 60k neighbour of it.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Vec3 } from "../../lib/geo.js";
import type { Calibration } from "../../lib/terrain.js";
import type { SpawnPoint } from "../../lib/walkable.js";

export const SHIPPED_SEED = "echo-capacity-1";
export const SEED = process.env.PLANET_SEED ?? SHIPPED_SEED;

export interface Goldens {
  seed: string;
  calibration: Calibration;
  demoCell: string;
  demoSpawn: SpawnPoint | null;
  sphere: Array<{ direction: Vec3; elevation: number; moisture: number; temperature: number; height: number }>;
  local: Array<{ x: number; y: number; height: number }>;
}

const here = dirname(fileURLToPath(import.meta.url));

export function goldensPath(seed = SEED): string {
  return resolve(here, "..", "fixtures", `goldens.${seed}.json`);
}

/** The goldens, or null only for a seed that is not the shipped one and has none. */
export function loadGoldens(seed = SEED): Goldens | null {
  const path = goldensPath(seed);
  if (!existsSync(path)) {
    if (seed === SHIPPED_SEED) throw new Error(`the shipped planet has no goldens at ${path}; run scripts/write-goldens.ts`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as Goldens;
}

/** The calibration the app serves. Falls back to a full calibration for a non-shipped seed. */
export function shippedCalibration(seed = SEED, calibrate: () => Calibration): Calibration {
  const g = loadGoldens(seed);
  return g ? g.calibration : calibrate();
}
