/**
 * User → island assignment (ECHO_level_design_7flows.md §2), composed from the PURE placement
 * core in @echo/shared (archipelago.ts). Two backends behind one interface:
 *
 *   • InMemoryIslandStore — the ZERO-KEY fallback. A process-lifetime singleton, so two browser
 *     tabs in local dev get clustered neighbours with no database. (Invariant 1.)
 *   • SupabaseIslandStore — durable assignment in the `islands` table (slot_index), used when the
 *     service-role client is configured. Supabase only *upgrades* (persistence); its absence
 *     never breaks placement.
 *
 * The placement RULE (first user → centre; new user → empty slot nearest the most-recently-joined
 * island; returning user → keeps their slot; full field → lazy-expand) lives in archipelago.ts and
 * is the same in both backends and in the unit test. Server-only.
 */
import "server-only";
import {
  assignIsland,
  islandSlot,
  InMemoryIslandStore,
  type IslandStore,
  type RegistryState,
  type IslandAssignment,
} from "@echo/shared";
import { adminClient } from "@/lib/supabaseAdmin";

export interface IslandPlacement {
  slotIndex: number;
  x: number;
  y: number;
  seed: number;
  created: boolean;
  /** The most-recently-joined island this user clustered against (null for the first/returning). */
  anchorSlot: number | null;
  persistence: "supabase" | "memory";
}

// Process-lifetime in-memory store — the zero-key source of truth for local dev.
const memoryStore = new InMemoryIslandStore();

/** Supabase-backed store over the `islands` table (slot_index). Best-effort; errors bubble so
 *  the caller can fall back to the in-memory store rather than failing a sign-in. */
class SupabaseIslandStore implements IslandStore {
  constructor(private admin: NonNullable<ReturnType<typeof adminClient>>) {}

  async load(): Promise<RegistryState> {
    const { data, error } = await this.admin
      .from("islands")
      .select("owner_user_id,slot_index,claimed_at")
      .not("slot_index", "is", null)
      .not("owner_user_id", "is", null);
    if (error) throw error;
    const assignments: IslandAssignment[] = (data ?? []).map((r) => ({
      userId: String(r.owner_user_id),
      slotIndex: Number(r.slot_index),
      joinedAt: r.claimed_at ? Date.parse(r.claimed_at as string) : 0,
    }));
    return { assignments };
  }

  async persist(a: IslandAssignment): Promise<boolean> {
    const slot = islandSlot(a.slotIndex);
    const { error } = await this.admin.from("islands").insert({
      owner_user_id: a.userId,
      slot_index: a.slotIndex,
      seed: slot.seed,
      claimed_at: new Date(a.joinedAt).toISOString(),
    });
    if (!error) return true;
    // 23505 = unique violation → the slot was claimed between load and insert; re-pick.
    if (/duplicate|unique|23505/i.test(error.message)) return false;
    throw error;
  }

  async remove(userId: string): Promise<void> {
    await this.admin.from("islands").delete().eq("owner_user_id", userId);
  }
}

/** Assign (or look up) a user's home island. Tries Supabase when configured, then falls back to
 *  the in-memory store so a sign-in always lands the user on a real, clustered island. */
export async function assignIslandForUser(userId: string): Promise<IslandPlacement> {
  const admin = adminClient();
  if (admin) {
    try {
      const r = await assignIsland(new SupabaseIslandStore(admin), userId, Date.now());
      return { slotIndex: r.index, x: r.x, y: r.y, seed: r.seed, created: r.created,
               anchorSlot: r.anchorSlot, persistence: "supabase" };
    } catch (err) {
      console.warn("[island-registry] Supabase placement failed, using in-memory:", (err as Error).message);
    }
  }
  const r = await assignIsland(memoryStore, userId, Date.now());
  return { slotIndex: r.index, x: r.x, y: r.y, seed: r.seed, created: r.created,
           anchorSlot: r.anchorSlot, persistence: "memory" };
}
