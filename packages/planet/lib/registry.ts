/**
 * The registry, in a database (section 8).
 *
 * This module never imports a Postgres driver. It takes a {@link SqlClient}, which is the small
 * slice of node-postgres that matters, so the same code runs in a server, a script and a test, and
 * so importing anything from this package into a browser bundle cannot drag `pg` in behind it.
 *
 * Three rules from the capacity report are implemented here rather than described:
 *
 *   The trigger watches the ASSIGNABLE pool. Watching every unassigned row, as the design document
 *   says, stalls the planet in round 2 at 787 owners, because a cell with too little land is
 *   unassigned forever and the count can never fall to the threshold.
 *
 *   A cell with no land is terminal. It is a row, it is never sold, and it never subdivides.
 *   Without that the table reaches 140 million rows of ocean nobody can buy.
 *
 *   The subdivision fires exactly once. `rounds.assignable_remaining` is decremented by the same
 *   statement that reads it, so two concurrent claims cannot both believe they crossed the
 *   threshold. That was a real hazard: a read-then-write would let two transactions both subdivide,
 *   and the second would push survivors past the floor resolution.
 */

import { cellToChildren, getResolution } from "h3-js";

import { cellAreaKm2 } from "./geo.js";
import type { PlanetParams } from "./manifest.js";

/** The slice of a Postgres client this module needs. node-postgres satisfies it as it is. */
export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface WorldRow extends PlanetParams {
  id: string;
  seed: string;
  terrainVersion: number;
  seaLevel: number;
  peakElevation: number;
  commons: string[];
  reserved: string[];
}

/** A cell about to enter the registry, with the land measurement that decides what it may become. */
export interface SeedCell {
  h3Index: string;
  landFraction: number;
}

export interface ClaimedParcel {
  h3Index: string;
  resolution: number;
  landFraction: number;
  areaKm2: number;
  roundAssigned: number;
}

export interface SubdivisionReport {
  round: number;
  fromResolution: number;
  toResolution: number;
  parentsSubdivided: number;
  inserted: number;
  newlyAssignable: number;
  newlyTerminal: number;
  millis: number;
}

export type ClaimResult =
  | { status: "assigned"; parcel: ClaimedParcel; subdivision?: SubdivisionReport }
  | { status: "waitlisted"; reason: "no assignable parcel remains" };

/** How a cell is classified when it enters the registry. The whole of section 5.4, in one place. */
export function classify(
  landFraction: number,
  minLandFraction: number,
): { assignable: boolean; terminal: boolean } {
  return {
    assignable: landFraction >= minLandFraction,
    // Terminal means no land at all, not "too little land". Freezing at the threshold instead would
    // seal real islands inside cells that were merely too coarse to show them.
    terminal: landFraction === 0,
  };
}

// ── creating a planet ───────────────────────────────────────────────────────────

