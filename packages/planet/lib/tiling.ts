/**
 * Does this set of cells cover the sphere exactly once?
 *
 * Section 8 of the design document proposes checking the registry by compacting the union with
 * compactCells and asserting it reduces to the 122 resolution 0 cells. That check cannot run, and
 * the reason is worse than a throw.
 *
 * h3-js v4 compactCells is not defined for mixed resolution input, and the registry is mixed
 * resolution by construction, since freezing a parcel at its resolution is the whole point. On the
 * array order a registry naturally produces it throws "Duplicate input (code: 10)". Sort the same
 * cells finest first and it returns quietly, with the wrong answer: 842 cells rather than the 122
 * section 8 expects. A check that throws is survivable. A check that silently passes a broken
 * registry is not, which is why nothing here calls it.
 *
 * uncompactCells does accept mixed input, but uncompacting the registry to the floor materialises
 * 98,825,162 ids at the planet's floor of resolution 7. Measured on this simulation's own covers it
 * takes 163 ms while the finest parcel is resolution 4 and 8 seconds at resolution 6, and at
 * resolution 7, which is the floor every parcel eventually reaches, it runs a default node heap out
 * of memory. So the technique is affordable only while the registry is young and stops working
 * exactly when the invariant matters most.
 *
 * What works instead is counting rather than materialising. Every cell is worth a known number of
 * floor cells, the weights sum to the sphere exactly when there are no gaps, and an ancestor walk
 * catches the one thing weights cannot see, a cell nested inside another cell in the same set.
 * A few thousand rows check in single digit milliseconds: 842 rows in 0.4 ms, 3,530 rows in 4 ms.
 */

import { cellToParent, getResolution, isValidCell } from "h3-js";

import { cellCountAtResolution, descendantCount } from "./geo.js";

export type TilingResult =
  | { ok: true; weight: number }
  | { ok: false; reason: string; weight: number };

/**
 * Assert that `cells` tiles the sphere with no gaps and no overlaps.
 *
 * `floorResolution` is the resolution the weights are counted at. It must be at least as fine as
 * the finest cell in the set, and using the planet's own floor resolution is the natural choice.
 */
export function checkTiling(cells: readonly string[], floorResolution: number): TilingResult {
  // H3 ids are case insensitive: every h3-js function accepts an uppercase id and returns the same
  // answer for it. A Set of raw strings would therefore count an uppercase alias as a distinct cell
  // and give it a second full weight, which is exactly the fault a registry integrity check exists
  // to notice. Normalise before comparing anything.
  const ids = cells.map((c) => c.toLowerCase());
  const set = new Set(ids);
  if (set.size !== ids.length) {
    return { ok: false, reason: "the set contains duplicate cell ids", weight: 0 };
  }

  let weight = 0;
  for (const cell of ids) {
    // A corrupt row must be named, not weighed. getResolution returns -1 for a string that is not a
    // cell, which would silently buy that row 7^(floor+1) descendants, and 40 million phantom cells
    // can cancel a real gap exactly. This check runs against stored data, where a bad id is the
    // fault you are looking for.
    if (!isValidCell(cell)) {
      return { ok: false, reason: `${cell} is not a valid H3 cell`, weight };
    }
    const res = getResolution(cell);
    if (res > floorResolution) {
      return { ok: false, reason: `${cell} is finer than resolution ${floorResolution}`, weight };
    }
    // Weights cannot see a cell sitting inside another cell of the same set, because the pair
    // double counts rather than mis-counts. Walking up to resolution 0 is the only way to catch it,
    // and at 0.15 microseconds per step it costs nothing.
    for (let p = res - 1; p >= 0; p--) {
      if (set.has(cellToParent(cell, p))) {
        return { ok: false, reason: `${cell} lies inside its ancestor ${cellToParent(cell, p)}`, weight };
      }
    }
    weight += descendantCount(cell, floorResolution);
  }

  const expected = cellCountAtResolution(floorResolution);
  if (weight !== expected) {
    const short = expected - weight;
    return {
      ok: false,
      reason:
        short > 0
          ? `gap: the set is short by ${short} resolution ${floorResolution} cells`
          : `overlap: the set covers ${-short} resolution ${floorResolution} cells twice`,
      weight,
    };
  }

  return { ok: true, weight };
}
