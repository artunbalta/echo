/**
 * The tile quantum is a MEASUREMENT constant (SOCIETY-PLAN §3 item 4 / SOC-0.C).
 *
 * `world.ts`'s defence of TILE_M and MOVE_SPEED used to rest on `speedVar`, a scalar that is
 * computed, shipped, and routed NOWHERE — so two frozen constants were defended by a mechanism that
 * does not exist, which made the real constraint look weaker than it is. The real one is
 * `novel_tile_ratio`: its denominator is distinct rounded tiles per 1.5 s window, which is a speed,
 * and the frozen W loads it 0.40 on openness.
 *
 * This derives that claim from the shipped sampler and the profile the parcel actually passes, so
 * the defence cannot drift from the code the way the old one did.
 *
 * Run:  node --import tsx --test apps/web/tests/locomotionQuantum.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { TILE_M, WORLD } from "@echo/shared";

import { LocomotionSampler, type LocomotionScalars } from "../src/game/telemetry";
import { parcelMovement } from "../src/game/world/controller";

/** A dead-straight walk east at `tilesPerSecond`, fed to the shipped sampler at 50 ms. */
function straightWalk(tilesPerSecond: number, seconds = 12): LocomotionScalars[] {
  const emitted: LocomotionScalars[] = [];
  const sampler = new LocomotionSampler((s) => emitted.push(s));
  const stepMs = 50;
  let x = 0;
  for (let t = stepMs; t <= seconds * 1000; t += stepMs) {
    x += (tilesPerSecond * stepMs) / 1000;
    sampler.feed(x, 0, t);
  }
  return emitted;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round3 = (x: number) => Number(x.toFixed(3));
const novelty = (tps: number) => round3(mean(straightWalk(tps).map((s) => s.novel_tile_ratio)));
const tilesPerWindow = (tps: number) => mean(straightWalk(tps).map((s) => s.tiles));

test("the parcel's walk is 1.65 / TILE_M tiles per second, not MOVE_SPEED", () => {
  const profile = parcelMovement(TILE_M);
  assert.equal(profile.walk, 1.65 / TILE_M);
  assert.equal(round3(profile.walk), 1.031);
  assert.equal(round3(profile.run), 2.625);
  assert.notEqual(profile.walk, WORLD.MOVE_SPEED);
});

test("novel_tile_ratio's denominator is distinct tiles per 1.5 s window — a speed", () => {
  assert.equal(tilesPerWindow(parcelMovement(TILE_M).walk), 2.5);
  assert.equal(tilesPerWindow(parcelMovement(TILE_M).run), 4.5);
  assert.equal(tilesPerWindow(WORLD.MOVE_SPEED), 6.5);
});

test("the same straight walk reads as three different people if TILE_M moves", () => {
  const shipped = novelty(parcelMovement(TILE_M).walk);
  const halved = novelty(parcelMovement(TILE_M / 2).walk);
  const doubled = novelty(parcelMovement(TILE_M * 2).walk);
  assert.equal(shipped, 0.625);
  assert.equal(halved, 0.825);
  assert.equal(doubled, 0.417);
  assert.ok(halved > shipped && shipped > doubled);
});

test("the sampler both routes feed emits no speed scalar of any kind", () => {
  const [first] = straightWalk(parcelMovement(TILE_M).walk);
  assert.deepEqual(Object.keys(first!).sort(), [
    "backtrack_rate", "dwell_ms", "heading_change_rate", "novel_tile_ratio", "path_tortuosity", "tiles",
  ]);
});

test("the only speed normalisation in the repo is the legacy stack's, and it is unmapped", async () => {
  // living-world-rendering.md said the parcel sampler "retains its legacy speed normalization".
  // It has none to retain: the normalisation is in WorldCore, on the old stack, on a scalar the ML
  // ingest deliberately drops. Pinned by source, because the claim is about what is ABSENT.
  const sampler = await readFile(new URL("../src/game/telemetry.ts", import.meta.url), "utf8");
  assert.ok(!/MOVE_SPEED/.test(sampler), "the parcel sampler must not reference MOVE_SPEED");
  const core = await readFile(new URL("../src/game/WorldCore.ts", import.meta.url), "utf8");
  assert.ok(
    /speedVar\s*=\s*Math\.min\(1,\s*Math\.sqrt\(v\)\s*\/\s*WORLD\.MOVE_SPEED\)/.test(core),
    "the one speed normalisation should still be exactly where this doc says it is",
  );
});
