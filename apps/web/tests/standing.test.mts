/**
 * Where an echo may stand in for its person (DECISIONS C103): the right is earned by sealed calls that came
 * true, one kind of situation at a time, at a bar set by what is at stake, and it moves with the record.
 *
 * Run:  node --import tsx --test apps/web/tests/standing.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { BUCKETS, STAKES, THRESHOLD, lowerBound, needsOf, standingIn, standingOf } from "../src/lib/knowable/standing";

const call = (kind: string, right: boolean, p = 0.8) => ({ kind: kind as never, call: "greet-warm", p, did: right ? "greet-warm" : "on" });
const run = (kind: string, pattern: string, p = 0.8) => [...pattern].map((c) => call(kind, c === "1", p));

test("every kind of situation has stakes, and talking asks for the most", () => {
  assert.deepEqual([...BUCKETS].sort(), ["conformity", "courtesy", "curiosity", "help", "honesty", "order", "talk"]);
  for (const b of BUCKETS) assert.ok(THRESHOLD[STAKES[b]], b);
  assert.ok(THRESHOLD.talk.looks > THRESHOLD.high.looks && THRESHOLD.talk.sure > THRESHOLD.high.sure);
  assert.equal(STAKES.honesty, "high", "a purse is not a greeting");
});

test("nothing is granted without a record: no looks, no right", () => {
  for (const s of standingOf([])) {
    assert.equal(s.level, "watch", s.bucket);
    assert.equal(s.looks, 0);
  }
});

test("the bound is lower than the share, and closes on it as looks grow", () => {
  assert.equal(lowerBound(0, 0), 0);
  assert.ok(lowerBound(6, 6) < 1);
  assert.ok(lowerBound(6, 6) < lowerBound(30, 30));
  assert.ok(Math.abs(lowerBound(800, 1000) - 0.8) < 0.02);
});

test("a low-stakes kind is earned with fewer right calls than a high-stakes one", () => {
  const courtesy = standingIn("courtesy", run("greeting", "111111111"), 0);
  assert.equal(courtesy.level, "act", `courtesy after nine right of nine: ${JSON.stringify(courtesy)}`);
  const honesty = standingIn("honesty", run("lost-purse", "111111111"), 0);
  assert.notEqual(honesty.level, "act", "honesty is not earned with nine");
  assert.ok(honesty.toGo! > 0, "and it says how many more it would take");
});

test("a person who is inconsistent in a kind of situation never gives their echo the right there", () => {
  const s = standingIn("courtesy", run("greeting", "10".repeat(40), 0.5), 0);
  assert.equal(s.looks, 80);
  assert.notEqual(s.level, "act", "half right, however many looks");
});

test("an echo that claims to be surer than it turned out to be is not given the right; one that is only careful is", () => {
  const pattern = "1111011110".repeat(3); // right four times in five, thirty looks
  const sure = standingIn("courtesy", run("greeting", pattern, 0.99), 0);
  assert.equal(sure.overconfident, true);
  assert.notEqual(sure.level, "act", "said 99%, was right 80%");
  const careful = standingIn("courtesy", run("greeting", pattern, 0.6), 0);
  assert.equal(careful.overconfident, false);
  assert.equal(careful.level, "act", "said 60%, was right 80%: careful is allowed");
});

test("the right is lost when recent calls start missing, before the overall share has fallen far", () => {
  const earned = run("greeting", "1".repeat(20));
  assert.equal(standingIn("courtesy", earned).level, "act");
  const slipping = [...earned, ...run("greeting", "0000")];
  const s = standingIn("courtesy", slipping);
  assert.ok(s.right / s.looks > 0.8, "still right in most of its record");
  assert.notEqual(s.level, "act", "but not now");
});

test("each veto asks for more: half as many looks again and 0.05 surer", () => {
  assert.deepEqual(needsOf("help", 0), { looks: 10, sure: 0.7 });
  assert.deepEqual(needsOf("help", 1), { looks: 15, sure: 0.75 });
  const twelve = run("fallen-elder", "1".repeat(12));
  assert.equal(standingIn("help", twelve, 0).level, "act");
  assert.notEqual(standingIn("help", twelve, 1).level, "act", "after a 'that was not me' twelve right is no longer enough");
});

test("talking has no record yet, so it waits; families are counted apart", () => {
  const all = standingOf([...run("greeting", "1".repeat(9)), ...run("fallen-elder", "1")]);
  const by = Object.fromEntries(all.map((s) => [s.bucket, s]));
  assert.equal(by.courtesy!.looks, 9);
  assert.equal(by.help!.looks, 1);
  assert.equal(by.talk!.looks, 0);
  assert.equal(by.talk!.level, "watch");
});

test("one miss is not a claim of more than it had: how sure to be is judged on enough looks", () => {
  const one = standingIn("help", [{ kind: "fallen-elder" as never, call: "help-up", p: 0.6, did: "on" }], 0);
  assert.equal(one.overconfident, false);
  assert.equal(one.level, "watch");
  const many = standingIn("help", run("fallen-elder", "0000000", 0.9), 0);
  assert.equal(many.overconfident, true, "seven confident misses are");
});
