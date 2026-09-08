/**
 * What the GPU is handed every frame, against what the frame actually wrote (SOC-1.C).
 *
 * WHAT THIS FILE IS FOR, stated as the failure it exists to catch. detailLayer partitions the
 * scatter's packed prefix into a near set and a far set and then flagged BOTH instance buffers
 * dirty with no update range, which is three's instruction to re-send the whole array: 64,010
 * matrices per set, 3.91 MiB each, against the 1,237 matrices the partition wrote at the parcel
 * spawn. The waste is invisible to every existing test, because an upload that sends too much is
 * still an upload that sends the right bytes.
 *
 * SO THE TEST IS TWO-SIDED, and only one side is about cost. The cheap upload is worthless if it
 * sends the wrong prefix, and a wrong prefix is the classic instancing bug: geometry that is one
 * frame stale, or worse, matrices from a set nobody placed. So the fake GPU below starts every
 * buffer full of NaN, replays three r0.169's own upload rules over it, and the assertions are that
 * the drawn prefix is bit-for-bit the CPU's and that every matrix in it is one `placeAssets`
 * produced. `Object.is` rather than `===`, so a NaN that was never uploaded can never pass.
 *
 * Run:  node --import tsx --test apps/web/tests/detailUpload.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  createSceneHeight, createTangentPatch, createTerrain,
  DEFAULT_REGION_OPTIONS, DEFAULT_SCENE_OPTIONS, PARCEL_REGION_K, PLANET_PARAMS,
  regionBound, spawnPointFor, walkableAt, type Calibration,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";
import { localMToTile, tileToLocalM } from "../src/game/world/controller";
import { FOLLOW_CAMERA, initialFollowCamera, stepFollowCamera, type FollowCameraOptions, type FollowCameraState } from "../src/game/world/followCamera";
import { scatterLayer, type ScatterLayer } from "../src/game/world/scatterLayer";
import { detailLayer } from "../src/game/world/detailLayer";
import { spawnView, SPAWN_HORIZON_MARGIN_DEG } from "../src/game/world/spawnView";
import type { LayerContext, WorldFrame, WorldLayer } from "../src/game/world/PlanetWorld";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8")) as { calibration: Calibration; seed: string };
const PARCEL_CELL = "8482589ffffffff";
const FOV_DEG = 50, VIEW_W = 1280, VIEW_H = 800, NEAR_M = 0.1, FAR_M = 6000;

/**
 * How much more the frame may hand the GPU than it wrote.
 *
 * The two are not equal and cannot be: `packInto` uploads the packed prefix it wrote, and this
 * layer then shortens the same mesh to the far subset, so the frame legitimately sends matrices
 * the eye no longer draws. Measured over the nineteen frames below that surplus is 1.0x; the
 * layer as it shipped is 11.6x here and 99.3x standing still, so 2x separates them by fifty.
 */
const UPLOAD_SURPLUS = 2;

