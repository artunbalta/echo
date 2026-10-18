/**
 * What a villager wants (DECISIONS C44), and what a conversation is allowed to change about it.
 *
 * TWO SOURCES, ONE LIST. Everyone old enough wants something the seed can see they would: a widow
 * keeps her husband's grave, a man of fifty wants to pass the forge to his grandson, a fisher's son
 * wants a boat of his own, a restless girl wants to see what lies past the hills. Those are SEED goals
 * — a function of the person's circumstances and temperament on the day, never stored — and they come
 * and go as circumstances do. A conversation can add one from the same catalogue, or give one up
 * (a TALK goal, which is a {@link LifeChange} and is shared: the next stranger meets someone who has
 * decided to build a boat). Nothing outside the catalogue can be wanted, because what is wanted is
 * shown to everyone who comes after.
 *
 * WHAT A GOAL DOES. It is talked about — the facts carry it — and a goal decided in conversation
 * moves the evening: someone who has decided to keep a grave spends their evenings in the graveyard,
 * someone about to leave stands at the edge of the village looking out (`schedule.ts`). Some goals
 * finish on their own after a while (a boat takes forty days to build); a wish like seeing the world
 * stays a wish until the person leaves, and leaving is its own change.
 *
 * NO LADDER (Design Law 1). No goal is a score, a rank or an amount, and none can be "won".
 *
 * THE VALIDATOR IS HERE, NOT IN THE ROUTE. Whether a change is possible is a fact about the world
 * (is she here, is she old enough, is she already leaving), so it is a pure function beside the
 * world, with tests, and the route only adds what the world cannot know (how well the stranger knows
 * her). The model proposes; this decides.
 */

import { byMade, resolveChanges, type GoalKind, type LifeChange } from "./changes.js";
import { LIVING_MEMORY_YEARS, OCCUPATIONS, ageYears, occupationOn, stream, type Occupation, type Person, type Settlement } from "./society.js";
import { present, temperamentOf } from "./life.js";
import { yearsToDays } from "./worldclock.js";

/** Where an evening goes while a talk goal is wanted. `work` means staying at it until dark. */
export type GoalPlace = "dock" | "edge" | "green" | "graveyard" | "home" | "work";

export interface GoalSpec {
  kind: GoalKind;
  /** In the villager's mouth. `{name}` is the person it is about, `{trade}` the trade. */
  text: string;
  place: GoalPlace;
  /** How long it takes once decided, in world days; null for a wish that stays one. */
  takesDays: number | null;
  /** Whether it is about somebody else in the village. */
  needsTarget: boolean;
}

export const GOALS: Record<GoalKind, GoalSpec> = {
  "own-boat": { kind: "own-boat", text: "a boat of my own", place: "dock", takesDays: 40, needsTarget: false },
  "own-house": { kind: "own-house", text: "a house of my own", place: "edge", takesDays: 150, needsTarget: false },
  "find-partner": { kind: "find-partner", text: "someone to share my life with", place: "green", takesDays: null, needsTarget: false },
  "see-beyond": { kind: "see-beyond", text: "to see what lies beyond this place", place: "edge", takesDays: null, needsTarget: false },
  "tend-grave": { kind: "tend-grave", text: "to keep {name}'s grave", place: "graveyard", takesDays: null, needsTarget: true },
  "teach-trade": { kind: "teach-trade", text: "to pass my trade on to {name}", place: "work", takesDays: 120, needsTarget: true },
  "look-after": { kind: "look-after", text: "to look after {name}", place: "home", takesDays: null, needsTarget: true },
  "learn-trade": { kind: "learn-trade", text: "to learn to be a {trade}", place: "work", takesDays: 60, needsTarget: false },
};

export const GOAL_KINDS = Object.keys(GOALS) as GoalKind[];

/** The bounds a change is held to. Each is a design dial, and each is in a test. */
export const CHANGE_LIMITS = {
  /** One decision per person per world day: nobody remakes their life twice before supper. */
  perPersonPerDay: 1,
  /** A leave is announced this many world days ahead at least, and at most... */
  leaveNoticeMinDays: 2,
  leaveNoticeMaxDays: 30,
  /** ...and at most one person in a village decides to leave in this many world days. */
  leaveEveryDays: 30,
  /** One change of trade per person per world year. */
  tradeEveryDays: 365,
  /** Goals a conversation can give someone at once. */
  maxTalkGoals: 3,
  minAgeYears: 14,
  minLeaveAgeYears: 16,
  maxLeaveAgeYears: 75,
  minTradeAgeYears: 16,
  maxTradeAgeYears: 60,
} as const;

