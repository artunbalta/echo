/**
 * What a villager would ask a stranger for (DECISIONS C50): one small thing at a time, from their
 * life, and met by doing it.
 *
 * NOT A QUEST LOG. There is no list, no reward and no count (Design Law 1). A need is a sentence a
 * villager has on their mind this week — a child who wants a shell, a man building a boat who is short
 * of wood for it, a widow who would be glad of help with her husband's grave, a household whose crop a
 * stranger trampled — said aloud when a stranger comes near (`villagersLayer`) and in conversation
 * (`villager.ts`), and met when someone does the thing. Nothing marks a needy villager on the screen.
 *
 * FROM THEIR LIFE, AND THE SAME FOR EVERYONE. A need is drawn deterministically from the person, the
 * week and their circumstances: their age, their trade, their goals (`goals.ts`), their dead, the
 * marks on their things. About one person in four has one in a given week, and someone at work on a
 * goal that takes time usually does; the next week brings new ones. Meeting it is shared: it is a
 * `met` change (`changes.ts`), so once one stranger has brought the shell, the child has it for
 * everyone, and the need is gone for the week.
 *
 * WHAT MEETING IT DOES. If the need was for a goal that takes time, the goal comes nearer
 * (`goals.ts` {@link helpDays}), and a wish the seed saw is begun by it: wood brought to a man who
 * wanted a boat is a boat he is now building, at the dock every evening. And whoever was helped knows
 * who helped (the deed is the act's own, `deeds.ts`; the facts say it was the thing they needed).
 *
 * Pure.
 */

import type { GoalKind, LifeChange } from "./changes.js";
import { goalsOf, type Goal } from "./goals.js";
import { ITEMS } from "./items.js";
import { present } from "./life.js";
import { ageYears, hash01, occupationOn, type Occupation, type Person, type Settlement } from "./society.js";
import { activeEffects, fieldOwners, type WorldEffect } from "./things.js";
import type { VillagePlan } from "./village.js";

export interface Need {
  /** `${person}/${week}/${what}`: stable for the week, and the `goalId` of the `met` change that meets it. */
  id: string;
  person: string;
  /** What meets it: an item given to them (or left at their door)... */
  item?: string;
  /** ...or a verb done to a thing (`things.ts` reference). */
  verb?: string;
  thing?: string;
  /** In the villager's own words, to a stranger. */
  text: string;
  /** The goal it is for, if it is for one: meeting it brings the goal nearer. */
  goal?: { kind: GoalKind; target: string | null; occupation: Occupation | null };
  /** The world day the need came to mind, and the day it is forgotten if nobody meets it. */
  since: number;
  until: number;
}

export const NEEDS = {
  /** How long a need lasts: a week of world days. */
  weekDays: 7,
  /** About this share of people have a need in a given week... */
  share: 0.25,
  /** ...and this share of those at work on a goal that takes time have one for it. */
  goalShare: 0.6,
  /** Nobody younger asks a stranger for anything. */
  minAgeYears: 5,
} as const;

/** What each trade could use, and what a goal that takes time is short of. Every value is an item. */
export const TRADE_WANTS: Partial<Record<Occupation, string>> = {
  fisher: "hook and line",
  weaver: "reed",
  carpenter: "driftwood",
  smith: "ore",
  stonecutter: "hammer",
  farmer: "basket",
  miner: "torch",
};

const GOAL_WANTS: Partial<Record<GoalKind, { item: string; words: string }>> = {
  "own-boat": { item: "driftwood", words: "I'm short of wood for the boat. A good piece of driftwood would go into it" },
  "own-house": { item: "stone", words: "The walls of my house take more stone than I can carry. A good flat stone would help" },
};

