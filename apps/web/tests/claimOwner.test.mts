/**
 * The claim route keys on an ID and refuses to key on a name (SOC-2.B, SOCIETY-PLAN §3 item 5).
 *
 * WHERE THE BUG ACTUALLY WAS, which is why this file exists beside the registry's own tests.
 * `packages/planet` has always taken an `ownerId` and has had an unused `display_name` column since
 * migration 0009 — the contract was right. The route called `store.claim(name, ...)` with the
 * trimmed typed display name, so **two people who both typed "Sam" were one owner**: the second
 * one's claim found the first one's parcel already assigned and handed it back as theirs. A test
 * that drives the registry directly, with two ids, would have passed all along and caught nothing.
 * The defect lived in one argument at one call site, and this is that call site.
 *
 * WHY NOT DRIVE THE ROUTE ITSELF. It imports `next/server`, which refuses to load outside a server
 * component, so a node test cannot call `POST` at all. The branch therefore lives in
 * `lib/claimRequest.ts` and the route calls it — `game/world/parcelWorld.ts`'s `sliceOptionsFor` is
 * the same move for the same reason, and its header says it plainly: a test that writes its own
 * branch is testing its own branch.
 *
 * WHAT IS ASSERTED AND WHY IT IS THIS. The refusal is the whole guard: the tempting fix is to fall
 * back to the name when the id is missing, which keeps the bug alive for exactly the callers most
 * likely to hit it, and the alternative — minting an id server-side — hands out permanent ownership
 * no browser could ever prove again. Anyone reverting to `claim(name)` has to delete this to do it.
 *
 * The other half — that distinct ids get distinct parcels and the same id is idempotent — is
 * `packages/planet/tests/ownership.test.ts`, where the registry lives.
 *
 * Run:  cd apps/web && node --import tsx --test tests/claimOwner.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { claimRequestFrom } from "../src/lib/claimRequest";

test("a claim carrying only a name is refused, because the name is not who anybody is", () => {
  const claim = claimRequestFrom({ name: "Sam" });
  assert.equal(claim.ok, false);
  assert.match(
    claim.ok ? "" : claim.error,
    /owner id/i,
    "the refusal must say what is missing, in a sentence a person can act on",
  );
});

test("an empty or whitespace owner id is no owner id", () => {
  for (const ownerId of ["", "   ", "\t", "\n  "]) {
    assert.equal(claimRequestFrom({ name: "Sam", ownerId }).ok, false, `"${ownerId}" was accepted`);
  }
});

test("a non-string owner id is no owner id either, because this arrives over the wire", () => {
  for (const ownerId of [null, 7, true, {}, ["id"]]) {
    assert.equal(claimRequestFrom({ name: "Sam", ownerId }).ok, false, `${JSON.stringify(ownerId)} was accepted`);
  }
});

test("the name is still checked FIRST, and its message is still about the name", () => {
  // The id requirement must not swallow the older, friendlier validation: someone who typed one
  // letter should be told about the letter, not about an identifier they never knew they sent.
  const claim = claimRequestFrom({ name: "S", ownerId: "id-aaaa-1111" });
  assert.equal(claim.ok, false);
  assert.match(claim.ok ? "" : claim.error, /two characters/i);
  assert.doesNotMatch(claim.ok ? "" : claim.error, /owner id/i);

  const neither = claimRequestFrom({});
  assert.equal(neither.ok, false);
  assert.match(neither.ok ? "" : neither.error, /two characters/i);
});

test("a good claim keeps the two apart, and they are allowed to look nothing like each other", () => {
  const claim = claimRequestFrom({ name: "  Sam  ", ownerId: "  id-aaaa-1111  ", referrer: " 8482589ffffffff " });
  assert.deepEqual(claim, {
    ok: true,
    ownerId: "id-aaaa-1111",
    displayName: "Sam",
    referrer: "8482589ffffffff",
  });
});

test("two people who type the same name produce two different keys", () => {
  // The defect, stated as the test that would have caught it. Both claims are well formed and both
  // say "Sam"; what makes them two owners is the id, and nothing else in the request.
  const a = claimRequestFrom({ name: "Sam", ownerId: "id-aaaa-1111" });
  const b = claimRequestFrom({ name: "Sam", ownerId: "id-bbbb-2222" });
  assert.ok(a.ok && b.ok);
  assert.equal(a.displayName, b.displayName);
  assert.notEqual(a.ownerId, b.ownerId);
  // And neither key is the name — the exact substitution that was shipped.
  assert.notEqual(a.ownerId, a.displayName);
});

test("an absent referrer is absent, not an empty string", () => {
  const claim = claimRequestFrom({ name: "Sam", ownerId: "id-aaaa-1111", referrer: "   " });
  assert.ok(claim.ok);
  assert.equal(claim.referrer, undefined, "an empty referrer must not reach findAdjacentParcel");
});
