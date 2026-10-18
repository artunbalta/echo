/**
 * What a stranger has done in a village, and who knows it (DECISIONS C45).
 *
 * A DEED IS A FACT WITH WITNESSES. When a stranger does something that touches somebody — weeds their
 * field, forces their door, takes their boat, tidies their mother's grave — the act route records it
 * with the people who could SEE it at that instant (by the same closed form every browser draws them
 * with: out of doors and within {@link DEEDS}.sightM, or at home behind the door being forced) and the
 * people it was done TO. Nothing here is a score (Design Law 1): a deed is a sentence a villager can
 * say, and a reason they might turn their back.
 *
 * WHO KNOWS. Three ways, each a day apart from the last:
 *   saw it    — a witness knows at once;
 *   theirs    — the household it was done to finds out the next morning (the trampled rows, the door);
 *   heard     — a witness's or a victim's own family hears of it the day after that.
 * Knowledge never spreads further than family in v1. A village of strangers who all know your business
 * by noon would be a different world, and a less true one.
 *
 * Pure. The route hands in one stranger's deeds; nothing here knows who the stranger is.
 */

import type { DeedReading, ThingKind } from "./affordances.js";
import { WRONGS } from "./affordances.js";
import { present } from "./life.js";
import type { LifeChange } from "./changes.js";
import { dayPlans, whereabouts } from "./schedule.js";
import type { Person, Settlement } from "./society.js";
import { residentsOn, type VillagePlan } from "./village.js";

export const DEEDS = {
  /** How far a villager out of doors can see what someone is doing, metres. */
  sightM: 30,
  /** A wrong done to your own household this recently, and not made good, and you will not talk. */
  grievanceDays: 30,
  /** What it takes to make good: a kindness or help to the same household of at least this weight. */
  amendsWeight: 2,
} as const;

export interface Deed {
  id: string;
  verb: string;
  kind: ThingKind;
  /** The thing's reference (`things.ts`). */
  thing: string;
  /** Its name as a villager would say it: "the Kost house". */
  thingName: string;
  reading: DeedReading;
  weight: 1 | 2 | 3;
  /** The world day and hour it was done. */
  day: number;
  hour: number;
  /** `Person.id`s of everyone who saw it. */
  witnesses: string[];
  /** `Person.id`s of whoever it was done to. */
  owners: string[];
}

export type How = "saw" | "theirs" | "heard";

export interface Known {
  deed: Deed;
  how: How;
  /** For "heard": the family member they heard it from. */
  from?: string;
}

const familyOf = (s: Settlement, p: Person): Person[] => {
  const out: Person[] = [];
  if (p.partner !== null) out.push(s.people[p.partner]);
  if (p.parents) {
    out.push(s.people[p.parents[0]], s.people[p.parents[1]]);
    for (const i of s.people[p.parents[0]].children) if (i !== p.index) out.push(s.people[i]);
  }
  for (const i of p.children) out.push(s.people[i]);
  return out;
};

/** What one villager knows today of one stranger's deeds, oldest first. */
export function knownDeeds(s: Settlement, me: Person, deeds: readonly Deed[], day: number): Known[] {
  const out: Known[] = [];
  const family = familyOf(s, me).filter((q) => present(s, q, day) || q.deathDay > day);
  for (const d of [...deeds].sort((a, b) => a.day - b.day || a.hour - b.hour)) {
    if (d.day > day) continue;
    if (d.witnesses.includes(me.id)) out.push({ deed: d, how: "saw" });
    else if (d.owners.includes(me.id) && day >= d.day + 1) out.push({ deed: d, how: "theirs" });
    else if (day >= d.day + 2) {
      const told = family.find((q) => d.witnesses.includes(q.id) || d.owners.includes(q.id));
      if (told) out.push({ deed: d, how: "heard", from: told.id });
    }
  }
  return out;
}

