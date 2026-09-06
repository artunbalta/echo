/**
 * The far-band impostor (DECISIONS C21): it engages, it engages nowhere near, and it is the form.
 *
 * WHAT THIS FILE IS FOR, stated as the three failures it exists to catch.
 *
 * IT STOPS ENGAGING. A level of detail that quietly switches itself off is invisible: the world
 * still looks right, every other test still passes, and the frame is back to what it was. So the
 * guard in (d) is a TRIANGLE COUNT at a named camera, not a count of meshes and not a count of
 * instances, and it is bounded on both sides by two populations measured in the same process: the
 * far band as two triangles an instance, and the same instances at their full forms. A mesh count
 * would read 8 of 8 with every far mesh drawing nothing.
 *
 * IT ENGAGES TOO NEAR. That is the one failure a person would actually see, and it is the one
 * requirement 1 of the task is about. (c) measures it at the instance level over sixteen cameras on
 * two cells: nothing inside a class's own `lod.farM` may be in the far mesh, and the check is on
 * the distance from the LENS to the instance's own matrix, not on the bucket the layer sorted it
 * into. The other half of the same test is that the far mesh is not empty, because a far band that
 * never engages passes the first half perfectly.
 *
 * IT STOPS BEING THE FORM. The card is derived by rasterising the class's own geometry, and a
 * derivation is exactly the kind of thing that can drift into nonsense while still producing a
 * number. (a) and (b) hold it against sources that are not the derivation: the form's own bounding
 * box for its height, the trapezium's own algebra for its area and centroid, and the form's own
 * vertex colours for its colour.
 *
 * WHAT IT DOES NOT PROVE, and where that is proved instead. It calls `cull` itself, so it cannot
 * see whether the shipped page ever engages the far band at all: tests/e2e/scatterImpostor.spec.ts
 * reads `renderer.info` off the page a person opens, and it is also where the billboard's vertex
 * shader is measured, because there is no GLSL in node.
 *
 * Run:  node --import tsx --test apps/web/tests/scatterImpostor.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import {
  ASSET_CLASSES,
  createSceneHeight,
  createTangentPatch,
  createTerrain,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  DEMO_CELL,
  PARCEL_REGION_K,
  PLANET_PARAMS,
  regionBound,
  spawnPointFor,
  walkableAt,
  type AssetClass,
  type Calibration,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { localMToTile, tileToLocalM } from "../src/game/world/controller";
import { FOLLOW_CAMERA, initialFollowCamera, stepFollowCamera, type FollowCameraOptions, type FollowCameraState } from "../src/game/world/followCamera";
import { parcelLayers, sliceOptionsFor } from "../src/game/world/parcelWorld";
import type { MeasureChain } from "../src/game/world/measure";
import { scatterLayer, SHOULDER_HEIGHT_M, type ScatterLayer } from "../src/game/world/scatterLayer";
import { DEMO_SCATTER } from "../src/game/world/demoStations";
import { SCATTER_GEOMETRY } from "../src/game/world/scatterGeometry";
import { deriveImpostor, impostorFor, sweptRadius, IMPOSTOR_TRIANGLES } from "../src/game/world/scatterImpostor";
import { spawnView, SPAWN_HORIZON_MARGIN_DEG } from "../src/game/world/spawnView";
import { DUSK, KEY_DISTANCE_M, skyState } from "../src/game/world/skyLayer";
import { DEFAULT_SHADOW_HALF_M } from "../src/game/world/terrainChunks";
import type { LayerContext, WorldFrame } from "../src/game/world/PlanetWorld";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(resolve(here, "../../../packages/planet/tests/fixtures/goldens.echo-capacity-1.json"), "utf8"),
) as { calibration: Calibration; demoCell: string; seed: string };

/** The parcel every frame measurement in this project is taken on: 100% rainforest, no stations. */
const PARCEL_CELL = "8482589ffffffff";

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

