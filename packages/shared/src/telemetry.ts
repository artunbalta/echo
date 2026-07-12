/**
 * Telemetry taxonomy (§9.1). Implicit, revealed-preference signals are first-class.
 * These are emitted by the client and/or derived server-side, then featurized by the
 * ML service. Keep payloads small and debounced.
 */
export type TelemetryType =
  | "approach" // moved toward an entity
  | "avoid" // changed course away from an entity
  | "dwell" // lingered near an entity
  | "path_hesitancy" // stop-start / idle mid-path
  | "reply_latency" // ms between prompt shown and message sent
  | "edit" // backspace / edit count on a drafted message
  | "revisit" // returned to a previously-visited entity
  | "interaction_start"
  | "interaction_end"
  | "portal_enter" // stepped through a portal to another scene (e.g. the venue)
  | "gesture"
  | "idle"
  // ── Phase 0 behavioral spine (BUILD-PLAN §3.1): signal moves from words to choices. ──
  // The whole vision rides on reading what you *choose*. These are emitted by the island
  // day-loop and featurized by the ML service (persona.TELEMETRY_FEATURE_NAMES). Payloads
  // are derived scalars — never raw text — so the deletion cascade stays simple (§4.4).
  | "choice_made" // a fork resolved   payload: { forkKey, option, optionsShown, latencyMs, dayIndex, irreversible }
  | "allocation" // budget spent       payload: { earn, learn, social, leisure, build } (fractions ~sum 1)
  | "resource_bet" // risky/safe bet    payload: { stake, expectedValue, variance, chosenRisk: "safe"|"risky" }
  | "pet_talk" // a turn to the pet     payload: { chars, valence, turnIndex, underStress } (NO raw text)
  | "leave_intent" // progress to leave payload: { stage, dayIndex, shipProgress01, secondsAlone }
  | "structure_progress" // building     payload: { structure, delta01, sessionSeconds, started, finished }
  | "fork_deliberation" // hover/undo before commit  payload: { forkKey, hovers, msDeliberated }
  // ── P1 survival spine (ECHO_PLAYABLE_BLUEPRINT.md VII.1): the three clocks emit. ──
  // survival_tick is an ambient body/world-state sample (a CONTEXT carrier — vitality,
  // daylight, scarcity — not itself a dispositional cue); fork_decision supersedes
  // choice_made on the island forks, carrying the survival context envelope so the same
  // choice under different scarcity is distinguishable (Law 3: identity lives in the
  // conditional signature). A refused fork emits fork_decision with option:"refused"
  // (the Channel-K twin — Law 2: non-choice is data, never a penalty).
  | "survival_tick" // payload: { vitality01, daylight01, scarcityLevel, dayCount }
  | "fork_decision" // payload: { forkKey, option|"refused", latencyMs, scarcityLevel, vitality01, daylight01, dayCount, irreversible }
  // ── P3 continuous passive locomotion (known-gaps #2; the openness apparatus, II.4). ──
  // The least-fakeable channel, aggregated client-side: debounced (idle windows emit
  // nothing), change-thresholded, per-day-capped, ≤1 event / ~1.5 s. Scalars only.
  | "passive_locomotion"; // payload: { heading_change_rate, path_tortuosity, novel_tile_ratio, backtrack_rate, dwell_ms, tiles }

export interface TelemetryEvent {
  type: TelemetryType;
  sessionId: string;
  ts: number; // client epoch ms
  payload: Record<string, unknown>;
}

/** Stakes tier for an agent action context (drives the autonomy gate, §9.5). */
export type Stakes = "low" | "medium" | "high" | "irreversible";

/** Coarse context buckets for graduated autonomy (§9.7). Extend as the world grows. */
export type ContextBucket =
  | "first_greeting"
  | "smalltalk"
  | "share_opinion"
  | "propose_meeting"
  | "discuss_terms"
  | "decline";

export const BUCKET_STAKES: Record<ContextBucket, Stakes> = {
  first_greeting: "low",
  smalltalk: "low",
  share_opinion: "medium",
  propose_meeting: "high",
  discuss_terms: "irreversible",
  decline: "medium",
};

export type AutonomyLevel = "copilot" | "supervised" | "auto";

