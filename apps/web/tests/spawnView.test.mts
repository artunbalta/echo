/**
 * Which way a person is facing when they arrive (bug 2).
 *
 * The complaint was that you cannot see the sea. Measured, the water mesh was built, sized, placed
 * and coloured correctly and drawn on every frame, and the sea contributed 0 pixels of 1,024,000 to
 * the frame the game gives you on a parcel that is 45% ocean with its shore 226 m away. The cause
 * was the spawn: `initialMover`'s heading is PI / 2 and `initialFollowCamera`'s yaw is PI, so every
 * person on every parcel began looking south, and on both coastal routes the sea is north.
 *
 * This file is the node half of the guard. It proves the heading points at water and the framing
 * puts the horizon in the frame. The half it cannot be is the pixels, and those are in
 * tests/e2e/spawnSea.spec.ts, which renders the shipped frame and differences the water out of it.
 *
 * IT IS ALSO THE HALF THAT CANNOT SEE THE WIRING, and that was measured rather than assumed:
 * putting playerLayer.ts back to `initialMover(x, y)` and `initialFollowCamera(options.camera)`
 * leaves every test in this file green and turns two of the three in spawnSea.spec.ts red, at
 * "the sea is not in the frame a person is given" with 0 pixels of it. Neither file is enough.
 *
 * Run:  node --import tsx --test apps/web/tests/spawnView.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  createTangentPatch,
  createTerrain,
  isLand,
  spawnPointFor,
  type Calibration,
} from "@echo/planet";

import { cameraForward, initialFollowCamera, FOLLOW_CAMERA } from "../src/game/world/followCamera";
import { pitchForHorizon, SPAWN_HORIZON_MARGIN_DEG, spawnView, yawBehindHeading } from "../src/game/world/spawnView";

const SEED = "echo-capacity-1";
const CALIBRATION: Calibration = {
  seaLevel: -0.0061377801938361206,
  peakElevation: 0.42423146978750087,
  landFraction: 0.6,
};
const RADIUS_KM = 200;
const FOV = 50;
const field = createTerrain(SEED);

/** The demo, the beach cell beside it, and the ordinary parcel the plan's third route opens. */
const DEMO = "847b949ffffffff";
const BEACH = "847b959ffffffff";
const INLAND = "8482589ffffffff";

function viewFor(cell: string) {
  const patch = createTangentPatch(cell, RADIUS_KM);
  const spawn = spawnPointFor(cell, field, CALIBRATION, RADIUS_KM);
  assert.ok(spawn, `${cell} has no spawn`);
  return {
    patch,
    spawn,
    view: spawnView(patch, field, CALIBRATION.seaLevel, spawn.x, spawn.y, initialFollowCamera(), {
      fovDegrees: FOV,
      horizonMarginDeg: SPAWN_HORIZON_MARGIN_DEG,
    }),
  };
}

test("the heading a coastal spawn faces walks into the sea, and the one it used to face does not", () => {
  for (const cell of [DEMO, BEACH]) {
    const { patch, spawn, view } = viewFor(cell);
    assert.ok(view.seaDistanceM !== null, `${cell}: no sea found within sight of the spawn`);

    // Walk the heading, in the tile frame it is expressed in, and find where the ground goes wet.
    // The heading is (east, south) and the patch is (east, north), so the flip happens once here,
    // which is also the only place this file could get it wrong.
    const wetAlong = (heading: number, limitM: number): number | null => {
      for (let m = 1; m <= limitM; m++) {
        const x = spawn.x + Math.cos(heading) * m;
        const y = spawn.y - Math.sin(heading) * m;
        if (!isLand(field, CALIBRATION.seaLevel, patch.toDirection(x, y))) return m;
      }
      return null;
    };

    const ours = wetAlong(view.heading, 500);
    assert.ok(ours !== null, `${cell}: walking the spawn heading for 500 m never reaches water`);
    assert.ok(
      Math.abs(ours - view.seaDistanceM) < 12,
      `${cell}: the heading reaches water at ${ours} m and the view says the shore is at ${view.seaDistanceM!.toFixed(1)} m`,
    );

    // And the heading that shipped, PI / 2 south, does not: that is the bug, stated as a number,
    // and a test that could not tell the two headings apart would be no test at all.
    const shipped = wetAlong(Math.PI / 2, 500);
    assert.ok(
      shipped === null || shipped > ours * 2,
      `${cell}: south reaches water at ${shipped} m against ${ours} m, so this parcel cannot tell the headings apart`,
    );
  }
});

