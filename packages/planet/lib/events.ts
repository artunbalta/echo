/**
 * A village's days that are not like the others (DECISIONS C52): a burial, a wedding, a new child's
 * first callers — on the day, at the hour, where everyone can see them.
 *
 * NOTHING IS SCHEDULED; THE LIVES ALREADY SAY WHEN. A person who dies on day D (`society.ts`, the
 * closed form) is buried the next afternoon; two people who pair on day D are married on the green
 * that afternoon; a child born on day D has callers at the door the next. So a gathering is read off
 * the lives as they already are, and a stranger standing in the yard that afternoon sees the same
 * burial as everyone else and as the server, for the same reason they see the same rain.
 *
 * WHO COMES is the village's ties (`social.ts`), read as they stood the day before — the dead are
 * not in today's graph. Family and friends always; neighbours and workmates mostly; and some of
 * everyone else, more for a wedding than a burial. Infants are carried and are not drawn. Whoever
 * comes stands in rings round the middle, the closest to it in the inner ring, facing in.
 *
 * WHAT IT CHANGES (`schedule.ts`): the work of whoever comes ends in time to walk there, and a family
 * that has a fisher among the mourners or the wedding party keeps its boat in that day. After a
 * burial the dead's family go home; everyone else goes to the green as on any evening.
 *
 * Pure.
 */

import { present } from "./life.js";
import { socialGraph } from "./social.js";
import { ageYears, hash01, type Person, type Settlement } from "./society.js";
import { gravesOn, residentsOn, type Point, type VillagePlan } from "./village.js";

export type GatheringKind = "funeral" | "wedding" | "naming";

export interface Gathering {
  /** `${kind}:${the people it is about, by id}`: stable, and what a deed about it names. */
  id: string;
  kind: GatheringKind;
  day: number;
  /** The hours it holds, day fractions. */
  t0: number;
  t1: number;
  /** The middle: the grave, a spot on the green, the family's door. */
  at: Point;
  /** Whom it is for: the dead; the couple; the child (who is indoors, carried). */
  about: string[];
  /** Who stands at the middle: the couple at a wedding, the parents at their door. Nobody at a grave. */
  centre: string[];
  /** Everyone else who comes, nearest the middle first. */
  guests: string[];
  /** The family among them: at a burial, the ones who go home after it and mourn there. */
  family: string[];
  /** Where each of them stands, and the way they face. */
  places: Map<string, { at: Point; heading: number }>;
}

export const GATHERINGS = {
  /** The hours, as day fractions: after the day's work, before the evening. */
  funeral: [0.58, 0.68],
  wedding: [0.58, 0.7],
  naming: [0.6, 0.66],
  /** Share of the village with no tie to them who come anyway. */
  othersFuneral: 0.25,
  othersWedding: 0.45,
  /** Share of neighbours and workmates who come. */
  looseFuneral: 0.7,
  looseWedding: 0.8,
  /** Nobody under this age comes unless family brings them. */
  minGuestYears: 8,
  /** Room each person takes in a ring, metres along it. */
  spacingM: 0.75,
  /** The first ring's radius, and each next ring's step out. */
  ringM: 1.5,
  ringStepM: 0.8,
} as const;

const memo = new WeakMap<Settlement, Map<string, Gathering[]>>();

