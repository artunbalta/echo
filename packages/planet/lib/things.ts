/**
 * The village's things, as things a person can act on (DECISIONS C45): each with a stable reference,
 * a place, and the people it belongs to on a day.
 *
 * ONE LIST FOR BOTH ENDS. The browser builds its prompts from it and the act route checks a reference
 * against it, so the two can never disagree about which field is whose. References are semantic and
 * stable — `house:12` is the twelfth plot, `grave:<id>` is somebody's grave, `boat:<household>` is a
 * family's boat — so a mark or a deed recorded against one still names the same thing next week.
 *
 * Scatter things (trees, shells…) are not listed here: there are thousands, and they are the
 * scatter's. Their reference is `${classId}@${x},${y}` to a tenth of a metre, built by `scatterRef`.
 */

import type { ThingKind } from "./affordances.js";
import { ageYears, occupationOn, type Person, type Settlement } from "./society.js";
import { present } from "./life.js";
import { doorOf, mooringsOn } from "./schedule.js";
import { gravesOn, householdOn, plotState, residentsOn, type VillagePlan } from "./village.js";

export interface Thing {
  ref: string;
  kind: ThingKind;
  /** Where a person stands to act on it, planet-local metres. */
  x: number;
  y: number;
  /** A radius within which it counts as reached, beyond the verb's own reach (a field is big). */
  sizeM: number;
  /** `Person.id`s of whoever it belongs to today; empty for the village's things and nobody's. */
  owners: string[];
  /** A short name for prompts and for villagers: "the Kost house", "Vamjik's grave". */
  name: string;
}

const fieldOwners = (s: Settlement, plan: VillagePlan, index: number, day: number): string[] => {
  const f = plan.fields[index];
  const out: string[] = [];
  for (const { person, plot } of residentsOn(s, plan, day)) {
    let best = -1;
    let bestD = Infinity;
    plan.fields.forEach((g, i) => {
      const d = Math.hypot(g.x - plot.x, g.y - plot.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best === index && ageYears(person, day) >= 13) out.push(person.id);
  }
  return f ? out : [];
};

const membersOf = (s: Settlement, household: number, day: number): Person[] =>
  s.people.filter((p) => present(s, p, day) && (p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto) === household);

/** Living kin of someone dead: who a grave belongs to. */
const kinOfDead = (s: Settlement, dead: Person, day: number): string[] => {
  const ids = new Set<number>();
  if (dead.partner !== null) ids.add(dead.partner);
  if (dead.parents) {
    ids.add(dead.parents[0]);
    ids.add(dead.parents[1]);
    for (const i of s.people[dead.parents[0]].children) ids.add(i);
  }
  for (const i of dead.children) ids.add(i);
  ids.delete(dead.index);
  return [...ids].map((i) => s.people[i]).filter((p) => present(s, p, day)).map((p) => p.id);
};

/**
 * Every village thing standing on a day. Houses that are lived in and houses that have fallen are
 * different kinds (`house`, `ruin`); a plot with nothing on it yet is not a thing.
 */
export function villageThings(s: Settlement, plan: VillagePlan, day: number): Thing[] {
  const out: Thing[] = [];
  for (const plot of plan.plots) {
    const state = plotState(s, plot, day);
    if (state === null) continue;
    const door = doorOf(plot);
    if (state === "lived") {
      const h = householdOn(s, plot, day)!;
      out.push({ ref: `house:${plot.index}`, kind: "house", x: door.x, y: door.y, sizeM: 0.5, owners: membersOf(s, h.index, day).map((p) => p.id), name: `the ${h.family} house` });
    } else {
      out.push({ ref: `house:${plot.index}`, kind: "ruin", x: plot.x, y: plot.y, sizeM: Math.max(plot.widthM, plot.depthM) / 2, owners: [], name: "an empty house" });
    }
  }
  plan.fields.forEach((f, i) => {
    out.push({ ref: `field:${i}`, kind: "field", x: f.x, y: f.y, sizeM: Math.min(f.lengthM, f.widthM) / 2, owners: fieldOwners(s, plan, i, day), name: "a field" });
  });
  plan.benches.forEach((b, i) => out.push({ ref: `bench:${i}`, kind: "bench", x: b.x, y: b.y, sizeM: 0.6, owners: [], name: "a bench" }));
  out.push({ ref: "well", kind: "well", x: plan.centre.x, y: plan.centre.y, sizeM: 1.2, owners: [], name: "the well" });
  if (plan.dock) {
    out.push({ ref: "dock", kind: "dock", x: plan.dock.tip.x, y: plan.dock.tip.y, sizeM: 1.5, owners: [], name: "the end of the dock" });
    for (const mo of mooringsOn(s, plan, day)) {
      const members = membersOf(s, mo.household, day);
      const family = s.households[mo.household]?.family ?? "";
      out.push({ ref: `boat:${mo.household}`, kind: "boat", x: mo.x, y: mo.y, sizeM: 2, owners: members.map((p) => p.id), name: `the ${family} boat` });
    }
  }
  for (const g of gravesOn(s, plan, day)) {
    const dead = s.people.find((p) => p.id === g.person);
    if (!dead) continue;
    out.push({ ref: `grave:${g.person}`, kind: "grave", x: g.x, y: g.y, sizeM: 0.6, owners: kinOfDead(s, dead, day), name: `${dead.given}'s grave` });
  }
  if (plan.mine) {
    const miners = s.people.filter((p) => present(s, p, day) && ["miner", "stonecutter"].includes(occupationOn(p, day))).map((p) => p.id);
    out.push({ ref: "mine", kind: "mine", x: plan.mine.x, y: plan.mine.y, sizeM: 2.5, owners: miners, name: "the mine" });
  }
  return out;
}

/** The reference of one scatter instance: its class and its place, to a tenth of a metre. */
export function scatterRef(classId: string, x: number, y: number): string {
  return `${classId}@${x.toFixed(1)},${y.toFixed(1)}`;
}

/** A scatter reference read back, or null if it is not one. */
export function parseScatterRef(ref: string): { classId: string; x: number; y: number } | null {
  const m = /^([a-z-]+)@(-?\d+(?:\.\d)?),(-?\d+(?:\.\d)?)$/.exec(ref);
  return m ? { classId: m[1], x: Number(m[2]), y: Number(m[3]) } : null;
}


/** A mark an act left on the shared world (`world_effects`, C45). */
export interface WorldEffect {
  id: string;
  /** The thing's reference. */
  thing: string;
  kind: import("./affordances.js").EffectKind;
  /** The world day it was made, and the day it heals. */
  day: number;
  untilDay: number;
}

/** The marks standing on a day, by thing: the latest one wins where a thing has two. */
export function activeEffects(effects: readonly WorldEffect[], day: number): Map<string, WorldEffect> {
  const out = new Map<string, WorldEffect>();
  for (const e of [...effects].sort((a, b) => a.day - b.day)) {
    if (e.day <= day && e.untilDay > day) out.set(e.thing, e);
  }
  return out;
}
