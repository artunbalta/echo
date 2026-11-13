/**
 * A bench as something sat on (DECISIONS C98, `lib/village.ts`): one description of a seat for the mesh,
 * the schedule, the moments and the stranger, so nobody sits beside a bench that somebody else is on.
 *
 * The owner's words: people sitting next to you still do not sit in the right place. Three things put
 * them wrong (the stranger sat where they stood, a moment's sitter was set in front of the plank turned
 * along it, the old were pushed off their seats), and what answers all three is here.
 *
 * Run:  node --import tsx --test packages/planet/tests/bench.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { BENCH, alongBench, benchOut, benchPlace, benchSeat } from "../lib/village.js";
import { benchSpot } from "../lib/moments.js";

const plan = {
  centre: { x: 0, y: 0 },
  // Round a green, as `village.ts` lays them: the plank runs across the line to the well.
  benches: [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return { x: Math.cos(a) * 9, y: Math.sin(a) * 9, heading: a + Math.PI / 2 };
  }),
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test("someone on a bench faces out from it, toward the well, and sits ON the plank", () => {
  for (const b of plan.benches) {
    const out = benchOut(plan, b);
    // Out is across the plank, not along it: the bench's `heading` is the way the plank runs.
    assert.ok(near(Math.abs(Math.cos(out - b.heading)), 0, 1e-9));
    assert.ok(Math.cos(out - Math.atan2(-b.y, -b.x)) > 0.999);
    for (const along of [...BENCH.seats, -BENCH.endM, BENCH.endM]) {
      const s = benchSeat(plan, b, along);
      const back = alongBench(b, s);
      assert.ok(near(back.along, along, 1e-9) && back.off < 1e-9, "a seat is on the plank's own line");
      assert.ok(Math.abs(along) <= BENCH.lengthM / 2, "and within its length");
      assert.equal(s.heading, out);
    }
  }
});

test("a place beside someone is a body's width from them, on the plank, and a full bench has none", () => {
  // Nobody on it: where one wanted.
  assert.equal(benchPlace([], -0.5), -0.5);
  // Someone at one end: beside them is a body across, never on top of them.
  const beside = benchPlace([-0.8], -0.7)!;
  assert.ok(Math.abs(beside - -0.8) >= BENCH.apartM - 1e-9);
  assert.ok(Math.abs(beside) <= BENCH.lengthM / 2);
  // The village's two seats leave no room between them, and room at neither end for a third body's width.
  for (const want of [-1, -0.2, 0, 0.3, 1]) {
    const place = benchPlace([...BENCH.seats], want);
    if (place !== null) for (const t of BENCH.seats) assert.ok(Math.abs(place - t) >= BENCH.apartM - 1e-9, `${want} → ${place}`);
  }
  assert.equal(benchPlace([-0.85, -0.13, 0.59], 0), null);
  // Off the end of the plank is not a place.
  assert.ok(Math.abs(benchPlace([], 5)!) <= BENCH.lengthM / 2 - 0.3 + 1e-9);
});

test("a bench moment is given a bench with room on it, facing the way its sitters face", () => {
  const at = { x: 20, y: 0 };
  const any = benchSpot(at, Math.PI, plan as never)!;
  assert.equal(any.bench, 0);
  assert.equal(any.facing, benchOut(plan, plan.benches[0]!));
  // The nearest is taken: the next one, not the same one with someone sat across their knees.
  const next = benchSpot(at, Math.PI, plan as never, (i) => i !== 0);
  assert.ok(next === null || next.bench !== 0);
  assert.equal(benchSpot(at, Math.PI, plan as never, () => false), null);
});
