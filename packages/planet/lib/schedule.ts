/**
 * Where everyone in a village is, at any instant (DECISIONS C41): the day a person lives, as a pure
 * function of the settlement, its plan, the world day and the hour.
 *
 * NO TICK. A schedule is a closed form, like the lineage it reads: `whereabouts(day plan, hour)` is
 * arithmetic on a handful of times and places, so two people standing in the same village see the
 * same baker at the same well without a server having moved her there (SOC-3.E stays unanswered and
 * stops blocking the first village). The plan for a day is computed once per world day; an instant
 * inside it is a piecewise evaluation.
 *
 * THE DAY, on the sky's own clock (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset). Everyone sleeps
 * indoors, rises a little before sunrise, walks to their work, works, walks to the green toward
 * evening, and goes home after dark. What "work" is comes from their trade, and where it is comes
 * from the plan: a fisher rows out from the dock, a farmer bends over the field nearest home, a smith
 * works at their own door, a trader keeps a stall on the green, and those whose work is beyond the
 * village (herders, foresters, miners, carters) walk out inland and are gone until evening. Children
 * play on the green; the old sit there most of the day; the smallest stay indoors.
 *
 * WHAT DIFFERS BETWEEN TWO PEOPLE comes from the substrate, never from a die rolled for flavour: the
 * trade, the age, the house, and the temperament (`life.ts`) — someone high on `energy` walks
 * faster, and someone high on `pace` (the future-orientation anchor, BUILD-PLAN D4) is out the door
 * earlier. The small jitter that keeps a village from moving in lockstep is keyed on the person and
 * the day, so it differs between days and never between viewers.
 *
 * Pure: no clock, no I/O. Coordinates are planet-local metres, east and north, like the plan.
 */

import { WORLD_DAY_S } from "./worldclock.js";
import { ageYears, hash01, occupationOn, type Person, type Settlement } from "./society.js";
import type { LifeChange } from "./changes.js";
import { eveningOf, type GoalPlace } from "./goals.js";
import { navGraph, pathLength, route } from "./nav.js";
import { weatherOn } from "./weather.js";
import { friendCircles } from "./social.js";
import { gatheringsOn, type Gathering } from "./events.js";
import { temperaments } from "./life.js";
import { gravesOn, householdOn, residentsOn, type Plot, type Point, type VillagePlan } from "./village.js";

// ── the dials ───────────────────────────────────────────────────────────────────

export const SCHEDULE = {
  /** Strolling pace, metres per second, before temperament. The player walks 1.65. */
  walkMps: 1.2,
  /** A boat under oars and sail, metres per second. */
  boatMps: 2.5,
  /** The least time a boat spends at its ground, as a fraction of a day: about forty real seconds. */
  minFishing: 0.06,
  wake: 0.235,
  workEnd: 0.6,
  /** When the green fills, and when the last of them go in. */
  gatherEnd: 0.8,
  /** Children are put to bed first, and the old go in early. */
  childBed: 0.76,
  elderBed: 0.77,
  /** The day's jitter, as a fraction of a day. ±0.015 is about eleven real seconds. */
  jitter: 0.015,
  /** Under this age a person is indoors all day: carried, not walking. */
  infantYears: 4,
  childYears: 13,
  elderYears: 68,
  /** How far beyond the outermost house the outbound workers walk before they are out of sight. */
  outboundM: 140,
} as const;

/** What a person is doing, for the pose. */
/** `mourn`: standing at a grave with the head bowed (C52). */
export type Activity = "walk" | "work" | "stoop" | "sit" | "stand" | "play" | "row" | "fish" | "mourn";

export interface Whereabouts {
  x: number;
  y: number;
  /** Radians, planet-local (0 east, π/2 north): the way they face. */
  heading: number;
  activity: Activity;
  /** Walking speed relative to a stroll, for the gait; 0 standing. */
  speed: number;
  /** Indoors, asleep, or out of the village. */
  visible: boolean;
  /** The boat they are in, by mooring index, while they are at sea. */
  boat: number | null;
}