/** Every gathering in a village on a day, burials first. */
export function gatheringsOn(s: Settlement, plan: VillagePlan, day: number): Gathering[] {
  let byDay = memo.get(s);
  if (!byDay) {
    byDay = new Map();
    memo.set(s, byDay);
  }
  const known = byDay.get(`${day}`);
  if (known) return known;

  const out: Gathering[] = [];
  const here = residentsOn(s, plan, day).map((r) => r.person);
  const doorOf = new Map(residentsOn(s, plan, day).map(({ person, plot }) => [person.id, plot]));

  // Burials: whoever died here yesterday.
  const graves = new Map(gravesOn(s, plan, day).map((g) => [g.person, g]));
  for (const dead of s.people) {
    if (dead.deathDay !== day - 1 || !present(s, dead, dead.deathDay - 1)) continue;
    const grave = graves.get(dead.id);
    if (!grave) continue; // no yard, or no slot left that is theirs
    const ties = socialGraph(s, dead.deathDay - 1, plan).get(dead.id) ?? [];
    const guests = invited(s, here, day, ties, `${dead.id}/funeral`, GATHERINGS.looseFuneral, GATHERINGS.othersFuneral, []);
    const family = ties.filter((t) => t.strength === 3 && guests.includes(t.other)).map((t) => t.other);
    out.push(ringed({ id: `funeral:${dead.id}`, kind: "funeral", day, t0: GATHERINGS.funeral[0], t1: GATHERINGS.funeral[1], at: { x: grave.x, y: grave.y }, about: [dead.id], centre: [], guests, family }));
  }

  // Weddings: whoever paired today, both of them here.
  for (const a of here) {
    if (a.partner === null || a.partnerDay !== day) continue;
    const b = s.people[a.partner];
    if (a.index > b.index || !present(s, b, day) || day === s.foundedDay) continue;
    const graph = socialGraph(s, day, plan);
    const ties = [...(graph.get(a.id) ?? []), ...(graph.get(b.id) ?? [])].filter((t) => t.other !== a.id && t.other !== b.id);
    const guests = invited(s, here, day, ties, `${a.id}+${b.id}/wedding`, GATHERINGS.looseWedding, GATHERINGS.othersWedding, [a.id, b.id]);
    const r = plan.greenRadiusM * 0.45;
    const ang = hash01(`${a.id}+${b.id}/wedding/spot`) * Math.PI * 2;
    const at = { x: plan.centre.x + Math.cos(ang) * r, y: plan.centre.y + Math.sin(ang) * r };
    const family = ties.filter((t) => t.strength === 3 && guests.includes(t.other)).map((t) => t.other);
    const g = ringed({ id: `wedding:${a.id}+${b.id}`, kind: "wedding", day, t0: GATHERINGS.wedding[0], t1: GATHERINGS.wedding[1], at, about: [a.id, b.id], centre: [a.id, b.id], guests, family });
    // The couple face each other at the middle.
    g.places.set(a.id, { at: { x: at.x - 0.4, y: at.y }, heading: 0 });
    g.places.set(b.id, { at: { x: at.x + 0.4, y: at.y }, heading: Math.PI });
    out.push(g);
  }

  // A child born yesterday: the family's callers at the door, the parents on the step.
  for (const child of s.people) {
    if (child.birthDay !== day - 1 || child.parents === null) continue;
    const parents = child.parents.map((i) => s.people[i]).filter((p) => present(s, p, day));
    const plot = parents.map((p) => doorOf.get(p.id)).find(Boolean);
    if (!plot || parents.length === 0) continue;
    const graph = socialGraph(s, day, plan);
    // Family and friends only: nobody calls on a new mother because they work in the same trade.
    const ties = parents.flatMap((p) => graph.get(p.id) ?? []).filter((t) => t.strength >= 2 && !parents.some((q) => q.id === t.other));
    const guests = invited(s, here, day, ties, `${child.id}/naming`, 0, 0, parents.map((p) => p.id));
    if (guests.length === 0) continue;
    const door = { x: plot.x + Math.cos(plot.facing) * (plot.depthM / 2 + 1.1), y: plot.y + Math.sin(plot.facing) * (plot.depthM / 2 + 1.1) };
    const family = ties.filter((t) => t.strength === 3 && guests.includes(t.other)).map((t) => t.other);
    const g: Gathering = { id: `naming:${child.id}`, kind: "naming", day, t0: GATHERINGS.naming[0], t1: GATHERINGS.naming[1], at: door, about: [child.id], centre: parents.map((p) => p.id), guests, family: [...new Set(family)], places: new Map() };
    // The parents on the step facing out; the callers in an arc in front of them, facing the door.
    parents.forEach((p, i) => g.places.set(p.id, { at: { x: door.x + Math.cos(plot.facing + Math.PI / 2) * (i - (parents.length - 1) / 2) * 0.7, y: door.y + Math.sin(plot.facing + Math.PI / 2) * (i - (parents.length - 1) / 2) * 0.7 }, heading: plot.facing }));
    guests.forEach((id, i) => {
      const row = Math.floor(i / 7);
      const k = (i % 7) - 3;
      const a = plot.facing + k * 0.32;
      const r = 1.9 + row * 0.8;
      const at = { x: door.x + Math.cos(a) * r, y: door.y + Math.sin(a) * r };
      g.places.set(id, { at, heading: Math.atan2(door.y - at.y, door.x - at.x) });
    });
    out.push(g);
  }

  byDay.set(`${day}`, out);
  return out;
}

/** Who comes: by tie, nearest first, then a deterministic share of the rest. */
function invited(
  s: Settlement,
  here: readonly Person[],
  day: number,
  ties: readonly { other: string; strength: number }[],
  key: string,
  loose: number,
  others: number,
  exclude: readonly string[],
): string[] {
  const best = new Map<string, number>();
  for (const t of ties) best.set(t.other, Math.max(best.get(t.other) ?? 0, t.strength));
  const out: { id: string; order: number }[] = [];
  const familyOf = new Set([...best].filter(([, k]) => k >= 3).map(([id]) => id));
  for (const p of here) {
    if (exclude.includes(p.id)) continue;
    const age = ageYears(p, day);
    if (age < 4) continue; // carried
    const k = best.get(p.id) ?? 0;
    const u = hash01(`${key}/${p.id}`);
    let comes = k >= 2 || (k === 1 && u < loose) || (k === 0 && u < others);
    // A child comes with their family, or not at all.
    if (age < GATHERINGS.minGuestYears) {
      const parentsHere = p.parents ? p.parents.map((i) => s.people[i].id) : [];
      comes = k >= 3 || parentsHere.some((id) => familyOf.has(id) || exclude.includes(id));
    }
    if (comes) out.push({ id: p.id, order: (3 - k) * 10 + u });
  }
  return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1)).map((x) => x.id);
}

