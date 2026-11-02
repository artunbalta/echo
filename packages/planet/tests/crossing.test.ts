/**
 * From one parcel to the next across the water (`lib/crossing.ts`, DECISIONS C57).
 *
 * Run:  node --import tsx --test packages/planet/tests/crossing.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { areNeighborCells, gridDisk } from "h3-js";

import { carry, cellAtLocal, CROSSING, onShore, outsideBy, sphereDistanceM, tripVerdict } from "../lib/crossing.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { createTangentPatch } from "../lib/scene.js";
import { calibratePlanet, createTerrain, isLand } from "../lib/terrain.js";
import { SEED, shippedCalibration } from "./helpers/shipped.js";

// Two neighbouring parcels with a village each, a kilometre apart across one sea.
const DRURNSCREE = "84dcee5ffffffff";
const JERREEF = "84dce33ffffffff";
const R = PLANET_PARAMS.radiusKm;
const a = createTangentPatch(DRURNSCREE, R);
const b = createTangentPatch(JERREEF, R);
/** Jerreef's centre in Drurnscree's frame. */
const bCentre = a.toLocal(b.toDirection(0, 0))!;

test("C57: a point is in the parcel it is in, and past its edge by how far it is past it", () => {
  assert.ok(areNeighborCells(DRURNSCREE, JERREEF));
  assert.equal(cellAtLocal(a, 0, 0), DRURNSCREE);
  assert.equal(cellAtLocal(a, bCentre[0], bCentre[1]), JERREEF);
  assert.equal(outsideBy(a, 0, 0), 0);
  // Walk from one centre toward the other and find the edge: inside, then out by exactly the step.
  const dir = [bCentre[0] / Math.hypot(...bCentre), bCentre[1] / Math.hypot(...bCentre)];
  let edge = 0;
  for (let s = 0; s < 3000; s += 0.5) if (outsideBy(a, dir[0] * s, dir[1] * s) === 0) edge = s;
  assert.ok(edge > 500 && edge < 1200, `the edge is ${edge} m from the centre`);
  const past = outsideBy(a, dir[0] * (edge + 40), dir[1] * (edge + 40));
  assert.ok(Math.abs(past - 40) < 8, `40 m past the edge measures ${past.toFixed(1)} m`);
  assert.equal(cellAtLocal(a, dir[0] * (edge + CROSSING.intoM), dir[1] * (edge + CROSSING.intoM)), JERREEF, "past the edge toward Jerreef and not in Jerreef");
});

test("C57: carried through the sphere, a point and its heading land where they are, and come back", () => {
  for (const [x, y, angle] of [[400, -250, 0.3], [-700, 610, 2.9], [bCentre[0] * 0.5, bCentre[1] * 0.5, -1.2]] as const) {
    const there = carry(a, b, x, y, angle)!;
    const back = carry(b, a, there.x, there.y, there.angle)!;
    assert.ok(Math.hypot(back.x - x, back.y - y) < 1e-6, `${Math.hypot(back.x - x, back.y - y)} m off after a round trip`);
    assert.ok(Math.abs(back.angle - angle) < 1e-9);
    assert.ok(Math.abs(there.turn + back.turn) < 1e-9, "the turn there is not undone coming back");
    // The turn is what the frame did to the heading: the carried angle is the old one plus it.
    const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
    assert.ok(Math.abs(wrap(there.angle - angle - there.turn)) < 1e-9, "the turn is not how far the heading turned");
    assert.ok(Math.abs(there.turn) < 0.05, `the frames are turned ${there.turn} rad from each other`);
    // The same place on the sphere in both frames.
    assert.ok(sphereDistanceM(R * 1000, a.toDirection(x, y), b.toDirection(there.x, there.y)) < 1e-3);
  }
  const centre = carry(a, b, bCentre[0], bCentre[1], 0)!;
  assert.ok(Math.hypot(centre.x, centre.y) < 1e-6, "Jerreef's centre is not at Jerreef's origin");
});

test("C57: a raft's length is its length in either frame (the projections agree to centimetres where a crossing happens)", () => {
  const mid = [bCentre[0] / 2, bCentre[1] / 2];
  for (const [dx, dy] of [[5, 0], [0, 5], [3.5, -3.5]]) {
    const p = carry(a, b, mid[0], mid[1], 0)!;
    const q = carry(a, b, mid[0] + dx, mid[1] + dy, 0)!;
    const before = Math.hypot(dx, dy);
    const after = Math.hypot(q.x - p.x, q.y - p.y);
    assert.ok(Math.abs(after - before) < 0.01, `${before} m became ${after} m`);
  }
});

test("C57: the stand in parcels — far is another parcel's shore, near is your own, and a push off the beach is nothing", () => {
  assert.deepEqual(tripVerdict(DRURNSCREE, JERREEF, 1100), { side: "far", rings: 1 });
  assert.deepEqual(tripVerdict(DRURNSCREE, DRURNSCREE, 800), { side: "near", rings: 0 });
  assert.deepEqual(tripVerdict(DRURNSCREE, DRURNSCREE, 12), { side: null, rings: 0 });
  // A far shore is far however short the row: the line between parcels is what was crossed.
  assert.equal(tripVerdict(DRURNSCREE, JERREEF, 20).side, "far");
  const two = gridDisk(DRURNSCREE, 2).find((c) => !gridDisk(DRURNSCREE, 1).includes(c))!;
  assert.equal(tripVerdict(DRURNSCREE, two, 2500).rings, 2);
});

