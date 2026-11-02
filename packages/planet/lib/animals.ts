/**
 * A village's animals (DECISIONS C55): goats on the pasture, hens round the door, dogs at their
 * people's heels or loose on the green, birds overhead, fish off the dock — and a dog that takes to a
 * stranger who is kind to it.
 *
 * WHO HAS WHAT is the households'. A herder's household keeps goats; some houses keep hens; some keep
 * a dog, which goes where its eldest goes. A village of any size has a stray or two that belong to
 * nobody, and those are the ones a stranger is likeliest to make a friend of. The sea has fish where
 * there is a dock to see them from, and the sky has birds — gulls by the sea, crows inland.
 *
 * WHERE THEY ARE is arithmetic on the hour, like the villagers' (C41): a herd wanders its pasture by
 * day on a few slow sines and lies in its pen by night; hens scratch round their door and are shut in
 * after dark; a dog is a step behind its person while they are out and asleep on the step while they
 * are in. So every viewer sees the same goat in the same place. What a goat does when a stranger runs
 * at it is the browser's (presentation), and so is a dog that has taken to you coming to your side.
 *
 * A BOND is what a stranger has done for a dog, read off their deeds (`deeds.ts`): a stroke, a meal,
 * a game, on how many days. No number is shown (Design Law 1) — the dog follows you, or it does not —
 * and what the echo hears of it is the catalogue's D11, which ingest.py already reads into `pet_attach`.
 *
 * Pure.
 */

import type { Deed } from "./deeds.js";
import { present } from "./life.js";
import { ageYears, hash01, occupationOn, type Person, type Settlement } from "./society.js";
import { residentsOn, type Plot, type Point, type VillagePlan } from "./village.js";

export type AnimalKind = "goat" | "hen" | "dog" | "bird" | "fish";

export interface Animal {
  /** `goat:<household>:<k>`, `hen:<household>:<k>`, `dog:<household>`, `stray:<k>`, `bird:<flock>:<k>`, `fish:<school>:<k>`. */
  id: string;
  kind: AnimalKind;
  /** The household it belongs to, or null for a stray, a bird, a fish. */
  household: number | null;
  /** A dog's: who it follows (the household's eldest), by id. */
  follows: string | null;
  /** A dog's name, for the villagers' mouths. */
  name: string | null;
  /** Where it is by night (pen, door, step), and the middle of where it goes by day. */
  home: Point;
  range: Point;
  /** How far it wanders from `range`, metres. */
  radiusM: number;
  /** A per-animal phase, so a herd does not move as one. */
  phase: number;
  /** For birds: the height they fly at. */
  heightM: number;
}

/** Where an animal is at an hour, and what it is doing. */
export interface AnimalAt {
  x: number;
  y: number;
  /** Height above the ground (birds), or the water (fish leap). */
  z: number;
  heading: number;
  activity: "walk" | "graze" | "lie" | "peck" | "fly" | "swim" | "hidden";
}

export const ANIMALS = {
  /** Share of lived-in houses with hens, and with a dog. */
  hens: 0.4,
  dogs: 0.3,
  /** A stray for every this many people, at most two. */
  peoplePerStray: 25,
  /** The herd's day out, as day fractions. */
  herdOut: [0.3, 0.74],
  /** Hens are out from first light to dusk. */
  hensOut: [0.26, 0.78],
  /** A bond with a dog: what each kind act and each day it was done on adds; the dog follows from `follows`. */
  perAct: 0.1,
  perDay: 0.2,
  follows: 0.6,
  /** How long a bond is remembered, world days. */
  bondDays: 90,
} as const;

const DOG_NAMES = ["Bran", "Tess", "Moss", "Fly", "Nell", "Rook", "Pip", "Bess", "Jet", "Skip", "Dusk", "Brindle", "Patch", "Sorrel"] as const;

const away = (a: Point, angle: number, d: number): Point => ({ x: a.x + Math.cos(angle) * d, y: a.y + Math.sin(angle) * d });
const doorOfPlot = (p: Plot): Point => away({ x: p.x, y: p.y }, p.facing, p.depthM / 2 + 1.1);

const memo = new WeakMap<Settlement, Map<string, Animal[]>>();

