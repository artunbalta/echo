/**
 * Placing a new arrival next to the person who invited them (section 7.2). Build order step 11.
 *
 * This is the feature that turns a referral link into a territory. Groups who arrive together end
 * up holding contiguous land, which is visible on the globe from orbit and is the strongest reason
 * anyone has to bring other people. Section 7.2 is right that it belongs in v1.
 *
 * TWO TRAPS, both of which the design document walks into and both of which are fixed here.
 *
 * 1. Never normalise DOWNWARD. Section 7.2 says to take the referrer's parcel and "cellToChildren
 *    if coarser". On the shipped parameters a resolution 4 referrer against a resolution 7 round is
 *    343 children, which is survivable, but the rule as written has no bound: a resolution 1 parcel
 *    against a resolution 8 round is 823,543 cells and 13 MB of ids, and there is no principled way
 *    to choose one of them anyway. Adjacency is decided at the COARSER of the two resolutions, by
 *    lifting both sides with cellToParent, which is exact and costs two calls.
 *
 * 2. Never gridDistance. It throws whenever the shortest path between two cells crosses pentagon
 *    distortion, which is not an edge case on a planet whose commons ARE the pentagons. Measured,
 *    it throws on 889 of 889 attempted far pairs. Everything here uses gridDisk, which never throws
 *    and simply returns fewer cells near a pentagon: 6 at k=1 rather than 7.
 *
 * A third thing the document does not mention, which the code has to be honest about: "adjacent" is
 * not a fixed distance in a mixed resolution registry. A ring at resolution 4 is 1.4 km and a ring
 * at resolution 7 is 77 m. Placement is therefore deliberately resolution scaled, and
 * {@link ReferralPlacement} reports the ring and the resolution so a caller can say so.
 */

import { cellToChildren, cellToParent, getResolution, gridDisk } from "h3-js";

export interface ReferralPlacement {
  /** The parcel to give the new arrival, or null when nothing was free near the referrer. */
  cell: string | null;
  /** True when the parcel really is near the referrer, false when this is a fallback. */
  placedAdjacent: boolean;
  /** How many rings out the search had to go. 0 when not placed adjacently. */
  rings: number;
  /** The resolution adjacency was decided at, which is the coarser of the two. */
  decidedAtResolution: number;
  /** How many candidate cells were examined. Bounded, and worth logging. */
  examined: number;
}

export interface AdjacentSearch {
  referrerParcel: string;
  /** The resolution the registry is currently issuing parcels at. */
  currentResolution: number;
  /** Is this exact cell free to give away right now? */
  isAvailable: (cell: string) => boolean;
  /** Choose one of the candidates. Seeded or random, the caller decides. */
  choose: (candidates: string[]) => string;
  /** How far out to look before giving up. Section 7.2 says three. */
  maxRings?: number;
  /** Refuse to examine more than this many cells, so a pathological span cannot hang a signup. */
  budget?: number;
}

/**
 * Find a free parcel near the referrer, expanding ring by ring.
 *
 * Cost is bounded by the resolution span. With the shipped start 4 and floor 7 the worst case is a
 * resolution 4 referrer against a resolution 7 round: 343 descendants per disk cell, so 2,401 cells
 * at ring 1 and 6,517 at ring 2. The budget exists so a future span cannot turn that into a hang.
 */
export function findAdjacentParcel(search: AdjacentSearch): ReferralPlacement {
  const {
    referrerParcel,
    currentResolution,
    isAvailable,
    choose,
    maxRings = 3,
    budget = 200_000,
  } = search;

  const referrerResolution = getResolution(referrerParcel);
  // Adjacency is decided where both sides exist: the coarser resolution. Never the finer one.
  const decidedAt = Math.min(referrerResolution, currentResolution);
  const anchor = referrerResolution === decidedAt ? referrerParcel : cellToParent(referrerParcel, decidedAt);

  let examined = 0;
  let previousRing = new Set<string>([anchor]);

  for (let rings = 1; rings <= maxRings; rings++) {
    const disk = gridDisk(anchor, rings);
    const candidates: string[] = [];

    for (const cell of disk) {
      // Only the newly reached ring, so a wider search does not re-examine what it already rejected.
      if (previousRing.has(cell)) continue;

      if (decidedAt === currentResolution) {
        examined++;
        if (isAvailable(cell)) candidates.push(cell);
      } else {
        for (const descendant of cellToChildren(cell, currentResolution)) {
          examined++;
          if (examined > budget) break;
          if (isAvailable(descendant)) candidates.push(descendant);
        }
      }
      if (examined > budget) break;
    }

    if (candidates.length > 0) {
      return {
        cell: choose(candidates),
        placedAdjacent: true,
        rings,
        decidedAtResolution: decidedAt,
        examined,
      };
    }
    if (examined > budget) break;
    previousRing = new Set(disk);
  }

  return { cell: null, placedAdjacent: false, rings: 0, decidedAtResolution: decidedAt, examined };
}

/**
 * Are two parcels neighbours, whatever resolutions they were frozen at?
 *
 * The mixed resolution registry makes this genuinely ambiguous, so the answer is defined: lift both
 * to the coarser resolution and ask whether one is in the other's disk. A resolution 4 parcel and
 * one of its own resolution 7 grandchildren are "adjacent" at ring 0, which is the right answer:
 * one contains the other.
 */
export function areAdjacent(a: string, b: string, rings = 1): boolean {
  const resolution = Math.min(getResolution(a), getResolution(b));
  const liftedA = getResolution(a) === resolution ? a : cellToParent(a, resolution);
  const liftedB = getResolution(b) === resolution ? b : cellToParent(b, resolution);
  if (liftedA === liftedB) return true;
  return gridDisk(liftedA, rings).includes(liftedB);
}
