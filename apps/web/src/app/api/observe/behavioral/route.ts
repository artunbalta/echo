/**
 * BehavioralEvent ingress forwarder (the world-design instrumentation contract). The solitary
 * flows (F0/F1) have no Colyseus room, so the client POSTs its BehavioralEvent envelope(s) here
 * and we forward each to the proven ML ingress (POST /observe/behavioral → ingest →
 * persona.observe → featurize_raw). This is a thin pass-through — NOT a parallel measurement path
 * (Invariant 2): the ML endpoint still enforces mandatory context (422), routes per actor_id, and
 * folds the cue into the pooled + conditional posteriors. Degrades to { mocked:true } when ML is
 * down, so the scene never blocks the player.
 */
import { NextResponse } from "next/server";
import { observeBehavioralEvent } from "@/lib/ml";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { event?: Record<string, unknown>; events?: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
  if (!events.length) return NextResponse.json({ ok: true, forwarded: 0, results: [] });

  // Forward sequentially: persona updates are stateful and order-sensitive within an actor.
  const results = [];
  for (const event of events) {
    results.push(await observeBehavioralEvent({ event }));
  }
  return NextResponse.json({
    ok: true,
    forwarded: results.length,
    mocked: results.some((r) => r.mocked),
    results,
  });
}
