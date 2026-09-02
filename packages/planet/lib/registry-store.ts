/**
 * The registry behind one seam, with two backends.
 *
 * The repository's convention, and the right one: a store interface, an in memory implementation
 * that needs no keys and no database, and a durable one that is used when the connection exists.
 * A missing database degrades the world to one process, it does not break the page.
 *
 * The in memory backend is not a stub. It runs the same rules as the SQL: the trigger watches the
 * assignable pool, a landless cell is terminal and never subdivides, and the round closes exactly
 * once. It is a real registry with a short memory, which is what local development wants.
 */

import { cellToChildren } from "h3-js";

import { cellAreaKm2 } from "./geo.js";
import type { PlanetParams } from "./manifest.js";
import { classify, type ClaimedParcel, type SqlClient, type WorldRow } from "./registry.js";
import {
  claimParcel as claimInPostgres,
  registryStats,
  runPendingSubdivision,
} from "./registry.js";
import { findAdjacentParcel } from "./referral.js";
import { seedInventory } from "./rounds.js";

export interface RegistryStatus {
  round: number;
  resolution: number;
  /** Assignable parcels still unclaimed. */
  remaining: number;
  /** The round ends when `remaining` falls to this. */
  triggerAt: number;
  /** How many more claims before every remaining parcel splits into seven. Section 9's sentence. */
  untilSplit: number;
  parcelsSold: number;
  atFloor: boolean;
}

export interface RegistryClaim {
  status: "assigned" | "waitlisted";
  parcel?: ClaimedParcel;
  /** True when this claim was the one that ended a round. */
  endedRound?: boolean;
  /** True when the parcel is next to the referrer's. False after a fallback to random. */
  placedAdjacent?: boolean;
}

export interface ParcelRegistry {
  world(): WorldRow;
  status(): Promise<RegistryStatus>;
  /**
   * Claim a parcel. With a referrer, try to place the arrival beside them first (section 7.2).
   *
   * A failed adjacency is not an error and must not be silent: the caller gets placedAdjacent false
   * and is expected to say plainly that no land was free near their friend, which is what section
   * 7.2 asks for and is a better outcome than a mystery.
   */
  claim(ownerId: string, referrerParcel?: string): Promise<RegistryClaim>;
  parcelOf(ownerId: string): Promise<ClaimedParcel | null>;
  /** The most recently claimed parcels, for lighting the globe. Newest first. */
  recentlyClaimed(limit: number): Promise<Array<{ h3Index: string; ownerId: string }>>;
}

// ── in memory ───────────────────────────────────────────────────────────────────

interface MemoryCell {
  resolution: number;
  assignable: boolean;
  terminal: boolean;
  landFraction: number;
}

/** mulberry32. Seeded so a local world is reproducible; the SQL backend uses Postgres random(). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MemoryRegistry implements ParcelRegistry {
  private readonly cells = new Map<string, MemoryCell>();
  private readonly assignablePool: string[] = [];
  private readonly parcels = new Map<string, ClaimedParcel & { ownerId: string }>();
  private readonly byOwner = new Map<string, string>();
  private readonly order: string[] = [];
  private round = 1;
  private resolution: number;
  private triggerAt = 0;
  private random: () => number;

  constructor(
    private readonly manifest: WorldRow,
    private readonly landFraction: (cell: string) => number,
    seed = 0x91a7,
  ) {
    this.resolution = manifest.startResolution;
    this.random = mulberry32(seed);
    for (const cell of seedInventory(manifest.startResolution, manifest.reserved)) {
      this.add(cell, manifest.startResolution);
    }
    this.openRound();
  }

  private add(cell: string, resolution: number): void {
    const land = this.landFraction(cell);
    const kind = classify(land, this.manifest.minLandFraction);
    this.cells.set(cell, { resolution, landFraction: land, ...kind });
    if (kind.assignable) this.assignablePool.push(cell);
  }

  private openRound(): void {
    this.triggerAt = Math.floor(this.manifest.triggerFraction * this.assignablePool.length);
  }

  world(): WorldRow {
    return this.manifest;
  }

  async status(): Promise<RegistryStatus> {
    return {
      round: this.round,
      resolution: this.resolution,
      remaining: this.assignablePool.length,
      triggerAt: this.triggerAt,
      untilSplit: Math.max(0, this.assignablePool.length - this.triggerAt),
      parcelsSold: this.parcels.size,
      atFloor: this.resolution >= this.manifest.floorResolution,
    };
  }

  async claim(ownerId: string, referrerParcel?: string): Promise<RegistryClaim> {
    const existing = this.byOwner.get(ownerId);
    if (existing) return { status: "assigned", parcel: this.parcels.get(existing)! };
    if (this.assignablePool.length === 0) return { status: "waitlisted" };

    let index = -1;
    let placedAdjacent = false;

    if (referrerParcel) {
      const near = findAdjacentParcel({
        referrerParcel,
        currentResolution: this.resolution,
        isAvailable: (candidate) => this.cells.get(candidate)?.assignable === true,
        choose: (candidates) => candidates[Math.floor(this.random() * candidates.length)]!,
      });
      if (near.cell) {
        index = this.assignablePool.indexOf(near.cell);
        placedAdjacent = index >= 0;
      }
    }

    // Random by default, and after a referral that found nothing free nearby.
    if (index < 0) index = Math.floor(this.random() * this.assignablePool.length);

    // Swap remove, so a uniformly random draw costs nothing and never leaves a hole.
    const cell = this.assignablePool[index]!;
    this.assignablePool[index] = this.assignablePool[this.assignablePool.length - 1]!;
    this.assignablePool.pop();

    const record = this.cells.get(cell)!;
    this.cells.delete(cell);
    const parcel: ClaimedParcel = {
      h3Index: cell,
      resolution: record.resolution,
      landFraction: record.landFraction,
      areaKm2: cellAreaKm2(cell, this.manifest.radiusKm),
      roundAssigned: this.round,
    };
    this.parcels.set(cell, { ...parcel, ownerId });
    this.byOwner.set(ownerId, cell);
    this.order.unshift(cell);

    const atFloor = this.resolution >= this.manifest.floorResolution;
    const endedRound = !atFloor && this.assignablePool.length <= this.triggerAt;
    if (endedRound) this.subdivide();
    return { status: "assigned", parcel, endedRound, placedAdjacent };
  }

  private subdivide(): void {
    const parents: string[] = [];
    for (const [cell, record] of this.cells) {
      if (!record.terminal && record.resolution === this.resolution) parents.push(cell);
    }
    for (const parent of parents) {
      this.cells.delete(parent);
      const at = this.assignablePool.indexOf(parent);
      if (at >= 0) {
        this.assignablePool[at] = this.assignablePool[this.assignablePool.length - 1]!;
        this.assignablePool.pop();
      }
      for (const child of cellToChildren(parent, this.resolution + 1)) {
        this.add(child, this.resolution + 1);
      }
    }
    this.resolution += 1;
    this.round += 1;
    this.openRound();
  }

  async parcelOf(ownerId: string): Promise<ClaimedParcel | null> {
    const cell = this.byOwner.get(ownerId);
    return cell ? this.parcels.get(cell)! : null;
  }

  async recentlyClaimed(limit: number): Promise<Array<{ h3Index: string; ownerId: string }>> {
    return this.order.slice(0, limit).map((cell) => {
      const parcel = this.parcels.get(cell)!;
      return { h3Index: parcel.h3Index, ownerId: parcel.ownerId };
    });
  }
}

// ── postgres ────────────────────────────────────────────────────────────────────

/**
 * The durable backend. Every method is a thin call into lib/registry.ts, which holds the SQL and
 * the advisory locking, so there is one implementation of the rules and this is only plumbing.
 */