async function build() {
  const seed = golden.seed, calibration = golden.calibration;
  const field = createTerrain(seed);
  const patch = createTangentPatch(PARCEL_CELL, PLANET_PARAMS.radiusKm);
  const bound = regionBound(PARCEL_CELL, PARCEL_REGION_K, PLANET_PARAMS.radiusKm);
  const spawn = spawnPointFor(PARCEL_CELL, field, calibration, PLANET_PARAMS.radiusKm)!;
  const tileM = TILE_M, heightScaleM = DEFAULT_SCENE_OPTIONS.heightScaleM, resolutionM = DEFAULT_REGION_OPTIONS.resolution;
  const toLocalM = (x: number, y: number) => tileToLocalM(x, y, tileM);
  const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, tileM);
  const sceneHeight = createSceneHeight(patch, field, calibration, { heightScaleM, resolution: resolutionM });
  const heightAtTile = (x: number, y: number) => { const [xm, ym] = toLocalM(x, y); return sceneHeight(xm, ym); };
  const frame: WorldFrame = {
    patch, tileM, heightScaleM, resolutionM, heightAtTile,
    walkableTile: (x, y) => { const [xm, ym] = toLocalM(x, y); return walkableAt(patch, field, calibration.seaLevel, xm, ym, bound); },
    toScene: (x, y, liftM = 0, out = new THREE.Vector3()) => out.set(x * tileM, Math.max(0, heightAtTile(x, y)) + liftM, y * tileM),
    fromScene: (v) => [v.x / tileM, v.z / tileM], toLocalM, fromLocalM,
  };
  const spawnTile = fromLocalM(spawn.x, spawn.y);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, VIEW_W / VIEW_H, NEAR_M, FAR_M);
  const byName = new Map<string, WorldLayer>();
  const ctx: LayerContext = {
    scene: new THREE.Scene(), camera, renderer: null as unknown as THREE.WebGLRenderer,
    frame, field, calibration, seed, radiusKm: PLANET_PARAMS.radiusKm,
    region: { cell: PARCEL_CELL, k: PARCEL_REGION_K, bound, extentM: bound.radiusM, spawn, spawnTile },
    layer: (<T extends WorldLayer>(name: string) => byName.get(name) as T | undefined),
  };
  const scatter = scatterLayer() as ScatterLayer;
  const detail = detailLayer();
  byName.set("scatter", scatter); byName.set("detail", detail);
  const signal = new AbortController().signal;
  await scatter.build(ctx, signal);
  await detail.build(ctx, signal);
  const detailMeshes = new Map<string, THREE.InstancedMesh>();
  ctx.scene.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh && o.name.endsWith(":detail")) {
      detailMeshes.set(o.name.replace("scatter:", "").replace(":detail", ""), o as THREE.InstancedMesh);
    }
  });
  // The eight views camerasFor gives in scatterSplit.test.mts: the spawn view and seven drags.
  const opts: Partial<FollowCameraOptions> = { tileM, nearM: NEAR_M };
  const view = spawnView(patch, field, calibration.seaLevel, spawn.x, spawn.y, initialFollowCamera(), { fovDegrees: FOV_DEG, horizonMarginDeg: SPAWN_HORIZON_MARGIN_DEG });
  const ground = (x: number, y: number) => Math.max(0, heightAtTile(x, y));
  const at = { x: spawnTile[0], y: spawnTile[1], liftM: 0 };
  let state: FollowCameraState = view.camera;
  const cams: Array<{ label: string; pos: [number, number, number]; look: [number, number, number] }> = [];
  for (let k = 0; k < 8; k++) {
    const dragPx = (Math.PI / 4) / FOLLOW_CAMERA.orbitRadPerPx;
    const step = stepFollowCamera(state, at, { orbitDx: k === 0 ? 0 : dragPx, orbitDy: 0, zoom: 0 }, 1 / 60, ground, opts);
    state = step.state;
    cams.push({ label: `yaw ${((state.yaw * 180) / Math.PI).toFixed(0)}`, pos: step.position as [number, number, number], look: step.lookAt as [number, number, number] });
  }
  return { ctx, camera, scatter, detail, detailMeshes, cams };
}

/**
 * three r0.169's upload, replayed: `WebGLObjects.update` calls `attributes.update` on an
 * InstancedMesh's matrix once per `info.render.frame` (WebGLObjects.js:30), that skips an attribute
 * whose version has not moved (WebGLAttributes.js:205), and `updateBuffer` sends the WHOLE array
 * when `updateRanges` is empty and the listed ranges otherwise, clearing them after
 * (WebGLAttributes.js:83, :134, :143).
 */
