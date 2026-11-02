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
 * A CLOSED GRAMMAR, NO FREE TEXT. Six kinds, each with a structured payload: a trade from the
 * declared list, a goal from `goals.ts`'s catalogue, a goal id, a need's id (`met`, C50: somebody
 * brought what a villager wanted, and the stranger who comes after finds it brought). Nothing a
 * stranger typed and nothing a model wrote is stored here, because what is stored here is shown to
 * every other visitor. What a conversation was ABOUT is the stranger's own memory (the talk route's),
 * private to them.
 *
 * Pure. No clock, no I/O, and only type imports, so `society.ts` can read it without a cycle.
 */

import type { Intervention } from "./mortality.js";
import type { Occupation } from "./society.js";

/** A move or a marriage between villages, as one village's generator reads it (C53). */
export interface Arrival {
  day: number;
  fromCell: string;
  people: PortablePerson[];
}

/**
 * The arrivals in a cell's changes, by day: the `arrive` changes made on one day from one village are
 * one party (a family comes together). Only changes that have taken effect by their own day count.
 */
export function arrivalsOf(changes: readonly LifeChange[]): Arrival[] {
  const by = new Map<string, Arrival>();
  for (const c of [...changes].sort(byMade)) {
    if (c.kind !== "arrive" || !c.spec || !c.fromCell || c.day < c.madeDay) continue;
    const k = `${c.day}|${c.fromCell}|${c.madeDay}`;
    const a = by.get(k) ?? { day: c.day, fromCell: c.fromCell, people: [] };
    if (!a.people.some((p) => p.id === c.spec!.id)) a.people.push(c.spec);
    by.set(k, a);
  }
  return [...by.values()].sort((a, b) => a.day - b.day || (a.fromCell < b.fromCell ? -1 : 1));
}

/** Marriages a stranger brought about (C53): `pair` changes, the first for each person winning. */
export function pairsOf(changes: readonly LifeChange[]): { a: string; b: string; day: number; madeDay: number }[] {
  const out: { a: string; b: string; day: number; madeDay: number }[] = [];
  const taken = new Set<string>();
  for (const c of [...changes].sort(byMade)) {
    if (c.kind !== "pair" || !c.target || c.day < c.madeDay) continue;
    if (taken.has(c.person) || taken.has(c.target)) continue;
    taken.add(c.person);
    taken.add(c.target);
    out.push({ a: c.person, b: c.target, day: c.day, madeDay: c.madeDay });
  }
  return out.sort((x, y) => x.day - y.day);
}

/**
 * `met`: a need (C50) was met, by `goalId` = the need's id. Shared, like every change.
 * `arrive`, `court`, `pair` (C53): someone came here from another village (or came home); someone
 * here has said they would marry someone a stranger told them of; and a marriage that came of it.
 */
/** `tend` and `ashore` (C66): a stranger met a death coming — fetched the healer, or kept a fisher ashore. */
export type ChangeKind = "leave" | "stay" | "trade" | "goal" | "drop" | "met" | "arrive" | "court" | "pair" | "tend" | "ashore";

/**
 * A person as another village needs them (C53): everything the generator would have drawn for them
 * at home, carried in the change that brings them, so the village they come to can have them without
 * generating the one they left. Nothing here is free text; every field is the home village's own.
 */
export interface PortablePerson {
  id: string;
  seedKey: string;
  given: string;
  family: string;
  sex: "f" | "m";
  birthDay: number;
  deathDay: number;
  pairAgeDays: number;
  /** What they did on the day they left. */
  occupation: Occupation;
  /** The eight axes, as their home village drew them (`life.ts`). */
  temperament: readonly number[];
  /** A partner coming with them, by id, and the day they paired. */
  partner?: string;
  partnerDay?: number;
  /** For a child coming with their parents: [mother, father], by id. */
  parents?: readonly [string, string];
  /** How many children they had already had: the cap on children still to come. */
  children?: number;
  /** For someone coming to marry: whom, by id. They stay in that family's house until the wedding. */
  hostOf?: string;
  /** Here for a day, to meet `hostOf` (C53): they pair with nobody here, and go home the next morning. */
  visiting?: boolean;
}

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
  /** `goal`: which. `met`: the goal the need was for, if it was for one (C50). */
  goal?: GoalKind;
  /** `goal`: who it is about, by `Person.id`, for the goals that are about somebody. */
  target?: string;
  /** `drop`: the id of the goal given up (`goals.ts` {@link goalId}). `met`: the need's id (`needs.ts`). */
  goalId?: string;
  /** `leave` and `court`: the village they go to, or the one the person courted lives in (C53). */
  toCell?: string;
  /** `arrive`: the village they came from. */
  fromCell?: string;
  /** `arrive`: who came. */
  spec?: PortablePerson;
  /** `tend` (C66): who tended them, the healer or herbs. */
  by?: "healer" | "herbs";
}

/** The demographic half of a person's changes: everything `settlementAt` has to know. */
export interface Resolved {
  /** The day they leave for good, or `Infinity`. */
  leftDay: number;
  /** Where they went, if it is known (C53). */
  toCell: string | null;
  /** Trades taken up, oldest first. */
  trades: { day: number; occupation: Occupation }[];
  /** What a stranger did for them as a death came (C66): `mortality.ts` weighs it. */
  fate: Intervention[];
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
      r = { leftDay: Infinity, toCell: null, trades: [], fate: [] };
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
      r.toCell = c.toCell ?? null;
    } else if (c.kind === "stay") {
      const r = out.get(c.person);
      if (r !== undefined && r.leftDay > c.madeDay) {
        r.leftDay = Infinity;
        r.toCell = null;
      }
    } else if (c.kind === "tend" || c.kind === "ashore") {
      of(c.person).fate.push({ kind: c.kind, day: c.day, ...(c.by ? { by: c.by } : {}) });
    } else if (c.kind === "trade" && c.occupation !== undefined) {
      const r = of(c.person);
      if (r.leftDay <= c.madeDay) continue;
      r.trades.push({ day: c.day, occupation: c.occupation });
    }
  }
  for (const r of out.values()) r.trades.sort((a, b) => a.day - b.day);
  return out;
}
