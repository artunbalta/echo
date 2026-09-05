/**
 * The split culls, and it culls nothing that is on screen (task A7).
 *
 * WHAT THIS FILE IS FOR, stated as the failure it exists to catch. scatterLayer used to put one
 * InstancedMesh per class in the scene with one bounding sphere over the whole 4 km disk, so
 * nothing was ever frustum culled and every instance was submitted every frame: 844,775 triangles
 * in the main pass and 594,335 more through the shadow pass on the ordinary parcel, against a
 * whole-frame ceiling of 600,000. The split sorts each class's instances into a grid of buckets and
 * copies only the buckets a camera can see into the mesh's instance buffer. Two things can go wrong
 * with that and only one of them is loud. If it culls too little, the frame is slow and nothing
 * looks amiss. If it culls too much, geometry vanishes at an angle, which is the classic instancing
 * bug and is invisible to any test that counts instances.
 *
 * SO EVERY ASSERTION HERE IS TWO-SIDED, and the upper and lower halves come from different places.
 * The lower half, nothing may vanish, is measured against a per-instance frustum test written out
 * in this file over the instance matrices the mesh actually holds and the form's own bounding
 * sphere, which is the pair the renderer uses. The upper half, it must actually cull, is measured
 * against the same frame with the grid collapsed to one bucket per class, which is the layer as it
 * shipped before A7.
 *
 * WHAT IT DOES NOT PROVE, and where that is proved instead. It calls `cull` itself, so it cannot
 * see whether the app ever calls it: tests/e2e/scatterSplit.spec.ts reads `renderer.info` off the
 * shipped page for that. And it says nothing about whether an instance is in the RIGHT PLACE, only
 * that the split did not move it: scatter.test.mts measures seating against the triangles the
 * terrain layer uploaded, and is the file that would catch a frame conversion going wrong.
 *
 * Run:  node --import tsx --test apps/web/tests/scatterSplit.test.mts
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
  DEMO_CELL,
  DEMO_NEAR_FIELD_M,
  PARCEL_REGION_K,
  PLANET_PARAMS,
  regionBound,
  spawnPointFor,
  walkableAt,
  type Calibration,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { localMToTile, tileToLocalM } from "../src/game/world/controller";
import { FOLLOW_CAMERA, initialFollowCamera, stepFollowCamera, type FollowCameraOptions, type FollowCameraState } from "../src/game/world/followCamera";
import { parcelLayers, sliceOptionsFor } from "../src/game/world/parcelWorld";
import type { MeasureChain } from "../src/game/world/measure";
import { DEFAULT_BUCKET_M, scatterLayer, type ScatterLayer } from "../src/game/world/scatterLayer";
import { DEMO_SCATTER } from "../src/game/world/demoStations";
import { spawnView, SPAWN_HORIZON_MARGIN_DEG } from "../src/game/world/spawnView";
import { DUSK, KEY_DISTANCE_M, skyState } from "../src/game/world/skyLayer";
import { DEFAULT_SHADOW_HALF_M } from "../src/game/world/terrainChunks";
import type { LayerContext, WorldFrame } from "../src/game/world/PlanetWorld";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8"),
) as { calibration: Calibration; demoCell: string; seed: string };
assert.equal(golden.demoCell, DEMO_CELL, "the goldens were written for a different demo cell");

/** The parcel A7 was measured on: 100% rainforest, no stations, the densest of the shipped routes. */
const PARCEL_CELL = "8482589ffffffff";

/**
 * PlanetWorld's own camera, and the viewport the whole phase has been measured at.
 *
 * The three numbers are `new THREE.PerspectiveCamera(50, 1, 0.1, 6000)` in PlanetWorld's
 * constructor and the 1280 by 800 the browser measurements were taken at. They are restated rather
 * than imported because that constructor allocates a GL context in its next line; a change to them
 * changes what this file measures and not whether it passes, and the browser guard is measured on
 * the real one.
 */
const FOV_DEG = 50;
const VIEW_W = 1280;
const VIEW_H = 800;
const NEAR_M = 0.1;
const FAR_M = 6000;

// ── one world, without a renderer ───────────────────────────────────────────────

interface Built {
  cell: string;
  ctx: LayerContext;
  layer: ScatterLayer;
  frame: WorldFrame;
  spawn: { x: number; y: number };
  spawnTile: [number, number];
}

