/**
 * The raft (DECISIONS C57): how fast it goes, the body carried from one parcel's world into the
 * next, and what the echo is told of a trip.
 *
 * Run:  node --import tsx --test apps/web/tests/raft.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createTangentPatch, PLANET_PARAMS, sphereDistanceM, type TangentPatch } from "@echo/planet";
import { SOCIAL_CUES } from "@echo/shared";

import { carryHandoff } from "../src/game/world/crossTo";
import { initialMover, localMToTile, tileToLocalM } from "../src/game/world/controller";
import { cameraForward } from "../src/game/world/followCamera";
import type { PlayerHandoff } from "../src/game/world/playerLayer";
import { landingLine, preparationMeasurement, provisioned, travelMeasurement, type LandingAnswer } from "../src/lib/landing";
import { RAFT, raftSpeed } from "../src/lib/raft";

const DRURNSCREE = "84dcee5ffffffff";
const JERREEF = "84dce33ffffffff";
const R = PLANET_PARAMS.radiusKm;
const TILE_M = 1.6;
const frameOf = (patch: TangentPatch) => ({ patch, tileM: TILE_M, toLocalM: (x: number, y: number) => tileToLocalM(x, y, TILE_M), fromLocalM: (x: number, y: number) => localMToTile(x, y, TILE_M) });
const A = frameOf(createTangentPatch(DRURNSCREE, R));
const B = frameOf(createTangentPatch(JERREEF, R));
/** Where a tile point of a frame is on the sphere. */
const dir = (f: ReturnType<typeof frameOf>, x: number, y: number) => f.patch.toDirection(...f.toLocalM(x, y));

test("C57: a raft is paddled a little quicker than a boat is rowed, and under sail the day's wind decides", () => {
  assert.equal(raftSpeed(0.6, false), RAFT.paddleMps);
  assert.equal(raftSpeed(0, true), RAFT.paddleMps, "a sail on a still day moved the raft");
  assert.ok(raftSpeed(0.3, true) > raftSpeed(0.3, false));
  assert.ok(raftSpeed(1, true) > raftSpeed(0.5, true));
  assert.equal(raftSpeed(7, true), raftSpeed(1, true), "a wind past a gale");
  assert.equal(raftSpeed(Number.NaN, true), RAFT.paddleMps);
  assert.ok(RAFT.paddleMps > 1.4, "the raft is no quicker than a village boat");
  // A kilometre's crossing in a fresh wind is minutes, not most of an hour.
  assert.ok(1000 / raftSpeed(0.5, true) < 6 * 60);
});

test("C57: the body crosses into the next parcel's world where it is, facing and moving as it was, with the camera where it was", () => {
  // Mid-water between the two centres, in Drurnscree's tiles, heading somewhere north-east and moving.
  const mid = A.patch.toLocal(B.patch.toDirection(0, 0))!;
  const [tx, ty] = A.fromLocalM(mid[0] * 0.55, mid[1] * 0.55);
  const heading = -0.7;
  const speed = 3.1 / TILE_M;
  const h: PlayerHandoff = {
    mover: { ...initialMover(tx, ty, heading), vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed, state: "walk" },
    camera: { yaw: 2.2, pitch: 0.2, distance: 5.8, boom: 5.6, lift: 0, anchor: [tx * TILE_M + 0.3, 1.5, ty * TILE_M - 0.2] },
    boating: true,
    raft: true,
  };
  const c = carryHandoff(h, A, B)!;
  const m = c.mover;
  const R_M = R * 1000;
  assert.ok(sphereDistanceM(R_M, dir(A, tx, ty), dir(B, m.x, m.y)) < 0.01, "the raft is somewhere else after the crossing");
  // A metre ahead of the bow is the same water in both.
  const ahead = (x: number, y: number, hd: number) => [x + Math.cos(hd) / TILE_M, y + Math.sin(hd) / TILE_M] as const;
  assert.ok(sphereDistanceM(R_M, dir(A, ...ahead(tx, ty, heading)), dir(B, ...ahead(m.x, m.y, m.heading))) < 0.01, "the bow points elsewhere");
  // The same speed, along the same heading.
  assert.ok(Math.abs(Math.hypot(m.vx, m.vy) - speed) < 1e-9);
  assert.ok(Math.abs(Math.atan2(m.vy, m.vx) - m.heading) < 1e-9);
  // The camera looks the way it looked: W walks toward the same water.
  const [fa, ga] = cameraForward(h.camera.yaw);
  const [fb, gb] = cameraForward(c.camera.yaw);
  assert.ok(sphereDistanceM(R_M, dir(A, tx + fa / TILE_M, ty + ga / TILE_M), dir(B, m.x + fb / TILE_M, m.y + gb / TILE_M)) < 0.01, "the camera turned at the crossing");
  // The sprung look-at point is the same point.
  const [ax, , az] = h.camera.anchor!;
  const [bx, , bz] = c.camera.anchor!;
  assert.ok(sphereDistanceM(R_M, A.patch.toDirection(ax, -az), B.patch.toDirection(bx, -bz)) < 0.01);
  assert.equal(c.camera.anchor![1], h.camera.anchor![1]);
  assert.deepEqual([c.boating, c.raft, c.camera.pitch, c.camera.distance], [true, true, 0.2, 5.8]);
  // And back again, to where it started.
  const back = carryHandoff(c, B, A)!;
  assert.ok(Math.hypot(back.mover.x - tx, back.mover.y - ty) < 1e-6 && Math.abs(back.camera.yaw - h.camera.yaw) < 1e-9);
});