const goalNeed = (s: Settlement, p: Person, g: Goal): { item: string; text: string } | null => {
  const want = GOAL_WANTS[g.kind];
  if (want) return { item: want.item, text: want.words };
  if (g.kind === "learn-trade" && g.occupation) {
    const item = TRADE_WANTS[g.occupation];
    return item ? { item, text: `I'm learning to be a ${g.occupation}. If I had ${ITEMS[item].name} of my own I'd learn faster` } : null;
  }
  if (g.kind === "teach-trade" && g.target) {
    const item = TRADE_WANTS[occupationOn(p, g.since)];
    const who = s.people.find((q) => q.id === g.target);
    return item && who ? { item, text: `I'm teaching ${who.given} the trade. ${ITEMS[item].name[0].toUpperCase()}${ITEMS[item].name.slice(1)} for them to learn on would help` } : null;
  }
  return null;
};

/** The need on this person's mind this week, if any, and if nobody has met it yet. */
export function needOf(
  s: Settlement,
  plan: VillagePlan | null,
  p: Person,
  day: number,
  changes: readonly LifeChange[] = [],
  effects: readonly WorldEffect[] = [],
): Need | null {
  if (!present(s, p, day) || p.visiting) return null; // a visitor (C53) asks this village for nothing
  const age = ageYears(p, day);
  if (age < NEEDS.minAgeYears) return null;
  const week = Math.floor(day / NEEDS.weekDays);
  const since = week * NEEDS.weekDays;
  const until = since + NEEDS.weekDays;
  const make = (what: string, rest: Omit<Need, "id" | "person" | "since" | "until">): Need => ({ id: `${p.id}/${week}/${what}`, person: p.id, since, until, ...rest });

  // A crop a stranger trampled comes first, whatever the week would have brought: the field is put
  // right by weeding it (the mark heals under the tending, `activeEffects`).
  if (plan && age >= 16) {
    for (const e of activeEffects(effects, day).values()) {
      if (e.kind !== "trampled" || !e.thing.startsWith("field:")) continue;
      if (!fieldOwners(s, plan, Number(e.thing.slice(6)), day).includes(p.id)) continue;
      // The need is the field's, not the week's: it lasts as long as the mark does.
      const id = `${p.id}/${e.id}/field`;
      if (changes.some((c) => c.kind === "met" && c.goalId === id && c.madeDay <= day)) continue;
      return { id, person: p.id, verb: "tend", thing: e.thing, text: "Somebody trampled our field. I could use a hand putting it right", since: e.day, until: e.untilDay };
    }
  }

  // Met, by somebody — and one a week: whoever was helped this week does not think of another need
  // until the next. (The help may have changed what they want — wood brought for a boat is a boat
  // begun — but not this week.)
  const metThisWeek = changes.some((c) => c.kind === "met" && c.person === p.id && c.madeDay <= day && c.goalId?.startsWith(`${p.id}/${week}/`));
  if (metThisWeek) return null;

  const goals = age >= 14 ? goalsOf(s, p, day, changes).active : [];
  // A goal under way is short of something most weeks.
  const begun = goals.find((g) => g.source !== "seed" && g.doneDay !== null && goalNeed(s, p, g));
  if (begun && hash01(`${p.id}/need/${week}/goal`) < NEEDS.goalShare) {
    const n = goalNeed(s, p, begun)!;
    return make(`goal:${n.item}`, { item: n.item, text: n.text, goal: { kind: begun.kind, target: begun.target, occupation: begun.occupation } });
  }

  if (hash01(`${p.id}/need/${week}`) >= NEEDS.share) return null;
  const pick = hash01(`${p.id}/need/${week}/what`);

  if (age < 13) {
    const want = pick < 0.5 ? "shell" : pick < 0.8 ? "stone" : "berries";
    return make(want, { item: want, text: want === "shell" ? "Have you got a shell? A good one, with the pink inside" : want === "stone" ? "I need a flat stone, a really flat one, for skipping" : "I'm hungry. Do you know where there are berries?" });
  }
  // From a wish the seed can see: wood for a boat not yet begun is how it is begun.
  const wish = goals.find((g) => g.source === "seed" && goalNeed(s, p, g));
  if (wish && pick < 0.4) {
    const n = goalNeed(s, p, wish)!;
    return make(`goal:${n.item}`, { item: n.item, text: n.text, goal: { kind: wish.kind, target: wish.target, occupation: wish.occupation } });
  }
  const grave = goals.find((g) => g.kind === "tend-grave" && g.target);
  if (grave && pick < 0.7) {
    const dead = s.people.find((q) => q.id === grave.target);
    if (dead) return make("grave", { verb: "tidy", thing: `grave:${dead.id}`, text: `I don't get up to ${dead.given}'s grave as often as I should. If you passed it, you could pull the grass back from the stone` });
  }
  const elder = goals.find((g) => g.kind === "look-after" && g.target);
  if (elder && pick < 0.85) {
    const old = s.people.find((q) => q.id === elder.target);
    if (old) return make("elder", { item: "berries", text: `${old.given} can't get out to the bushes any more. If you came by some berries, I'd take them round` });
  }
  if (age >= 65) return make("berries", { item: "berries", text: "My knees won't take me to the bushes any more. A few berries would be welcome" });
  const want = TRADE_WANTS[occupationOn(p, day)];
  if (want) return make(want, { item: want, text: `I could use ${ITEMS[want].name}, if you came across one` });
  return make("berries", { item: "berries", text: "I've had no time to go picking. A handful of berries would not go amiss" });
}