async function build(cell: string, withSlice: boolean, bucketM?: number): Promise<Built> {
  const seed = golden.seed;
  const calibration = golden.calibration;
  const field = createTerrain(seed);
  const patch = createTangentPatch(cell, PLANET_PARAMS.radiusKm);
  const bound = regionBound(cell, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
  const spawn = spawnPointFor(cell, field, calibration, PLANET_PARAMS.radiusKm)!;
  const tileM = TILE_M;
  const heightScaleM = DEFAULT_SCENE_OPTIONS.heightScaleM;
  const resolutionM = DEFAULT_REGION_OPTIONS.resolution;
  const toLocalM = (x: number, y: number) => tileToLocalM(x, y, tileM);
  const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, tileM);
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
  const camera = new THREE.PerspectiveCamera(FOV_DEG, VIEW_W / VIEW_H, NEAR_M, FAR_M);
  const ctx: LayerContext = {
    scene: new THREE.Scene(),
    camera,
    // The layer must never touch the renderer. If it starts to, this is where it finds out.
    renderer: null as unknown as THREE.WebGLRenderer,
    frame,
    field,
    calibration,
    seed,
    radiusKm: PLANET_PARAMS.radiusKm,
    region: { cell, k: PARCEL_REGION_K, bound, extentM: bound.radiusM, spawn, spawnTile },
    layer: () => undefined,
  };

  // The layer is taken out of the list the app builds, with the argument the route passes, so a
  // mount that stops passing the slice fails here rather than passing. The one exception is the
  // bucket sweep, which needs an option the app never sets and therefore builds its own.
  const chain = { armed: () => false, feedPosition: () => {} } as unknown as MeasureChain;
  const layer =
    bucketM === undefined
      ? (parcelLayers({ chain, slice: sliceOptionsFor(withSlice ? "slice" : null, {}) }).find((l) => l.name === "scatter") as ScatterLayer)
      : scatterLayer({ ...(withSlice ? DEMO_SCATTER : {}), bucketM });
  await layer.build(ctx, new AbortController().signal);
  return { cell, ctx, layer, frame, spawn, spawnTile };
}

const demo = await build(DEMO_CELL, true);
const parcel = await build(PARCEL_CELL, false);

// ── the instrument: a frustum, written out here ─────────────────────────────────

/**
 * The six frustum planes of a camera, as inward unit normals plus a constant.
 *
 * Written out rather than taken from `THREE.Frustum`, because the layer culls with THREE.Frustum
 * and a test that asked the same object the same question would be checking that a function agrees
 * with itself. `THREE.Matrix4.elements` is column major, so element (row r, column c) is
 * `elements[c * 4 + r]`, and the planes are the four rows combined with the w row.
 */
function planesOfMatrix(m: THREE.Matrix4): Float64Array {
  const e = m.elements;
  const at = (r: number, c: number) => e[c * 4 + r]!;
  const out = new Float64Array(24);
  const put = (i: number, a: number, b: number, c: number, d: number) => {
    const len = Math.hypot(a, b, c);
    out[i * 4] = a / len;
    out[i * 4 + 1] = b / len;
    out[i * 4 + 2] = c / len;
    out[i * 4 + 3] = d / len;
  };
  for (let axis = 0; axis < 3; axis++) {
    put(axis * 2, at(3, 0) + at(axis, 0), at(3, 1) + at(axis, 1), at(3, 2) + at(axis, 2), at(3, 3) + at(axis, 3));
    put(axis * 2 + 1, at(3, 0) - at(axis, 0), at(3, 1) - at(axis, 1), at(3, 2) - at(axis, 2), at(3, 3) - at(axis, 3));
  }
  return out;
}

/** Does a world-space sphere meet the frustum those planes bound. */
function sphereInside(planes: Float64Array, x: number, y: number, z: number, r: number): boolean {
  for (let i = 0; i < 24; i += 4) {
    if (planes[i]! * x + planes[i + 1]! * y + planes[i + 2]! * z + planes[i + 3]! < -r) return false;
  }
  return true;
}