// ════════════════════════════════════════════════════════════════════════════
// BehavioralEvent — the instrumentation contract (docs/world-design/event-schema.md).
// An ADDITIVE, backward-compatible superset of TelemetryEvent: every existing
// emitter keeps working (they emit TelemetryEvent; `liftLegacy` lifts those into
// this envelope at the ingress boundary). New/upgraded affordances emit
// BehavioralEvent directly so the engine gets actor, target, context, and the
// Channel-K refusal twin. Payloads remain derived scalars — never raw text (§4.4).
// ════════════════════════════════════════════════════════════════════════════

/** Cue channels A..K (cue-catalog.md). */
export type CueChannel = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

/** Stable cue id, e.g. "A1", "F3", "K2". Defined in cue-catalog.md (105 cues). */
export type CueId = `${CueChannel}${number}`;

/** Distinguishes a positive act from its Channel-K refusal twin. */
export type ActionPolarity = "take" | "refuse";

export type TargetKind =
  | "self" | "pet" | "resource" | "structure" | "station"
  | "npc" | "player" | "echo" | "group" | "server" | "queue" | "place" | "none";

/** The counterpart's status FROM THE ACTING participant's vantage (Invariant 5/6). */
export type CounterpartStatus = "high" | "peer" | "low" | "stranger" | "none";

/** Coarse life-stage label (stage-map.md). NOT a level/score (Invariant 1). */
export type LifeStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * MANDATORY context envelope. A cue without a fully-populated context is discarded
 * at ingress (event-schema.md Rule 2): the conditional signature that carries identity
 * is unreadable without it. `mood_proxy` is routed to the engine's state path (V/Σ_m),
 * marginalized into Ψ_total — a bad mood is noise, not trait (WI-5).
 */
export interface EventContext {
  stakes: Stakes;
  audience_size: number; // # of other actors who could observe (0 = nobody)
  public_or_private: "public" | "private";
  counterpart_status: CounterpartStatus; // from the ACTOR's vantage
  stage: LifeStage;
  scarcity_level: number; // 0 plenty .. 1 famine
  mood_proxy: number; // −1 low .. +1 high → loads on V, NOT trait
  time_pressure: number; // 0 untimed .. 1 hard deadline
}

/**
 * Implicit, hard-to-fake raw signals (Invariant 4 — these outrank explicit
 * self-presentation). Derived scalars only; cursor_path is sampled coords, jitter
 * is computed server-side. Never raw text.
 */
export interface RawSignals {
  latency_ms?: number; // C1/C2
  dwell_ms?: number; // A4/C10/J2
  cursor_path?: number[]; // B1 — [x,y,x,y,...]
  edits?: number; // B3
  hesitations?: number; // B2/B4 — hover/undo before commit
  distance?: number; // A1/A10/A12 — final stopping radius, tiles
  valence?: number; // D11/I — derived sentiment scalar (never the text)
  variance?: number; // F3 — chosen risk
  amount?: number; // F — resource quantity
  [k: string]: unknown; // forward-compatible; unknown keys ignored by featurizer
}

/** The upgraded event. EXTENDS the legacy envelope (type/sessionId/payload retained). */
export interface BehavioralEvent {
  // identity & routing
  actor_id: string; // whose measurement this is — routes into exactly this actor's silo
  sessionId: string;
  t: number; // client epoch ms (legacy `ts`)
  // what happened
  type: TelemetryType; // coarse legacy type, retained for routing/back-compat
  channel: CueChannel;
  cue: CueId;
  action: string; // semantic label, e.g. "saves_seed" | "declines_to_wager"
  polarity: ActionPolarity;
  // on whom / what
  target: { id: string; kind: TargetKind; status: CounterpartStatus };
  // mandatory conditions
  context: EventContext;
  // implicit measurement
  raw_signals: RawSignals;
  // legacy payload (derived scalars only)
  payload: Record<string, unknown>;
  // provenance — "legacy" events lifted from TelemetryEvent are down-weighted by the
  // engine's reliability_noise_scale until emitters supply real context.
  provenance?: "live" | "legacy";
}

