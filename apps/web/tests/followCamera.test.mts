/**
 * The follow camera is a pure function, so its rules are proven here rather than by walking into a
 * hill and looking (plan W3-4).
 *
 * The terrain is synthetic and the walks are random, but the randomness is a linear congruential
 * generator seeded by hand: every run of this file walks exactly the same ten thousand walks, so
 * a failure is a failure you can reproduce, not a rumour.
 *
 * Run:  node --import tsx --test apps/web/tests/followCamera.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TILE_M } from "@echo/shared";

import {
  boomDirection,
  cameraForward,
  cameraRelativeMove,
  FOLLOW_CAMERA,
  initialFollowCamera,
  stepFollowCamera,
  type FollowCameraState,
  type FollowInput,
  type HeightAtTile,
  type Vec3,
} from "../src/game/world/followCamera";

// ── a deterministic source of chance ────────────────────────────────────────────

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A hilly heightfield over TILE coordinates, metres out: a few sines with phases drawn from the
 * generator, so every walk sees a different landscape. Amplitudes and wavelengths are chosen so
 * slopes reach about one in one, steep enough to catch a boom that ignores the ground and smooth
 * enough that half-metre sampling is honest (the curvature bound puts the ground within a few
 * centimetres of the chord between samples).
 */
function hills(next: () => number): HeightAtTile {
  const p = [next() * 7, next() * 7, next() * 7, next() * 7];
  return (tx, ty) => {
    const x = tx * TILE_M;
    const z = ty * TILE_M;
    return (
      5 * Math.sin(x * 0.35 + p[0]!) +
      4 * Math.sin(z * 0.27 + p[1]!) +
      3 * Math.sin((x - z) * 0.19 + p[2]!) +
      2 * Math.sin(x * 0.7 + z * 0.4 + p[3]!)
    );
  };
}

const NEAR = FOLLOW_CAMERA.nearM;
const FLOOR = FOLLOW_CAMERA.clearanceM + NEAR;
const STILL: FollowInput = { orbitDx: 0, orbitDy: 0, zoom: 0 };

const groundAt = (h: HeightAtTile, x: number, z: number) => h(x / TILE_M, z / TILE_M);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The two invariants, checked exactly: the lens keeps the full clearance, and every point of the
 * boom from the look target to the lens is at least the near plane above the ground, sampled every
 * ten centimetres, five times denser than the camera samples.
 */
function assertClear(h: HeightAtTile, position: Vec3, lookAt: Vec3, where: string) {
  const lensGround = groundAt(h, position[0], position[2]);
  assert.ok(
    position[1] >= lensGround + FLOOR - 1e-6,
    `${where}: lens at ${position[1].toFixed(3)} m, ground ${lensGround.toFixed(3)} m, needs ${FLOOR}`,
  );
  const len = dist(position, lookAt);
  const n = Math.max(2, Math.ceil(len / 0.1));
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = lookAt[0] + (position[0] - lookAt[0]) * s;
    const y = lookAt[1] + (position[1] - lookAt[1]) * s;
    const z = lookAt[2] + (position[2] - lookAt[2]) * s;
    const g = groundAt(h, x, z);
    assert.ok(y > g + NEAR - 1e-6, `${where}: boom at ${(s * len).toFixed(2)} m of ${len.toFixed(2)} is ${(y - g).toFixed(3)} m over the ground`);
  }
}

// ── the frame helpers ───────────────────────────────────────────────────────────

test("yaw 0 puts the camera south of the player looking north; W walks north, D walks east", () => {
  const [ux, uy, uz] = boomDirection(0, 0);
  assert.ok(Math.abs(ux) < 1e-12 && Math.abs(uy) < 1e-12 && uz > 0.999, "the boom points south");
  const [fx, fy] = cameraForward(0);
  assert.ok(Math.abs(fx) < 1e-12 && fy < -0.999, "the camera looks north");
  const w = cameraRelativeMove(0, 1, 0);
  assert.ok(Math.abs(w.dx) < 1e-12 && w.dy < -0.999, "W is north");
  const d = cameraRelativeMove(0, 0, 1);
  assert.ok(d.dx > 0.999 && Math.abs(d.dy) < 1e-12, "D is east");
});

