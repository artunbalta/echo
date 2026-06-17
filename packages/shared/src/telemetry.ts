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
  | "fork_deliberation"; // hover/undo before commit  payload: { forkKey, hovers, msDeliberated }

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
