/**
 * The pilot village's six (web DECISIONS C75): what they are, how they are read, the order each person
 * meets them in, and the world's own stakes (the tide, a lent raft).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PILOT_SITUATIONS, SITUATIONS, SITUATION_IDS, WORLD_SITUATIONS, stagingSpot, type Ground } from "../lib/director.js";
import { verbsOf } from "../lib/affordances.js";
import { PILOT, TIDE, loanComesBack, pilotOrder, strangerName, tideCatch } from "../lib/pilot.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const ingest = readFileSync(`${root}services/ml/echo_ml/ingest.py`, "utf8");

test("C75: the world's four and the pilot's six are the whole catalogue, and the engine's pick never sees the six", () => {
  assert.deepEqual([...WORLD_SITUATIONS, ...PILOT_SITUATIONS].sort(), [...SITUATION_IDS].sort());
  for (const id of PILOT_SITUATIONS) assert.ok(!WORLD_SITUATIONS.includes(id), id);
});

test("C75: each of the six is something to do, and every way out of it is read by a route that exists, or says it has none", () => {
  for (const id of PILOT_SITUATIONS) {
    const s = SITUATIONS[id];
    assert.equal(s.axes.length, 8);
    const verbs = verbsOf(s.kind);
    assert.ok(verbs.length > 0, `${id}: nothing to do`);
    for (const v of verbs) {
      if (v.measure.route === "named") assert.ok(new RegExp(`"${v.measure.action}"`).test(ingest), `${id}/${v.id}: ingest.py has no "${v.measure.action}"`);
      if (v.measure.route === "unrouted") assert.ok(!new RegExp(`"${v.measure.action}"`).test(ingest), `${id}/${v.id}: called unrouted, read by name`);
    }
    if (s.passed?.route === "named") assert.ok(new RegExp(`"${s.passed.action}"`).test(ingest), `${id}: walking past is "${s.passed.action}", unknown to ingest.py`);
    if (s.passed?.route === "unrouted") {
      assert.ok(!new RegExp(`"${s.passed.action}"`).test(ingest), `${id}: walking past called unrouted, read by name`);
      // A refusal with no feature of its own is read as withdrawal (ingest's catch-all), so an unrouted
      // pass is sent as its own act, taken.
      assert.equal(s.passed.polarity, "take");
    }
  }
  // Only trust has no route yet, and it is the only one that says so.
  const unrouted = PILOT_SITUATIONS.filter((id) => verbsOf(SITUATIONS[id].kind).some((v) => v.measure.route === "unrouted"));
  assert.deepEqual(unrouted, ["raft_borrower"]);
});

test("C75: the dictator game gives a third, two thirds or all of three loaves, out of the pack", () => {
  const verbs = verbsOf("hungry-stranger");
  assert.deepEqual(verbs.map((v) => v.spends), [{ item: "bread", count: 1 }, { item: "bread", count: 2 }, { item: "bread", count: 3 }]);
  assert.deepEqual(verbs.map((v) => v.raw?.amount), [0.333, 0.667, 1]);
  assert.equal(PILOT.grant.bread, 3);
  assert.deepEqual(SITUATIONS.hungry_stranger.passed, { action: "give_gift", cue: "F7", channel: "F", polarity: "refuse", route: "generic" });
});

test("C75: the tide holds the mean at two fish and spreads it, so the bet reads risk alone", () => {
  const mean = (o: readonly [number, number]) => (o[0] + o[1]) / 2;
  const spread = (o: readonly [number, number]) => Math.abs(o[0] - o[1]);
  for (const o of Object.values(TIDE)) assert.equal(mean(o), 2);
  assert.ok(spread(TIDE["bet-safe"]!) < spread(TIDE["bet-even"]!) && spread(TIDE["bet-even"]!) < spread(TIDE["bet-long"]!));
  const variance = verbsOf("tide-fisher").map((v) => v.raw?.variance);
  assert.deepEqual(variance, [0, 0.25, 1], "the sent variance is the outcomes' own, scaled to the long bet");
  for (const v of verbsOf("tide-fisher")) assert.ok(TIDE[v.id], `${v.id} has no outcomes`);
  // The coin is the staging's: the same answer twice, and about half the stagings come up high.
  assert.equal(tideCatch("stg_a", "bet-long"), tideCatch("stg_a", "bet-long"));
  assert.equal(tideCatch("stg_a", "nonsense"), null);
  let high = 0;
  for (let i = 0; i < 2000; i++) if (tideCatch(`stg_${i}`, "bet-long") === 4) high++;
  assert.ok(high > 900 && high < 1100, `${high} of 2000`);
});

test("C75: a lent raft comes back three times in four, and the same staging always says the same", () => {
  let back = 0;
  for (let i = 0; i < 4000; i++) if (loanComesBack(`stg_${i}`)) back++;
  assert.ok(back > 2850 && back < 3150, `${back} of 4000`);
  assert.equal(loanComesBack("stg_x"), loanComesBack("stg_x"));
  assert.equal(strangerName("stg_x"), strangerName("stg_x"));
});

test("C75: each person meets the six in their own order, the same on every reload, and across a group each comes first about as often", () => {
  const a = pilotOrder("subject-a", 1);
  assert.deepEqual([...a].sort(), [...PILOT_SITUATIONS].sort());
  assert.deepEqual(pilotOrder("subject-a", 1), a);
  const firsts = new Map<string, number>();
  let sameAcrossVisits = 0;
  for (let i = 0; i < 1200; i++) {
    const o = pilotOrder(`s${i}`, 1);
    firsts.set(o[0]!, (firsts.get(o[0]!) ?? 0) + 1);
    if (o.join() === pilotOrder(`s${i}`, 2).join()) sameAcrossVisits++;
  }
  for (const id of PILOT_SITUATIONS) {
    const n = firsts.get(id) ?? 0;
    assert.ok(n > 140 && n < 260, `${id} first ${n} of 1200`);
  }
  assert.ok(sameAcrossVisits < 30, "the second visit should not repeat the first's order");
});

test("C75: set out nearer than the world's, so a visit meets all six", () => {
  const flat: Ground = { standable: () => true, sea: (x) => x >= 30, seen: () => false, plan: null };
  const at = { x: 0, y: 0 };
  for (const id of PILOT_SITUATIONS) {
    const s = SITUATIONS[id];
    const ring = s.where === "shore" ? PILOT.shoreRing : PILOT.landRing;
    const spot = stagingSpot(s, at, `seed-${id}`, flat, ring);
    assert.ok(spot, `${id}: nowhere`);
    const r = Math.hypot(spot!.x, spot!.y);
    assert.ok(r >= ring[0] - 1e-9 && r <= ring[1] + 1e-9, `${id}: ${r} m`);
  }
});