test("the frustum this file measures with is the frustum, checked against the clip volume itself", () => {
  // The ground truth for "inside the frustum" is not another plane extraction, it is the clip
  // volume: a point is inside exactly when -w <= x, y, z <= w after the projection-view matrix.
  // Sixteen thousand points over and around the demo's disk, at four camera states.
  const camera = new THREE.PerspectiveCamera(FOV_DEG, VIEW_W / VIEW_H, NEAR_M, FAR_M);
  const clip = new THREE.Vector4();
  const m = new THREE.Matrix4();
  let tested = 0;
  let inside = 0;
  for (let k = 0; k < 4; k++) {
    camera.position.set(120 * Math.cos(k), 40 + 10 * k, 120 * Math.sin(k));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const planes = planesOfMatrix(m);
    for (let i = 0; i < 4000; i++) {
      const x = ((i * 37) % 101) * 12 - 600;
      const y = ((i * 53) % 17) * 12 - 100;
      const z = ((i * 71) % 103) * 12 - 600;
      clip.set(x, y, z, 1).applyMatrix4(m);
      const w = clip.w;
      const byClip = w > 0 && Math.abs(clip.x) <= w && Math.abs(clip.y) <= w && Math.abs(clip.z) <= w;
      const byPlanes = sphereInside(planes, x, y, z, 0);
      assert.equal(byPlanes, byClip, `point (${x}, ${y}, ${z}) disagrees: planes ${byPlanes}, clip volume ${byClip}`);
      tested++;
      if (byClip) inside++;
    }
  }
  // A control that answers "outside" for everything would agree with nothing, so the sample has to
  // contain both answers for the agreement above to mean anything.
  assert.ok(inside > 200 && inside < tested - 200, `${inside} of ${tested} points inside; the sample is one-sided`);
});

// ── the cameras: the ones the game gives you ────────────────────────────────────

/**
 * The camera the player layer puts you behind, and the seven a drag can turn it to.
 *
 * These four lines are playerLayer's own: `spawnView` off the region's spawn, then
 * `stepFollowCamera` with the orbit the drag would have produced. A camera invented here would be
 * a camera nobody has, and the numbers below would describe a view of the world that never renders.
 */
function camerasFor(b: Built): Array<{ label: string; camera: THREE.PerspectiveCamera }> {
  const opts: Partial<FollowCameraOptions> = { tileM: b.frame.tileM, nearM: NEAR_M };
  const view = spawnView(
    b.ctx.frame.patch,
    b.ctx.field,
    b.ctx.calibration.seaLevel,
    b.spawn.x,
    b.spawn.y,
    initialFollowCamera(),
    { fovDegrees: FOV_DEG, horizonMarginDeg: SPAWN_HORIZON_MARGIN_DEG },
  );
  const ground = (x: number, y: number) => Math.max(0, b.frame.heightAtTile(x, y));
  const at = { x: b.spawnTile[0], y: b.spawnTile[1], liftM: 0 };
  const out: Array<{ label: string; camera: THREE.PerspectiveCamera }> = [];
  let state: FollowCameraState = view.camera;
  for (let k = 0; k < 8; k++) {
    // An eighth of a turn per step, expressed as the pixels of drag that would produce it through
    // the shipped radians-per-pixel, so the eight views are eight drags and not eight numbers.
    const dragPx = (Math.PI / 4) / FOLLOW_CAMERA.orbitRadPerPx;
    const step = stepFollowCamera(state, at, { orbitDx: k === 0 ? 0 : dragPx, orbitDy: 0, zoom: 0 }, 1 / 60, ground, opts);
    state = step.state;
    const camera = new THREE.PerspectiveCamera(FOV_DEG, VIEW_W / VIEW_H, NEAR_M, FAR_M);
    camera.position.set(step.position[0], step.position[1], step.position[2]);
    camera.lookAt(step.lookAt[0], step.lookAt[1], step.lookAt[2]);
    camera.updateMatrixWorld();
    out.push({ label: `yaw ${((state.yaw * 180) / Math.PI).toFixed(0)} deg`, camera });
  }
  return out;
}

/**
 * The key light's shadow camera, built the way terrainChunks builds it: the exported half width,
 * the exported key distance, and the dusk sun direction the sky layer derives from the art bible.
 * The box is aimed at the spawn, which is where the terrain layer aims it when you are standing
 * there.
 */
function shadowCameraFor(b: Built): THREE.OrthographicCamera {
  const half = DEFAULT_SHADOW_HALF_M;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, KEY_DISTANCE_M * 2.2);
  const target = b.frame.toScene(b.spawnTile[0], b.spawnTile[1], 0);
  const from = skyState(DUSK).keyFrom;
  cam.position.set(target.x + from.x * KEY_DISTANCE_M, target.y + from.y * KEY_DISTANCE_M, target.z + from.z * KEY_DISTANCE_M);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