/**
 * Static, audited primary {channel, cue} per legacy TelemetryType (event-schema.md §1.1).
 * Coarse by design: a richer emitter overrides channel/cue when it knows the fork
 * (e.g. choice_made on `plant_or_spend` → F1). Exhaustive over TelemetryType.
 */
export const CUE_FOR_TYPE: Record<TelemetryType, { channel: CueChannel; cue: CueId }> = {
  approach: { channel: "A", cue: "A1" },
  avoid: { channel: "A", cue: "A3" },
  dwell: { channel: "A", cue: "A4" },
  path_hesitancy: { channel: "A", cue: "A6" },
  reply_latency: { channel: "C", cue: "C1" },
  edit: { channel: "B", cue: "B3" },
  revisit: { channel: "A", cue: "A7" },
  interaction_start: { channel: "G", cue: "G1" },
  interaction_end: { channel: "E", cue: "E4" },
  portal_enter: { channel: "A", cue: "A9" },
  gesture: { channel: "B", cue: "B7" },
  idle: { channel: "B", cue: "B5" },
  choice_made: { channel: "F", cue: "F1" },
  allocation: { channel: "A", cue: "A5" },
  resource_bet: { channel: "F", cue: "F3" },
  pet_talk: { channel: "D", cue: "D11" },
  leave_intent: { channel: "G", cue: "G5" },
  structure_progress: { channel: "C", cue: "C7" },
  fork_deliberation: { channel: "B", cue: "B2" },
  survival_tick: { channel: "I", cue: "I1" }, // ambient affect/body-state sample (context carrier)
  fork_decision: { channel: "F", cue: "F1" }, // save_or_spend under scarcity (richer choice_made)
  passive_locomotion: { channel: "A", cue: "A9" }, // territory range / exploration breadth → openness
};

/** A neutral context for legacy backfill — flagged via provenance:"legacy" so the engine down-weights it. */
export function legacyContext(stage: LifeStage = 0, over: Partial<EventContext> = {}): EventContext {
  return {
    stakes: "low",
    audience_size: 0,
    public_or_private: "private",
    counterpart_status: "none",
    stage,
    scarcity_level: 0,
    mood_proxy: 0,
    time_pressure: 0,
    ...over,
  };
}

/** Pull typed raw signals out of a legacy payload's loosely-named scalars. */
export function legacyRawSignals(payload: Record<string, unknown>): RawSignals {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const rs: RawSignals = {};
  const lat = num(payload.latencyMs) ?? num(payload.msDeliberated) ?? num(payload.ms);
  if (lat !== undefined) rs.latency_ms = lat;
  const ed = num(payload.editsCount) ?? num(payload.edits);
  if (ed !== undefined) rs.edits = ed;
  const hov = num(payload.hovers);
  if (hov !== undefined) rs.hesitations = hov;
  const dist = num(payload.dist) ?? num(payload.distance);
  if (dist !== undefined) rs.distance = dist;
  const val = num(payload.valence);
  if (val !== undefined) rs.valence = val;
  const varc = num(payload.variance);
  if (varc !== undefined) rs.variance = varc;
  const sec = num(payload.seconds);
  if (sec !== undefined) rs.dwell_ms = sec * 1000;
  return rs;
}

/**
 * Lift a legacy TelemetryEvent into the BehavioralEvent envelope so the ~10 emitters
 * shipping today keep working with zero client changes (event-schema.md §1.1).
 * `ctx` is supplied by the affordance's local context provider; absent → legacyContext().
 */
export function liftLegacy(ev: TelemetryEvent, actorId: string, ctx?: EventContext): BehavioralEvent {
  const map = CUE_FOR_TYPE[ev.type];
  const targetId = (ev.payload.targetId as string) ?? (ev.payload.forkKey as string) ?? "none";
  const action = String(ev.payload.option ?? ev.payload.action ?? ev.type);
  return {
    actor_id: actorId,
    sessionId: ev.sessionId,
    t: ev.ts,
    type: ev.type,
    channel: map.channel,
    cue: map.cue,
    action,
    polarity: "take",
    target: { id: targetId, kind: targetId === "none" ? "self" : "station", status: "none" },
    context: ctx ?? legacyContext(),
    raw_signals: legacyRawSignals(ev.payload),
    payload: ev.payload,
    provenance: "legacy",
  };
}
