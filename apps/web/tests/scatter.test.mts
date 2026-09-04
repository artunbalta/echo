/**
 * The scatter layer draws what the placer decided, and you can walk through what it drew.
 *
 * `placeAssets` shipped correct and unused: it ran in a ranking script and in a package test, and
 * nothing in the client ever turned its 43,018 answers into geometry, so the demo world was ground
 * and sky. That is the defect this file guards, and the guard has to be renderer-free to be worth
 * having, because headless WebGL in CI is not trustworthy and a screenshot would not have caught
 * an empty world any faster than a person did. So the layer is built here against a real
 * LayerContext with a real THREE.Scene and no renderer at all: instancing, matrices and bounding
 * spheres are pure arithmetic, and every assertion below is about numbers, not pixels.
 *
 * The frame is reconstructed the way PlanetWorld's constructor builds it. That constructor cannot
 * be reused because it allocates a GL context in its second half; its first half is arithmetic over
 * @echo/planet and is copied, not approximated, so a change to the frame breaks this file loudly.
 *
 * Run:  node --import tsx --test apps/web/tests/scatter.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import {
  createTangentPatch,
  createTerrain,
  DEFAULT_SCENE_OPTIONS,
  DEMO_ASSET_CLASSES,
  DEMO_CELL,
  DEMO_MEASURED,
  DEMO_NEAR_FIELD_M,
  DEMO_REGION_K,
  isLand,
  PLANET_PARAMS,
  regionBound,
  sceneHeightAt,
  spawnPointFor,
  walkableAt,
  type Calibration,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { initialMover, localMToTile, stepMover, tileToLocalM, type MoveInput, type MoverState } from "../src/game/world/controller";
import { SCATTER_GEOMETRY } from "../src/game/world/scatterGeometry";
import { scatterLayer } from "../src/game/world/scatterLayer";
import type { LayerContext, WorldFrame } from "../src/game/world/PlanetWorld";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8"),
) as { calibration: Calibration; demoCell: string; seed: string };
assert.equal(golden.demoCell, DEMO_CELL, "the goldens were written for a different demo cell; run scripts/write-goldens.ts");

// ── the world, without a renderer ───────────────────────────────────────────────

const seed = golden.seed;
const calibration = golden.calibration;
const field = createTerrain(seed);
const patch = createTangentPatch(DEMO_CELL, PLANET_PARAMS.radiusKm);
const bound = regionBound(DEMO_CELL, DEMO_REGION_K, PLANET_PARAMS.radiusKm);
const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;
const tileM = TILE_M;
const heightScaleM = DEFAULT_SCENE_OPTIONS.heightScaleM;

const toLocalM = (x: number, y: number) => tileToLocalM(x, y, tileM);
const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, tileM);
const heightAtTile = (x: number, y: number) => {
  const [xm, ym] = toLocalM(x, y);
  return sceneHeightAt(patch, field, calibration, xm, ym) * heightScaleM;
};
const frame: WorldFrame = {
  patch,
  tileM,
  heightScaleM,
  heightAtTile,
  walkableTile: (x, y) => {
    const [xm, ym] = toLocalM(x, y);
    return walkableAt(patch, field, calibration.seaLevel, xm, ym, bound);
  },
  toScene: (x, y, liftM = 0, out = new THREE.Vector3()) =>
    out.set(x * tileM, Math.max(0, heightAtTile(x, y)) + liftM, y * tileM),
  fromScene: (v) => [v.x / tileM, v.z / tileM],
  toLocalM,
  fromLocalM,
};

const spawnTile = fromLocalM(spawn.x, spawn.y);
const scene = new THREE.Scene();
const ctx: LayerContext = {
  scene,
  camera: new THREE.PerspectiveCamera(),
  // The layer must never touch the renderer. If it starts to, this is where it finds out.
  renderer: null as unknown as THREE.WebGLRenderer,
  frame,
  field,
  calibration,
  seed,
  radiusKm: PLANET_PARAMS.radiusKm,
  region: { cell: DEMO_CELL, k: DEMO_REGION_K, bound, extentM: bound.radiusM, spawn, spawnTile },
  layer: () => undefined,
};

const layer = scatterLayer();
await layer.build(ctx, new AbortController().signal);
const placement = layer.placement()!;
const colliders = layer.colliders()!;
const exclusions = layer.exclusions()!;
const blockingClasses = layer.blockingClasses();
const byId = new Map(DEMO_ASSET_CLASSES.map((c) => [c.id, c] as const));

/**
 * Point in a convex polygon, written out rather than imported from assets.ts on purpose: a test
 * that asks the code under test whether it excluded what it excluded is proving nothing.
 */
