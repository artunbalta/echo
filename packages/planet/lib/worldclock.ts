/**
 * The world clock (DECISIONS C24, SOCIETY-PLAN SOC-0.A(a)).
 *
 * Before this file there was no world clock. `skyLayer` accumulated `dt` from dusk PER MOUNT and
 * `parcelWorld` pinned `timeOfDay: 0.38` on every mount, so two people standing on the same ground
 * were looking at two different mornings and neither of them was the world's. That is survivable in
 * a world with one person in it and it is a fork in a shared one: the whole point of C27 is that the
 * parcel is a place two people are in at once, and a place has an hour.
 *
 * ONE EPOCH, AND IT IS NOT A CLOCK READING. `WorldManifest.createdAt` is the epoch. It was already
 * a per-world constant that a restart cannot move, which is the only property this job needs, and
 * using it means the clock is a fact about the world rather than about the process that happens to
 * be serving it. The hour is DERIVED, never accumulated: an accumulator drifts, and two accumulators
 * drift apart.
 *
 * THE RATE DOES NOT MOVE. A world-day is twelve real minutes, which is `skyLayer`'s existing cycle
 * and not a new number — {@link WORLD_DAY_S} is where that number lives now, and the sky imports it
 * rather than declaring its own (L5: one list, one place).
 *
 *     1 world-day    =        720 s real
 *     1 world-year   =    262,800 s real  = 73 hours EXACTLY  (365 x 720)
 *     a 70-year life = 18,396,000 s real  = 5,110 hours = 212 days 22 h
 *
 * WHY THIS FILE IS SO SMALL AND SO LOAD-BEARING. Once one birth or death timestamp exists, moving
 * `WORLD_DAY_S` rewrites every lifespan on the planet and any NPC a player has met becomes a
 * different person with a different age and a different set of dead parents. C24 records that as
 * irreversible. Treat these three constants the way `TILE_M` is treated.
 *
 * WHAT THIS CLOCK IS NOT. It is not a simulation tick and it does not want a host (SOC-3.E). Nothing
 * here runs; a world day is an arithmetic fact about the difference between two instants, which is
 * exactly what lets `society()` compute a lineage that was never simulated.
 *
 * Everything here is pure. No clock of its own, no randomness, no I/O — the caller supplies `nowMs`,
 * so a test and a screenshot can both ask for an hour that is not this one.
 */

// ── the three constants ─────────────────────────────────────────────────────────

/**
 * One world-day in real seconds. Twelve minutes.
 *
 * This IS `skyLayer`'s cycle, moved here rather than duplicated: the sky's full turn and the world's
 * day were always the same thing and were only ever written down in the renderer because nothing
 * else had asked yet. A society asks.
 */
export const WORLD_DAY_S = 12 * 60;

/** Days in a world-year. Earth's, because a year is a shared unit before it is a design dial. */
export const DAYS_PER_YEAR = 365;

/** One world-year in real seconds: 262,800, which is 73 real hours exactly. */
export const WORLD_YEAR_S = WORLD_DAY_S * DAYS_PER_YEAR;

/**
 * The world's epoch, and the only mutable input to any of this.
 *
 * `epochMs` is `Date.parse(manifest.createdAt)`. It is passed rather than read from the manifest so
 * that this module stays free of the registry, and so a test can hold an epoch still.
 */
export interface WorldClock {
  epochMs: number;
}

/** The clock of a world, from its manifest's `createdAt`. Throws on a date the platform cannot parse. */
export function worldClock(createdAt: string): WorldClock {
  const epochMs = Date.parse(createdAt);
  if (!Number.isFinite(epochMs)) throw new Error(`worldClock: createdAt is not a date: ${createdAt}`);
  return { epochMs };
}

// ── the derivations ─────────────────────────────────────────────────────────────

/**
 * World days since the epoch, fractional, and negative before it.
 *
 * Fractional on purpose: the integer part is the day a birth or a death is stamped with and the
 * fraction IS {@link timeOfDay}, so there is one number rather than two that can disagree.
 */
export function worldDay(clock: WorldClock, nowMs: number): number {
  return (nowMs - clock.epochMs) / 1000 / WORLD_DAY_S;
}

/** The whole day a moment falls in. `Math.floor`, so day -1 is the day before the epoch, not day 0. */
export function worldDayIndex(clock: WorldClock, nowMs: number): number {
  return Math.floor(worldDay(clock, nowMs));
}

/** World years since the epoch, fractional. */
export function worldYear(clock: WorldClock, nowMs: number): number {
  return worldDay(clock, nowMs) / DAYS_PER_YEAR;
}

/**
 * The hour, as `skyLayer` wants it: `[0, 1)`, 0 midnight, 0.25 sunrise, 0.5 midday, 0.75 sunset.
 *
 * This is the value that replaces `parcelWorld`'s pinned `0.38`. `0.38` was never a decision; it was
 * a screenshot of 09:07 that got left in a constructor, and it is reproducible any time by asking
 * for an instant rather than by pinning one.
 */
export function timeOfDay(clock: WorldClock, nowMs: number): number {
  const day = worldDay(clock, nowMs);
  const frac = day - Math.floor(day);
  // A negative input already floors correctly above; this only guards the -0 and 1-1e-16 edges.
  return frac < 0 ? frac + 1 : frac >= 1 ? 0 : frac;
}

/** The inverse: the first instant at or after the epoch whose whole day is `day`. */
export function msAtWorldDay(clock: WorldClock, day: number): number {
  return clock.epochMs + day * WORLD_DAY_S * 1000;
}

// ── the units a society is written in ───────────────────────────────────────────

/** World days in `years` world-years. The society speaks days; people speak years. */
export const yearsToDays = (years: number): number => years * DAYS_PER_YEAR;

/** World years in `days` world-days, fractional. An age is this. */
export const daysToYears = (days: number): number => days / DAYS_PER_YEAR;

/** Real seconds a span of world days takes to elapse. The honest answer to "how long do I wait". */
export const daysToRealSeconds = (days: number): number => days * WORLD_DAY_S;