async function build(cell: string, withSlice: boolean, impostors?: boolean): Promise<Built> {
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
    toScene: (x, y, liftM = 0, out = new THREE.Vector3()) => out.set(x * tileM, Math.max(0, heightAtTile(x, y)) + liftM, y * tileM),
    fromScene: (v) => [v.x / tileM, v.z / tileM],
    toLocalM,
    fromLocalM,
  };
  const spawnTile = fromLocalM(spawn.x, spawn.y);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, VIEW_W / VIEW_H, NEAR_M, FAR_M);
  const ctx: LayerContext = {
    scene: new THREE.Scene(),
    camera,
    renderer: null as unknown as THREE.WebGLRenderer,
    frame,
    field,
    calibration,
    seed,
    radiusKm: PLANET_PARAMS.radiusKm,
    region: { cell, k: PARCEL_REGION_K, bound, extentM: bound.radiusM, spawn, spawnTile },
    layer: () => undefined,
  };
  const chain = { armed: () => false, feedPosition: () => {} } as unknown as MeasureChain;
  // The layer is taken out of the list the app builds, with the argument the route passes, so a
  // mount that stops passing the slice fails here rather than passing. The impostor control is the
  // one thing the app never sets, and it builds its own.
  const layer =
    impostors === undefined
      ? (parcelLayers({ chain, slice: sliceOptionsFor(withSlice ? "slice" : null, {}) }).find((l) => l.name === "scatter") as ScatterLayer)
      : scatterLayer({ ...(withSlice ? DEMO_SCATTER : {}), impostors });
  await layer.build(ctx, new AbortController().signal);
  return { cell, ctx, layer, frame, spawn, spawnTile };
}

const demo = await build(DEMO_CELL, true);
const parcel = await build(PARCEL_CELL, false);

const classOf = (id: string): AssetClass => ASSET_CLASSES.find((c) => c.id === id)!;

// ── the cameras: the ones the game gives you, at the rim as well as at the spawn ─

/**
 * A lens at a tile position and a heading, built the way playerLayer builds one.
 *
 * The rim is the whole reason C21 exists, so these are not eight headings at the spawn: they are
 * stand points out at 240 m and 390 m LOOKING BACK across the disk, which is the view the decision
 * measured at 1,008,252 triangles. `walkableTile` drops the ones that are sea.
 */
function lensAt(b: Built, xTile: number, yTile: number, yaw: number): THREE.PerspectiveCamera {
  const opts: Partial<FollowCameraOptions> = { tileM: b.frame.tileM, nearM: NEAR_M };
  const view = spawnView(b.ctx.frame.patch, b.ctx.field, b.ctx.calibration.seaLevel, b.spawn.x, b.spawn.y, initialFollowCamera(), {
    fovDegrees: FOV_DEG,
    horizonMarginDeg: SPAWN_HORIZON_MARGIN_DEG,
  });
  const ground = (x: number, y: number) => Math.max(0, b.frame.heightAtTile(x, y));
  const state: FollowCameraState = { ...view.camera, yaw };
  const step = stepFollowCamera(state, { x: xTile, y: yTile, liftM: 0 }, { orbitDx: 0, orbitDy: 0, zoom: 0 }, 1 / 60, ground, opts);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, VIEW_W / VIEW_H, NEAR_M, FAR_M);
  camera.position.set(step.position[0], step.position[1], step.position[2]);
  camera.lookAt(step.lookAt[0], step.lookAt[1], step.lookAt[2]);
  camera.updateMatrixWorld();
  return camera;
}

function viewsFor(b: Built): Array<{ label: string; camera: THREE.PerspectiveCamera; x: number; y: number }> {
  const out: Array<{ label: string; camera: THREE.PerspectiveCamera; x: number; y: number }> = [];
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    out.push({ label: `the spawn, yaw ${((yaw * 180) / Math.PI).toFixed(0)}`, camera: lensAt(b, b.spawnTile[0], b.spawnTile[1], yaw), x: b.spawnTile[0], y: b.spawnTile[1] });
  }
  for (const rM of [240, 390]) {
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const x = b.spawnTile[0] + (rM * Math.cos(a)) / b.frame.tileM;
      const y = b.spawnTile[1] + (rM * Math.sin(a)) / b.frame.tileM;
      if (!b.frame.walkableTile(x, y)) continue;
      // Looking back across the disk: `cameraForward(yaw)` is [-sin yaw, -cos yaw] in tiles.
      const yaw = Math.atan2(-(b.spawnTile[0] - x), -(b.spawnTile[1] - y));
      out.push({ label: `${rM} m at ${((a * 180) / Math.PI).toFixed(0)} deg looking back`, camera: lensAt(b, x, y, yaw), x, y });
    }
  }
  return out;
}

