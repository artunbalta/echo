/**
 * A village's burials, weddings and new children's callers (`lib/events.ts`, DECISIONS C52), and the
 * days they make (`schedule.ts`).
 *
 * Run:  node --import tsx --test packages/planet/tests/events.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { COMING, GATHERINGS, comingOn, gatheringsOn, type Gathering, type GatheringKind } from "../lib/events.js";
import { present } from "../lib/life.js";
import { boatDay, dayPlans, doorOf, whereabouts } from "../lib/schedule.js";
import { weatherOn } from "../lib/weather.js";
import { socialGraph } from "../lib/social.js";
import { ageYears, occupationOn, settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { residentsOn, villagePlan, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.6, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const FROM = 4935;
const YEAR = 365;

interface Found {
  s: Settlement;
  plan: VillagePlan;
  g: Gathering;
}

/** Every gathering in a year of a dozen villages: the fixture every test below reads. */
const all: Found[] = (() => {
  const out: Found[] = [];
  for (let i = 0; i < 12; i++) {
    const s = settlementAt(SEED, `ev-${i}`, COAST, FROM + YEAR);
    const plan = s && villagePlan(s, SHORE, SHORE_SITE);
    if (!s || !plan) continue;
    for (let d = FROM; d < FROM + YEAR; d++) for (const g of gatheringsOn(s, plan, d)) out.push({ s, plan, g });
  }
  return out;
})();
const of = (kind: GatheringKind) => all.filter((f) => f.g.kind === kind);

test("C52: there are burials, weddings and callers in a year of villages, about as often as lives make them", () => {
  const villages = new Set(all.map((f) => f.s.cell)).size;
  for (const kind of ["funeral", "wedding", "naming"] as const) {
    const n = of(kind).length / Math.max(1, villages);
    assert.ok(n > 0.15 && n < 3, `${kind}: ${n.toFixed(2)} a village a year`);
  }
});

test("C52: a burial is the day after a death here, for the one who died, at their grave", () => {
  for (const { s, g } of of("funeral")) {
    const dead = s.people.find((p) => p.id === g.about[0])!;
    assert.equal(dead.deathDay, g.day - 1, `${dead.given} is buried ${g.day - dead.deathDay} days after dying`);
    assert.ok(present(s, dead, dead.deathDay - 1), "a burial for someone who did not die here");
    assert.ok(!g.guests.includes(dead.id), "the dead came to their own burial");
  }
  // And every death here has its burial.
  const { s, plan } = of("funeral")[0];
  for (const p of s.people) {
    if (p.deathDay < FROM + 1 || p.deathDay >= FROM + YEAR - 1 || !present(s, p, p.deathDay - 1)) continue;
    assert.ok(gatheringsOn(s, plan, p.deathDay + 1).some((g) => g.kind === "funeral" && g.about[0] === p.id), `${p.given} died and was never buried`);
  }
});

test("C52: a wedding is the day two people pair, both of them here, standing together at the middle", () => {
  assert.ok(of("wedding").length > 0);
  for (const { s, g } of of("wedding")) {
    const [a, b] = g.about.map((id) => s.people.find((p) => p.id === id)!);
    assert.equal(a.partner, b.index);
    assert.equal(a.partnerDay, g.day);
    assert.deepEqual(g.centre, g.about);
    assert.ok(!g.guests.includes(a.id) && !g.guests.includes(b.id), "the couple are their own guests");
  }
});

test("C52: family and friends always come; the dead, the carried and nobody twice", () => {
  for (const { s, plan, g } of all) {
    const day = g.day;
    const seen = new Set<string>();
    for (const id of [...g.centre, ...g.guests]) {
      assert.ok(!seen.has(id), `${id} is at ${g.id} twice`);
      seen.add(id);
      const p = s.people.find((q) => q.id === id)!;
      assert.ok(present(s, p, day), `${p.given} is not here and is at ${g.id}`);
      assert.ok(ageYears(p, day) >= 4, `a carried child of ${ageYears(p, day).toFixed(1)} is standing at ${g.id}`);
    }
    if (g.kind === "funeral") {
      const dead = s.people.find((p) => p.id === g.about[0])!;
      for (const t of socialGraph(s, dead.deathDay - 1, plan).get(dead.id) ?? []) {
        const q = s.people.find((p) => p.id === t.other)!;
        if (t.strength >= 2 && present(s, q, day) && ageYears(q, day) >= 4) assert.ok(seen.has(q.id), `${q.given}, ${t.kind} of ${dead.given}, missed the burial`);
      }
    }
  }
});

test("C52: everyone has their own place in the rings, a step apart, facing the middle", () => {
  for (const { g } of all) {
    const pts = [...g.places.entries()];
    assert.equal(pts.length, g.centre.length + g.guests.length);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][1].at.x - pts[j][1].at.x, pts[i][1].at.y - pts[j][1].at.y);
        assert.ok(d > 0.45, `${g.id}: two people stand ${d.toFixed(2)} m apart`);
      }
    }
    for (const id of g.guests) {
      const { at, heading } = g.places.get(id)!;
      const to = Math.atan2(g.at.y - at.y, g.at.x - at.x);
      assert.ok(Math.abs(Math.atan2(Math.sin(heading - to), Math.cos(heading - to))) < 1e-6, `${g.id}: a guest faces away`);
    }
  }
});

