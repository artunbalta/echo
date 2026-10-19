/**
 * The director's catalogue and its rules (DECISIONS C63): what may be set out, when, and where.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DIRECTOR, SITUATIONS, SITUATION_IDS, available, inVillage, mayStage, passStep, stagingSpot, standing, type Ground, type Staging } from "../lib/director.js";
import { verbsOf } from "../lib/affordances.js";
import type { VillagePlan } from "../lib/village.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const ingest = readFileSync(`${root}services/ml/echo_ml/ingest.py`, "utf8");
const T0 = Date.UTC(2026, 9, 19, 10, 0, 0);

const staging = (over: Partial<Staging> = {}): Staging => ({
  id: "stg_1",
  subject: "s",
  cell: "843f6a1ffffffff",
  situation: "netted_gull",
  x: 0,
  y: 0,
  facing: 0,
  owner: null,
  ownerName: null,
  infoGain: 0.1,
  createdAt: new Date(T0).toISOString(),
  resolved: null,
  resolvedAt: null,
  ...over,
});

test("C63: every situation is a thing with verbs, read under labels the engine already has, and walking past only where it means something", () => {
  for (const id of SITUATION_IDS) {
    const s = SITUATIONS[id];
    assert.equal(s.id, id);
    assert.equal(s.axes.length, 8);
    assert.ok(Math.hypot(...s.axes) > 0.5, `${id}: an axis vector that asks nothing`);
    assert.ok(verbsOf(s.kind).length > 0, `${id}: nothing to do with it`);
    for (const v of verbsOf(s.kind)) assert.equal(v.measure.route, "named", `${id}/${v.id}: a probe the engine does not read by name`);
    if (s.passed) assert.ok(new RegExp(`"${s.passed.action}"`).test(ingest), `${id}: walking past is sent as "${s.passed.action}", which ingest.py does not know`);
  }
  // The island director's own vectors for the same probes.
  assert.deepEqual(SITUATIONS.netted_gull.axes, [1, 0, 0, 0, 0, 0, 0, 0.3]);
  assert.deepEqual(SITUATIONS.lost_pouch.axes, [0.5, 0, 0, 0, 0.8, 0, 0, 0]);
  // The private ones are set out of sight; how much of the pouch was taken is graded.
  assert.ok(SITUATIONS.netted_gull.unseen && SITUATIONS.lost_pouch.unseen);
  assert.deepEqual(verbsOf("lost-pouch").map((v) => v.raw?.taken01 ?? null), [null, 0.25, 1]);
});

test("C63: one at a time, twenty minutes apart, and no more a day than the engine still wants", () => {
  assert.equal(mayStage([], 3, T0), null);
  assert.equal(mayStage([staging()], 3, T0 + 60_000), "standing");
  const answered = staging({ resolved: "free", resolvedAt: new Date(T0 + 60_000).toISOString() });
  assert.equal(mayStage([answered], 3, T0 + 5 * 60_000), "too_soon");
  assert.equal(mayStage([answered], 3, T0 + DIRECTOR.gapMs + 1), null);
  assert.equal(mayStage([answered], 1, T0 + DIRECTOR.gapMs + 1), "enough_today");
  assert.equal(mayStage([answered], 0, T0 + DIRECTOR.gapMs + 1), "enough_today", "an engine that is sure of you still pestered");
  // Gone unanswered after its life, it no longer stands, and counts towards today.
  assert.equal(standing(staging(), T0 + DIRECTOR.lifeMs - 1), true);
  assert.equal(standing(staging(), T0 + DIRECTOR.lifeMs), false);
  assert.equal(mayStage([staging()], 1, T0 + DIRECTOR.lifeMs), "enough_today");
  // Yesterday's do not count today.
  assert.equal(mayStage([staging({ createdAt: new Date(T0 - 86_400_000).toISOString(), resolved: "passed" })], 1, T0), null);
});

const flat = (over: Partial<Ground> = {}): Ground => ({
  standable: (x) => x < 40,
  sea: (x) => x >= 40,
  seen: () => false,
  plan: null,
  ...over,
});

test("C63: set out near you, on ground it needs, out of sight where it must be — the same place for the same seed, or nowhere", () => {
  const at = { x: 0, y: 0 };
  const gull = stagingSpot(SITUATIONS.netted_gull, at, "seed-a", flat())!;
  assert.ok(gull, "nowhere for a gull on a shore");
  const r = Math.hypot(gull.x, gull.y);
  assert.ok(r >= DIRECTOR.nearM[0] && r <= DIRECTOR.nearM[1], `${r} m away`);
  assert.ok(gull.x < 40 && gull.x + Math.cos(gull.facing) * DIRECTOR.waterM >= 40, "a gull not at the water, or facing away from it");
  assert.deepEqual(stagingSpot(SITUATIONS.netted_gull, at, "seed-a", flat()), gull);
  assert.notDeepEqual(stagingSpot(SITUATIONS.netted_gull, at, "seed-b", flat()), gull);
  // Inland, no gull; out of sight, or nowhere at all if everywhere is seen.
  assert.equal(available(SITUATIONS.netted_gull, at, flat({ sea: () => false })), false);
  assert.equal(available(SITUATIONS.lost_pouch, at, flat({ sea: () => false })), true);
  assert.equal(stagingSpot(SITUATIONS.lost_pouch, at, "s", flat({ seen: () => true })), null);
  assert.ok(stagingSpot(SITUATIONS.carved_mark, at, "s", flat({ seen: () => true })), "a mark that need not be private refused for being in sight");
  const hidden = stagingSpot(SITUATIONS.lost_pouch, at, "s", flat({ seen: (x, y) => y > 0 }))!;
  assert.ok(hidden.y <= 0);
  // Never inside the village's own things.
  const plan = { centre: { x: 0, y: 0 }, greenRadiusM: 60, plots: [], fields: [], mine: null, graveyard: null, dock: null, paths: [] } as unknown as VillagePlan;
  assert.equal(inVillage(plan, 10, 10), true);
  assert.equal(stagingSpot(SITUATIONS.lost_pouch, at, "s", flat({ plan })), null);
});

test("C63: walking past is coming within plain view and then going on", () => {
  let near = false;
  let passed = false;
  for (const d of [40, 30, 20, 12, 8.5, 15, 30, 36]) ({ near, passed } = passStep(near, d));
  assert.equal(passed, true);
  ({ near, passed } = passStep(false, 50));
  assert.deepEqual([near, passed], [false, false], "never close: not walking past, just not there");
  assert.deepEqual(passStep(true, 20), { near: true, passed: false });
});
