/**
 * The twelve commons (section 6.4), and the one place the design has to argue with its own geometry.
 *
 * Euler's formula forces exactly twelve pentagons into any hexagonal tiling of a sphere, at every
 * resolution, forever. That is what makes "the commons cannot be diluted later" a fact rather than
 * a promise, and it is the strongest thing section 6.4 says.
 *
 * It also means the twelve sit at icosahedral vertices chosen by the grid, which knows nothing
 * about where the water is. Measured over 24 fresh seeds, about three of the twelve fall below the
 * land rule and about two of those are open ocean; on the shipped seed it is two and two. Note it
 * is NOT 1 - landFractionTarget of twelve, which would be about five: land is spatially correlated,
 * so a whole 324 km2 cell is far less likely to be dry than a single point is to be wet. A commons
 * you can only sail past is not social infrastructure.
 *
 * So a drowned commons is relocated to the best land within a couple of rings of its pentagon.
 * Be clear about what that costs: the commons are no longer AT the twelve vertices, so the claim
 * weakens from "fixed by geometry" to "fixed at planet creation". The count stays twelve and is
 * still forced, the positions become a fact about this world rather than about all worlds, and
 * because they now depend on the terrain they have to be written into the manifest rather than
 * recomputed from getPentagons.
 */

import { getPentagons, getResolution, gridDisk, isPentagon } from "h3-js";

/**
 * The twelve names, fixed forever, in the order getPentagons returns them (section 6.4).
 *
 * Section 6.4 asks for a fixed name per commons in the manifest, and it is right to: these are the
 * only twelve places on the planet everyone can reach without asking anyone, so they are what
 * people will navigate by and what they will arrange to meet at. A place people meet at needs a
 * name before it needs anything else.
 *
 * Bound to the INDEX and not to a position, because a commons whose pentagon fell in open water is
 * relocated onto land and its position is therefore a fact about this world rather than about the
 * icosahedron. The name survives the move; that is the point of naming it by index.
 */
export const COMMONS_NAMES: readonly string[] = [
  "Anchor",
  "Long Water",
  "The Quiet Face",
  "Saltmarker",
  "The Turning",
  "Nine Winters",
  "The Open Hand",
  "Farhold",
  "Listening Stone",
  "Ember Reach",
  "Lastlight",
  "Northgate",
] as const;

export interface CommonsChoice {
  /** Its permanent name. Twelve of them, fixed at the resolution the commons are reserved at. */
  name: string;
  /** The pentagon this commons belongs to. Always one of the twelve, relocated or not. */
  pentagon: string;
  /** The cell actually reserved. Equal to `pentagon` unless it had to move. */
  cell: string;
  relocated: boolean;
  /** How many rings out the search had to go. 0 when the pentagon itself was fine. */
  rings: number;
  landFraction: number;
}

export interface CommonsPlan {
  resolution: number;
  choices: CommonsChoice[];
  /** The twelve cells that ARE the commons. These are the ones you build something on. */
  cells: string[];
  /**
   * Every cell held out of the registry: the twelve commons, plus any pentagon a commons moved off.
   *
   * A vacated pentagon cannot simply become an ordinary parcel, for two separate reasons and either
   * would be enough. Section 6.4 says the twelve pentagons must not be assignable, and it does not
   * make an exception for the wet ones. And every count in lib/rounds.ts assumes a registry cell has
   * seven children: a pentagon has six, and one of those six is another pentagon, so letting one in
   * would quietly corrupt the inventory arithmetic at every later resolution.
   *
   * So a relocated commons costs the planet two cells rather than one: the land it moves to, and
   * the water it came from. On this seed that is about 0.13% of the surface, and it is the price of
   * having twelve commons that are all actually reachable.
   */
  reserved: string[];
  relocated: number;
  /** Commons that had to stay put because no land was found within the search radius. */
  stranded: number;
  /** The name of a commons by its cell, for a renderer that has a cell and wants a label. */
  nameOf(cell: string): string | null;
}

