/**
 * SOC-6.B: the six numbers `SettlementGeography` takes, derived from what the planet already knows.
 *
 * THIS FILE EXISTS BECAUSE society.ts MAY NOT. `society.ts`'s header promises no h3-js, and deriving
 * a cell's geography needs a tangent frame, which needs h3-js. `land.ts` made the same split for the
 * same reason and this is its sibling.
 *
 * SAMPLED OVER A METRIC RADIUS, NOT OVER THE CELL — and that is the finding, not a preference.
 * Measured: a cell's own 49-point descendant grid returns a SINGLE biome for 82.3% of res-4 cells,
 * 91.5% at res 5, 95.7% at res 6 and 98.3% at res 7, and its land fraction is exactly 0 or 1 for
 * 94.9 / 97.9 / 98.8 / 99.5% of them. That is not a sampling bug; the height field's finest
 * expressible feature is about 1.56 km and a res-4 cell is 1,294 m across. **The cell supplies a
 * POSITION and a FRAME; the geography is a property of the ground around it.** A 3 km, 91-point disk
 * brings uniform-biome down to 45–46% and mean distinct biomes to 1.87, and returns the identical
 * answer at every resolution: |res 4 − res 7| at one lat/lng over 400 cells is 0.0000 at the max.
 * So a parcel and its children agree about where they are, which L2 requires and a per-cell grid
 * could not have delivered.
 *
 * COST, MEASURED: 0.0884–0.0894 ms per cell at every resolution 4..7; a whole k=1 parcel disk is
 * 0.63 ms, which is 190× cheaper than one 60 Hz frame. SOC-6.B's cost warning cites `lib/planet.ts`'s
 * 284,004-cell scan; **that scan is the REGISTRY's**, it is 9.78 s, and nothing here needs it. A
 * whole-planet geography pass would be 25.3 s and nothing in the design asks for one (L1). For
 * scale: `settlementAt` + `census` on the SAME cell is 3.5–4.4 ms — 40–50× this. Geography was never
 * the expensive half.
 *
 * NOTHING HERE IS RANDOM AND NOTHING HERE CACHES A DECISION. Same cell, same field, same
 * calibration, same six numbers, forever (L2). {@link geographySampler} memoises, and a memo cannot
 * change an answer — `land.ts`'s idiom exactly.
 *
 * WHAT IS HONEST AND WHAT IS A PROXY, stated here so no caller inherits a false precision:
 *   `coastal`      HONEST.   `isLandHeight`, the one predicate the registry, walkability, the biome
 *                            table and the globe all share.
 *   `wooded`       HONEST.   `VEGETATION_DENSITY`, the table the scene builder already reads. Reused,
 *                            never copied.
 *   `mountain`     HALF.     `normalisedHeight` and relief are measurements; "rock and metal" is an
 *                            assertion. There is no ore and no lithology anywhere in this package.
 *   `arable`       PROXY.    There is no soil, no growing season, no river and no floodplain.
 *                            {@link ARABILITY} is an authored table and it is a design dial.
 *   `habitability` PROXY.    Composite. Every ingredient is real; there is no habitability function.
 *   `tradeAccess`  INVENTED. See {@link TRADE_RANGE_KM} and DECISIONS C32.
 *
 * Run:  node --import tsx --test packages/planet/tests/geography.test.ts
 */

import { cellToLatLng } from "h3-js";

import { latLngToVec3, type Vec3 } from "./geo.js";
import { createTangentPatch } from "./scene.js";
import { VEGETATION_DENSITY } from "./biome-mask.js";
import type { SettlementGeography } from "./society.js";
import {
  BIOMES, biome, isLandHeight, normalisedHeight,
  type Biome, type Calibration, type TerrainField,
} from "./terrain.js";

/**
 * The disk every number below is read off: 3,000 m over five rings, 1 + 3·rings·(rings+1) = 91 points.
 *
 * 3 km because the field cannot express anything under about 1.56 km, and a smaller disk therefore
 * reads one shape. Five rings because 600 m between rings and 628 m along the outer ring are both
 * under that feature size, so the disk does not alias. Gnomonic distortion at this radius on a
 * 200 km planet is (3/200)² / 3 = 0.0075%.
 */
export const GEOGRAPHY_SAMPLE = { radiusM: 3000, rings: 5 } as const;

/** Normalised relief that reads as fully rugged. Measured over the 3 km disk: p75 0.16, p95 0.29. */
export const RELIEF_FULL = 0.3;

