/**
 * The demo cell (contract, plan §4; resolution of B4, re-scanned twice).
 *
 * THE FIRST SCAN RANKED BY THE WRONG THING. It chose the disk with the most distinct land biomes,
 * and four sparse biomes read emptier than two dense ones: the cell it picked put 377 objects
 * within 120 m of the spawn, one thing every 121 m2, which is the emptiness this rebuild exists to
 * fix.
 *
 * THE SECOND SCAN RANKED BY DENSITY AND FORGOT THE COAST. Ranking by instances alone chose deep
 * interior rainforest: 5,237 objects near the spawn and no shore within 640 m in any direction,
 * because the spawn sits at the cell centre and a cell whose land fraction is 1.0 has its coastline
 * a kilometre away. The brief asks for a real shoreline and the F5 gull beat needs one.
 *
 * THIS is the third: ranked by the instances `placeAssets` really puts within 120 m of the real
 * spawn, with the coastline required to cross the cell (land fraction between 0.45 and 0.85) and
 * water within 260 m of the spawn. Over 22,158 coastal candidates:
 *
 *   847b949ffffffff  5,995 near, 13.25 per 100 m2, 12 classes   rainforest 50%, ocean 45%, beach 5%  <- this
 *   847db45ffffffff  4,143 near,  9.16              12 classes   forest 50%, ocean 44%, beach 6%
 *   846c9adffffffff  4,063 near,  8.98              11 classes   rainforest 51%, ocean 43%, beach 6%
 *   84bb519ffffffff  3,913 near,  8.65              12 classes   ocean 44%, forest 29%, grassland 20%
 *   8414debffffffff    377 near,  0.83               7 classes   desert 34%, tundra 27%   (the first pick)
 *
 * Sixteen times the near-field density of the first pick, twelve classes in the near field instead
 * of seven, and a coast you can walk to. Reproduce with:
 *
 *   node --import tsx packages/planet/scripts/rank-demo-cells.ts echo-capacity-1 2000 5
 */

import type { Biome } from "./terrain.js";

/** A rainforest coast: canopy running down to a beach, with open water in view. */
export const DEMO_CELL = "847b949ffffffff";

/** The disk the demo builds: the cell and its six neighbours. */
export const DEMO_REGION_K = 1;

/** Measured composition of the disk, by area. */
export const DEMO_CELL_COMPOSITION: Readonly<Partial<Record<Biome, number>>> = {
  rainforest: 0.5,
  ocean: 0.45,
  beach: 0.05,
};

/** The land biomes the demo must dress: the acceptance for "no biome reads as empty". */
export const DEMO_LAND_BIOMES: readonly Biome[] = ["rainforest", "beach"];

/** The walk the definition of done names: coast, desert, and the barren cold ground. */
export const DEMO_TRANSECT: readonly Biome[] = ["beach", "rainforest"];

/** Distinct classes a 360° pan from spawn must show. */
export const DEMO_PAN_CLASSES = 6;

/**
 * The near field the demo is judged on: instances the placer puts within this radius of the spawn,
 * and the density that means. Measured, not hoped for; B1's perceptibility test is run against it.
 */
export const DEMO_NEAR_FIELD_M = 120;

/**
 * How the demo thins its scatter with distance (plan B4d).
 *
 * `densityPerKm2` in the registry is the NEAR FIELD density, what a rainforest floor really looks
 * like within sight. This is what keeps that affordable: full density out to `fullM`, decaying to
 * `farFactor` by `farM`, and nothing at all past `cutoffM`, which sits just beyond the fog because
 * what is never seen is never worth placing.
 *
 * Measured on this cell with these numbers: 5,995 instances within 120 m (13.25 per 100 m2, 12
 * classes), 43,108 over the whole disk against a ceiling of 120,000, 79 draw calls of 120, and
 * 252,538 triangles in view of 600,000 once each class uses its own LOD band.
 */
export const DEMO_FALLOFF = { fullM: 150, farM: 700, farFactor: 0.06, cutoffM: 500 } as const;

/** What the demo measured, so a test can catch a change rather than a reader noticing one. */
export const DEMO_MEASURED = {
  nearInstances: 5995,
  nearPer100M2: 13.25,
  nearClasses: 12,
  panInstances: 36656,
  panClasses: 15,
  diskInstances: 43108,
  drawCalls: 79,
  trianglesInView: 252538,
} as const;
