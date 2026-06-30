/**
 * Distance-based presence tiers (world-unify §2 + Step-6 polish #5). The pure tier function the
 * client render and the social gate share — so the NAME gate ("named only at Tier 1 / CLOSE") and the
 * social gate ("social only at CLOSE") are one source of truth. CLOSE must equal the server's
 * interaction-open gate so the Flow-0 baseline cannot leak (no naming/social below CLOSE). Distant
 * players render SHARP + fully visible (#5) — distance hides identity, not visibility — so there is
 * no alpha/silhouette fade to test; only the tier partition + the close-only name/social gate.
 *
 * Run:  node --import tsx --test packages/shared/tests/presence.test.ts  (or npm run test -w @echo/shared)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { WORLD, PRESENCE, presenceTier } from "../src/world.js";

test("CLOSE is pinned to the server's interaction-open gate (the no-leak guarantee)", () => {
  assert.equal(PRESENCE.CLOSE, WORLD.INTERACTION_RADIUS + 0.5);
});

test("tiers partition distance: close → approaching → distant → over_horizon", () => {
  assert.equal(presenceTier(0), "close");
  assert.equal(presenceTier(PRESENCE.CLOSE), "close");
  assert.equal(presenceTier(PRESENCE.CLOSE + 0.01), "approaching");
  assert.equal(presenceTier(PRESENCE.APPROACH), "approaching");
  assert.equal(presenceTier(PRESENCE.APPROACH + 0.01), "distant");
  assert.equal(presenceTier(PRESENCE.HORIZON), "distant");
  assert.equal(presenceTier(PRESENCE.HORIZON + 0.01), "over_horizon");
});

test("an adjacent-slot neighbour (~6 tiles) is at the DISTANT tier — sharp+visible but anonymous", () => {
  // cluster neighbours sit ~OCEAN.SPACING (6) slot-tiles apart → seen as a clear person with NO name
  // yet and NO interaction — exactly the cold-start "someone is out there" with no social/name leak.
  assert.equal(presenceTier(6), "distant");
});

test("name + social are enabled ONLY at CLOSE — every farther tier is anonymous & non-social (#5)", () => {
  // The name gate and the social gate are the SAME predicate: presenceTier(d) === "close".
  const namedAndSocial = (d: number) => presenceTier(d) === "close";
  assert.ok(namedAndSocial(PRESENCE.CLOSE));
  assert.ok(!namedAndSocial(PRESENCE.CLOSE + 0.01)); // approaching: no name, no social
  assert.ok(!namedAndSocial(6)); // distant: visible+sharp, but no name, no social
  assert.ok(!namedAndSocial(50)); // over horizon: still rendered sharp, but no name, no social
});
