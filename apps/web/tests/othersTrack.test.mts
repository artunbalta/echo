/**
 * Someone else's body between their poses (DECISIONS C101): drawn a little behind, between the two
 * poses either side, the short way round, and still where it stopped when the poses stop.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DELAY_MS, OthersTrack } from "../src/game/world/othersTrack";

const pose = (t: number, x: number, yaw = 0, activity: "walk" | "stand" = "walk") => ({ t, x, y: 0, yaw, speed: 1.6, activity });

test("nothing to draw before the first pose", () => {
  assert.equal(new OthersTrack().at(1000), null);
});

test("a body is drawn between the two poses either side of a moment a little in the past", () => {
  const tr = new OthersTrack();
  tr.push(pose(0, 0));
  tr.push(pose(100, 1));
  tr.push(pose(200, 2));
  const s = tr.at(150 + DELAY_MS)!;
  assert.ok(Math.abs(s.x - 1.5) < 1e-9, `halfway between the 100 ms and 200 ms poses, got ${s.x}`);
});

test("turning goes the short way round, through ±π and not through 0", () => {
  const tr = new OthersTrack();
  tr.push(pose(0, 0, Math.PI - 0.1));
  tr.push(pose(100, 0, -Math.PI + 0.1));
  const s = tr.at(50 + DELAY_MS)!;
  assert.ok(Math.abs(Math.abs(s.yaw) - Math.PI) < 1e-9, `faces backwards halfway, got ${s.yaw}`);
});

test("when the poses stop, the body stays where the last one put it", () => {
  const tr = new OthersTrack();
  tr.push(pose(0, 0));
  tr.push(pose(100, 1, 0, "stand"));
  const s = tr.at(10_000)!;
  assert.equal(s.x, 1);
  assert.equal(s.activity, "stand");
});

test("a pose out of order replaces the newest rather than going back in time", () => {
  const tr = new OthersTrack();
  tr.push(pose(100, 1));
  tr.push(pose(90, 5));
  assert.equal(tr.latest()!.x, 5);
  assert.equal(tr.latest()!.t, 100);
});

test("only the last second or so is kept", () => {
  const tr = new OthersTrack();
  for (let i = 0; i < 100; i++) tr.push(pose(i * 100, i));
  assert.equal(tr.at(0)!.x, 88, "the oldest kept is twelve poses back");
});
