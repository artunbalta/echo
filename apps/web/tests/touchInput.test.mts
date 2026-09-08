/**
 * The phone's gestures, in node (DECISIONS C23).
 *
 * THIS IS THE HALF THAT CAN RUN HERE, and it is deliberately not the whole guard. What this file
 * can see is arithmetic over plain coordinates: what a separation change is worth in the wheel
 * pixels the follow camera spends, what a thumb's offset means as stick axes, and which finger owns
 * which part of a two-finger gesture. What it CANNOT see is whether input.ts routes a real
 * PointerEvent into these calls, whether the HUD's controls are reachable, or whether a phone can
 * open the inspector — every one of those needs a browser, and they belong to an e2e spec.
 *
 * It exists because input.ts had no test at all. controller.ts and followCamera.ts each carry one,
 * and both were testable for the same reason: the decisions live in a pure module and the impure
 * shell only feeds it. Touch was the moment that was worth fixing rather than working around, since
 * gesture state — pointer ids, latches, baselines — is the most stateful thing in the input path
 * and every failure in it would otherwise have shipped green.
 *
 * Run:  node --import tsx --test apps/web/tests/touchInput.test.mts
 */

import test from "node:test";
import assert from "node:assert/strict";

import { FOLLOW_CAMERA, cameraRelativeMove } from "../src/game/world/followCamera";
import {
  MOUSE,
  TOUCH,
  createTouchControls,
  drainGesture,
  gestureCancel,
  gestureDown,
  gestureMove,
  gestureUp,
  initialGesture,
  pinchZoomPx,
  runFrom,
  stickAxes,
  type GestureState,
} from "../src/game/world/touchInput";

/** A tiny driver, the way controller.test.mts folds many mover steps into one call. */
function pinch(from: GestureState, points: Array<[number, number, number]>): GestureState {
  let s = from;
  for (const [id, x, y] of points) s = gestureMove(s, { id, x, y }, TOUCH);
  return s;
}

const unit = (dx: number, dy: number) => {
  const len = Math.hypot(dx, dy);
  return len < 1e-12 ? [0, 0] : [dx / len, dy / len];
};

// ── the pinch, against the camera's own formula ─────────────────────────────────────────────────

test("a pinch moves the boom by exactly the ratio the fingers moved, through stepFollowCamera's own arithmetic", () => {
  // This is the assertion that makes the constant a fact rather than a copy: the wheel pixels are
  // spent the way followCamera spends them, `distance * zoomPerNotch^(zoom/100)`, and the answer
  // has to be the separation ratio. If either side is ever written down as a literal, this goes red.
  for (const zoomPerNotch of [FOLLOW_CAMERA.zoomPerNotch, 1.05, 1.4]) {
    for (const before of [40, 120, 380]) {
      for (const after of [30, 60, 200, 700]) {
        const zoom = pinchZoomPx(before, after, zoomPerNotch);
        const factor = Math.pow(zoomPerNotch, zoom / 100);
        assert.ok(
          Math.abs(factor - before / after) < 1e-12,
          `sep ${before}->${after} at ${zoomPerNotch}: boom scaled by ${factor}, fingers by ${before / after}`,
        );
      }
    }
  }
});

test("spreading the fingers zooms IN, which followCamera writes as a negative zoom", () => {
  assert.ok(pinchZoomPx(100, 200, FOLLOW_CAMERA.zoomPerNotch) < 0, "spread must be negative");
  assert.ok(pinchZoomPx(200, 100, FOLLOW_CAMERA.zoomPerNotch) > 0, "squeeze must be positive");
  assert.equal(pinchZoomPx(0, 100, FOLLOW_CAMERA.zoomPerNotch), 0, "a zero separation cannot be a ratio");
});

test("the whole 2.5-18 m boom range is inside two comfortable pinches", () => {
  const full = pinchZoomPx(FOLLOW_CAMERA.maxDistanceM, FOLLOW_CAMERA.minDistanceM, FOLLOW_CAMERA.zoomPerNotch);
  // The separation ratio a phone would have to travel to cross the entire range in one gesture.
  const ratio = Math.exp(Math.abs(full) / (100 / Math.log(FOLLOW_CAMERA.zoomPerNotch)));
  assert.ok(ratio > 5 && ratio < 10, `the range is a separation ratio of ${ratio.toFixed(2)}`);
});

// ── the stick ───────────────────────────────────────────────────────────────────────────────────

