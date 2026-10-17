/**
 * A parcel's village, from nothing but the world (DECISIONS C41): the geography, the settlement, the
 * ground it stands on, the plan, and the point a visitor arrives at.
 *
 * ONE FUNCTION, CALLED BY THE WORLD AND BY THE TESTS. The browser builds its ground from the same
 * `createSceneHeight` and `walkableAt` the terrain mesh and the mover use, and the test suite builds
 * it here; if they were two pieces of code they would one day build two villages. The census proved
 * the server and client geographies agree for the calibration the browser actually holds (seaLevel
 * and peakElevation only), and `village.test.ts` pins that.
 *
 * WHY COMMONS ARE REQUIRED. `tradeAccess` is distance to the nearest commons (C32), and capacity
 * depends on it, so a village computed without them is a different village — a plausible one, which
 * is worse than none. There is no default.
 *
 * WHAT THIS COSTS, and it runs once per parcel build: a 91-point geography (~0.09 ms), the
 * settlement (2–12 ms), a shore search out to {@link VILLAGE}.shoreMaxM, and the plan (~2 ms).
 */

import { latLngToCell, getResolution } from "h3-js";

import { vec3ToLatLng } from "./geo.js";
import { geographySampler } from "./geography.js";
import { createSceneHeight, createTangentPatch, DEFAULT_REGION_OPTIONS, DEFAULT_SCENE_OPTIONS, type TangentPatch } from "./scene.js";
import { settlementAt, type Settlement } from "./society.js";
import type { Calibration, TerrainField } from "./terrain.js";
import { VILLAGE, villagePlan, type VillageGround, type VillagePlan } from "./village.js";
import { nearestWaterFrom, regionBound, walkableAt, type SpawnPoint } from "./walkable.js";
import { PLANET_PARAMS } from "./manifest.js";

export interface VillageAtOptions {
  /** The world's commons cells. Required: see the header. */
  commons: readonly string[];
  /** World day to read the settlement at. */
  day: number;
  /** Region rings. The parcel route's k. */
  k?: number;
  heightScaleM?: number;
  resolutionM?: number;
}

export interface SettledParcel {
  settlement: Settlement;
  plan: VillagePlan;
  ground: VillageGround;
  /** The arrival point as a spawn, in the shape the rest of the world already takes. */
  spawn: SpawnPoint;
}

/**
 * The ground a village may use: dry, inside the region, and inside its OWN cell. The last part is the
 * one the mover does not need and a village does: a settlement belongs to a cell, and a house that
 * stood across the border would stand on a neighbour's land, perhaps in a neighbour's village.
 */
export function villageGround(
  cell: string,
  patch: TangentPatch,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: { k?: number; heightScaleM?: number; resolutionM?: number } = {},
): VillageGround {
  const res = getResolution(cell);
  const bound = regionBound(cell, options.k ?? 1, radiusKm);
  const height = createSceneHeight(patch, field, calibration, {
    heightScaleM: options.heightScaleM ?? DEFAULT_SCENE_OPTIONS.heightScaleM,
    resolution: options.resolutionM ?? DEFAULT_REGION_OPTIONS.resolution,
  });
  return {
    heightAt: (x, y) => height(x, y),
    standable: (x, y) => {
      if (!walkableAt(patch, field, calibration.seaLevel, x, y, bound)) return false;
      const [lat, lng] = vec3ToLatLng(...patch.toDirection(x, y));
      return latLngToCell(lat, lng, res) === cell;
    },
  };
}

export function villageAt(
  seed: string,
  cell: string,
  field: TerrainField,
  calibration: Calibration,
  radiusKm: number,
  options: VillageAtOptions,
): SettledParcel | null {
  // Settlements are generated per cell of the registry's START resolution: `settlementAt` keys on
  // the cell id, so a resolution-5 child would be handed a different village than the parent that
  // was counted in C33. What a subdivided parcel's village is — its parent's, or none — is SOC-0.F's
  // question and is not answered by accident here. Until it is, a finer cell has no village.
  if (getResolution(cell) !== PLANET_PARAMS.startResolution) return null;
  // The census's own path (scripts/census-planet.ts), so the village here is the village it counted.
  const geography = geographySampler(field, calibration, radiusKm, { commons: options.commons })(cell);
  const settlement = settlementAt(seed, cell, geography, options.day);
  if (settlement === null) return null;

  const patch = createTangentPatch(cell, radiusKm);
  const ground = villageGround(cell, patch, field, calibration, radiusKm, options);
  const sea = nearestWaterFrom(patch, field, calibration.seaLevel, 0, 0, { rangeM: VILLAGE.shoreMaxM, stepM: 8 });
  const shore = sea !== null && sea.distanceM > 0 ? { x: sea.x, y: sea.y } : null;
  const plan = villagePlan(settlement, ground, { origin: { x: 0, y: 0 }, shore });
  if (plan === null) return null;

  const direction = patch.toDirection(plan.arrival.x, plan.arrival.y);
  const [lat, lng] = vec3ToLatLng(...direction);
  const depth = 3;
  const spawn: SpawnPoint = {
    cell,
    childCell: latLngToCell(lat, lng, getResolution(cell) + depth),
    depth,
    lat,
    lng,
    direction,
    x: plan.arrival.x,
    y: plan.arrival.y,
  };
  return { settlement, plan, ground, spawn };
}