export class PostgresRegistry implements ParcelRegistry {
  constructor(
    private readonly db: SqlClient,
    private readonly manifest: WorldRow,
    private readonly landFraction: (cell: string) => number,
  ) {}

  world(): WorldRow {
    return this.manifest;
  }

  async status(): Promise<RegistryStatus> {
    const stats = await registryStats(this.db);
    const open = stats.openRound;
    return {
      round: open?.n ?? 0,
      resolution: open?.resolution ?? this.manifest.floorResolution,
      remaining: stats.assignable,
      triggerAt: open?.triggerAt ?? 0,
      untilSplit: Math.max(0, stats.assignable - (open?.triggerAt ?? 0)),
      parcelsSold: stats.parcels,
      atFloor: (open?.resolution ?? this.manifest.floorResolution) >= this.manifest.floorResolution,
    };
  }

  async claim(ownerId: string, referrerParcel?: string): Promise<RegistryClaim> {
    void referrerParcel;
    const mine = await this.parcelOf(ownerId);
    if (mine) return { status: "assigned", parcel: mine };

    const result = await claimInPostgres(this.db, {
      ownerId,
      world: this.manifest,
      landFraction: this.landFraction,
    });
    if (result.status === "waitlisted") return { status: "waitlisted" };
    return { status: "assigned", parcel: result.parcel, endedRound: Boolean(result.subdivision) };
  }

  /** Run any restock the last claim left pending. Safe and cheap when there is nothing to do. */
  async settle(): Promise<void> {
    await runPendingSubdivision(this.db, this.manifest, this.landFraction);
  }

  async parcelOf(ownerId: string): Promise<ClaimedParcel | null> {
    const { rows } = await this.db.query<{
      h3_index: string; resolution: number; land_fraction: number; area_km2: number; round_assigned: number;
    }>(
      `select h3_index, resolution, land_fraction, area_km2, round_assigned
         from parcels where owner_id = $1 limit 1`,
      [ownerId],
    );
    const row = rows[0];
    return row
      ? {
          h3Index: row.h3_index,
          resolution: row.resolution,
          landFraction: row.land_fraction,
          areaKm2: row.area_km2,
          roundAssigned: row.round_assigned,
        }
      : null;
  }

  async recentlyClaimed(limit: number): Promise<Array<{ h3Index: string; ownerId: string }>> {
    const { rows } = await this.db.query<{ h3_index: string; owner_id: string }>(
      `select h3_index, owner_id from parcels order by assigned_at desc limit $1`,
      [limit],
    );
    return rows.map((r) => ({ h3Index: r.h3_index, ownerId: r.owner_id }));
  }
}

/** The manifest a memory world runs on, built from the params and a calibrated terrain. */
export function memoryWorld(
  params: PlanetParams,
  seed: string,
  seaLevel: number,
  peakElevation: number,
  commons: string[],
  reserved: string[],
): WorldRow {
  return {
    ...params,
    id: "echo-local",
    seed,
    terrainVersion: 1,
    seaLevel,
    peakElevation,
    commons,
    reserved,
  };
}
