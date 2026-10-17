/**
 * A villager's temperament lives in the player's persona space (DECISIONS C40, decision 3).
 *
 * `@echo/planet` does not depend on `@echo/shared`, so `lib/life.ts` cannot import the axis list and
 * pins only its length. This file is where both packages are visible, so this is where the two are
 * held equal: if a ninth persona axis is ever added, every temperament on the planet is one number
 * short, BALD's nearby-candidate set is measured in the wrong space, and nothing else would say so.
 *
 * Run:  node --import tsx --test apps/web/tests/temperamentAxes.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TEMPERAMENT_AXES, settlementAt, temperaments } from "@echo/planet";
import { PERSONA_AXIS_KEYS, PERSONA_DIM } from "@echo/shared";

test("a temperament has exactly one number per persona axis", () => {
  assert.equal(TEMPERAMENT_AXES, PERSONA_DIM);
  assert.equal(TEMPERAMENT_AXES, PERSONA_AXIS_KEYS.length);
});

test("and every temperament on a real settlement is that long, in the persona axes' range", () => {
  const geo = { habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6 };
  let s = null;
  for (let i = 0; i < 200 && s === null; i++) s = settlementAt("echo-planet-0001", `axes-${i}`, geo, 0);
  assert.ok(s !== null, "no settlement in 200 cells");
  for (const t of temperaments(s).values()) {
    assert.equal(t.length, PERSONA_DIM);
    for (const v of t) assert.ok(v >= -1 && v <= 1);
  }
});