export interface Goal {
  /** `${kind}`, or `${kind}:${target id}`, or `learn-trade:${trade}`. Stable while it is wanted. */
  id: string;
  kind: GoalKind;
  /** The words, with the name or trade filled in. */
  text: string;
  /** Who it is about, by `Person.id`. */
  target: string | null;
  occupation: Occupation | null;
  /** The day it began to be wanted. */
  since: number;
  source: "seed" | "talk";
  place: GoalPlace;
  /** For a talk goal that finishes: the day it will be (or was) done. */
  doneDay: number | null;
}

export function goalId(kind: GoalKind, target: string | null, occupation: Occupation | null): string {
  if (target !== null) return `${kind}:${target}`;
  if (occupation !== null) return `${kind}:${occupation}`;
  return kind;
}

const byIdIn = (s: Settlement) => {
  const m = new Map<string, Person>();
  for (const p of s.people) m.set(p.id, p);
  return m;
};

const fill = (spec: GoalSpec, target: Person | null, occupation: Occupation | null): string =>
  spec.text.replace("{name}", target ? target.given : "someone").replace("{trade}", occupation ?? "trade");

const kinOf = (s: Settlement, p: Person): Person[] => {
  const out: Person[] = [];
  if (p.partner !== null) out.push(s.people[p.partner]);
  if (p.parents !== null) {
    out.push(s.people[p.parents[0]], s.people[p.parents[1]]);
    for (const i of s.people[p.parents[0]].children) if (i !== p.index) out.push(s.people[i]);
  }
  for (const i of p.children) {
    out.push(s.people[i]);
    for (const g of s.people[i].children) out.push(s.people[g]);
  }
  return out;
};

/**
 * Is this goal one this person could have today? The same predicate for a seed goal and for a
 * conversation proposing one, so a conversation can never give someone a goal their life rules out.
 */
export function goalFits(s: Settlement, p: Person, day: number, kind: GoalKind, target: Person | null, occupation: Occupation | null): boolean {
  const age = ageYears(p, day);
  if (age < CHANGE_LIMITS.minAgeYears || !present(s, p, day)) return false;
  const spec = GOALS[kind];
  if (spec.needsTarget !== (target !== null)) return false;
  const trade = occupationOn(p, day);
  const partnerHere = p.partner !== null && present(s, s.people[p.partner], day);
  switch (kind) {
    case "own-boat":
      return s.geography.coastal >= 0.3 && age < 60 && (trade === "fisher" || trade === "labourer" || trade === "carpenter");
    case "own-house":
      return age >= 18 && age < 55;
    case "find-partner":
      return age >= 18 && age < 50 && !partnerHere;
    case "see-beyond":
      return age < 60;
    case "tend-grave": {
      // Someone of theirs who died here, within living memory.
      if (target === null || target.deathDay > day || !present(s, target, target.deathDay - 1)) return false;
      if (day - target.deathDay > yearsToDays(LIVING_MEMORY_YEARS)) return false;
      return kinOf(s, p).some((q) => q.id === target.id);
    }
    case "teach-trade": {
      if (target === null || age < 30 || !present(s, target, day)) return false;
      const ta = ageYears(target, day);
      return ta >= 10 && ta < 25;
    }
    case "look-after": {
      if (target === null || !present(s, target, day)) return false;
      return ageYears(target, day) >= 65 && kinOf(s, p).some((q) => q.id === target.id);
    }
    case "learn-trade":
      return occupation !== null && OCCUPATIONS.includes(occupation) && occupation !== trade && age < 50;
  }
}

/**
 * What the seed can see someone would want today. At most two, drawn by weight from those that fit,
 * the same every time for the same day. Some goals need someone in particular, and the seed picks the
 * plainest candidate: the latest grave, the eldest parent, the youngest apprentice-age grandchild.
 */
