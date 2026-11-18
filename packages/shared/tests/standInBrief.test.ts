/**
 * The brief an echo keeps a body by (DECISIONS C104): what the web app signs, the room reads as it was
 * written, and nothing else.
 *
 * Run:  node --import tsx --test packages/shared/tests/standInBrief.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { signBrief, signReport, signSpeak, verifyBrief, verifyReport, verifySpeak } from "../src/standInBrief";
import type { StandInBrief } from "../src/village";

const NOW = Date.UTC(2026, 10, 17, 12);
const brief: StandInBrief = {
  sub: "e1f3e0fc-1111-4222-8333-444455550002",
  exp: NOW + 60_000,
  calls: { greeting: { call: "greet-warm", p: 0.8, may: "act" }, "lost-purse": { call: "leave", p: 0.6, may: "watch" } },
};

test("a brief signed is read back as it was written", () => {
  assert.deepEqual(verifyBrief(signBrief(brief, "k1"), ["k1"], NOW), brief);
});

test("the key it was signed with may be the old one, during a rotation", () => {
  assert.deepEqual(verifyBrief(signBrief(brief, "old"), ["new", "old"], NOW), brief);
});

test("another key, a changed word, or a brief past its time is nothing", () => {
  const token = signBrief(brief, "k1");
  assert.equal(verifyBrief(token, ["k2"], NOW), null);
  assert.equal(verifyBrief(token, ["k1"], brief.exp), null, "out of date at its own expiry");
  const [v, body, sig] = token.split(".");
  const forged = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as StandInBrief;
  forged.calls["lost-purse"]!.may = "act";
  assert.equal(verifyBrief(`${v}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, ["k1"], NOW), null, "a right it had not earned, written in on the way");
});

test("nobody's brief is not signed at all", () => {
  assert.throws(() => signBrief({ ...brief, sub: "" }, "k1"));
});

test("an identity token is not a brief, and junk is nothing", () => {
  for (const junk of [null, 42, "", "standin1.x.y", "a.b.c.d", "x".repeat(20000)]) assert.equal(verifyBrief(junk, ["k1"], NOW), null);
});

test("a brief in a shape the room does not read is refused whole, even signed", () => {
  for (const bad of [
    { ...brief, sub: 42 },
    { ...brief, calls: { greeting: { call: "greet-warm", p: 1.5, may: "act" } } },
    { ...brief, calls: { greeting: { call: "greet-warm", p: 0.5, may: "always" } } },
    { ...brief, calls: { "Not A Kind": { call: "x", p: 0.5, may: "act" } } },
  ]) assert.equal(verifyBrief(signBrief(bad as StandInBrief, "k1"), ["k1"], NOW), null, JSON.stringify(bad).slice(0, 80));
});

test("a brief carries where the echo stands in talking (C109), one of the three or nothing", () => {
  for (const talk of ["act", "ask", "watch"] as const) assert.equal(verifyBrief(signBrief({ ...brief, talk }, "k1"), ["k1"], NOW)?.talk, talk);
  assert.equal(verifyBrief(signBrief(brief, "k1"), ["k1"], NOW)?.talk, undefined, "a brief with no word on talking: the room reads it as silent");
  assert.equal(verifyBrief(signBrief({ ...brief, talk: "shout" as never }, "k1"), ["k1"], NOW), null);
});

test("a room's request to speak is signed for that and nothing else (C109)", () => {
  const body = JSON.stringify({ sub: brief.sub, cell: "84dcee5ffffffff", room: "ABCDE", mode: "act", turns: [{ from: "them", text: "hi" }], at: NOW });
  const sig = signSpeak(body, "k1");
  assert.equal(verifySpeak(body, sig, ["k1"]), true);
  assert.equal(verifySpeak(body, sig, ["k2", "k1"]), true, "during a rotation");
  assert.equal(verifySpeak(body.replace("act", "ask"), sig, ["k1"]), false, "a changed word");
  assert.equal(verifySpeak(body, sig, ["k2"]), false);
  assert.equal(verifySpeak(body, undefined, ["k1"]), false);
  assert.equal(verifyReport(body, sig, ["k1"]), false, "a request to speak is not a report");
  assert.equal(verifySpeak(body, signReport(body, "k1"), ["k1"]), false, "and a report is not a request to speak");
});
