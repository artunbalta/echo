/**
 * The subdivision rounds, section 4.2, as an exact simulation over real H3 cells.
 *
 * This is not a model of the registry. It is the registry's rule, run against the real cell tree,
 * so the counts it produces are the counts the database will hold.
 *
 * Two rules in the design document cannot both hold, and this module makes the conflict runnable
 * rather than arguing about it. The trigger watches "unassigned parcels", while section 5.4 creates
 * unassigned parcels that can never be assigned. If the permanently unassignable share of inventory
 * is larger than triggerFraction, the unassigned count can never fall to the threshold, the round
 * never ends, and nothing on the planet ever subdivides. Both readings are implemented here so the
 * difference can be measured instead of asserted:
 *
 *   triggerBasis "all-unassigned"   the literal text. Deadlocks whenever 1 - landFractionTarget
 *                                   exceeds triggerFraction.
 *   triggerBasis "assignable-only"  the repair. The round ends when the ASSIGNABLE unassigned pool
 *                                   falls to the threshold, which it always can.
 *
 * and likewise for what happens to a cell nobody can ever own:
 *
 *   "subdivide-everything"   the literal text. Ocean cells split every round along with everything
 *                            else, and the row count follows the surface, not the coastline.
 *   "freeze-zero-land"       a cell that samples as having no land at all is terminal, and the row
 *                            count follows the coastline rather than the surface. Note "samples as":
 *                            land fraction comes from a finite grid, so a cell that reads as landless
 *                            can still hide an island below the sample spacing. On the field the
 *                            capacity report runs on that costs 19 claimable parcels out of 17,994.
 *   "freeze-unassignable"    anything under minLandFraction is terminal. Bounded, but it seals real
 *                            island land inside cells that were merely too coarse to qualify.
 *
 * Everything here is deterministic. Which parcels get claimed is drawn from a caller supplied
 * stream, so a run is reproducible and two runs of the same seed are identical.
 */

import { cellToChildren, cellToParent, getPentagons, getRes0Cells, getResolution } from "h3-js";

import { cellAreaKm2, hexagonWidthM } from "./geo.js";
import type { PlanetParams } from "./manifest.js";

export type TriggerBasis = "all-unassigned" | "assignable-only";
export type SubdivisionPolicy = "subdivide-everything" | "freeze-zero-land" | "freeze-unassignable";

export interface RegistryRules {
  triggerBasis: TriggerBasis;
  subdivisionPolicy: SubdivisionPolicy;
}

/** The design document exactly as written. */
export const LITERAL_RULES: RegistryRules = {
  triggerBasis: "all-unassigned",
  subdivisionPolicy: "subdivide-everything",
};

/** Both repairs applied. This is the rule set that actually runs. */
export const REPAIRED_RULES: RegistryRules = {
  triggerBasis: "assignable-only",
  subdivisionPolicy: "freeze-zero-land",
};

export interface RoundReport {
  round: number;
  resolution: number;
  /** Every row in unclaimed_cells at the round's start, assignable or not. */
  rowsAtStart: number;
  /** The subset of those rows that anyone could actually be given. */
  assignableAtStart: number;
  /** The count the trigger watches, which depends on triggerBasis. */
  triggerBasisCount: number;
  /** The round ends when the watched count falls to this. */
  endsWhenBasisReaches: number;
  assignments: number;
  cumulativeOwners: number;
  /** Mean area of the parcels actually assigned this round, on the real planet. */
  meanParcelKm2: number;
  /** Flat to flat width of a regular hexagon of that area. What a player walks across. */
  parcelWidthM: number;
  /** Parcel area assigned this round, and the LAND inside it. The two are not the same number. */
  parcelAreaSoldKm2: number;
  landSoldKm2: number;
  /**
   * Rows that will never subdivide and never be assigned, as the round OPENS. Every other count on
   * this row is a round-start quantity too, so the line stays coherent, but note that this round's
   * own subdivision will add more before the next line is written.
   */
  terminalRowsAtStart: number;
  /** True when the trigger cannot be reached, so the round never ends and the planet stops here. */
  deadlocked: boolean;
}

export interface RegistrySimulation {
  rules: RegistryRules;
  params: PlanetParams;
  rounds: RoundReport[];
  totalCapacity: number;
  floorReachedAtRound: number | null;
  deadlockedAtRound: number | null;
  /** The largest unclaimed_cells row count the design ever has to hold. */
  peakRows: number;
  /**
   * The largest single insert a subdivision performs, in rows. On the shipped parameters this is
   * 491,540. Whether that fits in one transaction, or has to be batched, is a database decision
   * this package does not make and does not pretend to have made.
   */
  largestSubdivisionInsert: number;
  /** Land locked inside cells frozen below minLandFraction, and so never claimable. */
  sealedLandKm2: number;
  /** The reserved commons, which is never inventory. */
  commonsCells: number;
  commonsAreaKm2: number;
  /** The land the registry can actually deal in, which is the planet minus the commons. */
  registryAreaKm2: number;
  /**
   * Every cell in existence at the end of each round: assigned parcels frozen at their own
   * resolutions, live inventory, terminal rows and the commons. Present only when recordCovers was
   * asked for. Each one must tile the sphere exactly.
   */
  covers?: string[][];
}

