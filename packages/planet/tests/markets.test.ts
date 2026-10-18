/**
 * Villages trading with each other (`lib/markets.ts`, DECISIONS C58), and the traders' road and stall
 * in the day plans.
 *
 * Run:  node --import tsx --test packages/planet/tests/markets.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { present } from "../lib/life.js";
import { daysToMarket, goodsOf, isMarketDay, isTravelDay, lacksOf, marketOf, MARKETS, stallOf, stockOn, TRADE_GOODS, workersOf, type MarketCandidate } from "../lib/markets.js";
import { dayPlans, doorOf, homeState, SCHEDULE, whereabouts } from "../lib/schedule.js";
import { ageYears, occupationOn, settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { residentsOn, villagePlan, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.6, wooded: 0.3, mountain: 0.3, tradeAccess: 0.9 };
const GROUND: VillageGround = { heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37), standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900 };
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const DAY = 4960;

/** A village with traders in it, and a neighbour that has what it lacks. */
let s!: Settlement;
let plan!: VillagePlan;
for (let i = 0; i < 80; i++) {
  const t = settlementAt(SEED, `mk-${i}`, GEO, DAY);
  const p = t && villagePlan(t, GROUND, SITE);
  if (!t || !p) continue;
  const w = workersOf(t, DAY);
  if ((w.get("trader") ?? 0) + (w.get("carter") ?? 0) >= 2 && lacksOf(t, DAY).length >= 2 && t.people.filter((q) => present(t, q, DAY)).length > 30) {
    s = t;
    plan = p;
    break;
  }
}
const cand = (cell: string, goods: string[], x: number, y: number): MarketCandidate => ({ cell, name: `V${cell}`, goods, x, y, km: Math.hypot(x, y) / 1000 });

test("C58: a village has to spare what two or more of its people work at, and goes without what nobody does", () => {
  assert.ok(s, "no village with traders to test");
  const w = workersOf(s, DAY);
  for (const [trade, good] of Object.entries(TRADE_GOODS)) {
    const n = w.get(trade as never) ?? 0;
    assert.equal(goodsOf(s, DAY).includes(good!), n >= MARKETS.surplusWorkers, `${trade} (${n}) and ${good}`);
    assert.equal(lacksOf(s, DAY).includes(good!), n === 0, `${trade} (${n}) and ${good}`);
  }
});

test("C58: the partner is the neighbour with the most of what the village lacks, the nearest of a tie; none without traders or a need", () => {
  const lacks = lacksOf(s, DAY);
  const has = goodsOf(s, DAY);
  const one = cand("a", [lacks[0]!], 1000, 0);
  const two = cand("b", [lacks[0]!, lacks[1]!], 2500, 0);
  const twoNear = cand("c", [lacks[0]!, lacks[1]!], 0, 1800);
  const useless = cand("d", has, 400, 0);
  const m = marketOf(s, [one, two, twoNear, useless], DAY)!;
  assert.equal(m.partner.cell, "c");
  assert.ok(Math.abs(m.partner.bearing - Math.PI / 2) < 1e-9, "the road does not lead toward the partner");
  assert.deepEqual(m.brings, [lacks[0], lacks[1]]);
  assert.equal(marketOf(s, [useless], DAY), null, "a market with a neighbour that has nothing this village lacks");
  for (const id of m.goers) assert.ok(["trader", "carter"].includes(occupationOn(s.people.find((p) => p.id === id)!, DAY)));
  // The same for anyone who asks, on any page.
  assert.deepEqual(marketOf(s, [one, two, twoNear, useless], DAY), m);
});

test("C58: a market every sixth day, the road the day before, and the goods for two days after", () => {
  const m = marketOf(s, [cand("c", lacksOf(s, DAY).slice(0, 2), 0, 1800)], DAY)!;
  let markets = 0;
  for (let d = DAY; d < DAY + 60; d++) {
    if (isMarketDay(m, d)) {
      markets++;
      assert.equal(isTravelDay(m, d - 1), true, "no road the day before a market");
      assert.equal(daysToMarket(m, d), 0);
      assert.deepEqual(stockOn(m, d), m.brings);
      assert.deepEqual(stockOn(m, d + MARKETS.stockDays), m.brings);
      assert.deepEqual(stockOn(m, d + MARKETS.stockDays + 1), [], "the stock lasts forever");
    }
  }
  assert.equal(markets, 10);
});

test("C58: the traders go out along the partner's road the day before and are away that night; on market day they come in from it to the stall", () => {
  const m = marketOf(s, [cand("c", lacksOf(s, DAY).slice(0, 2), 0, 1800)], DAY)!;
  const withMarket: VillagePlan = { ...plan, market: m };
  let travel = DAY;
  while (!isTravelDay(m, travel)) travel++;
  const doors = new Map(residentsOn(s, plan, travel).map(({ person, plot }) => [person.id, doorOf(plot)]));
  const road = { x: plan.centre.x + Math.cos(m.partner.bearing) * SCHEDULE.outboundM, y: plan.centre.y + Math.sin(m.partner.bearing) * SCHEDULE.outboundM };
  const on = dayPlans(s, withMarket, travel);
  for (const id of m.goers) {
    const d = on.plans.find((x) => x.person === id);
    if (!d) continue;
    const last = d.legs.at(-1)!;
    assert.ok(Math.hypot(last.to.x - road.x, last.to.y - road.y) < 1e-6, `${id} does not take the road toward the partner`);
    assert.equal(homeState(d, 0.95, doors.get(id)!), "away", "a trader home in bed the night of the road");
  }
  // Market day: in from the road in the morning, at the stall by mid-morning.
  const market = travel + 1;
  const stall = stallOf(plan);
  const sell = dayPlans(s, withMarket, market);
  let atStall = 0;
  for (const id of m.goers) {
    const d = sell.plans.find((x) => x.person === id);
    if (!d) continue;
    assert.ok(Math.hypot(d.legs[0]!.from.x - road.x, d.legs[0]!.from.y - road.y) < 1e-6, "the market morning does not begin on the road");
    assert.equal(homeState(d, 0.1, doors.get(id)!), "away", "asleep at home the night they were away");
    const w = whereabouts(d, 0.45, sell.boats, sell.moorings);
    if (w.visible && Math.hypot(w.x - stall.x, w.y - stall.y) < 4) atStall++;
  }
  assert.ok(atStall >= Math.min(2, m.goers.length), `${atStall} of ${m.goers.length} at the stall`);
  // Nobody else's day moves for the market.
  const without = dayPlans(s, plan, market);
  for (const d of without.plans) {
    if (m.goers.includes(d.person)) continue;
    assert.deepEqual(sell.plans.find((x) => x.person === d.person), d, `${d.person}'s day moved for the market`);
  }
});

test("C58: the stall stands at the edge of the green, facing in, wherever the day", () => {
  const st = stallOf(plan);
  const r = Math.hypot(st.x - plan.centre.x, st.y - plan.centre.y);
  assert.ok(r > plan.greenRadiusM * 0.5 && r <= plan.greenRadiusM, `${r} m from the well`);
  const toward = Math.atan2(plan.centre.y - st.y, plan.centre.x - st.x);
  assert.ok(Math.abs(Math.atan2(Math.sin(st.heading - toward), Math.cos(st.heading - toward))) < 1e-9, "the stall faces away from the green");
  assert.ok(ageYears(s.people[0]!, DAY) >= 0);
});
