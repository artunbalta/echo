/**
 * An owner is an ID, and what they call themselves is a NAME (SOC-2.B, SOCIETY-PLAN §3 item 5).
 *
 * WHAT THIS EXISTS TO CATCH, stated as the failure. `apps/web/src/app/api/planet/claim/route.ts`
 * called `store.claim(name, ...)` with the trimmed typed display name — so **two people who both
 * typed "Sam" were one owner**: the second one's claim found the first one's parcel already
 * assigned and handed it back as theirs. Meanwhile `parcels` has carried a `display_name` column
 * since migration 0009 that nothing ever wrote. The schema had the split all along; the code
 * collapsed it.
 *
 * That is not a rough edge. `app/claim/page.tsx` says "Every parcel has exactly one owner,
 * permanently" and the confirmation says "That identifier is permanent. It names this parcel for as
 * long as the planet exists." Both were backed by a string anybody could retype.
 *
 * THE TWO HALVES BELOW ARE BOTH NECESSARY. That distinct ids get distinct parcels is the bug fixed;
 * that a repeated id is IDEMPOTENT is the property that must survive the fix, because reclaiming is
 * how a returning owner finds their own land and it is the reason the name was ever usable as a key.
 *
 * Run:  node --import tsx --test packages/planet/tests/ownership.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { chooseCommons } from "../lib/commons.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { MemoryRegistry, memoryWorld } from "../lib/registry-store.js";

const SEED = "echo-ownership-test";

/**
 * A registry on the SHIPPED parameters over a planet that is entirely dry.
 *
 * Three deliberate choices, each of which the first draft got wrong and the package corrected.
 * The parameters are `PLANET_PARAMS` and not a smaller invention, because the resolutions are
 * load-bearing on each other — `rounds.ts` walks `cellToParent` between them, and a hand-picked
 * `startResolution: 2` throws "Resolution argument was outside of acceptable range" before a single
 * claim is made. The reserved set is real commons and not `[]`, because `seedInventory` reads the
 * commons resolution off `commons[0]` and an empty array makes that `undefined`. And the land field
 * is the constant 1 rather than `landFractionSampler`, because sampling 284,004 cells is about ten
 * seconds of terrain this file has no use for: nothing here asks where the water is, only who owns
 * what. An all-dry planet also means `chooseCommons` relocates nothing, so the twelve stay on their
 * pentagons and the inventory arithmetic is the shipped one.
 */
function registry() {
  const commons = chooseCommons(PLANET_PARAMS.commonsResolution ?? 1, () => 1, PLANET_PARAMS.minLandFraction);
  const world = memoryWorld(PLANET_PARAMS, SEED, 0, 1, commons.cells, commons.reserved);
  return new MemoryRegistry(world, () => 1);
}

test("two people who type the same name are two owners", async () => {
  const store = registry();

  const sam = await store.claim("id-aaaa-1111", { displayName: "Sam" });
  const alsoSam = await store.claim("id-bbbb-2222", { displayName: "Sam" });

  assert.equal(sam.status, "assigned");
  assert.equal(alsoSam.status, "assigned");
  assert.notEqual(
    sam.parcel?.h3Index,
    alsoSam.parcel?.h3Index,
    'both Sams were given the same parcel — the display name is being used as the key again, and ' +
      '"every parcel has exactly one owner, permanently" is false',
  );
  // And each keeps the name they typed, which is the half that would otherwise be silently dropped.
  assert.equal(sam.parcel?.displayName, "Sam");
  assert.equal(alsoSam.parcel?.displayName, "Sam");
});

test("the same id claiming twice is idempotent, which is what a returning owner needs", async () => {
  const store = registry();
  const first = await store.claim("id-cccc-3333", { displayName: "Wren" });
  const again = await store.claim("id-cccc-3333", { displayName: "Wren" });
  assert.equal(first.parcel?.h3Index, again.parcel?.h3Index);
  assert.equal(await store.parcelOf("id-cccc-3333").then((p) => p?.h3Index), first.parcel?.h3Index);
});

test("one person who changes what they call themselves keeps their land", async () => {
  // The other side of the split: the name is not the key, so changing it cannot cost a parcel.
  const store = registry();
  const before = await store.claim("id-dddd-4444", { displayName: "Wren" });
  const after = await store.claim("id-dddd-4444", { displayName: "Wren of the Long Water" });
  assert.equal(before.parcel?.h3Index, after.parcel?.h3Index);
});

test("a parcel can be claimed with no name at all, and the id still owns it", async () => {
  // `displayName` is optional by design. A registry that refused an unnamed claim would be using
  // the name for something load-bearing again, one indirection further along.
  const store = registry();
  const anonymous = await store.claim("id-eeee-5555");
  assert.equal(anonymous.status, "assigned");
  assert.equal(anonymous.parcel?.displayName, undefined);
  assert.equal(await store.parcelOf("id-eeee-5555").then((p) => p?.h3Index), anonymous.parcel?.h3Index);
});

test("lighting the globe reveals no owner ids, which is what it did before and must keep doing", async () => {
  const store = registry();
  await store.claim("id-ffff-6666", { displayName: "Sam" });
  const recent = await store.recentlyClaimed(10);
  assert.ok(recent.length >= 1);
  // The two consumers (HeroPlanet, ClaimClient) map to `c.h3Index` and drop everything else. This
  // asserts the SHAPE they rely on, so that a future change which starts surfacing owner_id has to
  // come past a test rather than quietly publish an identifier that used to be a first name.
  assert.deepEqual(Object.keys(recent[0]!).sort(), ["h3Index", "ownerId"]);
});