// ── (a) not one instance moved ──────────────────────────────────────────────────

/**
 * The demo's two numbers, pinned exactly rather than to a tolerance.
 *
 * scatterLayer's header has quoted them since W2-3 and they are what the station exclusions and the
 * spawn falloff produce; a split that changed either would not be a split. There is no honest
 * tolerance on "the same instances", so there is none.
 */
const DEMO_DISK_INSTANCES = 43_018;
const DEMO_NEAR_INSTANCES = 5_905;

test("the buckets hold the placement, all of it, once each, and the demo's counts have not moved", async () => {
  for (const b of [demo, parcel]) {
    const placement = b.layer.placement()!;
    let total = 0;
    for (const [id, buckets] of b.layer.buckets) {
      const byClass = (placement.byClass as Record<string, number>)[id];
      assert.equal(buckets.instances, byClass, `${b.cell} ${id}: ${buckets.instances} bucketed against ${byClass} placed`);
      // The buckets tile the instance array end to end: no instance in two buckets, none in none.
      let cursor = 0;
      for (let i = 0; i < buckets.start.length; i++) {
        assert.equal(buckets.start[i], cursor, `${id} bucket ${i} does not start where bucket ${i - 1} ended`);
        assert.ok(buckets.length[i]! > 0, `${id} bucket ${i} is empty and should not exist`);
        cursor += buckets.length[i]!;
      }
      assert.equal(cursor, buckets.instances, `${id}: the buckets cover ${cursor} of ${buckets.instances} instances`);
      total += buckets.instances;
    }
    assert.equal(total, placement.placed.length, `${b.cell}: ${total} bucketed against ${placement.placed.length} placed`);
    assert.deepEqual(
      [...b.layer.buckets.keys()].sort(),
      Object.keys(placement.byClass).sort(),
      `${b.cell}: the classes with buckets are not the classes with instances`,
    );
  }

  const placement = demo.layer.placement()!;
  assert.equal(placement.placed.length, DEMO_DISK_INSTANCES);
  const near = placement.placed.filter(
    (p) => Math.hypot(p.x - demo.spawn.x, p.y - demo.spawn.y) <= DEMO_NEAR_FIELD_M,
  ).length;
  assert.equal(near, DEMO_NEAR_INSTANCES);
  console.log(
    `split: ${placement.placed.length.toLocaleString()} instances over the demo disk, ${near.toLocaleString()} within ` +
      `${DEMO_NEAR_FIELD_M} m, in ${[...demo.layer.buckets.values()].reduce((s, x) => s + x.start.length, 0)} buckets ` +
      `at ${DEFAULT_BUCKET_M} m; parcel ${parcel.layer.placement()!.placed.length.toLocaleString()} in ` +
      `${[...parcel.layer.buckets.values()].reduce((s, x) => s + x.start.length, 0)}`,
  );
});

test("the grid is a reordering and nothing else: one bucket per class draws the same matrices", async () => {
  // 4,000 m is wider than the whole region, so every class lands in a single bucket. If the grid
  // did anything to an instance other than decide which mesh submits it, these two multisets would
  // differ. Sorted keys rather than a set, because two ferns may legitimately share a matrix.
  const collapsed = await build(DEMO_CELL, true, 4000);
  try {
    for (const [id, fine] of demo.layer.buckets) {
      const coarse = collapsed.layer.buckets.get(id)!;
      // Up to four, not one: the region straddles the origin, so a grid wider than the region
      // still cuts it along x = 0 and z = 0. Four buckets over a 4 km disk is a collapse.
      assert.ok(coarse.start.length <= 4, `${id} did not collapse: ${coarse.start.length} buckets at 4,000 m`);
      assert.equal(fine.instances, coarse.instances);
      const key = (m: Float32Array, i: number) => {
        let s = "";
        for (let k = 0; k < 16; k++) s += `${m[i * 16 + k]!.toFixed(6)},`;
        return s;
      };
      const a: string[] = [];
      const c: string[] = [];
      for (let i = 0; i < fine.instances; i++) {
        a.push(key(fine.matrices, i));
        c.push(key(coarse.matrices, i));
      }
      a.sort();
      c.sort();
      assert.deepEqual(a, c, `${id}: the ${DEFAULT_BUCKET_M} m grid and the one-bucket build draw different matrices`);
    }
  } finally {
    collapsed.layer.dispose!();
  }
});

