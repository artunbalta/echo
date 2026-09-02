/**
 * The section 8 invariant: every cell is in exactly one place, and the union covers the sphere.
 *
 * The design document proposes compacting the union with compactCells and asserting it reduces to
 * the resolution 0 base set. The first test below is the reason lib/tiling.ts exists instead: on a
 * mixed resolution set, which is what the registry always is, compactCells throws. If a future
 * h3-js makes it work, that test fails and someone gets to delete a module.
 *
 * Run:  node --import tsx --test packages/planet/tests/tiling.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, compactCells, getPentagons, getResolution, getRes0Cells, isPentagon } from "h3-js";

import { cellCountAtResolution, descendantCount, descendantCountOfSphere } from "../lib/geo.js";
import { checkTiling } from "../lib/tiling.js";
import { seedInventory } from "../lib/rounds.js";

const allAtRes = (res: number) => getRes0Cells().flatMap((c) => cellToChildren(c, res));

test("compactCells cannot check a mixed resolution registry, which is why this module exists", () => {
  const uniform = allAtRes(1);
  // On a complete same-resolution cover it does exactly what section 8 expects.
  const compacted = compactCells(uniform);
  assert.equal(compacted.length, 122);

  // Replace one cell with its seven children, which is precisely what one subdivision round does.
  const mixed = [...uniform.slice(1), ...cellToChildren(uniform[0]!, 2)];
  assert.equal(new Set(mixed).size, mixed.length, "the mixed cover has no duplicate ids");
  assert.equal(mixed.length, 848);

  // In the order a registry produces, it throws.
  assert.throws(() => compactCells(mixed), /Duplicate input/);

  // Sorted finest first it does not throw, and that is the worse outcome: it answers 842 where
  // section 8 asserts 122, so the proposed check would pass a set it never actually compacted.
  // If a future h3-js fixes either behaviour, this test goes red and someone gets to delete a file.
  const finestFirst = mixed.slice().sort((a, b) => getResolution(b) - getResolution(a));
  const wrong = compactCells(finestFirst);
  assert.equal(wrong.length, 842);
  assert.notEqual(wrong.length, 122);

  // The check that does run says the same set is a perfect tiling, in any order.
  assert.equal(checkTiling(mixed, 8).ok, true);
  assert.equal(checkTiling(finestFirst, 8).ok, true);
});

test("a corrupt row is named, not silently given 40 million phantom descendants", () => {
  const uniform = allAtRes(1);

  // getResolution returns -1 for a string that is not a cell, so an unguarded weight would be
  // 7^9 = 40,353,607. Drop exactly 49 real resolution 1 parcels and the phantom cancels the gap
  // to the digit, and a broken registry reports itself as perfect.
  const corrupt = [...uniform.slice(49), "NULL"];
  const result = checkTiling(corrupt, 8);
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /not a valid H3 cell/);

  assert.equal(checkTiling([...uniform, "not-a-cell"], 8).ok, false);
  assert.equal(checkTiling([], 8).ok, false);
});

test("an uppercase alias of a cell is a duplicate, because H3 ids are case insensitive", () => {
  const uniform = allAtRes(1);

  // h3-js accepts either case and answers identically, so a raw string Set would count the alias
  // as a second cell and pay it a second full weight. Pair it with one missing parcel and the
  // weights cancel: one parcel owned twice, one owned by nobody, and a clean bill of health.
  const alias = [...uniform.slice(1), uniform[1]!.toUpperCase()];
  const result = checkTiling(alias, 8);
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /duplicate cell ids/);

  // A pure case change with no missing parcel is harmless and must still pass.
  const restyled = uniform.map((c, i) => (i % 3 === 0 ? c.toUpperCase() : c));
  assert.equal(checkTiling(restyled, 8).ok, true);
});

test("descendant weights account for pentagons, which do not have 7^k children", () => {
  const pentagon = getPentagons(0)[0]!;
  const hexagon = getRes0Cells().find((c) => !isPentagon(c))!;

  assert.deepEqual([1, 2, 3, 4].map((k) => descendantCount(pentagon, k)), [6, 41, 286, 2001]);
  assert.deepEqual([1, 2, 3, 4].map((k) => descendantCount(hexagon, k)), [7, 49, 343, 2401]);

  // The identity the whole invariant rests on: 110 * 7^8 + 12 * P(8) = 691,776,122.
  for (let res = 0; res <= 8; res++) {
    assert.equal(descendantCountOfSphere(res), cellCountAtResolution(res), `resolution ${res}`);
  }

  // Using 7^k uniformly is the mistake this exists to prevent: it overcounts by 1.67%.
  const naive = 122 * Math.pow(7, 8);
  assert.equal(naive, 703_305_722);
  assert.ok(naive / cellCountAtResolution(8) - 1 > 0.016);
});

test("the invariant catches a gap, an overlap and a duplicate", () => {
  const uniform = allAtRes(1);
  assert.equal(checkTiling(uniform, 8).ok, true);

  const gap = checkTiling(uniform.slice(1), 8);
  assert.equal(gap.ok, false);
  assert.match((gap as { reason: string }).reason, /^gap: /);

  // A parcel and the children it should have been replaced by, both present.
  const overlap = checkTiling([...uniform, ...cellToChildren(uniform[0]!, 2)], 8);
  assert.equal(overlap.ok, false);
  assert.match((overlap as { reason: string }).reason, /lies inside its ancestor/);

  const duplicate = checkTiling([...uniform, uniform[0]!], 8);
  assert.equal(duplicate.ok, false);
  assert.match((duplicate as { reason: string }).reason, /duplicate cell ids/);

  // A cell finer than the floor the weights are counted at. Every other call here passes 8, which
  // is finer than anything in these fixtures, so without this the guard is never exercised at all
  // and deleting it leaves the suite green.
  const tooFine = checkTiling([...uniform.slice(1), ...cellToChildren(uniform[0]!, 2)], 1);
  assert.equal(tooFine.ok, false);
  assert.match((tooFine as { reason: string }).reason, /finer than resolution 1/);

  // And at the planet's real floor, a parcel one level past it is refused rather than weighed.
  const pastFloor = checkTiling([...uniform.slice(1), ...cellToChildren(uniform[0]!, 8)], 7);
  assert.equal(pastFloor.ok, false);
  assert.match((pastFloor as { reason: string }).reason, /finer than resolution 7/);
});

test("the registry plus the reserved commons tiles the sphere with nothing left over", () => {
  for (const commonsRes of [1, 2, 3]) {
    const cover = [...seedInventory(commonsRes, commonsRes), ...getPentagons(commonsRes)];
    const result = checkTiling(cover, 8);
    assert.equal(result.ok, true, `commons at resolution ${commonsRes}: ${JSON.stringify(result)}`);
    assert.equal(cover.length, cellCountAtResolution(commonsRes));
  }

  // Inventory seeded finer than the commons still tiles, which is the mixed resolution case.
  const mixed = [...seedInventory(3, 1), ...getPentagons(1)];
  assert.equal(checkTiling(mixed, 8).ok, true);
  assert.equal(seedInventory(3, 1).length, 830 * 7 * 7);
});

test("seeding removes twelve whole lineages, not twelve cells", () => {
  const seeded = seedInventory(1, 1);
  assert.equal(seeded.length, 830);
  assert.ok(seeded.every((c) => !isPentagon(c)));

  // At the floor, reserving twelve pentagons at resolution 1 withholds 8,235,432 cells.
  const withheld = cellCountAtResolution(8) - seedInventory(1, 1).length * Math.pow(7, 7);
  assert.equal(withheld, 8_235_432);
  assert.equal(getPentagons(1).reduce((s, c) => s + descendantCount(c, 8), 0), withheld);
});