/**
 * The distance past which nowhere is on the way to anywhere, in km.
 *
 * ⚠ THIS IS THE INVENTED NUMBER (DECISIONS C32). There is no road, no river, no port and no economy
 * — SOC-7 records that zero code exists. `tradeAccess` also CANNOT be read from the neighbours'
 * settlements: `settlementAt` takes geography as an INPUT, so that would make `geographyOf(cell)`
 * depend on `geographyOf(neighbour).tradeAccess` — unbounded mutual recursion across the planet, and
 * an L2 violation, because the answer would depend on how wide a neighbourhood the caller happened
 * to expand. Nor can it come from `referral.ts`: `gridDistance` throws once a disk is wide enough to
 * wrap pentagon distortion, and a ring count is resolution-dependent anyway.
 *
 * So it is distance to the nearest of the twelve commons, which are already a manifest column and
 * cost 0.0003 ms to search. Measured over 3,000 land res-4 cells: p05 25.3, med 85.0, p95 119.3,
 * max 145.6 km, against a half-circumference of 628.3 km. 150 sits just past the measured maximum,
 * so nothing clamps to exactly zero.
 *
 * WHAT THIS ASSERTS: that the twelve public cells are where trade converges. That is a design claim
 * about the world, not a measurement of it, and C32 is where it is written down and argued.
 */
export const TRADE_RANGE_KM = 150;

/**
 * How much food a biome grows, 0 to 1. AUTHORED — see the file header.
 *
 * A design dial in the same class as `society.ts`'s `VITALS`, and it is deliberately NOT derived
 * from moisture and temperature directly: the biome table already made that judgement once, and
 * making it twice in two places is how the two drift.
 */
export const ARABILITY: Record<Biome, number> = {
  ocean: 0,
  beach: 0.1,
  grassland: 1,
  savanna: 0.6,
  forest: 0.55,
  rainforest: 0.3,
  taiga: 0.2,
  tundra: 0.05,
  desert: 0.02,
  "bare-rock": 0,
  snow: 0,
};

