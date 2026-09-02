/**
 * Placing an arrival next to their referrer (section 7.2). Build order step 11.
 *
 * Two of these tests exist because the design document's own instructions do not survive contact
 * with a mixed resolution registry: normalising the referrer DOWN to the current round is
 * unbounded, and gridDistance throws near a pentagon, which on this planet is where the commons
 * are. Both are pinned here so the fix cannot quietly regress into the version in the document.
 *
 * Run:  node --import tsx --test packages/planet/tests/referral.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cellToChildren, cellToParent, getPentagons, getResolution, gridDisk, isPentagon } from "h3-js";

import { areAdjacent, findAdjacentParcel } from "../lib/referral.js";
import { seedInventory } from "../lib/rounds.js";

const base = seedInventory(1, 1);

/** A parcel at `resolution`, chosen without randomness so a failure is reproducible. */
function parcelAt(resolution: number, nth = 0): string {
  let cell = base[(nth * 137) % base.length]!;
  while (getResolution(cell) < resolution) {
    cell = cellToChildren(cell, getResolution(cell) + 1)[nth % 7]!;
  }
  return cell;
}

const first = (candidates: string[]) => candidates[0]!;

test("an arrival lands in the first ring when there is anything free there", () => {
  const referrer = parcelAt(4);
  const neighbours = new Set(gridDisk(referrer, 1).filter((c) => c !== referrer));

  const placement = findAdjacentParcel({
    referrerParcel: referrer,
    currentResolution: 4,
    isAvailable: (cell) => neighbours.has(cell),
    choose: first,
  });

  assert.equal(placement.placedAdjacent, true);
  assert.equal(placement.rings, 1);
  assert.equal(placement.decidedAtResolution, 4);
  assert.ok(neighbours.has(placement.cell!));
  assert.ok(areAdjacent(referrer, placement.cell!));
});

test("the search widens ring by ring, and gives up rather than wandering", () => {
  const referrer = parcelAt(4, 3);
  const ringTwo = new Set(gridDisk(referrer, 2).filter((c) => !gridDisk(referrer, 1).includes(c)));

  const found = findAdjacentParcel({
    referrerParcel: referrer,
    currentResolution: 4,
    isAvailable: (cell) => ringTwo.has(cell),
    choose: first,
  });
  assert.equal(found.rings, 2, "the first ring was empty, so it should have gone to the second");
  assert.ok(ringTwo.has(found.cell!));

  // Nothing free anywhere near: no parcel, and it says so rather than reaching further.
  const nothing = findAdjacentParcel({
    referrerParcel: referrer,
    currentResolution: 4,
    isAvailable: () => false,
    choose: first,
  });
  assert.equal(nothing.cell, null);
  assert.equal(nothing.placedAdjacent, false);
  assert.equal(nothing.rings, 0);
});

test("a coarser referrer is lifted, never expanded, so the cost stays bounded", () => {
  // Section 7.2 says to take cellToChildren when the referrer is coarser. At the shipped span that
  // is 343 cells; at the span the document proposes it is 823,543 and there is no way to choose
  // among them. Adjacency is decided at the coarser resolution instead.
  const referrer = parcelAt(4, 7);
  const anchor = referrer;
  const disk = new Set(gridDisk(anchor, 1));

  const placement = findAdjacentParcel({
    referrerParcel: referrer,
    currentResolution: 7,
    isAvailable: (cell) => disk.has(cellToParent(cell, 4)) && cellToParent(cell, 4) !== referrer,
    choose: first,
  });

  assert.equal(placement.placedAdjacent, true);
  assert.equal(placement.decidedAtResolution, 4, "adjacency must be decided at the coarser end");
  assert.equal(getResolution(placement.cell!), 7, "but the parcel issued is at the current round");
  assert.ok(areAdjacent(referrer, placement.cell!));

  // Bounded: six new cells in ring 1, each with 343 descendants at resolution 7.
  assert.ok(placement.examined <= 7 * 343, `examined ${placement.examined} cells`);

  // And the budget is a real stop, not decoration.
  const capped = findAdjacentParcel({
    referrerParcel: referrer,
    currentResolution: 7,
    isAvailable: () => false,
    choose: first,
    budget: 500,
  });
  assert.equal(capped.cell, null);
  assert.ok(capped.examined <= 500 + 343, `examined ${capped.examined} past a budget of 500`);
});

test("a finer referrer is lifted too, and adjacency is symmetric across resolutions", () => {
  const coarse = parcelAt(4, 11);
  const fine = cellToChildren(coarse, 7)[0]!;

  // A parcel and its own descendant are adjacent: one contains the other.
  assert.equal(areAdjacent(coarse, fine), true);
  assert.equal(areAdjacent(fine, coarse), true);

  const neighbour = gridDisk(coarse, 1).find((c) => c !== coarse)!;
  assert.equal(areAdjacent(fine, neighbour), true, "a descendant inherits its parent's neighbours");
  assert.equal(areAdjacent(neighbour, fine), true);

  const faraway = gridDisk(coarse, 6).find((c) => !gridDisk(coarse, 2).includes(c))!;
  assert.equal(areAdjacent(coarse, faraway), false);
});

test("it works at a pentagon, where gridDistance throws and gridDisk simply returns fewer cells", () => {
  // The twelve commons ARE the pentagons, so the cells around them are exactly where referrals will
  // cluster. Anything built on gridDistance fails here; this must not.
  for (const pentagon of getPentagons(4).slice(0, 6)) {
    const neighbours = gridDisk(pentagon, 1).filter((c) => c !== pentagon);
    assert.equal(neighbours.length, 5, "a pentagon has five neighbours, not six");

    const placement = findAdjacentParcel({
      referrerParcel: pentagon,
      currentResolution: 4,
      isAvailable: (cell) => neighbours.includes(cell),
      choose: first,
    });
    assert.equal(placement.placedAdjacent, true);
    assert.ok(neighbours.includes(placement.cell!));

    // And from the other side: a neighbour of a pentagon referring someone.
    const neighbour = neighbours[0]!;
    assert.ok(!isPentagon(neighbour));
    const back = findAdjacentParcel({
      referrerParcel: neighbour,
      currentResolution: 4,
      isAvailable: (cell) => cell === pentagon,
      choose: first,
    });
    assert.equal(back.cell, pentagon);
  }
});

test("the referrer's own parcel is never handed to the person they referred", () => {
  const referrer = parcelAt(4, 5);
  const everything = new Set(gridDisk(referrer, 3));

  const placement = findAdjacentParcel({
    referrerParcel: referrer,
    currentResolution: 4,
    isAvailable: (cell) => everything.has(cell),
    choose: (candidates) => {
      assert.ok(!candidates.includes(referrer), "the referrer's own parcel was offered");
      return candidates[0]!;
    },
  });
  assert.notEqual(placement.cell, referrer);
});
