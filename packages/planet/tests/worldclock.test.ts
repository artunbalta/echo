/**
 * The world clock (DECISIONS C24).
 *
 * Three constants in this package are now irreversible in the way `TILE_M` is irreversible: once one
 * birth day is stamped, moving them rewrites every lifespan on the planet. So the arithmetic C24
 * quotes is pinned here rather than left in prose, and the day somebody "tidies" 12 * 60 this file
 * says what it costs.
 *
 * Run:  node --import tsx --test packages/planet/tests/worldclock.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DAYS_PER_YEAR,
  WORLD_DAY_S,
  WORLD_YEAR_S,
  daysToRealSeconds,
  msAtWorldDay,
  timeOfDay,
  worldClock,
  worldDay,
  worldDayIndex,
  worldYear,
  yearsToDays,
} from "../lib/worldclock.js";

const EPOCH = "2026-09-07T00:00:00.000Z";
const clock = worldClock(EPOCH);

test("C24's three numbers are exactly the numbers C24 quotes", () => {
  assert.equal(WORLD_DAY_S, 720, "a world-day is twelve real minutes");
  assert.equal(DAYS_PER_YEAR, 365);
  assert.equal(WORLD_YEAR_S, 262_800);
  assert.equal(WORLD_YEAR_S / 3600, 73, "a world-year is 73 real hours EXACTLY");

  // "a 70-year life = 18,396,000 s real = 5,110 hours = 212 days 22 h"
  const life = daysToRealSeconds(yearsToDays(70));
  assert.equal(life, 18_396_000);
  assert.equal(life / 3600, 5_110);
  assert.equal(Math.floor(life / 86_400), 212);
});

test("the hour is derived from one epoch, so two mounts cannot disagree", () => {
  // The same instant, asked twice, an hour of wall-clock apart in when it was asked. Nothing
  // accumulates, so there is nothing to drift.
  const instant = Date.parse(EPOCH) + 12_345_678;
  assert.equal(timeOfDay(clock, instant), timeOfDay(clock, instant));

  // skyLayer's convention: 0 midnight, 0.25 sunrise, 0.5 midday, 0.75 sunset.
  assert.equal(timeOfDay(clock, Date.parse(EPOCH)), 0);
  assert.equal(timeOfDay(clock, Date.parse(EPOCH) + 180 * 1000), 0.25);
  assert.equal(timeOfDay(clock, Date.parse(EPOCH) + 360 * 1000), 0.5);
  assert.equal(timeOfDay(clock, Date.parse(EPOCH) + 540 * 1000), 0.75);
  // And it wraps rather than growing.
  assert.equal(timeOfDay(clock, Date.parse(EPOCH) + 720 * 1000), 0);
});

test("the clock runs backwards through the epoch without a discontinuity", () => {
  // Most of a lineage happened before the world was created, so every one of these is a real query.
  assert.equal(worldDayIndex(clock, Date.parse(EPOCH) - 1), -1);
  assert.equal(worldDayIndex(clock, Date.parse(EPOCH)), 0);
  assert.equal(worldDay(clock, Date.parse(EPOCH) - 720_000), -1);
  const before = timeOfDay(clock, Date.parse(EPOCH) - 180 * 1000);
  assert.ok(before >= 0 && before < 1, `timeOfDay left [0,1) before the epoch: ${before}`);
  assert.equal(before, 0.75);
});

test("msAtWorldDay is the exact inverse of worldDay", () => {
  for (const day of [-109_500, -365, -1, 0, 1, 365, 40_000]) {
    assert.equal(worldDay(clock, msAtWorldDay(clock, day)), day);
  }
  assert.equal(worldYear(clock, msAtWorldDay(clock, yearsToDays(70))), 70);
});

test("a bad epoch throws rather than silently becoming NaN days", () => {
  assert.throws(() => worldClock("not a date"), /createdAt is not a date/);
});