/**
 * Choose the twelve commons at `resolution`, moving any that are underwater.
 *
 * The search is by {@link gridDisk} and never by gridDistance. gridDistance throws once the disk is
 * wide enough to wrap pentagon distortion, measured at resolution 0 from k=2 and resolution 1 from
 * k=4. At the shipped resolution 1 with two rings it happens not to throw, so this is insurance
 * rather than a rescue, but gridDisk is correct at every radius and needs no such argument.
 * gridDisk is also safe at a pentagon in the other sense: it simply returns fewer cells, 6 at k=1
 * rather than 7, and 16 at k=2 rather than 19.
 */
export function chooseCommons(
  resolution: number,
  landFraction: (cell: string) => number,
  minLandFraction: number,
  maxRings = 2,
): CommonsPlan {
  const pentagons = getPentagons(resolution);
  const choices: CommonsChoice[] = [];
  const taken = new Set<string>();

  for (const pentagon of pentagons) {
    const own = landFraction(pentagon);
    if (own >= minLandFraction) {
      choices.push({ name: nameFor(choices.length), pentagon, cell: pentagon, relocated: false, rings: 0, landFraction: own });
      taken.add(pentagon);
      continue;
    }

    let best: CommonsChoice | null = null;
    for (let rings = 1; rings <= maxRings && best === null; rings++) {
      let bestCell: string | null = null;
      // Strictly greater, so a candidate sitting exactly on the bar is refused even though the
      // registry would sell it. Unreachable with the shipped sampler, whose land fractions are k/49
      // for a hexagon and k/41 for a pentagon and never land on 0.15 exactly, but it becomes live
      // the moment minLandFraction is set to a value the sample grid can hit.
      let bestLand = minLandFraction;
      for (const candidate of gridDisk(pentagon, rings)) {
        if (candidate === pentagon || taken.has(candidate)) continue;
        // A neighbouring pentagon is another commons, never a home for this one.
        if (isPentagon(candidate)) continue;
        const land = landFraction(candidate);
        if (land > bestLand) {
          bestLand = land;
          bestCell = candidate;
        }
      }
      if (bestCell !== null) {
        best = { name: nameFor(choices.length), pentagon, cell: bestCell, relocated: true, rings, landFraction: bestLand };
      }
    }

    // Nothing within reach cleared the bar. Keep the pentagon: a wet commons is better than none,
    // and pretending otherwise would silently drop one of the twelve.
    choices.push(
      best ?? { name: nameFor(choices.length), pentagon, cell: pentagon, relocated: false, rings: maxRings, landFraction: own },
    );
    taken.add((best ?? { cell: pentagon }).cell);
  }

  const cells = choices.map((c) => c.cell);
  if (new Set(cells).size !== cells.length) {
    throw new Error("two commons were placed on the same cell");
  }
  if (cells.some((c) => getResolution(c) !== resolution)) {
    throw new Error("a commons ended up at the wrong resolution");
  }

  // Every pentagon stays out of the registry whether or not its commons still sits on it.
  const reserved = [...new Set([...cells, ...pentagons])];
  if (reserved.some((c) => getResolution(c) !== resolution)) {
    throw new Error("a reserved cell ended up at the wrong resolution");
  }

  const names = new Map(choices.map((c) => [c.cell, c.name]));
  return {
    resolution,
    choices,
    cells,
    reserved,
    nameOf: (cell: string) => names.get(cell) ?? null,
    relocated: choices.filter((c) => c.relocated).length,
    stranded: choices.filter((c) => !c.relocated && c.landFraction < minLandFraction).length,
  };
}

/** The name for the nth commons. Past twelve there is no name, which cannot happen but is stated. */
function nameFor(index: number): string {
  return COMMONS_NAMES[index] ?? `Commons ${index + 1}`;
}
