/**
 * The world's chrome in two languages (DECISIONS C69).
 *
 * Run:  node --import tsx --test apps/web/tests/i18n.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { RECIPES, STAGES, allThingKinds, verbsOf } from "@echo/planet";

import { VERBS_TR_FOR_TEST, t, verbLabel } from "../src/lib/i18n";

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

test("the site is English, and Turkish only for whoever chose it: the browser's language decides nothing", async () => {
  const fs = await import("node:fs");
  const src = (path: string) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Nothing that decides the language reads what the browser is set to.
  for (const file of ["lib/lang.ts", "lib/langOf.ts", "middleware.ts", "app/layout.tsx"]) assert.doesNotMatch(src(file), /navigator\.language|accept-language/i, file);
  // With no choice made, the page is read in the language it was built in: English, but for the page built in Turkish.
  assert.match(src("lib/lang.ts"), /\(\) => choice\(\) \?\? served/);
  assert.match(src("lib/servedLang.tsx"), /createContext<Lang>\("en"\)/);
  assert.match(src("app/layout.tsx"), /<html lang="en"/);
});

test("a string is filled from its values, in either language", () => {
  assert.equal(t("en", "prompt.talk", { name: "Hul" }), "Talk to Hul");
  assert.equal(t("tr", "prompt.talk", { name: "Hul" }), "Hul ile konuş");
  assert.equal(t("tr", "pack.count", { n: 3, of: 8 }), "Çantanda 3/8");
  // A value nobody passed is left visible, not turned into "undefined".
  assert.equal(t("en", "prompt.in", {}), "In {name}");
});