export interface GeographyOptions {
  /** Radius of the sampled disk, metres. Default {@link GEOGRAPHY_SAMPLE}.radiusM. */
  radiusM?: number;
  /** Rings in the disk. Default {@link GEOGRAPHY_SAMPLE}.rings. */
  rings?: number;
  /**
   * The twelve commons, from `WorldManifest.commons` or `CommonsPlan.cells`.
   *
   * Omitting them is legal and makes `tradeAccess` a function of coast and terrain alone, which is
   * what a synthetic test planet wants; it is NOT what the shipped world should do.
   */
  commons?: readonly string[];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (lo: number, hi: number, v: number) => {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

export interface GeographySample {
  /** Points taken. 1 + 3·rings·(rings+1). */
  points: number;
  /** Points above sea level, by `isLandHeight` and nothing else. */
  land: number;
  /** Points per biome, indexed as {@link BIOMES}. Water is counted as `ocean`. */
  biomes: Int32Array;
  /** Normalised height over LAND points only. */
  heightMean: number;
  heightMin: number;
  heightMax: number;
  /** Temperature and moisture over LAND points only. */
  temperatureMean: number;
  moistureMean: number;
  /** Radius of the innermost ring holding water, metres, or Infinity. Quantised to the ring step. */
  nearestWaterM: number;
}

/** The one pass over the ground. Exported so a script can report the raw reading, not just the six. */
export function sampleGeography(
  cell: string,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: GeographyOptions = {},
): GeographySample {
  const radiusM = options.radiusM ?? GEOGRAPHY_SAMPLE.radiusM;
  const rings = options.rings ?? GEOGRAPHY_SAMPLE.rings;
  if (!(radiusM > 0) || !Number.isInteger(rings) || rings < 1) {
    throw new RangeError(`bad geography sample ${radiusM} m over ${rings} rings`);
  }
  const patch = createTangentPatch(cell, radiusKm);
  const step = radiusM / rings;
  const biomes = new Int32Array(BIOMES.length);
  let points = 0, land = 0, hSum = 0, tSum = 0, mSum = 0;
  let hMin = Infinity, hMax = -Infinity, nearestWaterM = Infinity;

  for (let r = 0; r <= rings; r++) {
    const rad = r * step;
    const count = r === 0 ? 1 : 6 * r;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const direction = patch.toDirection(Math.cos(angle) * rad, Math.sin(angle) * rad);
      const h = normalisedHeight(field.elevation(direction), calibration);
      const t = field.temperature(direction);
      const m = field.moisture(direction);
      biomes[BIOMES.indexOf(biome(h, m, t))]!++;
      points++;
      if (isLandHeight(h)) {
        land++;
        hSum += h;
        tSum += t;
        mSum += m;
        if (h < hMin) hMin = h;
        if (h > hMax) hMax = h;
      } else if (rad < nearestWaterM) {
        nearestWaterM = rad;
      }
    }
  }
  const n = Math.max(1, land);
  return {
    points, land, biomes,
    heightMean: hSum / n,
    heightMin: land > 0 ? hMin : 0,
    heightMax: land > 0 ? hMax : 0,
    temperatureMean: tSum / n,
    moistureMean: mSum / n,
    nearestWaterM,
  };
}

/**
 * The six numbers for a cell.
 *
 * The argument order is `spawnPointFor`'s: cell, field, calibration, radiusKm, options. `radiusKm`
 * is NOT optional, because `geo.ts` rule 2 forbids letting an h3-js Earth measurement in.
 */
export function geographyOf(
  cell: string,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: GeographyOptions = {},
): SettlementGeography {
  const radiusM = options.radiusM ?? GEOGRAPHY_SAMPLE.radiusM;
  const rings = options.rings ?? GEOGRAPHY_SAMPLE.rings;
  const s = sampleGeography(cell, field, calibration, radiusKm, options);
  const land = Math.max(1, s.land);
  const landShare = s.land / s.points;

  const relief = s.land > 0 ? s.heightMax - s.heightMin : 0;
  const rugged = clamp01(relief / RELIEF_FULL);

  // Distance to water, quantised to the ring step: 1 at the point itself, 1/(rings+1) at the rim,
  // and exactly 0 only when the disk holds no water at all — so `coastal === 0` is unambiguous.
  const step = radiusM / rings;
  const coastal = s.nearestWaterM === Infinity
    ? 0
    : clamp01((radiusM + step - s.nearestWaterM) / (radiusM + step));

  let wooded = 0;
  let arable = 0;
  for (let i = 0; i < BIOMES.length; i++) {
    const kind = BIOMES[i]!;
    if (kind === "ocean") continue;
    const count = s.biomes[i]!;
    wooded += VEGETATION_DENSITY[kind] * count;
    arable += ARABILITY[kind] * count;
  }
  wooded = clamp01(wooded / land);
  arable = clamp01((arable / land) * (1 - 0.45 * rugged));

  const mountain = clamp01(0.55 * s.heightMean + 0.45 * rugged);

  // THE CUTS ARE THE BIOME TABLE'S OWN, not new numbers: 0.09 is where the table stops calling
  // ground temperate, 0.30 and 0.72 are its moisture bands. Reusing them is what stops habitability
  // drifting away from the ground a person actually walks on. Nowhere is uninhabitable for being
  // pleasant, so both ends taper rather than cliff.
  const warmth = smooth(0.09, 0.3, s.temperatureMean) * (1 - 0.35 * smooth(0.85, 1, s.temperatureMean));
  const wet = smooth(0.2, 0.36, s.moistureMean) * (1 - 0.3 * smooth(0.72, 0.95, s.moistureMean));
  const habitability = clamp01(landShare * warmth * wet * (1 - 0.5 * clamp01(mountain - 0.35)));

  let tradeAccess = (0.7 + 0.3 * coastal) * (1 - 0.4 * rugged);
  if (options.commons && options.commons.length > 0) {
    const here = centreDirection(cell);
    let nearestKm = Infinity;
    for (const c of options.commons) {
      const there = centreDirection(c);
      const dot = Math.min(1, Math.max(-1, here[0] * there[0] + here[1] * there[1] + here[2] * there[2]));
      const km = Math.acos(dot) * radiusKm;
      if (km < nearestKm) nearestKm = km;
    }
    tradeAccess *= 1 - clamp01(nearestKm / TRADE_RANGE_KM);
  }

  return { habitability, arable, coastal, wooded, mountain, tradeAccess: clamp01(tradeAccess) };
}

function centreDirection(cell: string): Vec3 {
  const [lat, lng] = cellToLatLng(cell);
  return latLngToVec3(lat, lng);
}

/**
 * A geography function for one planet, memoised. `land.ts`'s idiom, for the same reason: the caller
 * holds one of these per world and asks it per visited cell.
 */
export function geographySampler(
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: GeographyOptions = {},
): (cell: string) => SettlementGeography {
  const cache = new Map<string, SettlementGeography>();
  return (cell: string) => {
    let value = cache.get(cell);
    if (value === undefined) {
      value = geographyOf(cell, field, calibration, radiusKm, options);
      cache.set(cell, value);
    }
    return value;
  };
}
