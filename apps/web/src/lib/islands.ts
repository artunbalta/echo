/**
 * Island ownership + placement (the endless-world vision; BUILD-PLAN §7 groundwork). Islands sit
 * on an infinite hex lattice; a new signup claims the EMPTY cell nearest the most-recent signup,
 * so the world grows in clusters around recent arrivals rather than scattering. Server-only —
 * uses the Supabase service-role client. A no-op when Supabase isn't configured.
 *
 * Live multiplayer (rendering and visiting other players' actual islands) comes later; this is
 * the persistent ownership graph it will read from.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Cell {
  q: number;
  r: number;
}

/** Deterministic positive int seed for a cell's procedural island shape. */
export function cellSeed(q: number, r: number): number {
  let h = 2166136261 >>> 0;
  for (const n of [q, r]) {
    h ^= n & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 1_000_000;
}

// Axial hex directions (q, r).
const DIRS: Cell[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

/** The cells exactly `radius` rings out from `center` (axial hex ring walk). */
function* hexRing(center: Cell, radius: number): Generator<Cell> {
  if (radius <= 0) {
    yield center;
    return;
  }
  let cell = { q: center.q + DIRS[4].q * radius, r: center.r + DIRS[4].r * radius };
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      yield { q: cell.q, r: cell.r };
      cell = { q: cell.q + DIRS[i].q, r: cell.r + DIRS[i].r };
    }
  }
}

/** The nearest cell to `from` not in `taken` (spiral outward; endless). */
export function nearestEmptyCell(from: Cell, taken: Set<string>, maxRadius = 128): Cell {
  for (let k = 1; k <= maxRadius; k++) {
    for (const c of hexRing(from, k)) {
      if (!taken.has(`${c.q},${c.r}`)) return c;
    }
  }
  return { q: from.q + 1, r: from.r }; // unreachable in practice
}

/**
 * Claim an island for a freshly-registered user: the empty cell nearest the last signup (or the
 * origin for the very first user). Retries on the unique-cell race. Returns the claimed cell, or
 * null if persistence is unavailable / it ultimately failed (signup still succeeds — best-effort).
 */
export async function claimIslandForUser(
  admin: SupabaseClient,
  userId: string,
  name?: string,
): Promise<(Cell & { seed: number }) | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: rows, error } = await admin
      .from("islands")
      .select("cell_q,cell_r,claimed_at")
      .order("claimed_at", { ascending: false })
      .limit(2000);
    if (error) return null;

    const taken = new Set((rows ?? []).map((row) => `${row.cell_q},${row.cell_r}`));
    let target: Cell;
    if (!rows || rows.length === 0) {
      target = { q: 0, r: 0 }; // the first islander anchors the world at the origin
    } else {
      const last = { q: rows[0].cell_q as number, r: rows[0].cell_r as number };
      target = nearestEmptyCell(last, taken); // the empty cell nearest the most-recent signup
    }

    const seed = cellSeed(target.q, target.r);
    const { error: insErr } = await admin
      .from("islands")
      .insert({ cell_q: target.q, cell_r: target.r, owner_user_id: userId, seed, name: name ?? null });
    if (!insErr) return { ...target, seed };
    // 23505 = unique violation → someone took this cell between read and write; re-pick.
    if (!/duplicate|unique|23505/i.test(insErr.message)) return null;
  }
  return null;
}
