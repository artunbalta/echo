/**
 * How people die from now on (DECISIONS C66): a risk run year by year, not a lifespan drawn at birth.
 *
 * C26 drew every lifespan at birth and made it immutable. From `MORTALITY.fromDay` on, a death that
 * has not yet happened is decided here instead, and a stranger can change it:
 *
 * - **Each year of a life**, a yearly risk is weighed against a number of the person's own: age (a
 *   Gompertz–Makeham curve with a child's years in front of it, set so the planet lives as long as
 *   it did), and the sea for a fisher, the mine for a miner.
 * - **A death is never sudden.** One of illness comes after a week or two in bed (`ailingFrom`). One
 *   at sea is a day a fisher goes out under a wrong sky and does not come back (`seaDay`, the day
 *   before the death). Both can be seen coming, and both can be met:
 *   - **tended** (`tend`): the healer fetched, or herbs left, while they lie ill. It may be enough:
 *     more often for the young, rarely for the very old, and less often with herbs than a healer;
 *   - **kept ashore** (`ashore`) on the day itself: then the sea does not have them that year.
 *   A death met and turned is a year lived; the next year is weighed as any other.
 *
 * THE PAST DOES NOT MOVE (L2). A death drawn at birth that falls on or before `fromDay` stands: the
 * dead stay dead, the graves stay where they are, and everyone alive on that day is who they were.
 * Only deaths not yet lived are decided here, each once. An intervention changes a life only from its
 * own day, and only that person's: every number is drawn from the person's own stream in a fixed
 * order, five a year whether used or not, so whether a year was survived or turned, the years after
 * it are weighed against the same numbers.
 *
 * Pure.
 */
// A cycle with society.ts, which is fine: `stream` is only called when a fate is worked out.
import { stream } from "./society.js";

export const MORTALITY = {
  /**
   * The first world day decided here: 2026-10-20 00:00 UTC. Every death drawn for a day on or before
   * it stands as drawn. Move it to the day this ships, never back.
   */
  fromDay: 5160,
  /** Days in a year of the risk. */
  yearDays: 365,
  /** Nobody lives past this, as before. */
  maxYears: 96,
  /** A child's yearly risk: the first year, then up to five. Together about one in ten, as before. */
  infant: 0.04,
  child: 0.0125,
  childYears: 6,
  /**
   * Gompertz–Makeham for everyone older: background + a·e^(b·age). Measured over 40,000 lives: adults'
   * mean 67.0 years (the drawn model's 67), p10 53, p90 79; one child in ten before six, as before.
   */
  makeham: 0.0005,
  gompertzA: 0.0000052,
  gompertzB: 0.14,
  /** What a trade adds, a year, while working (14–70): about one fisher in nine is lost at sea. */
  sea: 0.0025,
  mine: 0.002,
  /** Days in bed before an illness ends a life, at least and at most. */
  ailingDays: [6, 16] as const,
  /** The chance that tending turns an illness, by age; herbs do half as well. */
  mend: [
    { under: 30, healer: 0.75 },
    { under: 60, healer: 0.6 },
    { under: 80, healer: 0.35 },
    { under: Infinity, healer: 0.15 },
  ] as const,
  herbs: 0.5,
} as const;

export type Cause = "illness" | "sea" | "mine";

export interface Intervention {
  kind: "tend" | "ashore";
  /** The world day it was done. */
  day: number;
  /** For a tending: who did it. */
  by?: "healer" | "herbs";
}

export interface Fate {
  deathDay: number;
  /** Null for a death drawn at birth on or before `fromDay`: history, not decided here. */
  cause: Cause | null;
  /** The first day in bed, for a death of illness. */
  ailingFrom: number | null;
  /** The day a fisher goes out and is lost, for a death at sea: the day before the death. */
  seaDay: number | null;
}