function shadowCameraFor(b: Built, xTile: number, yTile: number): THREE.OrthographicCamera {
  const half = DEFAULT_SHADOW_HALF_M;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, KEY_DISTANCE_M * 2.2);
  const target = b.frame.toScene(xTile, yTile, 0);
  const from = skyState(DUSK).keyFrom;
  cam.position.set(target.x + from.x * KEY_DISTANCE_M, target.y + from.y * KEY_DISTANCE_M, target.z + from.z * KEY_DISTANCE_M);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

/** Every instance the packed prefix of a mesh holds, as its translation, to a millimetre. */
function packedKeys(mesh: THREE.InstancedMesh): Set<string> {
  const a = mesh.instanceMatrix.array as Float32Array;
  const out = new Set<string>();
  for (let i = 0; i < mesh.count; i++) out.add(`${a[i * 16 + 12]!.toFixed(3)},${a[i * 16 + 13]!.toFixed(3)},${a[i * 16 + 14]!.toFixed(3)}`);
  return out;
}

// ── (a) the card is the form's own silhouette ──────────────────────────────────

test("every impostor is two triangles standing where the form stands, as tall as the form is", () => {
  const lines: string[] = [];
  let worstShort = { id: "", rows: -Infinity };
  for (const id of Object.keys(SCATTER_GEOMETRY)) {
    const card = impostorFor(id);
    const p = card.profile;
    assert.equal(
      card.geometry.getAttribute("position").count / 3,
      IMPOSTOR_TRIANGLES,
      `${id}: the far form is not ${IMPOSTOR_TRIANGLES} triangles, which is the whole of what C21 buys`,
    );

    // THE HEIGHT, against a source that is not the derivation: the form's own bounding box. The
    // bound is written in ROWS OF THE RASTER, (top - bottom) / 64 of the form, and it is not
    // symmetric, because the two directions mean different things.
    //
    // TALLER THAN THE FORM IS FORBIDDEN. A card that stands above the skyline the forms draw is a
    // shape this world does not contain, and it would be visible as a fringe over the canopy at
    // exactly the distance nothing else is drawn at. Measured, the worst class is over by 0.05 of
    // one row.
    //
    // SHORTER IS ALLOWED, UP TO FOUR ROWS, and the cause is the raster and not the derivation: a
    // tip narrower than a raster column covers no pixel centre, so a thin spike at the top of a
    // form is simply not seen. The four classes that reach it are the ones with a spike, and the
    // worst is driftwood's broken branch at 3.66 rows, 29 mm of a 0.76 m form.
    const form = SCATTER_GEOMETRY[id]!();
    form.computeBoundingBox();
    const box = form.boundingBox!;
    const rowM = (box.max.y - box.min.y) / 64;
    form.dispose();
    const shortBy = ((box.max.y - box.min.y) - p.heightM) / rowM;
    assert.ok(
      shortBy >= -0.5,
      `${id}: the card stands ${p.heightM.toFixed(3)} m where the form is ${(box.max.y - box.min.y).toFixed(3)} m tall, ` +
        `${(-shortBy).toFixed(2)} raster rows TALLER than the thing it stands in for`,
    );
    assert.ok(
      shortBy <= 4,
      `${id}: the card stands ${p.heightM.toFixed(3)} m where the form is ${(box.max.y - box.min.y).toFixed(3)} m tall, ` +
        `short by ${shortBy.toFixed(2)} raster rows against the 4 a spike narrower than a raster column can hide in`,
    );
    const footBy = (p.footM - box.min.y) / rowM;
    assert.ok(
      footBy >= -0.5 && footBy <= 2,
      `${id}: the card's foot is at ${p.footM.toFixed(3)} m where the form's is at ${box.min.y.toFixed(3)} m, ` +
        `${footBy.toFixed(2)} raster rows off; a card that starts below the ground is buried and one that starts ` +
        `above it floats`,
    );
    if (shortBy > worstShort.rows) worstShort = { id, rows: shortBy };

    // THE AREA AND THE CENTROID, against the trapezium's own algebra rather than against the
    // rasteriser that measured them. Two equations were solved; these are the two equations.
    const area = ((p.widthBottomM + p.widthTopM) / 2) * p.heightM;
    assert.ok(
      Math.abs(area - p.areaM2) < 1e-6,
      `${id}: the card's widths give an area of ${area.toFixed(4)} m2 where the silhouette measured ` +
        `${p.areaM2.toFixed(4)}; the trapezium does not solve its own equation`,
    );
    if (!p.centroidClamped) {
      const centroid = (p.heightM * (p.widthBottomM + 2 * p.widthTopM)) / (3 * (p.widthBottomM + p.widthTopM));
      assert.ok(
        Math.abs(centroid - p.centroidM) < 1e-6,
        `${id}: the card's mass sits ${centroid.toFixed(4)} m up where the form's sits ${p.centroidM.toFixed(4)} m up`,
      );
    }
    assert.ok(p.widthBottomM >= 0 && p.widthTopM >= 0, `${id}: a negative width is not a shape`);
    lines.push(
      `${id.padEnd(15)} ${p.heightM.toFixed(2).padStart(6)} m tall, ${p.areaM2.toFixed(2).padStart(6)} m2, ` +
        `${p.widthBottomM.toFixed(2)} m at the foot to ${p.widthTopM.toFixed(2)} m at the head, cap ` +
        `${p.capRadius.toFixed(2)} at ${((p.capTiltRad * 180) / Math.PI).toFixed(0)} deg, ratio ` +
        `${p.ratioLow.toFixed(2)}-${p.ratioHigh.toFixed(2)} (mean ${p.ratioMean.toFixed(2)})`,
    );
  }
  for (const l of lines) console.log(`  ${l}`);
  console.log(`  the card is shortest against its form on ${worstShort.id}, by ${worstShort.rows.toFixed(2)} raster rows of 4 allowed`);
});

