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
 * THE GROUND IS BUILT HERE TOO, and it is not scenery. Whether a prop stands on the ground can only
 * be answered against the surface that was UPLOADED, so the terrain layer is taken out of the same
 * list and built into its own scene, and (e) reads the triangles back out of its chunk geometry.
 * It gets a context of its own because it legitimately touches the renderer, to switch shadow maps
 * on, and the scatter's context has to keep its null renderer to go on proving the scatter does
 * not. The two contexts share ONE frame, which is the only thing that has to agree between them,
 * and (e) is the assertion that it did.
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
  createSceneHeight,
  createTangentPatch,
  createTerrain,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  DEMO_ASSET_CLASSES,
  DEMO_CELL,
  DEMO_MEASURED,
  DEMO_NEAR_FIELD_M,
  isLand,
  PARCEL_REGION_K,
  PLANET_PARAMS,
  regionBound,
  spawnPointFor,
  walkableAt,
  type Calibration,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { initialMover, localMToTile, stepMover, tileToLocalM, type MoveInput, type MoverState } from "../src/game/world/controller";
import type { MeasureChain } from "../src/game/world/measure";
import { parcelLayers, sliceOptionsFor } from "../src/game/world/parcelWorld";
import { SCATTER_GEOMETRY } from "../src/game/world/scatterGeometry";
import type { ScatterLayer } from "../src/game/world/scatterLayer";
import type { TerrainLayer } from "../src/game/world/terrainChunks";
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
const bound = regionBound(DEMO_CELL, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
const spawn = spawnPointFor(DEMO_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;
const tileM = TILE_M;
const heightScaleM = DEFAULT_SCENE_OPTIONS.heightScaleM;
const resolutionM = DEFAULT_REGION_OPTIONS.resolution;

const toLocalM = (x: number, y: number) => tileToLocalM(x, y, tileM);
const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, tileM);
// createSceneHeight, not a second copy of it: this frame stands in for PlanetWorld's, and the
// whole reason props sit on the ground is that the mesh and the seating come from one function.
const sceneHeight = createSceneHeight(patch, field, calibration, { heightScaleM, resolution: resolutionM });
const heightAtTile = (x: number, y: number) => {
  const [xm, ym] = toLocalM(x, y);
  return sceneHeight(xm, ym);
};
const frame: WorldFrame = {
  patch,
  tileM,
  heightScaleM,
  resolutionM,
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
  region: { cell: DEMO_CELL, k: PARCEL_REGION_K, bound, extentM: bound.radiusM, spawn, spawnTile },
  layer: () => undefined,
};

// The demo's stations are passed IN, which is the whole point of the layer being cell-agnostic:
// with no options at all it dresses a bare parcel from that cell's own biomes and clears only the
// buildable footprint and the spawn.
//
// The layer is TAKEN OUT OF THE LIST THE APP BUILDS rather than constructed here, with the same
// argument the demo's mount passes: a slice. That is the whole correction. This file used to build
// its own `scatterLayer(DEMO_SCATTER)` above a comment claiming it was the call the demo made,
// while the demo was calling `scatterLayer()` bare, and every number below was a true statement
// about a configuration that shipped nowhere while a fourteen metre tree stood in the cave mouth.
// Now there is one way to get this layer and the test uses it, so a mount that stops passing the
// slice fails here instead of passing.
const chain = { armed: () => false, feedPosition: () => {} } as unknown as MeasureChain;
const layers = parcelLayers({ chain, slice: sliceOptionsFor("slice", {}) });
const layer = layers.find((l) => l.name === "scatter") as ScatterLayer;

// The ground, from the same list, in the order parcelWorld.ts says the list has to be built in:
// terrain before scatter, because the scatter seats each prop on the ground the terrain drew.
//
// Its own scene and its own context. The scene, so `scene.children` below stays a statement about
// the scatter alone; the context, because `renderer` above is deliberately null and the terrain
// layer is entitled to reach for it. It sets exactly two fields on `shadowMap` and reads nothing
// back, so the stub is those two fields and no more: anything else the layer starts asking the
// renderer for fails here as a TypeError, which is the same alarm the null gives the scatter.
const groundScene = new THREE.Scene();
const groundCtx: LayerContext = {
  ...ctx,
  scene: groundScene,
  renderer: { shadowMap: { enabled: false, type: THREE.PCFShadowMap } } as unknown as THREE.WebGLRenderer,
};
const terrain = layers.find((l) => l.name === "terrain") as TerrainLayer;
await terrain.build(groundCtx, new AbortController().signal);

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

// ── the surface the renderer draws ──────────────────────────────────────────────

/**
 * The height of the DRAWN ground under a scene point, or null where no triangle covers it.
 *
 * This reads the terrain layer's own chunk geometry, which is the Float32Array `buildRegionScene`
 * emitted and `terrainChunks` uploaded untouched (it rewrites the colour attribute and nothing
 * else). Every triangle is filed under the grid squares its footprint overlaps and the answer is
 * the barycentric interpolation over whichever one contains the point, which is exactly what a
 * rasteriser does with the same three vertices. So "the ground" here means the surface a player
 * would see, not any function that claims to describe it.
 *
 * `bucketM` is an acceleration parameter and cannot change an answer: a triangle goes into every
 * bucket its bounding box touches, so a bucket larger or smaller than the mesh's own step only
 * changes how many candidates are tested. The key packs two signed bucket indices into one double
 * and is exact while both stay under 4,096, which is a 49 km radius at the shipped 12 m step.
 */
function drawnGroundUnder(meshes: readonly THREE.Mesh[], bucketM: number): (x: number, z: number) => number | null {
  let total = 0;
  for (const mesh of meshes) total += mesh.geometry.getAttribute("position").count / 3;
  // One flat copy in doubles rather than a walk back into three's attributes per query: 139k
  // triangles on the demo disk is 10 MB, paid once, against 43,018 lookups.
  const verts = new Float64Array(total * 9);
  const buckets = new Map<number, number[]>();
  const key = (bi: number, bj: number) => (bi + 4096) * 8192 + (bj + 4096);
  let t = 0;
  for (const mesh of meshes) {
    const a = mesh.geometry.getAttribute("position").array as Float32Array;
    for (let o = 0; o + 8 < a.length; o += 9, t++) {
      const at = t * 9;
      for (let k = 0; k < 9; k++) verts[at + k] = a[o + k]!;
      const i0 = Math.floor(Math.min(a[o]!, a[o + 3]!, a[o + 6]!) / bucketM);
      const i1 = Math.floor(Math.max(a[o]!, a[o + 3]!, a[o + 6]!) / bucketM);
      const j0 = Math.floor(Math.min(a[o + 2]!, a[o + 5]!, a[o + 8]!) / bucketM);
      const j1 = Math.floor(Math.max(a[o + 2]!, a[o + 5]!, a[o + 8]!) / bucketM);
      for (let bi = i0; bi <= i1; bi++) {
        for (let bj = j0; bj <= j1; bj++) {
          const k = key(bi, bj);
          let list = buckets.get(k);
          if (!list) buckets.set(k, (list = []));
          list.push(t);
        }
      }
    }
  }

  return (x: number, z: number): number | null => {
    const list = buckets.get(key(Math.floor(x / bucketM), Math.floor(z / bucketM)));
    if (!list) return null;
    for (const id of list) {
      const o = id * 9;
      const ax = verts[o]!;
      const ay = verts[o + 1]!;
      const az = verts[o + 2]!;
      const bx = verts[o + 3]!;
      const by = verts[o + 4]!;
      const bz = verts[o + 5]!;
      const cx = verts[o + 6]!;
      const cy = verts[o + 7]!;
      const cz = verts[o + 8]!;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (det === 0) continue;
      const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
      const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      const wc = 1 - wa - wb;
      // Slack on the shared edges, in barycentric units. A vertex is a Float32 and two triangles
      // meeting along an edge do not agree about it to the last bit, so a point on the seam has to
      // land in one of them rather than in neither.
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
      return wa * ay + wb * by + wc * cy;
    }
    return null;
  };
}

const heightOfDrawnGround = drawnGroundUnder(terrain.chunks, frame.resolutionM);

/**
 * How far a prop may sit off the drawn triangles before it is standing on a different surface.
 *
 * THE TWO THINGS THIS NUMBER SEPARATES, because for six revisions the assertion here separated
 * neither. What is ALLOWED is curvature: the mesh is a triangle lattice at `frame.resolutionM`, an
 * instance is seated by `frame.toScene`, which evaluates the height function at the exact point,
 * and between two lattice points the curved macro field and the flat triangle across it are not
 * the same surface. That gap is geometry and no tolerance can remove it. What must FAIL is a prop
 * seated off a DIFFERENT LATTICE from the one the mesh was built on, which is the bug the old
 * assertion here was blind to because it compared `frame.heightAtTile` with itself.
 *
 * MEASURED, over every instance rather than a sample, against the triangles the terrain layer
 * uploaded. On the demo the classes run 3.6 to 5.0 mm in mean magnitude and the worst instance
 * anywhere is 28.0 mm; on the ordinary parcel 8482589ffffffff, 1.1 to 1.2 mm mean, 2.5 mm at p95
 * and 40.7 mm worst, with 26 buttress-trees, 36 canopy-palms, 89 thickets and 131 ferns past a
 * centimetre. The worst any point of walkable ground in either region can be is 45.0 mm on the
 * demo and 96.6 mm on the parcel, so a prop is allowed to land there too.
 *
 * DECOMPOSED, because the split says who owns it. C2's displacement contributes EXACTLY ZERO: it
 * is built lattice-linear, so `createSceneHeight` interpolates it with the very weights the
 * triangle carries and the two cancel to the bit, and rebuilding both sides with `detail: null`
 * moves the worst by 0.01 mm. The whole gap is the macro field's curvature, scaled linearly by
 * heightScaleM, so C1's 900 to 2,700 tripled it: 0.43 mm mean and 22.65 mm worst before, 1.28 and
 * 67.94 after, on the parcel. That regression is owned and is not what this guards.
 *
 * SO THE NUMBER. Honest worst from curvature, 96.6 mm. Smallest cost of a second lattice, measured
 * by giving the frame a 24 m height function under a 12 m mesh: 231.9 mm, the least displaced
 * class of the eight on the parcel; the demo's least is 252.9 mm and its worst 803.0 mm. Fifteen
 * centimetres is the geometric mean of those two, 1.55x above every curvature reading and 1.55x
 * below the cheapest break, and the four lattices a reviewer tried, 24, 48, 96 and 192 m, cost 232
 * to 3,367 mm and all fail it. A prop 7 cm proud on a 12 m lattice is geometry; a prop 30 cm proud
 * is a second lattice.
 */
const SEATED_TOLERANCE_M = 0.15;

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
  let seated = 0;
  let liftTotal = 0;
  let worstSeating = { id: "", i: -1, lift: 0 };

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

    // Instances stand on the ground the terrain layer DREW, and this is the measurement, not a
    // restatement of it. `heightOfDrawnGround` finds the uploaded triangle under the instance
    // origin and interpolates its three corners; the only thing from the seating side is the
    // instance matrix. Nothing here evaluates a height function, which is the entire point: for six
    // revisions this compared `frame.heightAtTile` against `frame.toScene`, which IS
    // `max(0, heightAtTile)`, so it compared one call with another call to the same function at the
    // same point and reported the 3.7e-5 m an instance matrix loses to Float32. A reviewer put the
    // frame's height function on a 24, 48, 96 and 192 m lattice under a 12 m mesh, floating every
    // prop, and it reported 3.7e-5 all four times and passed all four. Measured against the drawn
    // triangles instead, those same four lattices lift the FIRST class this loop reaches, which is
    // also the least displaced of them, by 314, 795, 2,104 and 3,324 mm.
    //
    // EVERY INSTANCE, not one in two hundred. The old stride sampled 100 of 20,039 ferns, and the
    // instances that matter are the rare ones: on the parcel only 131 of those ferns clear a
    // centimetre at all, so a 0.5% sample would miss the tail this is looking at.
    let worstLift = 0;
    let worstAt = -1;
    let liftSum = 0;
    let offMesh = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);
      const groundY = heightOfDrawnGround(position.x, position.z);
      // Not a skip. An instance with no triangle under it is a prop standing off the end of the
      // world, and a lift measured over the ones that happen to be covered would hide it.
      if (groundY === null) {
        offMesh++;
        continue;
      }
      const lift = Math.abs(position.y - groundY);
      liftSum += lift;
      if (lift > worstLift) {
        worstLift = lift;
        worstAt = i;
      }
    }
    seated += mesh.count;
    liftTotal += liftSum;
    if (worstLift > worstSeating.lift) worstSeating = { id, i: worstAt, lift: worstLift };
    assert.equal(offMesh, 0, `${id}: ${offMesh} of ${mesh.count} instances stand where the terrain layer drew no triangle`);
    assert.ok(
      worstLift < SEATED_TOLERANCE_M,
      `${id} instance ${worstAt} sits ${(worstLift * 1000).toFixed(0)} mm off the triangles the terrain ` +
        `layer drew (mean ${((liftSum / mesh.count) * 1000).toFixed(1)} mm over ${mesh.count}). Curvature ` +
        `between ${frame.resolutionM} m lattice points is worth at most 97 mm anywhere measured; past ` +
        `${SEATED_TOLERANCE_M * 1000} mm the prop is seated by a different surface from the one uploaded.`,
    );
  }

  console.log(
    `meshes: ${layer.meshes.size} draw calls, ${triangles.toLocaleString()} triangles for the whole disk ` +
      `(${[...layer.meshes].map(([id]) => `${id} ${SCATTER_GEOMETRY[id]!().getAttribute("position").count / 3}t`).join(", ")})`,
  );
  console.log(
    `seating: ${seated.toLocaleString()} instances measured against ${terrain.chunks.length} drawn chunks, ` +
      `mean ${((liftTotal / seated) * 1000).toFixed(2)} mm off the triangles, worst ${worstSeating.id} ` +
      `instance ${worstSeating.i} at ${(worstSeating.lift * 1000).toFixed(1)} mm of the ` +
      `${SEATED_TOLERANCE_M * 1000} mm allowance`,
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

// ── (f) every class on the planet, not just the demo cell's ────────────────────

/**
 * The imports for this block live with it rather than in the header, because the block is an
 * append: everything above was written for DEMO_ASSET_CLASSES and none of it needs to move for
 * this. ESM hoists the declaration, so it binds before the first test runs.
 */
import { ASSET_CLASSES } from "@echo/planet";
import { hasScatterGeometry, SCATTER_MATERIAL } from "../src/game/world/scatterGeometry";

/**
 * The demo cell is rainforest and beach, and for a while the renderer only had forms for those, so
 * `/parcel/<some taiga cell>` placed thousands of conifers, warned once to a console nobody was
 * reading, and drew bare ground under the sky. Everything above this line is measured against
 * DEMO_ASSET_CLASSES and would have gone on passing. This block is measured against the whole
 * registry, which is the only version of the question that catches it.
 */
test("every asset class in the registry has a form, within budget and agreeing with its collider", () => {
  const missing = ASSET_CLASSES.filter((c) => !hasScatterGeometry(c.id)).map((c) => c.id);
  assert.deepEqual(missing, [], `no geometry for ${missing.join(", ")}: any cell with these biomes draws bare ground`);

  let worst = { id: "", ratio: 1 };
  const budget: string[] = [];

  for (const cls of ASSET_CLASSES) {
    const geometry = SCATTER_GEOMETRY[cls.id]!();
    const position = geometry.getAttribute("position");
    const triangles = position.count / 3;

    // Four is a pair of crossed cards, the cheapest thing that is still a form; forty is a third of
    // the way past the file's median and well under its own sixty ceiling. A class that wants more
    // than forty wants a silhouette it is not going to get at these distances.
    assert.ok(triangles >= 4 && triangles <= 40, `${cls.id} is ${triangles} triangles, outside 4..40`);
    if (triangles > 32) budget.push(`${cls.id} ${triangles}t`);

    assert.ok(geometry.getAttribute("color"), `${cls.id} has no vertex colours, so its parts are one colour`);
    assert.equal(geometry.index, null, "a form must be non-indexed, the way the merge leaves it");
    assert.equal(typeof SCATTER_MATERIAL[cls.id], "function", `${cls.id} has a form and no material`);

    // Height in the class frame, origin on the ground: this is what the collider has to agree with,
    // because a 9 m collider around a 3 m tree is a wall in front of nothing.
    const a = position.array as Float32Array;
    let top = -Infinity;
    for (let i = 1; i < a.length; i += 3) if (a[i]! > top) top = a[i]!;
    assert.ok(top > 0, `${cls.id} has no height at all`);

    if (!cls.collider) {
      // Null collider means you walk over it or through it. Over: the ground furniture, all under a
      // knee. Through: the two curtains, vine-tangle and reeds, which are cards and have no solid
      // in them to stop a body. Anything else tall with no collider is a thing you walk inside.
      const walkThrough = cls.id === "vine-tangle" || cls.id === "reeds";
      assert.ok(top < (walkThrough ? 4 : 1.2), `${cls.id} stands ${top.toFixed(2)} m tall with no collider`);
      geometry.dispose();
      continue;
    }

    /**
     * The band, and why it is a band. A form is allowed to overtop its collider, because the
     * collider is the trunk a body bumps into and the form is the whole plant: buttress-tree's
     * canopy sits at 1.09 of its collider and driftwood's one branch at 1.30, both correct. What it
     * may not do is fall short, because a collider taller than its mesh is an invisible wall. The
     * measured spread over all 26 is 0.89 to 1.30, so 0.6 to 1.6 is loose enough to leave art
     * decisions alone and tight enough that a form built to the wrong scale trips it.
     */
    const ratio = top / cls.collider.heightM;
    assert.ok(
      ratio >= 0.6 && ratio <= 1.6,
      `${cls.id} is ${top.toFixed(2)} m against a ${cls.collider.heightM} m collider (${ratio.toFixed(2)}x)`,
    );
    if (Math.abs(Math.log(ratio)) > Math.abs(Math.log(worst.ratio))) worst = { id: cls.id, ratio };
    geometry.dispose();
  }

  console.log(
    `forms: ${ASSET_CLASSES.length}/${ASSET_CLASSES.length} classes dressed, ` +
      `worst collider agreement ${worst.id} ${worst.ratio.toFixed(2)}x` +
      (budget.length ? `, heaviest ${budget.join(", ")}` : ""),
  );
});
