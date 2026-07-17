/**
 * Island day-state — multi-session world memory (ECHO_PLAYABLE_BLUEPRINT.md Part I §I.5,
 * VII.4; closes known-gaps #5). The island stops being a diorama that resets and becomes a
 * homestead that remembers: crops persist and wilt, structures weather, ties cool, scarcity
 * compounds. Loss is a scar the world remembers, never a game-over — the *self* (posterior)
 * and the *island* (slot) are never lost (soft-irreversibility, §I.6).
 *
 * This module is PURE (no I/O, no clock, no randomness — `now` is always injected), mirroring
 * archipelago.ts exactly: a pure core + an IslandStateStore seam that the web app backs with
 * Supabase when keyed and an in-memory store otherwise (the zero-key path).
 */
import { SURVIVAL } from "./world.js";
import { MIN_BUILD_MS } from "./raft.js";
import { RAFT_BUILD } from "./flow1.js";

// ── the persisted state ─────────────────────────────────────────────────────────

export type CropStage = "none" | "planted" | "ripe" | "wilted";

/**
 * The raft, as it actually stands on your shore between sessions.
 *
 * This replaced a single `structureProgress: number` that only ever moved 0.1 per day, when you
 * CLICKED "begin the raft" — a commitment accumulator wearing a build meter's name. The raft is
 * now built by hand (gather the driftwood, hold the lashings), and these are the three channels
 * seaworthiness is made of. They are stored, not derived, because `raft.ts` keeps them
 * deliberately INDEPENDENT (0.45·work + 0.4·wood + 0.15·grit) — extra wood must be worth
 * something without extra work — and no single 0..1 scalar can be un-mixed back into three.
 * `structureProgress01()` below is the lossy projection the day loop reads; it is derived from
 * THIS, never stored beside it, so the two can never drift apart.
 */
export interface RaftBuildState {
  /** Driftwood lengths gathered, 0..RAFT_BUILD.driftwoodCount. Wood on a beach does not rot. */
  planks: number;
  /** Real held work at the lashings, ms. Weathers between sessions — lashings loosen. */
  workMs: number;
  /** Lashing slips met, and how many were worked through — the grit channel. */
  slipsHit: number;
  slipsRecovered: number;
  /** Once the hull is in the water the build is over, and a finished thing never decays (§III.6). */
  launched: boolean;
}

export function freshRaft(): RaftBuildState {
  return { planks: 0, workMs: 0, slipsHit: 0, slipsRecovered: 0, launched: false };
}

/**
 * The day loop's 0..1 read of the raft (K4's "never began it", the station's language, the
 * `leave_intent` payload). Purely derived — half gathering, half lashing, 1 once it floats:
 *   first pick      → > 0        (you began; K4 is satisfied by an act, not a click)
 *   all 5 lengths   → 0.5
 *   it would float  → 1.0
 */
export function structureProgress01(raft: RaftBuildState): number {
  if (raft.launched) return 1;
  const gathered = clamp01(raft.planks / RAFT_BUILD.needed);
  const worked = clamp01(raft.workMs / MIN_BUILD_MS);
  return clamp01(0.5 * gathered + 0.5 * worked);
}

export interface IslandDayState {
  /** The grain plot across days: a saved seed is planted, ripens by the next session,
   *  wilts if abandoned past SURVIVAL.DECAY.CROP_WILT_MS. */
  cropStage: CropStage;
  /** Epoch ms when the seed was saved/planted (drives ripening + wilt). Null when no crop. */
  cropPlantedAt: number | null;
  /** The raft on your shore, as you left it. Half-built lashings weather between sessions. */
  raft: RaftBuildState;
  /** Wake-up vitality 0..1 carried from the last day's end (collapse wakes you weakened). */
  vitalityCarry: number;
  /** Tomorrow's scarcity 0 (plenty) .. 1 (famine) — set by closeDay from today's choices. */
  scarcityLevel: number;
  /** Days lived on this island. NOT a level/score (Invariant 1): never surfaced as one. */
  dayCount: number;
  /** Tended-tie warmth per counterpart id, 0..1. Cools toward 0 between sessions (G7). */
  tieWarmth: Record<string, number>;
  /** Epoch ms of the last persisted change — the anchor wall-clock decay measures from. */
  updatedAt: number;
}