function insideConvex(polygon: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return polygon.length >= 3;
}

// ── (a) something is there, and all of it is on land ────────────────────────────

test("the layer dresses the demo cell, and every instance stands on land inside the region", () => {
  assert.ok(placement.placed.length > 10_000, `only ${placement.placed.length} instances placed`);
  assert.equal(placement.truncated, false, "the placer hit its ceiling; the far disk is bare");

  // Every demo class excludes "water", so this is a property of the whole placement and not a
  // per-class one. `walkableAt` is the mover's own predicate: land AND inside the built region, so
  // this also proves nothing was scattered past the edge of the ground the terrain layer drew.
  let dry = 0;
  for (const p of placement.placed) {
    if (!walkableAt(patch, field, calibration.seaLevel, p.x, p.y, bound)) {
      assert.fail(`${p.classId} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) is in the sea or outside the region`);
    }
    if (isLand(field, calibration.seaLevel, patch.toDirection(p.x, p.y))) dry++;
  }
  assert.equal(dry, placement.placed.length);

  // The near field is what B1's perceptibility test is run against. The exclusions this layer adds
  // (the parcel, the spawn clearing, the paths, the two stations) cost a little of DEMO_MEASURED,
  // which was taken with NO_EXCLUSIONS; a lot would mean the exclusions had eaten the world.
  const near = placement.placed.filter((p) => Math.hypot(p.x - spawn.x, p.y - spawn.y) <= DEMO_NEAR_FIELD_M);
  const shortfall = 1 - near.length / DEMO_MEASURED.nearInstances;
  assert.ok(shortfall < 0.05, `the near field is ${(shortfall * 100).toFixed(1)}% below the measured ${DEMO_MEASURED.nearInstances}`);
  assert.ok(new Set(near.map((p) => p.classId)).size >= DEMO_MEASURED.nearClasses);

  console.log(
    `scatter: ${placement.placed.length} instances over the disk, ${near.length} within ${DEMO_NEAR_FIELD_M} m ` +
      `(measured ${DEMO_MEASURED.diskInstances} / ${DEMO_MEASURED.nearInstances} without exclusions), ` +
      `built in ${layer.buildMs().toFixed(0)} ms`,
  );
});

// ── (b) the fire and the cave mouth stay clear ──────────────────────────────────

test("nothing that excludes footprints is inside one, so the stations and the parcel stay clear", () => {
  assert.ok(exclusions.footprints.length >= 4, "the parcel, the spawn clearing and the two slice stations");

  for (const p of placement.placed) {
    const cls = byId.get(p.classId)!;
    if (!cls.excludes.includes("footprint")) continue;
    for (const poly of exclusions.footprints) {
      assert.ok(!insideConvex(poly, p.x, p.y), `${p.classId} stands inside a cleared footprint`);
    }
  }

  // The property that actually matters: you can reach the fire and walk into the cave. Ground cover
  // (a fern, a shell) is welcome there; anything with a collider is not. Every colliding class
  // happens to exclude footprints, which is what makes the loop above sufficient, and asserting it
  // separately is what would catch a registry change that quietly stopped it being true.
  for (const p of placement.placed) {
    if (byId.get(p.classId)!.collider === null) continue;
    for (const poly of exclusions.footprints) {
      assert.ok(!insideConvex(poly, p.x, p.y), `a solid ${p.classId} blocks a station or the parcel`);
    }
  }
});

// ── (c) you do not wake up inside a tree ────────────────────────────────────────

test("the spawn is outside every collider, not merely outside the ones that block", () => {
  assert.equal(
    colliders.queryCircle(spawn.x, spawn.y, 0).length,
    0,
    "the player spawns inside a prop's disc",
  );
  // And with a body around it, and asked in the frame the mover actually asks in.
  assert.equal(layer.blockedTile(spawnTile[0], spawnTile[1], 0.35), false);
  assert.ok(frame.walkableTile(spawnTile[0], spawnTile[1]));
});

// ── (d) ten thousand steps ──────────────────────────────────────────────────────

/** A seeded generator, because a walk that is different every run proves a different thing daily. */
function rng(seedN: number): () => number {
  let s = seedN >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s >>> 12)) >>> 0;
    s = (Math.imul(s ^ (s >>> 7), 0x297a2d39) ^ (s >>> 15)) >>> 0;
    return s / 4294967296;
  };
}

