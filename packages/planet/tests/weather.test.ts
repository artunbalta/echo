/**
 * The weather and the year (`lib/weather.ts`, DECISIONS C48), on real cells of the planet.
 *
 * Run:  node --import tsx --test packages/planet/tests/weather.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToParent, gridDisk, latLngToCell } from "h3-js";

import { causeOfDeath, present } from "../lib/life.js";
import { dayPlans, whereabouts } from "../lib/schedule.js";
import { occupationOn, settlementAt, type SettlementGeography } from "../lib/society.js";
import { villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";
import { WEATHER, seasonOf, weatherAt, weatherOn, type WeatherKind } from "../lib/weather.js";

const SEED = "echo-capacity-1";
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const DESERT: SettlementGeography = { habitability: 0.4, arable: 0.05, coastal: 0, wooded: 0, mountain: 0.1, tradeAccess: 0.3 };
const NORTH = latLngToCell(62, 10, 4);
const TROPIC = latLngToCell(5, 20, 4);
const SOUTH = latLngToCell(-62, 10, 4);

const tally = (cell: string, geo: SettlementGeography, days: number[]) => {
  const out: Record<WeatherKind, number> = { clear: 0, cloudy: 0, rain: 0, storm: 0, fog: 0, snow: 0 };
  for (const d of days) out[weatherOn(SEED, cell, geo, d).kind]++;
  return out;
};
const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);

test("C48: the same cell on the same day is the same weather, and a whole region shares its sky", () => {
  assert.deepEqual(weatherOn(SEED, NORTH, COAST, 100), weatherOn(SEED, NORTH, COAST, 100));
  const region = cellToParent(NORTH, WEATHER.regionResolution);
  const neighbours = gridDisk(NORTH, 2).filter((c) => cellToParent(c, WEATHER.regionResolution) === region);
  assert.ok(neighbours.length > 5);
  for (const d of range(0, 60)) {
    const kinds = new Set(neighbours.map((c) => weatherOn(SEED, c, COAST, d).kind));
    assert.equal(kinds.size, 1, `day ${d}: one region, ${[...kinds].join(" and ")}`);
  }
});

test("C48: the north has snow in winter and none in summer; the tropics have none at all; the south's winter is the north's summer", () => {
  const winterDays = range(0, 365).filter((d) => seasonOf(d, 62).season === "winter");
  const summerDays = range(0, 365).filter((d) => seasonOf(d, 62).season === "summer");
  assert.ok(tally(NORTH, COAST, winterDays).snow > 5, "a northern winter without snow");
  assert.equal(tally(NORTH, COAST, summerDays).snow, 0, "snow in a northern summer");
  assert.equal(tally(TROPIC, COAST, range(0, 730)).snow, 0, "snow in the tropics");
  assert.equal(seasonOf(100, 62).season, "summer");
  assert.equal(seasonOf(100, -62).season, "winter");
  assert.ok(tally(SOUTH, COAST, summerDays).snow > 5, "the south is not in winter while the north is in summer");
});

test("C48: dry ground is dry and the coast is wet and stormy", () => {
  const days = range(0, 730);
  const coast = tally(TROPIC, COAST, days);
  const desert = tally(TROPIC, DESERT, days);
  assert.ok(coast.rain + coast.storm > (desert.rain + desert.storm) * 1.4, `coast wet ${coast.rain + coast.storm}, desert ${desert.rain + desert.storm}`);
  assert.ok(coast.storm > desert.storm, "inland as stormy as the coast");
  assert.ok(coast.fog > desert.fog, "fog inland and not on the coast");
});

test("C48: a wet day rains for part of it, and fog lifts by mid-morning", () => {
  const wetDay = range(0, 400).find((d) => weatherOn(SEED, TROPIC, COAST, d).kind === "rain")!;
  const falls = range(0, 24).map((h) => weatherAt(SEED, TROPIC, COAST, wetDay, h / 24).fall);
  assert.ok(falls.some((f) => f > 0) && falls.some((f) => f === 0), "rain all day or not at all on a wet day");
  const fogDay = range(0, 800).find((d) => weatherOn(SEED, TROPIC, COAST, d).kind === "fog")!;
  assert.ok(weatherAt(SEED, TROPIC, COAST, fogDay, 0.25).fog > 0.3);
  assert.equal(weatherAt(SEED, TROPIC, COAST, fogDay, 0.6).fog, 0, "fog at noon");
});

const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };

test("C48: the day a fisher was lost at sea was a storm on his village — the sky and the chronicle tell one story", () => {
  let checked = 0;
  for (const c of gridDisk(latLngToCell(30, -40, 4), 6)) {
    const s = settlementAt(SEED, c, COAST, 0);
    if (!s) continue;
    for (const p of s.people.filter((q) => q.deathDay <= 0 && causeOfDeath(q) === "sea")) {
      assert.equal(weatherOn(SEED, c, COAST, p.deathDay, s).kind, "storm", `${p.given} drowned on day ${p.deathDay} under a ${weatherOn(SEED, c, COAST, p.deathDay, s).kind} sky`);
      checked++;
    }
    if (checked > 20) break;
  }
  assert.ok(checked > 5, `only ${checked} drownings found`);
});

test("C48: in a storm no boat goes out, and the fishers are on the dock instead", () => {
  let checked = 0;
  for (const c of gridDisk(latLngToCell(30, -40, 4), 6)) {
    const s = settlementAt(SEED, c, COAST, 0);
    const plan = s && villagePlan(s, SHORE, SHORE_SITE);
    if (!s || !plan?.dock) continue;
    const stormDay = range(0, 400).find((d) => weatherOn(SEED, c, COAST, d, s).kind === "storm");
    if (stormDay === undefined) continue;
    const { plans, boats, moorings } = dayPlans(s, plan, stormDay);
    assert.ok(boats.every((b) => b === null), "a boat went out in a storm");
    for (const d of plans) {
      const p = s.people.find((q) => q.id === d.person)!;
      if (occupationOn(p, stormDay) !== "fisher" || !present(s, p, stormDay)) continue;
      assert.equal(whereabouts(d, 0.4, boats, moorings).boat, null, `${p.given} is at sea in a storm`);
    }
    if (++checked >= 3) break;
  }
  assert.ok(checked >= 2, `only ${checked} coastal villages with a storm day`);
});

test("C48: rain sends the village in early", () => {
  const s = (() => {
    for (const c of gridDisk(latLngToCell(30, -40, 4), 6)) {
      const v = settlementAt(SEED, c, COAST, 0);
      if (v && v.people.filter((p) => present(v, p, 0)).length > 25) return v;
    }
    throw new Error("no village");
  })();
  const plan = villagePlan(s, SHORE, SHORE_SITE)!;
  const lastOut = (day: number) => {
    const { plans } = dayPlans(s, plan, day);
    const ends = plans.map((d) => Math.max(...d.stays.map((st) => st.t1), ...d.legs.map((l) => l.t1)));
    return ends.reduce((a, b) => a + b, 0) / ends.length;
  };
  const wet = range(0, 200).filter((d) => ["rain", "storm", "snow"].includes(weatherOn(SEED, s.cell, s.geography, d, s).kind)).slice(0, 6);
  const dry = range(0, 200).filter((d) => weatherOn(SEED, s.cell, s.geography, d, s).kind === "clear").slice(0, 6);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(wet.map(lastOut)) < mean(dry.map(lastOut)) - 0.01, "a wet evening is as long as a dry one");
});
