/**
 * The planet parameters, in one place.
 *
 * Section 3 of the design document calls these "a public promise", and the split in this file is
 * meant to keep that promise honest:
 *
 *   PlanetParams is the set of knobs that can still be argued about. They are inputs to the capacity
 *   simulation, and the simulation is allowed to say they are wrong.
 *
 *   WorldManifest is what gets written to the database once, at planet creation, and then never
 *   touched again. It adds the two values that can only exist after the planet is generated: the
 *   seed and the calibrated sea level. Owners are standing on the terrain these two produce, so a
 *   change to either is not an edit, it is a different planet and needs a new world row.
 */

/** The knobs. Inputs to scripts/simulate-capacity.ts, and the argument this file exists to settle. */
export interface PlanetParams {
  /** Planet radius in kilometres. Sets the surface area, and so every parcel area. */
  radiusKm: number;
  /** The H3 resolution the registry is seeded at. Sets the size of a founder's parcel. */
  startResolution: number;
  /** The finest resolution a parcel may ever reach. Nothing subdivides past this. */
  floorResolution: number;
  /**
   * A round ends when unassigned inventory falls to this fraction of what it was at the round's
   * start. Every remaining unassigned cell then splits into seven, so inventory grows by a factor
   * of 7 * triggerFraction per round. Below 1/7 the planet shrinks its own inventory each round.
   */
  triggerFraction: number;
  /** The fraction of the surface that is land, hit exactly by calibrating sea level against it. */
  landFractionTarget: number;
  /** A cell with a smaller land fraction than this is never assigned to anyone (section 5.4). */
  minLandFraction: number;
  /**
   * The resolution the twelve pentagon commons are reserved at, then frozen forever.
   *
   * Defaults to startResolution. It is a separate knob because the commons has to stay a place
   * rather than shrink with the parcels around it: reserved at resolution 1 a commons still sitting
   * on its pentagon is 324 km2 and 20.3 km across as an equal-area circle, while one relocated onto
   * a hexagon is larger, up to about 500 km2. Reserved at resolution 4 it would be 0.88 km2 and
   * 1.1 km, which is a field, not a town square.
   * A commons coarser than the start resolution is how you keep it substantial while parcels get
   * small. It may never be finer than startResolution, or the commons would sit inside a parcel.
   */
  commonsResolution?: number;
}

/**
 * The decided parameters.
 *
 * Section 3 opened with startResolution 1, floorResolution 8 and the trigger reading every
 * unassigned row. The capacity simulation showed that the trigger as written stalls the planet in
 * round 2 at 787 owners, and that a resolution 1 to resolution 8 span hands the first 531 accounts
 * 80% of all land ever deeded at 607 km2 each. Both were changed deliberately, on the evidence:
 *
 *   startResolution 1 -> 4    a founder parcel becomes 1.4 km across instead of 26 km, the span
 *                             from first parcel to last falls from 823,543 to 1 down to 343 to 1,
 *                             and the founding class grows from 531 people to about 139,000.
 *   floorResolution 8 -> 7    resolution 8 is left unspent, as an expansion valve. Moving the floor
 *                             to 8 later is genuinely additive, and it is worth 566,236 more owners,
 *                             1,074,942 becoming 1,641,178. But it has a DEADLINE, which is the part
 *                             worth writing down: measured, the first three rounds are identical in
 *                             both worlds and round 4 opens identically, so flipping the floor at
 *                             any point before round 4 has sold 377,825 parcels lands exactly in
 *                             the floor 8 world with no issued deed changed. That is owner 980,486
 *                             of 1,074,942, or 91.2% sold. Wait past it and the valve is worth only
 *                             about 3,200, because the floor round sells every assignable cell and
 *                             leaves nothing but marginal rows behind.
 *
 * The trigger repairs are in lib/rounds.ts as REPAIRED_RULES, not here, because they are rules
 * rather than numbers.
 */
export const PLANET_PARAMS: PlanetParams = {
  radiusKm: 200,
  startResolution: 4,
  floorResolution: 7,
  triggerFraction: 0.2,
  landFractionTarget: 0.6,
  minLandFraction: 0.15,
  commonsResolution: 1,
};

/**
 * Section 3 exactly as written, kept so the capacity report can still run the comparison that
 * produced the decision above. Do not build on it.
 */
export const SECTION_3_PARAMS: PlanetParams = {
  radiusKm: 200,
  startResolution: 1,
  floorResolution: 8,
  triggerFraction: 0.2,
  landFractionTarget: 0.6,
  minLandFraction: 0.15,
  commonsResolution: 1,
};

/**
 * The immutable row. Written once, at planet creation, and then a fixed fact about the world.
 *
 * terrainVersion exists so that a change to the terrain functions is forced to be visible. If it
 * ever moves, that is a different planet: create a new world row, do not mutate this one.
 */
export interface WorldManifest extends PlanetParams {
  id: string;
  seed: string;
  terrainVersion: number;
  /** The elevation that divides water from land, calibrated at creation against landFractionTarget. */
  seaLevel: number;
  /**
   * The twelve reserved commons, as cell ids.
   *
   * A third column section 8 does not list, and like the other two it is not optional. The twelve
   * pentagons are fixed by geometry, but a pentagon that lands in open ocean is relocated to the
   * best land near it, and that choice depends on the terrain. Once made it is a permanent fact
   * about this world, so it is stored rather than recomputed.
   */
  commons: string[];
  /**
   * The height the biome table treats as this planet's high ground, the 99.9th percentile of land,
   * calibrated at the same moment as seaLevel.
   *
   * This is one column more than section 8's schema lists, and it is not optional. The biome table
   * takes height on a 0 to 1 scale so that it describes landscape rather than a set of constants
   * tied to one set of noise frequencies, and that scale needs a top as well as a bottom. Like
   * seaLevel it is immutable: change it and every mountain on the planet becomes a hill.
   */
  peakElevation: number;
  createdAt: string;
}
