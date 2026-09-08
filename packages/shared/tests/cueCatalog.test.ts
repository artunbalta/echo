/**
 * `social.ts` against `cue-catalog.md` — the check that makes the never-renumber rule enforceable.
 *
 * `cue-catalog.md:3` makes cue IDs stable and forbids reuse: "never renumber; deprecate by striking
 * through and appending a successor, never reuse." Nothing could enforce that. `CueId` is a
 * template-literal type, so the compiler accepts any letter-plus-digits string, and the catalogue is
 * prose — so an ID could be invented, or worse, BORROWED from a cue that already means something
 * else, and everything would stay green.
 *
 * BOTH FAILURES WERE LIVE WHEN THIS FILE WAS WRITTEN (SOC-6.G):
 *   · `work_shift` and `shirk_work` sat on **C8**, which the catalogue defines as "deliberation
 *     under pressure", and `take_vocation` on **C9**, "tempo consistency" — and coverage-matrix.md
 *     builds axis claims on those two meanings. Three shipped actions were quietly reading as three
 *     other cues.
 *   · `eat_meal` and `host_table` shipped as **G13** and **G14** with no catalogue row at all, so
 *     canonical spine did not know they existed.
 *
 * Neither could be seen from either side alone. That is what this file is: the join.
 *
 * Run:  node --import tsx --test packages/shared/tests/cueCatalog.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SOCIAL_CUES } from "../src/social.js";

const md = readFileSync(new URL("../../../docs/world-design/cue-catalog.md", import.meta.url), "utf8");
const rows = [...md.matchAll(/^\|\s*\*\*([A-K]\d+)\*\*\s*\|\s*([^|]+?)\s*\|/gm)];
const catalogue = new Map(rows.map((m) => [m[1], m[2]]));

test("the catalogue parses, and no id in it is used twice", () => {
  assert.equal(rows.length, catalogue.size, "duplicate cue id in cue-catalog.md");
  assert.ok(catalogue.size >= 105, `expected at least 105 catalogue rows, parsed ${catalogue.size}`);
});

test("every cue id used in social.ts has a catalogue row", () => {
  const orphans = Object.entries(SOCIAL_CUES)
    .filter(([, d]) => !catalogue.has(d.cue))
    .map(([action, d]) => `${action} -> ${d.cue}`);
  assert.deepEqual(orphans, [], `cue ids shipped with no cue-catalog.md row: ${orphans.join(", ")}`);
});

test("a cue's channel letter matches its declared channel, except the declared K-twin", () => {
  // travel_near is deliberately channel A carrying the K4 "never sets sail" twin; social.ts says so
  // at the declaration. It is the only one, and naming it here is what keeps it the only one.
  const allowed = new Set(["travel_near"]);
  const wrong = Object.entries(SOCIAL_CUES)
    .filter(([action, d]) => !allowed.has(action) && d.cue[0] !== d.channel)
    .map(([action, d]) => `${action}: channel ${d.channel} but cue ${d.cue}`);
  assert.deepEqual(wrong, [], wrong.join("; "));
});

test("the work and vocation cues are off C8/C9, which belong to two other cues entirely", () => {
  // The specific regression, named. C8 is "deliberation under pressure" and C9 is "tempo
  // consistency"; three shipped actions read as those two for as long as nothing joined the tables.
  assert.match(catalogue.get("C8") ?? "", /Deliberation under pressure/i);
  assert.match(catalogue.get("C9") ?? "", /Tempo consistency/i);
  assert.equal(SOCIAL_CUES.work_shift.cue, "C11");
  assert.equal(SOCIAL_CUES.shirk_work.cue, "C11");
  assert.equal(SOCIAL_CUES.take_vocation.cue, "C12");
  // And G12 keeps "reciprocity tracking", which transact_neutral is not.
  assert.match(catalogue.get("G12") ?? "", /Reciprocity tracking/i);
  assert.equal(SOCIAL_CUES.transact_neutral.cue, "G15");
});

test("the six society cue classes are answerable from the catalogue (SOC-6.G)", () => {
  // The list SOC-6.G exists to produce, held as a fact rather than as prose. Bereavement and
  // inheritance were the only two of the six that genuinely needed a new construct; kinship and
  // being-known need an ENVELOPE field and no cue id at all, so they are deliberately absent here.
  assert.match(catalogue.get("I7") ?? "", /Bereavement/i, "bereavement has no cue");
  assert.match(catalogue.get("F13") ?? "", /Inheritance/i, "inheritance has no cue");
  assert.match(catalogue.get("C11") ?? "", /Shift labour/i, "employment has no cue of its own");
  assert.match(catalogue.get("G13") ?? "", /commensality/i, "a shipped id with no row");
  assert.match(catalogue.get("G14") ?? "", /Hosting/i, "a shipped id with no row");
});