/**
 * How far the card's radiance may sit from the form's, over twelve azimuths and twelve hours.
 *
 * IT IS A BOUND ON THE FIT, not a reading off it, and it has to be loose enough to hold a class
 * whose form is nothing like a card and tight enough to reject a card that has stopped being fitted
 * at all. The two populations it sits between are measured in the test below on the same forms: the
 * shipped fit and the same derivation with the cap collapsed to a flat facet, which is the
 * unfitted card and is what every class's numbers looked like before the fit existed.
 */
const RATIO_BAND = 5;

/**
 * How many of the twenty-six classes the fit has to bring inside a band of two.
 *
 * The ceiling above is loose because it has to hold the litter: a thing lying on the ground faces
 * the sky and an upright card cannot, so at midday the ground catches the key and the card does
 * not, and fallen-log runs 0.45x to 4.20x whatever the normals do. A single loose ceiling would
 * therefore say nothing about the classes that CAN be matched, and the fit could quietly stop
 * fitting. So the second bound is a count, and the test below measures both populations on the same
 * forms in the same process: the shipped fit and the same derivation with the cap collapsed to a
 * flat facet, which is what an unfitted card is.
 */
const TIGHT_CLASSES = 18;

test("the card is lit like the form it replaces, and the fit is what makes it so", () => {
  let worst = { id: "", low: 1, high: 1 };
  let worstMean = { id: "", mean: 1 };
  let tight = 0;
  let tightFlat = 0;
  let better = 0;
  const flatWorst: string[] = [];
  for (const id of Object.keys(SCATTER_GEOMETRY)) {
    const p = impostorFor(id).profile;
    // The control: the same form, the same rasteriser, the same day, with the cap collapsed.
    const form = SCATTER_GEOMETRY[id]!();
    const flat = deriveImpostor(form, 0).profile;
    form.dispose();
    const bandOf = (x: { ratioLow: number; ratioHigh: number }) => Math.max(x.ratioHigh, 1 / x.ratioLow);
    if (bandOf(p) <= 2) tight++;
    if (bandOf(flat) <= 2) tightFlat++;
    if (bandOf(p) <= bandOf(flat) + 1e-9) better++;
    else flatWorst.push(`${id} ${bandOf(p).toFixed(2)}x fitted against ${bandOf(flat).toFixed(2)}x flat`);
    const band = Math.max(p.ratioHigh, 1 / p.ratioLow);
    assert.ok(
      band <= RATIO_BAND,
      `${id}: the card runs ${p.ratioLow.toFixed(2)}x to ${p.ratioHigh.toFixed(2)}x the form's own radiance over the ` +
        `day, a band of ${band.toFixed(2)}x against the ${RATIO_BAND}x this file allows. The far field would change ` +
        `brightness as the sun or the heading moves.`,
    );
    // And the other side: a fit that had collapsed to a constant would pass the band above by
    // making every class's card the same. The day-mean is what says the card carries the form's own
    // albedo and area rather than an average of everything.
    assert.ok(
      p.ratioMean > 0.85 && p.ratioMean < 1.2,
      `${id}: the card emits ${p.ratioMean.toFixed(2)}x the form's light averaged over the day, so the far field is ` +
        `uniformly ${p.ratioMean > 1 ? "brighter" : "darker"} than the world it stands in`,
    );
    if (band > Math.max(worst.high, 1 / worst.low)) worst = { id, low: p.ratioLow, high: p.ratioHigh };
    if (Math.abs(Math.log(p.ratioMean)) > Math.abs(Math.log(worstMean.mean))) worstMean = { id, mean: p.ratioMean };
  }
  const total = Object.keys(SCATTER_GEOMETRY).length;
  assert.equal(
    flatWorst.length,
    0,
    `the fit chose a cap that is WORSE than no cap at all on ${flatWorst.length} classes: ${flatWorst.join("; ")}. ` +
      `The search includes a radius of zero, so this cannot happen unless the scoring and the geometry disagree.`,
  );
  assert.ok(
    tight >= TIGHT_CLASSES,
    `the fit brings only ${tight} of ${total} classes inside a ratio band of two, against the ${TIGHT_CLASSES} this ` +
      `file requires. A flat-faced card manages ${tightFlat}. The fit has stopped fitting.`,
  );
  assert.ok(
    tight > tightFlat,
    `${tight} of ${total} classes are inside a band of two with the fit and ${tightFlat} without it, so the fitted ` +
      `normals are buying nothing and the extra number in the profile is decoration`,
  );
  console.log(
    `  worst ratio band: ${worst.id} at ${worst.low.toFixed(2)}x to ${worst.high.toFixed(2)}x of ${RATIO_BAND}x allowed; ` +
      `worst day-mean ${worstMean.id} at ${worstMean.mean.toFixed(2)}x; inside a band of two: ${tight} of ${total} ` +
      `fitted against ${tightFlat} flat-faced, and the fit is no worse than flat on all ${better}`,
  );
});