test("ten thousand seeded steps from the spawn never end up inside a prop and never seal the player in", () => {
  const bodyRadiusM = 0.35;
  const blocked = (x: number, y: number) => layer.blockedTile(x, y, bodyRadiusM);
  const rand = rng(20260903);
  // Eight compass micro-steps: "stuck" means every one of these is refused, which is the only
  // honest reading of "cannot get out". A single refused step is not stuck, it is a tree.
  const compass: [number, number][] = [];
  for (let k = 0; k < 8; k++) compass.push([Math.cos((k / 8) * Math.PI * 2) * 0.05, Math.sin((k / 8) * Math.PI * 2) * 0.05]);

  let s: MoverState = initialMover(spawnTile[0], spawnTile[1]);
  let dir: [number, number] = [1, 0];
  let moved = 0;
  let stuckRun = 0;
  let worstStuckRun = 0;
  let sealed = 0;
  let maxDistTiles = 0;

  for (let i = 0; i < 10_000; i++) {
    // A new heading roughly twice a second, so the walk meets props from every angle rather than
    // running one line into the sea.
    if (i % 37 === 0) {
      const a = rand() * Math.PI * 2;
      dir = [Math.cos(a), Math.sin(a)];
    }
    const input: MoveInput = { dx: dir[0], dy: dir[1], run: false, jump: false, activity: null };
    const before = s;
    s = stepMover(s, input, 1 / 60, frame.walkableTile, blocked);

    // The invariant the whole exercise is for: the mover never puts the body inside a disc it
    // honours. It holds by induction from a clear spawn, and this is the induction being checked.
    const [xm, ym] = frame.toLocalM(s.x, s.y);
    for (const c of colliders.queryCircle(xm, ym, 0)) {
      assert.ok(!blockingClasses.has(c.classId), `step ${i} ended inside a ${c.classId}`);
    }
    assert.ok(frame.walkableTile(s.x, s.y), `step ${i} ended off walkable ground`);

    if (Math.hypot(s.x - before.x, s.y - before.y) < 1e-9) {
      stuckRun++;
      if (stuckRun > worstStuckRun) worstStuckRun = stuckRun;
      // Only worth asking when the body actually failed to move; asking every step would be eighty
      // thousand terrain evaluations for an answer that is trivially yes in the open.
      if (!compass.some(([dx, dy]) => frame.walkableTile(s.x + dx, s.y + dy) && !blocked(s.x + dx, s.y + dy))) sealed++;
    } else {
      stuckRun = 0;
      moved++;
    }
    const d = Math.hypot(s.x - spawnTile[0], s.y - spawnTile[1]);
    if (d > maxDistTiles) maxDistTiles = d;
  }

  assert.equal(sealed, 0, "the player was somewhere no direction could leave");
  assert.ok(moved > 9_000, `only ${moved} of 10,000 steps moved the body`);
  assert.ok(maxDistTiles > 20, `the walk never got further than ${maxDistTiles.toFixed(1)} tiles from the spawn`);
  /**
   * The bound on sticking, and why it is a bound and not a zero. A separate-axis slide against a
   * CIRCLE has a quadrant with no slide in it: push at a trunk's centre from the south-west and
   * both the east step and the north step move you closer, so both are refused, exactly as pushing
   * into a corner of a coastline refuses both. That is the mover's contract with
   * WorldRoom.integrate, not this layer's bug, and the escape is to steer, which the walk does at
   * its next heading. What is asserted is that steering always works within about three seconds.
   */
  assert.ok(worstStuckRun < 180, `the body was held still for ${worstStuckRun} frames (${(worstStuckRun / 60).toFixed(1)} s)`);
  console.log(
    `walk: ${moved}/10,000 steps moved, worst stall ${worstStuckRun} frames, reached ${maxDistTiles.toFixed(1)} tiles from spawn`,
  );
});

test("the mover with no obstacle predicate is byte for byte the mover the realtime server matches", () => {
  // The whole point of the predicate being optional: the server has never heard of a fern, and a
  // client that walked differently with props off would have desynced the moment one was added.
  const script: MoveInput[] = [];
  const rand = rng(7);
  for (let i = 0; i < 600; i++) {
    const a = rand() * Math.PI * 2;
    script.push({ dx: Math.cos(a), dy: Math.sin(a), run: i % 5 === 0, jump: false, activity: null });
  }
  const open = () => true;
  let a: MoverState = initialMover(0, 0);
  let b: MoverState = initialMover(0, 0);
  for (const input of script) {
    a = stepMover(a, input, 1 / 60, open);
    b = stepMover(b, input, 1 / 60, open, undefined);
  }
  assert.deepEqual(a, b);

  // And a predicate that blocks nothing changes nothing either.
  let c: MoverState = initialMover(0, 0);
  for (const input of script) c = stepMover(c, input, 1 / 60, open, () => false);
  assert.deepEqual(a, c);
});