test("a thumb inside the dead zone is exactly neutral, and the magnitude has no step at its edge", () => {
  assert.deepEqual(stickAxes(0, 0), { forward: 0, right: 0, magnitude: 0 });
  assert.deepEqual(stickAxes(TOUCH.deadZonePx - 0.001, 0), { forward: 0, right: 0, magnitude: 0 });
  // Just outside: small, not sudden. A dead zone that clipped instead of remapping would jump to
  // 8/56 = 0.14 here, which is a visible lurch on the first pixel of thumb travel.
  const edge = stickAxes(TOUCH.deadZonePx + 0.5, 0);
  assert.ok(edge.magnitude > 0 && edge.magnitude < 0.02, `magnitude just past the dead zone is ${edge.magnitude}`);
  assert.equal(stickAxes(TOUCH.stickRadiusPx, 0).magnitude, 1);
  assert.equal(stickAxes(TOUCH.stickRadiusPx * 4, 0).magnitude, 1, "past full deflection is still full");
});

test("screen up is forward and screen right is right, which is the only sign in the file", () => {
  const up = stickAxes(0, -TOUCH.stickRadiusPx);
  assert.ok(Math.abs(up.forward - 1) < 1e-12 && Math.abs(up.right) < 1e-12, `up gave ${JSON.stringify(up)}`);
  const right = stickAxes(TOUCH.stickRadiusPx, 0);
  assert.ok(Math.abs(right.right - 1) < 1e-12 && Math.abs(right.forward) < 1e-12, `right gave ${JSON.stringify(right)}`);
});

test("a thumb is indistinguishable from a keyboard at the seam the mover actually reads", () => {
  // The contract playerLayer consumes is a direction in tile space. So the claim worth asserting is
  // not that the stick produces the same axes as WASD, it is that after cameraRelativeMove the two
  // point the same way — which is what stepMover normalises and walks along.
  const R = TOUCH.stickRadiusPx;
  const cases: Array<[string, number, number, number, number]> = [
    // name, stick dx, stick dy, keyboard forward, keyboard right
    ["W", 0, -R, 1, 0],
    ["S", 0, R, -1, 0],
    ["D", R, 0, 0, 1],
    ["A", -R, 0, 0, -1],
    ["WD", R, -R, 1, 1],
    ["WA", -R, -R, 1, -1],
    ["SD", R, R, -1, 1],
    ["SA", -R, R, -1, -1],
  ];
  for (const yaw of [0, Math.PI / 2, Math.PI, 2.3, -1.1]) {
    for (const [name, dx, dy, forward, right] of cases) {
      const stick = stickAxes(dx, dy);
      const fromThumb = cameraRelativeMove(yaw, stick.forward, stick.right);
      const fromKeys = cameraRelativeMove(yaw, forward, right);
      const [tx, ty] = unit(fromThumb.dx, fromThumb.dy);
      const [kx, ky] = unit(fromKeys.dx, fromKeys.dy);
      assert.ok(
        Math.abs(tx - kx) < 1e-12 && Math.abs(ty - ky) < 1e-12,
        `${name} at yaw ${yaw}: thumb (${tx}, ${ty}) vs keys (${kx}, ${ky})`,
      );
      assert.equal(stick.magnitude, 1, `${name} at full deflection must read as full`);
    }
  }
});

test("the run threshold has hysteresis, so a thumb resting on the rim cannot flicker the pose", () => {
  assert.equal(runFrom(false, TOUCH.runOn), true);
  assert.equal(runFrom(false, TOUCH.runOn - 0.01), false, "below the upper threshold a walk stays a walk");
  assert.equal(runFrom(true, TOUCH.runOff + 0.01), true, "inside the band a run stays a run");
  assert.equal(runFrom(true, TOUCH.runOff), false);
  // The property, not the two numbers: oscillating anywhere inside the band changes nothing.
  let run = true;
  let flips = 0;
  const mid = (TOUCH.runOn + TOUCH.runOff) / 2;
  for (let i = 0; i < 200; i++) {
    const next = runFrom(run, mid + Math.sin(i) * ((TOUCH.runOn - TOUCH.runOff) / 2 - 0.001));
    if (next !== run) flips++;
    run = next;
  }
  assert.equal(flips, 0, `a thumb inside the band flipped the run state ${flips} times`);
});

// ── two fingers ─────────────────────────────────────────────────────────────────────────────────