test("C57: a raft comes ashore on a beach, not in the sea and not a kilometre inland", () => {
  const field = createTerrain(SEED);
  const calibration = shippedCalibration(SEED, () => calibratePlanet(field, PLANET_PARAMS.landFractionTarget));
  const land = (x: number, y: number) => isLand(field, calibration.seaLevel, a.toDirection(x, y));
  // Find a shoreline on a ray from the centre: the last land before water.
  let shore: [number, number] | null = null;
  let sea: [number, number] | null = null;
  let inland: [number, number] | null = null;
  for (let k = 0; k < 16 && !shore; k++) {
    const t = (k / 16) * Math.PI * 2;
    let prev: [number, number] | null = null;
    for (let s = 0; s < 2000; s += 2) {
      const p: [number, number] = [Math.cos(t) * s, Math.sin(t) * s];
      if (prev && land(...prev) && !land(...p)) {
        shore = prev;
        sea = [Math.cos(t) * (s + 30), Math.sin(t) * (s + 30)];
        break;
      }
      prev = p;
    }
  }
  assert.ok(shore && sea, "no shore on Drurnscree");
  for (let s = 0; s < 3000 && !inland; s += 25) {
    const p: [number, number] = [-Math.cos(Math.atan2(shore![1], shore![0])) * s, -Math.sin(Math.atan2(shore![1], shore![0])) * s];
    if (land(...p) && !onShore(a, field, calibration, ...p)) inland = p;
  }
  assert.equal(onShore(a, field, calibration, ...shore!), true, "the water's edge is not a shore");
  if (!land(...sea!)) assert.equal(onShore(a, field, calibration, ...sea!), false, "the open sea is a shore");
  assert.ok(inland, "nowhere inland on Drurnscree");
  assert.equal(onShore(a, field, calibration, ...inland!), false, "a raft dragged ashore far inland");
});

test("C57 / C27: the same trips under both rules — the archipelago's 38 m called nearly every raft trip far; parcels split them", () => {
  // The old stand (apps/realtime WorldRoom): far past 4 ocean slot spacings of 6 tiles, 1.6 m a tile.
  const OLD_FAR_M = 4 * 6 * 1.6;
  const field = createTerrain(SEED);
  const calibration = shippedCalibration(SEED, () => calibratePlanet(field, PLANET_PARAMS.landFractionTarget));
  const sea = (x: number, y: number) => !isLand(field, calibration.seaLevel, a.toDirection(x, y));
  // Launch from the shore nearest Drurnscree's centre.
  let launch: [number, number] | null = null;
  for (let s = 0; s < 1500 && !launch; s += 5) {
    for (let k = 0; k < 24 && !launch; k++) {
      const t = (k / 24) * Math.PI * 2;
      if (sea(Math.cos(t) * s, Math.sin(t) * s)) launch = [Math.cos(t) * s, Math.sin(t) * s];
    }
  }
  assert.ok(launch, "no water near Drurnscree");
  // Every shore reachable by water within 3 km, on a 25 m grid: the trips a raft could make.
  const STEP = 25;
  const N = Math.ceil(3000 / STEP);
  const key = (i: number, j: number) => (i + N) * (2 * N + 1) + (j + N);
  const seen = new Set<number>();
  const q: [number, number][] = [[Math.round(launch![0] / STEP), Math.round(launch![1] / STEP)]];
  seen.add(key(...q[0]!));
  const shores: [number, number][] = [];
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h]!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (Math.hypot(ni, nj) > N) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k);
      if (sea(ni * STEP, nj * STEP)) q.push([ni, nj]);
      else shores.push([ni * STEP, nj * STEP]);
    }
  }
  assert.ok(shores.length > 100, `${shores.length} shores reachable`);
  let oldFar = 0;
  let newFar = 0;
  let trips = 0;
  for (const [x, y] of shores) {
    const d = sphereDistanceM(R * 1000, a.toDirection(...launch!), a.toDirection(x, y));
    const v = tripVerdict(DRURNSCREE, cellAtLocal(a, x, y), d);
    if (v.side === null) continue;
    trips++;
    if (d > OLD_FAR_M) oldFar++;
    if (v.side === "far") newFar++;
  }
  const oldShare = oldFar / trips;
  const newShare = newFar / trips;
  console.log(`[C57 stand] ${trips} trips from Drurnscree's shore within 3 km: old 38 m rule far ${(100 * oldShare).toFixed(1)}%, parcel rule far ${(100 * newShare).toFixed(1)}%`);
  assert.ok(oldShare > 0.95, "the old threshold still discriminates at parcel scale");
  assert.ok(newShare > 0.05 && newShare < 0.95, "the parcel rule does not split the same trips");
});
