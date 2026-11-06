/**
 * Who knew you best (DECISIONS C80), the pure part: the codes are the research's, a staging belongs to the
 * visit it was set out in, the echo moves from the crowd by κ = nρ / (nρ + 1 − ρ) (the paper's two-layer
 * echo, research/deeds/deeds/theory.py), and one friend's guess is never shown.
 *
 * Run:  node --import tsx --test apps/web/tests/pilotReveal.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Staging } from "@echo/planet";

import { MIN_FRIENDS, PARADIGMS, RHO, choices, codeAction, codeStated, echoGuess, knowing, reveal, visitOf } from "../src/lib/pilotReveal";
import type { PilotRating, PilotStated } from "../src/lib/pilot";

const T = Date.parse("2026-11-06T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const sessions = [
  { n: 1, startedAt: iso(T), endedAt: iso(T + 25 * MIN) },
  { n: 2, startedAt: iso(T + 24 * 60 * MIN), endedAt: iso(T + 24 * 60 * MIN + 25 * MIN) },
];
const STATED: PilotStated = { give: 2, lend: true, bet: "bet-even", seed: "plant", path: "unmarked", greet: false };

let id = 0;
const staging = (situation: string, at: number, resolved: string | null): Staging =>
  ({ id: `s${++id}`, subject: "me", cell: "c", situation, x: 0, y: 0, facing: 0, owner: null, ownerName: null, infoGain: null, createdAt: iso(at), resolved, resolvedAt: resolved ? iso(at + MIN) : null }) as Staging;
const rating = (rater: string, predicted: PilotStated | null): PilotRating => ({ rater, ratee: "me", know: 2, axes: null, predicted, at: iso(T) });

test("C80: the six are coded as the research codes them", () => {
  // research/pilot/echo_pilot/paradigms.py ACTION_CODE and code_stated, read from the file itself.
  const py = readFileSync(new URL("../../../research/pilot/echo_pilot/paradigms.py", import.meta.url), "utf8");
  assert.match(py, /"give": \{"give-one": 1 \/ 3, "give-two": 2 \/ 3, "give-all": 1\.0, "passed": 0\.0\}/);
  assert.match(py, /"bet": \{"bet-safe": 0\.0, "bet-even": 0\.5, "bet-long": 1\.0, "passed": 0\.0\}/);
  assert.equal(codeAction("give", "give-two"), 2 / 3);
  assert.equal(codeAction("give", "passed"), 0);
  assert.equal(codeAction("seed", "passed"), null, "walking past the seed says nothing about patience");
  assert.equal(codeAction("lend", null), null);
  assert.deepEqual(codeStated(STATED), { give: 2 / 3, lend: 1, bet: 0.5, seed: 1, path: 1, greet: 0 });
  assert.deepEqual(codeStated(null), { give: null, lend: null, bet: null, seed: null, path: null, greet: null });
});

test("C80: a staging is in the visit it was set out in, a minute early to ten minutes late", () => {
  assert.equal(visitOf(iso(T - 30_000), sessions), 1);
  assert.equal(visitOf(iso(T + 34 * MIN), sessions), 1);
  assert.equal(visitOf(iso(T + 36 * MIN), sessions), null);
  assert.equal(visitOf(iso(T + 24 * 60 * MIN + 5 * MIN), sessions), 2);
  const c = choices([staging("hungry_stranger", T + 2 * MIN, "give-one"), staging("hungry_stranger", T + 9 * MIN, "give-all"), staging("seed_offer", T + 24 * 60 * MIN + 3 * MIN, "plant")], sessions);
  assert.equal(c.give.get(1), 1 / 3, "the first answered of a kind in a visit counts");
  assert.equal(c.seed.get(2), 1);
});

test("C80: the echo moves from the crowd by nρ / (nρ + 1 − ρ): ρ after one look, all the way after many", () => {
  assert.equal(echoGuess([], 0.4), 0.4);
  assert.ok(Math.abs(echoGuess([1], 0.4) - (0.4 + RHO * 0.6)) < 1e-12);
  assert.ok(Math.abs(knowing(1) - RHO) < 1e-12);
  assert.ok(Math.abs(knowing(3) - (3 * RHO) / (3 * RHO + 1 - RHO)) < 1e-12);
  assert.ok(knowing(100) > 0.99 && knowing(0) === 0);
  // The same as the paper's echo with no persona: π + n(ρ − π)² / (n(ρ − π) + 1 − ρ) = nρ² / (nρ + 1 − ρ), divided by ρ.
  for (const n of [1, 2, 5]) assert.ok(Math.abs(knowing(n) - (n * RHO * RHO) / (n * RHO + 1 - RHO) / RHO) < 1e-12);
});

test("C80: who knew you best, with one friend's guess never shown and ties counted for all", () => {
  const mine = [staging("hungry_stranger", T + 2 * MIN, "give-two"), staging("hungry_stranger", T + 24 * 60 * MIN + 2 * MIN, "give-two"), staging("lone_traveler", T + 24 * 60 * MIN + 4 * MIN, "greet")];
  const friend: PilotStated = { give: 2, lend: false, bet: "bet-safe", seed: "now", path: "marked", greet: true };
  const one = reveal({ subject: "me", stated: STATED, sessions }, mine, [rating("f1", friend)], []);
  const give = one.rows.find((r) => r.paradigm === "give")!;
  assert.equal(give.friends, null, "one friend's guess would be readable");
  assert.equal(give.friendsCount, 1);
  assert.equal(give.did, 2 / 3);
  assert.equal(give.looks, 1);
  assert.ok(Math.abs(give.echo! - (0.5 + RHO * (2 / 3 - 0.5))) < 1e-12, "fewer than three others: the echo starts from one half");
  assert.deepEqual(give.closest, ["said"], "they said two loaves and gave two");

  const two = reveal({ subject: "me", stated: STATED, sessions }, mine, [rating("f1", friend), rating("f2", friend), rating("me", friend)], []);
  const g2 = two.rows.find((r) => r.paradigm === "give")!;
  assert.equal(g2.friendsCount, MIN_FRIENDS, "their own rating of themselves is not a friend's");
  assert.equal(g2.friends, 2 / 3);
  assert.deepEqual(g2.closest, ["said", "friends"], "a tie counts for both");
  const greet = two.rows.find((r) => r.paradigm === "greet")!;
  assert.equal(greet.looks, 0);
  assert.deepEqual(greet.closest, ["friends"], "they said they would walk on, the friends knew better, and the echo had never seen them");
  assert.equal(two.tally.said + two.tally.friends + two.tally.echo >= 2, true);
  assert.equal(two.rows.find((r) => r.paradigm === "seed")!.did, null, "never met: nothing to score");
  assert.equal(two.knows.give.looks, 2);
  assert.deepEqual(PARADIGMS.map((p) => two.rows.find((r) => r.paradigm === p)!.paradigm), [...PARADIGMS]);
});

test("C80: the crowd is the others' first visits, once there are three of them", () => {
  const mine = [staging("seed_offer", T + 2 * MIN, "now"), staging("seed_offer", T + 24 * 60 * MIN + 2 * MIN, "plant")];
  const other = (v: number) => Object.fromEntries(PARADIGMS.map((p) => [p, new Map(p === "seed" ? [[1, v], [2, 1 - v]] : [])])) as never;
  const r = reveal({ subject: "me", stated: STATED, sessions }, mine, [], [other(1), other(1), other(0)]);
  const seed = r.rows.find((x) => x.paradigm === "seed")!;
  const crowd = 2 / 3;
  assert.ok(Math.abs(seed.echo! - (crowd + RHO * (0 - crowd))) < 1e-12);
});
