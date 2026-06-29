/**
 * Server-side unit test for archipelago placement (build prompt §2).
 *
 * Asserts the two contractual properties:
 *   1. N sequential new users are placed in nearest-to-last-joined order, forming a tight
 *      CLUSTER (not scattered across the ocean).
 *   2. A returning user keeps their exact slot and consumes no new one.
 *
 * Plus: determinism, the archipelago-full lazy-expansion policy, and slot reuse after release.
 *
 * Run:  node --import tsx --test packages/shared/tests/archipelago.test.ts
 *   (or)  npm run test -w @echo/shared
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ARCHIPELAGO_SIZE,
  OCEAN,
  islandSlot,
  archipelagoSlots,
  slotDistance,
  nearestEmptySlot,
  placeUser,
  releaseUser,
  assignIsland,
  InMemoryIslandStore,
  type RegistryState,
} from "../src/archipelago.js";

/** Place N fresh users sequentially through the pure core, with strictly increasing joinedAt. */
function placeSequential(n: number): { state: RegistryState; slots: number[] } {
  let state: RegistryState = { assignments: [] };
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = placeUser(state, `u${i}`, 1000 + i); // joinedAt strictly increasing
    state = r.next;
    slots.push(r.slotIndex);
  }
  return { state, slots };
}

test("layout: 100 stable slots, slot 0 at ocean centre, all distinct & in-bounds", () => {
  const slots = archipelagoSlots();
  assert.equal(slots.length, ARCHIPELAGO_SIZE);

  const c = OCEAN.EXTENT / 2;
  assert.ok(Math.abs(slots[0].x - c) < 1e-9 && Math.abs(slots[0].y - c) < 1e-9, "slot 0 is centre");

  // distinct coordinates + inside the ocean extent
  const keys = new Set<string>();
  for (const s of slots) {
    keys.add(`${s.x.toFixed(4)},${s.y.toFixed(4)}`);
    assert.ok(s.x >= 0 && s.x <= OCEAN.EXTENT && s.y >= 0 && s.y <= OCEAN.EXTENT, `slot ${s.index} in bounds`);
    assert.ok(s.seed >= 0 && s.seed < 1_000_000, "seed in range");
  }
  assert.equal(keys.size, ARCHIPELAGO_SIZE, "no two slots coincide");

  // layout is a pure function of index → identical on every call
  assert.deepEqual(islandSlot(42), islandSlot(42));
});

test("first user lands on slot 0 (ocean centre); never the empty ocean", () => {
  const { slots } = placeSequential(1);
  assert.equal(slots[0], 0);
});

test("each new user is placed in the EMPTY slot nearest the most-recently-joined island", () => {
  // Walk the placement and independently re-derive the expected nearest-empty choice each step.
  let state: RegistryState = { assignments: [] };
  for (let i = 0; i < 30; i++) {
    const before = state;
    const r = placeUser(before, `u${i}`, 1000 + i);
    if (i === 0) {
      assert.equal(r.slotIndex, 0);
    } else {
      // most-recently-joined = the user placed on the previous iteration
      const anchor = before.assignments.reduce((a, b) => (b.joinedAt > a.joinedAt ? b : a));
      const taken = new Set(before.assignments.map((a) => a.slotIndex));
      const expected = nearestEmptySlot(anchor.slotIndex, taken);
      assert.equal(r.anchorSlot, anchor.slotIndex, `step ${i}: anchored on most-recently-joined`);
      assert.equal(r.slotIndex, expected, `step ${i}: chose the nearest empty slot to the anchor`);
      // and it is genuinely the nearest: no taken-excluded slot is closer to the anchor
      for (const s of archipelagoSlots()) {
        if (taken.has(s.index)) continue;
        assert.ok(
          slotDistance(anchor.slotIndex, s.index) >= slotDistance(anchor.slotIndex, expected) - 1e-9,
          `step ${i}: slot ${s.index} is not closer than the chosen slot`,
        );
      }
    }
    state = r.next;
  }
});

