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
 */
import { NextResponse } from "next/server";
import { observeBehavioralEvent } from "@/lib/ml";
import { recordEvents, rowFromBehavioral } from "@/lib/behavioral-store";

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

  // Record first, awaited: the row is what the posterior was shown. An envelope without an actor_id
  // has no silo to land in (ML rejects it on the same ground) and is not recorded.
  const rows = events.map(rowFromBehavioral).filter((r): r is NonNullable<typeof r> => r !== null);
  const record = await recordEvents(rows);

  // Forward sequentially: persona updates are stateful and order-sensitive within an actor.
  const results = [];
  for (const event of events) {
    results.push(await observeBehavioralEvent({ event }));
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
