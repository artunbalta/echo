/**
 * Account erasure (§13). Hard-deletes all derived state for a user:
 *   - ML learning state (persona posterior, reward head, behavior index, buckets) via the
 *     ML service DELETE /user/{uid}
 *   - all string-keyed rows in Supabase (telemetry, interactions, behaviors, persona,
 *     reward, autonomy, preference pairs, meeting outcomes, narrations, behavioral events,
 *     villagers' memories of them)
 *   - their name on the village changes they were part of (C44) and on the marks their acts left
 *     (C45): cleared, not deleted, because those rows are the shared world's
 *   - what they did in each village and who saw it (C45): deleted, so the villagers forget it
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
import { subjectOf, subjectRejection } from "@/lib/subject";
import { deleteUser } from "@/lib/ml";
import { deleteIslandState } from "@/lib/island-state";
import { forgetLedger } from "@/lib/ledger";
import { forgetDemoVoice } from "@/lib/demo";
import { villageStore } from "@/lib/villageStore";
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
  // C44. What each villager remembers of this person, in the villager's words. Deleted outright.
  ["villager_memories", "subject"],
  // C45. What this person did in each village, with who saw it. Deleted: the villagers forget it.
  ["village_deeds", "subject"],
  // C47. What they carried.
  ["player_items", "subject"],
  // C57. Where they came ashore from the sea, and who saw it.
  ["player_landings", "subject"],
  // C59. Their house and their look. The land goes back to being land.
  ["player_homes", "subject"],
  ["player_looks", "subject"],
  // C61. The mirror's record: every act and walk the echo was moved by, and by how much.
  ["echo_ledger", "subject"],
  // C63. What the director set out for them, and what they did.
  ["player_stagings", "subject"],
  // C64. When they were last here, and what their echo did while they were away.
  ["player_presence", "subject"],
  ["echo_outings", "subject"],
  // C67. Reports they filed, and a bar on them (their identity goes with this erasure anyway).
  ["moderation_reports", "reporter"],
  ["barred_subjects", "subject"],
  // C71. Codes they made, whom their echo may meet, and every meeting their echo was in: on either side,
  // since a meeting is the other echo's words to theirs as much as theirs to it.
  ["echo_invites", "subject"],
  ["echo_pairs", "a"],
  ["echo_pairs", "b"],
  ["echo_meetings", "a"],
  ["echo_meetings", "b"],
  // C72. A demo visit. Its cloned voice is deleted at ElevenLabs first (below), or the erasure fails.
  ["demo_visits", "subject"],
];

// table → column to NULL rather than delete: rows that are the shared world's history now, and point
// at the person only through that column. C44's `village_changes`: deleting a row would bring a family
// back from wherever it went, for every other visitor, so the row stays and forgets who was there.
const USER_NAMED: [string, string][] = [
  ["village_changes", "subject"],
  // C45. The marks acts left on the shared world: they heal on their own day, nameless meanwhile.
  ["world_effects", "subject"],
  // C67. What moderators did stays answerable; whom it was done to does not outlive the erasure.
  ["moderation_actions", "subject"],
];

/** One table's rows for one person, deleted by REST: true, or why not. */
async function supabaseDeleteRow(table: string, col: string, uid: string): Promise<true | string> {
  if (!SUPABASE_URL || !SERVICE_KEY) return "(no service key in this runtime)";
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, prefer: "return=minimal" },
    });
    return res.ok ? true : String(res.status);
  } catch (err) {
    return (err as Error).message;
  }
}

async function supabaseDelete(uid: string, later: ReadonlySet<string> = new Set()): Promise<{ wiped: string[]; failed: string[] }> {
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
    // Left for the caller to delete last (see `POST`), so it is neither wiped nor failed here.
    if (later.has(table)) continue;
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
  for (const [table, col] of USER_NAMED) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(uid)}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
          prefer: "return=minimal",
          "content-type": "application/json",
        },
        body: JSON.stringify({ [col]: null }),
      });
      if (res.ok) wiped.push(`${table} (${col} cleared)`);
      else failed.push(`${table} ${res.status}`);
    } catch (err) {
      failed.push(`${table} ${(err as Error).message}`);
    }
  }
  if (failed.length) console.error(`[erasure] ${uid}: ${failed.length} table(s) NOT wiped: ${failed.join(", ")}`);
  return { wiped, failed };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  // THE DESTRUCTIVE ONE. This hard-deletes the posterior, eight Supabase tables including
  // behavioral_events, and the island state — and it used to do it for whatever string arrived in
  // the body, while the shared world broadcast everyone's id to everyone standing near them (⚑27).
  const caller = subjectOf(req, String(body.userId));
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const uid = caller.subject;

  // ALL THREE, DESTRUCTURED. This was a three-element `Promise.all` read into two bindings, so
  // `deleteIslandState`'s result was silently discarded and could never reach `ok`.
  // The mirror's record where it is held in this process (dev, or a write that failed): gone first.
  forgetLedger(uid);
  // A demo visitor (C72). Their own voice, at ElevenLabs, goes first. Their visit goes LAST, and only
  // when everything else has gone: the visit is the mark that an erasure is still owed, and the sweep
  // that erases visits nobody erased (`lib/demo.ts`) comes back for any visit still marked. A partial
  // erasure that took the mark with it would never be finished.
  const store = villageStore();
  const voiceGone = store ? await forgetDemoVoice(store, uid) : true;
  const visit = store ? await store.demoVisitOf(uid) : null;
  // What the in-process store holds of them, when there is one: against Supabase this does nothing, and
  // the tables below are wiped by REST.
  if (store) await store.forgetSubject(uid);
  const [ml, supabase, island] = await Promise.all([
    deleteUser(uid),
    supabaseDelete(uid, new Set(["demo_visits"])),
    deleteIslandState(uid).then(() => null).catch((e: Error) => e.message),
  ]);

  // THE ML SERVICE HOLDS THE POSTERIOR, and its result was not part of `ok` at all — so a service
  // that was down or unset erased nothing and the route still answered 200. `deleted: false` is NOT
  // the failure signal: `STORE.delete` reports whether the user was in MEMORY, and after a restart
  // that is false for everyone while the durable rows are removed regardless. What means failure is
  // `mocked`, which `lib/ml.ts` sets on the fallback whenever the call did not reach the service.
  let verdict = erasureVerdict({
    wiped: supabase.wiped,
    supabaseFailed: [...supabase.failed, ...(voiceGone ? [] : ["elevenlabs voice (the cloned voice was not deleted; it will be tried again)"])],
    ml: ml as MlDeleteResult,
    islandError: island,
  });
  // The visit, last: gone when everything else is, kept (and put back, in the in-process store) when not.
  if (verdict.ok) {
    const gone = await supabaseDeleteRow("demo_visits", "subject", uid);
    if (gone !== true) verdict = erasureVerdict({ wiped: supabase.wiped, supabaseFailed: [`demo_visits ${gone}`], ml: ml as MlDeleteResult, islandError: island });
    else supabase.wiped.push("demo_visits");
  } else if (visit && store) await store.saveDemoVisit(visit);

  // `ok` is the erasure's own claim about itself, so it has to mean it: false the moment ANY half
  // refused or was never attempted, with the list, rather than a cheerful 200 over rows that are
  // still there. The field name stays `supabaseTablesFailed` because /account reads it by name and
  // shows it to the person; what changed is that it now carries every kind of failure, not one.
  return NextResponse.json(
    { ok: verdict.ok, ml, supabaseTablesWiped: supabase.wiped, supabaseTablesFailed: verdict.failed },
    { status: verdict.status },
  );
}
