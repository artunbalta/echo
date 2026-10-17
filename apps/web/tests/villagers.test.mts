/**
 * The village's people and lights on the client (DECISIONS C41): the pieces that are pure enough to
 * test without a GL context — the window light's curve, the nameplate's sentence, the crowd's yaw
 * convention and its instance bookkeeping.
 *
 * Run:  node --import tsx --test apps/web/tests/villagers.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import type { LifeEvent } from "@echo/planet";
import { windowLight } from "../src/game/world/settlementLayer";
import { lifeLine } from "../src/game/world/villagersLayer";
import { Crowd, lookFor } from "../src/game/world/crowd";

test("windows are dark by day, lit through the night, and do not switch on in one frame", () => {
  assert.equal(windowLight(0.5), 0);
  assert.equal(windowLight(0.4), 0);
  assert.equal(windowLight(0.0), 1);
  assert.equal(windowLight(0.9), 1);
  assert.ok(windowLight(0.75) > 0 && windowLight(0.75) < 1, "dusk should be part-way");
  assert.ok(windowLight(0.245) > 0 && windowLight(0.245) < 1, "dawn should be part-way");
  for (let t = 0.6; t < 0.85; t += 0.005) assert.ok(windowLight(t + 0.005) >= windowLight(t) - 1e-12, "the evening ramp goes backwards");
});

const ev = (kind: LifeEvent["kind"], day: number, other?: string, detail: string | null = null): LifeEvent => ({
  key: `${kind}/${day}`,
  day,
  kind,
  subject: "me",
  with: other ? [other] : [],
  detail,
});
const names = new Map([["a", "Haim"], ["b", "Meirnas"], ["c", "Jeir"]]);

test("a nameplate says the most telling thing, in English a person would say", () => {
  const day = 365 * 50;
  assert.equal(lifeLine([ev("married", day - 365 * 15, "a")], day, names), "Married to Haim for 15 years.");
  assert.equal(lifeLine([ev("married", day - 100, "a")], day, names), "Married to Haim this past year.");
  // Widowhood outranks the marriage it ended.
  assert.equal(
    lifeLine([ev("married", day - 365 * 40, "a"), ev("widowed", day - 365 * 7, "a")], day, names),
    "Widowed 7 years ago; Haim lies in the graveyard.",
  );
  // A child lost long ago stops being the first thing said.
  assert.equal(lifeLine([ev("married", day - 365 * 30, "a"), ev("child-died", day - 365 * 3, "b")], day, names), "Lost a child, Meirnas, 3 years ago.");
  assert.equal(lifeLine([ev("married", day - 365 * 60, "a"), ev("child-died", day - 365 * 40, "b")], day, names), "Married to Haim for 60 years.");
  assert.equal(lifeLine([ev("learned-trade", day - 365 * 20, "c", "fisher")], day, names), "Learned the trade from Jeir.");
  assert.equal(lifeLine([], day, names), "Born here, and has never lived anywhere else.");
  // Nothing from the future is told.
  assert.equal(lifeLine([ev("widowed", day + 10, "a")], day, names), "Born here, and has never lived anywhere else.");
});

test("the crowd's yaw is the schedule's heading plus a quarter turn: walking east faces east", () => {
  // The rig faces +z. A local heading h (0 east, π/2 north) is three's (cos h, -sin h) in x-z.
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    const yaw = h + Math.PI / 2;
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    assert.ok(Math.abs(forward.x - Math.cos(h)) < 1e-9 && Math.abs(forward.z + Math.sin(h)) < 1e-9, `heading ${h}`);
  }
});

test("a crowd places what it is asked to and hides every instance it was not", () => {
  const crowd = new Crowd(5, 1.6);
  const look = lookFor("someone", "fisher", 40);
  crowd.begin();
  for (let i = 0; i < 3; i++) crowd.pose({ x: i, y: 0, z: 0, yaw: 0, activity: "walk", speed: 0.8, time: 1, phase0: 0 }, look);
  crowd.end();
  assert.equal(crowd.placed(), 3);
  const thigh = crowd.meshes.get("thigh")!;
  const m = new THREE.Matrix4();
  // Three bodies are six thighs, instances 0-5; the seventh is the first that should be hidden.
  thigh.getMatrixAt(6, m);
  assert.ok(m.elements.every((e) => e === 0 || e === 1) && m.elements[0] === 0, "instance 6 (a fourth body's thigh) should be hidden");
  thigh.getMatrixAt(5, m);
  assert.ok(Math.abs(m.determinant()) > 1e-6, "instance 5 (the third body's right thigh) should be placed");
  thigh.getMatrixAt(0, m);
  assert.ok(m.elements.every(Number.isFinite) && Math.abs(m.determinant()) > 1e-6, "a placed thigh has a real transform");
  // More bodies than it holds: the rest are dropped, never written past the end.
  crowd.begin();
  for (let i = 0; i < 9; i++) crowd.pose({ x: i, y: 0, z: 0, yaw: 0, activity: "sit", speed: 0, time: 1, phase0: 0 }, look);
  crowd.end();
  assert.equal(crowd.placed(), 5);
  crowd.dispose();
});

test("children are small, the old are grey and stooped, and nobody is dressed in violet", () => {
  const child = lookFor("kid", "farmer", 7);
  const adult = lookFor("kid", "farmer", 35);
  const elder = lookFor("kid", "farmer", 80);
  assert.ok(child.scale < adult.scale * 0.85);
  assert.ok(elder.stoop > 0 && adult.stoop === 0);
  assert.equal(elder.hair.getHex(), new THREE.Color(0x9a958c).getHex());
  for (const trade of ["fisher", "farmer", "smith", "trader", "healer", "weaver", "miner"]) {
    const hsl = { h: 0, s: 0, l: 0 };
    lookFor(`p/${trade}`, trade, 30).cloth.getHSL(hsl);
    // Echo violet is h ≈ 0.75; the art bible keeps it for live humans.
    assert.ok(Math.abs(hsl.h - 0.75) > 0.06 || hsl.s < 0.15, `${trade} is dressed in violet`);
  }
});
