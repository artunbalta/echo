/**
 * Moderation (DECISIONS C67): strangers report what is wrong; moderators undo a stranger's traces in
 * the shared world, and can bar them from changing it.
 *
 * WHO MODERATES: the subjects in `ECHO_MODERATORS`, by their signed identity, and nobody else.
 *
 * WHAT AN UNDO DOES, AND WHAT IT CANNOT (L2: the past does not move). A stranger's traces are their
 * life changes in villages (C44, C50, C53, C66), the marks their acts left (C45), what villagers know of
 * their deeds (C45), and their house (C59). An undo, made today:
 *
 * - **plans not yet carried out are reversed the world's own way**: a planned leaving gets a `stay`
 *   (C44's own cancel); anything else not yet in effect (a wedding to come, an arrival, a trade from
 *   tomorrow) is withdrawn, since nobody has lived it yet;
 * - **what took hold is let go from today**: a wish they talked someone into is dropped (`drop`), and
 *   a trade they talked someone into is given up for the old one, from tomorrow;
 * - **what already happened stands**: a family that left has left, a wedding that was is a marriage.
 *   That is history, and other strangers saw it;
 * - **every mark they left heals today**, and **the villagers forget their deeds**;
 * - **their house comes down** only if the moderator says so.
 *
 * Every action is logged (`moderation_actions`), so moderation is answerable too.
 */
import "server-only";

import { NextResponse } from "next/server";
import { goalId, occupationOn, type LifeChange, type Occupation } from "@echo/planet";

import type { Traces } from "@/lib/moderationTypes";
import type { VillageStore } from "@/lib/villageStore";

export const MODERATION = {
  /** A report's snapshot reaches this many world days back (two real hours and a half). */
  snapshotDays: 14,
  noteChars: 300,
  /** A bar lasts this long unless the moderator says otherwise. */
  barDays: 7,
} as const;

/** Whether this subject moderates, by `ECHO_MODERATORS`. */
export function isModerator(subject: string): boolean {
  return (process.env.ECHO_MODERATORS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(subject);
}

export interface UndoPlan {
  /** Changes not yet in effect, withdrawn. */
  remove: { cell: string; id: string; kind: LifeChange["kind"] }[];
  /** The world's own reversals, made today. */
  counter: { cell: string; change: Omit<LifeChange, "id"> }[];
  /** Marks healed today. */
  heal: { cell: string; id: string }[];
  /** Changes that stand, as history. */
  stands: { cell: string; id: string; kind: LifeChange["kind"] }[];
  forgetDeeds: boolean;
  removeHome: boolean;
}

/**
 * What undoing a stranger's traces would do, today. Pure. `occupationBefore` says what someone did the
 * day before a trade they were talked into, so they can go back to it.
 */
export function undoPlan(
  traces: Traces,
  today: number,
  occupationBefore: (cell: string, person: string, day: number) => Occupation | null,
  opts: { removeHome?: boolean } = {},
): UndoPlan {
  const plan: UndoPlan = { remove: [], counter: [], heal: [], stands: [], forgetDeeds: traces.deeds.length > 0, removeHome: !!opts.removeHome && traces.home !== null };
  for (const { cell, change: c } of traces.changes) {
    if (c.day > today) {
      if (c.kind === "leave") plan.counter.push({ cell, change: { person: c.person, kind: "stay", madeDay: today, day: today } });
      else plan.remove.push({ cell, id: c.id, kind: c.kind });
      continue;
    }
    if (c.kind === "goal" && c.goal) {
      plan.counter.push({ cell, change: { person: c.person, kind: "drop", goalId: goalId(c.goal, c.target ?? null, c.occupation ?? null), madeDay: today, day: today } });
    } else if (c.kind === "trade" && c.occupation) {
      const before = occupationBefore(cell, c.person, c.day - 1);
      if (before && before !== c.occupation) plan.counter.push({ cell, change: { person: c.person, kind: "trade", occupation: before, madeDay: today, day: today + 1 } });
      else plan.stands.push({ cell, id: c.id, kind: c.kind });
    } else plan.stands.push({ cell, id: c.id, kind: c.kind });
  }
  for (const { cell, mark } of traces.marks) if (mark.untilDay > today) plan.heal.push({ cell, id: mark.id });
  return plan;
}

/** Carry an undo out. Returns what was done, for the log. */
export async function applyUndo(store: VillageStore, subject: string, plan: UndoPlan, today: number, counterBy: string): Promise<Record<string, number>> {
  let removed = 0;
  let countered = 0;
  let healed = 0;
  for (const r of plan.remove) if (await store.deleteChange(r.cell, r.id)) removed++;
  for (const c of plan.counter) if (await store.addChange(c.cell, c.change, counterBy)) countered++;
  for (const h of plan.heal) if (await store.healMark(h.cell, h.id, today)) healed++;
  const forgot = plan.forgetDeeds && (await store.forgetDeeds(subject)) ? 1 : 0;
  const home = plan.removeHome && (await store.removeHome(subject)) ? 1 : 0;
  return { removed, countered, healed, stands: plan.stands.length, forgotDeeds: forgot, removedHome: home };
}

/** What someone did on a day, from their village as it was. */
export function occupationOf(people: readonly { id: string }[], person: string, day: number): Occupation | null {
  const p = people.find((x) => x.id === person) as Parameters<typeof occupationOn>[0] | undefined;
  return p ? occupationOn(p, day) : null;
}

const barred = new Map<string, { until: number; at: number }>();

/**
 * The answer a barred stranger gets from anything that would change the shared world, or null for
 * everyone else. A bar is read at most every half minute per stranger; a store that cannot be read
 * bars nobody (the world is not closed for a database's hiccup).
 */
export async function refuseBarred(store: VillageStore | null, subject: string, now = Date.now()): Promise<NextResponse | null> {
  if (!store) return null;
  let known = barred.get(subject);
  if (!known || now - known.at > 30_000) {
    const b = await store.barOf(subject);
    known = { until: b ? Date.parse(b.until) : 0, at: now };
    barred.set(subject, known);
  }
  return known.until > now ? NextResponse.json({ error: "barred", until: new Date(known.until).toISOString() }, { status: 403 }) : null;
}

/** For tests and for a moderator's own change of mind: forget what was read. */
export function forgetBars(subject?: string): void {
  if (subject) barred.delete(subject);
  else barred.clear();
}
