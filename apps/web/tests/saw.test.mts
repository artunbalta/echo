/**
 * What the echo saw (`lib/knowable/saw.ts`, DECISIONS C89): a record said back as counts of what
 * happened, never as what kind of person it makes anyone.
 *
 * Run:  node --import tsx --test apps/web/tests/saw.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { MomentKind } from "@echo/planet";

import { FAMILIES, FAMILY_NAMES, ON, type Look } from "../src/lib/knowable/calls";
import { familyCounts, sawLines } from "../src/lib/knowable/saw";

const look = (kind: MomentKind, outcome: string): Look => ({ kind, outcome });

test("nothing is said of a family until it has been met twice, and nothing at all of a record too short", () => {
  assert.deepEqual(sawLines("en", []), []);
  assert.deepEqual(sawLines("en", [look("fallen-elder", "help-up")]), []);
  assert.deepEqual(sawLines("en", [look("fallen-elder", "help-up"), look("lost-purse", "leave"), look("ball-game", ON)]), []);
  // The tale is one moment: once is enough.
  assert.deepEqual(sawLines("en", [look("unfinished-tale", "told")]), ["A story stopped before its end, and you stayed for the end."]);
  assert.deepEqual(sawLines("en", [look("unfinished-tale", ON)]), ["A story stopped before its end, and you walked on."]);
});

test("each line is a count of what happened, by family", () => {
  const visit: Look[] = [
    look("fallen-elder", "help-up"), look("spilled-basket", "help"), look("stuck-cart", ON), look("caught-lamb", "free-lamb"),
    look("lost-purse", "leave"), look("honey-stall", "three-jars"),
    look("litter", ON), look("woodpile", ON),
    look("ball-game", "to-alone"),
  ];
  assert.deepEqual(familyCounts(visit), { help: { met: 4, did: 3 }, honesty: { met: 2, did: 1 }, courtesy: { met: 0, did: 0 }, conformity: { met: 0, did: 0 }, order: { met: 2, did: 0 }, curiosity: { met: 0, did: 0 } });
  assert.deepEqual(sawLines("en", visit, 9), [
    "Of 9 things that happened near you, you took part in 6.",
    "You gave your time to 3 of the 4 you met in trouble.",
    "Twice honesty was yours to choose; you chose it once.",
    "You found 2 things out of place, and left them as they were.",
  ]);
  // Three by default: the whole, then the families met most.
  assert.deepEqual(sawLines("en", visit), sawLines("en", visit, 9).slice(0, 3));
  assert.deepEqual(sawLines("tr", visit, 9), [
    "Yakınında olan 9 şeyden 6 tanesine katıldın.",
    "Zor durumda gördüğün 4 kişiden 3 tanesine vakit ayırdın.",
    "2 kez dürüst olmak senin elindeydi; 1 tanesinde dürüst olanı seçtin.",
    "Yerinde durmayan 2 şey gördün; olduğu gibi bıraktın.",
  ]);
});

test("pointing a pedlar the way is not walking past him, and the line does not say it was", () => {
  // Help's act is help at a cost: walking him there. Pointing is neither that nor passing by.
  const lines = sawLines("en", [look("ask-way", "point"), look("ask-way", "point")]);
  assert.deepEqual(lines, ["You met two in trouble, and gave your time to neither."]);
  for (const lang of ["en", "tr"] as const) assert.doesNotMatch(sawLines(lang, [look("ask-way", "point"), look("ask-way", "point"), look("heavy-jugs", ON)]).join(" "), /walked past|yürüyüp geç/i);
});

test("walking past a purse is not a choice about honesty, and is not counted as one", () => {
  // The registered analysis's rule for decisions: the share is among those who chose.
  const lines = sawLines("en", [look("lost-purse", ON), look("wrong-basket", "not-mine"), look("knucklebones", "say-true")]);
  assert.deepEqual(lines, ["Twice honesty was yours to choose, and you chose it each time."]);
  // One purse walked past and one basket handed back: one choice, and nothing is said yet.
  assert.deepEqual(sawLines("en", [look("lost-purse", ON), look("honey-stall", ON), look("wrong-basket", "not-mine")]), []);
  // Chosen otherwise: said as that, with no word for what it makes anyone.
  const took = sawLines("en", [look("lost-purse", "take-all"), look("knucklebones", "say-tava")]);
  assert.deepEqual(took, ["Twice honesty was yours to choose, and you chose otherwise each time."]);
  for (const l of [...lines, ...took]) assert.doesNotMatch(l, /took|stole|theft|dishonest|liar/i);
});

test("every family can say all, none and some, in both languages, without a word for what kind of person that is", () => {
  const TRAITS = /\b(kind|selfish|honest person|dishonest|generous|rude|conformist|curious person|helpful|good|bad|score|points|level)\b|puan|seviye|iyi biri|kötü/i;
  for (const f of FAMILY_NAMES) {
    const kinds = Object.keys(FAMILIES[f]) as MomentKind[];
    const act = (FAMILIES[f] as Record<string, readonly string[]>)[kinds[0]!]![0]!;
    const n = Math.max(3, kinds.length);
    // Not the family's act: walking on, or for honesty (counted only where chosen) the moment's other verb.
    const other: Partial<Record<MomentKind, string>> = { "lost-purse": "take-one", "wrong-basket": "take-it", knucklebones: "say-tava", "honey-stall": "three-jars" };
    const run = (did: number): Look[] =>
      Array.from({ length: n }, (_, i) => {
        const kind = kinds[i % kinds.length]!;
        return look(kind, i < did ? (FAMILIES[f] as Record<string, readonly string[]>)[kind]![0]! : (other[kind] ?? ON));
      });
    assert.ok(act);
    const seen = new Set<string>();
    for (const did of [n, 0, 1])
      for (const lang of ["en", "tr"] as const) {
        const lines = sawLines(lang, run(did), 9).filter((l) => !/took part|katıldın/.test(l));
        assert.equal(lines.length, 1, `${f} ${lang} did ${did}: ${JSON.stringify(lines)}`);
        assert.doesNotMatch(lines[0]!, TRAITS, lines[0]);
        assert.ok(lines[0]!.includes(String(n)) || /both|every|each|all|once|twice|hepsi|hiçbir/i.test(lines[0]!), lines[0]);
        seen.add(lines[0]!);
      }
    assert.equal(seen.size, 6, `${f}: the six sentences are not all different`);
  }
});