// ── (b) the boxes are right, and they are not slack ─────────────────────────────

test("every instance is inside its own bucket's box and inside the mesh's sphere, and the boxes fit", () => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const centre = new THREE.Vector3();

  for (const b of [demo, parcel]) {
    for (const [id, mesh] of b.layer.meshes) {
      const buckets = b.layer.buckets.get(id)!;
      // The sphere the RENDERER uses for this form, not the one the layer computed a box from.
      const local = mesh.geometry.boundingSphere!;
      const meshSphere = mesh.boundingSphere!;
      let worstOut = { d: -Infinity, i: -1, bucket: -1 };
      let worstSphere = -Infinity;
      let widest = 0;
      let maxReach = 0;

      for (let bucket = 0; bucket < buckets.start.length; bucket++) {
        const o = bucket * 6;
        const first = buckets.start[bucket]!;
        const last = first + buckets.length[bucket]!;
        for (let i = first; i < last; i++) {
          matrix.fromArray(buckets.matrices, i * 16);
          matrix.decompose(position, quaternion, scale);
          centre.copy(local.center).applyMatrix4(matrix);
          const r = local.radius * scale.x;
          if (r > maxReach) maxReach = r;
          // How far the instance's own sphere pokes out of its bucket's box, on the worst axis.
          const out = Math.max(
            buckets.box[o]! - (centre.x - r),
            buckets.box[o + 1]! - (centre.y - r),
            buckets.box[o + 2]! - (centre.z - r),
            centre.x + r - buckets.box[o + 3]!,
            centre.y + r - buckets.box[o + 4]!,
            centre.z + r - buckets.box[o + 5]!,
          );
          if (out > worstOut.d) worstOut = { d: out, i, bucket };
          const outSphere = centre.distanceTo(meshSphere.center) + r - meshSphere.radius;
          if (outSphere > worstSphere) worstSphere = outSphere;
        }
        const wx = buckets.box[o + 3]! - buckets.box[o]!;
        const wz = buckets.box[o + 5]! - buckets.box[o + 2]!;
        if (Math.max(wx, wz) > widest) widest = Math.max(wx, wz);
      }

      assert.ok(
        worstOut.d <= 0,
        `${b.cell} ${id}: instance ${worstOut.i} pokes ${(worstOut.d * 1000).toFixed(1)} mm out of bucket ` +
          `${worstOut.bucket}'s box, so it would vanish when that bucket is culled`,
      );
      assert.ok(
        worstSphere <= 1e-6,
        `${b.cell} ${id}: an instance pokes ${worstSphere.toFixed(3)} m out of the mesh's own bounding sphere, ` +
          `which three culls the whole object by before a bucket gets a say`,
      );
      // The other side: a box big enough to hold everything culls nothing. A bucket is one grid
      // cell, so its span cannot exceed the cell plus the widest form's own reach on each side.
      const allowed = DEFAULT_BUCKET_M + 2 * maxReach + 0.01;
      assert.ok(
        widest <= allowed,
        `${b.cell} ${id}: a bucket box spans ${widest.toFixed(1)} m against ${allowed.toFixed(1)} m of grid plus form ` +
          `(${DEFAULT_BUCKET_M} m cell, ${maxReach.toFixed(1)} m reach); a box that loose is a bucket that never culls`,
      );
    }
  }
});

// ── (c) the measurement the whole change is for ─────────────────────────────────

/**
 * How much MORE the split may submit than a per-instance cull would, at the same camera.
 *
 * A bucket is drawn whole, so the split always submits some instances a per-instance test would
 * drop: those sharing a bucket with something on screen. That surplus is the price of the grid, and
 * a bound on it is what makes this an upper bound rather than a shrug. It has to sit between two
 * measured populations and the test below measures BOTH of them on the same frames, so it can never
 * quietly become a number nothing can breach:
 *
 *   the shipped 16 m grid          1.06x to 1.92x over sixteen route-and-heading pairs
 *   one bucket per class, which
 *   is the layer as it shipped
 *   before A7                      3.12x to 105.7x over the same sixteen
 *
 * The worst shipped reading, 1.92, is the parcel with its back to the forest, where 1.8% of the
 * class is on screen and one bucket of ferns is most of what is left: the ratio is largest exactly
 * where the absolute number is smallest, 15,356 triangles of 844,775. 2.5 clears every shipped
 * reading by 30% and every collapsed one is at least 1.25x above it.
 */
