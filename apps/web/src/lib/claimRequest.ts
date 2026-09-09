/**
 * What a claim request has to carry, taken apart from the route that receives it (SOC-2.B).
 *
 * THE BRANCH LIVES HERE RATHER THAN IN THE ROUTE, for the reason `game/world/parcelWorld.ts` gives
 * one level over: a test that writes its own branch is testing its own branch. The route calls this
 * and so does the test, so the decision is one piece of code with one behaviour — and this
 * particular decision is the one the product got wrong for as long as the claim page has existed.
 *
 * WHAT IT GOT WRONG. `route.ts` called `store.claim(name, ...)` with the trimmed typed display
 * name, so the NAME was the registry key: **two people who both typed "Sam" were one owner**, and
 * the second one's claim found the first one's parcel already assigned and handed it back as
 * theirs. Meanwhile `parcels` has carried a `display_name` column since migration 0009 that nothing
 * ever wrote. The schema had the split; the code collapsed it. The claim page says "Every parcel has
 * exactly one owner, permanently" and "That identifier is permanent" — both were backed by a string
 * anybody could retype.
 *
 * THE ID IS REQUIRED, NOT DEFAULTED, and the two tempting alternatives are both worse. Falling back
 * to the name keeps the bug alive for exactly the callers most likely to hit it. Minting an id on
 * the server hands out permanent ownership that no browser could ever prove again. So a request
 * without one is refused, in a sentence that tells a person what to do about it.
 *
 * THE NAME IS CHECKED FIRST, deliberately: someone who typed one letter should be told about the
 * letter, not about an identifier they have never heard of and did not know they were sending.
 *
 * Run:  cd apps/web && node --import tsx --test tests/claimOwner.test.mts
 */

/** The shape a claim body may arrive in. Everything optional, because it is over the wire. */
export interface ClaimBody {
  name?: unknown;
  ownerId?: unknown;
  referrer?: unknown;
}

export type ClaimRequest =
  | { ok: true; ownerId: string; displayName: string; referrer?: string }
  | { ok: false; error: string };

const trimmed = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function claimRequestFrom(body: ClaimBody): ClaimRequest {
  const displayName = trimmed(body.name);
  if (displayName.length < 2) {
    return { ok: false, error: "Enter a name of at least two characters." };
  }

  const ownerId = trimmed(body.ownerId);
  if (!ownerId) {
    return { ok: false, error: "This claim is missing its owner id. Reload the page and try again." };
  }

  const referrer = trimmed(body.referrer);
  return { ok: true, ownerId, displayName, referrer: referrer || undefined };
}
