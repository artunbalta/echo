/**
 * Everyone's day (`lib/schedule.ts`, DECISIONS C41), against the same hand-written grounds as
 * `village.test.ts`, so a failure names a rule of the day and not a terrain.
 *
 * Run:  node --import tsx --test packages/planet/tests/schedule.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ageYears, settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { temperaments } from "../lib/life.js";
import { villagePlan, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";
import { SCHEDULE, boatAt, dayPlans, whereabouts } from "../lib/schedule.js";
import { WORLD_DAY_S } from "../lib/worldclock.js";
import { pathLength } from "../lib/nav.js";
import { weatherOn } from "../lib/weather.js";

const SEED = "echo-planet-0001";
const COAST: SettlementGeography = {
  habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7,
};
const VALLEY: SettlementGeography = {
  habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6,
};
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const INLAND: VillageGround = { heightAt: (x, y) => 20 + 2 * Math.sin(x / 50) * Math.cos(y / 60), standable: (x, y) => Math.hypot(x, y) < 900 };
const INLAND_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: null };

function villages(geo: SettlementGeography, ground: VillageGround, site: VillageSite, n: number, prefix: string): { s: Settlement; plan: VillagePlan }[] {
  const out: { s: Settlement; plan: VillagePlan }[] = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, geo, 0);
    const plan = s && villagePlan(s, ground, site);
    // A village with people in it today. An abandoned one has a plan and nobody to live a day in it,
    // and these tests are about the day.
    if (s && plan && s.people.filter((p) => p.birthDay <= 0 && p.deathDay > 0).length >= 10) out.push({ s, plan });
  }
  assert.equal(out.length, n);
  return out;
}

const byId = (s: Settlement) => new Map(s.people.map((p) => [p.id, p]));

test("a day is one unbroken path: every leg starts where the last thing ended, and nothing overlaps", () => {
  for (const [geo, ground, site] of [[COAST, SHORE, SHORE_SITE], [VALLEY, INLAND, INLAND_SITE]] as const) {
    for (const { s, plan } of villages(geo, ground, site, 6, "path")) {
      const { plans } = dayPlans(s, plan, 0);
      assert.ok(plans.length > 5, `${s.cell}: only ${plans.length} people have a day`);
      for (const d of plans) {
        const parts = [
          ...d.legs.map((l) => ({ t0: l.t0, t1: l.t1, start: l.from, end: l.to })),
          ...d.stays.map((st) => ({ t0: st.t0, t1: st.t1, start: st.at, end: st.at })),
        ].sort((a, b) => a.t0 - b.t0);
        for (let i = 1; i < parts.length; i++) {
          assert.ok(parts[i].t0 >= parts[i - 1].t1 - 1e-12, `${d.person}: two things at once at ${parts[i].t0.toFixed(4)}`);
          // A fishing stay follows the boat, so only check continuity between ordinary pieces.
          const gap = Math.hypot(parts[i].start.x - parts[i - 1].end.x, parts[i].start.y - parts[i - 1].end.y);
          if (parts[i].t0 - parts[i - 1].t1 < 1e-9) assert.ok(gap < 1e-6, `${d.person}: jumped ${gap.toFixed(2)} m at ${parts[i].t0.toFixed(4)}`);
        }
        for (const p of parts) assert.ok(p.t1 >= p.t0, `${d.person}: a piece that ends before it starts`);
      }
    }
  }
});

test("everyone walks at their own pace, in metres per real second, and nobody runs between chores", () => {
  for (const { s, plan } of villages(VALLEY, INLAND, INLAND_SITE, 4, "pace")) {
    for (const d of dayPlans(s, plan, 0).plans) {
      for (const l of d.legs) {
        // The way walked, round the houses (C46), not the straight line.
        const metres = pathLength([l.from, ...l.via, l.to]);
        if (metres < 1) continue;
        const mps = metres / ((l.t1 - l.t0) * WORLD_DAY_S);
        assert.ok(Math.abs(mps - SCHEDULE.walkMps * d.pace) < 1e-6, `${d.person}: ${mps.toFixed(3)} m/s against a pace of ${d.pace.toFixed(3)}`);
        assert.ok(mps > 0.6 && mps < 2.0, `${d.person}: ${mps.toFixed(2)} m/s is not a walk`);
      }
    }
  }
});

test("the temperament shows in the stride: more energy, a quicker walk", () => {
  for (const { s, plan } of villages(VALLEY, INLAND, INLAND_SITE, 4, "energy")) {
    const temper = temperaments(s);
    const people = byId(s);
    const adults = dayPlans(s, plan, 0).plans.filter((d) => {
      const age = ageYears(people.get(d.person)!, 0);
      return age >= SCHEDULE.childYears && age < SCHEDULE.elderYears;
    });
    for (const a of adults) {
      for (const b of adults) {
        if (temper.get(a.person)![3] > temper.get(b.person)![3] + 1e-9) assert.ok(a.pace > b.pace, `${a.person} has more energy and walks slower`);
      }
    }
  }
});

test("at midnight the village is asleep: nobody is out", () => {
  for (const { s, plan } of villages(COAST, SHORE, SHORE_SITE, 6, "night")) {
    const { plans, boats, moorings } = dayPlans(s, plan, 0);
    for (const d of plans) {
      // 0.95 and not 0.92: since C46 the young walk home round the houses, and the last of them is at
      // their door just after 0.917 — ten past ten. Midnight is the claim, and midnight is checked.
      for (const t of [0.02, 0.1, 0.17, 0.95, 0.98]) {
        assert.equal(whereabouts(d, t, boats, moorings).visible, false, `${d.person} is out at ${t}`);
      }
    }
  }
});

test("at noon the boats are out, the fishers are in them, and the children are on the green", () => {
  let atSea = 0;
  let children = 0;
  for (const { s, plan } of villages(COAST, SHORE, SHORE_SITE, 8, "noon")) {
    const { plans, boats, moorings } = dayPlans(s, plan, 0);
    const people = byId(s);
    for (const d of plans) {
      const w = whereabouts(d, 0.45, boats, moorings);
      if (d.boat !== null) {
        assert.equal(w.boat, d.boat, `${d.person} should be at sea at noon`);
        const m = moorings[d.boat];
        assert.ok(Math.hypot(w.x - m.x, w.y - m.y) > 40, `${d.person}'s boat is still at the dock at noon`);
        assert.ok(SHORE.heightAt(w.x, w.y) < 0, `${d.person}'s boat is on dry land`);
        atSea++;
      }
      if (ageYears(people.get(d.person)!, 0) < SCHEDULE.childYears) {
        assert.ok(w.visible, `${d.person}, a child, is indoors at noon`);
        assert.ok(Math.hypot(w.x - plan.centre.x, w.y - plan.centre.y) < plan.greenRadiusM * 1.2, `${d.person}, a child, is not on the green`);
        children++;
      }
    }
  }
  assert.ok(atSea > 5, `only ${atSea} fishers at sea`);
  assert.ok(children > 10, `only ${children} children checked`);
});

test("a boat is moored before it sails and after it returns, and rides at its ground between", () => {
  for (const { s, plan } of villages(COAST, SHORE, SHORE_SITE, 6, "boat")) {
    const { boats, moorings } = dayPlans(s, plan, 0);
    // A storm keeps every boat in (C48); otherwise only one drawn up ashore stays.
    const storm = weatherOn(s.seed, s.cell, s.geography, 0, s).kind === "storm";
    boats.forEach((b, i) => {
      const m = moorings[i];
      if (b === null) {
        assert.ok(m.ashore || storm, "only a boat drawn up ashore, or any boat in a storm, has no day");
        return;
      }
      for (const t of [b.t[0] - 0.01, b.t[3] + 0.01]) {
        const at = boatAt(b, m, t);
        assert.deepEqual([at.x, at.y], [m.x, m.y]);
      }
      const mid = boatAt(b, m, (b.t[1] + b.t[2]) / 2);
      assert.ok(Math.hypot(mid.x - b.ground.x, mid.y - b.ground.y) < 4, "a boat wandered off its ground");
      assert.ok(b.t[0] < b.t[1] && b.t[1] < b.t[2] && b.t[2] < b.t[3], "a boat's day is out of order");
    });
  }
});

test("the same day twice is the same day, and another day is not", () => {
  const { s, plan } = villages(VALLEY, INLAND, INLAND_SITE, 1, "same")[0];
  assert.deepEqual(dayPlans(s, plan, 0), dayPlans(s, plan, 0));
  assert.notDeepEqual(dayPlans(s, plan, 0).plans, dayPlans(s, plan, 1).plans);
});
