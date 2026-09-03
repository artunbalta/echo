/**
 * The mover is a pure function, so it is proven here rather than by walking (plan W3-2).
 *
 * Run:  node --import tsx --test apps/web/tests/controller.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TILE_M, WORLD } from "@echo/shared";

import {
  facingFromHeading,
  initialMover,
  jumpHeightM,
  localMToTile,
  MOVER,
  nextState,
  stepMover,
  tileToLocalM,
  type MoveInput,
  type MoverState,
} from "../src/game/world/controller";

const open = () => true;
const idle: MoveInput = { dx: 0, dy: 0, run: false, jump: false, activity: null };
const east: MoveInput = { ...idle, dx: 1 };

function run(
  s: MoverState,
  input: MoveInput,
  seconds: number,
  walkable: (x: number, y: number) => boolean = open,
  dt = 1 / 60,
): MoverState {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) s = stepMover(s, input, dt, walkable);
  return s;
}

test("the state table: activity beats jump beats locomotion; a turn needs a big heading change", () => {
  assert.equal(nextState({ moving: false, running: false, jumping: false, activity: null, turned: 0 }), "idle");
  assert.equal(nextState({ moving: true, running: false, jumping: false, activity: null, turned: 0 }), "walk");
  assert.equal(nextState({ moving: true, running: true, jumping: false, activity: null, turned: 0 }), "run");
  assert.equal(nextState({ moving: true, running: true, jumping: true, activity: null, turned: 0 }), "jump");
  assert.equal(nextState({ moving: true, running: true, jumping: true, activity: "dig", turned: 0 }), "activity");
  assert.equal(nextState({ moving: false, running: false, jumping: false, activity: null, turned: 1.2 }), "turn");
  assert.equal(nextState({ moving: false, running: false, jumping: false, activity: null, turned: 0.2 }), "idle");
});

test("walking east for five seconds covers about MOVE_SPEED tiles per second, minus the ramp", () => {
  const s = run(initialMover(0, 0), east, 5);
  const expected = WORLD.MOVE_SPEED * 5;
  assert.ok(s.x > expected - 2 && s.x <= expected, `walked ${s.x} tiles`);
  assert.ok(Math.abs(s.y) < 1e-9);
  assert.equal(s.state, "walk");
  assert.equal(s.facing, "right");
  assert.ok(Math.abs(s.heading) < 1e-6);
});

test("running is faster than walking, and the run is flagged as a different regime by MOVER.RUN", () => {
  const walk = run(initialMover(0, 0), east, 3).x;
  const sprint = run(initialMover(0, 0), { ...east, run: true }, 3).x;
  assert.ok(sprint > walk * 1.3, `run ${sprint} vs walk ${walk}`);
  assert.equal(MOVER.RUN, WORLD.MOVE_SPEED * 1.6);
});

test("a wall stops the blocked axis and lets the other slide, on both axes", () => {
  const wallEast = (x: number) => x < 5;
  let s = run(initialMover(0, 0), { ...idle, dx: 1, dy: 1 }, 4, wallEast);
  assert.ok(s.x < 5, `crossed the wall to ${s.x}`);
  assert.ok(s.x > 4.5, `stopped short of the wall at ${s.x}`);
  assert.ok(s.y > 8, `did not slide south, y = ${s.y}`);
  assert.equal(s.vx, 0);
  const wallSouth = (_x: number, y: number) => y < 5;
  s = run(initialMover(0, 0), { ...idle, dx: 1, dy: 1 }, 4, wallSouth);
  assert.ok(s.y < 5 && s.y > 4.5, `y ${s.y}`);
  assert.ok(s.x > 8, `did not slide east, x = ${s.x}`);
  assert.equal(s.vy, 0);
});

test("the position never leaves walkable ground in an arena that actually bites", () => {
  // A deterministic pseudo-random stream; no Math.random in a test that must reproduce.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // A small circular region with a wall across it: a body that holds each input for a second
  // reaches the edge and the wall many times over ten thousand steps.
  const R = 12;
  const walkable = (x: number, y: number) => Math.hypot(x, y) < R && !(x > 1 && x < 2 && Math.abs(y) < 8);
  let s = initialMover(-4, 0);
  let refusedX = 0;
  let refusedY = 0;
  let nearEdge = 0;
  let input: MoveInput = idle;
  for (let i = 0; i < 10_000; i++) {
    if (i % 60 === 0) input = { dx: rnd() * 2 - 1, dy: rnd() * 2 - 1, run: rnd() > 0.5, jump: rnd() > 0.9, activity: null };
    const before = s;
    s = stepMover(s, input, 1 / 60, walkable);
    assert.ok(walkable(s.x, s.y), `left walkable ground at (${s.x}, ${s.y}) on step ${i}`);
    // A refusal is a velocity that was zeroed while the input still asked for movement.
    if (Math.abs(input.dx) > 0.2 && before.vx !== 0 && s.vx === 0) refusedX++;
    if (Math.abs(input.dy) > 0.2 && before.vy !== 0 && s.vy === 0) refusedY++;
    if (Math.hypot(s.x, s.y) > R - MOVER.RUN / 60 * 1.5) nearEdge++;
  }
  assert.ok(refusedX > 10, `the x axis was refused only ${refusedX} times`);
  assert.ok(refusedY > 10, `the y axis was refused only ${refusedY} times`);
  assert.ok(nearEdge > 50, `the body came within a step of the bound only ${nearEdge} times`);
});

test("a jump is cosmetic: the path is identical with and without it, and its height is a parabola", () => {
  const script: MoveInput[] = [];
  for (let i = 0; i < 240; i++) script.push({ ...idle, dx: Math.cos(i / 40), dy: Math.sin(i / 40) });
  let a = initialMover(0, 0);
  let b = initialMover(0, 0);
  for (let i = 0; i < script.length; i++) {
    a = stepMover(a, script[i]!, 1 / 60, open);
    b = stepMover(b, { ...script[i]!, jump: i % 50 === 0 }, 1 / 60, open);
  }
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, "the jump moved the body");
  // Mid-jump height is the peak; it never goes below the ground.
  let s = stepMover(initialMover(0, 0), { ...idle, jump: true }, 1 / 60, open);
  assert.equal(s.state, "jump");
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    peak = Math.max(peak, jumpHeightM(s));
    assert.ok(jumpHeightM(s) >= 0);
    s = stepMover(s, { ...idle, jump: true }, 1 / 60, open);
  }
  assert.ok(Math.abs(peak - MOVER.JUMP_HEIGHT_M) < 0.05, `peak ${peak}`);
  assert.equal(s.state, "idle", "a held key must not chain jumps");
});

test("turning in place is a state, and facing follows the heading four ways", () => {
  let s = run(initialMover(0, 0, 0), idle, 0.5);
  s = stepMover(s, { ...idle, dx: -1 }, 1 / 60, () => false); // blocked, so still; wants to face west
  assert.equal(s.state, "turn");
  assert.equal(facingFromHeading(0), "right");
  assert.equal(facingFromHeading(Math.PI / 2), "down");
  assert.equal(facingFromHeading(Math.PI), "left");
  assert.equal(facingFromHeading(-Math.PI / 2), "up");
});

test("the frame flips y and scales by TILE_M, and round-trips", () => {
  assert.deepEqual(tileToLocalM(10, 5), [10 * TILE_M, -5 * TILE_M]);
  const [x, y] = localMToTile(16, -8);
  assert.ok(Math.abs(x - 10) < 1e-12 && Math.abs(y - 5) < 1e-12);
  assert.equal(TILE_M, 1.6);
});
