/**
 * The scatter layer (plan W2-3): the thing that makes the demo world stop being empty.
 *
 * `placeAssets` has been correct and unused since W2-2. It ran in a ranking script and in a node
 * test, decided that this cell holds 5,995 instances within 120 m of the spawn, and then nothing
 * drew a single one of them, so the world a player actually walked was bare ground. This layer is
 * the other half: it asks the registry where things stand and puts one InstancedMesh per class in
 * the scene at exactly those positions.
 *
 * WHAT IS DECIDED HERE AND WHAT IS NOT. Density, biome affinity, clustering, exclusions, scale and
 * rotation are all @echo/planet's; this file may not second-guess any of them, because the server
 * and the client have to agree about where a tree is. Forms are scatterGeometry.ts's. What is left
 * for this file is three things: converting the registry's local metres into three's frame THROUGH
 * `ctx.frame` and never by re-deriving it, keeping the build off the main thread in one piece, and
 * handing the collider index to whatever wants to walk around a tree instead of through it.
 *
 * THE FRAME. `PlacedAsset` is in planet-local metres, x east and y NORTH. Gameplay is in tiles,
 * x east and y SOUTH. The flip is exactly the bug that makes a world look right and be mirrored,
 * so every position goes `fromLocalM` then `toScene`, and `toScene` is what puts each instance on
 * the ground the terrain layer actually drew (`sceneHeightAt`, the I1 function) rather than on the
 * placer's `z`, which is sampled off a 10 m mask grid and can float a fern half a metre.
 *
 * COST, MEASURED. 388 ms for the whole build on the demo cell, of which two calls into @echo/planet
 * are 324 and neither can be split without forking a contract file: sampling the biome mask over
 * the 2,084 m disk at 10 m is 165 ms, and the placement is 159. They are bracketed by yields and by
 * abort checks, exactly as terrainChunks brackets its own single 150 ms `buildRegionScene`; the
 * remaining 81 ms is the instancing, which yields between every one of the fifteen classes. That is
 * the same discipline the terrain has, not a weaker one, and the same admission with it: a build is
 * two blocks the main thread cannot be given back during.
 *
 * WHAT IT PUTS ON SCREEN, on 847b949ffffffff: 43,018 instances over the disk and 5,905 within 120 m
 * of the spawn, against the 43,108 and 5,995 measure-demo-cell.ts reports with no exclusions at all;
 * the difference is the parcel, the spawn clearing, the two paths and the two stations, and it is
 * meant to be that small. Fifteen draw calls and 565,447 triangles, of which 391,267 also go through
 * the shadow pass.
 *
 * DRAW CALLS AND TRIANGLES. One InstancedMesh per class is fifteen draw calls for the whole disk,
 * which is what the budget allows. It is NOT the plan's full LOD scheme: the plan's 252,538
 * triangles in view assume one mesh per class AND CHUNK plus impostors past each class's `lod.farM`,
 * and without that split every instance in the disk is submitted every frame, because one bounding
 * sphere covering the disk is never culled. The forms are kept between 4 and 36 triangles for that
 * reason, which is what keeps the total under the 600,000 budget rather than four times over it.
 * The chunk split is the next ticket, not a silent gap.
 */

import * as THREE from "three";
import {
  ColliderIndex,
  DEMO_ASSET_CLASSES,
  DEMO_FALLOFF,
  placeAssets,
  sampleBiomeMask,
  spawnFalloff,
  type AssetClass,
  type AssetClassId,
  type Exclusions,
  type PlacedAsset,
  type Placement,
  type Segment,
  type SpawnPoint,
} from "@echo/planet";

import { DEMO_PRESENCE_HOME, footprintLocalM, offsetLocalM, pathsLocalM, SLICE_STATIONS, SPAWN_FACES, stationLocalM } from "./demoStations";
import { hasScatterGeometry, SCATTER_GEOMETRY, SCATTER_MATERIAL } from "./scatterGeometry";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";

