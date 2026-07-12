/**
 * The social cue catalog — Flow 2 dialogue dynamics + Flow 3 the clearing
 * (ECHO_level_design_7flows.md §FLOW 2/§FLOW 3). Every social beat the player can choose is a
 * named action here; the AUTHORITATIVE server (WorldRoom) maps an action + the live counterpart
 * into one per-actor BehavioralEvent via {@link buildSocialEvent}, stamping the mandatory context
 * (counterpart_status, audience_size, public/private, stakes, stage) from what it knows. The
 * client only reports WHICH choice the player made; it never fabricates context.
 *
 * Per cross-cutting rule #1 the cue→axis lines are PRIORS (learned in W). Cues marked ⚑ are known
 * to route imperfectly under the committed W (no telemetry→openness path) — see docs/known-gaps.md;
 * they still move the posterior and are NOT silently re-routed.
 *
 * This is the single source of truth the live exchange (server) and the headless evidence
 * walkthroughs (flow2_dialogue / flow3_clearing) both follow, so they can never drift.
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
  Stakes,
} from "./telemetry.js";

export type SocialStage = 1 | 2 | 3; // F1 (workplace/economy), F2 (dialogue), F3 (clearing)

export interface SocialCueDef {
  channel: CueChannel;
  cue: CueId;
  stage: SocialStage;
  /** Default polarity; a refusal/withdrawal twin guarantees non-action is still data. */
  polarity: ActionPolarity;
  /** Design-doc cue→axis prior (documentation; the real loading is learned in W). */
  axisPrior: string;
}

/**
 * Channels are chosen so the conditional-bucket key conditions correctly: social channels
 * {D,E,G,H} + a non-"none" counterpart_status → cond_key `counterpart:<status>` (where the F3
 * individuation lives — the courtesy gradient by status). Economic cues (F) condition on stakes.
 */
