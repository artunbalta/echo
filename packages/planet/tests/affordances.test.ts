/**
 * The affordance registry (`lib/affordances.ts`, DECISIONS C45): everything in the world can be acted
 * on, and every act says what it means in terms the rest of the system already defines.
 *
 * THE TEST THAT MATTERS IS COVERAGE. A scatter class or a village thing with no verb fails here, so
 * nothing new reaches the world without someone deciding what a person can do to it. The other tests
 * keep the registry honest against the two documents it borrows its meanings from: every cue is a
 * line of `cue-catalog.md`, and every act sent under a NAMED label really has that handler in
 * `services/ml/echo_ml/ingest.py` (read, never edited: C7's protected boundary).
 *
 * Run:  node --import tsx --test packages/planet/tests/affordances.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ASSET_CLASSES } from "../lib/assets.js";
import { OTHER_THINGS, VILLAGE_THINGS, allThingKinds, thingName, verbsOf } from "../lib/affordances.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const catalog = readFileSync(`${root}docs/world-design/cue-catalog.md`, "utf8");
const ingest = readFileSync(`${root}services/ml/echo_ml/ingest.py`, "utf8");

test("C45: everything the world draws can be acted on — every scatter class, every village thing, people, water", () => {
  const kinds = allThingKinds();
  for (const c of ASSET_CLASSES) assert.ok(kinds.includes(c.id), `${c.id} is not in the list of things`);
  for (const k of [...VILLAGE_THINGS, ...OTHER_THINGS]) assert.ok(kinds.includes(k));
  for (const k of kinds) {
    const verbs = verbsOf(k);
    assert.ok(verbs.length > 0, `nothing can be done to a ${k}: give it a verb in lib/affordances.ts`);
    assert.equal(new Set(verbs.map((x) => x.id)).size, verbs.length, `${k} has two verbs with one id`);
    assert.ok(thingName(k).length > 0);
  }
});

test("every act's cue is a line of cue-catalog.md", () => {
  const defined = new Set([...catalog.matchAll(/\*\*([A-K]\d+)\*\*/g)].map((x) => x[1]));
  for (const k of allThingKinds()) {
    for (const verb of verbsOf(k)) {
      assert.ok(defined.has(verb.measure.cue), `${k}/${verb.id}: cue ${verb.measure.cue} is not in the catalogue`);
      assert.equal(verb.measure.channel, verb.measure.cue[0]);
    }
  }
});

test("an act sent under a NAMED label has that handler in ingest.py; a GENERIC one meets its route's rule", () => {
  for (const k of allThingKinds()) {
    for (const verb of verbsOf(k)) {
      const { action, route, channel, cue, abandon } = verb.measure;
      if (route === "named") {
        assert.ok(new RegExp(`"${action}"`).test(ingest), `${k}/${verb.id}: ingest.py has no "${action}"`);
        if (abandon) assert.ok(new RegExp(`"${abandon}"`).test(ingest), `${k}/${verb.id}: ingest.py has no "${abandon}"`);
      } else if (route === "generic") {
        // The generic branches of event_to_observation, as they read today.
        const ok =
          (channel === "F" && (cue.startsWith("F1") || cue.startsWith("F7") || /save|give/.test(action))) ||
          (channel === "G" && ["approach", "initiate", "greet"].includes(action)) ||
          (channel === "G" && action === "knock_door") || // carries `distance`, which the G branch reads
          (channel === "D" && cue.startsWith("D11")) || // the pet branch: `pet_attach` from raw.amount (C55)
          (channel === "F" && cue.startsWith("F9")) || // the bargaining branch: `risk_index` from raw.amount (C58)
          (channel === "F" && cue.startsWith("F3")) || // the risk branch: `risk_index` from raw.variance, 0.8 without (C45's push_through, relabelled in C59)
          action === "build_home"; // carries dwell_ms at a `structure`, which the dwell branch reads as ts_build (C59)
        assert.ok(ok, `${k}/${verb.id}: "${action}" on ${cue} would not take the generic route it claims`);
      } else {
        assert.ok(!new RegExp(`"${action}"`).test(ingest), `${k}/${verb.id}: "${action}" has a handler in ingest.py; call it named`);
        // Nor may an "unrouted" act fall into a generic branch by its cue or its name: C58's barter
        // did (F9 → risk_index at 0.6) while its entry said it moved nothing but the embedding.
        const generic =
          (channel === "F" && (/^F(1|3|7|9)$/.test(cue) || /save|spend|wager|bet|give|tip|share|bargain/.test(action))) ||
          (channel === "D" && cue.startsWith("D11")) ||
          /queue/.test(action) ||
          cue.startsWith("H1") ||
          cue.startsWith("G11");
        assert.ok(!generic, `${k}/${verb.id}: "${action}" on ${cue} is called unrouted and takes a generic branch`);
      }
    }
  }
});

test("marks heal, wrongs weigh, and only what you carry can be given", () => {
  for (const k of allThingKinds()) {
    for (const verb of verbsOf(k)) {
      if (verb.effect) assert.ok(verb.effect.lastsDays >= 0 && verb.effect.lastsDays <= 7, `${k}/${verb.id}: a mark that lasts ${verb.effect.lastsDays} days`);
      if (verb.needs === "carrying") assert.equal(verb.gives, undefined, `${k}/${verb.id}: gives and takes at once`);
      if (verb.gives) assert.equal(verb.needs, "empty-handed", `${k}/${verb.id}: picks up with full hands`);
      if (verb.needs === "aboard") assert.equal(k, "boat", `${k}/${verb.id}: needs a boat to be aboard`);
      if (verb.deed) assert.notEqual(verb.owner, "none", `${k}/${verb.id}: a deed that touches nobody`);
      assert.ok(verb.label.length > 0 && verb.label.length <= 40);
    }
  }
});

test("C59: nothing the ground offers — a scatter class, the water — is a deed, so land with no village needs nobody to see it", () => {
  // The act route's path for a parcel with no village (most of them) records no deed and has no
  // witnesses to compute. A deed on a scatter verb would need both: give it one, and that path too.
  for (const k of [...ASSET_CLASSES.map((c) => c.id), "water" as const]) for (const verb of verbsOf(k)) assert.equal(verb.deed, null, `${k}/${verb.id} is a deed`);
});