test("one finger looks, and its pixels arrive with the phone's gain and not the mouse's", () => {
  let s = gestureDown(initialGesture(), { id: 1, x: 100, y: 100 });
  s = gestureMove(s, { id: 1, x: 150, y: 130 }, TOUCH);
  const touch = drainGesture(s);
  assert.ok(Math.abs(touch.orbitDx - 50 * TOUCH.yawGain) < 1e-12, `yaw got ${touch.orbitDx}`);
  assert.ok(Math.abs(touch.orbitDy - 30 * TOUCH.pitchGain) < 1e-12, `pitch got ${touch.orbitDy}`);

  // The desktop path must be byte-identical to what it was before this module existed: a mouse
  // drag is its pixels, unscaled, and followCamera's orbitRadPerPx stays the only gain there is.
  let m = gestureDown(initialGesture(), { id: 9, x: 0, y: 0 });
  m = gestureMove(m, { id: 9, x: 50, y: 30 }, MOUSE);
  const mouse = drainGesture(m);
  assert.equal(mouse.orbitDx, 50);
  assert.equal(mouse.orbitDy, 30);
  assert.equal(mouse.zoom, 0);
});

test("a second finger neither steals the drag nor injects a jump when it leaves", () => {
  let s = gestureDown(initialGesture(), { id: 1, x: 100, y: 100 });
  s = gestureMove(s, { id: 1, x: 110, y: 100 }, TOUCH);
  const afterFirst = drainGesture(s);
  s = afterFirst.state;
  assert.ok(Math.abs(afterFirst.orbitDx - 10 * TOUCH.yawGain) < 1e-12);

  // The second finger arriving must move nothing by itself. Before C23 this overwrote the single
  // pointer slot, so the first finger's drag simply died with a finger still on the glass.
  s = gestureDown(s, { id: 2, x: 300, y: 100 });
  const arrival = drainGesture(s);
  s = arrival.state;
  assert.equal(arrival.orbitDx, 0, "a finger landing is not a drag");
  assert.equal(arrival.zoom, 0);

  // With two down, the pair looks with its CENTROID: one finger moving 20 px moves the midpoint 10.
  s = gestureMove(s, { id: 1, x: 130, y: 100 }, TOUCH);
  const paired = drainGesture(s);
  s = paired.state;
  assert.ok(
    Math.abs(paired.orbitDx - 10 * TOUCH.yawGain) < 1e-12,
    `two-finger orbit should be half the finger's travel, got ${paired.orbitDx}`,
  );

  // And the finger that survives keeps its own reference. This is the jump the old code would have
  // produced: 130 is 170 px from the departed finger's midpoint, and none of that may reach the yaw.
  s = gestureUp(s, 2);
  s = gestureMove(s, { id: 1, x: 140, y: 100 }, TOUCH);
  const alone = drainGesture(s);
  assert.ok(
    Math.abs(alone.orbitDx - 10 * TOUCH.yawGain) < 1e-12,
    `lifting the second finger injected ${alone.orbitDx} instead of ${10 * TOUCH.yawGain}`,
  );
});

test("the pinch spends its dead band once and rebases there, so the first zoom is not a jump", () => {
  let s = gestureDown(initialGesture(), { id: 1, x: 100, y: 100 });
  s = gestureDown(s, { id: 2, x: 300, y: 100 }); // separation 200
  assert.equal(s.pairSep, 200);
  assert.equal(s.pinching, false);

  // Inside the dead band: a two-thumb drag, not a pinch. Nothing is spent.
  s = pinch(s, [[1, 108, 100]]); // separation 192
  assert.equal(s.pinching, false);
  assert.equal(drainGesture(s).zoom, 0, "a wobble under pinchStartPx is not a zoom");

  // Crossing it arms the pinch AND rebases, so the 12 px of dead band are never charged as boom.
  s = pinch(s, [[1, 130, 100]]); // separation 170
  assert.equal(s.pinching, true);
  assert.equal(s.pairSep, 170);
  assert.equal(drainGesture(s).zoom, 0, "the crossing frame itself must not move the boom");

  // From here every pixel counts, and it counts as the ratio from the rebased separation.
  s = pinch(s, [[1, 150, 100]]); // separation 150
  const zoomed = drainGesture(s);
  assert.ok(
    Math.abs(zoomed.zoom - pinchZoomPx(170, 150, TOUCH.zoomPerNotch)) < 1e-12,
    `zoom was ${zoomed.zoom}`,
  );
  assert.ok(zoomed.zoom > 0, "fingers closing together zooms out");
});