class Gpu {
  readonly buffers = new Map<THREE.BufferAttribute, Float32Array>();
  private readonly versions = new Map<THREE.BufferAttribute, number>();
  bytes = 0;
  upload(attribute: THREE.BufferAttribute) {
    const array = attribute.array as Float32Array;
    let buffer = this.buffers.get(attribute);
    if (!buffer) { buffer = new Float32Array(array.length).fill(NaN); this.buffers.set(attribute, buffer); this.versions.set(attribute, -1); }
    if (this.versions.get(attribute) === attribute.version) return;
    this.versions.set(attribute, attribute.version);
    if (attribute.updateRanges.length === 0) { buffer.set(array); this.bytes += array.length * 4; return; }
    for (const range of attribute.updateRanges) {
      buffer.set(array.subarray(range.start, range.start + range.count), range.start);
      this.bytes += range.count * 4;
    }
    attribute.clearUpdateRanges();
  }
}

test("the prefix the GPU draws is the placement, bit for bit, and costs what the frame wrote", async () => {
  const w = await build();
  const gpu = new Gpu();
  const key = (a: Float32Array, i: number) => { let s = ""; for (let k = 0; k < 16; k++) s += `${a[i * 16 + k]},`; return s; };
  // The placement itself, as the layer bucketed it: the only matrices any mesh may draw.
  const placed = new Map<string, Set<string>>();
  for (const [id, buckets] of w.scatter.buckets) {
    const set = new Set<string>();
    for (let i = 0; i < buckets.instances; i++) set.add(key(buckets.matrices, i));
    placed.set(id, set);
  }
  let written = 0;
  // Eight headings, then three frames standing still, then the eight back: the still frames are
  // where `packInto` stops writing at all and the layer's own dirty flag is the only one left.
  const sequence = [...w.cams, w.cams[0]!, w.cams[0]!, w.cams[0]!, ...w.cams.slice().reverse()];
  for (const c of sequence) {
    w.detail.update!(1 / 60, w.ctx);
    w.camera.position.set(...c.pos);
    w.camera.lookAt(c.look[0], c.look[1], c.look[2]);
    w.camera.updateMatrixWorld();
    w.scatter.beforeRender!(w.ctx);
    w.detail.beforeRender!(w.ctx);
    for (const [id, mesh] of w.scatter.meshes) {
      const twin = w.detailMeshes.get(id)!;
      written += (mesh.count + twin.count) * 64;
    }
    for (const [, mesh] of w.scatter.meshes) gpu.upload(mesh.instanceMatrix);
    for (const [, twin] of w.detailMeshes) gpu.upload(twin.instanceMatrix);
    for (const [id, mesh] of w.scatter.meshes) {
      for (const drawn of [mesh, w.detailMeshes.get(id)!]) {
        const cpu = drawn.instanceMatrix.array as Float32Array;
        const buffer = gpu.buffers.get(drawn.instanceMatrix)!;
        for (let i = 0; i < drawn.count * 16; i++) {
          assert.ok(
            Object.is(buffer[i], cpu[i]),
            `${c.label} ${drawn.name}: float ${i} of the drawn prefix is ${buffer[i]} on the GPU and ${cpu[i]} on the CPU. ` +
              `The frame did not upload what it drew.`,
          );
        }
        for (let i = 0; i < drawn.count; i++) {
          assert.ok(placed.get(id)!.has(key(buffer, i)), `${c.label} ${drawn.name}: instance ${i} is a matrix the placement never produced.`);
        }
      }
    }
  }
  assert.ok(
    gpu.bytes <= written * UPLOAD_SURPLUS,
    `the frames handed the GPU ${(gpu.bytes / 1048576).toFixed(2)} MiB to draw ${(written / 1048576).toFixed(2)} MiB of matrices, ` +
      `${(gpu.bytes / written).toFixed(1)}x against the ${UPLOAD_SURPLUS}x allowed. A buffer flagged dirty with no update range ` +
      `re-sends all ${[...w.detailMeshes.values()].reduce((s, m) => s + m.instanceMatrix.count, 0).toLocaleString()} matrices of its class.`,
  );
  console.log(`  detail upload: ${(gpu.bytes / 1048576).toFixed(2)} MiB over ${sequence.length} frames to draw ${(written / 1048576).toFixed(2)} MiB`);
  w.detail.dispose!();
  w.scatter.dispose!();
});
