/**
 * Stage 4 town telemetry forwarder. The town emits full BehavioralEvent envelopes (not the
 * legacy {type,payload} shape), so each one is forwarded to the ML engine's instrumentation
 * ingress (POST /observe/behavioral). That endpoint enforces mandatory context, routes per
 * actor_id, and folds the cue into the pooled + conditional posteriors — including Channel-K
 * refusals. The response carries how far the posterior moved, which the client shows live
 * (the mirror moving). Degrades to { mocked: true } when ML_SERVICE_URL is unset.
 */
import { NextResponse } from "next/server";
import { observeBehavioralEvent, type BehavioralObserveResult } from "@/lib/ml";
import type { BehavioralEvent } from "@echo/shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { events?: BehavioralEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (!events.length) {
    return NextResponse.json({ ok: true, forwarded: 0, mocked: !process.env.ML_SERVICE_URL });
  }

  let mocked = false;
  let forwarded = 0;
  let last: BehavioralObserveResult | null = null;
  // Sequential: persona updates are stateful and order-sensitive (consistency across the
  // visit is itself a feature). A handful of events per flush — cheap.
  for (const event of events) {
    try {
      const r = await observeBehavioralEvent({ event: event as unknown as Record<string, unknown> });
      mocked = mocked || !!r.mocked;
      last = r;
      forwarded++;
    } catch {
      // best-effort; never block the player on a telemetry hiccup
    }
  }
  return NextResponse.json({ ok: true, forwarded, mocked, result: last });
}
