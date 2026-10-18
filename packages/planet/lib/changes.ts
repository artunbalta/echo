/**
 * Changes to a life (DECISIONS C44): what a conversation decided, as a dated fact the world is
 * generated FROM rather than a patch laid over it.
 *
 * THE SEED IS THE PRIOR, THE DATABASE IS THE DELTA (L1), and this module is the delta's grammar. A
 * change says that a person, on a day, decided to leave, to stay after all, to take up a trade, to
 * want something, or to stop wanting it. `settlementAt` reads the changes for its cell and generates
 * the village with them in it: a woman who leaves takes her husband and her young children with her,
 * the children she would have had afterwards are never born, and the man who would have married her
 * daughter pairs with somebody else — computed, not stored. One row, and the whole cascade follows
 * from it, which is what C26 said could not be done and why it said so; C44 records why it now can.
 *
 * THE PAST DOES NOT MOVE. A change takes effect on or after the day it was made, and nothing in
 * `society.ts` reads a change before its own day, so the village generated to any day before the
 * earliest change is the seed's village exactly (L2, restated for a world with a delta in it).
 *
 * A CLOSED GRAMMAR, NO FREE TEXT. Five kinds, each with a structured payload: a trade from the
 * declared list, a goal from `goals.ts`'s catalogue, a goal id. Nothing a stranger typed and nothing
 * a model wrote is stored here, because what is stored here is shown to every other visitor. What a
 * conversation was ABOUT is the stranger's own memory (the talk route's), private to them.
 *
 * Pure. No clock, no I/O, and only type imports, so `society.ts` can read it without a cycle.
 */

import type { Occupation } from "./society.js";

export type ChangeKind = "leave" | "stay" | "trade" | "goal" | "drop";

/** What a person can come to want, from a closed list (`goals.ts`). */
export type GoalKind =
  | "own-boat"
  | "own-house"
  | "find-partner"
  | "see-beyond"
  | "tend-grave"
  | "teach-trade"
  | "look-after"
  | "learn-trade";

export interface LifeChange {
  /** Unique and totally ordered among a cell's changes: ties on `madeDay` break on it. */
  id: string;
  /** `Person.id` (C43) of the person whose life it is. */
  person: string;
  kind: ChangeKind;
  /** The world day the decision was made. */
  madeDay: number;
  /** The world day it takes effect. Never before `madeDay`. */
  day: number;
  /** `trade`: what they take up. `goal` of kind `learn-trade`: what they want to learn. */
  occupation?: Occupation;
  /** `goal`: which. */
  goal?: GoalKind;
  /** `goal`: who it is about, by `Person.id`, for the goals that are about somebody. */
  target?: string;
  /** `drop`: the id of the goal given up (`goals.ts` {@link goalId}). */
  goalId?: string;
}

/** The demographic half of a person's changes: everything `settlementAt` has to know. */
export interface Resolved {
  /** The day they leave for good, or `Infinity`. */
  leftDay: number;
  /** Trades taken up, oldest first. */
  trades: { day: number; occupation: Occupation }[];
}

/** Changes in the order they were made: day, then id. The one order every reader agrees on. */
export function byMade(a: LifeChange, b: LifeChange): number {
  return a.madeDay - b.madeDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * What a cell's changes come to, person by person, for the generator.
 *
 * A leave is a plan until its day: a `stay` decided before then cancels it, and a later `leave`
 * replaces it. A `stay` decided on or after the day they went has nobody to say it to, and is
 * ignored. A trade takes effect on its day and lasts until the next.
 */
export function resolveChanges(changes: readonly LifeChange[]): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  const of = (person: string): Resolved => {
    let r = out.get(person);
    if (r === undefined) {
      r = { leftDay: Infinity, trades: [] };
      out.set(person, r);
    }
    return r;
  };
  for (const c of [...changes].sort(byMade)) {
    if (c.day < c.madeDay) continue; // the past does not move
    if (c.kind === "leave") {
      const r = of(c.person);
      if (r.leftDay <= c.madeDay) continue; // already gone
      r.leftDay = c.day;
    } else if (c.kind === "stay") {
      const r = out.get(c.person);
      if (r !== undefined && r.leftDay > c.madeDay) r.leftDay = Infinity;
    } else if (c.kind === "trade" && c.occupation !== undefined) {
      const r = of(c.person);
      if (r.leftDay <= c.madeDay) continue;
      r.trades.push({ day: c.day, occupation: c.occupation });
    }
  }
  for (const r of out.values()) r.trades.sort((a, b) => a.day - b.day);
  return out;
}
