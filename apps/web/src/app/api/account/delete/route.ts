/**
 * Account erasure (§13). Hard-deletes all derived state for a user:
 *   - ML learning state (persona posterior, reward head, behavior index, buckets) via the
 *     ML service DELETE /user/{uid}
 *   - all string-keyed rows in Supabase (telemetry, interactions, behaviors, persona,
 *     reward, autonomy, preference pairs, meeting outcomes, narrations, behavioral events)
 *
 * Selfies are never stored (discarded after attribute extraction, §6), so there is no
 * biometric image to erase. Auth-uuid-keyed tables (characters/world_entities) cascade
 * via the FK when Supabase Auth is wired; the local-dev string userId path is covered here.
 *
 * `ok` MEANS IT. Three separate ways it used to be true over surviving data, all fixed together
 * because SOC-2.D made the tables non-empty and turned each of them from theory into a lie:
 *   1. No service key returned `{wiped: [], failed: []}` — success, without ever looking.
 *   2. The ML result was not part of `ok` at all, so a service that was down erased the posterior
 *      from nowhere and the route answered 200.
 *   3. A three-element `Promise.all` was destructured into two bindings, so island state's result
 *      was discarded.
 * The route's own rule, from the comment below: "A silent failure here is the difference between
 * 'your data is gone' and a sentence that only sounds like it."
 */
import { NextResponse } from "next/server";
import { deleteUser } from "@/lib/ml";
import { deleteIslandState } from "@/lib/island-state";
import { erasureVerdict, type MlDeleteResult } from "@/lib/erasureResult";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// table → column holding the string user id
const USER_KEYED: [string, string][] = [
  ["telemetry_events", "user_id"],
  ["behavior_index", "user_id"],
  ["persona_state", "user_id"],
  ["reward_model_state", "user_id"],
  ["autonomy_buckets", "user_id"],
  ["preference_pairs", "user_id"],
  ["meeting_outcomes", "user_id"],
  ["interactions", "actor_id"],
  ["island_state", "user_id"], // P1 survival day-state (crop/structure/scarcity/tie warmth)
  // W5-0. The durable record of every measurement the landing world sends to the engine.
  // Keyed on actor_id, not user_id: db/migrations/0011_behavioral_events.sql names this
  // cascade as the reason that column exists. Missing it left the one table that holds a
  // person's raw behaviour behind after an erasure said it had finished.
  ["behavioral_events", "actor_id"],
];

async function supabaseDelete(uid: string): Promise<{ wiped: string[]; failed: string[] }> {
  // NO KEY IS A FAILURE, NOT A CLEAN SLATE. This returned `{wiped: [], failed: []}`, which made
  // `ok` true and the status 200: a deployment without the service key told a person their data was
  // gone WITHOUT EVER LOOKING. That was nearly harmless while these tables were empty. SOC-2.D has
  // just started writing four of them — persona_state among them — using the ML service's OWN key,
  // so the two halves can now be configured independently and this half can be blind while the
  // other half is full.
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { wiped: [], failed: ["supabase (no service key in this runtime — nothing was checked)"] };
  }
  const wiped: string[] = [];
  const failed: string[] = [];
  for (const [table, col] of USER_KEYED) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, prefer: "return=minimal" },
      });
      if (res.ok) wiped.push(table);
      else failed.push(`${table} ${res.status}`);
    } catch (err) {
      // Keep erasing the rest, but never let a table that refused pass for a table that is clean.
      // A silent failure here is the difference between "your data is gone" and a sentence that
      // only sounds like it.
      failed.push(`${table} ${(err as Error).message}`);
    }
  }
  if (failed.length) console.error(`[erasure] ${uid}: ${failed.length} table(s) NOT wiped: ${failed.join(", ")}`);
  return { wiped, failed };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const uid = body.userId;
  if (!uid) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // ALL THREE, DESTRUCTURED. This was a three-element `Promise.all` read into two bindings, so
  // `deleteIslandState`'s result was silently discarded and could never reach `ok`.
  const [ml, supabase, island] = await Promise.all([
    deleteUser(uid),
    supabaseDelete(uid),
    deleteIslandState(uid).then(() => null).catch((e: Error) => e.message),
  ]);

  // THE ML SERVICE HOLDS THE POSTERIOR, and its result was not part of `ok` at all — so a service
  // that was down or unset erased nothing and the route still answered 200. `deleted: false` is NOT
  // the failure signal: `STORE.delete` reports whether the user was in MEMORY, and after a restart
  // that is false for everyone while the durable rows are removed regardless. What means failure is
  // `mocked`, which `lib/ml.ts` sets on the fallback whenever the call did not reach the service.
  const verdict = erasureVerdict({
    wiped: supabase.wiped,
    supabaseFailed: supabase.failed,
    ml: ml as MlDeleteResult,
    islandError: island,
  });

  // `ok` is the erasure's own claim about itself, so it has to mean it: false the moment ANY half
  // refused or was never attempted, with the list, rather than a cheerful 200 over rows that are
  // still there. The field name stays `supabaseTablesFailed` because /account reads it by name and
  // shows it to the person; what changed is that it now carries every kind of failure, not one.
  return NextResponse.json(
    { ok: verdict.ok, ml, supabaseTablesWiped: supabase.wiped, supabaseTablesFailed: verdict.failed },
    { status: verdict.status },
  );
}
