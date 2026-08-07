/**
 * The solo raft must be budgeted exactly like an online one.
 *
 * Online, WorldRoom.integrate does three things per tick that no client used to do: it detects
 * landfall, it calls beginCrossing so reach is re-budgeted from the new shore, and it accumulates
 * the raft's lifetime open-water path so effectiveSeaworthiness can AGE it. A solo session has no
 * server integrate loop, so before this the solo raft kept its launch-time reach forever and never
 * aged, and a solo player could island-hop indefinitely.
 *
 * That is a MEASUREMENT problem, not a gameplay one. Unlimited travel inflates `novel_tile_ratio`,
 * `path_tortuosity`, `travel_novelty` and `curiosity`, which are precisely the four openness
 * features the P5 W re-anchor added. With SOLO_CUES_FEED_POSTERIOR true, an unbudgeted solo session
 * would therefore read as systematically more open than an online session for the same person doing
 * the same thing, on the newest and most recently re-anchored axis. See known-gaps 10.
 *
 * This test replays the server's accounting and the solo tick's accounting over one identical path
 * and asserts they agree at every step. Renderer-free, no WebGL, no room: it is about arithmetic
 * over the shared raft.ts, which is the thing that has to match.
 *
 * Run:  npm run test -w @echo/web
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  beginCrossing,
  effectiveSeaworthiness,
  reachTiles,
  oceanLandAt,
  oceanIslandCenter,
  OCEAN_BEACH_W,
  REACH_FLOOR,
} from "@echo/shared";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = readFileSync(
  path.join(HERE, "..", "src", "components", "WorldClient.tsx"),
  "utf8",
);
const ROOM_SRC = readFileSync(
  path.join(HERE, "..", "..", "..", "apps", "realtime", "src", "WorldRoom.ts"),
  "utf8",
);

interface Raft {
  sailing: boolean;
  sea: number;
  reach: number;
  departX: number;
  departY: number;
  s0: number;
  waterTiles: number;
  spent: number;
}

/** WorldRoom.integrate's raft accounting, in the order the server does it. */
function serverStep(r: Raft, px: number, py: number, x: number, y: number) {
  if (r.sailing) {
    const afloat = !oceanLandAt(x, y, OCEAN_BEACH_W);
    if (!afloat) {
      if (r.spent > 0 || r.departX !== x || r.departY !== y) {
        const c = beginCrossing(r.s0, r.waterTiles, x, y);
        r.sea = c.sea; r.reach = c.reach; r.spent = c.spent;
        r.departX = c.departX; r.departY = c.departY;
      }
    }
  }
  // "after everything that could have moved this entity"
  if (r.sailing && !oceanLandAt(x, y, OCEAN_BEACH_W)) {
    r.waterTiles += Math.hypot(x - px, y - py);
    r.spent = Math.hypot(x - r.departX, y - r.departY);
  }
}

/** The solo tick's raft accounting, as written in WorldClient's startSolo interval. */
function soloStep(r: Raft, px: number, py: number, x: number, y: number) {
  if (r.sailing) {
    if (oceanLandAt(x, y, OCEAN_BEACH_W)) {
      if (r.spent > 0 || r.departX !== x || r.departY !== y) {
        const c = beginCrossing(r.s0, r.waterTiles, x, y);
        r.sea = c.sea; r.reach = c.reach; r.spent = c.spent;
        r.departX = c.departX; r.departY = c.departY;
      }
    } else {
      r.waterTiles += Math.hypot(x - px, y - py);
      r.spent = Math.hypot(x - r.departX, y - r.departY);
    }
  }
}

function launched(s0: number, x: number, y: number): Raft {
  const c = beginCrossing(s0, 0, x, y);
  return {
    sailing: true, sea: c.sea, reach: c.reach, departX: c.departX, departY: c.departY,
    s0, waterTiles: 0, spent: c.spent,
  };
}

/** A straight run from island `a` to island `b`, sampled every `step` tiles. */
function crossing(a: number, b: number, step = 0.4) {
  const A = oceanIslandCenter(a);
  const B = oceanIslandCenter(b);
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  const n = Math.ceil(d / step);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    pts.push({ x: A.x + ((B.x - A.x) * i) / n, y: A.y + ((B.y - A.y) * i) / n });
  }
  return pts;
}