/** Rings round the middle, the first ring for the first guests, facing in. */
function ringed(g: Omit<Gathering, "places">): Gathering {
  const places = new Map<string, { at: Point; heading: number }>();
  let ring = 0;
  let filled = 0;
  let r: number = GATHERINGS.ringM + (g.centre.length > 0 ? 0.3 : 0);
  let capacity = Math.max(4, Math.floor((2 * Math.PI * r) / GATHERINGS.spacingM));
  const spin = hash01(`${g.id}/ring`) * Math.PI * 2;
  g.guests.forEach((id, i) => {
    if (filled >= capacity) {
      ring++;
      filled = 0;
      r += GATHERINGS.ringStepM;
      capacity = Math.floor((2 * Math.PI * r) / GATHERINGS.spacingM);
    }
    const left = g.guests.length - (i - filled);
    const n = Math.min(capacity, left);
    const a = spin + ring * 0.37 + (filled / n) * Math.PI * 2;
    const at = { x: g.at.x + Math.cos(a) * r, y: g.at.y + Math.sin(a) * r };
    places.set(id, { at, heading: Math.atan2(g.at.y - at.y, g.at.x - at.x) });
    filled++;
  });
  return { ...g, places };
}

/** What a gathering is, in the village's words: "Vamjik's burial", "Mara and Tobb's wedding". */
export function gatheringName(s: Settlement, g: Gathering): string {
  const name = (id: string) => s.people.find((p) => p.id === id)?.given ?? "someone";
  if (g.kind === "funeral") return `${name(g.about[0])}'s burial`;
  if (g.kind === "wedding") return `${name(g.about[0])} and ${name(g.about[1])}'s wedding`;
  const parents = g.centre.map(name);
  return `the callers at ${parents.join(" and ")}'s door, for the new baby`;
}

/** What a village knows is coming, and what it knows has just happened (C52). */
export interface Coming {
  kind: GatheringKind | "expecting";
  /** The day of the gathering; for `expecting`, the day the child will be born (which nobody knows to the day). */
  day: number;
  about: string[];
  /** In the village's words, from where `today` stands. */
  words: string;
}

export const COMING = {
  /** A wedding is talked about this many days before. */
  weddingDays: 7,
  /** A child is "any day now" this many days before. */
  expectingDays: 10,
} as const;

/**
 * The village's news, soonest first: today's gatherings, a death today (its burial is tomorrow), the
 * weddings of the coming week, the children due any day. What is known is what people know: a wedding
 * is planned, a birth is expected, and a death is never foretold — it is news on the day it happens.
 */
export function comingOn(s: Settlement, plan: VillagePlan, day: number): Coming[] {
  const WORDS = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${WORDS[n] ?? n} days`);
  const out: Coming[] = [];
  for (const g of gatheringsOn(s, plan, day)) {
    out.push({ kind: g.kind, day, about: g.about, words: `${gatheringName(s, g)[0].toUpperCase()}${gatheringName(s, g).slice(1)}, this afternoon` });
  }
  for (const p of s.people) {
    if (p.deathDay === day && present(s, p, day - 1) && plan.graveyard) {
      out.push({ kind: "funeral", day: day + 1, about: [p.id], words: `${p.given} died today; the burial is tomorrow afternoon` });
    }
  }
  for (const p of s.people) {
    if (p.partner === null || p.partnerDay === null || p.partnerDay <= day || p.partnerDay - day > COMING.weddingDays) continue;
    const q = s.people[p.partner];
    if (p.index > q.index || !present(s, p, day) || !present(s, q, p.partnerDay)) continue;
    out.push({ kind: "wedding", day: p.partnerDay, about: [p.id, q.id], words: `${p.given} and ${q.given} are to be married ${inDays(p.partnerDay - day)}, on the green` });
  }
  for (const c of s.people) {
    if (c.parents === null || c.birthDay <= day || c.birthDay - day > COMING.expectingDays) continue;
    const mother = s.people[c.parents[0]].sex === "f" ? s.people[c.parents[0]] : s.people[c.parents[1]];
    if (!present(s, mother, day)) continue;
    out.push({ kind: "expecting", day: c.birthDay, about: [mother.id], words: `${mother.given} is expecting, any day now` });
  }
  return out.sort((a, b) => a.day - b.day);
}
