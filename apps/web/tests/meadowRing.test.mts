/**
 * The meadow ring is built at least as far as its own shader draws (SOC-1.B).
 *
 * WHAT THIS FILE IS FOR, stated as the failure it exists to catch. meadowLayer keeps a square of
 * (2 * RADIUS + 1) patches of SIZE metres around the player, and its fragment shader dissolves a
 * blade to nothing between MEADOW_FADE_NEAR_M and MEADOW_FADE_FAR_M of the player's feet. Those two
 * numbers were set in different places and neither knew about the other: RADIUS was a module-private
 * TypeScript constant, the fade window was a pair of float literals inside a string spliced into
 * GLSL in onBeforeCompile. SOCIETY-PLAN SOC-1.B and DECISIONS C23 both ask for the ring to be
 * "pulled to the fade distance" for free triangles, and BOTH ARE WRONG: RADIUS * SIZE is 24 m and
 * the far stop is 24 m, so there is nothing to pull. Taking that instruction literally — RADIUS 3 to
 * 2 — leaves a 16 m ring under a 24 m fade, and the 16 to 17 m band is before smoothstep even opens,
 * so the grass ends at a hard circle sweeping the ground at full opacity as the player walks. That
 * is the change this file exists to fail.
 *
 * SO THE ASSERTION IS TWO-SIDED, and the halves come from different places. The lower half — the
 * ring may not be shorter than the fade — is measured against the ring's WORST case and not its
 * typical one: the player stands at some offset u in [0, SIZE) inside its own patch, the built span
 * reaches RADIUS * SIZE + u one way and (RADIUS + 1) * SIZE - u the other, and the smaller of those
 * is RADIUS * SIZE at u = 0 and again as u -> SIZE. The upper half — the ring may not be a whole
 * rank longer than the fade — is measured against SIZE, because SIZE is the grid's own quantum and
 * slack past it is a full rank of patches built, uploaded and submitted for the shader to discard.
 *
 * AND THE NUMBERS THIS FILE READS ARE THE NUMBERS THE GPU GETS. MEADOW_FADE_GLSL is the exact string
 * onBeforeCompile splices into the fragment shader, and the second test parses the two floats back
 * out of it, so a literal edited in the shader and not in the constant fails here rather than
 * passing quietly.
 *
 * WHAT IT DOES NOT PROVE. It says nothing about how many blades survive buildPatch's biome, height
 * and walkable filters — 49 * 1300 = 63,700 is the ALLOCATION CEILING and not a census, which is
 * what SOC-1.B's word "places" overstated — and nothing about whether a blade is in the right place;
 * livingWorld.test.mts owns the layer's seeding. It pins one relationship, between how far the layer
 * builds and how far it draws, which is the relationship no test could reach before the constants
 * were exported.
 *
 * Run:  node --import tsx --test apps/web/tests/meadowRing.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BLADES,
  MEADOW_FADE_FAR_M,
  MEADOW_FADE_GLSL,
  MEADOW_FADE_NEAR_M,
  MEADOW_RING_M,
  RADIUS,
  SIZE,
} from "../src/game/world/meadowLayer";

const PATCHES = (2 * RADIUS + 1) ** 2;

test("the meadow ring reaches at least as far as its own shader draws, and not a whole patch further", () => {
  assert.ok(
    MEADOW_RING_M >= MEADOW_FADE_FAR_M,
    `the ring guarantees ${MEADOW_RING_M} m (RADIUS ${RADIUS} x SIZE ${SIZE} m, worst case over where the player ` +
      `stands inside its own patch) while the shader still draws to ${MEADOW_FADE_FAR_M} m, so there is a ` +
      `${(MEADOW_FADE_FAR_M - MEADOW_RING_M).toFixed(1)} m annulus with no blades in it, the inner ` +
      `${Math.max(0, MEADOW_FADE_NEAR_M - MEADOW_RING_M).toFixed(1)} m of it before smoothstep has even opened and ` +
      `therefore at full opacity. Trimming RADIUS is only free while MEADOW_FADE_FAR_M comes down with it.`,
  );
  // The other side: the ring is not free either, and this is the assertion that says so, so a future
  // edit cannot satisfy the bound above by growing RADIUS. One SIZE is the grid's quantum; slack past
  // it is a whole rank of patches every fragment of which discards.
  assert.ok(
    MEADOW_RING_M - MEADOW_FADE_FAR_M < SIZE,
    `the ring guarantees ${MEADOW_RING_M} m against a ${MEADOW_FADE_FAR_M} m fade, ` +
      `${(MEADOW_RING_M - MEADOW_FADE_FAR_M).toFixed(1)} m of slack on a ${SIZE} m grid, so at least one whole rank ` +
      `of the ${PATCHES} patches is built, uploaded and submitted purely for the shader to throw away`,
  );
});

test("the fade the test reads is the fade the shader is compiled with", () => {
  const parsed = /^smoothstep\(([\d.]+), ([\d.]+), vMeadowDistance\)$/.exec(MEADOW_FADE_GLSL);
  assert.ok(parsed, `MEADOW_FADE_GLSL is not the smoothstep the shader splices in: ${MEADOW_FADE_GLSL}`);
  assert.equal(Number(parsed[1]), MEADOW_FADE_NEAR_M);
  assert.equal(Number(parsed[2]), MEADOW_FADE_FAR_M);
  // GLSL needs a decimal point on a float literal, and `24` compiles as an int in `smoothstep`.
  assert.ok(parsed[1].includes("."), "the near stop must be a GLSL float literal");
  assert.ok(parsed[2].includes("."), "the far stop must be a GLSL float literal");
});

test("42% of the square ring is outside the disc it exists to fill, and that part is structural", () => {
  // SOC-1.B recorded this as a triangle win with no fidelity cost. It is not a win: the number is
  // the disc-in-square overhead of covering a circle with a grid of squares, so removing it means
  // changing either the fade distance or the grid, and neither is free. Recorded here rather than
  // in prose because the plan's version of it went unmeasured for a whole planning cycle.
  const ringSpanM = (2 * RADIUS + 1) * SIZE;
  const outside = 1 - (Math.PI * MEADOW_FADE_FAR_M ** 2) / ringSpanM ** 2;
  assert.ok(Math.abs(outside - 0.423) < 0.001, `disc-in-square overhead is ${(outside * 100).toFixed(2)}%`);
  console.log(
    `  meadow ring ${MEADOW_RING_M} m (RADIUS ${RADIUS} x SIZE ${SIZE} m) vs fade ${MEADOW_FADE_NEAR_M}-` +
      `${MEADOW_FADE_FAR_M} m, ${PATCHES} patches x ${BLADES} = ${PATCHES * BLADES} blade slots, ` +
      `${PATCHES * BLADES * 6} triangles, ${(outside * 100).toFixed(2)}% of the square outside the disc`,
  );
});