export interface SimulateRoundsInput {
  params: PlanetParams;
  rules: RegistryRules;
  /** Land fraction in 0..1 for a cell. Called once per cell and cached by the caller if costly. */
  landFraction: (cell: string) => number;
  /** A deterministic uniform stream, used to choose which assignable parcels are claimed. */
  random: () => number;
  /**
   * The cells reserved as commons, if they are not simply the twelve pentagons at
   * commonsResolution. Once a drowned commons has been relocated onto land, its position depends on
   * the terrain and can no longer be recomputed from geometry, so it has to be passed in.
   */
  commonsCells?: readonly string[];
  /**
   * Keep the full cell cover at the end of every round, so the tiling invariant can be asserted
   * after each subdivision. Refused under subdivide-everything, where the landless rows reach 244
   * million and holding their ids is not a thing anyone should do.
   */
  recordCovers?: boolean;
}

/**
 * Every cell at `resolution` that the registry may deal in.
 *
 * The twelve pentagons are public commons and are never assignable, so they and everything under
 * them are removed here, once, rather than being filtered at every later step. Because a pentagon's
 * parent is always a pentagon, removing the twelve at commonsResolution removes twelve whole
 * lineages, and no cell the registry ever touches is a pentagon. That is what lets the rest of this
 * file assume seven children rather than six.
 */
export function seedInventory(resolution: number, commons: number | readonly string[]): string[] {
  const commonsResolution = typeof commons === "number" ? commons : getResolution(commons[0]!);
  if (commonsResolution > resolution) {
    throw new RangeError("the commons must be at least as coarse as the parcels around it");
  }
  const reserved = new Set(typeof commons === "number" ? getPentagons(commons) : commons);
  const all = getRes0Cells().flatMap((base) => cellToChildren(base, resolution));
  return all.filter((cell) => !reserved.has(cellToParent(cell, commonsResolution)));
}