// ── (b) the colour is the form's own, and therefore PALETTE's ──────────────────

test("the card's colour is a blend of the form's own colours and never a new one", () => {
  for (const id of Object.keys(SCATTER_GEOMETRY)) {
    const p = impostorFor(id).profile;
    const form = SCATTER_GEOMETRY[id]!();
    const colours = form.getAttribute("color").array as Float32Array;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < colours.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (colours[i + k]! < lo[k]!) lo[k] = colours[i + k]!;
        if (colours[i + k]! > hi[k]!) hi[k] = colours[i + k]!;
      }
    }
    form.dispose();
    for (let k = 0; k < 3; k++) {
      const c = p.colour[k]!;
      assert.ok(
        c >= lo[k]! - 1e-6 && c <= hi[k]! + 1e-6,
        `${id}: the card's ${"rgb"[k]} is ${c.toFixed(4)}, outside the ${lo[k]!.toFixed(4)} to ${hi[k]!.toFixed(4)} its ` +
          `own form uses. Every part of every form is a PALETTE entry or a blend of two, so a colour outside that ` +
          `range is a twelfth paint chip nobody argued for.`,
      );
      // A weighted mean with every weight positive is STRICTLY inside wherever the parts disagree,
      // so a card that had quietly taken one part's colour lands on a bound and fails here.
      if (hi[k]! - lo[k]! > 1e-4) {
        assert.ok(
          c > lo[k]! + 1e-9 && c < hi[k]! - 1e-9,
          `${id}: the card's ${"rgb"[k]} sits exactly on ${c === lo[k] ? "the darkest" : "the brightest"} of the form's ` +
            `own parts, so it is one part's colour and not the silhouette's mean`,
        );
      }
    }
  }
});