// ── (e) the meshes are the placement ────────────────────────────────────────────

test("one InstancedMesh per class, sized to Placement.byClass, inside a bounding sphere that fits", () => {
  const drawn = new Map<string, number>();
  for (const [id, mesh] of layer.meshes) drawn.set(id, mesh.count);

  // Every class the placer used has a mesh, every mesh has a class, and the counts are equal. A
  // class that placed instances and drew none is the original defect in miniature.
  assert.deepEqual(
    [...drawn].sort((x, y) => x[0].localeCompare(y[0])),
    Object.entries(placement.byClass).sort((x, y) => x[0].localeCompare(y[0])),
  );
  assert.ok(layer.meshes.size <= 15, `${layer.meshes.size} draw calls added, the budget is 15`);

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let triangles = 0;

  for (const [id, mesh] of layer.meshes) {
    const perInstance = mesh.geometry.getAttribute("position").count / 3;
    assert.ok(perInstance <= 60, `${id} is ${perInstance} triangles; the silhouette budget is 60`);
    assert.ok(mesh.geometry.getAttribute("color"), `${id} has no vertex colours, so its parts are one colour`);
    triangles += perInstance * mesh.count;

    const cls = byId.get(id)!;
    assert.equal(mesh.castShadow, cls.castsShadow, `${id} does not cast what the registry says it casts`);
    assert.ok(mesh.instanceMatrix.needsUpdate || mesh.instanceMatrix.version >= 0);

    // The bounding sphere is the classic instancing bug: too small and the whole class blinks out
    // at the edge of the screen. Every instance's own sphere must sit inside the mesh's.
    const sphere = mesh.boundingSphere!;
    assert.ok(sphere && sphere.radius > 0, `${id} has no bounding sphere, so three would compute one per frame`);
    const local = mesh.geometry.boundingSphere!;
    let worst = { d: -Infinity, i: -1 };
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);
      const centre = local.center.clone().applyMatrix4(matrix);
      const d = centre.distanceTo(sphere.center) + local.radius * scale.x - sphere.radius;
      if (d > worst.d) worst = { d, i };
    }
    assert.ok(worst.d <= 1e-6, `${id} instance ${worst.i} pokes ${worst.d.toFixed(2)} m out of the mesh's bounding sphere`);

    // Instances stand on the ground the terrain draws, not on the placer's mask-quantised `z`,
    // which is sampled off a 10 m grid and would float things by whole metres on a slope. The
    // tolerance is 10 cm rather than nothing because an instance matrix is a Float32Array: a
    // position 500 m out of the anchor keeps about 3e-5 m, and the height field is re-evaluated at
    // that slightly different place. Ten centimetres is far below the metres a wrong source of
    // height would cost, which is what this is for.
    let worstLift = 0;
    for (let i = 0; i < mesh.count; i += Math.max(1, Math.floor(mesh.count / 200))) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);
      const [tx, ty] = frame.fromScene(position);
      worstLift = Math.max(worstLift, Math.abs(position.y - Math.max(0, frame.heightAtTile(tx, ty))));
    }
    assert.ok(worstLift < 0.1, `${id} sits ${worstLift.toFixed(2)} m off the ground the terrain layer drew`);
  }

  console.log(
    `meshes: ${layer.meshes.size} draw calls, ${triangles.toLocaleString()} triangles for the whole disk ` +
      `(${[...layer.meshes].map(([id]) => `${id} ${SCATTER_GEOMETRY[id]!().getAttribute("position").count / 3}t`).join(", ")})`,
  );
});

test("the scene holds exactly the meshes the layer built, and dispose gives them all back", () => {
  const added = scene.children.filter((o) => o.name.startsWith("scatter:"));
  assert.equal(added.length, layer.meshes.size);
  layer.dispose!();
  assert.equal(scene.children.filter((o) => o.name.startsWith("scatter:")).length, 0);
  assert.equal(layer.meshes.size, 0);
  assert.equal(layer.placement(), null);
  assert.equal(layer.colliders(), null);
  // With nothing built, the world is the world it was before W2-3: open ground.
  assert.equal(layer.blockedTile(spawnTile[0], spawnTile[1], 0.35), false);
});