export interface Mooring {
  household: number;
  x: number;
  y: number;
  heading: number;
  /** Drawn up on the shore because the dock was full: it stays there. */
  ashore: boolean;
}

/** A leg of somebody's day: from `from` to `to`, leaving at `t0`, arriving at `t1`. */
interface Leg {
  t0: number;
  t1: number;
  from: Point;
  to: Point;
  /** The way round, between `from` and `to` (C46): empty when the straight walk is clear. */
  via: Point[];
}

/** A still part of a day: at `at`, doing `activity`, facing `heading`, from `t0` to `t1`. */
interface Stay {
  t0: number;
  t1: number;
  at: Point;
  heading: number;
  activity: Activity;
  /** A small wander around `at`, metres, so a farmer works along a furrow and children run about. */
  wander: number;
  /** Where in the boat, metres along it from the middle, for two of a family rowing out together. */
  seat?: number;
}

export interface DayPlan {
  person: string;
  /** Times outside every leg and stay are indoors. */
  legs: Leg[];
  stays: Stay[];
  /** Relative walking speed. */
  pace: number;
  /** The boat this person goes out in, by mooring index, if any. */
  boat: number | null;
}

// ── places ──────────────────────────────────────────────────────────────────────

const along = (p: Point, a: number, d: number): Point => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const toward = (a: Point, b: Point): number => Math.atan2(b.y - a.y, b.x - a.x);

/** One jittered number per person per day per purpose. */
const jitter = (person: string, day: number, what: string): number => hash01(`${person}/day/${day}/${what}`) - 0.5;

/** The step in front of a house's door. */
export function doorOf(plot: Plot): Point {
  return along({ x: plot.x, y: plot.y }, plot.facing, plot.depthM / 2 + 1.1);
}

/** A seat on one of the green's benches: two to a bench, a metre apart, facing the well. */
function benchSeat(plan: VillagePlan, person: string): { at: Point; heading: number } {
  const seats = plan.benches.length * 2;
  if (seats === 0) return { at: greenSpot(plan, person, 0.8), heading: 0 };
  const k = Math.floor(hash01(`${person}/bench`) * seats);
  const b = plan.benches[Math.floor(k / 2)];
  const side = k % 2 === 0 ? -0.5 : 0.5;
  return { at: along(b, b.heading, side), heading: toward(b, plan.centre) };
}

/** A seat on the green, somewhere round the well, the same one every evening. */
function greenSpot(plan: VillagePlan, person: string, ring: number): Point {
  const a = hash01(`${person}/green`) * Math.PI * 2;
  return along(plan.centre, a, plan.greenRadiusM * ring);
}

/**
 * The boats of a day: one for every household living with a fisher in it, moored along the dock from
 * its end inward, both sides, and drawn up on the shore beside it when the dock is full. Pure, so the
 * drawing and the schedule agree about which boat is whose.
 */