test("C52: the day goes to it — at the middle of the hour everyone who is going is in their place", () => {
  let at = 0;
  let going = 0;
  for (const { s, plan, g } of all.slice(0, 40)) {
    const { plans, boats, moorings } = dayPlans(s, plan, g.day);
    const mid = (g.t0 + g.t1) / 2 + 0.01;
    for (const id of [...g.centre, ...g.guests]) {
      const d = plans.find((x) => x.person === id);
      if (!d) continue;
      going++;
      const place = g.places.get(id)!;
      const w = whereabouts(d, mid, boats, moorings);
      if (w.visible && Math.hypot(w.x - place.at.x, w.y - place.at.y) < 1) {
        at++;
        if (g.kind === "funeral") assert.equal(w.activity, "mourn");
      }
    }
  }
  assert.ok(going > 50);
  assert.ok(at / going > 0.9, `only ${at} of ${going} are in their place at the middle of the hour`);
});

test("C52: a family with a fisher at the gathering keeps its boat in", () => {
  let checked = 0;
  for (const { s, plan, g } of all) {
    const fisher = [...g.centre, ...g.guests].map((id) => s.people.find((p) => p.id === id)!).find((p) => occupationOn(p, g.day) === "fisher" && ageYears(p, g.day) >= 13 && ageYears(p, g.day) < 68);
    if (!fisher) continue;
    const { boats, moorings } = dayPlans(s, plan, g.day);
    const household = fisher.partnerDay !== null && fisher.partnerDay <= g.day ? fisher.household : fisher.bornInto;
    const i = moorings.findIndex((m) => m.household === household);
    // Only a boat that would have gone out tells: one the sea or the day keeps in says nothing.
    if (i < 0 || boatDay(plan, moorings[i], i, g.day) === null || weatherOn(s.seed, s.cell, s.geography, g.day, s).kind === "storm") continue;
    assert.equal(boats[i], null, `${fisher.given} went out fishing on the day of ${g.id}`);
    if (++checked >= 5) break;
  }
  assert.ok(checked >= 2, `only ${checked} fishers at a gathering`);
});

test("C52: after a burial the family go home, and everyone else to the green", () => {
  let home = 0;
  let green = 0;
  for (const { s, plan, g } of of("funeral")) {
    const { plans } = dayPlans(s, plan, g.day);
    const doors = new Map(residentsOn(s, plan, g.day).map(({ person, plot }) => [person.id, doorOf(plot)]));
    for (const id of g.guests) {
      const d = plans.find((x) => x.person === id);
      const p = s.people.find((q) => q.id === id)!;
      if (!d) continue;
      // After the burial: the family, nothing but the step of their own door; everyone else sets off
      // for the green (the yard is a long walk from it, and on a short evening they may only reach it
      // as it empties).
      const place = g.places.get(id)!;
      const there = d.stays.find((x) => Math.hypot(x.at.x - place.at.x, x.at.y - place.at.y) < 0.01 && x.t1 > g.t0);
      if (!there) continue;
      const after = d.stays.filter((x) => x.t0 > there.t1);
      const next = d.legs.find((l) => l.t0 >= there.t1 - 1e-9);
      if (g.family.includes(id)) {
        assert.ok(after.every((x) => x.t1 - x.t0 < 0.005), `${p.given} spent the evening of the burial of their own out of doors`);
        const door = doors.get(id)!;
        assert.ok(next && Math.hypot(next.to.x - door.x, next.to.y - door.y) < 0.01, `${p.given} did not go straight home from the burial of their own`);
        home++;
      } else if (next && Math.hypot(next.to.x - plan.centre.x, next.to.y - plan.centre.y) <= plan.greenRadiusM * 1.2 && ageYears(p, g.day) >= 13) green++;
    }
  }
  assert.ok(home > 3 && green > 3, `home ${home}, green ${green}`);
});

test("C52: the village knows a wedding a week ahead and a child ten days ahead, and a death only on the day", () => {
  const { s, plan, g } = of("wedding")[0];
  for (let k = 1; k <= COMING.weddingDays + 2; k++) {
    const said = comingOn(s, plan, g.day - k).some((c) => c.kind === "wedding" && c.about.join() === g.about.join());
    assert.equal(said, k <= COMING.weddingDays, `${k} days before the wedding, the village ${said ? "knows" : "does not know"} of it`);
  }
  for (const { s: s2, plan: p2, g: f } of of("funeral").slice(0, 6)) {
    const deathDay = f.day - 1;
    for (let k = 1; k <= 5; k++) assert.ok(!comingOn(s2, p2, deathDay - k).some((c) => c.about.includes(f.about[0]) && c.kind === "funeral"), "a death foretold");
    assert.ok(comingOn(s2, p2, deathDay).some((c) => c.kind === "funeral" && c.about[0] === f.about[0]), "a death not known on the day");
  }
  const n = of("naming")[0];
  const child = n.s.people.find((p) => p.id === n.g.about[0])!;
  assert.ok(comingOn(n.s, n.plan, child.birthDay - 3).some((c) => c.kind === "expecting"), "nobody knew she was expecting");
  assert.ok(!comingOn(n.s, n.plan, child.birthDay - COMING.expectingDays - 1).some((c) => c.kind === "expecting" && c.day === child.birthDay));
});

test("C52: gatherings are read off the lives, so asking twice gives the same answer and the hours are the dials'", () => {
  const { s, plan, g } = all[0];
  assert.deepEqual(gatheringsOn(s, plan, g.day).map((x) => x.id), gatheringsOn(s, plan, g.day).map((x) => x.id));
  for (const { g: x } of all) assert.deepEqual([x.t0, x.t1], [...GATHERINGS[x.kind]]);
});