test("the card lives inside the form's own bounding sphere, so the bucket boxes did not have to grow", () => {
  const grew: string[] = [];
  for (const id of Object.keys(SCATTER_GEOMETRY)) {
    const form = SCATTER_GEOMETRY[id]!();
    const sphere = form.boundingSphere!;
    const swept = sweptRadius(impostorFor(id).geometry, sphere.center);
    form.dispose();
    if (swept > sphere.radius) grew.push(`${id} ${(swept - sphere.radius).toFixed(2)} m of ${sphere.radius.toFixed(2)}`);
    assert.ok(
      swept <= sphere.radius * 1.05,
      `${id}: the card sweeps ${swept.toFixed(2)} m about the form's sphere centre where the form's own sphere is ` +
        `${sphere.radius.toFixed(2)} m, more than 5% wider. Every bucket box in the class grows by that much on ` +
        `every side, in the SHADOW frustum as well as the eye's, which moves DECISIONS C20's numbers for nothing.`,
    );
  }
  // The claim in scatterImpostor.ts's own header, pinned: one class of twenty-six, and by how much.
  assert.equal(grew.length, 1, `the card grows the cull sphere of ${grew.length} classes: ${grew.join("; ")}`);
  console.log(`  the card grows one class's cull sphere: ${grew[0]}`);
});

// ── (c) it engages, and it engages nowhere near ────────────────────────────────

test("nothing inside a class's own farM is ever drawn as a card, and the far mesh is never empty", () => {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let closest = { m: Infinity, id: "", farM: 0, where: "" };
  let engaged = 0;
  let views = 0;

  for (const b of [demo, parcel]) {
    for (const v of viewsFor(b)) {
      views++;
      b.layer.cull(v.camera, shadowCameraFor(b, v.x, v.y));
      eye.setFromMatrixPosition(v.camera.matrixWorld);
      const report = b.layer.lastCull()!;
      if (report.impostorInstances > 0) engaged++;

      for (const [id, far] of b.layer.impostorMeshes) {
        const farM = classOf(id).lod.farM;
        const a = far.instanceMatrix.array as Float32Array;
        for (let i = 0; i < far.count; i++) {
          matrix.fromArray(a, i * 16);
          matrix.decompose(position, quaternion, scale);
          const d = position.distanceTo(eye);
          if (d < closest.m) closest = { m: d, id, farM, where: `${b.cell.slice(0, 7)} ${v.label}` };
          assert.ok(
            d >= farM,
            `${b.cell} ${v.label}: a ${id} standing ${d.toFixed(1)} m from the lens is drawn as a card, inside its own ` +
              `lod.farM of ${farM} m. This is the failure requirement 1 of C21 is about: the near field changed.`,
          );
        }

        // The two buffers must be a PARTITION of what the main pass draws. An instance in both is
        // drawn twice, which no triangle count would notice and a translucent edge would.
        const near = packedKeys(b.layer.meshes.get(id)!);
        let both = 0;
        for (const k of packedKeys(far)) if (near.has(k)) both++;
        assert.equal(both, 0, `${b.cell} ${v.label} ${id}: ${both} instances are in the full mesh AND the far mesh`);
      }
    }
  }

  assert.ok(
    engaged >= views / 2,
    `the far band engaged at only ${engaged} of ${views} views. Every assertion above is vacuous where it does not, ` +
      `so a level of detail that never engages passes this test perfectly.`,
  );
  console.log(
    `  far band engaged at ${engaged} of ${views} views; the nearest instance ever drawn as a card is a ${closest.id} at ` +
      `${closest.m.toFixed(1)} m against its own farM of ${closest.farM} m, at ${closest.where}`,
  );
});

// ── (d) THE GUARD: triangles submitted for a known camera ──────────────────────

/**
 * The rim view C21 was decided on, named so the guard is about one frame and not about an average.
 *
 * 390 m from the spawn looking back across the disk is where the decision measured 1,008,252
 * triangles and where the bucket grid removes almost nothing, because from out there almost the
 * whole disk is inside the cone. The azimuth is the worst of the six the sweep in (c) walks.
 */
const RIM_M = 390;
const RIM_DEG = 60;

/**
 * What the far band must be worth at that camera, as a SHARE of what those same instances would
 * have cost at their full forms.
 *
 * Both sides are measured in this process on the same frame: `farBandFullTriangles` is what the
 * layer would have submitted for exactly the instances it turned into cards, and
 * `impostorTriangles` is what it submitted instead. The ratio is bounded rather than the absolute,
 * because the absolute is a number about this seed and this cell and would have to be rewritten
 * every time the ecology moved; the ratio is two triangles against the class's own form and is the
 * thing C21 promises. Measured at 3.9x on the parcel and 4.2x on the demo.
 */