/** Every animal of a village on a day. */
export function animalsOf(s: Settlement, plan: VillagePlan, day: number): Animal[] {
  let byDay = memo.get(s);
  if (!byDay) {
    byDay = new Map();
    memo.set(s, byDay);
  }
  const known = byDay.get(`${day}`);
  if (known) return known;

  const out: Animal[] = [];
  const key = `${s.seed}/${s.cell}/animals`;
  const residents = residentsOn(s, plan, day);
  const byHouse = new Map<number, { plot: Plot; people: Person[] }>();
  for (const { person, plot } of residents) {
    const h = person.partnerDay !== null && person.partnerDay <= day ? person.household : person.bornInto;
    const e = byHouse.get(h) ?? { plot, people: [] };
    e.people.push(person);
    byHouse.set(h, e);
  }
  // The pasture: past the outermost field, or past the green's edge where there are no fields.
  const outermost = plan.fields.reduce<{ x: number; y: number; d: number } | null>((best, f) => {
    const d = Math.hypot(f.x - plan.centre.x, f.y - plan.centre.y);
    return !best || d > best.d ? { x: f.x, y: f.y, d } : best;
  }, null);
  const outward = outermost ? Math.atan2(outermost.y - plan.centre.y, outermost.x - plan.centre.x) : hash01(`${key}/pasture`) * Math.PI * 2;
  const pasture = outermost ? away(outermost, outward, 16) : away(plan.centre, outward, plan.greenRadiusM * 1.8);

  let herd = 0;
  // A name each: no village has two dogs called Moss.
  const used = new Set<string>();
  const nameFor = (k: string) => {
    let i = Math.floor(hash01(k) * DOG_NAMES.length);
    for (let tries = 0; tries < DOG_NAMES.length && used.has(DOG_NAMES[i]); tries++) i = (i + 1) % DOG_NAMES.length;
    used.add(DOG_NAMES[i]);
    return DOG_NAMES[i];
  };
  for (const [household, { plot, people }] of [...byHouse].sort((a, b) => a[0] - b[0])) {
    const grown = people.filter((p) => ageYears(p, day) >= 16);
    const door = doorOfPlot(plot);
    const yard = away(door, plot.facing + Math.PI / 2, 2.5);
    // Goats, for a herder's house: on the pasture by day, penned by the house at night.
    if (grown.some((p) => occupationOn(p, day) === "herder")) {
      const n = 4 + Math.floor(hash01(`${key}/goats/${household}`) * 5);
      const pen = away(door, plot.facing - Math.PI / 2, 3.5);
      const spot = away(pasture, (herd++ * 2.1) % (Math.PI * 2), 6);
      for (let k = 0; k < n; k++) {
        out.push({ id: `goat:${household}:${k}`, kind: "goat", household, follows: null, name: null, home: away(pen, k * 1.3, 0.8 + (k % 3) * 0.5), range: spot, radiusM: 4 + (k % 3), phase: hash01(`${key}/goat/${household}/${k}`) * 100, heightM: 0 });
      }
    }
    // Hens round some doors.
    if (hash01(`${key}/hens/${household}`) < ANIMALS.hens) {
      const n = 3 + Math.floor(hash01(`${key}/hens/${household}/n`) * 4);
      for (let k = 0; k < n; k++) {
        out.push({ id: `hen:${household}:${k}`, kind: "hen", household, follows: null, name: null, home: yard, range: yard, radiusM: 2.2 + (k % 2), phase: hash01(`${key}/hen/${household}/${k}`) * 100, heightM: 0 });
      }
    }
    // A dog for some houses: it goes where the eldest goes.
    if (grown.length > 0 && hash01(`${key}/dog/${household}`) < ANIMALS.dogs) {
      const eldest = [...grown].sort((a, b) => a.birthDay - b.birthDay)[0];
      const name = nameFor(`${key}/dog/${household}/name`);
      out.push({ id: `dog:${household}`, kind: "dog", household, follows: eldest.id, name, home: away(door, plot.facing + 0.6, 0.9), range: door, radiusM: 0, phase: hash01(`${key}/dog/${household}/phase`) * 100, heightM: 0 });
    }
  }
  // Strays on the green.
  const here = residents.filter((r) => present(s, r.person, day)).length;
  const strays = Math.min(2, Math.floor(here / ANIMALS.peoplePerStray));
  for (let k = 0; k < strays; k++) {
    const name = nameFor(`${key}/stray/${k}/name`);
    out.push({ id: `stray:${k}`, kind: "dog", household: null, follows: null, name, home: away(plan.centre, k * 2.4 + 0.7, 2.2), range: plan.centre, radiusM: plan.greenRadiusM * 0.7, phase: hash01(`${key}/stray/${k}`) * 100, heightM: 0 });
  }
  // Birds: two flocks, over the shore or the fields.
  const coastal = plan.dock !== null;
  for (let f = 0; f < 2; f++) {
    const centre = coastal && f === 0 ? plan.dock!.tip : outermost ? { x: outermost.x, y: outermost.y } : plan.centre;
    const n = coastal && f === 0 ? 6 + Math.floor(hash01(`${key}/flock/${f}`) * 4) : 8 + Math.floor(hash01(`${key}/flock/${f}`) * 6);
    for (let k = 0; k < n; k++) {
      out.push({ id: `bird:${f}:${k}`, kind: "bird", household: null, follows: null, name: null, home: centre, range: centre, radiusM: 16 + f * 8, phase: hash01(`${key}/flock/${f}/phase`) * 100 + k * 0.035, heightM: 9 + hash01(`${key}/bird/${f}/${k}`) * 5 });
    }
  }
  // Fish off the dock.
  if (plan.dock) {
    for (let school = 0; school < 2; school++) {
      const c = away(plan.dock.tip, plan.dock.heading + (school === 0 ? 0.6 : -0.6), 9 + school * 6);
      const n = 8 + Math.floor(hash01(`${key}/school/${school}`) * 5);
      for (let k = 0; k < n; k++) {
        out.push({ id: `fish:${school}:${k}`, kind: "fish", household: null, follows: null, name: null, home: c, range: c, radiusM: 5, phase: hash01(`${key}/school/${school}/phase`) * 100 + k * 0.05, heightM: 0 });
      }
    }
  }
  byDay.set(`${day}`, out);
  return out;
}