const BUCKET_SURPLUS = 2.5;

/**
 * What the collapsed grid must exceed on every frame, so the bound above is proven to separate the
 * two configurations rather than asserted to. It has to be greater than BUCKET_SURPLUS or the two
 * assertions could both hold with the split doing nothing; the least collapsed reading is 3.12.
 */
const COLLAPSED_SURPLUS_FLOOR = 2.6;

test("the split submits what the camera can see and little else, at eight headings on two cells", async () => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const pv = new THREE.Matrix4();
  const lines: string[] = [];
  let worstShipped = 0;
  let leastCollapsed = Infinity;

  for (const b of [demo, parcel]) {
    // The same cell built with a grid wider than the region, which is the layer as it shipped
    // before A7: one mesh per class, one box, nothing ever culled. It is built here rather than
    // remembered so the bound above is measured against a live configuration on the same frames.
    const collapsed = await build(b.cell, b.cell === DEMO_CELL, 4000);
    try {
      for (const { label, camera } of camerasFor(b)) {
        pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const planes = planesOfMatrix(pv);

        // What a per-instance cull would submit, and which instances those are. Computed here, from
        // the matrices and the form's own sphere, with the planes this file extracted.
        let mustTriangles = 0;
        const must = new Map<string, Set<number>>();
        for (const [id, mesh] of b.layer.meshes) {
          const buckets = b.layer.buckets.get(id)!;
          const local = mesh.geometry.boundingSphere!;
          const tri = mesh.geometry.getAttribute("position").count / 3;
          const set = new Set<number>();
          for (let i = 0; i < buckets.instances; i++) {
            matrix.fromArray(buckets.matrices, i * 16);
            matrix.decompose(position, quaternion, scale);
            centre.copy(local.center).applyMatrix4(matrix);
            if (!sphereInside(planes, centre.x, centre.y, centre.z, local.radius * scale.x)) continue;
            set.add(i);
            mustTriangles += tri;
          }
          must.set(id, set);
        }
        assert.ok(mustTriangles > 0, `${b.cell} ${label}: nothing is on screen at all, so this view proves nothing`);

        b.layer.cull(camera, null);
        const report = b.layer.lastCull()!;
        collapsed.layer.cull(camera, null);
        const flat = collapsed.layer.lastCull()!;

        // Nothing vanished: every instance the per-instance test kept is in the packed buffer. The
        // check is on the MATRIX, not on the count, because a split that packed the wrong bucket
        // would pass a count and draw the wrong trees.
        let missing = 0;
        let firstMissing = "";
        for (const [id, mesh] of b.layer.meshes) {
          const buckets = b.layer.buckets.get(id)!;
          const arr = mesh.instanceMatrix.array as Float32Array;
          const keyOf = (a: Float32Array, i: number) =>
            `${a[i * 16 + 12]!.toFixed(3)},${a[i * 16 + 13]!.toFixed(3)},${a[i * 16 + 14]!.toFixed(3)}`;
          const packed = new Set<string>();
          for (let i = 0; i < mesh.count; i++) packed.add(keyOf(arr, i));
          for (const i of must.get(id)!) {
            if (packed.has(keyOf(buckets.matrices, i))) continue;
            missing++;
            if (!firstMissing) firstMissing = `${id} instance ${i}`;
          }
        }
        assert.equal(
          missing,
          0,
          `${b.cell} ${label}: ${missing} instances the camera can see are not in what the split packed ` +
            `(first: ${firstMissing}). This is the bug where geometry vanishes at an angle.`,
        );

        // And it actually culled, against a bound that is measured to lie between the shipped grid
        // and the collapsed one on this very frame.
        const surplus = report.mainTriangles / mustTriangles;
        const flatSurplus = flat.mainTriangles / mustTriangles;
        worstShipped = Math.max(worstShipped, surplus);
        leastCollapsed = Math.min(leastCollapsed, flatSurplus);
        assert.ok(
          surplus <= BUCKET_SURPLUS,
          `${b.cell} ${label}: the split submitted ${report.mainTriangles.toLocaleString()} triangles where a ` +
            `per-instance cull submits ${mustTriangles.toLocaleString()}, a surplus of ${surplus.toFixed(2)}x against the ` +
            `${BUCKET_SURPLUS}x a ${DEFAULT_BUCKET_M} m grid is allowed. One bucket per class costs ` +
            `${flatSurplus.toFixed(2)}x on this same frame, so the grid has stopped culling.`,
        );
        assert.ok(
          flatSurplus >= COLLAPSED_SURPLUS_FLOOR,
          `${b.cell} ${label}: one bucket per class costs only ${flatSurplus.toFixed(2)}x a per-instance cull, under the ` +
            `${COLLAPSED_SURPLUS_FLOOR}x this bound is meant to sit below. The two configurations are not separated ` +
            `here, so the ${BUCKET_SURPLUS}x above is not a bound on anything at this view.`,
        );
        // One draw call per class with something left, which is what the whole design is for.
        assert.ok(
          report.mainMeshes <= b.layer.meshes.size,
          `${b.cell} ${label}: ${report.mainMeshes} draw calls for ${b.layer.meshes.size} classes`,
        );
        lines.push(
          `${b.cell.slice(0, 7)} ${label.padEnd(12)} ${String(report.mainTriangles).padStart(7)} of ` +
            `${String(report.unsplitMainTriangles).padStart(7)} (${((100 * report.mainTriangles) / report.unsplitMainTriangles).toFixed(1)}%), ` +
            `${surplus.toFixed(2)}x a per-instance cull against the collapsed grid's ${flatSurplus.toFixed(1)}x, ` +
            `${report.mainMeshes} draw calls`,
        );
      }
    } finally {
      collapsed.layer.dispose!();
    }
  }
  for (const l of lines) console.log(`  ${l}`);
  console.log(
    `  surplus over a per-instance cull: shipped grid worst ${worstShipped.toFixed(2)}x of ${BUCKET_SURPLUS}x allowed, ` +
      `collapsed grid best ${leastCollapsed.toFixed(2)}x of ${COLLAPSED_SURPLUS_FLOOR}x required`,
  );
});

