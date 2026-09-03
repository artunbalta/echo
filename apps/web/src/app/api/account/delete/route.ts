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
 */
import { NextResponse } from "next/server";
import { deleteUser } from "@/lib/ml";
import { deleteIslandState } from "@/lib/island-state";

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
  if (!SUPABASE_URL || !SERVICE_KEY) return { wiped: [], failed: [] };
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

  const [ml, supabase] = await Promise.all([deleteUser(uid), supabaseDelete(uid), deleteIslandState(uid)]);
  // `ok` is the erasure's own claim about itself, so it has to mean it: false the moment any table
  // refused, with the list, rather than a cheerful 200 over rows that are still there.
  return NextResponse.json(
    { ok: supabase.failed.length === 0, ml, supabaseTablesWiped: supabase.wiped, supabaseTablesFailed: supabase.failed },
    { status: supabase.failed.length === 0 ? 200 : 500 },
  );
}