test("the camera sits behind the body and looks the way it faces, at the frame the follow camera uses", () => {
  // Against cameraForward itself rather than against a restatement of it. The one pair already
  // written down anchors the convention: a fresh mover faces south and the camera yaw is PI.
  // Compared as an angle, not as a number: atan2 returns -PI where the shipped constant is +PI and
  // they are the same direction, which is exactly the kind of thing a naive subtraction hides.
  const apart = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  assert.ok(apart(yawBehindHeading(Math.PI / 2), Math.PI) < 1e-12, "south no longer means a yaw of PI");
  for (let k = 0; k < 16; k++) {
    const heading = -Math.PI + (k / 16) * 2 * Math.PI;
    const [east, south] = cameraForward(yawBehindHeading(heading));
    assert.ok(Math.abs(east - Math.cos(heading)) < 1e-12, `heading ${heading}: camera looks ${east} east, body faces ${Math.cos(heading)}`);
    assert.ok(Math.abs(south - Math.sin(heading)) < 1e-12, `heading ${heading}: camera looks ${south} south, body faces ${Math.sin(heading)}`);
  }

  for (const cell of [DEMO, BEACH]) {
    const { view } = viewFor(cell);
    const [east, south] = cameraForward(view.camera.yaw);
    assert.ok(Math.abs(east - Math.cos(view.heading)) < 1e-12, `${cell}: the camera and the body disagree about east`);
    assert.ok(Math.abs(south - Math.sin(view.heading)) < 1e-12, `${cell}: the camera and the body disagree about south`);
  }
});

test("a coastal spawn has the horizon inside the frame, and an inland one is exactly what shipped", () => {
  const shipped = initialFollowCamera();
  const wanted = pitchForHorizon(FOV, SPAWN_HORIZON_MARGIN_DEG);

  for (const cell of [DEMO, BEACH]) {
    const { view } = viewFor(cell);
    // The frame's top edge is pitch - fov/2 below the horizontal and the scene's horizon is the
    // flat water plane at the eye's own level, so this is the sky in the first frame, in degrees.
    const skyDeg = FOV / 2 - (view.camera.pitch * 180) / Math.PI;
    assert.ok(skyDeg >= SPAWN_HORIZON_MARGIN_DEG - 1e-9, `${cell}: the horizon is ${skyDeg.toFixed(2)} degrees below the top of the frame`);
    assert.ok(view.camera.pitch <= shipped.pitch, `${cell}: the pitch was raised to ${view.camera.pitch}, not lowered`);
    assert.ok(view.camera.pitch >= FOLLOW_CAMERA.pitchMin && view.camera.pitch <= FOLLOW_CAMERA.pitchMax, `${cell}: the pitch is outside the range a drag can reach`);
    assert.ok(Math.abs(view.camera.pitch - wanted) < 1e-12, `${cell}: the pitch is ${view.camera.pitch}, not the framing's own ${wanted}`);
  }

  // 86.7% of assignable parcels have no sea within 1,600 m and 94.2% none within the fog. They get
  // the shipped first frame, unchanged, because turning someone toward an ocean 7 km away would be
  // pointing them at trees for a reason they can never discover.
  const { view } = viewFor(INLAND);
  assert.equal(view.seaDistanceM, null, `${INLAND} found a sea within sight, so it cannot stand for an inland parcel`);
  assert.equal(view.heading, Math.PI / 2, "an inland spawn no longer faces the way a fresh mover faces");
  assert.deepEqual(view.camera, shipped, "an inland spawn's camera is not the one initialFollowCamera returns");
  assert.equal(shipped.pitch, 0.42, "the shipped pitch moved, so the sentence above is stale");
});

test("the framing is arithmetic on the frame, not a number somebody liked", () => {
  // pitchForHorizon has one job: put the horizon that far below the top edge. Read it back out.
  for (const fov of [40, 50, 70]) {
    for (const margin of [0, 5, 9, 20]) {
      const pitch = pitchForHorizon(fov, margin);
      assert.ok(Math.abs(fov / 2 - (pitch * 180) / Math.PI - margin) < 1e-12, `fov ${fov}, margin ${margin}`);
    }
  }
  // And the shipped margin is worth having: at 0.42 the sky above the horizon was 0.94 degrees of
  // a 50 degree frame, which is why the sea could only ever be a strip under the top edge.
  assert.ok(SPAWN_HORIZON_MARGIN_DEG > 4, "the sky above the horizon is back to a sliver");
  assert.ok(pitchForHorizon(FOV, SPAWN_HORIZON_MARGIN_DEG) < initialFollowCamera().pitch, "the framing asks for a pitch the shipped camera already had");
});
