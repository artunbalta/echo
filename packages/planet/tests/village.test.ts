/**
 * The village on the ground (`lib/village.ts`, `lib/villageAt.ts`, DECISIONS C41).
 *
 * Most of this runs against grounds written by hand — a coast with the sea to the east, a rolling
 * inland valley — so a failure names a rule rather than a terrain. The last block runs the real
 * planet, because "the browser's calibration builds the census's village" is a claim about the real
 * one and nothing else can test it.
 *
 * Run:  node --import tsx --test packages/planet/tests/village.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import { settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { present } from "../lib/life.js";
import {
  VILLAGE,
  gravesOn,
  householdOn,
  plotState,
  residentsOn,
  villagePlan,
  type VillageGround,
  type VillagePlan,
  type VillageSite,
} from "../lib/village.js";
import { villageAt } from "../lib/villageAt.js";
import { chooseCommons } from "../lib/commons.js";
import { geographySampler } from "../lib/geography.js";
import { landFractionSampler } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { calibratePlanet, createTerrain } from "../lib/terrain.js";
import { yearsToDays } from "../lib/worldclock.js";

const SEED = "echo-planet-0001";
const VALLEY: SettlementGeography = {
  habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6,
};
const COAST: SettlementGeography = {
  habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7,
};

/** A coast: the land falls gently east into the sea at about x = 466 m. The "cell" is 900 m round. */
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };

/** Rolling inland ground, no water anywhere. */
const INLAND: VillageGround = {
  heightAt: (x, y) => 20 + 2 * Math.sin(x / 50) * Math.cos(y / 60),
  standable: (x, y) => Math.hypot(x, y) < 900,
};
const INLAND_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: null };

function settlements(geo: SettlementGeography, day: number, n: number, prefix: string): Settlement[] {
  const out: Settlement[] = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, geo, day);
    if (s !== null) out.push(s);
  }
  assert.ok(out.length === n, `only ${out.length} settlements in 400 cells`);
  return out;
}

const plan = (s: Settlement, ground: VillageGround, site: VillageSite): VillagePlan => {
  const p = villagePlan(s, ground, site);
  assert.ok(p !== null, `${s.cell}: no plan`);
  return p;
};

// ── L2 ──────────────────────────────────────────────────────────────────────────

test("L2: a house built by an early day stands in the same place when the village is read later", () => {
  const early = -Math.round(yearsToDays(60));
  const late = Math.round(yearsToDays(20));
  let compared = 0;
  for (const [geo, ground, site] of [[VALLEY, INLAND, INLAND_SITE], [COAST, SHORE, SHORE_SITE]] as const) {
    for (let i = 0; i < 12; i++) {
      const a = settlementAt(SEED, `l2v-${i}`, geo, early);
      const b = settlementAt(SEED, `l2v-${i}`, geo, late);
      if (a === null || b === null) continue;
      const pa = plan(a, ground, site);
      const pb = plan(b, ground, site);
      // The place itself does not depend on the day at all.
      assert.deepEqual(pb.centre, pa.centre, `${a.cell}: the green moved`);
      assert.deepEqual(pb.arrival, pa.arrival, `${a.cell}: the arrival point moved`);
      assert.deepEqual(pb.dock, pa.dock, `${a.cell}: the dock moved`);
      assert.deepEqual(pb.fields, pa.fields, `${a.cell}: the fields moved`);
      assert.deepEqual(pb.graveyard, pa.graveyard, `${a.cell}: the graveyard moved`);
      // Every early plot is still there, in the same place, with the same families first.
      for (const p of pa.plots) {
        const q = pb.plots[p.index];
        assert.ok(q, `${a.cell}: plot ${p.index} vanished`);
        assert.deepEqual({ ...q, households: q.households.slice(0, p.households.length) }, p, `${a.cell}: plot ${p.index} changed`);
        compared++;
      }
      // And the state of an early plot on an early day is the same read from either horizon.
      for (const p of pa.plots) assert.equal(plotState(b, pb.plots[p.index], early), plotState(a, p, early));
    }
  }
  assert.ok(compared > 150, `only ${compared} plots compared`);
});

test("the same village twice is the same village", () => {
  const s = settlements(COAST, 0, 1, "twice")[0];
  assert.deepEqual(villagePlan(s, SHORE, SHORE_SITE), villagePlan(s, SHORE, SHORE_SITE));
});

// ── where things stand ──────────────────────────────────────────────────────────