// ── (d) the shadow pass has its own set, and the main pass does not draw it ─────

test("the twin is packed against the shadow camera, and the main pass draws none of it", () => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const pv = new THREE.Matrix4();

  for (const b of [demo, parcel]) {
    const camera = camerasFor(b)[0]!.camera;
    const shadow = shadowCameraFor(b);
    pv.multiplyMatrices(shadow.projectionMatrix, shadow.matrixWorldInverse);
    const planes = planesOfMatrix(pv);

    b.layer.cull(camera, shadow);
    const report = b.layer.lastCull()!;
    assert.ok(report.shadowMeshes > 0, `${b.cell}: nothing casts a shadow, so this proves nothing`);

    for (const [id, twin] of b.layer.shadowMeshes) {
      const buckets = b.layer.buckets.get(id)!;
      const local = twin.geometry.boundingSphere!;
      const arr = twin.instanceMatrix.array as Float32Array;
      const keyOf = (a: Float32Array, i: number) => `${a[i * 16 + 12]!.toFixed(3)},${a[i * 16 + 13]!.toFixed(3)},${a[i * 16 + 14]!.toFixed(3)}`;
      const packed = new Set<string>();
      for (let i = 0; i < twin.count; i++) packed.add(keyOf(arr, i));
      let missing = 0;
      for (let i = 0; i < buckets.instances; i++) {
        matrix.fromArray(buckets.matrices, i * 16);
        matrix.decompose(position, quaternion, scale);
        centre.copy(local.center).applyMatrix4(matrix);
        if (!sphereInside(planes, centre.x, centre.y, centre.z, local.radius * scale.x)) continue;
        if (!packed.has(keyOf(buckets.matrices, i))) missing++;
      }
      assert.equal(missing, 0, `${b.cell} ${id}: ${missing} casters inside the shadow box are not in the twin's buffer`);
      assert.ok(twin.count < buckets.instances, `${b.cell} ${id}: the twin submits all ${buckets.instances} casters, so it culls nothing`);
      assert.equal(twin.castShadow, true, `${b.cell} ${id}: the twin does not cast, so nothing does`);
      assert.equal(b.layer.meshes.get(id)!.castShadow, false, `${b.cell} ${id}: the main mesh casts too, so the class is drawn twice`);

      // The handshake the main pass makes with the twin, played out in the order three plays it.
      const held = twin.count;
      twin.onBeforeRender(
        null as unknown as THREE.WebGLRenderer,
        null as unknown as THREE.Scene,
        null as unknown as THREE.Camera,
        twin.geometry,
        twin.material as THREE.Material,
        null as unknown as THREE.Group,
      );
      assert.equal(twin.count, 0, `${b.cell} ${id}: the twin would be drawn again by the main pass`);
      twin.onAfterRender(
        null as unknown as THREE.WebGLRenderer,
        null as unknown as THREE.Scene,
        null as unknown as THREE.Camera,
        twin.geometry,
        twin.material as THREE.Material,
        null as unknown as THREE.Group,
      );
      assert.equal(
        twin.count,
        held,
        `${b.cell} ${id}: the main pass left the twin at ${twin.count} of ${held}, so a second render of the same ` +
          `frame loses its shadows`,
      );
    }
    console.log(
      `  ${b.cell.slice(0, 7)} shadow: ${report.shadowTriangles.toLocaleString()} of ${report.unsplitShadowTriangles.toLocaleString()} ` +
        `casting triangles (${((100 * report.shadowTriangles) / report.unsplitShadowTriangles).toFixed(1)}%) in ${report.shadowMeshes} draw calls`,
    );
  }
});

