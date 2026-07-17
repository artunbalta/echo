/**
 * Island day-state persistence (P1 / blueprint VII.4) — composes the PURE state core in
 * @echo/shared (islandState.ts) with two backends behind the shared IslandStateStore seam,
 * exactly mirroring island-registry.ts:
 *
 *   • InMemoryIslandStateStore — the ZERO-KEY fallback. Process-lifetime singleton, so local
 *     dev keeps your island across page reloads with no database.
 *   • SupabaseIslandStateStore — durable state in the `island_state` table (0006 migration),
 *     used when the service-role client is configured. Its absence never breaks the day.
 *
 * Wall-clock decay (crops wilt, structures weather, ties cool) is applied ON LOAD here —
 * the single seam every session passes through — then persisted, so decay compounds exactly
 * once per absence regardless of backend. Server-only.
 */
import "server-only";
import {
  applyWallClockDecay,
  freshIslandState,
  InMemoryIslandStateStore,
  type IslandDayState,
  type IslandStateStore,
} from "@echo/shared";
import { adminClient } from "@/lib/supabaseAdmin";

// Process-lifetime in-memory store — the zero-key source of truth for local dev. Stashed on
// globalThis so Next dev's module reloads (every route cold-compile) don't wipe the island
// between requests — the same reason dev database singletons live on globalThis.
const g = globalThis as unknown as { __echoIslandStateStore?: InMemoryIslandStateStore };
const memoryStore = (g.__echoIslandStateStore ??= new InMemoryIslandStateStore());

class SupabaseIslandStateStore implements IslandStateStore {
  constructor(private admin: NonNullable<ReturnType<typeof adminClient>>) {}

  async load(userId: string): Promise<IslandDayState | null> {
    const { data, error } = await this.admin
      .from("island_state")
      .select("state")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.state as IslandDayState) ?? null;
  }

  async save(userId: string, state: IslandDayState): Promise<void> {
    const { error } = await this.admin
      .from("island_state")
      .upsert({ user_id: userId, state, updated_at: new Date(state.updatedAt).toISOString() });
    if (error) throw error;
  }

  async remove(userId: string): Promise<void> {
    await this.admin.from("island_state").delete().eq("user_id", userId);
  }
}

function storeFor(): { store: IslandStateStore; persistence: "supabase" | "memory" } {
  const admin = adminClient();
  if (admin) return { store: new SupabaseIslandStateStore(admin), persistence: "supabase" };
  return { store: memoryStore, persistence: "memory" };
}

export interface LoadedIslandState {
  state: IslandDayState;
  /** In-tone "what changed while you were gone" lines (the honest return hook, M5). */
  changes: string[];
  /** True when this user had no island state yet (their first morning). */
  fresh: boolean;
  persistence: "supabase" | "memory";
}

/** Load a user's island, applying wall-clock decay exactly once and persisting the result.
 *  Falls back to the in-memory store on any Supabase error — the day always loads. */
export async function loadIslandState(userId: string, now = Date.now()): Promise<LoadedIslandState> {
  const { store, persistence } = storeFor();
  try {
    const prior = await store.load(userId);
    if (!prior) {
      const state = freshIslandState(now);
      await store.save(userId, state);
      return { state, changes: [], fresh: true, persistence };
    }
    const { state, changes } = applyWallClockDecay(prior, now);
    if (changes.length || state.updatedAt !== prior.updatedAt) await store.save(userId, state);
    return { state, changes, fresh: false, persistence };
  } catch (err) {
    console.warn("[island-state] load failed, using in-memory:", (err as Error).message);
    const prior = await memoryStore.load(userId);
    if (!prior) {
      const state = freshIslandState(now);
      await memoryStore.save(userId, state);
      return { state, changes: [], fresh: true, persistence: "memory" };
    }
    const { state, changes } = applyWallClockDecay(prior, now);
    await memoryStore.save(userId, state);
    return { state, changes, fresh: false, persistence: "memory" };
  }
}

/** Persist a closed day (or any state change). Best-effort dual-write on Supabase failure. */
export async function saveIslandState(userId: string, state: IslandDayState): Promise<"supabase" | "memory"> {
  const { store, persistence } = storeFor();
  try {
    await store.save(userId, state);
    return persistence;
  } catch (err) {
    console.warn("[island-state] save failed, using in-memory:", (err as Error).message);
    await memoryStore.save(userId, state);
    return "memory";
  }
}

/** Hard-delete (the §13 erasure cascade — island memory is user state). */
export async function deleteIslandState(userId: string): Promise<void> {
  await memoryStore.remove(userId);
  const admin = adminClient();
  if (admin) {
    try {
      await new SupabaseIslandStateStore(admin).remove(userId);
    } catch {
      /* the REST-path wipe in account/delete also covers this table */
    }
  }
}
