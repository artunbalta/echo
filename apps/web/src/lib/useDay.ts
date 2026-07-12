"use client";

/**
 * useDay — the island day-loop state machine (blueprint P1 / VII.2, storyboard VI.A/VI.B).
 * Three clocks against a finite you:
 *
 *   • DAYLIGHT — a real-time budget (SURVIVAL.DAY_MS). dayPhase01 runs 0 (dawn) → 1
 *     (nightfall); at 1 the day closes wherever you stand.
 *   • VITALITY — drains at VITALITY_DRAIN_PER_MIN × scarcityMultiplier; what you do near
 *     each station feeds or spends it (forage +, rest +, build −). At 0 you COLLAPSE:
 *     the day is lost, the world advances, you wake weakened (soft-irreversible, §I.6).
 *   • SCARCITY — loaded from persisted state; tomorrow's level is a function of today's
 *     choices (closeDay in @echo/shared). A lean day makes every allocation costlier —
 *     difficulty is resolution, not punishment (§IV.3).
 *
 * The hook owns clocks + persistence; the UI (IslandClient) owns the stations and forks.
 * All state renders DIEGETICALLY (sun, body, bushes) — no numeric bars (Law 1, §V.1).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SURVIVAL,
  scarcityMultiplier,
  closeDay,
  type CropStage,
  type DaySummary,
  type IslandDayState,
} from "@echo/shared";

/** Per-second vitality effect of lingering near a station category (fractions of max/sec).
 *  Felt game reasons first: foraging feeds you, rest restores gently, building spends you. */
const DWELL_VITALITY_PER_SEC: Record<string, number> = {
  earn: +0.003, // the bush feeds you while you forage
  leisure: +0.0012, // the bedroll restores, slowly — resting spends daylight instead
  build: -0.0011, // working the raft invests calories beyond the baseline drain
};

/** How often the ambient survival_tick samples the three clocks (context carrier). */
const TICK_EVERY_MS = 30_000;

export type DuskReason = "campfire" | "nightfall" | "collapse";

export interface DayClockState {
  ready: boolean;
  /** 0 dawn → 1 nightfall. Drives the sun arc / shadow length / ambient light. */
  dayPhase01: number;
  /** 0 collapsed → 1 full. Drives the avatar's posture/tint — never a bar. */
  vitality01: number;
  /** Today's scarcity 0..1 (the EventContext scale). */
  scarcityLevel: number;
  dayCount: number;
  crop: CropStage;
  structureProgress: number;
  /** In-tone "while you were gone" lines from wall-clock decay (the honest return hook). */
  changes: string[];
  /** Set once when the day has closed (by campfire, nightfall, or collapse). */
  duskReason: DuskReason | null;
}

export interface UseDayOptions {
  userId: string;
  /** Ambient sampler → telemetry (respecting consent upstream). */
  onSurvivalTick?: (t: { vitality01: number; daylight01: number; scarcityLevel: number; dayCount: number }) => void;
  /** The day closed on its own (nightfall / collapse) — the UI ends the day now. */
  onForcedDusk?: (reason: Exclude<DuskReason, "campfire">) => void;
}

export interface UseDayApi extends DayClockState {
  /** Feed/spend vitality from a discrete act (eat grain +0.3, harvest +0.35, …). */
  addVitality: (delta01: number) => void;
  /** The category currently being lingered at (from onNearbyChange) — drives dwell effects. */
  setDwellCategory: (cat: string | null) => void;
  /** Mark today's crop consumed/harvested (the plot empties; closeDay records it). */
  noteCropHarvested: () => void;
  /** Clear a wilted crop (the plot empties without a harvest — the consequence stands). */
  noteCropCleared: () => void;
  /**
   * The seed is in the ground the moment it's saved — persisted immediately (not at dusk),
   * so the irreversible fork survives even a closed tab. Soft-irreversibility is real.
   */
  notePlanted: () => void;
  /** Note the raft/structure work done today (persisted at close). */
  noteBuildDelta: (delta01: number) => void;
  /**
   * Close the day (the one write point): folds the summary through the pure closeDay and
   * persists. Returns the next-morning state (already saved) for the "new day" transition.
   */
  finishDay: (
    summary: Omit<DaySummary, "endVitality01" | "buildDelta01" | "harvested">,
    reason: DuskReason,
  ) => Promise<IslandDayState | null>;
  /** Begin the next day in place (after the dusk card): reset clocks from the saved state. */
  beginNextDay: (state: IslandDayState) => void;
}