export const SOCIAL_CUES: Record<string, SocialCueDef> = {
  // ── FLOW 2 — dialogue dynamics (stage 2) ─────────────────────────────────────────────────────
  proxemics_close: { channel: "A", cue: "A1", stage: 2, polarity: "take", axisPrior: "warmth(+ close), HIGH (implicit)" },
  proxemics_far: { channel: "A", cue: "A3", stage: 2, polarity: "refuse", axisPrior: "dominance/avoidance (far), HIGH" },
  prepare_before_crossing: { channel: "C", cue: "C7", stage: 2, polarity: "take", axisPrior: "conscientiousness/affiliation" },
  opener_warm: { channel: "G", cue: "G2", stage: 2, polarity: "take", axisPrior: "warmth(+), formality" },
  opener_neutral: { channel: "G", cue: "G3", stage: 2, polarity: "take", axisPrior: "neutral baseline register" },
  opener_curt: { channel: "G", cue: "G4", stage: 2, polarity: "refuse", axisPrior: "warmth(−)/dominance" },
  opener_silent: { channel: "G", cue: "G5", stage: 2, polarity: "refuse", axisPrior: "silent-gesture: low warmth / social-anxiety" },
  asks_question: { channel: "D", cue: "D2", stage: 2, polarity: "take", axisPrior: "openness(+) ⚑" },
  asserts: { channel: "D", cue: "D3", stage: 2, polarity: "take", axisPrior: "dominance(+)" },
  self_disclosure: { channel: "D", cue: "D5", stage: 2, polarity: "take", axisPrior: "openness(+) ⚑" },
  interrupt: { channel: "D", cue: "D7", stage: 2, polarity: "take", axisPrior: "dominance(+) (overlap)" },
  close_graceful: { channel: "E", cue: "E4", stage: 2, polarity: "take", axisPrior: "warmth/conscientiousness" },
  close_abrupt: { channel: "E", cue: "E5", stage: 2, polarity: "refuse", axisPrior: "dominance/low-warmth" },
  close_ghost: { channel: "E", cue: "E6", stage: 2, polarity: "refuse", axisPrior: "withdrawal/low-conscientiousness" },
  // ── P3 per-actor dialogue-turn rows (event-schema Rule 3): every dyadic act produces a row
  //    from EACH vantage. The sender's turn carries the implicit micro-timing (C1 latency, B3
  //    edits in raw_signals); the recipient's row records being addressed — the substrate the
  //    K1 refusal twin (declines_to_engage) and E2 thinking-per-word derivations need. ──
  dialogue_turn: { channel: "C", cue: "C1", stage: 2, polarity: "take", axisPrior: "reply tempo — pace(−slow)/intellect(+deliberate), HIGH (implicit timing)" },
  receives_turn: { channel: "E", cue: "E1", stage: 2, polarity: "take", axisPrior: "was addressed (recipient vantage; context carrier for K1/E2 derivations)" },
  declines_to_engage: { channel: "K", cue: "K1", stage: 2, polarity: "refuse", axisPrior: "declined social bid — warmth(−), solitude_tol(+); twin of G1/A1, HIGH" },
  // the disambiguating dilemma (core of F2) — separates warmth / dominance / affect-volatility, HIGH
  cold_response_deescalate: { channel: "G", cue: "G8", stage: 2, polarity: "take", axisPrior: "warmth (stay warm), HIGH" },
  cold_response_persist: { channel: "D", cue: "D8", stage: 2, polarity: "take", axisPrior: "dominance (push), HIGH" },
  cold_response_withdraw: { channel: "G", cue: "G9", stage: 2, polarity: "refuse", axisPrior: "withdrawal/affect-volatility, HIGH" },
  egg_gift_given: { channel: "F", cue: "F7", stage: 2, polarity: "take", axisPrior: "warmth/affiliation (reciprocity)" },

  // ── FLOW 3 — the clearing (stage 3) ──────────────────────────────────────────────────────────
  courtesy_warm_server: { channel: "G", cue: "G11", stage: 3, polarity: "take", axisPrior: "warmth(HIGH) — to one who cannot repay" },
  transact_neutral: { channel: "G", cue: "G12", stage: 3, polarity: "take", axisPrior: "neutral transaction" },
  curt_to_server: { channel: "G", cue: "G11", stage: 3, polarity: "refuse", axisPrior: "low warmth to low-status" },
  // the SAME courtesy act toward a high-status figure — the gradient vs the server isolates warmth
  // from status-management (dilemma a). Same channel/cue, different counterpart_status in context.
  courtesy_to_high: { channel: "G", cue: "G11", stage: 3, polarity: "take", axisPrior: "warmth/status-management (gradient vs server)" },
  wait_in_queue: { channel: "H", cue: "H1", stage: 3, polarity: "take", axisPrior: "fairness/formality (norm-internalization)" },
  cut_queue: { channel: "H", cue: "H1", stage: 3, polarity: "refuse", axisPrior: "dominance/low-fairness" },
  let_others_ahead: { channel: "H", cue: "H2", stage: 3, polarity: "take", axisPrior: "warmth/fairness" },
  group_initiate: { channel: "G", cue: "G1", stage: 3, polarity: "take", axisPrior: "dominance/energy/warmth" },
  group_join: { channel: "G", cue: "G1", stage: 3, polarity: "take", axisPrior: "warmth/energy" },
  group_observe: { channel: "A", cue: "A4", stage: 3, polarity: "take", axisPrior: "observer / low energy" },
  group_avoid: { channel: "G", cue: "G1", stage: 3, polarity: "refuse", axisPrior: "avoidance / introversion" },
  conform_custom: { channel: "H", cue: "H3", stage: 3, polarity: "take", axisPrior: "conformity/consistency" },
  // deviating is an AFFIRMATIVE assertive act (not a Channel-K non-action) — polarity "take" so the
  // refusal twin doesn't inject a spurious approach/warmth-negative load over its dominance signal.
  deviate_custom: { channel: "H", cue: "H3", stage: 3, polarity: "take", axisPrior: "openness/dominance ⚑" },
  include_marginal: { channel: "G", cue: "G1", stage: 3, polarity: "take", axisPrior: "warmth(HIGH) — moral-social" },
  ignore_marginal: { channel: "G", cue: "G1", stage: 3, polarity: "refuse", axisPrior: "low warmth" },
  join_exclusion: { channel: "D", cue: "D9", stage: 3, polarity: "take", axisPrior: "dominance/low-warmth" },
  // ── STAND cues — the travel stand (the co-presence amplifier; F2+ and F6). A single-actor
  //    choice (counterpart "none"); far/near is the openness/risk read. ⚑ openness routes off-axis
  //    under the committed W (the cross-flow gap) — flagged in known-gaps, not silently re-routed. ──
  travel_near: { channel: "A", cue: "K4", stage: 2, polarity: "take", axisPrior: "conventional / low novelty (the known shore) — cue-catalog K4, never-sets-sail twin" },
  travel_far: { channel: "A", cue: "A11", stage: 2, polarity: "take", axisPrior: "openness/novelty-seeking + risk — leave the familiar (cue-catalog A11 sail-out) ⚑" },
  prepare_before_travel: { channel: "C", cue: "C7", stage: 2, polarity: "take", axisPrior: "planning/conscientiousness" },

  // ── STAND cues — the food/dining stand (F3 clearing, reused F4/F6 community: eat / treat / host) ──
  eat_meal: { channel: "G", cue: "G13", stage: 3, polarity: "take", axisPrior: "self-feeding (low social)" },
  treat_other: { channel: "F", cue: "F7", stage: 3, polarity: "take", axisPrior: "generosity (treat vs self) → warmth" },
  host_table: { channel: "G", cue: "G14", stage: 3, polarity: "take", axisPrior: "hosting → warmth/dominance/energy" },

  // ── STAND cues — the workplace/business stand (F1/F5: labour / vocation / time-allocation) ──
  work_shift: { channel: "C", cue: "C8", stage: 1, polarity: "take", axisPrior: "industriousness → energy/formality" },
  take_vocation: { channel: "C", cue: "C9", stage: 1, polarity: "take", axisPrior: "commit to a craft → persistence/formality/intellect" },
  shirk_work: { channel: "C", cue: "C8", stage: 1, polarity: "refuse", axisPrior: "avoidance / low-industriousness" },
  bargain_hard: { channel: "F", cue: "F9", stage: 3, polarity: "take", axisPrior: "dominance/economic-aggression" },
  fairness_split_fair: { channel: "F", cue: "F7", stage: 3, polarity: "take", axisPrior: "fairness/warmth" },
  // grabbing the larger share is an AFFIRMATIVE self-interested act — "take", not a refusal twin.
  fairness_split_greedy: { channel: "F", cue: "F9", stage: 3, polarity: "take", axisPrior: "self-interest/dominance" },
};

