/**
 * FLOW 2 — "First Contact" (the crossing into the shared ocean). The emit contract for the seam
 * where the solitary arc (F0/F1, instanced) opens into the shared realtime layer
 * (ECHO_level_design_7flows.md §FLOW 2): the player leaves their private island, crosses toward a
 * neighbor, and — for the first time — sees and meets another LIVE player.
 *
 * Two emit sites:
 *   • the CROSSING decision (client, Flow0Client) — a single-actor cue: the costly, free
 *     sociability signal of choosing to leave the island at all.
 *   • FIRST CONTACT (server, WorldRoom) — when two live players open an interaction, the
 *     authoritative server emits a SEPARATE per-actor event for EACH participant, each from that
 *     actor's own vantage (counterpart = the other player), into that actor's own private
 *     posterior. This is the proven per-actor siloing, now between two real users.
 *
 * Context is the mandatory F2 envelope (public, stage 2, a real counterpart). Per cross-cutting
 * rule #1 the cue→axis lines are priors; the axis is learned in W.
 */
import type {
  BehavioralEvent,
  EventContext,
  CueChannel,
  CueId,
  TargetKind,
  RawSignals,
  ActionPolarity,
  CounterpartStatus,
} from "./telemetry.js";

/** The mandatory F2 base context: public, stage 2. counterpart_status/audience_size are filled
 *  per event (a crossing has no counterpart yet; first contact has a peer). */
export const FLOW2_CONTEXT: EventContext = {
  stakes: "low",
  audience_size: 0,
  public_or_private: "public",
  counterpart_status: "stranger",
  stage: 2,
  scarcity_level: 0,
  mood_proxy: 0,
  time_pressure: 0,
};

/** The crossing decision — leaving the private island into the shared ocean (single actor, no
 *  counterpart yet). The doc: "the decision to cross is itself F2's first (high-validity) cue." */
export const FLOW2_CROSS = {
  channel: "A" as CueChannel,
  cue: "A9" as CueId,
  action: "cross_to_shared",
  axisPrior: "sociability: warmth+openness (HIGH) — costly, free",
};

/** First contact between two live players — the dyadic approach/opener (emitted per actor). */
export const FLOW2_FIRST_CONTACT = {
  channel: "G" as CueChannel,
  cue: "G1" as CueId,
  action: "first_contact",
  axisPrior: "approach/proxemics → warmth (close) / dominance-or-avoidance (far), HIGH",
};

/** Build one Flow-2 BehavioralEvent envelope with the mandatory F2 context. */
export function buildFlow2Event(opts: {
  actorId: string;
  sessionId: string;
  channel: CueChannel;
  cue: CueId;
  action: string;
  polarity?: ActionPolarity;
  targetId: string;
  targetKind?: TargetKind;
  counterpartStatus?: CounterpartStatus;
  audienceSize?: number;
  raw?: RawSignals;
  contextOverride?: Partial<EventContext>;
}): BehavioralEvent {
  return {
    actor_id: opts.actorId,
    sessionId: opts.sessionId,
    t: Date.now(),
    type: "interaction_start",
    channel: opts.channel,
    cue: opts.cue,
    action: opts.action,
    polarity: opts.polarity ?? "take",
    target: { id: opts.targetId, kind: opts.targetKind ?? "player", status: opts.counterpartStatus ?? "peer" },
    context: {
      ...FLOW2_CONTEXT,
      counterpart_status: opts.counterpartStatus ?? FLOW2_CONTEXT.counterpart_status,
      audience_size: opts.audienceSize ?? 0,
      ...(opts.contextOverride ?? {}),
    },
    raw_signals: opts.raw ?? {},
    payload: {},
    provenance: "live",
  };
}