/** A Fisher Yates shuffle driven by the caller's stream, so claim order is reproducible. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function simulateRounds(input: SimulateRoundsInput): RegistrySimulation {
  const { params, rules, landFraction, random, recordCovers = false } = input;
  if (recordCovers && rules.subdivisionPolicy === "subdivide-everything") {
    throw new RangeError("covers cannot be recorded while landless cells keep subdividing");
  }
  if (params.floorResolution < params.startResolution) {
    throw new RangeError(
      `the floor (${params.floorResolution}) cannot be coarser than the start (${params.startResolution})`,
    );
  }
  const { radiusKm, startResolution, floorResolution, triggerFraction, minLandFraction } = params;
  const commonsResolution = params.commonsResolution ?? startResolution;

  const commonsCellIds = input.commonsCells ? [...input.commonsCells] : getPentagons(commonsResolution);
  const commonsAreaKm2 = commonsCellIds.reduce((sum, c) => sum + cellAreaKm2(c, radiusKm), 0);

  // The working set: unassigned cells that still hold some land, so are worth carrying forward.
  // Cells with no land at all are held as a count rather than as ids, because under
  // subdivide-everything materialising them would mean holding 140 million ids in memory to learn
  // a number we can multiply out.
  //
  // Be exact about what that shortcut costs. It is NOT true that their children are all ocean: a 49
  // point grid misses islands, and 73 landless resolution 1 cells have 19 children with some land.
  // Holding them as a count means no descendant of a landless cell can ever be assigned, under
  // EITHER subdivision policy. Under freeze-zero-land that is the rule, so it is exactly right.
  // Under subdivide-everything it makes the two policies report identical capacity, which is why
  // the capacity report has to state the 19 parcels separately rather than read them off the table.
  let live = new Map<string, number>();
  let oceanRows = 0;
  // Ids are kept only when the caller asked to audit the tiling, since under the freeze policies
  // the terminal rows stay in the low thousands.
  const terminalIds: string[] = [];
  const assignedIds: string[] = [];
  const covers: string[][] = [];
  const snapshot = () => [...assignedIds, ...live.keys(), ...terminalIds, ...commonsCellIds];

  for (const cell of seedInventory(startResolution, commonsCellIds)) {
    const lf = landFraction(cell);
    if (lf > 0) {
      live.set(cell, lf);
    } else {
      oceanRows++;
      if (recordCovers) terminalIds.push(cell);
    }
  }
  if (recordCovers) covers.push(snapshot());

  const rounds: RoundReport[] = [];
  let cumulativeOwners = 0;
  let sealedRows = 0;
  let sealedLandKm2 = 0;
  let peakRows = 0;
  let largestSubdivisionInsert = 0;
  let floorReachedAtRound: number | null = null;
  let deadlockedAtRound: number | null = null;

  for (let round = 1; ; round++) {
    const resolution = startResolution + round - 1;
    const atFloor = resolution >= floorResolution;
    if (atFloor) floorReachedAtRound = round;

    const rowsAtStart = live.size + oceanRows + sealedRows;
    peakRows = Math.max(peakRows, rowsAtStart);

    const assignable = [...live.entries()].filter(([, lf]) => lf >= minLandFraction);
    const triggerBasisCount = rules.triggerBasis === "all-unassigned" ? rowsAtStart : assignable.length;

    // The floor round has nothing to subdivide into, so it simply runs until the assignable pool is
    // empty. That is exhaustion, not a stalled trigger, so it can never be a deadlock.
    const endsWhenBasisReaches = atFloor
      ? triggerBasisCount - assignable.length
      : Math.floor(triggerFraction * triggerBasisCount);
    const wanted = triggerBasisCount - endsWhenBasisReaches;
    const deadlocked = !atFloor && wanted > assignable.length;
    const assignments = Math.min(wanted, assignable.length);

    const claimed = shuffle(assignable, random).slice(0, assignments);
    let parcelAreaSoldKm2 = 0;
    let landSoldKm2 = 0;
    for (const [cell, lf] of claimed) {
      const area = cellAreaKm2(cell, radiusKm);
      parcelAreaSoldKm2 += area;
      landSoldKm2 += area * lf;
      live.delete(cell);
      if (recordCovers) assignedIds.push(cell);
    }

    cumulativeOwners += assignments;
    const meanParcelKm2 = assignments > 0 ? parcelAreaSoldKm2 / assignments : 0;

    if (deadlocked) deadlockedAtRound = round;

    rounds.push({
      round,
      resolution,
      rowsAtStart,
      assignableAtStart: assignable.length,
      triggerBasisCount,
      endsWhenBasisReaches,
      assignments,
      cumulativeOwners,
      meanParcelKm2,
      parcelWidthM: hexagonWidthM(meanParcelKm2),
      parcelAreaSoldKm2,
      landSoldKm2,
      terminalRowsAtStart:
        sealedRows + (rules.subdivisionPolicy === "subdivide-everything" ? 0 : oceanRows),
      deadlocked,
    });

    // The round never ended, so nothing subdivides, and the planet stops here forever.
    if (deadlocked) break;
    if (atFloor) {
      if (recordCovers) covers.push(snapshot());
      break;
    }

    const next = new Map<string, number>();
    let inserted = 0;
    // Captured before the loop below starts adding this round's newly landless children, which are
    // already at the next resolution and must not be split again in the same round.
    const oceanRowsBefore = oceanRows;
    for (const [cell, lf] of live) {
      const freeze =
        (rules.subdivisionPolicy === "freeze-zero-land" && lf === 0) ||
        (rules.subdivisionPolicy === "freeze-unassignable" && lf < minLandFraction);
      if (freeze) {
        sealedRows++;
        sealedLandKm2 += cellAreaKm2(cell, radiusKm) * lf;
        if (recordCovers) terminalIds.push(cell);
        continue;
      }
      for (const child of cellToChildren(cell, resolution + 1)) {
        inserted++;
        const childLf = landFraction(child);
        if (childLf > 0) {
          next.set(child, childLf);
        } else {
          oceanRows++;
          if (recordCovers) terminalIds.push(child);
        }
      }
    }

    // Cells with no land at all. Under the literal rule they split like everything else, which is
    // where 140 million unsellable rows come from. Under either freeze policy they are terminal.
    if (rules.subdivisionPolicy === "subdivide-everything") {
      inserted += oceanRowsBefore * 7;
      oceanRows += oceanRowsBefore * 6;
    }

    largestSubdivisionInsert = Math.max(largestSubdivisionInsert, inserted);
    live = next;
    if (recordCovers) covers.push(snapshot());
  }

  return {
    rules,
    params,
    rounds,
    totalCapacity: cumulativeOwners,
    floorReachedAtRound,
    deadlockedAtRound,
    peakRows,
    largestSubdivisionInsert,
    sealedLandKm2,
    commonsCells: commonsCellIds.length,
    commonsAreaKm2,
    registryAreaKm2: 4 * Math.PI * radiusKm * radiusKm - commonsAreaKm2,
    covers: recordCovers ? covers : undefined,
  };
}
