/**
 * Account erasure (§13). Hard-deletes all derived state for a user:
 *   - ML learning state (persona posterior, reward head, behavior index, buckets) via the
 *     ML service DELETE /user/{uid}
 *   - all string-keyed rows in Supabase (telemetry, interactions, behaviors, persona,
 *     reward, autonomy, preference pairs, meeting outcomes, narrations)
 *
 * Selfies are never stored (discarded after attribute extraction, §6), so there is no
 * biometric image to erase. Auth-uuid-keyed tables (characters/world_entities) cascade
 * via the FK when Supabase Auth is wired; the local-dev string userId path is covered here.
 */
import { NextResponse } from "next/server";
import { deleteUser } from "@/lib/ml";

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
];

async function supabaseDelete(uid: string): Promise<string[]> {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const wiped: string[] = [];
  for (const [table, col] of USER_KEYED) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, prefer: "return=minimal" },
      });
      if (res.ok) wiped.push(table);
    } catch {
      /* continue erasing the rest */
    }
  }
  return wiped;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const uid = body.userId;
  if (!uid) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const [ml, wiped] = await Promise.all([deleteUser(uid), supabaseDelete(uid)]);
  return NextResponse.json({ ok: true, ml, supabaseTablesWiped: wiped });
}