function seedGoals(s: Settlement, p: Person, day: number): Goal[] {
  const age = ageYears(p, day);
  if (age < CHANGE_LIMITS.minAgeYears) return [];
  const t = temperamentOf(s, p); // warmth, dominance, openness, energy, formality, intellect, pace, affect
  const kin = kinOf(s, p);
  const options: { kind: GoalKind; target: Person | null; occupation: Occupation | null; since: number; weight: number }[] = [];
  const add = (kind: GoalKind, target: Person | null, since: number, weight: number) => {
    if (weight > 0 && goalFits(s, p, day, kind, target, null)) options.push({ kind, target, occupation: null, since, weight });
  };

  const graves = kin.filter((q) => q.deathDay <= day).sort((a, b) => b.deathDay - a.deathDay);
  if (graves.length > 0) add("tend-grave", graves[0], graves[0].deathDay, day - graves[0].deathDay < yearsToDays(5) ? 5 : 2);
  const elders = kin.filter((q) => q.deathDay > day && ageYears(q, day) >= 65).sort((a, b) => a.birthDay - b.birthDay);
  if (elders.length > 0) add("look-after", elders[0], elders[0].birthDay + yearsToDays(65), 2 + Math.max(0, t[0]) * 2);
  const young = kin.filter((q) => q.deathDay > day && ageYears(q, day) >= 10 && ageYears(q, day) < 25).sort((a, b) => b.birthDay - a.birthDay);
  if (young.length > 0) add("teach-trade", young[0], young[0].birthDay + yearsToDays(10), 2);
  add("find-partner", null, p.birthDay + yearsToDays(20), 2 + Math.max(0, t[0]));
  add("own-boat", null, p.birthDay + yearsToDays(18), 1.5 + Math.max(0, t[3]));
  add("own-house", null, p.birthDay + yearsToDays(18), 1);
  add("see-beyond", null, p.birthDay + yearsToDays(16), Math.max(0, t[2]) * 5 - 0.3);

  const r = stream(`${p.id}/goals/${Math.floor(day / 365)}`);
  const out: Goal[] = [];
  for (let k = 0; k < 2 && options.length > 0; k++) {
    if (k === 1 && r() > 0.45 + 0.25 * t[3]) break; // a second goal, for the restless
    const total = options.reduce((a, o) => a + o.weight, 0);
    let x = r() * total;
    let i = 0;
    for (; i < options.length - 1; i++) {
      x -= options[i].weight;
      if (x < 0) break;
    }
    const o = options.splice(i, 1)[0];
    const spec = GOALS[o.kind];
    out.push({
      id: goalId(o.kind, o.target?.id ?? null, null),
      kind: o.kind,
      text: fill(spec, o.target, null),
      target: o.target?.id ?? null,
      occupation: null,
      since: Math.max(o.since, p.birthDay),
      source: "seed",
      place: spec.place,
      doneDay: null,
    });
  }
  return out;
}

export interface Goals {
  /** Wanted today. */
  active: Goal[];
  /** Talk goals finished by today: the boat that was built. */
  done: Goal[];
}

/**
 * Everything someone wants on a day: the seed's goals, plus what conversations gave them, minus what
 * they gave up. A goal given up stays given up even if the seed would offer it again.
 */
export function goalsOf(s: Settlement, p: Person, day: number, changes: readonly LifeChange[]): Goals {
  if (!present(s, p, day)) return { active: [], done: [] };
  const people = byIdIn(s);
  const mine = changes.filter((c) => c.person === p.id && c.madeDay <= day).sort(byMade);
  const dropped = new Set<string>();
  const talk = new Map<string, Goal>();
  for (const c of mine) {
    if (c.kind === "drop" && c.goalId) {
      dropped.add(c.goalId);
      talk.delete(c.goalId);
    } else if (c.kind === "goal" && c.goal) {
      const spec = GOALS[c.goal];
      const target = c.target ? (people.get(c.target) ?? null) : null;
      const occupation = c.goal === "learn-trade" ? (c.occupation ?? null) : null;
      const id = goalId(c.goal, target?.id ?? null, occupation);
      dropped.delete(id);
      talk.set(id, {
        id,
        kind: c.goal,
        text: fill(spec, target, occupation),
        target: target?.id ?? null,
        occupation,
        since: c.day,
        source: "talk",
        place: spec.place,
        doneDay: spec.takesDays === null ? null : c.day + spec.takesDays,
      });
    }
  }
  const active: Goal[] = [];
  const done: Goal[] = [];
  for (const g of talk.values()) {
    if (g.doneDay !== null && g.doneDay <= day) done.push(g);
    else if (g.since <= day) active.push(g);
  }
  for (const g of seedGoals(s, p, day)) if (!dropped.has(g.id) && !talk.has(g.id)) active.push(g);
  return { active, done };
}

/** Where someone's evening goes today, if a conversation has sent it anywhere (`schedule.ts`). */
export function eveningOf(s: Settlement, p: Person, day: number, changes: readonly LifeChange[]): { place: GoalPlace; target: string | null } | null {
  if (p.leftDay > day && p.leftDay !== Infinity) {
    // Decided to go, and not gone yet: the edge of the village, looking out.
    const decided = changes.some((c) => c.person === p.id && c.kind === "leave" && c.madeDay <= day);
    if (decided) return { place: "edge", target: null };
  }
  const talk = goalsOf(s, p, day, changes).active.filter((g) => g.source === "talk");
  if (talk.length === 0) return null;
  const g = talk[talk.length - 1];
  return { place: g.place, target: g.target };
}

// ── what a conversation may change ──────────────────────────────────────────────

