/**
 * The demo's stations stand on land and can be walked to from the spawn (plan W4-2 acceptance,
 * proven at contract time so no agent builds on a station in the sea). The calibration comes from
 * the goldens fixture, the same numbers /api/planet/world serves, never a literal.
 *
 * Run:  node --import tsx --test apps/web/tests/demoStations.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  connected,
  createTangentPatch,
  createTerrain,
  DEMO_CELL,
  DEMO_REGION_K,
  PLANET_PARAMS,
  regionBound,
  spawnPointFor,
  walkableAt,
  type Calibration,
  type SpawnPoint,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { tileToLocalM } from "../src/game/world/controller";
import {
  DEMO_FOOTPRINT,
  DEMO_PRESENCE_HOME,
  DEMO_STATIONS,
  footprintLocalM,
  offsetLocalM,
  pathsLocalM,
  SLICE_STATIONS,
  stationById,
  stationLocalM,
} from "../src/game/world/demoStations";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8")) as {
  calibration: Calibration;
  demoCell: string;
  demoSpawn: SpawnPoint;
};
assert.equal(golden.demoCell, DEMO_CELL, "the goldens were written for a different demo cell");

const calibration = golden.calibration;
const field = createTerrain("echo-capacity-1");
const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);
const bound = regionBound(DEMO_CELL, DEMO_REGION_K, PLANET_PARAMS.radiusKm);
const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;
const walkable = (xm: number, ym: number) => walkableAt(patch, field, calibration.seaLevel, xm, ym, bound);

test("the demo spawn is dry, inside the demo cell, and the one the goldens pinned", () => {
  assert.ok(spawn);
  assert.ok(walkable(spawn.x, spawn.y));
  assert.equal(spawn.cell, DEMO_CELL);
  assert.deepEqual(spawn, golden.demoSpawn);
});

test("every station and the presence's home stand on land as placed, before any snapping", () => {
  const wet: string[] = [];
  for (const s of DEMO_STATIONS) {
    const [x, y] = stationLocalM(spawn, s.id);
    if (!walkable(x, y)) wet.push(s.id);
  }
  assert.deepEqual(wet, [], `stations in the water: ${wet.join(", ")}`);
  const [hx, hy] = offsetLocalM(spawn, DEMO_PRESENCE_HOME.dx, DEMO_PRESENCE_HOME.dy);
  assert.ok(walkable(hx, hy), "the presence's home is in the water");
});

test("the slice's two stations, and every other station, are reachable from the spawn on foot", () => {
  // One tile per node: the grid resolves single-tile causeways.
  const opts = { stepM: TILE_M, extentM: 120 };
  const walkableFromSpawn = (x: number, y: number) => walkable(spawn.x + x, spawn.y + y);
  for (const s of DEMO_STATIONS) {
    const [x, y] = tileToLocalM(s.dx, s.dy, TILE_M);
    assert.ok(connected(walkableFromSpawn, [0, 0], [x, y], opts), `${s.id} is not reachable from the spawn`);
  }
  assert.deepEqual([...SLICE_STATIONS], ["cave_mouth", "campfire"]);
});

test("the footprint is convex, and its metre-space polygon contains the homestead's metre position", () => {
  let sign = 0;
  for (let i = 0; i < DEMO_FOOTPRINT.length; i++) {
    const a = DEMO_FOOTPRINT[i]!;
    const b = DEMO_FOOTPRINT[(i + 1) % DEMO_FOOTPRINT.length]!;
    const c = DEMO_FOOTPRINT[(i + 2) % DEMO_FOOTPRINT.length]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else assert.equal(s, sign, "the footprint is not convex");
  }
  const polygon = footprintLocalM(spawn);
  const [hx, hy] = stationLocalM(spawn, "homestead");
  const inside = (poly: Array<[number, number]>, x: number, y: number) => {
    let side = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      const s = Math.sign(cross);
      if (s === 0) continue;
      if (side === 0) side = s;
      else if (s !== side) return false;
    }
    return true;
  };
  assert.ok(inside(polygon, hx, hy), "the homestead marker sits outside its own footprint in metre space");
  // The y flip is the whole point of the helper: the mirror polygon (tile y NOT flipped) must not
  // contain the marker, or the helper is not doing anything.
  const mirror = DEMO_FOOTPRINT.map(([dx, dy]) => [spawn.x + dx * TILE_M, spawn.y + dy * TILE_M] as [number, number]);
  assert.ok(!inside(mirror, hx, hy), "a footprint built without the y flip should be the wrong hexagon");
  // And the campfire is inside the footprint, the cave mouth outside it.
  const [cx, cy] = stationLocalM(spawn, "campfire");
  const [vx, vy] = stationLocalM(spawn, "cave_mouth");
  assert.ok(inside(polygon, cx, cy), "the fire should be on the homestead");
  assert.ok(!inside(polygon, vx, vy), "the cave should be off the homestead");
  void stationById;
});

test("paths convert to metre segments with the requested width", () => {
  const paths = pathsLocalM(spawn, 4);
  assert.equal(paths.length, 5);
  assert.deepEqual(paths[0]!.a, [spawn.x, spawn.y]);
  assert.deepEqual(paths[0]!.b, stationLocalM(spawn, "cave_mouth"));
  assert.ok(paths.every((p) => p.widthM === 4));
});
