/**
 * The biome mask (contract, plan §4).
 *
 * One question, asked by four callers: what is the ground like at this local coordinate? The scene
 * builder colours triangles by it, the asset placer gates every candidate on it, the debug view
 * tints the ground by it, and the inspector names it. Before this file each of those had its own
 * copy of the same three lines; the copies are gone and this is the one.
 *
 * Two forms. `biomeAtLocal` is exact and evaluates the terrain field. `sampleBiomeMask` is a grid
 * over an anchor patch that also carries height and the distance to the nearest water, which the
 * placement rules need ("coastal props within 40 m of water") and which is far too expensive to
 * search per candidate. The grid is a cache of the exact function: the same seed, patch and step
 * give the same grid on a server and in a browser, because nothing here draws a random number.
 */

import type { TangentPatch } from "./scene.js";
import {
  BIOMES,
  biome,
  isLand,
  normalisedHeight,
  type Biome,
  type Calibration,
  type TerrainField,
} from "./terrain.js";

/** The ten biomes a person can stand on. `ocean` is the eleventh member of BIOMES and is not land. */
export const LAND_BIOMES: readonly Biome[] = BIOMES.filter((b) => b !== "ocean");

/**
 * How thickly each biome plants itself, 0 to 1. Rock, ice, sand and water grow nothing.
 * Moved here from scene.ts so the placement rules and the scene builder read one table.
 */
export const VEGETATION_DENSITY: Record<Biome, number> = {
  ocean: 0,
  beach: 0.04,
  grassland: 0.35,
  forest: 0.85,
  rainforest: 1,
  savanna: 0.22,
  desert: 0.03,
  tundra: 0.08,
  taiga: 0.6,
  "bare-rock": 0,
  snow: 0,
};

/** The biome at a local coordinate on a patch. Exact: samples the field at the point itself. */
export function biomeAtLocal(
  patch: TangentPatch,
  field: TerrainField,
  calibration: Calibration,
  x: number,
  y: number,
): Biome {
  const direction = patch.toDirection(x, y);
  const height = normalisedHeight(field.elevation(direction), calibration);
  return biome(height, field.moisture(direction), field.temperature(direction));
}

export interface BiomeMask {
  readonly patch: TangentPatch;
  /** Half width of the sampled square, in local metres. */
  readonly extentM: number;
  /** Grid spacing in metres. */
  readonly stepM: number;
  /** Grid points per side. */
  readonly size: number;
  /** Index into BIOMES per grid point, row major, y outer. */
  readonly biomes: Uint8Array;
  /** Normalised height above sea level per grid point (negative is water). */
  readonly heights: Float32Array;
  /** Metres to the nearest water grid point; Infinity when the square holds no water. */
  readonly waterDistanceM: Float32Array;
  /** Nearest grid point lookups. Outside the square they clamp to the edge. */
  biomeAt(x: number, y: number): Biome;
  heightAt(x: number, y: number): number;
  waterDistanceAt(x: number, y: number): number;
  isLandAt(x: number, y: number): boolean;
  /**
   * The exact predicate at the point itself, one field evaluation. The grid answers "roughly
   * where"; anything that stands on the ground asks this before it is placed, because a shoreline
   * can run between two grid points and a shell in the sea is a fake (I2).
   */
  isLandExactAt(x: number, y: number): boolean;
  /** The grid index nearest a local coordinate. */
  index(x: number, y: number): number;
}

/**
 * Sample the mask over the square [-extentM, extentM]² at `stepM` spacing.
 *
 * Water distance is a two-pass chamfer transform over the grid (3-4 metric): between 0.9428 and
 * 1.0541 of the Euclidean distance (2√2/3 on the diagonal, √10/3 at slope 1/3), and O(n). It is
 * measured to the nearest WATER GRID POINT, so it is quantised to the step; callers asking "within
 * 40 m of water" should sample at 10 m or finer.
 */
export function sampleBiomeMask(
  patch: TangentPatch,
  field: TerrainField,
  calibration: Calibration,
  extentM: number,
  stepM: number,
): BiomeMask {
  if (!(extentM > 0) || !(stepM > 0)) throw new RangeError("extentM and stepM must be positive");
  const size = Math.floor((2 * extentM) / stepM) + 1;
  const n = size * size;
  const biomes = new Uint8Array(n);
  const heights = new Float32Array(n);
  const water = new Float32Array(n);
  const INF = Infinity;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const x = -extentM + i * stepM;
      const y = -extentM + j * stepM;
      const direction = patch.toDirection(x, y);
      const h = normalisedHeight(field.elevation(direction), calibration);
      const kind = biome(h, field.moisture(direction), field.temperature(direction));
      biomes[k] = BIOMES.indexOf(kind);
      heights[k] = h;
      // Land is decided by the one predicate, not by the biome label, so this agrees with the
      // registry to the point. (biome() says ocean iff h <= 0, which is the same test; the
      // predicate is used anyway so a future change to either cannot split them.)
      water[k] = isLand(field, calibration.seaLevel, direction) ? INF : 0;
    }
  }

  // Chamfer 3-4 distance transform, forward then backward pass, in units of stepM.
  const A = 3;
  const B = 4;
  const d = new Float32Array(n);
  for (let k = 0; k < n; k++) d[k] = water[k] === 0 ? 0 : INF;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      let best = d[k]!;
      if (i > 0) best = Math.min(best, d[k - 1]! + A);
      if (j > 0) {
        best = Math.min(best, d[k - size]! + A);
        if (i > 0) best = Math.min(best, d[k - size - 1]! + B);
        if (i < size - 1) best = Math.min(best, d[k - size + 1]! + B);
      }
      d[k] = best;
    }
  }
  for (let j = size - 1; j >= 0; j--) {
    for (let i = size - 1; i >= 0; i--) {
      const k = j * size + i;
      let best = d[k]!;
      if (i < size - 1) best = Math.min(best, d[k + 1]! + A);
      if (j < size - 1) {
        best = Math.min(best, d[k + size]! + A);
        if (i < size - 1) best = Math.min(best, d[k + size + 1]! + B);
        if (i > 0) best = Math.min(best, d[k + size - 1]! + B);
      }
      d[k] = best;
    }
  }
  for (let k = 0; k < n; k++) water[k] = d[k]! === INF ? INF : (d[k]! / A) * stepM;

  const clampIndex = (v: number) => (v < 0 ? 0 : v > size - 1 ? size - 1 : v);
  const index = (x: number, y: number): number => {
    const i = clampIndex(Math.round((x + extentM) / stepM));
    const j = clampIndex(Math.round((y + extentM) / stepM));
    return j * size + i;
  };

  return {
    patch,
    extentM,
    stepM,
    size,
    biomes,
    heights,
    waterDistanceM: water,
    index,
    biomeAt: (x, y) => BIOMES[biomes[index(x, y)]!]!,
    heightAt: (x, y) => heights[index(x, y)]!,
    waterDistanceAt: (x, y) => water[index(x, y)]!,
    isLandAt: (x, y) => water[index(x, y)]! > 0,
    isLandExactAt: (x, y) => isLand(field, calibration.seaLevel, patch.toDirection(x, y)),
  };
}