test("with the camera north of the player looking south, W walks south and D walks west", () => {
  const w = cameraRelativeMove(Math.PI, 1, 0);
  assert.ok(Math.abs(w.dx) < 1e-12 && w.dy > 0.999, `W is south, got ${w.dx}, ${w.dy}`);
  const d = cameraRelativeMove(Math.PI, 0, 1);
  assert.ok(d.dx < -0.999 && Math.abs(d.dy) < 1e-12, `D is west, got ${d.dx}, ${d.dy}`);
  // The starting state is exactly this, so the first W walks the way a fresh mover faces.
  assert.equal(initialFollowCamera().yaw, Math.PI);
});

// ── the acceptance: ten thousand walks ──────────────────────────────────────────

test("over 10,000 random walks the camera is never below the ground along the boom, never closer than the near plane, never inside the player", () => {
  const next = lcg(0x5eed);
  let steps = 0;
  let collisions = 0;
  let lifts = 0;
  for (let walk = 0; walk < 10_000; walk++) {
    const h = hills(next);
    let state: FollowCameraState = {
      ...initialFollowCamera(),
      yaw: next() * Math.PI * 2,
      pitch: FOLLOW_CAMERA.pitchMin + next() * (FOLLOW_CAMERA.pitchMax - FOLLOW_CAMERA.pitchMin),
      distance: FOLLOW_CAMERA.minDistanceM + next() * (FOLLOW_CAMERA.maxDistanceM - FOLLOW_CAMERA.minDistanceM),
    };
    state = { ...state, boom: state.distance };
    let x = (next() - 0.5) * 60;
    let y = (next() - 0.5) * 60;
    const count = 4 + Math.floor(next() * 12);
    for (let i = 0; i < count; i++) {
      // A running player covers about 0.1 tiles a frame; the jump lifts up to 0.6 m.
      x += (next() - 0.5) * 0.3;
      y += (next() - 0.5) * 0.3;
      const liftM = next() < 0.2 ? next() * 0.6 : 0;
      const input: FollowInput = {
        orbitDx: next() < 0.5 ? (next() - 0.5) * 80 : 0,
        orbitDy: next() < 0.5 ? (next() - 0.5) * 40 : 0,
        zoom: next() < 0.2 ? (next() - 0.5) * 400 : 0,
      };
      const dt = 1 / 30 + next() * (1 / 30);
      const r = stepFollowCamera(state, { x, y, liftM }, input, dt, h);
      steps++;
      const where = `walk ${walk} step ${i}`;
      assertClear(h, r.position, r.lookAt, where);
      assert.ok(dist(r.position, r.lookAt) >= FOLLOW_CAMERA.minBoomM - 1e-6, `${where}: camera inside the player`);
      if (r.state.boom < r.state.distance - 1e-9) collisions++;
      if (r.state.lift > 0) lifts++;
      state = r.state;
    }
  }
  // The walks must actually have met hills, or the invariant was never tested.
  assert.ok(steps > 50_000, `${steps} steps`);
  assert.ok(collisions > steps / 20, `only ${collisions} of ${steps} steps shortened the boom: the terrain is too flat to prove anything`);
  assert.ok(lifts > 0, "no walk ever needed the pitch lift: the back-to-a-cliff case went untested");
});

// ── orbit ───────────────────────────────────────────────────────────────────────

test("orbiting 360 degrees keeps the look target on the player's chest and goes all the way round", () => {
  const h = hills(lcg(7));
  const tx = 3.2;
  const ty = -1.7;
  const chest: Vec3 = [tx * TILE_M, h(tx, ty) + FOLLOW_CAMERA.chestM, ty * TILE_M];
  let state = initialFollowCamera();
  const quadrants = new Set<number>();
  const perStep = (Math.PI * 2) / FOLLOW_CAMERA.orbitRadPerPx / 90; // pixels per step for a full turn in 90 steps
  for (let i = 0; i < 90; i++) {
    const r = stepFollowCamera(state, { x: tx, y: ty }, { orbitDx: perStep, orbitDy: 0, zoom: 0 }, 1 / 60, h);
    assert.ok(dist(r.lookAt, chest) < 1e-9, `step ${i}: look target drifted ${dist(r.lookAt, chest)} m from the chest`);
    assertClear(h, r.position, r.lookAt, `orbit step ${i}`);
    const a = Math.atan2(r.position[0] - chest[0], r.position[2] - chest[2]);
    quadrants.add(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4) % 4);
    state = r.state;
  }
  assert.equal(quadrants.size, 4, "the camera visited every quadrant around the player");
  assert.ok(Math.abs(Math.atan2(Math.sin(state.yaw - Math.PI), Math.cos(state.yaw - Math.PI))) < 1e-6, `yaw came back round to π, got ${state.yaw}`);
});