const IMPOSTOR_SAVING = 3;

test("at the rim the far band is drawn as cards, and the triangles say so", () => {
  for (const b of [demo, parcel]) {
    const a = (RIM_DEG * Math.PI) / 180;
    const x = b.spawnTile[0] + (RIM_M * Math.cos(a)) / b.frame.tileM;
    const y = b.spawnTile[1] + (RIM_M * Math.sin(a)) / b.frame.tileM;
    assert.ok(b.frame.walkableTile(x, y), `${b.cell}: the named rim stand point is not land, so this guard measures nothing`);
    const camera = lensAt(b, x, y, Math.atan2(-(b.spawnTile[0] - x), -(b.spawnTile[1] - y)));
    b.layer.cull(camera, shadowCameraFor(b, x, y));
    const r = b.layer.lastCull()!;

    assert.ok(
      r.impostorTriangles > 0,
      `${b.cell}: standing ${RIM_M} m out at ${RIM_DEG} degrees and looking back, the far band submitted no triangles ` +
        `at all. DECISIONS C21 has stopped engaging: every instance in the cone is being drawn at its full form.`,
    );
    assert.equal(
      r.impostorTriangles,
      r.impostorInstances * IMPOSTOR_TRIANGLES,
      `${b.cell}: the far band submitted ${r.impostorTriangles} triangles for ${r.impostorInstances} instances, which is ` +
        `not ${IMPOSTOR_TRIANGLES} each`,
    );
    const saving = r.farBandFullTriangles / r.impostorTriangles;
    assert.ok(
      saving >= IMPOSTOR_SAVING,
      `${b.cell}: the far band cost ${r.impostorTriangles.toLocaleString()} triangles where the same instances at their ` +
        `full forms cost ${r.farBandFullTriangles.toLocaleString()}, only ${saving.toFixed(2)}x against the ` +
        `${IMPOSTOR_SAVING}x this file requires. Either the cards have grown or the band has filled up with classes ` +
        `whose forms were already cheap.`,
    );
    // And the frame as a whole: what the main pass submits against what it would have submitted.
    const full = r.mainTriangles - r.impostorTriangles + r.farBandFullTriangles;
    console.log(
      `  ${b.cell.slice(0, 7)} at ${RIM_M} m, ${RIM_DEG} deg looking back: main pass ${r.mainTriangles.toLocaleString()} ` +
        `triangles against ${full.toLocaleString()} at full form, ${(100 * (1 - r.mainTriangles / full)).toFixed(1)}% off; ` +
        `far band ${r.impostorInstances.toLocaleString()} instances, ${r.impostorTriangles.toLocaleString()} triangles ` +
        `against ${r.farBandFullTriangles.toLocaleString()} (${saving.toFixed(2)}x), in ${r.impostorMeshes} draw calls`,
    );
  }
});

// ── (e) the shadow pass did not move ───────────────────────────────────────────

test("the far band never casts, and DECISIONS C20's shadow pass reads the same with it and without", async () => {
  for (const [cell, slice] of [
    [PARCEL_CELL, false],
    [DEMO_CELL, true],
  ] as const) {
    const on = cell === PARCEL_CELL ? parcel : demo;
    // The same cell with the far band switched off, built in this process so the comparison is a
    // difference and not two remembered numbers.
    const off = await build(cell, slice, false);
    try {
      assert.equal(off.layer.impostorMeshes.size, 0, `${cell}: the control still built far meshes`);
      for (const v of viewsFor(on)) {
        const shadow = shadowCameraFor(on, v.x, v.y);
        on.layer.cull(v.camera, shadow);
        off.layer.cull(v.camera, shadow);
        const a = on.layer.lastCull()!;
        const b = off.layer.lastCull()!;
        assert.equal(
          a.shadowTriangles,
          b.shadowTriangles,
          `${cell} ${v.label}: the shadow pass submits ${a.shadowTriangles.toLocaleString()} triangles with the far band ` +
            `and ${b.shadowTriangles.toLocaleString()} without it. C21 is a MAIN PASS change; a difference here means the ` +
            `bucket boxes grew to hold the cards and C20's measurements no longer describe the shipped world.`,
        );
        assert.equal(a.shadowMeshes, b.shadowMeshes, `${cell} ${v.label}: the shadow pass draw calls moved`);
      }
      console.log(`  ${cell.slice(0, 7)}: the shadow pass is identical with the far band and without, at all ${viewsFor(on).length} views`);
    } finally {
      off.layer.dispose!();
    }
  }
});