/** Every social action the server/client may reference (for validation + ingest gating). */
export const SOCIAL_ACTIONS = Object.keys(SOCIAL_CUES);

/**
 * Build one per-actor social BehavioralEvent. The server supplies the live, authoritative facts
 * (who the counterpart is and their status, how many could observe, the proxemic distance); the
 * action names the player's choice. Mandatory context is always complete (else the ingress 422s).
 */
export function buildSocialEvent(opts: {
  actorId: string;
  sessionId: string;
  action: string;
  counterpartId: string;
  counterpartStatus: CounterpartStatus;
  targetKind?: TargetKind;
  audienceSize?: number;
  stakes?: Stakes;
  raw?: RawSignals;
  contextOverride?: Partial<EventContext>;
}): BehavioralEvent {
  const def = SOCIAL_CUES[opts.action];
  if (!def) throw new Error(`unknown social action: ${opts.action}`);
  const ctx: EventContext = {
    stakes: opts.stakes ?? "low",
    audience_size: opts.audienceSize ?? 0,
    public_or_private: "public",
    counterpart_status: opts.counterpartStatus,
    stage: def.stage,
    scarcity_level: 0,
    mood_proxy: 0,
    time_pressure: 0,
    ...(opts.contextOverride ?? {}),
  };
  return {
    actor_id: opts.actorId,
    sessionId: opts.sessionId,
    t: Date.now(),
    type: "interaction_start",
    channel: def.channel,
    cue: def.cue,
    action: opts.action,
    polarity: def.polarity,
    target: {
      id: opts.counterpartId,
      kind: opts.targetKind ?? (opts.counterpartStatus === "peer" ? "player" : "npc"),
      status: opts.counterpartStatus,
    },
    context: ctx,
    raw_signals: opts.raw ?? {},
    payload: {},
    provenance: "live",
  };
}