/**
 * The wrong this villager holds against the stranger, if any: the most recent wrong of weight two or
 * more done to them or their household within {@link DEEDS}.grievanceDays, that they know of, and that
 * no later kindness to them has made good. Null means they will talk.
 */
export function grievance(s: Settlement, me: Person, deeds: readonly Deed[], day: number): Deed | null {
  const known = knownDeeds(s, me, deeds, day);
  let held: Deed | null = null;
  for (const k of known) {
    const d = k.deed;
    if (!d.owners.includes(me.id)) continue;
    if (WRONGS.has(d.reading) && d.weight >= 2 && day - d.day <= DEEDS.grievanceDays) held = d;
    else if (!WRONGS.has(d.reading) && d.weight >= DEEDS.amendsWeight && held && d.day >= held.day) held = null;
  }
  return held;
}

/** A deed as a villager would say it, from where they stand: "you trampled our field". */
export function deedWords(s: Settlement, me: Person, k: Known, day: number): string {
  const d = k.deed;
  const ago = day - d.day <= 0 ? "today" : day - d.day === 1 ? "yesterday" : `${day - d.day} days ago`;
  const ours = d.owners.includes(me.id);
  const thing = ours ? ourName(d) : d.thingName;
  const what: Record<string, string> = {
    "knock": `knocked at ${thing}`,
    "peer-in": `looked in at the window of ${thing}`,
    "force-door": `forced the door of ${thing}`,
    "give": `left a gift at ${thing}`,
    "tend": `helped weed ${thing}`,
    "trample": d.kind === "grave" ? `walked over ${thing}` : `trampled the crop in ${thing}`,
    "pick-up": `took ${d.kind === "mine" ? "ore from the mine" : `from ${thing}`}`,
    "board": `took ${thing} out without asking`,
    "bail": `bailed out ${thing}`,
    "moor": `brought ${thing} back`,
    "respect": `paid their respects at ${thing}`,
    "tidy": `tidied ${thing}`,
    "work": `worked a shift at ${thing}`,
  };
  const act = what[d.verb] ?? `did something to ${thing}`;
  const source =
    k.how === "saw" ? "You saw the stranger" : k.how === "theirs" ? "The stranger" : `${s.people.find((p) => p.id === k.from)?.given ?? "Your family"} told you the stranger`;
  return `${source} ${act}, ${ago}.`;
}

const ourName = (d: Deed): string => {
  if (d.kind === "house") return "your house";
  if (d.kind === "field") return "your field";
  if (d.kind === "boat") return "your boat";
  if (d.kind === "grave") return d.thingName.replace(/^(\w+)'s grave$/, "$1's grave");
  return d.thingName;
};

/**
 * Who saw an act done at a place and an hour: everyone out of doors within {@link DEEDS}.sightM, by
 * the closed form — and, for an act on a house, whoever was at home inside it. Children under eight
 * see and do not count; nobody asks them.
 */
export function witnessesOf(
  s: Settlement,
  plan: VillagePlan,
  day: number,
  hour: number,
  at: { x: number; y: number },
  changes: readonly LifeChange[] = [],
  houseRef?: string,
): string[] {
  const { plans, boats, moorings } = dayPlans(s, plan, day, changes);
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const out = new Set<string>();
  for (const d of plans) {
    const p = byId.get(d.person);
    if (!p || (day - p.birthDay) / 365 < 8) continue;
    const w = whereabouts(d, hour, boats, moorings);
    if (w.visible && Math.hypot(w.x - at.x, w.y - at.y) <= DEEDS.sightM) out.add(p.id);
  }
  if (houseRef?.startsWith("house:")) {
    const index = Number(houseRef.slice(6));
    const plans_ = new Map(plans.map((d) => [d.person, d]));
    for (const { person, plot } of residentsOn(s, plan, day)) {
      if (plot.index !== index || (day - person.birthDay) / 365 < 8) continue;
      const d = plans_.get(person.id);
      const home = !d || !whereabouts(d, hour, boats, moorings).visible;
      if (home) out.add(person.id);
    }
  }
  return [...out];
}
