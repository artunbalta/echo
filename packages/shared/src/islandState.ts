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

// ── the persisted state ─────────────────────────────────────────────────────────

export type CropStage = "none" | "planted" | "ripe" | "wilted";

export interface IslandDayState {
  /** The grain plot across days: a saved seed is planted, ripens by the next session,
   *  wilts if abandoned past SURVIVAL.DECAY.CROP_WILT_MS. */
  cropStage: CropStage;
  /** Epoch ms when the seed was saved/planted (drives ripening + wilt). Null when no crop. */
  cropPlantedAt: number | null;
  /** Raft/structure progress 0..1. Half-built structures weather between sessions. */
  structureProgress: number;
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
    structureProgress: 0,
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
  const next: IslandDayState = { ...state, tieWarmth: { ...state.tieWarmth }, updatedAt: now };

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

  // Structures: only unfinished work weathers.
  if (state.structureProgress > 0 && state.structureProgress < 1) {
    const weathered = Math.max(
      0,
      state.structureProgress - SURVIVAL.DECAY.STRUCT_WEATHER_PER_DAY * elapsedDays,
    );
    if (weathered < state.structureProgress - 1e-9) {
      next.structureProgress = weathered;
      if (elapsedDays >= 0.5) changes.push("the raft you started has weathered a little");
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
  /** Structure progress earned today (build dwell + started raft), 0..1 delta. */
  buildDelta01: number;
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
  const next: IslandDayState = { ...state, tieWarmth: { ...state.tieWarmth }, updatedAt: now };
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

  next.structureProgress = clamp01(state.structureProgress + day.buildDelta01);

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
