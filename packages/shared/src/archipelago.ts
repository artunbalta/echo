/**
 * The archipelago — one shared ocean coordinate space holding a bounded field of island
 * slots. This is the macro layout the whole 7-flow arc sits on (ECHO_level_design_7flows.md
 * §1 of the build prompt): every signed-in user OWNS one island (their solitary F0/F1 home),
 * and neighbours-by-coordinate become each other's first crossing in F2.
 *
 * Two design goals, resolved here as pure geometry + a pure placement rule:
 *
 *   1. Stable, deterministic slots. 100 slots are pre-generated at world init, each with a
 *      fixed (x,y) in the ocean and a deterministic terrain seed. The layout function is
 *      defined for ANY index ≥ 0, so the field can lazily expand past 100 (documented below)
 *      rather than silently capping — we never have to throw a user into the void.
 *
 *   2. No one wakes in an empty ocean. New users are placed in the EMPTY slot nearest the
 *      most-recently-joined user's island, so the world grows as a tight CLUSTER around the
 *      latest arrival instead of scattering — the cold-start fix. (This is the bounded,
 *      coordinate-bearing successor to lib/islands.ts's endless hex-lattice claim.)
 *
 * This module is PURE (no I/O, no clock, no randomness) so it is trivially unit-testable and
 * identical on the web app, the realtime server, and in tests. Persistence (Supabase / the
 * in-memory zero-key fallback) is layered on top via the IslandStore interface.
 */

// ── ocean geometry ──────────────────────────────────────────────────────────────

/** Number of slots pre-generated at world init. Not a hard cap — see {@link islandSlot}. */
export const ARCHIPELAGO_SIZE = 100;

export const OCEAN = {
  /** The pre-generated slot count. */
  SIZE: ARCHIPELAGO_SIZE,
  /** Radial spacing constant for the phyllotaxis layout, in ocean tiles. */
  SPACING: 6,
  /** Ocean extent in tiles (square). Centre is (EXTENT/2, EXTENT/2). Sized so all 100
   *  pre-generated slots fall comfortably inside with margin (outer radius ≈ 6·√99 ≈ 60). */
  EXTENT: 128,
} as const;

/** The golden angle (rad) — Vogel's phyllotaxis spiral packs points in a disk with
 *  near-uniform density and no two coincident, indexed centre-outward. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface IslandSlot {
  /** Stable slot index (0 = ocean centre, growing outward). */
  index: number;
  /** Ocean-tile coordinates (continuous; the renderer maps these to world space). */
  x: number;
  y: number;
  /** Deterministic positive int seed for this slot's procedural terrain. */
  seed: number;
}