export interface ScatterLayerOptions {
  /** The registry to place. Defaults to the classes the demo cell's biomes call for. */
  classes?: readonly AssetClass[];
  /**
   * Biome mask spacing, metres. Ten is what the demo was measured at, and it is also the finest
   * the water-distance bands need: `waterDistanceM` is quantised to this step, and reeds want
   * "within 90 m of water" to be true to the ten metres, not to the fifty.
   */
  maskStepM?: number;
  /** How the density thins with distance from the spawn. The demo's measured numbers. */
  falloff?: { fullM: number; farM: number; farFactor: number; cutoffM: number };
  /** Width of the cleared band along the demo's paths, metres. */
  pathWidthM?: number;
  /** Radius of bare ground at the spawn, metres. You do not wake up inside a bush. */
  clearingM?: number;
  /** Radius kept clear around each station of the vertical slice, metres. */
  stationClearM?: number;
  /** Width of the corridors kept open along the spawn's sightlines, metres. */
  sightWidthM?: number;
  /** Hard cap. Defaults to the registry's INSTANCE_CEILING; exceeding it is reported, never silent. */
  maxInstances?: number;
  /** Grid cell of the collider index, metres. */
  colliderCellM?: number;
  /**
   * A class whose collider is at least this tall stops a body; anything shorter is pushed through
   * or stepped over. Metres, measured on the CLASS, not on the instance, so a big thicket is still
   * a thicket.
   *
   * This is a movement decision, not a registry one: assets.ts says what a thing's collider IS and
   * the client says what a walking body bumps into. It has to exist, and 1.7 m (chest height) is
   * where it goes. Measured on the demo cell: honouring every collider puts about 45% of the ground
   * within 120 m of the spawn inside a disc, and randomly placed overlapping discs stop leaving a
   * connected path through them at around 33%, which is not a dense rainforest, it is a maze with
   * no way out. Honouring only trunks and boulders puts it near 19%, and the walk test proves the
   * ground stays connected. What you actually feel is the right thing anyway: you shoulder through
   * a bush and you walk around a tree.
   */
  blockingHeightM?: number;
  /** Let the classes that ask for it cast shadows. Off is a cheap way to buy back a shadow pass. */
  shadows?: boolean;
  /** Replace the demo's exclusions wholesale, e.g. for a cell that is not the demo's. */
  exclusions?: (ctx: LayerContext) => Exclusions;
}

export interface ScatterLayer extends WorldLayer {
  readonly name: "scatter";
  /** What the placer decided, or null before the build. */
  placement(): Placement | null;
  /** The colliders of everything solid, or null before the build. */
  colliders(): ColliderIndex | null;
  /** The classes tall enough to stop a body. `blockedTile` honours these and no others. */
  blockingClasses(): ReadonlySet<AssetClassId>;
  /** The exclusions the placement ran with, for a test that wants to check them. */
  exclusions(): Exclusions | null;
  /** One InstancedMesh per class that got at least one instance. */
  readonly meshes: ReadonlyMap<AssetClassId, THREE.InstancedMesh>;
  /**
   * Would a body of `radiusM` standing at this TILE position be inside something solid. This is
   * the one question the mover asks; the frame conversion lives here so the mover never learns
   * about planet-local metres.
   */
  blockedTile(x: number, y: number, radiusM: number): boolean;
  /** Wall-clock milliseconds the build took. Reported, because the budget is an acceptance number. */
  buildMs(): number;
}

/** A macrotask, so the browser can paint and an abort can land between two pieces of work. */
const yieldToLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Props stand upright and turn about the world's up axis, and only about that. */
const UP = new THREE.Vector3(0, 1, 0);

/** A convex polygon approximating a disc, for `Exclusions.footprints`, which takes polygons only. */
function clearing(xm: number, ym: number, radiusM: number, sides = 8): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  // The polygon is inscribed, so widen it to keep the whole disc inside it: a regular n-gon through
  // the radius points is short by cos(pi/n) at its edges, and an exclusion that is short is a tree
  // in the fire.
  const r = radiusM / Math.cos(Math.PI / sides);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    out.push([xm + r * Math.cos(a), ym + r * Math.sin(a)]);
  }
  return out;
}

/**
 * The demo's exclusions, all of them read out of demoStations.ts so the scatter and the loop can
 * never disagree about where a thing stands.
 *
 * Station positions here are the AUTHORED intentions, not the snapped ones. The snap is the loop's
 * business and it runs later in the frame order; on the demo cell it moves neither slice station at
 * all, and the paths already sweep a cleared band from the spawn to each of them, so the intention
 * is what the ground is dressed around.
 */