// ── the boom ────────────────────────────────────────────────────────────────────

test("the boom shortens when ground rises behind the player and lengthens again when it does not", () => {
  // Flat ground, and a hill that starts 4 m south of the origin and climbs at one in one.
  const wall: HeightAtTile = (_tx, ty) => Math.max(0, ty * TILE_M - 4);
  const opts = { pitch: 0.3 };
  let state: FollowCameraState = { ...initialFollowCamera(), yaw: 0, pitch: opts.pitch, distance: 8, boom: 8 };
  // Standing at the origin with the camera south: the wanted boom reaches 8 cos 0.3 = 7.6 m south,
  // where the hill is 3.6 m high while the boom is only 1.2 + 8 sin 0.3 = 3.6 m up. It must shorten.
  let r = stepFollowCamera(state, { x: 0, y: 0 }, STILL, 1 / 60, wall);
  assert.ok(r.state.boom < 8 - 0.5, `the boom shortened in one step: ${r.state.boom.toFixed(2)} m`);
  assertClear(wall, r.position, r.lookAt, "against the hill");
  const shortened = r.state.boom;
  state = r.state;

  // Walk north, away from the hill, ten tiles: nothing rises behind the player now.
  for (let i = 0; i < 240; i++) {
    r = stepFollowCamera(state, { x: 0, y: -10 }, STILL, 1 / 60, wall);
    assertClear(wall, r.position, r.lookAt, `walking away, step ${i}`);
    state = r.state;
  }
  assert.ok(state.boom > shortened, "the boom grew back");
  assert.ok(Math.abs(state.boom - 8) < 1e-3, `the boom returned to the wanted 8 m, got ${state.boom.toFixed(4)}`);
  assert.equal(state.distance, 8, "the wanted distance was never touched by collision");
});

test("the wheel zooms within bounds, and the boom follows a zoom in at once and a zoom out smoothly", () => {
  const flat: HeightAtTile = () => 0;
  let state = initialFollowCamera();
  let r = stepFollowCamera(state, { x: 0, y: 0 }, { ...STILL, zoom: -100_000 }, 1 / 60, flat);
  assert.equal(r.state.distance, FOLLOW_CAMERA.minDistanceM, "zooming in stops at the minimum");
  assert.equal(r.state.boom, r.state.distance, "the boom shortened with the zoom, at once");
  state = r.state;
  r = stepFollowCamera(state, { x: 0, y: 0 }, { ...STILL, zoom: 100_000 }, 1 / 60, flat);
  assert.equal(r.state.distance, FOLLOW_CAMERA.maxDistanceM, "zooming out stops at the maximum");
  assert.ok(r.state.boom < r.state.distance, "the boom lengthens over time rather than snapping");
  state = r.state;
  for (let i = 0; i < 300; i++) state = stepFollowCamera(state, { x: 0, y: 0 }, STILL, 1 / 60, flat).state;
  assert.ok(Math.abs(state.boom - FOLLOW_CAMERA.maxDistanceM) < 1e-3, `the boom got there: ${state.boom}`);
});

test("the anchor springs after a moving player and settles on the chest when they stop", () => {
  const flat: HeightAtTile = () => 0;
  let state = initialFollowCamera();
  let r = stepFollowCamera(state, { x: 0, y: 0 }, STILL, 1 / 60, flat);
  state = r.state;
  r = stepFollowCamera(state, { x: 5, y: 0 }, STILL, 1 / 60, flat);
  assert.ok(r.lookAt[0] > 0 && r.lookAt[0] < 5 * TILE_M, `the look target lags a teleport: ${r.lookAt[0]}`);
  state = r.state;
  for (let i = 0; i < 180; i++) state = stepFollowCamera(state, { x: 5, y: 0 }, STILL, 1 / 60, flat).state;
  assert.ok(Math.abs(state.anchor![0] - 5 * TILE_M) < 1e-6, "and settles on the chest");
  assert.ok(Math.abs(state.anchor![1] - FOLLOW_CAMERA.chestM) < 1e-9, "at chest height");
});