/** Deterministic FNV-1a seed for a slot index (same family as lib/islands.cellSeed). */
export function slotSeed(index: number): number {
  let h = 2166136261 >>> 0;
  // Mix the two 16-bit halves of the index so neighbouring indices get unrelated seeds.
  for (const n of [index & 0xffff, (index >>> 16) & 0xffff]) {
    h ^= n;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 1_000_000;
}

/**
 * The slot at `index`, computed from the phyllotaxis spiral. Defined for ANY index ≥ 0:
 * indices ≥ ARCHIPELAGO_SIZE are valid lazily-instantiated slots that simply sit further out
 * (the field expands rather than capping). Coordinates and seed are pure functions of index,
 * so a slot is identical everywhere and forever.
 */
export function islandSlot(index: number): IslandSlot {
  const r = OCEAN.SPACING * Math.sqrt(index);
  const theta = index * GOLDEN_ANGLE;
  const cx = OCEAN.EXTENT / 2;
  const cy = OCEAN.EXTENT / 2;
  return {
    index,
    x: cx + r * Math.cos(theta),
    y: cy + r * Math.sin(theta),
    seed: slotSeed(index),
  };
}

/** The pre-generated archipelago of {@link ARCHIPELAGO_SIZE} slots. */
export function archipelagoSlots(): IslandSlot[] {
  return Array.from({ length: ARCHIPELAGO_SIZE }, (_, i) => islandSlot(i));
}

/** Euclidean distance between two slot indices in ocean tiles. */
export function slotDistance(a: number, b: number): number {
  const sa = islandSlot(a);
  const sb = islandSlot(b);
  return Math.hypot(sa.x - sb.x, sa.y - sb.y);
}

/**
 * The empty slot nearest `fromIndex` (Euclidean over ocean coordinates). Scans the
 * pre-generated field first; if every pre-generated slot is taken, it lazily expands the
 * field (indices ≥ ARCHIPELAGO_SIZE) until it finds room — so a full archipelago grows a new
 * outer ring rather than rejecting the user. Ties broken by lower index (determinism).
 */
export function nearestEmptySlot(
  fromIndex: number,
  taken: ReadonlySet<number>,
  opts: { searchCap?: number } = {},
): number {
  const from = islandSlot(fromIndex);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ARCHIPELAGO_SIZE; i++) {
    if (taken.has(i)) continue;
    const s = islandSlot(i);
    const d = Math.hypot(s.x - from.x, s.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) return best;

  // Field is full → lazily expand outward (documented policy: expand, never cap).
  const cap = opts.searchCap ?? ARCHIPELAGO_SIZE * 8;
  for (let i = ARCHIPELAGO_SIZE; i < cap; i++) {
    if (!taken.has(i)) return i;
  }
  // Unreachable in practice (cap is enormous); fall back to the next index after `from`.
  return fromIndex + 1;
}

/**
 * The slot SPATIALLY nearest `fromIndex` (excluding it). Index proximity ≠ spatial proximity under
 * the phyllotaxis layout (index+1 is a golden-angle turn away, index+2 two turns out), so the travel
 * stand's "near shore" must be chosen by Euclidean distance — not index arithmetic — to match the
 * server's authoritative far-vs-near classification (which uses {@link slotDistance}).
 */
export function nearestSlot(fromIndex: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ARCHIPELAGO_SIZE; i++) {
    if (i === fromIndex) continue;
    const d = slotDistance(fromIndex, i);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : (fromIndex + 1) % ARCHIPELAGO_SIZE;
}

// ── placement (pure) ──────────────────────────────────────────────────────────────

/** One user→island assignment. `joinedAt` is the epoch-ms timestamp of first claim. */
export interface IslandAssignment {
  userId: string;
  slotIndex: number;
  /** When this user first claimed their island. Drives the "most-recently-joined" anchor. */
  joinedAt: number;
}

/** A snapshot of who owns what — the pure placement core operates on this, never on I/O. */
export interface RegistryState {
  /** Active assignments. */
  assignments: IslandAssignment[];
}

export interface PlacementResult {
  slotIndex: number;
  /** True when this call created a NEW assignment; false when the user already owned a slot. */
  created: boolean;
  /** The next registry state (the input is never mutated). */
  next: RegistryState;
  /** The slot a new user was clustered against (its owner is the most-recently-joined). */
  anchorSlot: number | null;
}

/**
 * Place (or look up) a user's island — the single placement rule, pure and deterministic.
 *
 * Policy (documented for §2 of the build prompt):
 *   • Returning user → keeps their slot. If `userId` is already assigned we return it
 *     unchanged; we never reassign or re-anchor the field around a returning user.
 *   • First user ever → ocean centre (slot 0).
 *   • New user → the EMPTY slot nearest the MOST-RECENTLY-JOINED user's island. We define
 *     "most-recently-joined" as the active assignment with the greatest `joinedAt` (the most
 *     recent *first claim*). We deliberately anchor on first-claim time, not latest session,
 *     so the cluster grows around genuine new arrivals and is order-deterministic; a returning
 *     user logging back in does not yank the growth frontier to their old island.
 *   • Archipelago full → {@link nearestEmptySlot} lazily expands the field (never caps).
 *
 * `now` is injected (no internal clock) so placement is pure and reproducible in tests.
 */
export function placeUser(state: RegistryState, userId: string, now: number): PlacementResult {
  const existing = state.assignments.find((a) => a.userId === userId);
  if (existing) {
    return { slotIndex: existing.slotIndex, created: false, next: state, anchorSlot: null };
  }

  const taken = new Set(state.assignments.map((a) => a.slotIndex));
  let slotIndex: number;
  let anchorSlot: number | null;

  if (state.assignments.length === 0) {
    slotIndex = 0; // the first islander anchors the world at the ocean centre
    anchorSlot = null;
  } else {
    // most-recently-joined active user (greatest joinedAt; ties → greatest slotIndex for
    // determinism — a later-placed slot has the larger index under nearest-empty growth).
    const anchor = state.assignments.reduce((a, b) =>
      b.joinedAt > a.joinedAt || (b.joinedAt === a.joinedAt && b.slotIndex > a.slotIndex) ? b : a,
    );
    anchorSlot = anchor.slotIndex;
    slotIndex = nearestEmptySlot(anchor.slotIndex, taken);
  }

  const assignment: IslandAssignment = { userId, slotIndex, joinedAt: now };
  return {
    slotIndex,
    created: true,
    anchorSlot,
    next: { assignments: [...state.assignments, assignment] },
  };
}

/** Release a user's slot (e.g. account deletion) so it can be reused by a future arrival. */
export function releaseUser(state: RegistryState, userId: string): RegistryState {
  return { assignments: state.assignments.filter((a) => a.userId !== userId) };
}

// ── persistence seam ──────────────────────────────────────────────────────────────

/**
 * The persistence seam. The pure placement core above is wrapped by a store: an in-memory
 * one (zero-key local dev) or a Supabase-backed one (web app). Both implement this interface
 * so the same placement logic runs against either.
 */
export interface IslandStore {
  /** Load the full registry snapshot the placement core needs. */
  load(): Promise<RegistryState>;
  /** Persist a newly-created assignment. Returns false if the slot was taken concurrently. */
  persist(assignment: IslandAssignment): Promise<boolean>;
  /** Remove a user's assignment (erasure / slot reuse). */
  remove(userId: string): Promise<void>;
}

/** Zero-dependency in-memory store — the zero-key fallback. Process-lifetime durable. */
export class InMemoryIslandStore implements IslandStore {
  private assignments = new Map<string, IslandAssignment>();

  async load(): Promise<RegistryState> {
    return { assignments: [...this.assignments.values()] };
  }

  async persist(assignment: IslandAssignment): Promise<boolean> {
    // Reject if some other user grabbed the slot first (mirrors the Supabase unique race).
    for (const a of this.assignments.values()) {
      if (a.slotIndex === assignment.slotIndex && a.userId !== assignment.userId) return false;
    }
    this.assignments.set(assignment.userId, assignment);
    return true;
  }

  async remove(userId: string): Promise<void> {
    this.assignments.delete(userId);
  }
}

/**
 * Assign-or-look-up a user's island against a store, retrying on the slot-claim race. This is
 * the single entry point the app/server calls; it composes the pure {@link placeUser} core
 * with whatever {@link IslandStore} is configured.
 */
export async function assignIsland(
  store: IslandStore,
  userId: string,
  now: number,
  maxAttempts = 4,
): Promise<IslandSlot & { created: boolean; anchorSlot: number | null }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const state = await store.load();
    const result = placeUser(state, userId, now);
    if (!result.created) {
      return { ...islandSlot(result.slotIndex), created: false, anchorSlot: null };
    }
    const ok = await store.persist({ userId, slotIndex: result.slotIndex, joinedAt: now });
    if (ok) {
      return { ...islandSlot(result.slotIndex), created: true, anchorSlot: result.anchorSlot };
    }
    // Lost the race for this slot — reload and re-pick.
  }
  // Exhausted retries (pathological contention); place at a far expansion slot as a backstop.
  const fallback = ARCHIPELAGO_SIZE + Math.abs(hashUserId(userId)) % ARCHIPELAGO_SIZE;
  await store.persist({ userId, slotIndex: fallback, joinedAt: now });
  return { ...islandSlot(fallback), created: true, anchorSlot: null };
}

/** Stable hash of a userId, for the contention backstop above. */
function hashUserId(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}
