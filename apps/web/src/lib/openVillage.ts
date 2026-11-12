/**
 * The village a newcomer walks into (DECISIONS C89): Drurnscree, a fishing village with the sea beside
 * it and another shore a raft can reach.
 *
 * WHY ONE VILLAGE. The landing's globe lets a stranger pick any of 284,004 cells, and about nine in
 * ten have nobody on them (C15: "an ordinary parcel has nothing to do in it"). Someone arriving cold
 * should land where things happen. The globe is still there for whoever wants to choose.
 *
 * WHY NOT SENSTRAND. That is the pilot's village (`lib/pilot.ts`), and a village is shared: what
 * strangers do in it is remembered by its people (C44, C45). The study's village stays the study's.
 */
export const OPEN_VILLAGE = "84dcee5ffffffff";

/** Where "walk in" leads. */
export const OPEN_VILLAGE_PATH = `/parcel/${OPEN_VILLAGE}`;