export function mooringsOn(s: Settlement, plan: VillagePlan, day: number): Mooring[] {
  const dock = plan.dock;
  if (!dock) return [];
  const owners: number[] = [];
  for (const plot of plan.plots) {
    const h = householdOn(s, plot, day);
    if (h === null) continue;
    const fishes = s.people.some(
      (p) =>
        occupationOn(p, day) === "fisher" &&
        p.birthDay <= day &&
        p.deathDay > day &&
        p.leftDay > day &&
        (p.household === h.index || p.bornInto === h.index),
    );
    if (fishes) owners.push(h.index);
  }
  const c = Math.cos(dock.heading);
  const sn = Math.sin(dock.heading);
  return owners.map((household, i) => {
    const slot = Math.floor(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    const at = dock.lengthM - 3 - slot * 5;
    if (at > 3) {
      return { household, x: dock.root.x + c * at - sn * side * 2.1, y: dock.root.y + sn * at + c * side * 2.1, heading: dock.heading, ashore: false };
    }
    const k = slot - Math.floor((dock.lengthM - 6) / 5);
    return {
      household,
      x: dock.root.x - c * (3 + k * 0.5) - sn * side * (4 + k * 2.2),
      y: dock.root.y - sn * (3 + k * 0.5) + c * side * (4 + k * 2.2),
      heading: dock.heading + side * 1.2,
      ashore: true,
    };
  });
}

// ── the boats' day ──────────────────────────────────────────────────────────────

export interface BoatDay {
  mooring: Mooring;
  /** Leaves the dock, reaches the fishing ground, leaves it, is moored again. */
  t: [number, number, number, number];
  ground: Point;
}

/** When a household's boat goes out and where it fishes. A boat drawn up ashore stays ashore. */
export function boatDay(plan: VillagePlan, mooring: Mooring, index: number, day: number): BoatDay | null {
  if (mooring.ashore || !plan.dock) return null;
  const key = `${plan.name}/${mooring.household}`;
  const out = SCHEDULE.wake + 0.06 + jitter(key, day, "sail") * 0.03;
  const home = SCHEDULE.workEnd - 0.02 + jitter(key, day, "home") * 0.03;
  // Out along the dock's own heading, fanned so two boats do not sit on each other.
  const fan = (hash01(`${key}/fan`) - 0.5) * 1.1 + (index % 2 === 0 ? 0.12 : -0.12);
  let ground = along(plan.dock.tip, plan.dock.heading + fan, 60 + hash01(`${key}/reach`) * 120);
  let sailDays = dist(mooring, ground) / (SCHEDULE.boatMps * WORLD_DAY_S);
  // A day is twelve real minutes (C24), so a long row out can eat the time there is to fish in.
  // The first version did, and `schedule.test.ts` caught boats turning for home before they had
  // arrived. The ground is pulled in along its own bearing until the fishing fits.
  const most = Math.max(0.01, (home - out - SCHEDULE.minFishing) / 2);
  if (sailDays > most) {
    const k = most / sailDays;
    ground = { x: mooring.x + (ground.x - mooring.x) * k, y: mooring.y + (ground.y - mooring.y) * k };
    sailDays = most;
  }
  return { mooring, t: [out, out + sailDays, home - sailDays, home], ground };
}

/** Where a boat is at an hour: moored, under way, or riding at its ground. */
export function boatAt(b: BoatDay | null, mooring: Mooring, t: number): { x: number; y: number; heading: number; moving: boolean } {
  if (b === null || t <= b.t[0] || t >= b.t[3]) return { x: mooring.x, y: mooring.y, heading: mooring.heading, moving: false };
  const [t0, t1, t2, t3] = b.t;
  const m: Point = mooring;
  if (t < t1) {
    const k = (t - t0) / (t1 - t0);
    return { x: m.x + (b.ground.x - m.x) * k, y: m.y + (b.ground.y - m.y) * k, heading: toward(m, b.ground), moving: true };
  }
  if (t > t2) {
    const k = (t - t2) / (t3 - t2);
    return { x: b.ground.x + (m.x - b.ground.x) * k, y: b.ground.y + (m.y - b.ground.y) * k, heading: toward(b.ground, m), moving: true };
  }
  // At the ground: a slow swing on the anchor line.
  const swing = Math.sin((t - t1) * 900) * 0.5;
  return { x: b.ground.x + Math.cos(swing) * 3, y: b.ground.y + Math.sin(swing) * 3, heading: swing + Math.PI / 2, moving: false };
}

// ── a person's day ──────────────────────────────────────────────────────────────

const OUTBOUND = new Set(["herder", "forester", "miner", "stonecutter", "carter"]);
const CRAFT = new Set(["smith", "potter", "weaver", "carpenter", "healer"]);
const GREEN = new Set(["trader", "innkeeper", "teacher"]);

/**
 * Everyone's plan for a world day. Computed once per day; `whereabouts` evaluates an instant of it.
 * Infants are left out: they are carried, and nothing in this file draws a carried child.
 */
export function dayPlans(
  s: Settlement,
  plan: VillagePlan,
  day: number,
  /** The cell's changes (C44): a talk goal or a decision to leave moves someone's evening. */
  changes: readonly LifeChange[] = [],
): { plans: DayPlan[]; boats: (BoatDay | null)[]; moorings: Mooring[] } {
  const moorings = mooringsOn(s, plan, day);
  // The day's weather (C48): in a storm no boat goes out, and rain or snow sends everyone in early.
  const weather = weatherOn(s.seed, s.cell, s.geography, day, s);
  const wet = weather.kind === "rain" || weather.kind === "snow" || weather.kind === "storm" ? weather.fall : 0;
  // A burial, a wedding, a new child's callers (C52): whoever goes, goes after work; and a household
  // with a fisher among them keeps its boat in for the day.
  const gatherings = gatheringsOn(s, plan, day);
  const going = new Map<string, { g: Gathering; at: Point; heading: number }>();
  for (const g of gatherings) {
    for (const id of [...g.centre, ...g.guests]) {
      const place = g.places.get(id);
      if (place && !going.has(id)) going.set(id, { g, ...place });
    }
  }
  const ashore = new Set<number>();
  if (going.size > 0) {
    for (const p of s.people) {
      if (!going.has(p.id) || occupationOn(p, day) !== "fisher") continue;
      ashore.add(p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto);
    }
  }
  const boats = moorings.map((m, i) => (weather.kind === "storm" || ashore.has(m.household) ? null : boatDay(plan, m, i, day)));
  const boatOf = new Map(moorings.map((m, i) => [m.household, i]));
  const away = plan.dock ? toward(plan.dock.root, plan.centre) : toward(plan.arrival, plan.centre) + Math.PI;
  const fieldFor = (plot: Plot) =>
    plan.fields.length === 0 ? null : plan.fields.reduce((best, f) => (dist(f, plot) < dist(best, plot) ? f : best), plan.fields[0]);

  const plans: DayPlan[] = [];
  const temper = temperaments(s);
  const seats = new Map<number, number>();
  const changed = new Set(changes.map((c) => c.person));
  // Every leg goes round the houses, not through them (C46): one graph for the village, many walks.
  const nav = navGraph(plan);
  const ways = new Map<string, Point[]>();
  const way = (a: Point, b: Point): Point[] => {
    const k = `${a.x.toFixed(2)},${a.y.toFixed(2)}>${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    let w = ways.get(k);
    if (w === undefined) {
      w = route(nav, a, b);
      ways.set(k, w);
    }
    return w;
  };
  const walkLength = (a: Point, b: Point) => pathLength([a, ...way(a, b), b]);
  // Whose door and whose grave a moved evening may go to: the person it is about (C44).
  const residents = residentsOn(s, plan, day);
  const doorOfPerson = new Map(residents.map(({ person, plot }) => [person.id, doorOf(plot)]));
  const graves = changed.size > 0 ? new Map(gravesOn(s, plan, day).map((g) => [g.person, { x: g.x, y: g.y }])) : new Map<string, Point>();
  // Friends stand together in the evening (C49): each circle of friends gathers at one spot on the
  // green, named by its least id, and its members stand round it.
  const circle = friendCircles(s, day);
  const members = new Map<string, string[]>();
  for (const { person } of residents) {
    const k = circle.get(person.id) ?? person.id;
    const list = members.get(k);
    if (list) list.push(person.id);
    else members.set(k, [person.id]);
  }
  const eveningSpotOf = (id: string): Point => {
    const k = circle.get(id) ?? id;
    const group = members.get(k) ?? [id];
    if (group.length <= 1) return greenSpot(plan, id, 0.9);
    const centre = greenSpot(plan, k, 0.9);
    const i = group.indexOf(id);
    const a = (i / group.length) * Math.PI * 2 + hash01(`${k}/circle`) * Math.PI;
    const r = 0.55 + 0.12 * group.length;
    return { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
  };
  for (const { person: p, plot } of residents) {
    const age = ageYears(p, day);
    if (age < SCHEDULE.infantYears) continue;
    const t = temper.get(p.id)!;
    const trade = occupationOn(p, day);
    const pace = (0.86 + 0.14 * (t[3] + 1)) * (age >= SCHEDULE.elderYears ? 0.72 : age < SCHEDULE.childYears ? 1.1 : 1);
    const v = SCHEDULE.walkMps * pace * WORLD_DAY_S; // metres per day-fraction
    const j = (what: string) => jitter(p.id, day, what) * 2 * SCHEDULE.jitter;
    const door = doorOf(plot);
    const legs: Leg[] = [];
    const stays: Stay[] = [];
    let clock = SCHEDULE.wake + j("wake") - 0.01 * t[6];
    let here = door;
    const go = (to: Point) => {
      const via = way(here, to);
      const dur = pathLength([here, ...via, to]) / v;
      legs.push({ t0: clock, t1: clock + dur, from: here, to, via });
      clock += dur;
      here = to;
    };
    const stay = (until: number, heading: number, activity: Activity, wander = 0) => {
      if (until > clock) stays.push({ t0: clock, t1: until, at: here, heading, activity, wander });
      clock = Math.max(clock, until);
    };
    /** Home to the door, and in. Indoors is simply the absence of any leg or stay. */
    const bed = () => {
      go(door);
      stays.push({ t0: clock, t1: clock + 0.004, at: door, heading: plot.facing + Math.PI, activity: "stand", wander: 0 });
    };

    const household = p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto;
    const boatIndex = boatOf.get(household);
    const rows = age >= SCHEDULE.childYears && age < SCHEDULE.elderYears && trade === "fisher" && boatIndex !== undefined && boats[boatIndex] !== null;
    // A moment on the step, then the day — except for those who row out, who leave before first
    // light; a stay on the step would overlap the walk down to the dock.
    if (!rows) stay(clock + 0.006, plot.facing, "stand");

    let boat: number | null = null;
    const gathering = going.get(p.id) ?? null;
    /**
     * To the gathering and through it (C52). A village is a hundred metres and more across and a
     * stroll is a stroll, so whatever the day was doing ends early enough to walk there by the start:
     * the last stay is cut short, or the last walk home from beyond the village is set off sooner.
     */
    const attend = () => {
      if (!gathering) return;
      const leave = gathering.g.t0 - walkLength(here, gathering.at) / v - 0.002;
      if (clock > leave) {
        const lastStay = stays[stays.length - 1];
        const lastLeg = legs[legs.length - 1];
        if (lastStay && lastStay.t1 === clock) {
          lastStay.t1 = Math.max(lastStay.t0, leave);
          clock = lastStay.t1;
        } else if (lastLeg && lastLeg.t1 === clock) {
          const before = Math.max(0, ...stays.filter((x) => x.t1 <= lastLeg.t0).map((x) => x.t1), ...legs.filter((x) => x !== lastLeg && x.t1 <= lastLeg.t0).map((x) => x.t1));
          const shift = Math.min(clock - leave, lastLeg.t0 - before);
          lastLeg.t0 -= shift;
          lastLeg.t1 -= shift;
          clock = lastLeg.t1;
        }
      }
      go(gathering.at);
      stay(gathering.g.t1 + j("gather") * 0.3, gathering.heading, gathering.g.kind === "funeral" ? "mourn" : "stand");
    };
    if (age < SCHEDULE.childYears) {
      const play = greenSpot(plan, p.id, 0.55);
      go(play);
      if (gathering) {
        stay(gathering.g.t0, 0, "play", plan.greenRadiusM * 0.45);
        attend();
        if (gathering.g.kind === "funeral" && gathering.g.family.includes(p.id)) {
          bed();
          plans.push({ person: p.id, legs, stays, pace, boat });
          continue;
        }
        go(play);
      }
      stay(SCHEDULE.childBed + j("play") - 0.08 * wet, 0, "play", plan.greenRadiusM * 0.45);
      bed();
    } else if (age >= SCHEDULE.elderYears) {
      const seat = benchSeat(plan, p.id);
      go(seat.at);
      if (gathering) {
        stay(gathering.g.t0, seat.heading, "sit");
        attend();
        if (gathering.g.kind === "funeral" && gathering.g.family.includes(p.id)) {
          bed();
          plans.push({ person: p.id, legs, stays, pace, boat });
          continue;
        }
        go(seat.at);
      }
      stay(SCHEDULE.elderBed + j("bed") - 0.1 * wet, seat.heading, "sit");
      bed();
    } else {
      const work = SCHEDULE.workEnd + j("end") - 0.06 * wet;
      if (rows) {
        boat = boatIndex!;
        const b = boats[boat]!;
        const m = moorings[boat];
        // Walk down to the dock in time for the boat, go out in it, come back, walk up.
        clock = Math.min(clock, b.t[0] - walkLength(door, m) / v - 0.004);
        go({ x: m.x, y: m.y });
        stay(b.t[0], m.heading, "stand");
        const seat = seats.get(boat) ?? 0;
        seats.set(boat, seat + 1);
        stays.push({ t0: b.t[0], t1: b.t[3], at: { x: m.x, y: m.y }, heading: m.heading, activity: "fish", wander: 0, seat: seat === 0 ? -0.55 : 0.75 });
        clock = b.t[3];
      } else if (trade === "fisher" || (trade === "labourer" && plan.dock && hash01(`${p.id}/dock`) < 0.5)) {
        // Mending nets and hauling on the dock.
        go(plan.dock ? along(plan.dock.root, plan.dock.heading, 2 + hash01(`${p.id}/net`) * (plan.dock.lengthM - 4)) : greenSpot(plan, p.id, 1));
        stay(work, plan.dock ? plan.dock.heading + Math.PI / 2 : 0, "work", 1.5);
      } else if (trade === "farmer" || trade === "labourer") {
        const f = fieldFor(plot);
        if (f) {
          const u = (hash01(`${p.id}/row`) - 0.5) * f.lengthM * 0.7;
          const w = (hash01(`${p.id}/col`) - 0.5) * f.widthM * 0.7;
          go({ x: f.x + Math.cos(f.heading) * u - Math.sin(f.heading) * w, y: f.y + Math.sin(f.heading) * u + Math.cos(f.heading) * w });
          stay(work, f.heading, "stoop", 4);
        } else {
          stay(work, plot.facing, "work", 1);
        }
      } else if ((trade === "miner" || trade === "stonecutter") && plan.mine) {
        // To the mine, where there is one (C45): in front of the mouth, on the village side (the mine's
        // heading points at the green), at the spoil and the cart, facing the rock, all day.
        const m = plan.mine;
        const a = m.heading + (hash01(`${p.id}/face`) - 0.5) * 2.2;
        const r = 3 + hash01(`${p.id}/face-r`) * 2.5;
        go({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r });
        stay(work, a + Math.PI, "work", 0.6);
      } else if (OUTBOUND.has(trade)) {
        // Out inland and over the hill: gone until the evening, then back the way they went.
        const out = along(plan.centre, away + (hash01(`${p.id}/out`) - 0.5) * 1.6, SCHEDULE.outboundM);
        go(out);
        // Back so as to be in by the end of work, but never before they got there: a slow walker on
        // a long road would otherwise be on the way back while still on the way out.
        // On a gathering's day the way back goes straight to it, to be there by the start (C52).
        const back = gathering ? gathering.at : greenSpot(plan, p.id, 1.15);
        const via = way(out, back);
        const dur = pathLength([out, ...via, back]) / v;
        const t0 = Math.max(clock, (gathering ? gathering.g.t0 : work) - dur);
        legs.push({ t0, t1: t0 + dur, from: out, to: back, via });
        here = back;
        clock = t0 + dur;
      } else if (GREEN.has(trade)) {
        go(greenSpot(plan, p.id, 1.05));
        stay(work, toward(here, plan.centre), "stand", 0.8);
      } else if (CRAFT.has(trade)) {
        go(along(door, plot.facing + (hash01(`${p.id}/yard`) - 0.5), 1.8));
        stay(work, plot.facing, "work");
      } else {
        stay(work, plot.facing, "work", 1);
      }
      attend();
      // After a burial, the dead's family go home to their grief; everyone else to the green.
      if (gathering && gathering.g.kind === "funeral" && gathering.g.family.includes(p.id)) {
        bed();
        plans.push({ person: p.id, legs, stays, pace, boat });
        continue;
      }
      // The evening: on the green with everyone, unless a conversation has sent it somewhere (C44).
      const evening = changed.has(p.id) ? eveningOf(s, p, day, changes) : null;
      const until = SCHEDULE.gatherEnd + j("bed") + (age < 30 ? 0.03 : 0) - 0.06 * wet;
      const about = evening?.target ?? null;
      const spot = evening === null ? null : eveningSpot(plan, p.id, plot, evening.place, about ? (doorOfPerson.get(about) ?? null) : null, about ? (graves.get(about) ?? null) : null);
      if (spot === null) {
        const mine = eveningSpotOf(p.id);
        go(mine);
        // Facing in, toward the middle of the circle they are in, or the well if they are alone.
        const k = circle.get(p.id) ?? p.id;
        const faceTo = (members.get(k)?.length ?? 1) > 1 ? greenSpot(plan, k, 0.9) : plan.centre;
        stay(until, toward(here, faceTo), "stand", 0.15);
      } else if (spot !== "here") {
        go(spot.at);
        stay(until, spot.heading, spot.activity, spot.wander);
      } else {
        stay(until, plot.facing, "work", 1);
      }
      bed();
    }
    plans.push({ person: p.id, legs, stays, pace, boat });
  }
  return { plans, boats, moorings };
}

/**
 * Where an evening a conversation has moved is spent. `here` is "stay at the work you were doing";
 * null is "the green after all" (there is no dock to go to, say).
 */
function eveningSpot(
  plan: VillagePlan,
  person: string,
  plot: Plot,
  place: GoalPlace,
  /** The door of the person the goal is about, if they live here: looking after someone is at THEIR house. */
  theirDoor: Point | null,
  /** The grave of the person the goal is about, if it is still marked. */
  theirGrave: Point | null,
): { at: Point; heading: number; activity: Activity; wander: number } | "here" | null {
  switch (place) {
    case "green":
      return null;
    case "work":
      return "here";
    case "home":
      if (theirDoor) return { at: along(theirDoor, hash01(`${person}/evening-door`) * Math.PI * 2, 1.2), heading: toward(theirDoor, plan.centre), activity: "stand", wander: 0.3 };
      return { at: doorOf(plot), heading: plot.facing, activity: "stand", wander: 0.3 };
    case "dock": {
      if (!plan.dock) return null;
      const at = along(plan.dock.root, plan.dock.heading, 2 + hash01(`${person}/evening-dock`) * (plan.dock.lengthM - 4));
      return { at, heading: plan.dock.heading, activity: "stand", wander: 0.5 };
    }
    case "graveyard": {
      if (!plan.graveyard) return null;
      if (theirGrave) {
        // At the foot of the grave, facing it.
        const at = { x: theirGrave.x, y: theirGrave.y - 1.1 };
        return { at, heading: Math.PI / 2, activity: "stand", wander: 0 };
      }
      const a = hash01(`${person}/evening-grave`) * Math.PI * 2;
      const at = along(plan.graveyard, a, plan.graveyard.radiusM * 0.6);
      return { at, heading: toward(at, plan.graveyard), activity: "stand", wander: 0 };
    }
    case "edge": {
      // Out past the last houses on the way in, looking away from the village.
      const out = toward(plan.centre, plan.arrival);
      const at = along(plan.arrival, out + (hash01(`${person}/evening-edge`) - 0.5) * 0.8, 4);
      return { at, heading: out, activity: "stand", wander: 0 };
    }
  }
}

/** A point a fraction `k` of the way along a leg, by distance, and the way it faces there. */
function alongPath(leg: Leg, k: number): { x: number; y: number; heading: number } {
  if (leg.via.length === 0) {
    return { x: leg.from.x + (leg.to.x - leg.from.x) * k, y: leg.from.y + (leg.to.y - leg.from.y) * k, heading: toward(leg.from, leg.to) };
  }
  const pts = [leg.from, ...leg.via, leg.to];
  let left = pathLength(pts) * k;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (left <= seg || i === pts.length - 1) {
      const f = seg === 0 ? 0 : Math.min(1, left / seg);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, heading: toward(pts[i - 1], pts[i]) };
    }
    left -= seg;
  }
  return { x: leg.to.x, y: leg.to.y, heading: toward(leg.from, leg.to) };
}

/** Where a person is at hour `t` of their day plan. */
export function whereabouts(d: DayPlan, t: number, boats: readonly (BoatDay | null)[], moorings: readonly Mooring[]): Whereabouts {
  for (const leg of d.legs) {
    if (t >= leg.t0 && t < leg.t1) {
      const k = (t - leg.t0) / (leg.t1 - leg.t0);
      const at = alongPath(leg, k);
      // Each person walks a little to one side of the line (C46), so two on the same lane are not one
      // body; the offset is nothing at either end, where a leg meets a door or a seat.
      const lane = (hash01(`${d.person}/lane`) - 0.5) * 0.8 * Math.sin(Math.PI * k);
      return {
        x: at.x - Math.sin(at.heading) * lane,
        y: at.y + Math.cos(at.heading) * lane,
        heading: at.heading,
        activity: "walk",
        speed: d.pace,
        // Past the outbound distance a person is over the hill; the fog hides the rest.
        visible: true,
        boat: null,
      };
    }
  }
  for (const s of d.stays) {
    if (t >= s.t0 && t < s.t1) {
      if (s.activity === "fish" && d.boat !== null) {
        const b = boatAt(boats[d.boat] ?? null, moorings[d.boat], t);
        const seat = s.seat ?? 0;
        return {
          x: b.x + Math.cos(b.heading) * seat,
          y: b.y + Math.sin(b.heading) * seat,
          heading: b.heading,
          activity: b.moving ? "row" : "fish",
          speed: 0,
          visible: true,
          boat: d.boat,
        };
      }
      let { x, y } = s.at;
      let heading = s.heading;
      let moving = false;
      if (s.wander > 0) {
        // A slow figure-of-eight about the spot: a furrow worked along, a game of tag. A runner faces
        // the way the curve is going, which is its derivative; a worker keeps facing the work.
        const rate = s.activity === "play" ? 0.5 : 0.06;
        const phase = (t - s.t0) * WORLD_DAY_S * rate + hash01(d.person) * 6.28;
        x += Math.sin(phase) * s.wander;
        y += Math.sin(phase * 2) * s.wander * 0.5;
        moving = s.activity === "play";
        if (moving) heading = Math.atan2(Math.cos(phase * 2) * s.wander, Math.cos(phase) * s.wander);
      }
      return { x, y, heading, activity: s.activity, speed: moving ? 1.6 : 0, visible: true, boat: null };
    }
  }
  return { x: 0, y: 0, heading: 0, activity: "stand", speed: 0, visible: false, boat: null };
}

/** The world day and hour of an instant, as the schedule reads them. */
export function dayAndHour(worldDay: number): { day: number; hour: number } {
  const day = Math.floor(worldDay);
  return { day, hour: worldDay - day };
}

/** Who a person is, in the form a nameplate wants. */
export function personLabel(s: Settlement, p: Person, day: number): string {
  return `${p.given} ${p.family} · ${Math.floor(ageYears(p, day))} · ${occupationOn(p, day)}`;
}