// ── (e) the build discipline the layer already had ─────────────────────────────

test("a build aborted part way adds nothing to the scene and leaves no buckets behind", async () => {
  const controller = new AbortController();
  const seed = golden.seed;
  const field = createTerrain(seed);
  const bound = regionBound(PARCEL_CELL, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
  const spawn = spawnPointFor(PARCEL_CELL, field, golden.calibration, PLANET_PARAMS.radiusKm)!;
  const scene = new THREE.Scene();
  const ctx: LayerContext = { ...parcel.ctx, scene, region: { ...parcel.ctx.region, cell: PARCEL_CELL, spawn, bound } };
  const layer = scatterLayer();
  // Abort between the first yield and the second, which is where a real unmount lands.
  setTimeout(() => controller.abort(), 0);
  await layer.build(ctx, controller.signal);
  assert.equal(scene.children.filter((o) => o.name.startsWith("scatter:")).length, 0, "the aborted build left meshes in the scene");
  assert.equal(layer.meshes.size, 0);
  assert.equal(layer.shadowMeshes.size, 0);
  assert.equal(layer.buckets.size, 0);
  assert.equal(layer.placement(), null);
});

test("the split costs a small share of a build that was already 390 ms", () => {
  for (const b of [demo, parcel]) {
    const share = b.layer.splitMs() / b.layer.buildMs();
    assert.ok(
      share < 0.15,
      `${b.cell}: the bucket sort is ${b.layer.splitMs().toFixed(1)} ms of a ${b.layer.buildMs().toFixed(0)} ms build ` +
        `(${(share * 100).toFixed(1)}%); measured at 2.0% and 2.2% here and 2.2% and 1.6% in the browser, and past 15% it is no longer free`,
    );
    console.log(
      `  ${b.cell.slice(0, 7)}: bucket sort ${b.layer.splitMs().toFixed(1)} ms of ${b.layer.buildMs().toFixed(0)} ms ` +
        `(${(share * 100).toFixed(1)}%), cull ${b.layer.lastCull()!.ms.toFixed(3)} ms`,
    );
  }
});

test("the scene holds the main mesh and its twin, and dispose gives both back", () => {
  const scene = demo.ctx.scene;
  const named = scene.children.filter((o) => o.name.startsWith("scatter:"));
  assert.equal(named.length, demo.layer.meshes.size + demo.layer.shadowMeshes.size);
  for (const [id, twin] of demo.layer.shadowMeshes) {
    assert.equal(twin.geometry, demo.layer.meshes.get(id)!.geometry, `${id}: the twin has a second copy of the form`);
    assert.equal(twin.material, demo.layer.meshes.get(id)!.material, `${id}: the twin has a second copy of the material`);
  }
  demo.layer.dispose!();
  assert.equal(scene.children.filter((o) => o.name.startsWith("scatter:")).length, 0);
  assert.equal(demo.layer.buckets.size, 0);
  assert.equal(demo.layer.shadowMeshes.size, 0);
});