function demoExclusions(
  spawn: SpawnPoint,
  tileM: number,
  o: { pathWidthM: number; clearingM: number; stationClearM: number; sightWidthM: number },
): Exclusions {
  const footprints: Array<Array<[number, number]>> = [
    // The parcel you are given: it stays buildable, which means it stays empty.
    footprintLocalM(spawn, tileM),
    // The ground under your feet at the first frame.
    clearing(spawn.x, spawn.y, o.clearingM),
  ];
  for (const id of SLICE_STATIONS) {
    const [xm, ym] = stationLocalM(spawn, id, tileM);
    footprints.push(clearing(xm, ym, o.stationClearM));
  }

  const paths: Segment[] = pathsLocalM(spawn, o.pathWidthM, tileM);

  // Two lines the player must be able to SEE along, which is not the same as walk along: the
  // station they spawn facing, and the other presence's home. Only the canopy and the thicket
  // classes honour these, so the ground cover still runs across them.
  const [presenceX, presenceY] = offsetLocalM(spawn, DEMO_PRESENCE_HOME.dx, DEMO_PRESENCE_HOME.dy, tileM);
  const sightlines: Segment[] = [
    { a: [spawn.x, spawn.y], b: stationLocalM(spawn, SPAWN_FACES, tileM), widthM: o.sightWidthM },
    { a: [spawn.x, spawn.y], b: [presenceX, presenceY], widthM: o.sightWidthM },
  ];

  return { paths, footprints, sightlines };
}

