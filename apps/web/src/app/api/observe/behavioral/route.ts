/**
 * BehavioralEvent ingress forwarder (the world-design instrumentation contract). The solitary
 * flows (F0/F1) have no Colyseus room, so the client POSTs its BehavioralEvent envelope(s) here
 * and we forward each to the proven ML ingress (POST /observe/behavioral → ingest →
 * persona.observe → featurize_raw). This is a thin pass-through — NOT a parallel measurement path
 * (Invariant 2): the ML endpoint still enforces mandatory context (422), routes per actor_id, and
 * folds the cue into the pooled + conditional posteriors. Degrades to { mocked:true } when ML is
 * down, so the scene never blocks the player.
 *
 * Persistence (plan W5-0): every envelope with an actor_id is recorded in behavioral_events
 * (db/migrations/0011) through lib/behavioral-store.ts BEFORE the forward and awaited; the
 * response carries `durable` for what actually happened and `durable_reason` when it did not.
 *
 * The mirror (DECISIONS C61): AFTER the forward, each act's own move as the engine reported it goes
 * to `echo_ledger` (lib/ledger.ts), so the person can later see which act moved which axis.
 */
import { NextResponse } from "next/server";
import { observeBehavioralEvent, type BehavioralObserveResult } from "@/lib/ml";
import { recordEvents, rowFromBehavioral } from "@/lib/behavioral-store";
import { appendLedger, entryForAct } from "@/lib/ledger";
import { subjectOf, subjectRejection } from "@/lib/subject";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { event?: Record<string, unknown>; events?: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
  if (!events.length) return NextResponse.json({ ok: true, forwarded: 0, durable: false, results: [] });

  // WHOSE EVIDENCE THIS IS (SOC-2.E). `actor_id` is the key every row is written under and every
  // posterior is routed by, and it arrived inside the envelope being authenticated — so a POST could
  // name any actor and the row was indistinguishable from real evidence afterwards.
  //
  // The check is per-envelope because one POST may carry several, and a batch that mixed a real
  // actor with a borrowed one would otherwise pass on the strength of its first element. Nothing is
  // stamped or rewritten: an envelope without an actor_id is still not recorded, exactly as before
  // (ML rejects it on the same ground), so this rejects and never invents.
  const actors = [...new Set(events.map((e) => (typeof e.actor_id === "string" ? e.actor_id.trim() : "")).filter(Boolean))];
  if (actors.length) {
    const caller = subjectOf(req, actors[0]);
    if (!caller.ok) {
      const { body: error, status } = subjectRejection(caller);
      return NextResponse.json(error, { status });
    }
    if (actors.some((a) => a !== caller.subject)) {
      return NextResponse.json({ error: "identity_mismatch" }, { status: 403 });
    }
  }

  // Record first, awaited: the row is what the posterior was shown. An envelope without an actor_id
  // has no silo to land in (ML rejects it on the same ground) and is not recorded.
  const rows = events.map(rowFromBehavioral).filter((r): r is NonNullable<typeof r> => r !== null);
  const record = await recordEvents(rows);

  // Forward sequentially: persona updates are stateful and order-sensitive within an actor.
  const results: BehavioralObserveResult[] = [];
  for (const event of events) {
    results.push(await observeBehavioralEvent({ event }));
  }
  if (actors.length) {
    const entries = events.map((e, i) => entryForAct(e, results[i]!)).filter((x): x is NonNullable<typeof x> => x !== null);
    if (entries.length) await appendLedger(actors[0]!, entries);
  }
  const mocked = results.some((r) => r.mocked);
  return NextResponse.json({
    ok: true,
    forwarded: results.length,
    mocked,
    durable: record.durable,
    ...(record.reason ? { durable_reason: record.reason } : {}),
    // Surface WHY it mocked (if it did) so the failure is diagnosable from the Network tab, rather
    // than a silent fake success: "ml_service_url_unset" ⇒ set ML_SERVICE_URL in Vercel Production.
    ...(mocked ? { reason: results.find((r) => r.reason)?.reason ?? "unknown" } : {}),
    results,
  });
}