/** The yearly risk at an age, split by cause. */
export function yearlyRisk(ageYears: number, occupation: string): { illness: number; sea: number; mine: number } {
  const M = MORTALITY;
  let illness: number;
  if (ageYears < 1) illness = M.infant;
  else if (ageYears < M.childYears) illness = M.child;
  else {
    // The chance of dying within the year at this age: 1 − exp(−∫ hazard).
    const integral = M.makeham + (M.gompertzA * Math.exp(M.gompertzB * ageYears) * (Math.exp(M.gompertzB) - 1)) / M.gompertzB;
    illness = 1 - Math.exp(-integral);
  }
  const working = ageYears >= 14 && ageYears < 70;
  return { illness, sea: working && occupation === "fisher" ? M.sea : 0, mine: working && occupation === "miner" ? M.mine : 0 };
}

/** How likely tending is to turn an illness, at an age, by whom. */
export function mendChance(ageYears: number, by: "healer" | "herbs"): number {
  const row = MORTALITY.mend.find((m) => ageYears < m.under)!;
  return by === "healer" ? row.healer : row.healer * MORTALITY.herbs;
}

/**
 * A person's death from `fromDay` on, given who they are and what has been done for them. `drawn` is
 * the death their birth drew: on or before `fromDay`, it stands. `occupationOn` is what they do on a
 * day (a trade can change it, C44).
 */
export function fateOf(
  seedKey: string,
  birthDay: number,
  occupationOn: (day: number) => string,
  drawn: number,
  interventions: readonly Intervention[] = [],
): Fate {
  const M = MORTALITY;
  if (drawn <= M.fromDay) return { deathDay: drawn, cause: null, ailingFrom: null, seaDay: null };
  const r = stream(`${seedKey}/fate`);
  const start = Math.max(M.fromDay, birthDay);
  const last = birthDay + Math.round(M.maxYears * M.yearDays);
  for (let year = 0; ; year++) {
    const from = start + year * M.yearDays;
    // Five numbers a year, always, in this order: the years after are the same whatever this one was.
    const u = r();
    const which = r();
    const when = r();
    const lie = r();
    const mend = r();
    if (from >= last) return { deathDay: last, cause: "illness", ailingFrom: last - M.ailingDays[0], seaDay: null };
    const age = (from - birthDay) / M.yearDays;
    const risk = yearlyRisk(age, occupationOn(from));
    const total = risk.illness + risk.sea + risk.mine;
    if (u >= total) continue;
    const cause: Cause = which * total < risk.sea ? "sea" : which * total < risk.sea + risk.mine ? "mine" : "illness";
    // The day it comes, within the year, and never on or before the day this model begins.
    const deathDay = Math.min(last, Math.max(M.fromDay + 1, birthDay + 1, from + 1 + Math.floor(when * (M.yearDays - 1))));
    if (cause === "sea") {
      const seaDay = deathDay - 1;
      if (interventions.some((i) => i.kind === "ashore" && i.day === seaDay)) continue;
      return { deathDay, cause, ailingFrom: null, seaDay };
    }
    if (cause === "illness") {
      const ailingFrom = Math.max(birthDay, deathDay - (M.ailingDays[0] + Math.floor(lie * (M.ailingDays[1] - M.ailingDays[0] + 1))));
      const tended = interventions.filter((i) => i.kind === "tend" && i.day >= ailingFrom && i.day < deathDay);
      if (tended.length) {
        const by = tended.some((i) => i.by === "healer") ? "healer" : "herbs";
        if (mend < mendChance((deathDay - birthDay) / M.yearDays, by)) continue;
      }
      return { deathDay, cause, ailingFrom, seaDay: null };
    }
    return { deathDay, cause, ailingFrom: null, seaDay: null };
  }
}

/** A person as the world carries their fate (`Person.deathCause`, `ailingFrom`, `seaDay`). */
interface Fated {
  deathDay: number;
  deathCause?: Cause | null;
  ailingFrom?: number | null;
  seaDay?: number | null;
}

/** Lying ill on a day, of the illness that will end their life unless it is turned. */
export function isAiling(p: Fated, day: number): boolean {
  return p.deathCause === "illness" && p.ailingFrom != null && day >= p.ailingFrom && day < p.deathDay;
}

/** The day a fisher means to go out under a wrong sky, and will not come back unless kept ashore. */
export function isSeaDay(p: Fated, day: number): boolean {
  return p.deathCause === "sea" && p.seaDay === day;
}

