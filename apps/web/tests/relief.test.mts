/**
 * What DECISIONS C1 left standing, and the one thing it could have broken silently.
 *
 * Raising `heightScaleM` from 900 to 2,700 was measured against everything that had been tuned
 * against 900, and all of it held: the fog band, because no ground pixel in either shipped route's
 * frame is more than 70 m from the lens and the near is 150; the follow camera, because its boom
 * never collides at the pitch it starts at; the walk speed, because the mover is planar; the prop
 * colliders, because they are true metres on the prop and not on the ground.
 *
 * The shadow box is the one that could have gone the other way without anyone noticing. It is a
 * 240 m window that follows the player, and what falls out of it does not error or flicker: it
 * simply stops casting, so a hill throws no shadow at dusk and the frame looks like a frame with
 * fewer shadows in it. That is exactly the kind of loss a green build is compatible with, so it
 * gets an assertion instead of a paragraph.
 *
 * Renderer-free: the sun's direction is arithmetic on a `THREE.Vector3` and the tallest prop is
 * arithmetic on a `BufferGeometry`, and neither asks for a context.
 *
 * Run:  node --import tsx --test apps/web/tests/relief.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as THREE from "three";
import { DEFAULT_REGION_OPTIONS, DEFAULT_SCENE_OPTIONS, DEFAULT_DETAIL, ASSET_CLASSES } from "@echo/planet";

import { DEFAULT_SHADOW_HALF_M } from "../src/game/world/terrainChunks";
import { DUSK, KEY_DISTANCE_M, skyState } from "../src/game/world/skyLayer";
import { SCATTER_GEOMETRY, hasScatterGeometry } from "../src/game/world/scatterGeometry";

/**
 * The worst rise of the ground inside a 240 m box, in metres, at the shipped height scale.
 *
 * Measured, not assumed: 2,400 box centres spread over 40 assignable land parcels, each asking the
 * shipped height function for the largest height difference between the centre and its own box
 * edge. At heightScaleM 900 the same measurement gives 19.5 m, so this is the number the height
 * scale actually moved, and the assertion below is what says 120 m still covers it.
 */
const WORST_RISE_IN_BOX_M = 58.5;

/** The same measurement at the old height scale, so the test states what changed. */
const WORST_RISE_IN_BOX_AT_900_M = 19.5;

/** The reach of the largest form the scatter can put in the box, from its own instance origin. */
function tallestCasterM(): number {
  let tallest = 0;
  for (const cls of ASSET_CLASSES) {
    if (!hasScatterGeometry(cls.id)) continue;
    const geometry = SCATTER_GEOMETRY[cls.id]!();
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!;
    // A rotation about y preserves a length, so the reach survives the instance's own rotation.
    const reach = (sphere.center.length() + sphere.radius) * cls.scale[1];
    if (reach > tallest) tallest = reach;
    geometry.dispose();
  }
  return tallest;
}

test("C1: the shadow box still holds the ground under the player, three times taller", () => {
  const sun = skyState(DUSK).keyFrom;
  const elevation = Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1));
  assert.ok(elevation > 0.2 && elevation < 0.35, `the dusk key is at ${(elevation * 180) / Math.PI} degrees, not sixteen`);

  const half = DEFAULT_SHADOW_HALF_M;
  const caster = tallestCasterM();

  // The ortho box's vertical axis is world up tilted into the light, so a point `rise` above the
  // box centre and `d` along the light's own horizontal direction lands at
  // `rise * cos(e) + d * sin(e)`, and `d` is at most the half. Fitting is therefore
  //     half >= (rise + caster) * cos(e) + half * sin(e).
  const fits = (rise: number) => (rise + caster) * Math.cos(elevation) + half * Math.sin(elevation);

  const used = fits(WORST_RISE_IN_BOX_M);
  assert.ok(
    used <= half,
    `at the shipped height scale the worst measured ground rise puts ${used.toFixed(1)} m into a ` +
      `${half} m box; raise shadowHalfM or explain why the measurement moved`,
  );
  // Not a comfortable fit, and the test says so out loud rather than passing quietly: the margin
  // fell from 44 m to 9 m when the height scale tripled, and the next thing that eats it, a taller
  // prop class or a lower sun, must fail here rather than in a screenshot nobody takes.
  const margin = half - used;
  const marginAt900 = half - fits(WORST_RISE_IN_BOX_AT_900_M);
  console.log(
    `C1 shadow box: sun ${((elevation * 180) / Math.PI).toFixed(1)} deg, tallest caster ` +
      `${caster.toFixed(2)} m, margin ${marginAt900.toFixed(1)} m at 900 and ${margin.toFixed(1)} m at ` +
      `${DEFAULT_SCENE_OPTIONS.heightScaleM}`,
  );
  assert.ok(margin > 5, `only ${margin.toFixed(1)} m of the shadow box is spare`);
  assert.ok(marginAt900 > margin, "the height scale is supposed to have eaten margin, not made it");

  // The near plane is not the binding constraint and the comment in terrainChunks says so; this is
  // the arithmetic behind that claim, so a shorter KEY_DISTANCE_M cannot quietly make it false.
  const riseToReachTheLight = KEY_DISTANCE_M / Math.sin(elevation);
  assert.ok(
    riseToReachTheLight > 10 * WORST_RISE_IN_BOX_M,
    `ground would only have to rise ${riseToReachTheLight.toFixed(0)} m to reach the light itself`,
  );
});

test("C1 and C2: one height scale and one lattice, read from the frame and never passed in", () => {
  // The region builder and the world host must agree, or the mesh is a surface the height function
  // does not describe and every prop on it floats. They agree by DEFAULT_REGION_OPTIONS taking its
  // scale from DEFAULT_SCENE_OPTIONS rather than by two people writing 2700 twice.
  assert.equal(DEFAULT_REGION_OPTIONS.heightScaleM, DEFAULT_SCENE_OPTIONS.heightScaleM);
  assert.equal(DEFAULT_SCENE_OPTIONS.heightScaleM, 2700);

  // C2's displacement is defined on the mesh's lattice, so its finest octave has to be drawable on
  // it. Anything finer is dropped by createSceneHeight, which is correct but is not what shipping
  // four octaves is supposed to mean.
  const finest = DEFAULT_DETAIL.coarsestM / Math.pow(2, DEFAULT_DETAIL.octaves - 1);
  assert.ok(
    finest >= DEFAULT_REGION_OPTIONS.resolution * 2,
    `the finest octave is ${finest} m on a ${DEFAULT_REGION_OPTIONS.resolution} m lattice, so it is dropped, not drawn`,
  );
});
