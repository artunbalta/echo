/**
 * Walking round things (`lib/nav.ts`, DECISIONS C46, ⚑35): every leg of every day goes round the
 * houses, the well and the mine, and into the graveyard by its gate.
 *
 * THE TEST THAT MATTERS samples every leg of every villager's day and asks whether any point of it is
 * inside a house. Before C46 legs were straight lines, and on these same villages that put people
 * through walls on a measured share of legs (the count is printed by the first test and pinned
 * against regressing to it by the second).
 *
 * Run:  node --import tsx --test packages/planet/tests/nav.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { navGraph, pathLength, route } from "../lib/nav.js";
import { dayPlans, whereabouts } from "../lib/schedule.js";
import { settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { villagePlan, type Plot, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const VALLEY: SettlementGeography = { habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6 };
const HILLS: SettlementGeography = { habitability: 0.8, arable: 0.4, coastal: 0.05, wooded: 0.3, mountain: 0.85, tradeAccess: 0.5 };
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
    if (s && plan && s.people.filter((p) => p.birthDay <= 0 && p.deathDay > 0).length >= 25) out.push({ s, plan });
  }
  assert.equal(out.length, n);
  return out;
}

/** Inside a house's walls (not its grown footprint: the wall itself). */
const inHouse = (plot: Plot, x: number, y: number) => {
  const rx = x - plot.x;
  const ry = y - plot.y;
  const along = rx * Math.cos(plot.facing) + ry * Math.sin(plot.facing);
  const across = -rx * Math.sin(plot.facing) + ry * Math.cos(plot.facing);
  return Math.abs(along) < plot.depthM / 2 - 0.05 && Math.abs(across) < plot.widthM / 2 - 0.05;
};

/** Every walked point of a day, sampled along each leg. */
function walked(s: Settlement, plan: VillagePlan) {
  const { plans, boats, moorings } = dayPlans(s, plan, 0);
  const out: { person: string; x: number; y: number }[] = [];
  for (const d of plans) {
    for (const l of d.legs) {
      for (let i = 1; i < 40; i++) {
        const t = l.t0 + ((l.t1 - l.t0) * i) / 40;
        const w = whereabouts(d, t, boats, moorings);
        out.push({ person: d.person, x: w.x, y: w.y });
      }
    }
  }
  return out;
}

test("C46: nobody walks through a house, the well or the mine — on the coast, in a valley, in the hills", () => {
  let points = 0;
  for (const [geo, ground, site, tag] of [[COAST, SHORE, SHORE_SITE, "c"], [VALLEY, INLAND, INLAND_SITE, "v"], [HILLS, INLAND, INLAND_SITE, "h"]] as const) {
    for (const { s, plan } of villages(geo, ground, site, 4, `nav${tag}`)) {
      for (const p of walked(s, plan)) {
        points++;
        const through = plan.plots.find((plot) => inHouse(plot, p.x, p.y));
        assert.equal(through, undefined, `${s.cell}: ${p.person} walks through the house on plot ${through?.index} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
        assert.ok(Math.hypot(p.x - plan.centre.x, p.y - plan.centre.y) > 0.9, `${s.cell}: ${p.person} walks through the well`);
      }
    }
  }
  assert.ok(points > 20000, `only ${points} points walked`);
});

test("C46: the straight line would have gone through walls — the test above is not vacuous", () => {
  // The same villages' legs, drawn straight: how many cross a house. If this were zero, the test above
  // would pass with no routing at all and prove nothing.
  let crossing = 0;
  let legs = 0;
  for (const { s, plan } of villages(VALLEY, INLAND, INLAND_SITE, 4, "navv")) {
    for (const d of dayPlans(s, plan, 0).plans) {
      for (const l of d.legs) {
        legs++;
        for (let i = 1; i < 40; i++) {
          const x = l.from.x + ((l.to.x - l.from.x) * i) / 40;
          const y = l.from.y + ((l.to.y - l.from.y) * i) / 40;
          if (plan.plots.some((plot) => inHouse(plot, x, y))) {
            crossing++;
            break;
          }
        }
      }
    }
  }
  assert.ok(crossing > 10, `only ${crossing} of ${legs} straight legs would cross a house`);
});

test("C46: into the graveyard by its gate, and nowhere else through the wall", () => {
  let checked = 0;
  for (const { plan } of villages(COAST, SHORE, SHORE_SITE, 4, "navg")) {
    const y = plan.graveyard;
    if (!y) continue;
    const g = navGraph(plan);
    const gate = Math.atan2(plan.centre.y - y.y, plan.centre.x - y.x);
    const inside = { x: y.x + Math.cos(gate + Math.PI) * y.radiusM * 0.5, y: y.y + Math.sin(gate + Math.PI) * y.radiusM * 0.5 };
    const pts = [plan.centre, ...route(g, plan.centre, inside), inside];
    // Walk the polyline finely: where it crosses the wall, it must be at the gate.
    for (let i = 1; i < pts.length; i++) {
      for (let k = 0; k <= 50; k++) {
        const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 50;
        const yy = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 50;
        const r = Math.hypot(x - y.x, yy - y.y);
        if (Math.abs(r - y.radiusM) < 0.3) {
          const a = Math.atan2(yy - y.y, x - y.x);
          const off = Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate)));
          assert.ok(off < 0.5, `the way in crosses the wall ${off.toFixed(2)} rad from the gate`);
        }
      }
    }
    checked++;
  }
  assert.ok(checked >= 3);
});

test("C46: a way is the same every time, and a clear walk is a straight one", () => {
  const { plan } = villages(VALLEY, INLAND, INLAND_SITE, 1, "navs")[0];
  const g = navGraph(plan);
  assert.equal(navGraph(plan), g, "the graph is rebuilt for the same plan");
  const a = plan.plots[plan.plots.length - 1];
  const b = plan.plots[0];
  const from = { x: a.x + Math.cos(a.facing) * (a.depthM / 2 + 1.1), y: a.y + Math.sin(a.facing) * (a.depthM / 2 + 1.1) };
  const to = { x: b.x + Math.cos(b.facing) * (b.depthM / 2 + 1.1), y: b.y + Math.sin(b.facing) * (b.depthM / 2 + 1.1) };
  assert.deepEqual(route(g, from, to), route(g, from, to));
  assert.deepEqual(route(g, plan.centre, plan.centre), []);
  const way = [from, ...route(g, from, to), to];
  assert.ok(pathLength(way) >= Math.hypot(to.x - from.x, to.y - from.y) - 1e-9);
});

test("C46: a day's plans for a big village, routes and all, cost a few tens of milliseconds", () => {
  const big = villages(VALLEY, INLAND, INLAND_SITE, 6, "navp").sort((p, q) => q.plan.plots.length - p.plan.plots.length)[0];
  const t0 = performance.now();
  const fresh = villagePlan(big.s, INLAND, INLAND_SITE)!; // a new plan object: the graph is built too
  dayPlans(big.s, fresh, 0);
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms for ${fresh.plots.length} plots`);
});