test("fingers meeting do not blow the ratio up", () => {
  let s = gestureDown(initialGesture(), { id: 1, x: 100, y: 100 });
  s = gestureDown(s, { id: 2, x: 300, y: 100 });
  s = pinch(s, [[1, 290, 100]]); // separation 10, under pinchMinSepPx
  const drained = drainGesture(s);
  assert.equal(drained.zoom, 0, "a separation under the floor emits nothing");
  assert.equal(s.pinching, false);
});

test("a third finger is inert, an unknown id is a no-op, and cancel puts everything down", () => {
  let s = gestureDown(initialGesture(), { id: 1, x: 100, y: 100 });
  s = gestureDown(s, { id: 2, x: 300, y: 100 });
  s = gestureDown(s, { id: 3, x: 200, y: 400 });
  const before = drainGesture(s);
  s = before.state;
  s = gestureMove(s, { id: 3, x: 260, y: 460 }, TOUCH);
  const third = drainGesture(s);
  assert.equal(third.orbitDx, 0, "a palm resting on the glass must not turn the camera");
  assert.equal(third.zoom, 0);

  s = third.state;
  const unknown = gestureMove(s, { id: 77, x: 0, y: 0 }, TOUCH);
  assert.equal(unknown, s, "a pointer nobody remembers changes nothing");
  assert.equal(gestureUp(s, 77), s);

  const cancelled = gestureCancel(s);
  assert.equal(cancelled.fingers.length, 0);
  assert.equal(cancelled.pairSep, null);
  assert.equal(cancelled.pinching, false);
});

test("a drain leaves the fingers where they are and takes only the pixels", () => {
  let s = gestureDown(initialGesture(), { id: 1, x: 100, y: 100 });
  s = gestureMove(s, { id: 1, x: 120, y: 100 }, TOUCH);
  const first = drainGesture(s);
  assert.ok(first.orbitDx > 0);
  const second = drainGesture(first.state);
  assert.equal(second.orbitDx, 0, "a frame with no movement in it reads zero");
  assert.equal(first.state.fingers.length, 1, "draining is not lifting");
  // And the next movement is still measured from where the finger actually is.
  const moved = drainGesture(gestureMove(first.state, { id: 1, x: 130, y: 100 }, TOUCH));
  assert.ok(Math.abs(moved.orbitDx - 10 * TOUCH.yawGain) < 1e-12, `got ${moved.orbitDx}`);
});

// ── the HUD's handle ────────────────────────────────────────────────────────────────────────────

test("a jump that begins and ends between two frames still happens, exactly once", () => {
  const handle = createTouchControls();
  handle.pressJump();
  handle.releaseJump();
  // The whole tap fell between two reads. MoveInput.jump is "held or pressed this frame" and
  // stepMover latches the rising edge itself, so one guaranteed true frame is one jump.
  assert.equal(handle.read().jump, true, "a tap shorter than a frame must not be dropped");
  assert.equal(handle.read().jump, false, "and it must not be spent twice");
});

test("a held jump button is one jump, not a chain of them", () => {
  const handle = createTouchControls();
  handle.pressJump();
  assert.equal(handle.read().jump, true);
  assert.equal(handle.read().jump, true, "the button is still down, so the flag is still true");
  // stepMover is what refuses the second jump, and it refuses it on `jumpHeld`, which is why this
  // handle may report a held button honestly instead of inventing an edge of its own.
  handle.releaseJump();
  assert.equal(handle.read().jump, false);
});

test("the stick's demand is the axes and the run, and clearing it clears both", () => {
  const handle = createTouchControls();
  handle.setStick(stickAxes(0, -TOUCH.stickRadiusPx));
  let demand = handle.read();
  assert.ok(Math.abs(demand.forward - 1) < 1e-12);
  assert.equal(demand.run, true, "full deflection is a run");

  handle.setStick(stickAxes(0, -TOUCH.stickRadiusPx * TOUCH.runOff));
  assert.equal(handle.read().run, false, "backing off past the lower threshold ends the run");

  handle.clearStick();
  demand = handle.read();
  assert.deepEqual({ forward: demand.forward, right: demand.right, run: demand.run }, { forward: 0, right: 0, run: false });
});

test("clear() puts down a stick and a button that were held when the world was taken away", () => {
  // The same invariant input.ts keeps for keys on blur: a control still held when the input is
  // disabled would latch, and the player would walk off on their own with nothing on the glass.
  const handle = createTouchControls();
  handle.setStick(stickAxes(TOUCH.stickRadiusPx, 0));
  handle.pressJump();
  handle.clear();
  assert.deepEqual(handle.read(), { forward: 0, right: 0, run: false, jump: false });
});