const answer = (over: Partial<LandingAnswer>): LandingAnswer => ({ side: "far", rings: 1, distanceM: 1100, destOccupants: 140, village: "Jerreef", seenBy: ["Ama"], ...over });

test("C57: a far shore is the catalogue's A11, travel_far, with the server's count; home again is K4, travel_near; nothing is nothing", () => {
  const far = travelMeasurement(answer({}), JERREEF)!;
  assert.equal(far.action, "travel_far");
  assert.equal(far.opts.cue, "A11");
  assert.equal(far.opts.channel, SOCIAL_CUES.travel_far!.channel);
  assert.equal(far.opts.raw!.dest_occupants, 140, "ingest.py reads dest_occupants, and it is not the server's");
  assert.equal(far.opts.target!.kind, "place");
  assert.equal(far.opts.contextOverride!.public_or_private, "public");
  const bare = travelMeasurement(answer({ destOccupants: 0, village: null, seenBy: [] }), "84dcee1ffffffff")!;
  assert.equal(bare.opts.raw!.dest_occupants, 0, "a bare shore is not 0");
  assert.equal(bare.opts.contextOverride!.public_or_private, "private");
  const near = travelMeasurement(answer({ side: "near", rings: 0 }), JERREEF)!;
  assert.equal(near.action, "travel_near");
  assert.equal(near.opts.cue, "K4");
  assert.equal(travelMeasurement(answer({ side: null }), JERREEF), null);
  const prep = preparationMeasurement(DRURNSCREE);
  assert.equal(prep.action, "prepare_before_travel");
  assert.equal(prep.opts.cue, "C7");
});

test("C57: food aboard is preparing for a crossing; a shell is not", () => {
  assert.equal(provisioned({ berries: 1 }), true);
  assert.equal(provisioned({ "a handful of grain": 2, shell: 1 }), true);
  assert.equal(provisioned({ shell: 3, raft: 1 }), false);
  assert.equal(provisioned({ berries: 0 }), false);
});

test("C57: what a landing is met with", () => {
  assert.match(landingLine(answer({})), /below Jerreef\. Ama watched you come in/);
  assert.match(landingLine(answer({ seenBy: ["Ama", "Tor", "Isk"] })), /Ama and Tor and others watched/);
  assert.equal(landingLine(answer({ village: null, seenBy: [] })), "You drag the raft up a shore with nobody on it.");
  assert.match(landingLine(answer({ side: "near" })), /you set out from/);
});

test("C57: the water's edge, where a raft is launched, is within reach whichever way the sea lies", async () => {
  const { interactLayer } = await import("../src/game/world/interactLayer");
  const { worldClock, WORLD_EPOCH } = await import("@echo/planet");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    // A body where one stands on Drurnscree's beach, and the sea everything more than 1.5 m from it
    // toward angle a. Far from the origin, as every real body is: the rounding lives there.
    const body = { x: 84.4088137622358, y: -707.6713999065772 };
    const seaward = (xm: number, ym: number) => (xm - body.x) * Math.cos(a) + (ym - body.y) * Math.sin(a) > 1.5;
    const frame = {
      tileM: TILE_M,
      toLocalM: (x: number, y: number) => tileToLocalM(x, y, TILE_M),
      fromLocalM: (x: number, y: number) => localMToTile(x, y, TILE_M),
      heightAtTile: (x: number, y: number) => (seaward(...tileToLocalM(x, y, TILE_M)) ? -0.4 : 0.6),
    };
    const ctx = {
      frame,
      region: { village: null },
      layer: (name: string) => (name === "player" ? { position: () => ({ ...(([x, y]) => ({ x, y }))(localMToTile(body.x, body.y, TILE_M)), liftM: 0 }) } : undefined),
      scene: { add() {}, remove() {} },
    } as never;
    const layer = interactLayer({ clock: worldClock(WORLD_EPOCH) });
    await layer.build(ctx, new AbortController().signal);
    layer.update!(0.2, ctx);
    assert.equal(layer.nearest()?.kind, "water", `the sea toward ${(a * 180 / Math.PI).toFixed(0)}° is out of reach`);
  }
});
