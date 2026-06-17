/**
 * The day — scarcity + irreversible forks (BUILD-PLAN §0.C). Pure client game logic: no LLM, no
 * network. A bounded day of choices that REVEAL revealed preference under irreversibility, then
 * get featurized into the persona posterior via the §3 spine.
 *
 * This module owns the day's *content* and the telemetry-event *builders* only — the UI lives in
 * IslandClient, the forwarding in /api/island/observe, the featurization in the ML service. Keep
 * it pure and deterministic so the day can be reasoned about (and later persisted, Phase 1).
 */
import type { TelemetryEvent, TelemetryType } from "@echo/shared";

// ── binary forks ────────────────────────────────────────────────────────────────────
export interface ForkOption {
  id: string;
  label: string;
}
export interface Fork {
  key: string;
  prompt: string;
  options: ForkOption[];
}

export const DAY_FORKS: Fork[] = [
  {
    key: "plant_or_spend",
    prompt: "A handful of seed-grain is all you have. Plant it for a harvest you may not live to see — or eat it now.",
    options: [
      { id: "save", label: "Plant it" },
      { id: "spend", label: "Eat it now" },
    ],
  },
  {
    key: "start_ship",
    prompt: "The far shore is a smudge on the horizon. You could begin building a ship to leave — or stay, for now.",
    options: [
      { id: "start", label: "Begin the ship" },
      { id: "stay", label: "Stay on the shore" },
    ],
  },
];

// ── the day's hours: an allocation across five ways to spend yourself ─────────────────
export type AllocCategory = "earn" | "learn" | "social" | "leisure" | "build";
export const ALLOC_CATEGORIES: { id: AllocCategory; label: string; note: string }[] = [
  { id: "earn", label: "forage", note: "gather what keeps you alive" },
  { id: "learn", label: "study the island", note: "read the land, the tides, yourself" },
  { id: "social", label: "be with the small one", note: "company against the quiet" },
  { id: "leisure", label: "rest", note: "do nothing; let the day pass" },
  { id: "build", label: "work the ship", note: "an hour against the horizon" },
];
/** Hours in the day to distribute — the scarcity that makes the allocation reveal priorities. */
export const DAY_HOURS = 6;

export type Allocation = Record<AllocCategory, number>;
export const emptyAllocation = (): Allocation => ({ earn: 0, learn: 0, social: 0, leisure: 0, build: 0 });
export const allocationSpent = (a: Allocation): number => ALLOC_CATEGORIES.reduce((s, c) => s + a[c.id], 0);

// ── a wager: risk vs safety under irreversibility ─────────────────────────────────────
export interface BetSide {
  id: "safe" | "risky";
  label: string;
  expectedValue: number;
  variance: number;
}
export interface BetDef {
  key: string;
  prompt: string;
  stake: number;
  safe: BetSide;
  risky: BetSide;
}
export const DAY_BET: BetDef = {
  key: "tide_wager",
  prompt: "The tide is turning strange. Set every trap on one risky run for a great catch — or keep a steady, modest line.",
  stake: 3,
  safe: { id: "safe", label: "Keep the steady line", expectedValue: 1, variance: 0.1 },
  risky: { id: "risky", label: "Risk it all on the run", expectedValue: 1.4, variance: 0.9 },
};

// ── telemetry-event builders (the §3.1 taxonomy) ──────────────────────────────────────
const ev = (type: TelemetryType, sessionId: string, payload: Record<string, unknown>): TelemetryEvent => ({
  type,
  sessionId,
  ts: Date.now(),
  payload,
});

export function choiceMadeEvent(
  sessionId: string,
  fork: Fork,
  option: ForkOption,
  latencyMs: number,
  dayIndex = 0,
): TelemetryEvent {
  return ev("choice_made", sessionId, {
    forkKey: fork.key,
    option: option.id,
    optionsShown: fork.options.length,
    latencyMs,
    dayIndex,
    irreversible: true,
  });
}

export function forkDeliberationEvent(sessionId: string, forkKey: string, hovers: number, msDeliberated: number): TelemetryEvent {
  return ev("fork_deliberation", sessionId, { forkKey, hovers, msDeliberated });
}

export function structureProgressEvent(
  sessionId: string,
  structure: string,
  opts: { started?: boolean; finished?: boolean; delta01: number; sessionSeconds: number },
): TelemetryEvent {
  return ev("structure_progress", sessionId, { structure, started: !!opts.started, finished: !!opts.finished, delta01: opts.delta01, sessionSeconds: opts.sessionSeconds });
}

export function leaveIntentEvent(
  sessionId: string,
  opts: { stage: string; dayIndex?: number; shipProgress01: number; secondsAlone: number },
): TelemetryEvent {
  return ev("leave_intent", sessionId, { stage: opts.stage, dayIndex: opts.dayIndex ?? 0, shipProgress01: opts.shipProgress01, secondsAlone: opts.secondsAlone });
}

/** Allocation as fractions of the day (sums to ~1) — the §3.2 time-share feature block. */
export function allocationEvent(sessionId: string, alloc: Allocation): TelemetryEvent {
  const spent = allocationSpent(alloc) || 1;
  const frac = (n: number) => Number((n / spent).toFixed(3));
  return ev("allocation", sessionId, {
    earn: frac(alloc.earn),
    learn: frac(alloc.learn),
    social: frac(alloc.social),
    leisure: frac(alloc.leisure),
    build: frac(alloc.build),
  });
}

export function resourceBetEvent(sessionId: string, bet: BetDef, side: BetSide): TelemetryEvent {
  return ev("resource_bet", sessionId, {
    stake: bet.stake,
    expectedValue: side.expectedValue,
    variance: side.variance,
    chosenRisk: side.id,
  });
}