export function freshIslandState(now: number): IslandDayState {
  return {
    cropStage: "none",
    cropPlantedAt: null,
    raft: freshRaft(),
    vitalityCarry: 0.85,
    scarcityLevel: 0.15,
    dayCount: 0,
    tieWarmth: {},
    updatedAt: now,
  };
}

// ── wall-clock decay (applied once on session load — Part I §I.5) ────────────────

export interface DecayResult {
  state: IslandDayState;
  /** In-tone descriptions of what changed while the player was away — the honest return
   *  hook (ux-audit M5): only ever reports REAL state change, never a streak nag. */
  changes: string[];
}

const DAY_IN_MS = 24 * 3600 * 1000;

/**
 * Age the island by the wall-clock time since `state.updatedAt`. Idempotent for elapsed=0.
 * Crops ripen (a session away is enough) or wilt (past the wilt window); half-built
 * structures weather; ties cool toward baseline. A finished structure (progress >= 1) does
 * not decay — you can lose progress, never a completed thing (stakes, not trauma; §III.6).
 */
export function applyWallClockDecay(state: IslandDayState, now: number): DecayResult {
  const elapsedMs = Math.max(0, now - state.updatedAt);
  if (elapsedMs === 0) return { state, changes: [] };
  const elapsedDays = elapsedMs / DAY_IN_MS;
  const changes: string[] = [];
  const next: IslandDayState = {
    ...state,
    raft: { ...state.raft },
    tieWarmth: { ...state.tieWarmth },
    updatedAt: now,
  };

  // Crop: planted → ripe by your next return; ripe/planted → wilted past the window.
  if ((state.cropStage === "planted" || state.cropStage === "ripe") && state.cropPlantedAt !== null) {
    const cropAge = now - state.cropPlantedAt;
    if (cropAge > SURVIVAL.DECAY.CROP_WILT_MS) {
      next.cropStage = "wilted";
      changes.push("the grain you saved has wilted — left too long");
    } else if (state.cropStage === "planted" && cropAge > 60_000) {
      next.cropStage = "ripe";
      changes.push("the grain you saved has ripened");
    }
  }

  // The raft: only unfinished work weathers, and it weathers on the REAL quantity — the lashings
  // loosen, so held work is what you lose. Wood already dragged up the beach does not rot, and a
  // launched raft is a finished thing (§III.6: you can lose progress, never a completed thing).
  // The rate is unchanged (STRUCT_WEATHER_PER_DAY, a fraction/day), just applied to workMs.
  if (!state.raft.launched && state.raft.workMs > 0) {
    const lost = SURVIVAL.DECAY.STRUCT_WEATHER_PER_DAY * elapsedDays * MIN_BUILD_MS;
    const weathered = Math.max(0, state.raft.workMs - lost);
    if (weathered < state.raft.workMs - 1e-9) {
      next.raft.workMs = weathered;
      if (elapsedDays >= 0.5) changes.push("the lashings on the raft you started have worked loose");
    }
  }

  // Ties cool toward baseline.
  for (const [id, w] of Object.entries(state.tieWarmth)) {
    const cooled = Math.max(0, w - SURVIVAL.DECAY.TIE_COOL_PER_DAY * elapsedDays);
    next.tieWarmth[id] = cooled;
    if (w >= 0.5 && cooled < 0.5) changes.push("a bond you tended has cooled while you were gone");
  }

  return { state: next, changes };
}

// ── closing a day (the campfire `end` — Part VI.A dusk) ─────────────────────────