/** A smooth wander inside a circle, from a few slow sines: the same for every viewer. */
function wander(a: Animal, t: number, speed: number): { x: number; y: number } {
  const w = t * Math.PI * 2 * speed;
  const p = a.phase;
  let dx = 0.65 * Math.sin(w * 1.0 + p) + 0.35 * Math.sin(w * 2.3 + p * 1.7);
  let dy = 0.65 * Math.cos(w * 0.8 + p * 1.3) + 0.35 * Math.sin(w * 1.9 + p * 0.6);
  // Inside the circle, not its square: the sines reach the corners together now and then.
  const r = Math.hypot(dx, dy);
  if (r > 1) {
    dx /= r;
    dy /= r;
  }
  return { x: a.range.x + a.radiusM * dx, y: a.range.y + a.radiusM * dy };
}

/** Is someone out of doors, and where, for a dog to follow: the schedule's whereabouts, as the caller has them. */
export type OwnerAt = (id: string) => { x: number; y: number; heading: number; visible: boolean; boat: number | null } | null;

/** Where an animal is at an hour of the day. `ownerAt` is for the dogs that follow someone. */
export function animalAt(a: Animal, t: number, ownerAt: OwnerAt = () => null): AnimalAt {
  const at = (p: { x: number; y: number }, next: { x: number; y: number }, activity: AnimalAt["activity"], z = 0): AnimalAt => ({
    x: p.x,
    y: p.y,
    z,
    heading: Math.atan2(next.y - p.y, next.x - p.x),
    activity,
  });
  const dt = 0.0005;
  switch (a.kind) {
    case "goat": {
      const [out, back] = ANIMALS.herdOut;
      if (t < out - 0.03 || t > back + 0.03) return at(a.home, { x: a.home.x + 1, y: a.home.y }, "lie");
      // Out to the pasture and back in at either end of the day, the herd strung out behind its lead.
      const graze = wander(a, t, 6);
      if (t < out || t > back) {
        const k = t < out ? (t - (out - 0.03)) / 0.03 : 1 - (t - back) / 0.03;
        const p = { x: a.home.x + (graze.x - a.home.x) * k, y: a.home.y + (graze.y - a.home.y) * k };
        return at(p, t < out ? graze : a.home, "walk");
      }
      return at(graze, wander(a, t + dt, 6), Math.sin(t * 900 + a.phase) > 0.2 ? "walk" : "graze");
    }
    case "hen": {
      const [out, back] = ANIMALS.hensOut;
      if (t < out || t > back) return { x: a.home.x, y: a.home.y, z: 0, heading: 0, activity: "hidden" };
      const p = wander(a, t, 30);
      return at(p, wander(a, t + dt, 30), Math.sin(t * 2400 + a.phase) > 0 ? "peck" : "walk");
    }
    case "dog": {
      if (a.follows) {
        const o = ownerAt(a.follows);
        if (o && o.visible && o.boat === null) {
          // A step behind and to one side, the way a dog keeps to its person.
          const side = Math.sin(a.phase) > 0 ? 1 : -1;
          const p = { x: o.x - Math.cos(o.heading) * 1.1 + Math.cos(o.heading + Math.PI / 2) * 0.5 * side, y: o.y - Math.sin(o.heading) * 1.1 + Math.sin(o.heading + Math.PI / 2) * 0.5 * side };
          return { x: p.x, y: p.y, z: 0, heading: o.heading, activity: "walk" };
        }
        return at(a.home, { x: a.home.x + 1, y: a.home.y }, "lie");
      }
      // A stray: about the green by day, curled by the well at night.
      if (t < 0.24 || t > 0.86) return at(a.home, { x: a.home.x, y: a.home.y + 1 }, "lie");
      const p = wander(a, t, 8);
      return at(p, wander(a, t + dt, 8), Math.sin(t * 600 + a.phase) > 0.7 ? "lie" : "walk");
    }
    case "bird": {
      if (t < 0.22 || t > 0.82) return { x: a.home.x, y: a.home.y, z: 0, heading: 0, activity: "hidden" };
      // A flock wheels round its centre; each bird keeps its place in it.
      const w = (t * 40 + a.phase) * Math.PI * 2;
      const r = a.radiusM;
      const p = { x: a.range.x + Math.cos(w) * r + Math.sin(a.phase * 37) * 1.5, y: a.range.y + Math.sin(w) * r + Math.cos(a.phase * 29) * 1.5 };
      return { x: p.x, y: p.y, z: a.heightM + Math.sin(w * 2 + a.phase) * 0.8, heading: w + Math.PI / 2, activity: "fly" };
    }
    case "fish": {
      const w = (t * 25 + a.phase) * Math.PI * 2;
      const p = { x: a.range.x + Math.cos(w) * a.radiusM + Math.sin(a.phase * 41) * 0.8, y: a.range.y + Math.sin(w) * a.radiusM * 0.6 + Math.cos(a.phase * 23) * 0.8 };
      // Now and then one leaps.
      const leap = Math.sin(t * 3000 + a.phase * 13);
      return { x: p.x, y: p.y, z: leap > 0.985 ? (leap - 0.985) * 40 : 0, heading: w + Math.PI / 2, activity: "swim" };
    }
  }
}

/** The kinds of animal a stranger can act on (the registry's), and what each is called. */
export const ANIMAL_THINGS = ["dog", "goat", "hen"] as const;

/**
 * A stranger's bond with one dog: what they have done for it (a stroke, a meal, a game) and on how
 * many days, within {@link ANIMALS}.bondDays. Shooing it away takes some of it back. 0 … 1.
 */
export function bondWith(deeds: readonly Deed[], animal: string, day: number): number {
  const kind = deeds.filter((d) => d.thing === `animal:${animal}` && day - d.day <= ANIMALS.bondDays && d.day <= day);
  const warm = kind.filter((d) => d.verb === "stroke" || d.verb === "feed" || d.verb === "play");
  const shoo = kind.filter((d) => d.verb === "shoo").length;
  const days = new Set(warm.map((d) => d.day)).size;
  return Math.max(0, Math.min(1, warm.length * ANIMALS.perAct + days * ANIMALS.perDay - shoo * 0.3));
}