/** Everyone's needs today, for a village: the browser's and the route's one list. */
export function needsOn(
  s: Settlement,
  plan: VillagePlan | null,
  day: number,
  changes: readonly LifeChange[] = [],
  effects: readonly WorldEffect[] = [],
): Map<string, Need> {
  const out = new Map<string, Need>();
  for (const p of s.people) {
    if (p.deathDay <= day || p.birthDay > day) continue;
    const n = needOf(s, plan, p, day, changes, effects);
    if (n) out.set(p.id, n);
  }
  return out;
}

/** An act, as the act route knows it: the verb, the thing's reference, what was given, and whose it was. */
export interface NeedAct {
  verb: string;
  thing: string;
  item?: string | null;
  /** For a gift handed to a villager: who. */
  toPerson?: string | null;
  /** Whose the thing was (a house's household, a field's, a grave's kin). */
  owners?: readonly string[];
}

/** Does this act meet this need? The item handed to them or left at their door, or the verb on the thing. */
export function meets(need: Need, act: NeedAct): boolean {
  if (need.item) {
    if (act.verb !== "give" || act.item !== need.item) return false;
    return act.toPerson === need.person || (!act.thing.startsWith("villager:") && (act.owners ?? []).includes(need.person));
  }
  return act.verb === need.verb && act.thing === need.thing;
}

/** What someone says when the thing they needed is done: theirs to say, and nothing more (no reward). */
export function thanksFor(need: Need): string {
  if (need.goal?.kind === "own-boat") return "That'll go into the boat. Thank you — truly.";
  if (need.goal?.kind === "own-house") return "That'll go into the walls. Thank you.";
  if (need.goal) return "That's just what I needed. Thank you.";
  if (need.verb === "tend") return "You've put it right. I didn't think anyone would.";
  if (need.verb === "tidy") return "You tidied it. They'd have liked that.";
  if (need.id.endsWith("/elder")) return "I'll take them round this evening. Thank you.";
  if (need.item === "shell" || need.item === "stone") return "For me? It's a good one!";
  return "Oh — that's just what I needed. Thank you.";
}

/** The `met` change that records a need met, without its id (the store gives it one). */
export function metChange(need: Need, day: number): Omit<LifeChange, "id"> {
  return {
    person: need.person,
    kind: "met",
    madeDay: day,
    day,
    goalId: need.id,
    ...(need.goal ? { goal: need.goal.kind } : {}),
    ...(need.goal?.target ? { target: need.goal.target } : {}),
    ...(need.goal?.occupation ? { occupation: need.goal.occupation } : {}),
  };
}
