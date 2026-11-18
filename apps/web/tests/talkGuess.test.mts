/**
 * How an echo earns the right to talk (DECISIONS C108), the pure parts: a sealed guess cannot be read or
 * changed by the page that carries it, the guesser is shown the person's own lines and never anyone else's
 * words, and talking is held to its 30 looks and 0.85 like any other kind, honesty about how sure included.
 *
 * Run:  node --import tsx --test apps/web/tests/talkGuess.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { guessPrompt, mockSame, openGuess, readTurns, sealGuess, sealOf } = await import("../src/lib/knowable/talkGuess");
const { standingOf, vetoesByBucket } = await import("../src/lib/knowable/standing");

const G = { v: 1 as const, sub: "subject-a", cell: "84dcee5ffffffff", room: "ABCDE", person: "0123456789abcdef", heard: "Where are you headed?", guess: "Just looking around.", sure: 0.4, at: 1_763_400_000_000, source: "model" as const };

test("a sealed guess opens only here, unchanged, under a current key; the page carrying it reads nothing of it", () => {
  const box = sealGuess(G, "secret-now");
  assert.ok(!box.includes("looking"), "the guess is not in the box as text");
  assert.ok(!Buffer.from(box, "base64url").toString("utf8").includes("looking"), "nor once decoded");
  assert.deepEqual(openGuess(box, ["secret-now"]), G);
  assert.deepEqual(openGuess(box, ["secret-new", "secret-now"]), G, "a key being rotated out still opens what it sealed");
  assert.equal(openGuess(box, ["another-secret"]), null);
  const raw = Buffer.from(box, "base64url");
  raw[raw.length - 3] ^= 1;
  assert.equal(openGuess(raw.toString("base64url"), ["secret-now"]), null, "one bit changed, and it is not ours");
  assert.equal(openGuess("not a box", ["secret-now"]), null);
  assert.equal(openGuess(42, ["secret-now"]), null);
  assert.notEqual(sealGuess(G, "secret-now"), box, "two boxes of one guess do not look alike");
});

test("a guess is kept under the hash of what was sealed: once, and a changed guess is another seal", () => {
  assert.equal(sealOf(G), sealOf({ ...G }));
  assert.match(sealOf(G), /^[0-9a-f]{64}$/);
  assert.notEqual(sealOf(G), sealOf({ ...G, guess: "Home." }));
  assert.notEqual(sealOf(G), sealOf({ ...G, at: G.at + 1 }));
});

test("a guess answers a conversation that is theirs first, in turn, and ends on the villager's line", () => {
  const ok = [
    { role: "stranger", text: "hi" },
    { role: "villager", text: "Good day." },
  ];
  assert.deepEqual(readTurns(ok), ok);
  assert.equal(readTurns([ok[0]]), null, "nothing to answer");
  assert.equal(readTurns([ok[1], ok[0]]), null, "the villager does not go first");
  assert.equal(readTurns([...ok, { role: "stranger", text: "and you?" }]), null, "it ends on the villager's line");
  assert.equal(readTurns([{ role: "stranger", text: "x".repeat(801) }, ok[1]]), null);
  assert.equal(readTurns(Array.from({ length: 18 }, (_, i) => ({ role: i % 2 ? "villager" : "stranger", text: "a" }))), null);
  assert.equal(readTurns("hi"), null);
});

test("the guesser is shown their own lines, oldest first, with a villager's words beside theirs and never a person's", () => {
  const lines = [
    { at: "2026-11-18T10:03:00Z", cell: G.cell, room: "ABCDE", to: "aloud" as const, heard: null, said: "anyone fishing?" },
    { at: "2026-11-18T10:02:00Z", cell: G.cell, room: "ABCDE", to: "person" as const, heard: null, said: "ha, no" },
    { at: "2026-11-18T10:01:00Z", cell: G.cell, room: null, to: "villager" as const, heard: "Fine weather.", said: "it is!" },
  ];
  const turns = [
    { role: "stranger" as const, text: "hello" },
    { role: "villager" as const, text: "Where are you headed?" },
  ];
  const p = guessPrompt(lines, turns, "Brannoc");
  assert.ok(p.indexOf("it is!") < p.indexOf("ha, no") && p.indexOf("ha, no") < p.indexOf("anyone fishing?"), "oldest first");
  assert.ok(p.includes('To a villager who had said "Fine weather.": "it is!"'));
  assert.ok(p.includes('To someone in the village: "ha, no"'), "a line to a person, with nothing of theirs beside it");
  assert.ok(p.includes("Brannoc: Where are you headed?"));
  assert.ok(p.trim().endsWith("What do they type next?"));
  assert.ok(guessPrompt([], turns, "Brannoc").includes("typed nothing before"));
});

test("talking is earned like any kind of situation: 30 looks, a lower bound of 0.85, and no claim to be surer than it is", () => {
  const right = (n: number, p = 0.8) => Array.from({ length: n }, () => ({ p, hit: true }));
  const talk = (t: { p: number; hit: boolean }[], vetoes = {}) => standingOf([], vetoes, t).find((s) => s.bucket === "talk")!;
  assert.equal(talk([]).level, "watch");
  assert.equal(talk([]).looks, 0);
  assert.notEqual(talk(right(29)).level, "act", "29 is not 30");
  assert.equal(talk(right(30)).level, "act");
  assert.equal(talk(right(30)).needs.looks, 30);
  // Right 7 times in 10, saying 0.95 each time: right often enough on count, but it claimed more than it had.
  const loud = [...right(28, 0.95), ...Array.from({ length: 12 }, () => ({ p: 0.95, hit: false }))];
  assert.equal(talk(loud).overconfident, true);
  assert.notEqual(talk(loud).level, "act");
  // Careful is allowed: right every time, saying it was not sure.
  assert.equal(talk(right(30, 0.3)).level, "act");
  // A line said for them that was not theirs asks more of its talking, and of nothing else.
  const v = vetoesByBucket([{ kind: "talk" }]);
  assert.deepEqual(v, { talk: 1 });
  assert.equal(talk(right(30), v).needs.looks, 45);
  assert.notEqual(talk(right(30), v).level, "act");
  assert.equal(standingOf([], v, right(30)).find((s) => s.bucket === "courtesy")!.needs.looks, 6);
});

test("without a model, the same is half the words shared; it says so", () => {
  assert.equal(mockSame("Just looking around.", "just looking around!").same, true);
  assert.equal(mockSame("Just looking around.", "I'm going home to sleep").same, false);
  assert.match(mockSame("a", "b").why, /no model/);
});