export async function createWorld(db: SqlClient, world: WorldRow): Promise<void> {
  await db.query(
    `insert into world_manifest (
       id, seed, terrain_version, radius_km, start_resolution, floor_resolution,
       trigger_fraction, land_fraction_target, min_land_fraction, commons_resolution,
       sea_level, peak_elevation, commons, reserved
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      world.id, world.seed, world.terrainVersion, world.radiusKm,
      world.startResolution, world.floorResolution, world.triggerFraction,
      world.landFractionTarget, world.minLandFraction, world.commonsResolution ?? world.startResolution,
      world.seaLevel, world.peakElevation, world.commons, world.reserved,
    ],
  );
}

/** Insert cells in batches, using array unnest rather than a statement per row. */
export async function insertCells(
  db: SqlClient,
  cells: readonly SeedCell[],
  minLandFraction: number,
  batchSize = 5000,
): Promise<{ inserted: number; assignable: number; terminal: number }> {
  let assignable = 0;
  let terminal = 0;

  for (let from = 0; from < cells.length; from += batchSize) {
    const batch = cells.slice(from, from + batchSize);
    const ids: string[] = [];
    const resolutions: number[] = [];
    const assignables: boolean[] = [];
    const terminals: boolean[] = [];
    const lands: number[] = [];

    for (const cell of batch) {
      const kind = classify(cell.landFraction, minLandFraction);
      ids.push(cell.h3Index);
      resolutions.push(getResolution(cell.h3Index));
      assignables.push(kind.assignable);
      terminals.push(kind.terminal);
      lands.push(cell.landFraction);
      if (kind.assignable) assignable++;
      if (kind.terminal) terminal++;
    }

    await db.query(
      `insert into unclaimed_cells (h3_index, resolution, assignable, terminal, land_fraction)
       select * from unnest($1::text[], $2::int[], $3::bool[], $4::bool[], $5::real[])
       on conflict (h3_index) do nothing`,
      [ids, resolutions, assignables, terminals, lands],
    );
  }

  return { inserted: cells.length, assignable, terminal };
}

/** Open a round over whatever is currently assignable. */
export async function openRound(db: SqlClient, n: number, resolution: number, triggerFraction: number): Promise<void> {
  const { rows } = await db.query<{ assignable: string }>(
    `select count(*)::text as assignable from unclaimed_cells where assignable`,
  );
  const inventory = Number(rows[0]!.assignable);
  // The round ends when the assignable pool falls TO the threshold, so the threshold is the floor
  // of the fraction and the round sells inventory minus threshold parcels.
  const triggerAt = Math.floor(triggerFraction * inventory);
  await db.query(
    `insert into rounds (n, resolution, inventory_at_start, trigger_at, assignable_remaining)
     values ($1, $2, $3, $4, $3)`,
    [n, resolution, inventory, triggerAt],
  );
}

// ── claiming ────────────────────────────────────────────────────────────────────

export interface ClaimInput {
  ownerId: string;
  world: WorldRow;
  /** Land fraction of a cell. Needed only when this claim has to restock the registry. */
  landFraction: (cell: string) => number;
}

/**
 * A stable lock key for one world, so claims and subdivisions can coordinate without a table.
 *
 * Advisory locks are the right tool here precisely because the thing being protected is not a row.
 * What has to be excluded is "a subdivision running while any claim is in flight", and there is no
 * row that means that.
 */
export function worldLockKey(worldId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < worldId.length; i++) {
    h ^= worldId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Keep it inside a signed 32 bit range so it is unambiguous as a bigint argument.
  return h & 0x7fffffff;
}

/**
 * Assign one parcel.
 *
 * THE SUBDIVISION CANNOT RUN INSIDE THE CLAIM TRANSACTION. The design document says the trigger
 * runs in one transaction, and it is right that the trigger must be atomic with the claim, or two
 * claims both believe they crossed the threshold. But the subdivision itself deletes every
 * non-terminal unclaimed row, and concurrent claims are holding row locks on exactly those rows.
 * Postgres detects the cycle and kills one of them:
 *
 *   ERROR: deadlock detected (40P01)
 *   Process A waits for ShareLock on transaction 2089, blocked by process B
 *   Process B waits for ExclusiveLock on a row of unclaimed_cells, blocked by process A
 *
 * That is not a tuning problem, it is the shape of the operation: restocking the shelves requires
 * exclusive use of the shelves. So the work is split, and an advisory lock does the excluding:
 *
 *   every claim holds a SHARED lock on the world for its transaction. Claims do not exclude
 *   each other, so they stay concurrent, and SKIP LOCKED keeps them from queueing on cells.
 *
 *   a subdivision takes the EXCLUSIVE lock, which waits for every in-flight claim to finish and
 *   makes every later claim wait for it. For that moment the registry is closed for restocking.
 *
 * A claim that arrives after a round closed but before its successor opened does not fail. It runs
 * the pending subdivision itself, under the exclusive lock, and retries. If another process got
 * there first, its subdivision finds nothing to do and the retry simply succeeds. The user waits;
 * nobody sees an error.
 */
export async function claimParcel(db: SqlClient, input: ClaimInput): Promise<ClaimResult> {
  let subdivision: SubdivisionReport | undefined;

  // Three attempts covers a claim that arrives mid restock and one unlucky retry after it.
  for (let attempt = 0; attempt < 3; attempt++) {
    const outcome = await attemptClaim(db, input);
    if (outcome.kind === "done") {
      return outcome.result.status === "assigned" && subdivision
        ? { ...outcome.result, subdivision }
        : outcome.result;
    }
    const ran = await runPendingSubdivision(db, input.world, input.landFraction);
    if (ran) subdivision = ran;
  }
  throw new Error("the registry subdivided repeatedly under one claim");
}

type Attempt = { kind: "done"; result: ClaimResult } | { kind: "needs-subdivision" };

async function attemptClaim(db: SqlClient, input: ClaimInput): Promise<Attempt> {
  const { ownerId, world } = input;
  const key = worldLockKey(world.id);

  await db.query("begin");
  try {
    // Shared: concurrent with other claims, excluded by a running subdivision.
    await db.query("select pg_advisory_xact_lock_shared($1)", [key]);

    // Section 7.1, verbatim. SKIP LOCKED is what makes this safe under concurrency: a claim that
    // lands on a row another claim already holds moves to the next one instead of queueing.
    const picked = await db.query<{ h3_index: string; resolution: number; land_fraction: number }>(
      `with picked as (
         select h3_index from unclaimed_cells
          where assignable
          order by random()
          limit 1
          for update skip locked
       )
       delete from unclaimed_cells u using picked p
        where u.h3_index = p.h3_index
        returning u.h3_index, u.resolution, u.land_fraction`,
    );

    if (picked.rows.length === 0) {
      // Either the planet is sold out, or a round has closed and its inventory is not here yet.
      const open = await db.query(`select 1 from rounds where closed_at is null`);
      if (open.rows.length === 0) {
        await db.query("rollback");
        return { kind: "needs-subdivision" };
      }
      await db.query(
        `insert into landless_waitlist (user_id) values ($1) on conflict (user_id) do nothing`,
        [ownerId],
      );
      await db.query("commit");
      return { kind: "done", result: { status: "waitlisted", reason: "no assignable parcel remains" } };
    }

    const cell = picked.rows[0]!;

    // One statement, so the read and the decrement cannot be split by another transaction, and only
    // one claim can ever be the one that crosses.
    const round = await db.query<{
      n: number; resolution: number; assignable_remaining: number; trigger_at: number;
    }>(
      `update rounds
          set assignable_remaining = assignable_remaining - 1, version = version + 1
        where closed_at is null
        returning n, resolution, assignable_remaining, trigger_at`,
    );
    if (round.rows.length === 0) {
      // The round closed between the pick and here. Roll back, which puts the cell back.
      await db.query("rollback");
      return { kind: "needs-subdivision" };
    }
    const open = round.rows[0]!;
    const areaKm2 = cellAreaKm2(cell.h3_index, world.radiusKm);

    await db.query(
      `insert into parcels (h3_index, resolution, owner_id, round_assigned, land_fraction, area_km2)
       values ($1, $2, $3, $4, $5, $6)`,
      [cell.h3_index, cell.resolution, ownerId, open.n, cell.land_fraction, areaKm2],
    );

    // Closing the round IS atomic with the claim. Only the restocking is deferred.
    const atFloor = open.resolution >= world.floorResolution;
    if (!atFloor && open.assignable_remaining <= open.trigger_at) {
      await db.query(`update rounds set closed_at = now() where n = $1 and closed_at is null`, [open.n]);
    }

    await db.query("commit");
    return {
      kind: "done",
      result: {
        status: "assigned",
        parcel: {
          h3Index: cell.h3_index,
          resolution: cell.resolution,
          landFraction: cell.land_fraction,
          areaKm2,
          roundAssigned: open.n,
        },
      },
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

/**
 * Restock the registry after a round has closed. Safe to call from anywhere, at any time.
 *
 * Takes the exclusive world lock, so it runs alone. If there is no closed round waiting for its
 * successor it does nothing and returns null, which is what makes it safe to call speculatively
 * from every claim that finds the shelves empty.
 */
export async function runPendingSubdivision(
  db: SqlClient,
  world: WorldRow,
  landFraction: (cell: string) => number,
): Promise<SubdivisionReport | null> {
  const began = nowMillis();
  await db.query("begin");
  try {
    await db.query("select pg_advisory_xact_lock($1)", [worldLockKey(world.id)]);

    const pending = await db.query<{ n: number; resolution: number }>(
      `select n, resolution from rounds r
        where closed_at is not null
          and not exists (select 1 from rounds later where later.n = r.n + 1)
        order by n desc limit 1`,
    );
    if (pending.rows.length === 0) {
      await db.query("commit");
      return null;
    }

    const { n, resolution } = pending.rows[0]!;
    if (resolution >= world.floorResolution) {
      // The floor round is closed and there is nothing finer to split into. Leave it closed.
      await db.query("commit");
      return null;
    }

    const parents = await db.query<{ h3_index: string }>(
      `select h3_index from unclaimed_cells where not terminal and resolution = $1`,
      [resolution],
    );

    const children: SeedCell[] = [];
    for (const parent of parents.rows) {
      for (const child of cellToChildren(parent.h3_index, resolution + 1)) {
        children.push({ h3Index: child, landFraction: landFraction(child) });
      }
    }

    await db.query(`delete from unclaimed_cells where not terminal and resolution = $1`, [resolution]);
    const inserted = await insertCells(db, children, world.minLandFraction);
    await openRound(db, n + 1, resolution + 1, world.triggerFraction);

    await db.query("commit");
    return {
      round: n,
      fromResolution: resolution,
      toResolution: resolution + 1,
      parentsSubdivided: parents.rows.length,
      inserted: inserted.inserted,
      newlyAssignable: inserted.assignable,
      newlyTerminal: inserted.terminal,
      millis: nowMillis() - began,
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

/** Wall clock, isolated so the pure paths above stay easy to reason about. */
function nowMillis(): number {
  return Date.now();
}

// ── reading the registry ────────────────────────────────────────────────────────

export interface RegistryStats {
  parcels: number;
  unclaimed: number;
  assignable: number;
  terminal: number;
  openRound: { n: number; resolution: number; assignableRemaining: number; triggerAt: number } | null;
  waitlisted: number;
}

export async function registryStats(db: SqlClient): Promise<RegistryStats> {
  const counts = await db.query<{
    parcels: string; unclaimed: string; assignable: string; terminal: string; waitlisted: string;
  }>(
    `select
       (select count(*) from parcels)::text as parcels,
       (select count(*) from unclaimed_cells)::text as unclaimed,
       (select count(*) from unclaimed_cells where assignable)::text as assignable,
       (select count(*) from unclaimed_cells where terminal)::text as terminal,
       (select count(*) from landless_waitlist)::text as waitlisted`,
  );
  const round = await db.query<{
    n: number; resolution: number; assignable_remaining: number; trigger_at: number;
  }>(`select n, resolution, assignable_remaining, trigger_at from rounds where closed_at is null`);

  const c = counts.rows[0]!;
  return {
    parcels: Number(c.parcels),
    unclaimed: Number(c.unclaimed),
    assignable: Number(c.assignable),
    terminal: Number(c.terminal),
    waitlisted: Number(c.waitlisted),
    openRound: round.rows[0]
      ? {
          n: round.rows[0].n,
          resolution: round.rows[0].resolution,
          assignableRemaining: round.rows[0].assignable_remaining,
          triggerAt: round.rows[0].trigger_at,
        }
      : null,
  };
}

/**
 * Every cell the registry holds, parcels and unclaimed alike, plus what was reserved.
 *
 * This is what the section 8 invariant runs over. It materialises the whole registry, which is fine
 * at the scale of a scheduled job and is not something to put on a request path.
 */
export async function registryCover(db: SqlClient, world: WorldRow): Promise<string[]> {
  const parcels = await db.query<{ h3_index: string }>(`select h3_index from parcels`);
  const unclaimed = await db.query<{ h3_index: string }>(`select h3_index from unclaimed_cells`);
  return [
    ...parcels.rows.map((r) => r.h3_index),
    ...unclaimed.rows.map((r) => r.h3_index),
    ...world.reserved,
  ];
}