export interface DaySummary {
  /** The grain fork: committed option, or null when left undecided (a K-refusal, Law 2). */
  grain: "save" | "spend" | null;
  /** True when a crop that was ripe at day-start was harvested today. */
  harvested: boolean;
  /** The tide wager: committed side, or null when left undecided. */
  bet: "risky" | "safe" | null;
  /** Outcome of a risky bet (undefined when no bet / safe). */
  betWon?: boolean;
  /** The raft as it stands at dusk — the build's own state, carried forward verbatim. Not a
   *  delta: the build IS the source of truth, so the day fold copies it rather than
   *  accumulating a second number beside it that could drift. Null when the build never ran
   *  (e.g. a session that never loaded the F1 scene), which leaves yesterday's raft alone. */
  raft: RaftBuildState | null;
  /** Time-share fractions of the day (sum ~1). */
  alloc: { earn: number; learn: number; social: number; leisure: number; build: number };
  /** Vitality at the moment the day closed, 0..1. */
  endVitality01: number;
  /** The day ended by collapse (vitality hit zero) — you lose the day, the world advances. */
  collapse: boolean;
  /** Tie-warmth earned today per counterpart (e.g. time with the pet). Applied clamped. */
  tieDeltas?: Record<string, number>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Fold a finished day into the next morning's state — the one write point of the loop.
 * Tomorrow's scarcity is a *function of today's allocation* (Part I §I.4): poor foraging,
 * spent seed and lost wagers lean the island; harvests and saved seed ease it. Collapse
 * compounds (+0.25 scarcity, wake weakened at 0.30 vitality) but never resets (§I.6).
 */
export function closeDay(state: IslandDayState, day: DaySummary, now: number): IslandDayState {
  const next: IslandDayState = {
    ...state,
    raft: { ...state.raft },
    tieWarmth: { ...state.tieWarmth },
    updatedAt: now,
  };
  next.dayCount = state.dayCount + 1;

  // The grain plot.
  if (day.harvested) {
    next.cropStage = "none";
    next.cropPlantedAt = null;
  }
  if (day.grain === "save") {
    next.cropStage = "planted";
    next.cropPlantedAt = now;
  } else if (day.grain === "spend" && !day.harvested) {
    next.cropStage = "none";
    next.cropPlantedAt = null;
  }

  // The raft the hands actually built, carried forward as-is — never re-derived, never summed
  // with a parallel counter. Only the build writes it.
  if (day.raft) next.raft = { ...day.raft };

  // Wake-up vitality: what you ended with, floored so tomorrow is playable; collapse wakes
  // you weakened at 0.30 — harder than Minecraft (loss compounds), never a clean-slate death.
  next.vitalityCarry = day.collapse ? 0.3 : Math.max(0.15, clamp01(day.endVitality01));

  // Tomorrow's scarcity from today's choices.
  let s = state.scarcityLevel;
  if (day.collapse) s += 0.25;
  s += day.alloc.earn < 0.15 ? 0.12 : -0.08; // foraged little → a leaner tomorrow
  if (day.grain === "spend") s += 0.05;
  if (day.grain === "save") s -= 0.05;
  if (day.harvested) s -= 0.2;
  if (day.bet === "risky") s += day.betWon ? -0.1 : 0.1;
  next.scarcityLevel = clamp01(s);

  // Ties tended today warm; untended ones are left to the between-session cooling.
  for (const [id, delta] of Object.entries(day.tieDeltas ?? {})) {
    next.tieWarmth[id] = clamp01((next.tieWarmth[id] ?? 0) + delta);
  }

  return next;
}

/** Warm (or cool) a tended tie by `delta`, clamped to [0,1]. Feeds G7 tie-persistence. */
export function tendTie(state: IslandDayState, counterpartId: string, delta: number): IslandDayState {
  const cur = state.tieWarmth[counterpartId] ?? 0;
  return {
    ...state,
    tieWarmth: { ...state.tieWarmth, [counterpartId]: clamp01(cur + delta) },
  };
}

// ── persistence seam (mirrors archipelago.IslandStore exactly) ───────────────────

export interface IslandStateStore {
  /** Load a user's island state, or null when they have none yet. */
  load(userId: string): Promise<IslandDayState | null>;
  /** Persist the full state (upsert). */
  save(userId: string, state: IslandDayState): Promise<void>;
  /** Hard-delete a user's island state (the §13 erasure cascade). */
  remove(userId: string): Promise<void>;
}

/** Zero-dependency in-memory store — the zero-key fallback. Process-lifetime durable, so a
 *  local dev server keeps your island across page reloads with no database. */
export class InMemoryIslandStateStore implements IslandStateStore {
  private states = new Map<string, IslandDayState>();

  async load(userId: string): Promise<IslandDayState | null> {
    return this.states.get(userId) ?? null;
  }

  async save(userId: string, state: IslandDayState): Promise<void> {
    this.states.set(userId, state);
  }

  async remove(userId: string): Promise<void> {
    this.states.delete(userId);
  }
}