test("solo and server raft accounting agree step for step across a real crossing", () => {
  // Slot 0 to slot 9 is 108 tiles, so the run crosses real open water and may clip other islands on
  // the way, which is what makes it exercise more than one landfall. (Slot 0 to slot 1 would only be
  // ~7 tiles of water: 36 apart, less two 14.5-tile radii.)
  const pts = crossing(0, 9);
  assert.ok(pts.length > 50, `expected a real path, got ${pts.length} points`);

  const s0 = 0.62;
  const srv = launched(s0, pts[0].x, pts[0].y);
  const solo = launched(s0, pts[0].x, pts[0].y);

  let landfalls = 0;
  for (let i = 1; i < pts.length; i++) {
    const before = srv.departX;
    serverStep(srv, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    soloStep(solo, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    if (srv.departX !== before) landfalls++;
    assert.deepEqual(solo, srv, `diverged at path index ${i} (${pts[i].x.toFixed(2)}, ${pts[i].y.toFixed(2)})`);
  }

  assert.ok(landfalls >= 1, "the path must actually make landfall, or this proves nothing");
  assert.ok(srv.waterTiles > 20, `the raft must have logged real open water, got ${srv.waterTiles.toFixed(2)}`);
  assert.ok(srv.reach < reachTiles(effectiveSeaworthiness(s0, 0)), "and the crossing must have cost it reach");
});

test("a solo raft ages: each crossing re-budgets to strictly less reach", () => {
  // The property the missing accounting destroyed. Three hops in sequence; reach must shrink.
  const s0 = 0.85;
  const hops: [number, number][] = [[0, 1], [1, 4], [4, 9]];
  const r = launched(s0, oceanIslandCenter(0).x, oceanIslandCenter(0).y);
  const reaches = [r.reach];

  for (const [a, b] of hops) {
    const pts = crossing(a, b);
    for (let i = 1; i < pts.length; i++) soloStep(r, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    reaches.push(r.reach);
  }

  for (let i = 1; i < reaches.length; i++) {
    assert.ok(
      reaches[i] < reaches[i - 1],
      `crossing ${i} must re-budget to LESS reach than crossing ${i - 1}: ${reaches.map((v) => v.toFixed(2)).join(" -> ")}`,
    );
  }
  // ...but never below the floor, because haste is a style we measure, not a mistake we punish.
  assert.ok(
    reaches[reaches.length - 1] >= REACH_FLOOR,
    `an old raft is still a raft: reach ${reaches[reaches.length - 1].toFixed(2)} >= floor ${REACH_FLOOR}`,
  );
});

test("without the accounting, a solo raft would never age (the bug this closes)", () => {
  // Sanity on the discriminator: a raft that never accumulates water tiles keeps launch-time reach
  // forever. If this ever stopped differing from the test above, that test would prove nothing.
  const s0 = 0.85;
  const launchReach = reachTiles(effectiveSeaworthiness(s0, 0));
  const unbudgeted = launchReach; // no waterTiles ever added, so beginCrossing would return the same

  const r = launched(s0, oceanIslandCenter(0).x, oceanIslandCenter(0).y);
  for (const [a, b] of [[0, 1], [1, 4], [4, 9]] as const) {
    const pts = crossing(a, b);
    for (let i = 1; i < pts.length; i++) soloStep(r, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }
  assert.ok(r.reach < unbudgeted - 1, `budgeted ${r.reach.toFixed(2)} must be well under unbudgeted ${unbudgeted.toFixed(2)}`);
});

test("both paths call the SHARED beginCrossing, so there is one definition and not two", () => {
  // The constraint on this work was to reuse the shared code rather than copy the server's logic
  // into the client. WorldRoom.beginCrossing was private, so it was lifted into raft.ts and both
  // callers now go through it. If either side ever re-derives sea/reach locally again, they can
  // drift apart silently and a solo session's travel budget stops matching an online one's.
  assert.ok(
    /beginCrossing as sharedBeginCrossing/.test(ROOM_SRC),
    "WorldRoom must import the shared beginCrossing",
  );
  assert.ok(
    /sharedBeginCrossing\(e\.raftS0, e\.raftWaterTiles, e\.x, e\.y\)/.test(ROOM_SRC),
    "WorldRoom.beginCrossing must delegate to the shared one",
  );
  assert.ok(
    /beginCrossing\(r\.s0, r\.waterTiles, p\.x, p\.y\)/.test(CLIENT_SRC),
    "the solo tick must call the shared beginCrossing on landfall",
  );
  assert.ok(
    /r\.waterTiles \+= Math\.hypot\(p\.x - r\.lastX, p\.y - r\.lastY\)/.test(CLIENT_SRC),
    "the solo tick must accumulate open-water path length, or the raft never ages",
  );
  // And the server must no longer compute them itself.
  assert.ok(
    !/e\.raftSea = effectiveSeaworthiness/.test(ROOM_SRC),
    "WorldRoom must not re-derive raftSea locally any more",
  );
});
