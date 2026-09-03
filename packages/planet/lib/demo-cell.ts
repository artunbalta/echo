/**
 * The demo cell (contract, plan §4; resolution of B4).
 *
 * Chosen once by `scripts/find-demo-cell.ts` on the shipped seed and pinned here so every agent
 * builds the same ground. Reproduce the pin with:
 *
 *   MIN_OCEAN=0.08 node --import tsx packages/planet/scripts/find-demo-cell.ts echo-capacity-1
 *
 * (Without MIN_OCEAN the top disk is 8414dc5ffffffff, tundra 66% with 4% water; the filter keeps
 * only disks with a sea you can see from the shore.)
 *
 * What the script measured, stated at its own scope. It shortlists assignable res-4 cells whose
 * own land is at least half, whose coarse 14-point sample holds a beach and at least three land
 * kinds, and then samples each shortlisted disk on a 64x64 grid: 1,908 coastal disks. Among them:
 *
 *   - the most distinct land biomes any disk holds is FOUR (131 disks); the rest hold three;
 *   - relief inside a disk stays at or below 0.094 normalised height (about 85 m; most are
 *     under 0.03), so the highland biomes (bare-rock above 0.58, snow) never occur within one
 *     disk of a coast. "Highland" here can only mean the cold, barren band: tundra.
 *
 * So the plan's hoped-for "five biomes from a coast to a highland" does not exist on this planet
 * within one disk; the transect criterion is the biomes the cell actually contains, and the asset
 * registry is cut to what those biomes need (assets.ts). The composition below is the 64x64
 * measurement for this cell.
 */

import type { Biome } from "./terrain.js";

/** A cold coast: open water, a beach strip, a dry band, and tundra as the barren high ground. */
export const DEMO_CELL = "8414debffffffff";

/** The disk the demo builds: the cell and its six neighbours. */
export const DEMO_REGION_K = 1;

/** Measured composition of the disk, by area. */
export const DEMO_CELL_COMPOSITION: Readonly<Partial<Record<Biome, number>>> = {
  desert: 0.34,
  tundra: 0.3,
  ocean: 0.23,
  beach: 0.13,
  grassland: 0.003,
};

/** The land biomes the demo must dress: the acceptance for "no biome reads as empty". */
export const DEMO_LAND_BIOMES: readonly Biome[] = ["beach", "desert", "tundra"];

/** The walk the definition of done names: coast, desert, and the barren cold ground. */
export const DEMO_TRANSECT: readonly Biome[] = ["beach", "desert", "tundra"];

/** Distinct classes a 360° pan from spawn must show, sized to a ten-class registry. */
export const DEMO_PAN_CLASSES = 6;
