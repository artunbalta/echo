/**
 * The world's chrome in two languages (DECISIONS C69).
 *
 * Run:  node --import tsx --test apps/web/tests/i18n.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { RECIPES, STAGES, allThingKinds, verbsOf } from "@echo/planet";

import { VERBS_TR_FOR_TEST, detectLang, t, verbLabel } from "../src/lib/i18n";

test("every verb the world can offer, and every thing a stranger can make or build, has a Turkish label", () => {
  const labels = new Set<string>();
  for (const kind of allThingKinds()) for (const v of verbsOf(kind)) labels.add(v.label);
  for (const r of RECIPES) labels.add(r.label);
  for (const s of STAGES) labels.add(s.label);
  const missing = [...labels].filter((l) => !(l in VERBS_TR_FOR_TEST));
  assert.deepEqual(missing, [], `no Turkish for: ${missing.join(" | ")}`);
  // And a label the map does not know is said in English rather than dropped.
  assert.equal(verbLabel("tr", "A verb nobody wrote"), "A verb nobody wrote");
  assert.equal(verbLabel("en", "Knock"), "Knock");
  assert.equal(verbLabel("tr", "Knock"), "Kapıyı çal");
});

test("the browser's first language decides, Turkish only when it is Turkish", () => {
  assert.equal(detectLang(["tr-TR", "en-US"]), "tr");
  assert.equal(detectLang(["en-GB", "tr"]), "en");
  assert.equal(detectLang(["de-DE", "tr-TR"]), "tr");
  assert.equal(detectLang(["de-DE"]), "en");
  assert.equal(detectLang([]), "en");
});

test("a string is filled from its values, in either language", () => {
  assert.equal(t("en", "prompt.talk", { name: "Hul" }), "Talk to Hul");
  assert.equal(t("tr", "prompt.talk", { name: "Hul" }), "Hul ile konuş");
  assert.equal(t("tr", "pack.count", { n: 3, of: 8 }), "Çantanda 3/8");
  // A value nobody passed is left visible, not turned into "undefined".
  assert.equal(t("en", "prompt.in", {}), "In {name}");
});