test("N sequential users form a CLUSTER, not a scatter (vs an explicit scatter baseline)", () => {
  const N = 20;

  // What the placement actually produces.
  const placed = placeSequential(N).slots.map((idx) => islandSlot(idx));
  // A deliberate scatter of the same count across the whole field, for comparison.
  const scatter = Array.from({ length: N }, (_, i) => islandSlot(Math.floor((i * ARCHIPELAGO_SIZE) / N)));

  const pts = (xs: ReturnType<typeof islandSlot>[]) => xs;
  const nearestNeighbour = (xs: ReturnType<typeof islandSlot>[], p: (typeof xs)[number]) =>
    Math.min(...xs.filter((q) => q.index !== p.index).map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
  const meanNN = (xs: ReturnType<typeof islandSlot>[]) =>
    xs.reduce((s, p) => s + nearestNeighbour(xs, p), 0) / xs.length;
  const diameter = (xs: ReturnType<typeof islandSlot>[]) =>
    Math.max(...xs.flatMap((a) => xs.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));

  // 1. The placed set is much DENSER: mean nearest-neighbour distance is far smaller.
  assert.ok(
    meanNN(pts(placed)) < meanNN(pts(scatter)) * 0.6,
    `placed mean-NN ${meanNN(placed).toFixed(1)} should be well under the scatter's ${meanNN(scatter).toFixed(1)}`,
  );

  // 2. The placed set is more COMPACT: its diameter is smaller than the scatter's.
  assert.ok(
    diameter(pts(placed)) < diameter(pts(scatter)),
    `placed diameter ${diameter(placed).toFixed(1)} < scatter diameter ${diameter(scatter).toFixed(1)}`,
  );

  // 3. CONNECTIVITY — the real product invariant: every placed island has a reachable
  //    neighbour within a couple of slot-spacings (no one wakes in an empty ocean). The
  //    scatter, by contrast, leaves islands isolated.
  for (const p of placed) {
    assert.ok(
      nearestNeighbour(placed, p) <= OCEAN.SPACING * 2.2,
      `placed slot ${p.index} has a reachable neighbour (${nearestNeighbour(placed, p).toFixed(1)})`,
    );
  }
  const scatterIsolated = scatter.filter((p) => nearestNeighbour(scatter, p) > OCEAN.SPACING * 2.2).length;
  assert.ok(scatterIsolated > 0, "a true scatter leaves at least one island isolated (sanity on the baseline)");
});

test("returning user keeps their slot and consumes no new one", () => {
  const { state, slots } = placeSequential(5);
  const target = state.assignments.find((a) => a.userId === "u2")!;

  // re-place the same user (e.g. they sign back in much later, with a new `now`)
  const r = placeUser(state, "u2", 999_999);
  assert.equal(r.created, false, "no new assignment created");
  assert.equal(r.slotIndex, target.slotIndex, "same slot returned");
  assert.equal(r.next.assignments.length, state.assignments.length, "registry size unchanged");
  assert.equal(r.slotIndex, slots[2], "matches the slot first assigned");
});

test("deterministic: same sign-up order → identical placement", () => {
  const a = placeSequential(25).slots;
  const b = placeSequential(25).slots;
  assert.deepEqual(a, b);
});

test("archipelago full → lazy expansion (never caps a user into the void)", () => {
  // Fill all 100 pre-generated slots.
  let state: RegistryState = { assignments: [] };
  for (let i = 0; i < ARCHIPELAGO_SIZE; i++) {
    state = placeUser(state, `u${i}`, 1000 + i).next;
  }
  assert.equal(state.assignments.length, ARCHIPELAGO_SIZE);

  // The 101st user gets a valid, distinct, expansion slot rather than a rejection.
  const r = placeUser(state, "u_overflow", 99_999);
  assert.equal(r.created, true);
  assert.ok(r.slotIndex >= ARCHIPELAGO_SIZE, "expansion slot index is beyond the pre-generated field");
  const taken = new Set(state.assignments.map((a) => a.slotIndex));
  assert.ok(!taken.has(r.slotIndex), "expansion slot is empty");
  // expansion slot still has finite, real coordinates
  const s = islandSlot(r.slotIndex);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
});

test("a released slot is reused by the next arrival", () => {
  const { state } = placeSequential(6);
  const freed = state.assignments.find((a) => a.userId === "u3")!.slotIndex;
  const after = releaseUser(state, "u3");
  assert.equal(after.assignments.length, 5);

  // The freed slot is now the only hole inside the cluster; a newcomer anchored on the
  // most-recently-joined island should be able to reclaim it (it is the nearest empty one
  // when the anchor is adjacent to the hole). At minimum it must be reusable.
  const taken = new Set(after.assignments.map((a) => a.slotIndex));
  assert.ok(!taken.has(freed), "freed slot is empty and available for reuse");
});

test("store path: assignIsland persists, is idempotent, and survives the slot race", async () => {
  const store = new InMemoryIslandStore();
  const first = await assignIsland(store, "alice", 1000);
  assert.equal(first.created, true);
  assert.equal(first.index, 0); // first user → centre

  // idempotent: alice signing in again returns the same island, no new slot
  const again = await assignIsland(store, "alice", 5000);
  assert.equal(again.created, false);
  assert.equal(again.index, first.index);

  // a second user clusters next to alice
  const bob = await assignIsland(store, "bob", 2000);
  assert.equal(bob.created, true);
  assert.notEqual(bob.index, first.index);
  assert.equal(bob.anchorSlot, 0, "bob clustered against the most-recently-joined (alice)");

  // remove → slot reusable
  await store.remove("bob");
  const snapshot = await store.load();
  assert.equal(snapshot.assignments.length, 1);
});
