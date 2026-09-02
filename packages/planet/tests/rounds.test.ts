/**
 * The subdivision rounds (section 4.2), and the collision between the trigger and section 5.4.
 *
 * The most important test in this file is the deadlock one. The design document's trigger watches
 * "unassigned parcels" while section 5.4 manufactures unassigned parcels that can never be
 * assigned, and when the second number is larger than triggerFraction the first can never be
 * reached. That is not a subtle interaction: at the stated 60% land target it stops the planet in
 * round 1. The test pins the exact condition so nobody quietly reintroduces it.
 *
 * Run:  node --import tsx --test packages/planet/tests/rounds.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PLANET_PARAMS, SECTION_3_PARAMS } from "../lib/manifest.js";
import { chooseCommons } from "../lib/commons.js";
import { LITERAL_RULES, REPAIRED_RULES, seedInventory, simulateRounds } from "../lib/rounds.js";
import { checkTiling } from "../lib/tiling.js";

// The mechanics tests below assert the closed form for a resolution 1 to 8 span, so they run on
// the section 3 numbers. The shipped parameters get their own test at the end.
const params = { ...SECTION_3_PARAMS };

const pctOf = (x: number) => `${(x * 100).toFixed(1)}%`;

/** A stable stream, so a failing run is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable value in 0..1 for a cell, from the id alone. */
function cellHash(cell: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < cell.length; i++) {
    h ^= cell.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

/** Deterministic pseudo ocean: `share` of cells are water, the rest are entirely land. */
function patchyLand(share: number) {
  return (cell: string): number => (cellHash(cell) < share ? 0 : 1);
}

/**
 * A GRADED field, where cells hold a spread of land fractions rather than none or all.
 *
 * This matters more than it looks. A binary field never exercises the 0.15 threshold at all: cells
 * at exactly zero never enter the working set, so `lf >= minLandFraction` is a no-op on everything
 * that reaches it, and a test built only on a binary field passes with the threshold deleted.
 */
function gradedLand(cell: string): number {
  const h = cellHash(cell);
  if (h < 0.25) return 0;
  if (h < 0.5) return 0.1;
  if (h < 0.75) return 0.4;
  return 1;
}

test("on a planet that is all land, capacity matches the closed form exactly", () => {
  // With nothing refused, every round assigns (1 - f) of inventory and the remainder splits into
  // seven, so inventory grows by g = 7f = 1.4 a round. The floor round assigns everything left.
  const sim = simulateRounds({
    params,
    rules: REPAIRED_RULES,
    landFraction: () => 1,
    random: mulberry32(1),
  });

  assert.equal(sim.deadlockedAtRound, null);
  assert.equal(sim.rounds.length, 8);
  assert.deepEqual(
    sim.rounds.map((r) => r.assignableAtStart),
    [830, 1162, 1624, 2268, 3171, 4438, 6209, 8687],
  );
  assert.deepEqual(
    sim.rounds.map((r) => r.assignments),
    [664, 930, 1300, 1815, 2537, 3551, 4968, 8687],
  );
  assert.equal(sim.totalCapacity, 24_452);
  assert.equal(sim.floorReachedAtRound, 8);

  // Inventory really does grow by 7f, not by 7 and not by 2.
  for (let i = 1; i < sim.rounds.length; i++) {
    const ratio = sim.rounds[i]!.assignableAtStart / sim.rounds[i - 1]!.assignableAtStart;
    assert.ok(Math.abs(ratio - 7 * params.triggerFraction) < 0.01, `round ${i + 1} grew by ${ratio}`);
  }

  // 24,452 owners, not 691,776,122. The floor cell count is not a capacity.
  assert.ok(sim.totalCapacity < 25_000);
});

test("the literal trigger deadlocks as soon as the ocean is wider than triggerFraction", () => {
  // 40% of cells unassignable against a 20% trigger: the count bottoms out at twice the threshold.
  const sim = simulateRounds({
    params,
    rules: LITERAL_RULES,
    landFraction: patchyLand(0.4),
    random: mulberry32(2),
  });

  assert.equal(sim.deadlockedAtRound, 1);
  assert.equal(sim.rounds.length, 1);
  const round = sim.rounds[0]!;
  assert.equal(round.resolution, params.startResolution);
  assert.equal(round.rowsAtStart, 830);
  assert.equal(round.endsWhenBasisReaches, Math.floor(0.2 * 830));
  assert.ok(round.assignableAtStart < round.rowsAtStart - round.endsWhenBasisReaches);
  assert.equal(sim.totalCapacity, round.assignments);
  // Nothing ever subdivided, so nothing was ever inserted.
  assert.equal(sim.largestSubdivisionInsert, 0);
});

test("round 1 stalls exactly when the unassignable share exceeds triggerFraction", () => {
  // The measured share matters, not the nominal one, so it is counted rather than assumed.
  for (const ocean of [0, 0.05, 0.1, 0.19, 0.21, 0.3, 0.4, 0.6]) {
    const landFraction = patchyLand(ocean);
    const seeded = seedInventory(params.startResolution, params.commonsResolution ?? 1);
    const share = seeded.filter((c) => landFraction(c) < params.minLandFraction).length / seeded.length;

    const sim = simulateRounds({ params, rules: LITERAL_RULES, landFraction, random: mulberry32(3) });
    const stalledInRoundOne = sim.deadlockedAtRound === 1;
    assert.equal(
      stalledInRoundOne,
      share > params.triggerFraction,
      `${pctOf(share)} unassignable against a ${pctOf(params.triggerFraction)} trigger`,
    );
  }
});

test("watching every unassigned row stalls the planet sooner or later, for any ocean at all", () => {
  // Round 1 is only where it shows first. A landless cell splits into seven every round while the
  // assignable pool grows by 7f = 1.4, so the unassignable share multiplies by five a round and
  // overtakes any trigger fraction. Even a 5% ocean stops the planet within a few rounds.
  for (const ocean of [0.05, 0.1, 0.19, 0.21, 0.4]) {
    const landFraction = patchyLand(ocean);
    const literal = simulateRounds({ params, rules: LITERAL_RULES, landFraction, random: mulberry32(3) });
    assert.notEqual(literal.deadlockedAtRound, null, `${pctOf(ocean)} ocean should stall eventually`);
    assert.ok(literal.deadlockedAtRound! <= 3, `stalled only in round ${literal.deadlockedAtRound}`);

    // Watching the assignable pool instead, the same planet runs all the way to the floor.
    const repaired = simulateRounds({ params, rules: REPAIRED_RULES, landFraction, random: mulberry32(3) });
    assert.equal(repaired.deadlockedAtRound, null, `${pctOf(ocean)} ocean stalled after the repair`);
    assert.equal(repaired.floorReachedAtRound, 8);
  }

  // With no unassignable cells at all the two readings are the same thing, which is why the
  // conflict is invisible until terrain exists.
  const dry = simulateRounds({ params, rules: LITERAL_RULES, landFraction: () => 1, random: mulberry32(3) });
  assert.equal(dry.deadlockedAtRound, null);
  assert.equal(dry.totalCapacity, 24_452);
});

test("repairing the trigger alone is not enough: the row count follows the surface", () => {
  const land = patchyLand(0.4);
  const bloated = simulateRounds({
    params,
    rules: { triggerBasis: "assignable-only", subdivisionPolicy: "subdivide-everything" },
    landFraction: land,
    random: mulberry32(4),
  });
  const lean = simulateRounds({
    params,
    rules: REPAIRED_RULES,
    landFraction: land,
    random: mulberry32(4),
  });

  // Same planet, same owners. The only difference is how many rows nobody can ever buy.
  assert.equal(bloated.totalCapacity, lean.totalCapacity);
  assert.ok(bloated.peakRows > 100_000_000, `peak rows was ${bloated.peakRows}`);
  assert.ok(lean.peakRows < 10_000, `peak rows was ${lean.peakRows}`);
  assert.ok(bloated.largestSubdivisionInsert > 100_000_000);
});

test("the 0.15 threshold decides who is assignable, and moving it moves the answer", () => {
  // A quarter of cells at each of 0, 0.1, 0.4 and 1. Only the last two clear the default 0.15.
  // Stopped at resolution 5 so the comparison runs in a moment rather than in ten seconds.
  const shallow = { ...params, floorResolution: 5 };
  const seeded = seedInventory(shallow.startResolution, shallow.commonsResolution ?? 1);
  const above = (bar: number) => seeded.filter((c) => gradedLand(c) >= bar).length;
  assert.ok(above(shallow.minLandFraction) > 0 && above(shallow.minLandFraction) < seeded.length);

  const at = (minLandFraction: number) =>
    simulateRounds({
      params: { ...shallow, minLandFraction },
      rules: REPAIRED_RULES,
      landFraction: gradedLand,
      random: mulberry32(9),
      recordCovers: false,
    });

  const base = at(shallow.minLandFraction);
  assert.equal(base.rounds[0]!.assignableAtStart, above(0.15));
  // Cells at 0.1 hold land, so they stay in the working set and are simply never sold.
  assert.ok(base.rounds[0]!.assignableAtStart < base.rounds[0]!.rowsAtStart - base.rounds[0]!.terminalRowsAtStart);

  // The bar really is the bar: move it and the claimable population moves with it, in both
  // directions. Deleting the filter, or setting minLandFraction to 0.99, must fail here.
  assert.equal(at(0.5).rounds[0]!.assignableAtStart, above(0.5));
  assert.equal(at(0.99).rounds[0]!.assignableAtStart, above(0.99));
  assert.equal(at(0).rounds[0]!.assignableAtStart, seeded.filter((c) => gradedLand(c) > 0).length);
  assert.ok(at(0.5).rounds[0]!.assignableAtStart < base.rounds[0]!.assignableAtStart);

  // And nothing below the bar is ever sold. Averaged over the round, land over parcel area cannot
  // sit under the threshold unless something below it was handed to somebody.
  for (const bar of [0, 0.15, 0.5]) {
    for (const round of at(bar).rounds) {
      if (round.assignments === 0) continue;
      assert.ok(
        round.landSoldKm2 / round.parcelAreaSoldKm2 >= bar,
        `at a ${bar} bar, round ${round.round} sold parcels averaging ${round.landSoldKm2 / round.parcelAreaSoldKm2} land`,
      );
    }
  }

  // Note what is NOT asserted: that a stricter bar sells fewer parcels overall. It does not, on
  // this field. A cell that holds land but misses the bar is not terminal, it keeps subdividing,
  // so raising the bar moves cells from the claimable pool into the pool that breeds inventory and
  // total capacity can rise. Real terrain correlates land between parent and child and would damp
  // that, but the registry rule itself has no monotonicity in minLandFraction and should not be
  // described as though it does.
});

test("under the literal rule every unassigned row really does become seven", () => {
  // The recurrence rows(n+1) = 7 * (rows(n) - assigned(n)) is what produces the 244 million row
  // headline. Asserting it pins the landless accounting, which a bare "peak rows is large" check
  // does not: double counting this round's own new landless children still leaves peak rows large.
  const sim = simulateRounds({
    params,
    rules: { triggerBasis: "assignable-only", subdivisionPolicy: "subdivide-everything" },
    landFraction: patchyLand(0.4),
    random: mulberry32(10),
  });

  for (let i = 1; i < sim.rounds.length; i++) {
    const previous = sim.rounds[i - 1]!;
    assert.equal(
      sim.rounds[i]!.rowsAtStart,
      7 * (previous.rowsAtStart - previous.assignments),
      `round ${i + 1} row count does not follow from round ${i}`,
    );
  }
  assert.equal(sim.peakRows, sim.rounds[sim.rounds.length - 1]!.rowsAtStart);
});

test("the tiling invariant holds after every subdivision round", () => {
  const sim = simulateRounds({
    params,
    rules: REPAIRED_RULES,
    landFraction: patchyLand(0.4),
    random: mulberry32(5),
    recordCovers: true,
  });

  assert.ok(sim.covers, "covers were requested");
  // The seeded state, then one after each of the seven subdivisions, then the sold out registry.
  // An inequality here would let the two most interesting covers go unchecked.
  assert.equal(sim.covers!.length, sim.rounds.length + 1, "one cover per round plus the seed state");
  for (const [i, cover] of sim.covers!.entries()) {
    const result = checkTiling(cover, params.floorResolution);
    assert.equal(result.ok, true, `cover ${i}: ${JSON.stringify(result)}`);
  }
});

test("recording covers is refused where it would mean holding 140 million ids", () => {
  assert.throws(
    () =>
      simulateRounds({
        params,
        rules: { triggerBasis: "assignable-only", subdivisionPolicy: "subdivide-everything" },
        landFraction: patchyLand(0.4),
        random: mulberry32(6),
        recordCovers: true,
      }),
    RangeError,
  );
});

test("freezing at the 0.15 threshold seals real land that freezing at zero does not", () => {
  const sealed = simulateRounds({
    params,
    rules: { triggerBasis: "assignable-only", subdivisionPolicy: "freeze-unassignable" },
    landFraction: gradedLand,
    random: mulberry32(7),
  });
  assert.ok(sealed.sealedLandKm2 > 0, "land was sealed inside cells frozen below the threshold");

  const kept = simulateRounds({
    params,
    rules: REPAIRED_RULES,
    landFraction: gradedLand,
    random: mulberry32(7),
  });
  // Freezing only at zero land seals no land BY CONSTRUCTION, since a frozen cell holds none. The
  // real difference is that the cells the threshold policy discards are still in play here, so more
  // parcels reach owners. That is the comparison worth asserting; the zero is an identity.
  assert.equal(kept.sealedLandKm2, 0);
  assert.ok(
    kept.totalCapacity > sealed.totalCapacity,
    `freezing at the threshold cost ${sealed.totalCapacity} against ${kept.totalCapacity} parcels`,
  );
});

test("a floor coarser than the start is refused rather than answered", () => {
  assert.throws(
    () =>
      simulateRounds({
        params: { ...params, startResolution: 5, floorResolution: 3 },
        rules: REPAIRED_RULES,
        landFraction: () => 1,
        random: mulberry32(11),
      }),
    RangeError,
  );
});

test("the commons is never inventory, at any reservation resolution", () => {
  for (const commonsResolution of [1, 2]) {
    const sim = simulateRounds({
      params: { ...params, startResolution: 2, commonsResolution },
      rules: REPAIRED_RULES,
      landFraction: () => 1,
      random: mulberry32(8),
    });
    assert.equal(sim.commonsCells, 12);
    assert.ok(sim.commonsAreaKm2 > 0);
    assert.equal(sim.rounds[0]!.rowsAtStart, seedInventory(2, commonsResolution).length);
  }
  // A commons finer than the parcels around it would sit inside one, so it is refused.
  assert.throws(() => seedInventory(1, 2), RangeError);
});

test("the shipped parameters run to the floor and produce the span the decision was made on", () => {
  const sim = simulateRounds({
    params: PLANET_PARAMS,
    rules: REPAIRED_RULES,
    landFraction: () => 1,
    random: mulberry32(12),
  });

  assert.equal(sim.deadlockedAtRound, null);
  assert.equal(sim.rounds.length, PLANET_PARAMS.floorResolution - PLANET_PARAMS.startResolution + 1);
  assert.equal(sim.floorReachedAtRound, sim.rounds.length);

  // Four rounds, resolutions 4 through 7, and a first to last parcel span of 7^3 = 343.
  assert.deepEqual(sim.rounds.map((r) => r.resolution), [4, 5, 6, 7]);
  const span = sim.rounds[0]!.meanParcelKm2 / sim.rounds[sim.rounds.length - 1]!.meanParcelKm2;
  assert.ok(Math.abs(span - 343) / 343 < 0.02, `span was ${span}, expected 343`);

  // The founding cohort holds 1 - triggerFraction of everything ever deeded, by construction.
  const sold = sim.rounds.reduce((s, r) => s + r.parcelAreaSoldKm2, 0);
  const founders = sim.rounds[0]!.parcelAreaSoldKm2 / sold;
  assert.ok(Math.abs(founders - (1 - PLANET_PARAMS.triggerFraction)) < 0.01, `founders hold ${founders}`);
});

test("the shipped parameters survive a planet that is mostly water, not only an all-land one", () => {
  // The existing shipped-parameter test runs on land everywhere, where minLandFraction is never
  // reached, nothing is unassignable, and the two trigger readings are the same thing. That tests
  // none of the machinery the decision turned on. This runs the graded field at start 4, floor 7.
  const sim = simulateRounds({
    params: PLANET_PARAMS,
    rules: REPAIRED_RULES,
    landFraction: gradedLand,
    random: mulberry32(13),
  });

  assert.equal(sim.deadlockedAtRound, null, "the repaired trigger stalled at the shipped parameters");
  assert.deepEqual(sim.rounds.map((r) => r.resolution), [4, 5, 6, 7]);
  assert.ok(sim.totalCapacity > 0);

  // The 0.15 rule really bites here: some rows are unassignable and some are terminal.
  const first = sim.rounds[0]!;
  assert.ok(first.assignableAtStart < first.rowsAtStart, "nothing was refused, so the field is wrong");
  assert.ok(sim.rounds.some((r) => r.terminalRowsAtStart > 0), "no cell was ever frozen");
  assert.ok(sim.peakRows > 0 && sim.largestSubdivisionInsert > 0);

  // The same planet under the literal reading stalls, which is the whole reason for the repair.
  const literal = simulateRounds({
    params: PLANET_PARAMS,
    rules: LITERAL_RULES,
    landFraction: gradedLand,
    random: mulberry32(13),
  });
  assert.notEqual(literal.deadlockedAtRound, null);
  assert.ok(literal.totalCapacity < sim.totalCapacity / 2);
});

test("an explicit commons array is honoured, which is the only path the product uses", () => {
  // Every other test passes a resolution and lets the twelve pentagons be derived. The product
  // passes a relocated set, which is a different code path and longer than twelve.
  //
  // Run at the same three round span as the shipped parameters but two resolutions coarser, so the
  // covers can be recorded and checked without holding a million ids. The commons branch does not
  // care how deep the registry is, only that the set it is handed is honoured.
  const shallow = { ...PLANET_PARAMS, startResolution: 2, floorResolution: 5 };
  const plan = chooseCommons(1, gradedLand, PLANET_PARAMS.minLandFraction);
  const sim = simulateRounds({
    params: shallow,
    rules: REPAIRED_RULES,
    landFraction: gradedLand,
    random: mulberry32(14),
    commonsCells: plan.reserved,
    recordCovers: true,
  });

  assert.equal(sim.commonsCells, plan.reserved.length);
  assert.ok(sim.commonsCells >= 12, "every pentagon must stay reserved");
  assert.equal(sim.rounds[0]!.rowsAtStart, seedInventory(shallow.startResolution, plan.reserved).length);

  // Nothing reserved may ever be sold, and the cover still has to be the whole sphere.
  const reserved = new Set(plan.reserved);
  for (const cover of sim.covers!) {
    for (const cell of plan.reserved) assert.ok(cover.includes(cell), `${cell} left the cover`);
    assert.equal(checkTiling(cover, shallow.floorResolution).ok, true);
  }
  assert.equal(reserved.size, plan.reserved.length);
});