export function scatterLayer(options: ScatterLayerOptions = {}): ScatterLayer {
  const classes = options.classes ?? DEMO_ASSET_CLASSES;
  const maskStepM = options.maskStepM ?? 10;
  const falloff = options.falloff ?? DEMO_FALLOFF;
  const pathWidthM = options.pathWidthM ?? 3.2;
  const clearingM = options.clearingM ?? 3.5;
  const stationClearM = options.stationClearM ?? 3;
  const sightWidthM = options.sightWidthM ?? 5;
  const colliderCellM = options.colliderCellM ?? 8;
  const shadows = options.shadows ?? true;
  const blockingHeightM = options.blockingHeightM ?? 1.7;
  const blocking = new Set<AssetClassId>(
    classes.filter((c) => c.collider !== null && c.collider.heightM >= blockingHeightM).map((c) => c.id),
  );

  const meshes = new Map<AssetClassId, THREE.InstancedMesh>();
  let placement: Placement | null = null;
  let index: ColliderIndex | null = null;
  let used: Exclusions | null = null;
  let frame: WorldFrame | null = null;
  let buildMs = 0;

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  const dispose = () => {
    for (const mesh of meshes.values()) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      // Frees the instance matrix buffer, which is 64 bytes per instance and the largest thing
      // this layer ever uploads: twenty thousand ferns is 1.3 MB of GPU memory on its own.
      mesh.dispose();
    }
    meshes.clear();
    placement = null;
    index = null;
    used = null;
    frame = null;
  };

  /**
   * One class, one InstancedMesh. The scene positions are collected as they are computed so the
   * bounding sphere can be built without asking the height function for all of them a second time:
   * `toScene` is a terrain field evaluation, and there are forty thousand of them in a build.
   */
  const buildClass = (ctx: LayerContext, cls: AssetClass, group: readonly PlacedAsset[]): THREE.InstancedMesh => {
    const geometry = SCATTER_GEOMETRY[cls.id]!();
    const material = SCATTER_MATERIAL[cls.id]!();
    const mesh = new THREE.InstancedMesh(geometry, material, group.length);
    mesh.name = `scatter:${cls.id}`;
    mesh.castShadow = shadows && cls.castsShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;

    const scenePositions = new Float32Array(group.length * 3);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < group.length; i++) {
      const p = group[i]!;
      const [tx, ty] = ctx.frame.fromLocalM(p.x, p.y);
      ctx.frame.toScene(tx, ty, 0, position);
      quaternion.setFromAxisAngle(UP, p.rotation);
      scale.setScalar(p.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
      scenePositions[i * 3] = position.x;
      scenePositions[i * 3 + 1] = position.y;
      scenePositions[i * 3 + 2] = position.z;
      if (position.x < minX) minX = position.x;
      if (position.y < minY) minY = position.y;
      if (position.z < minZ) minZ = position.z;
      if (position.x > maxX) maxX = position.x;
      if (position.y > maxY) maxY = position.y;
      if (position.z > maxZ) maxZ = position.z;
    }
    mesh.instanceMatrix.needsUpdate = true;

    // The bounding sphere, computed rather than left to three. `InstancedMesh.computeBoundingSphere`
    // would do it, but it walks every instance matrix a second time, and a WRONG sphere is the
    // classic instancing bug: too small and whole classes blink out at the edge of the screen, too
    // large and nothing is ever culled. `reach` is how far the form's own geometry extends from its
    // instance origin, and it survives the Y rotation because a rotation preserves a length.
    const gs = geometry.boundingSphere!;
    const reach = gs.center.length() + gs.radius;
    const centre = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    let radius = 0;
    for (let i = 0; i < group.length; i++) {
      const dx = scenePositions[i * 3]! - centre.x;
      const dy = scenePositions[i * 3 + 1]! - centre.y;
      const dz = scenePositions[i * 3 + 2]! - centre.z;
      const r = Math.hypot(dx, dy, dz) + group[i]!.scale * reach;
      if (r > radius) radius = r;
    }
    mesh.boundingSphere = new THREE.Sphere(centre, radius);
    return mesh;
  };

  const build = async (ctx: LayerContext, signal: AbortSignal): Promise<void> => {
    const t0 = performance.now();
    frame = ctx.frame;
    // Let whatever mounted the canvas paint before a third of a second of arithmetic takes the
    // thread. The terrain layer has already had its turn by now, so the ground is up.
    await yieldToLoop();
    if (signal.aborted) return dispose();

    // The same mask the ranking script measured this cell with: the region's own extent, at 10 m.
    // Its extent is load bearing beyond coverage, because the placer's lattice is laid out from
    // `-extentM`, so a smaller mask would not merely place less, it would place ELSEWHERE.
    const mask = sampleBiomeMask(ctx.frame.patch, ctx.field, ctx.calibration, ctx.region.extentM, maskStepM);
    await yieldToLoop();
    if (signal.aborted) return dispose();

    used = options.exclusions
      ? options.exclusions(ctx)
      : demoExclusions(ctx.region.spawn, ctx.frame.tileM, { pathWidthM, clearingM, stationClearM, sightWidthM });

    // The falloff is centred on the spawn in LOCAL METRES, which is the frame the placer works in.
    // Centring it on the tile frame's origin instead would thin the wrong half of the world.
    const result = placeAssets(mask, classes, ctx.seed, used, {
      heightScaleM: ctx.frame.heightScaleM,
      bound: ctx.region.bound,
      densityScale: spawnFalloff(
        ctx.region.spawn.x,
        ctx.region.spawn.y,
        falloff.fullM,
        falloff.farM,
        falloff.farFactor,
        falloff.cutoffM,
      ),
      ...(options.maxInstances !== undefined ? { maxInstances: options.maxInstances } : {}),
    });
    await yieldToLoop();
    if (signal.aborted) return dispose();

    placement = result;
    index = new ColliderIndex(result.placed, classes, colliderCellM);
    if (result.truncated) {
      // A cap that nobody hears about is a world that is quietly missing its far half.
      console.warn(
        `[scatter] TRUNCATED: the placer hit its instance ceiling at ${result.placed.length} and stopped. ` +
          `The disk past that point is bare. Raise INSTANCE_CEILING or thin DEMO_FALLOFF; do not ignore this.`,
      );
    }

    const byClass = new Map<AssetClassId, PlacedAsset[]>();
    for (const p of result.placed) {
      const group = byClass.get(p.classId);
      if (group) group.push(p);
      else byClass.set(p.classId, [p]);
    }

    for (const cls of classes) {
      const group = byClass.get(cls.id);
      if (!group || group.length === 0) continue;
      if (!hasScatterGeometry(cls.id)) {
        // A registry class with no form is invisible, which is the exact defect this layer exists
        // to fix. Say so rather than let it pass as an empty biome.
        console.warn(`[scatter] no geometry for class "${cls.id}": ${group.length} instances will not be drawn`);
        continue;
      }
      const mesh = buildClass(ctx, cls, group);
      if (signal.aborted) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
        dispose();
        return;
      }
      ctx.scene.add(mesh);
      meshes.set(cls.id, mesh);
      // One class per macrotask: this is where an unmount during the build lands.
      await yieldToLoop();
      if (signal.aborted) {
        dispose();
        return;
      }
    }

    buildMs = performance.now() - t0;
  };

  return {
    name: "scatter",
    meshes,
    build,
    dispose,
    placement: () => placement,
    colliders: () => index,
    blockingClasses: () => blocking,
    exclusions: () => used,
    buildMs: () => buildMs,
    blockedTile(x, y, radiusM) {
      if (!index || !frame || index.count === 0) return false;
      const [xm, ym] = frame.toLocalM(x, y);
      // queryCircle already widens by the largest radius in the index, so the filter is the last
      // step and never the reason a disc is missed.
      return index.queryCircle(xm, ym, radiusM).some((c) => blocking.has(c.classId));
    },
  };
}
