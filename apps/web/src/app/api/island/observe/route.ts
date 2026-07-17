/**
 * Island telemetry forwarder (BUILD-PLAN §0.D, §13.A). The single-player island has no
 * Colyseus room, so the client POSTs its behavioral batch here and we forward each event to
 * the ML service — the spine that turns *choices* into persona signal (§3).
 *
 * Routing:
 *   - "choice" events (a fork resolved, a budget allocated, a bet taken, building progressed)
 *     carry revealed preference → POST ML /observe with a grounded action string + a telemetry
 *     dict. The posterior updates on both the action embedding and the telemetry features.
 *   - implicit events (pet_talk, leave_intent, approach, dwell…) → POST ML /telemetry.
 *
 * Forward-compatible: we already emit the behavioral feature keys (save_rate, risk_index, …)
 * that persona._telemetry_features will read once §0.D grows F and re-anchors W. Until then
 * the ML service reads the keys it knows (latencyMs) and ignores the rest — the pipe is proven
 * end-to-end before the re-anchor. Degrades to { mocked: true } when ML_SERVICE_URL is unset.
 */
import { NextResponse } from "next/server";
import { observeEvent, telemetryEvent } from "@/lib/ml";
import type { TelemetryEvent } from "@echo/shared";

export const runtime = "nodejs";

/** Event types that reveal a deliberate, (within-session) irreversible preference.
 *  fork_decision (P1) supersedes choice_made/resource_bet on the island forks — one event
 *  per commit, carrying the survival context (scarcity, vitality, daylight, day) so the same
 *  choice under different pressure stays distinguishable (Law 3). */
const CHOICE_TYPES = new Set(["choice_made", "allocation", "resource_bet", "structure_progress", "fork_decision"]);

export async function POST(req: Request) {
  let body: { userId?: string; sessionId?: string; events?: TelemetryEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
  const events = Array.isArray(body.events) ? body.events : [];
  if (!userId || !events.length) return NextResponse.json({ ok: true, forwarded: 0, mocked: !process.env.ML_SERVICE_URL });

  let mocked = false;
  let forwarded = 0;
  // Forward sequentially: persona updates are stateful and order-sensitive (consistency
  // across the day is itself a feature — §3.2). Cheap (a handful of events per flush).
  for (const ev of events) {
    try {
      if (CHOICE_TYPES.has(ev.type)) {
        const r = await observeEvent({
          userId,
          action: actionText(ev),
          telemetry: behavioralTelemetry(ev),
          context: eventContext(ev),
        });
        mocked = mocked || !!r.mocked;
      } else {
        const r = await telemetryEvent({ userId, sessionId: body.sessionId, event: { type: ev.type, payload: ev.payload } });
        mocked = mocked || !!r.mocked;
      }
      forwarded++;
    } catch {
      // best-effort; never block the player on a telemetry hiccup
    }
  }
  return NextResponse.json({ ok: true, forwarded, mocked });
}

/**
 * A short, grounded sentence describing the choice — the `action` the persona update embeds.
 * Honest and specific; this is what the dusk reading later cites back to the player.
 */
function actionText(ev: TelemetryEvent): string {
  const p = ev.payload ?? {};
  switch (ev.type) {
    case "fork_decision": {
      // The survival fork, in context: the same choice on a lean day says more (§IV.3).
      const lean = num(p.scarcityLevel) >= 0.5 ? "a lean day" : "an even day";
      if (p.option === "refused")
        return `On ${lean} (day ${num(p.dayCount)}) they let the fork "${str(p.forkKey)}" go undecided; the day ended without choosing.`;
      return `On ${lean} (day ${num(p.dayCount)}) they chose "${str(p.option)}" at fork "${str(p.forkKey)}".`;
    }
    case "choice_made":
      return `On day ${num(p.dayIndex)} they chose "${str(p.option)}" over the alternatives at fork "${str(p.forkKey)}".`;
    case "allocation":
      return `They spent the day's budget — earn ${pct(p.earn)}, learn ${pct(p.learn)}, social ${pct(p.social)}, leisure ${pct(p.leisure)}, build ${pct(p.build)}.`;
    case "resource_bet":
      return `They made a ${str(p.chosenRisk)} bet, staking ${num(p.stake)} for an expected ${num(p.expectedValue)}.`;
    case "structure_progress":
      return `They worked on the ${str(p.structure)}${truthy(p.finished) ? " and finished it" : truthy(p.started) ? " and started it" : ""}.`;
    default:
      return "";
  }
}

/**
 * Map a behavioral event onto the telemetry feature dict the ML persona update reads. Keys the
 * service knows today (latencyMs) move the posterior now; the §3.2 behavioral keys ride along
 * for when §0.D's persona._telemetry_features learns to read them.
 */
function behavioralTelemetry(ev: TelemetryEvent): Record<string, unknown> {
  const p = ev.payload ?? {};
  const tele: Record<string, unknown> = {};
  if (typeof p.latencyMs === "number") tele.latencyMs = p.latencyMs;
  switch (ev.type) {
    case "allocation":
      tele.ts_earn = p.earn;
      tele.ts_learn = p.learn;
      tele.ts_social = p.social;
      tele.ts_leisure = p.leisure;
      tele.ts_build = p.build;
      break;
    case "resource_bet":
      tele.risk_index = p.variance;
      tele.stake = p.stake;
      break;
    case "structure_progress":
      tele.persistence = truthy(p.finished) ? 1 : truthy(p.started) ? 0.5 : 0;
      break;
    case "choice_made":
      tele.save_rate = p.option === "save" ? 1 : p.option === "spend" ? 0 : undefined;
      tele.decision_latency = p.latencyMs;
      break;
    case "fork_decision":
      // Same behavioral keys as the legacy events it supersedes, plus the survival context
      // riding along for the P3/P5 featurizer (scarcity-conditioned save rate, risk, k).
      if (p.forkKey === "plant_or_spend") {
        tele.save_rate = p.option === "save" ? 1 : p.option === "spend" ? 0 : undefined;
      }
      if (p.forkKey === "tide_wager" && p.option !== "refused") {
        tele.risk_index = p.variance;
        tele.stake = p.stake;
      }
      if (typeof p.latencyMs === "number" && p.option !== "refused") tele.decision_latency = p.latencyMs;
      tele.scarcity_level = p.scarcityLevel;
      break;
  }
  return tele;
}

/** The context envelope forwarded with every choice (Law 3: record the conditions). */
function eventContext(ev: TelemetryEvent): Record<string, unknown> {
  const p = ev.payload ?? {};
  const ctx: Record<string, unknown> = { stage: 1, audience_size: 0, public_or_private: "private" };
  if (typeof p.scarcityLevel === "number") ctx.scarcity_level = p.scarcityLevel;
  if (typeof p.dayCount === "number") ctx.day = p.dayCount;
  if (typeof p.daylight01 === "number") ctx.time_pressure = 1 - (p.daylight01 as number);
  return ctx;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "0%");
const truthy = (v: unknown) => v === true;