test("no class that casts a shadow is ever past its own farM inside the shadow box", () => {
  // WHY IT CANNOT BE, and then the measurement rather than the argument. The shadow box is 240 m
  // wide and follows the lens, so nothing in it is more than about 435 m from the lens at a 16
  // degree sun; the shortest farM among the classes C20 still lets cast is 700 m. So a caster in
  // the box is never in the far band, the twin keeps the full form, and the card never has to cast.
  const casting = ASSET_CLASSES.filter((c) => c.castsShadow && c.collider !== null && c.collider.heightM >= SHOULDER_HEIGHT_M);
  assert.ok(casting.length > 0, "no class casts at all, so this proves nothing");
  const shortest = Math.min(...casting.map((c) => c.lod.farM));
  // The furthest a caster inside the box can be from the lens: the box's own diagonal from a centre
  // 12 m ahead of the lens, at the elevation the key stands at.
  const from = skyState(DUSK).keyFrom;
  const elevation = Math.asin(Math.max(1e-6, from.y));
  const reach = 12 + DEFAULT_SHADOW_HALF_M * Math.sqrt(2) + DEFAULT_SHADOW_HALF_M / Math.tan(elevation);
  assert.ok(
    shortest > reach,
    `the shortest farM among the classes that still cast is ${shortest} m (${casting.filter((c) => c.lod.farM === shortest).map((c) => c.id).join(", ")}), ` +
      `and a caster inside the ${2 * DEFAULT_SHADOW_HALF_M} m shadow box can stand ${reach.toFixed(0)} m from the lens at a ` +
      `${((elevation * 180) / Math.PI).toFixed(0)} degree sun. So a caster CAN be in the far band, its shadow would be cast ` +
      `by the full form while its silhouette is a card, and scatterImpostor.ts's header says that cannot happen. ` +
      `Correct the header, or give the far band a shadow of its own.`,
  );
  console.log(
    `  the shortest casting farM is ${shortest} m against the ${reach.toFixed(0)} m a caster inside the shadow box can ` +
      `reach: the far band never casts, and never has to`,
  );
});

// ── (f) not one instance moved ────────────────────────────────────────────────

test("every matrix the far mesh draws is a matrix the placer produced, bit for bit", () => {
  // The billboard reads `cameraPosition`, which is in WORLD space, against the instance's
  // translation, which is in the mesh's own space. The two are the same space only while the mesh's
  // world matrix is the identity. The layer adds every InstancedMesh straight to the scene and
  // never transforms one, and this is where that stops being a habit and becomes a promise: parent
  // a scatter mesh to anything with a transform and every card in the world turns the wrong way.
  for (const b of [demo, parcel]) {
    for (const [id, far] of b.layer.impostorMeshes) {
      far.updateMatrixWorld(true);
      assert.ok(
        far.matrixWorld.equals(new THREE.Matrix4()),
        `${b.cell} ${id}: the far mesh's world matrix is not the identity, so the shader's world-space camera and its ` +
          `local-space instance positions are in different frames and every card faces the wrong way`,
      );
    }
  }
  for (const b of [demo, parcel]) {
    for (const v of viewsFor(b).slice(0, 6)) {
      b.layer.cull(v.camera, shadowCameraFor(b, v.x, v.y));
      for (const [id, far] of b.layer.impostorMeshes) {
        if (far.count === 0) continue;
        const buckets = b.layer.buckets.get(id)!;
        const source = new Set<string>();
        const key = (a: Float32Array, i: number) => {
          let s = "";
          for (let k = 0; k < 16; k++) s += `${a[i * 16 + k]!},`;
          return s;
        };
        for (let i = 0; i < buckets.instances; i++) source.add(key(buckets.matrices, i));
        const a = far.instanceMatrix.array as Float32Array;
        for (let i = 0; i < far.count; i++) {
          assert.ok(
            source.has(key(a, i)),
            `${b.cell} ${v.label} ${id}: the far mesh draws instance ${i} at a matrix the placement does not contain. ` +
              `The card is a different GEOMETRY, never a different PLACE.`,
          );
        }
      }
    }
  }
});