/** What the model may propose. The route fills in the rest (`id`, `person`, `madeDay`). */
export type Proposal =
  | { kind: "leave"; inDays: number }
  | { kind: "stay" }
  | { kind: "trade"; occupation: Occupation }
  | { kind: "goal"; goal: GoalKind; target?: string | null; occupation?: Occupation | null }
  | { kind: "drop"; goalId: string };

export type Verdict = { ok: true; change: Omit<LifeChange, "id"> } | { ok: false; reason: string };

/**
 * Whether a proposed change is possible for this person today, and the change it would be.
 *
 * `s` must be the village generated WITH `changes`, so "is she already leaving" reads the world as
 * it now is. Every refusal names its rule, for the log and for the tests.
 */
export function checkChange(s: Settlement, p: Person, day: number, proposal: Proposal, changes: readonly LifeChange[]): Verdict {
  const age = ageYears(p, day);
  if (!present(s, p, day)) return { ok: false, reason: "not-here" };
  if (age < CHANGE_LIMITS.minAgeYears) return { ok: false, reason: "too-young" };
  const today = changes.filter((c) => c.person === p.id && c.madeDay === day);
  if (today.length >= CHANGE_LIMITS.perPersonPerDay) return { ok: false, reason: "decided-today" };
  const base = { person: p.id, madeDay: day };

  switch (proposal.kind) {
    case "leave": {
      if (age < CHANGE_LIMITS.minLeaveAgeYears || age > CHANGE_LIMITS.maxLeaveAgeYears) return { ok: false, reason: "age" };
      if (p.leftDay !== Infinity) return { ok: false, reason: "already-leaving" };
      const n = Math.round(proposal.inDays);
      if (!(n >= CHANGE_LIMITS.leaveNoticeMinDays && n <= CHANGE_LIMITS.leaveNoticeMaxDays)) return { ok: false, reason: "notice" };
      const recent = changes.some((c) => c.kind === "leave" && day - c.madeDay < CHANGE_LIMITS.leaveEveryDays);
      if (recent) return { ok: false, reason: "village-leave-cap" };
      return { ok: true, change: { ...base, kind: "leave", day: day + n } };
    }
    case "stay": {
      const decided = changes.some((c) => c.person === p.id && c.kind === "leave");
      if (p.leftDay === Infinity || !decided) return { ok: false, reason: "not-leaving" };
      // Only one's own decision can be unmade; a child taken by their parents cannot stay behind.
      const own = resolveChanges(changes.filter((c) => c.person === p.id)).get(p.id);
      if (own === undefined || own.leftDay === Infinity) return { ok: false, reason: "not-their-decision" };
      return { ok: true, change: { ...base, kind: "stay", day } };
    }
    case "trade": {
      if (age < CHANGE_LIMITS.minTradeAgeYears || age > CHANGE_LIMITS.maxTradeAgeYears) return { ok: false, reason: "age" };
      if (!OCCUPATIONS.includes(proposal.occupation)) return { ok: false, reason: "no-such-trade" };
      if (proposal.occupation === occupationOn(p, day)) return { ok: false, reason: "same-trade" };
      if (p.trades.some((t) => day - t.day < CHANGE_LIMITS.tradeEveryDays)) return { ok: false, reason: "trade-recently" };
      // A trade is taken up from the next morning.
      return { ok: true, change: { ...base, kind: "trade", day: day + 1, occupation: proposal.occupation } };
    }
    case "goal": {
      if (!GOAL_KINDS.includes(proposal.goal)) return { ok: false, reason: "no-such-goal" };
      const people = byIdIn(s);
      const target = proposal.target ? (people.get(proposal.target) ?? null) : null;
      if (proposal.target && target === null) return { ok: false, reason: "no-such-person" };
      const occupation = proposal.goal === "learn-trade" ? (proposal.occupation ?? null) : null;
      if (!goalFits(s, p, day, proposal.goal, target, occupation)) return { ok: false, reason: "does-not-fit" };
      const goals = goalsOf(s, p, day, changes);
      const id = goalId(proposal.goal, target?.id ?? null, occupation);
      if (goals.active.some((g) => g.id === id)) return { ok: false, reason: "already-wanted" };
      if (goals.active.filter((g) => g.source === "talk").length >= CHANGE_LIMITS.maxTalkGoals) return { ok: false, reason: "too-many-goals" };
      return {
        ok: true,
        change: { ...base, kind: "goal", day, goal: proposal.goal, ...(target ? { target: target.id } : {}), ...(occupation ? { occupation } : {}) },
      };
    }
    case "drop": {
      const goals = goalsOf(s, p, day, changes);
      if (!goals.active.some((g) => g.id === proposal.goalId)) return { ok: false, reason: "not-wanted" };
      return { ok: true, change: { ...base, kind: "drop", day, goalId: proposal.goalId } };
    }
  }
}