export function useDay({ userId, onSurvivalTick, onForcedDusk }: UseDayOptions): UseDayApi {
  const [clock, setClock] = useState<DayClockState>({
    ready: false,
    dayPhase01: 0,
    vitality01: 0.85,
    scarcityLevel: 0.15,
    dayCount: 0,
    crop: "none",
    structureProgress: 0,
    changes: [],
    duskReason: null,
  });

  const stateRef = useRef<IslandDayState | null>(null);
  const vitalityRef = useRef(0.85);
  const phaseRef = useRef(0);
  const dwellCatRef = useRef<string | null>(null);
  const harvestedRef = useRef(false);
  const buildDeltaRef = useRef(0);
  const duskRef = useRef<DuskReason | null>(null);
  const lastTickEmitRef = useRef(0);
  const cbRef = useRef({ onSurvivalTick, onForcedDusk });
  cbRef.current = { onSurvivalTick, onForcedDusk };

  // ── load persisted state once (decay applied server-side, exactly once) ──────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      let loaded: { state: IslandDayState; changes: string[] } | null = null;
      try {
        const res = await fetch(`/api/island/state?userId=${encodeURIComponent(userId)}`);
        if (res.ok) loaded = (await res.json()) as { state: IslandDayState; changes: string[] };
      } catch {
        /* zero-network fallback below */
      }
      if (cancelled) return;
      const now = Date.now();
      const state: IslandDayState = loaded?.state ?? {
        cropStage: "none", cropPlantedAt: null, structureProgress: 0, vitalityCarry: 0.85,
        scarcityLevel: 0.15, dayCount: 0, tieWarmth: {}, updatedAt: now,
      };
      stateRef.current = state;
      vitalityRef.current = Math.max(0.05, state.vitalityCarry);
      phaseRef.current = 0;
      setClock({
        ready: true,
        dayPhase01: 0,
        vitality01: vitalityRef.current,
        scarcityLevel: state.scarcityLevel,
        dayCount: state.dayCount,
        crop: state.cropStage,
        structureProgress: state.structureProgress,
        changes: loaded?.changes ?? [],
        duskReason: null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ── the 1 Hz clock: daylight advances, vitality drains, dusk forces itself ───────
  useEffect(() => {
    if (!clock.ready) return;
    const timer = setInterval(() => {
      if (duskRef.current) return; // the day is closed; clocks hold for the dusk card
      const s = stateRef.current;
      if (!s) return;

      phaseRef.current = Math.min(1, phaseRef.current + 1000 / SURVIVAL.DAY_MS);

      const drainPerSec =
        (SURVIVAL.VITALITY_DRAIN_PER_MIN / SURVIVAL.VITALITY_MAX / 60) * scarcityMultiplier(s.scarcityLevel);
      const dwell = DWELL_VITALITY_PER_SEC[dwellCatRef.current ?? ""] ?? 0;
      vitalityRef.current = Math.max(0, Math.min(1, vitalityRef.current - drainPerSec + dwell));

      const now = Date.now();
      if (now - lastTickEmitRef.current >= TICK_EVERY_MS) {
        lastTickEmitRef.current = now;
        cbRef.current.onSurvivalTick?.({
          vitality01: Number(vitalityRef.current.toFixed(3)),
          daylight01: Number((1 - phaseRef.current).toFixed(3)),
          scarcityLevel: s.scarcityLevel,
          dayCount: s.dayCount,
        });
      }

      setClock((c) => ({ ...c, dayPhase01: phaseRef.current, vitality01: vitalityRef.current }));

      if (vitalityRef.current <= 0) {
        duskRef.current = "collapse";
        setClock((c) => ({ ...c, duskReason: "collapse" }));
        cbRef.current.onForcedDusk?.("collapse");
      } else if (phaseRef.current >= 1) {
        duskRef.current = "nightfall";
        setClock((c) => ({ ...c, duskReason: "nightfall" }));
        cbRef.current.onForcedDusk?.("nightfall");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [clock.ready]);

  const addVitality = useCallback((delta01: number) => {
    vitalityRef.current = Math.max(0, Math.min(1, vitalityRef.current + delta01));
    setClock((c) => ({ ...c, vitality01: vitalityRef.current }));
  }, []);

  const setDwellCategory = useCallback((cat: string | null) => {
    dwellCatRef.current = cat;
  }, []);

  const noteCropHarvested = useCallback(() => {
    harvestedRef.current = true;
    if (stateRef.current) stateRef.current = { ...stateRef.current, cropStage: "none", cropPlantedAt: null };
    setClock((c) => ({ ...c, crop: "none" }));
  }, []);

  const noteCropCleared = useCallback(() => {
    if (stateRef.current) stateRef.current = { ...stateRef.current, cropStage: "none", cropPlantedAt: null };
    setClock((c) => ({ ...c, crop: "none" }));
  }, []);

  const notePlanted = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const now = Date.now();
    const next: IslandDayState = { ...s, cropStage: "planted", cropPlantedAt: now, updatedAt: now };
    stateRef.current = next;
    setClock((c) => ({ ...c, crop: "planted" }));
    void fetch("/api/island/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, state: next }),
    }).catch(() => {});
  }, [userId]);

  const noteBuildDelta = useCallback((delta01: number) => {
    buildDeltaRef.current += delta01;
  }, []);

  const finishDay = useCallback(
    async (
      summary: Omit<DaySummary, "endVitality01" | "buildDelta01" | "harvested">,
      reason: DuskReason,
    ): Promise<IslandDayState | null> => {
      const s = stateRef.current;
      if (!s) return null;
      duskRef.current = reason;
      const full: DaySummary = {
        ...summary,
        harvested: harvestedRef.current,
        buildDelta01: buildDeltaRef.current,
        endVitality01: vitalityRef.current,
        collapse: reason === "collapse" || summary.collapse,
      };
      const next = closeDay(s, full, Date.now());
      stateRef.current = next;
      setClock((c) => ({ ...c, duskReason: reason }));
      try {
        await fetch("/api/island/state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, state: next }),
        });
      } catch {
        /* zero-key/offline: the in-memory server store is the fallback; a failed save
           never blocks the dusk — the day still closes for the player */
      }
      return next;
    },
    [userId],
  );

  const beginNextDay = useCallback((state: IslandDayState) => {
    // A night has passed: yesterday's planted seed greets the morning ripe (the storyboard's
    // "the grain you saved will be ready tomorrow" — the return hook honoured in place).
    if (state.cropStage === "planted") state = { ...state, cropStage: "ripe" };
    stateRef.current = state;
    vitalityRef.current = Math.max(0.05, state.vitalityCarry);
    phaseRef.current = 0;
    harvestedRef.current = false;
    buildDeltaRef.current = 0;
    duskRef.current = null;
    setClock({
      ready: true,
      dayPhase01: 0,
      vitality01: vitalityRef.current,
      scarcityLevel: state.scarcityLevel,
      dayCount: state.dayCount,
      crop: state.cropStage,
      structureProgress: state.structureProgress,
      changes: [],
      duskReason: null,
    });
  }, []);

  return {
    ...clock,
    addVitality,
    setDwellCategory,
    noteCropHarvested,
    noteCropCleared,
    notePlanted,
    noteBuildDelta,
    finishDay,
    beginNextDay,
  };
}
