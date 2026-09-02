/**
 * How much of a parcel is actually land (section 5.4).
 *
 * This is the bridge between the terrain field, which knows nothing about H3, and the registry,
 * which knows nothing about noise. It lives in its own file so neither has to import the other.
 *
 * The sample grid is the cell's own descendants a few resolutions down, which is a grid that is
 * already correctly shaped for the cell and needs no projection. Depth 2 gives 49 points, depth 3
 * gives 343. Depth is a real decision, not a detail: a coarse grid can miss an island small enough
 * to fit between samples, and the capacity simulation reports what that costs.
 */

import { cellToChildren, cellToLatLng, getResolution } from "h3-js";

import { latLngToVec3 } from "./geo.js";
import type { TerrainField } from "./terrain.js";

/** The fraction of a cell's interior above `seaLevel`, in 0..1. */
export function landFractionOfCell(
  field: TerrainField,
  seaLevel: number,
  cell: string,
  depth = 2,
): number {
  const grid = cellToChildren(cell, Math.min(15, getResolution(cell) + depth));
  let land = 0;
  for (const child of grid) {
    const [lat, lng] = cellToLatLng(child);
    if (field.elevation(latLngToVec3(lat, lng)) > seaLevel) land++;
  }
  return land / grid.length;
}

/** A land fraction function for one planet, memoised, which is what the registry wants. */
export function landFractionSampler(
  field: TerrainField,
  seaLevel: number,
  depth = 2,
): (cell: string) => number {
  const cache = new Map<string, number>();
  return (cell: string) => {
    let value = cache.get(cell);
    if (value === undefined) {
      value = landFractionOfCell(field, seaLevel, cell, depth);
      cache.set(cell, value);
    }
    return value;
  };
}
