/**
 * Distance-based presence tiers (world-unify §2). The pure tier/alpha functions the client render
 * and the social gate share — so "social only at Tier 1 (CLOSE)" and the silhouette→sharp fade are
 * one source of truth. CLOSE must equal the server's interaction-open gate so the Flow-0 baseline
 * cannot leak (no social emission below CLOSE).
 *
 * Run:  node --import tsx --test packages/shared/tests/presence.test.ts  (or npm run test -w @echo/shared)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { WORLD, PRESENCE, presenceTier, presenceAlpha } from "../src/world.js";

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

test("an adjacent-slot neighbour (~6 tiles) is a DISTANT silhouette from your own island", () => {
  // cluster neighbours sit ~OCEAN.SPACING (6) tiles apart → seen as an anonymous horizon silhouette,
  // NOT yet resolved — exactly the cold-start "someone is out there" with no social leak.
  assert.equal(presenceTier(6), "distant");
});

test("social is enabled ONLY at CLOSE — every farther tier is non-social", () => {
  const socialEnabled = (d: number) => presenceTier(d) === "close";
  assert.ok(socialEnabled(PRESENCE.CLOSE));
  assert.ok(!socialEnabled(PRESENCE.CLOSE + 0.01)); // approaching: no social
  assert.ok(!socialEnabled(6)); // distant: no social
  assert.ok(!socialEnabled(50)); // over horizon: no social
});

test("presenceAlpha lerps silhouette→sharp with no pop, and culls beyond the horizon", () => {
  assert.equal(presenceAlpha(0), 1); // close = fully sharp
  assert.equal(presenceAlpha(PRESENCE.CLOSE), 1);
  const mid = presenceAlpha((PRESENCE.CLOSE + PRESENCE.APPROACH) / 2);
  assert.ok(mid > PRESENCE.SILHOUETTE_ALPHA && mid < 1, "fades through Tier 2");
  // monotonic non-increasing across the approach band (smooth, no pop)
  assert.ok(presenceAlpha(PRESENCE.CLOSE + 0.1) > presenceAlpha(PRESENCE.APPROACH - 0.1));
  assert.equal(presenceAlpha(PRESENCE.APPROACH + 0.01), PRESENCE.SILHOUETTE_ALPHA); // distant silhouette
  assert.equal(presenceAlpha(PRESENCE.HORIZON + 1), 0); // culled over the horizon
});