test("every house stands on dry, level ground, apart from the others and off the green and the arrival", () => {
  for (const [geo, ground, site] of [[VALLEY, INLAND, INLAND_SITE], [COAST, SHORE, SHORE_SITE]] as const) {
    for (const s of settlements(geo, 0, 10, "stand")) {
      const v = plan(s, ground, site);
      for (const p of v.plots) {
        assert.ok(ground.standable(p.x, p.y), `${s.cell} plot ${p.index}: in the water`);
        assert.ok(Math.hypot(p.x - v.centre.x, p.y - v.centre.y) >= v.greenRadiusM, `${s.cell} plot ${p.index}: on the green`);
        assert.ok(Math.hypot(p.x - v.arrival.x, p.y - v.arrival.y) >= VILLAGE.arrivalClearM, `${s.cell} plot ${p.index}: on the arrival`);
        for (const q of v.plots) {
          if (q.index <= p.index) continue;
          assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= VILLAGE.plotSpacingM - 1e-9, `${s.cell}: plots ${p.index} and ${q.index} overlap`);
        }
        for (const f of v.fields) {
          assert.ok(Math.hypot(p.x - f.x, p.y - f.y) > Math.hypot(f.lengthM, f.widthM) / 2, `${s.cell} plot ${p.index}: in a field`);
        }
      }
      assert.ok(ground.standable(v.arrival.x, v.arrival.y), `${s.cell}: the arrival is not standable`);
      assert.ok(Math.abs(Math.hypot(v.arrivalFacing.x, v.arrivalFacing.y) - 1) < 1e-9);
    }
  }
});

test("a coast gets a dock that starts on land and ends over water; inland gets none", () => {
  for (const s of settlements(COAST, 0, 8, "dock")) {
    const v = plan(s, SHORE, SHORE_SITE);
    assert.ok(v.dock, `${s.cell}: a coast with no dock`);
    assert.ok(SHORE.standable(v.dock.root.x, v.dock.root.y), `${s.cell}: the dock starts in the water`);
    assert.ok(SHORE.heightAt(v.dock.tip.x, v.dock.tip.y) < 0, `${s.cell}: the dock ends on land`);
    // A fishing village stands at its shore: the green is near the water, not at the cell's centre.
    assert.ok(Math.hypot(v.centre.x - 467, v.centre.y) < 160, `${s.cell}: the green is ${Math.hypot(v.centre.x - 467, v.centre.y).toFixed(0)} m from the sea`);
  }
  for (const s of settlements(VALLEY, 0, 5, "nodock")) assert.equal(plan(s, INLAND, INLAND_SITE).dock, null);
});

// ── who lives where ─────────────────────────────────────────────────────────────

test("every household has exactly one house, and moves into an emptied one only after the gap", () => {
  const gap = yearsToDays(VILLAGE.reuseGapYears);
  for (const s of settlements(VALLEY, 0, 10, "homes")) {
    const v = plan(s, INLAND, INLAND_SITE);
    const seen = new Map<number, number>();
    for (const p of v.plots) {
      for (let i = 0; i < p.households.length; i++) {
        const h = s.households[p.households[i]];
        assert.ok(!seen.has(h.index), `${s.cell}: household ${h.index} on two plots`);
        seen.set(h.index, p.index);
        if (i > 0) {
          const before = s.households[p.households[i - 1]];
          assert.ok(before.dissolvedDay + gap <= h.foundedDay, `${s.cell} plot ${p.index}: moved in before the last family had gone`);
        }
      }
    }
    assert.equal(seen.size, s.households.length, `${s.cell}: ${s.households.length - seen.size} households have no house`);
  }
});

test("today: every living household has a lit house, and everyone present sleeps under a roof", () => {
  for (const [geo, ground, site] of [[VALLEY, INLAND, INLAND_SITE], [COAST, SHORE, SHORE_SITE]] as const) {
    for (const s of settlements(geo, 0, 10, "today")) {
      const v = plan(s, ground, site);
      const living = s.households.filter((h) => h.foundedDay <= 0 && h.dissolvedDay > 0).length;
      assert.equal(v.plots.filter((p) => plotState(s, p, 0) === "lived").length, living, `${s.cell}: lit houses`);
      for (const p of v.plots) assert.equal(plotState(s, p, 0) === "lived", householdOn(s, p, 0) !== null);
      const presentN = s.people.filter((p) => present(s, p, 0)).length;
      assert.equal(residentsOn(s, v, 0).length, presentN, `${s.cell}: somebody present has no home`);
    }
  }
});

