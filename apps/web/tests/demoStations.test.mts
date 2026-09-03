/**
 * The demo's stations end up on ground you can walk to (plan W4-2 acceptance, proven at contract
 * time so no agent builds on a station in the sea).
 *
 * The authored offsets are intentions. What is asserted here is the SNAPPED layout, because that
 * is what the world builds, and because it is the property that survives a change of demo cell:
 * when DEMO_CELL moved from a cold coast to a rainforest headland, nothing in this file needed
 * editing and the snap found new ground.
 *
 * The calibration comes from the goldens fixture, the same numbers /api/planet/world serves.
 *
 * Run:  node --import tsx --test apps/web/tests/demoStations.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  biomeAtLocal,
  connected,
  createTangentPatch,
  createTerrain,
  DEMO_CELL,
  DEMO_LAND_BIOMES,
  DEMO_REGION_K,
  PLANET_PARAMS,
  regionBound,
  spawnPointFor,
  walkableAt,
  type Biome,
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
  snapStations,
  stationLocalM,
  type SnapWorld,
} from "../src/game/world/demoStations";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8")) as {
  calibration: Calibration;
  demoCell: string;
  demoSpawn: SpawnPoint;
};
assert.equal(golden.demoCell, DEMO_CELL, "the goldens were written for a different demo cell; run scripts/write-goldens.ts");

const calibration = golden.calibration;
const field = createTerrain("echo-capacity-1");
const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);
const bound = regionBound(DEMO_CELL, DEMO_REGION_K, PLANET_PARAMS.radiusKm);
const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;

/** The world the snap asks, in the frame the offsets are written in: tiles from the spawn. */
const world: SnapWorld = {
  walkable: (dx, dy) => {
    const [xm, ym] = offsetLocalM(spawn, dx, dy);
    return walkableAt(patch, field, calibration.seaLevel, xm, ym, bound);
  },
  biome: (dx, dy) => {
    const [xm, ym] = offsetLocalM(spawn, dx, dy);
    return biomeAtLocal(patch, field, calibration, xm, ym);
  },
};
const snapped = snapStations(spawn, world);

test("the demo spawn is dry, inside the demo cell, and the one the goldens pinned", () => {
  assert.ok(spawn);
  assert.ok(world.walkable(0, 0));
  assert.equal(spawn.cell, DEMO_CELL);
  assert.deepEqual(spawn, golden.demoSpawn);
});

test("every station snaps onto walkable ground, and the snap is deterministic", () => {
  assert.equal(snapped.length, DEMO_STATIONS.length, "a station could not be placed at all");
  for (const s of snapped) {
    assert.ok(world.walkable(s.x, s.y), `${s.id} snapped onto water at (${s.x}, ${s.y})`);
    assert.ok(s.movedTiles <= (s.snapTiles ?? 10) * 1.5, `${s.id} moved ${s.movedTiles} tiles`);
  }
  assert.deepEqual(snapStations(spawn, world), snapped, "the snap is not deterministic");
  console.log(
    "snapped:",
    snapped.map((s) => `${s.id} (${s.x},${s.y}) ${s.biome}${s.movedTiles ? ` moved ${s.movedTiles.toFixed(1)}` : ""}${s.settled ? " SETTLED" : ""}`).join("; "),
  );
});

test("every station is reachable from the spawn on foot, not merely dry", () => {
  // One tile per node, so the grid resolves a single-tile causeway.
  const opts = { stepM: TILE_M, extentM: 200 };
  const walkableM = (x: number, y: number) => walkableAt(patch, field, calibration.seaLevel, spawn.x + x, spawn.y + y, bound);
  for (const s of snapped) {
    const [x, y] = tileToLocalM(s.x, s.y, TILE_M);
    assert.ok(connected(walkableM, [0, 0], [x, y], opts), `${s.id} is dry but not reachable from the spawn`);
  }
  const [hx, hy] = tileToLocalM(DEMO_PRESENCE_HOME.dx, DEMO_PRESENCE_HOME.dy, TILE_M);
  assert.ok(connected(walkableM, [0, 0], [hx, hy], opts) || !walkableM(hx, hy), "the presence's home is dry but stranded");
});

test("a station with a biome preference gets it, or is honestly marked as settling for less", () => {
  const wanted = snapped.filter((s) => s.prefer);
  assert.ok(wanted.length >= 3, `only ${wanted.length} stations declare a biome preference`);
  for (const s of wanted) {
    if (s.settled) {
      console.log(`${s.id} settled for ${s.biome}; it wanted one of ${s.prefer!.join(", ")}`);
      continue;
    }
    assert.ok(s.prefer!.includes(s.biome), `${s.id} is in ${s.biome} but was not marked as settling`);
  }
  // The gull needs a shore, and this cell has one: if it settled, the demo's F5 beat is on the
  // wrong ground and the report must say so rather than the test passing quietly.
  const gull = snapped.find((s) => s.id === "gull")!;
  assert.equal(gull.biome, "beach", `the F5 beat needs a shore; the gull ended up in ${gull.biome}`);
  assert.ok(DEMO_LAND_BIOMES.includes(gull.biome as Biome));
  // And the witness follows it there, still outside CLOSE (2 tiles) so being seen stays a fact
  // rather than a conversation.
  const witness = snapped.find((s) => s.id === "witness")!;
  const apart = Math.hypot(witness.x - gull.x, witness.y - gull.y);
  assert.ok(apart > 2 && apart < 12, `the witness stands ${apart.toFixed(1)} tiles from the gull`);
});

test("the slice's two stations exist and are close enough to reach in a minute", () => {
  assert.deepEqual([...SLICE_STATIONS], ["cave_mouth", "campfire"]);
  for (const id of SLICE_STATIONS) {
    const s = snapped.find((x) => x.id === id)!;
    assert.ok(s, `${id} was not placed`);
    // 4 tiles per second, so 60 s of walking is 240 tiles; these are a stroll.
    assert.ok(Math.hypot(s.x, s.y) < 60, `${id} is ${Math.hypot(s.x, s.y).toFixed(0)} tiles away`);
  }
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
  const polygon = footprintLocalM(spawn);
  const [hx, hy] = stationLocalM(spawn, "homestead");
  assert.ok(inside(polygon, hx, hy), "the homestead marker sits outside its own footprint in metre space");
  // The y flip is the point of the helper: a polygon built without it is the wrong hexagon.
  const mirror = DEMO_FOOTPRINT.map(([dx, dy]) => [spawn.x + dx * TILE_M, spawn.y + dy * TILE_M] as [number, number]);
  assert.ok(!inside(mirror, hx, hy), "a footprint built without the y flip should be the wrong hexagon");
});

test("paths convert to metre segments with the requested width", () => {
  const paths = pathsLocalM(spawn, 4);
  assert.equal(paths.length, 5);
  assert.deepEqual(paths[0]!.a, [spawn.x, spawn.y]);
  assert.deepEqual(paths[0]!.b, stationLocalM(spawn, "cave_mouth"));
  assert.ok(paths.every((p) => p.widthM === 4));
});