test("on a past day, someone who married later still sleeps in the house they were born in", () => {
  // Today cannot see this: at the horizon a person's `household` and the one they live in agree,
  // because nobody alive at the horizon pairs after it. Only a past day separates "the household you
  // ended in" from "the one you were in then", which is what a schedule replaying an evening asks.
  const back = -Math.round(yearsToDays(25));
  let checked = 0;
  for (const s of settlements(VALLEY, 0, 8, "pastday")) {
    const v = plan(s, INLAND, INLAND_SITE);
    const homes = new Map(residentsOn(s, v, back).map((r) => [r.person.index, r.plot.index]));
    assert.equal(homes.size, s.people.filter((p) => present(s, p, back)).length, `${s.cell}: somebody present ${back} had no home`);
    for (const p of s.people) {
      if (p.bornInto < 0 || p.partnerDay === null || p.partnerDay <= back || !present(s, p, back)) continue;
      const childhood = v.plots.find((pl) => pl.households.includes(p.bornInto));
      assert.equal(homes.get(p.index), childhood?.index, `${p.id}: living in their future house before their wedding`);
      checked++;
    }
  }
  assert.ok(checked > 20, `only ${checked} people checked`);
});

test("the graves: one for every death in the village, in the yard, and a grave never moves", () => {
  for (const s of settlements(VALLEY, 0, 8, "graves")) {
    const v = plan(s, INLAND, INLAND_SITE);
    const yard = v.graveyard;
    assert.ok(yard, `${s.cell}: no graveyard`);
    const died = s.people.filter((p) => p.deathDay <= 0 && present(s, p, p.deathDay - 1)).length;
    const graves = gravesOn(s, v, 0);
    assert.equal(graves.length, Math.min(died, yard.slots));
    for (const g of graves) assert.ok(Math.hypot(g.x - yard.x, g.y - yard.y) <= yard.radiusM, `${g.person}: outside the yard`);
    // Read at an earlier day, the graves dug by then are in the same places, unless dug again since.
    const earlier = gravesOn(s, v, -Math.round(yearsToDays(30)));
    const now = new Map(graves.map((g) => [g.person, g]));
    for (const g of earlier) {
      const later = now.get(g.person);
      if (later) assert.deepEqual([later.x, later.y], [g.x, g.y], `${g.person}: the grave moved`);
    }
  }
});

test("Design Law 1: a village has no score, no level, no points and no wealth", () => {
  const banned = /score|level|xp|points?$|rank|wealth|gold|coin|reputation/i;
  const v = plan(settlements(VALLEY, 0, 1, "law")[0], INLAND, INLAND_SITE);
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, x]) => [k, ...(x && typeof x === "object" && !Array.isArray(x) ? keys(x) : [])]);
  for (const k of [...keys(v), ...keys(v.plots[0])]) assert.equal(banned.test(k), false, k);
});

// ── the real planet ─────────────────────────────────────────────────────────────

test("real planet: Konreef is a fishing village on its own shore, built the same from the browser's calibration", () => {
  const seed = "echo-capacity-1";
  const field = createTerrain(seed);
  const full = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
  // What PlanetWorld actually holds: the two numbers the page hands it, and a placeholder.
  const browser = { seaLevel: full.seaLevel, peakElevation: full.peakElevation, landFraction: 0.6 };
  const commons = chooseCommons(PLANET_PARAMS.commonsResolution ?? 4, landFractionSampler(field, full.seaLevel, 2), PLANET_PARAMS.minLandFraction).cells;
  const cell = "84b38ebffffffff";

  const server = geographySampler(field, full, PLANET_PARAMS.radiusKm, { commons })(cell);
  const client = geographySampler(field, browser as never, PLANET_PARAMS.radiusKm, { commons })(cell);
  assert.deepEqual(client, server, "the browser's calibration reads a different geography than the census");

  const day = 4906;
  const v = villageAt(seed, cell, field, browser as never, PLANET_PARAMS.radiusKm, { commons, day });
  assert.ok(v, "no village on Konreef");
  assert.equal(v.settlement.name, "Konreef");
  assert.ok(v.plan.dock, "a coastal village of fishers with no dock");
  const presentN = v.settlement.people.filter((p) => present(v.settlement, p, day)).length;
  assert.equal(residentsOn(v.settlement, v.plan, day).length, presentN);
  assert.equal(v.spawn.cell, cell);
  assert.ok(v.ground.standable(v.spawn.x, v.spawn.y), "the arrival point is not standable");
});
