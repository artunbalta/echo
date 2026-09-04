/**
 * The scatter layer (plan W2-3): the thing that makes a world stop being empty.
 *
 * `placeAssets` has been correct and unused since W2-2. It ran in a ranking script and in a node
 * test, decided that the demo cell holds 5,995 instances within 120 m of the spawn, and then nothing
 * drew a single one of them, so the world a player actually walked was bare ground. This layer is
 * the other half: it asks the registry where things stand and puts one InstancedMesh per class in
 * the scene at exactly those positions.
 *
 * WHAT IT PROMISES FOR AN ARBITRARY CELL. Nothing here knows which cell it is dressing. The class
 * list is read off the biome mask this build already samples: the distinct LAND biomes the mask
 * actually holds inside the region, handed to `classesForBiomes`, which is the same derivation
 * cell-info.ts prints. So a rainforest parcel gets buttress trees, bromeliads and ferns, a taiga one
 * gets what taiga calls for, and nobody edits a constant in between. Everything that is authored
 * furniture, a campfire to keep bare or a path to sweep, arrives through `stations` and does not
 * exist unless a caller passes it: a parcel has no campfire, and defaulting to the demo's would
 * carve five corridors toward things that are not there. What survives with no options at all is
 * the pair a bare parcel still needs, its buildable footprint and the spawn clearing, because you
 * do not scatter trees through someone's build plot and you do not wake up inside a bush.
 *
 * WHAT IS DECIDED HERE AND WHAT IS NOT. Density, biome affinity, clustering, exclusions, scale and
 * rotation are all @echo/planet's; this file may not second-guess any of them, because the server
 * and the client have to agree about where a tree is. Forms are scatterGeometry.ts's. What is left
 * for this file is four things: choosing the registry the built cell calls for, converting the
 * registry's local metres into three's frame THROUGH `ctx.frame` and never by re-deriving it,
 * keeping the build off the main thread in one piece, and handing the collider index to whatever
 * wants to walk around a tree instead of through it.
 *
 * THE FRAME. `PlacedAsset` is in planet-local metres, x east and y NORTH. Gameplay is in tiles,
 * x east and y SOUTH. The flip is exactly the bug that makes a world look right and be mirrored,
 * so every position goes `fromLocalM` then `toScene`, and `toScene` is what puts each instance on
 * the ground the terrain layer actually drew (`sceneHeightAt`, the I1 function) rather than on the
 * placer's `z`, which is sampled off a 10 m mask grid and can float a fern half a metre.
 *
 * A CLASS WITH NO FORM IS DROPPED, LOUDLY. Two tables have to agree, the registry's ASSET_CLASSES
 * and scatterGeometry.ts's SCATTER_GEOMETRY, and nothing in the type system makes them. The gap was
 * invisible while the only cell was rainforest and beach, because those two biomes happened to call
 * for exactly the classes that had builders; an inland cell gets no such luck. A class left in the
 * list with no builder is worse than a missing one, because its instances still enter the
 * ColliderIndex and the player walks into a wall nobody drew. So the filter runs before the
 * PLACEMENT rather than before the meshes, and it names the class and the biome that asked for it.
 *
 * COST, MEASURED. 388 ms for the whole build on the demo cell, of which two calls into @echo/planet
 * are 324 and neither can be split without forking a contract file: sampling the biome mask over
 * the 2,084 m disk at 10 m is 165 ms, and the placement is 159. They are bracketed by yields and by
 * abort checks, exactly as terrainChunks brackets its own single 150 ms `buildRegionScene`; the
 * remaining 81 ms is the instancing, which yields between every class. That is the same discipline
 * the terrain has, not a weaker one, and the same admission with it: a build is two blocks the main
 * thread cannot be given back during. The biome sweep that picks the registry costs nothing worth
 * measuring, because a grid point whose biome has already been seen never runs the bound test.
 *
 * WHAT IT PUTS ON SCREEN, on 847b949ffffffff with the demo's stations passed in: 43,018 instances
 * over the disk and 5,905 within 120 m of the spawn, against the 43,108 and 5,995 measure-demo-cell
 * reports with no exclusions at all; the difference is the parcel, the spawn clearing, the two paths
 * and the two stations, and it is meant to be that small. Fifteen draw calls and 565,447 triangles,
 * of which 391,267 also go through the shadow pass. On 8482589ffffffff, a parcel that is 100%
 * rainforest and carries no stations at all, the same code with no options selects nine classes and
 * places 64,010 instances, 6,220 of them within 120 m, into eight meshes: denser than the demo,
 * because a solid rainforest has no beach and no sand in it, and nothing was swept out for
 * furniture. The ninth class is reeds, which is selected and places nothing, because the registry
 * wants it within 90 m of water and that disk holds none. That is the general shape of the answer:
 * the biomes decide who is invited, and each class's own rules decide who shows up.
 *
 * DRAW CALLS AND TRIANGLES, AND THE BUDGET THIS BREAKS. One InstancedMesh per class is fifteen
 * draw calls for the demo's whole disk, which is what the budget allows. It is NOT the plan's full
 * LOD scheme: the plan's 252,538 triangles in view assume one mesh per class AND CHUNK plus
 * impostors past each class's `lod.farM`, and without that split every instance in the disk is
 * submitted every frame, because one bounding sphere covering the disk is never culled.
 *
 * That was survivable while this layer only ever built one cell. It is not survivable now. The
 * demo's cell is 45% ocean and measures 566,249 triangles, under the 600,000 budget, and that
 * number was quietly doing the arguing. Made general, the layer hands out homogeneous rainforest:
 * 8482589ffffffff, the first parcel a person actually opened, measures 844,775 plus 594,335 through
 * the shadow pass. Over 120 sampled assignable res-4 cells, 34 exceed 600,000, and the worst,
 * 8486927ffffffff, submits 1.43 M triangles every frame. This is steady state, not a peak.
 *
 * So the chunk split is no longer the next ticket, it is a debt this file is currently carrying in
 * the open. Keeping the forms between 4 and 36 triangles buys roughly a factor of four and it is
 * not enough on its own. Until the split lands, the honest statement is that a dense cell costs
 * about two and a half times its budget and holds frame rate only because the machines it has been
 * measured on have the headroom to absorb it.
 */

import * as THREE from "three";
import {
  BIOMES,
  ColliderIndex,
  LAND_BIOMES,
  SCATTER_FALLOFF,
  classesForBiomes,
  placeAssets,
  sampleBiomeMask,
  spawnFalloff,
  type AssetClass,
  type AssetClassId,
  type Biome,
  type BiomeMask,
  type Exclusions,
  type PlacedAsset,
  type Placement,
  type RegionBound,
  type Segment,
  type SpawnPoint,
} from "@echo/planet";

import { footprintToLocalM } from "./controller";
import { hasScatterGeometry, SCATTER_GEOMETRY, SCATTER_MATERIAL } from "./scatterGeometry";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";

/**
 * The buildable footprint the scatter leaves clear, tiles from the spawn, convex.
 *
 * It lived in demoStations.ts and was never demo data: six points naming no cell, no biome and no
 * station, 16 tiles wide and 12 deep in front of where you land. Every parcel has one, the scatter
 * is its only consumer, and this is its address now. A caller with a real surveyed plot passes
 * `footprintTiles` instead.
 */
export const BUILDABLE_FOOTPRINT_TILES: ReadonlyArray<readonly [number, number]> = [
  [-6, 0],
  [6, 0],
  [8, 6],
  [6, 12],
  [-6, 12],
  [-8, 6],
];

/**
 * Authored furniture the ground has to be dressed around, in PLANET-LOCAL METRES.
 *
 * The layer takes points and widths rather than finished polygons so that the one fiddly part, the
 * widening that keeps a disc inside the polygon standing in for it, has a single owner. Everything
 * here is optional and the whole record is: a cell with no stations passes nothing and gets a
 * footprint and a spawn clearing, which is the correct answer and not a degraded one.
 */
export interface StationExclusions {
  /** Ground to keep bare around a thing that stands there, e.g. a campfire. */
  clearings?: ReadonlyArray<{ x: number; y: number; radiusM: number }>;
  /** Centrelines the ground cover is swept off, for walking. */
  paths?: readonly Segment[];
  /** Lines that have to stay SEE-through, which is not the same as walkable: only the canopy and
   *  thicket classes honour them, so the ground cover still runs across. */
  sightlines?: readonly Segment[];
}

export interface ScatterLayerOptions {
  /**
   * The registry to place. Defaults to the classes THIS CELL's own land biomes call for, read off
   * the mask below. Pass it only to place something other than what the ground asks for; a caller
   * that passes a class with no form in scatterGeometry.ts still loses it, loudly.
   */
  classes?: readonly AssetClass[];
  /**
   * Biome mask spacing, metres. Ten is what the demo was measured at, and it is also the finest
   * the water-distance bands need: `waterDistanceM` is quantised to this step, and reeds want
   * "within 90 m of water" to be true to the ten metres, not to the fifty.
   */
  maskStepM?: number;
  /**
   * How the density thins with distance from the spawn.
   *
   * The default's four numbers mention no biome, no composition and no cell, and `spawnFalloff`
   * is a pure function of distance from a spawn, which every route has. What they are tuned
   * against is the fog. Full density to 150 m covers the near field a world is judged on;
   * `cutoffM` 500 truncates the curve while the fog has already closed at 420 m, where density is
   * still 0.543, so the step to zero is never seen. Change the fog and change this; changing the
   * cell does not.
   */
  falloff?: { fullM: number; farM: number; farFactor: number; cutoffM: number };
  /** The buildable plot to leave empty, tiles from the spawn, convex. */
  footprintTiles?: ReadonlyArray<readonly [number, number]>;
  /** Radius of bare ground at the spawn, metres. You do not wake up inside a bush. */
  clearingM?: number;
  /**
   * What is built on this cell, if anything is. Absent is the honest default: a parcel has no
   * campfire and no cave mouth, and inheriting the demo's would carve corridors toward furniture
   * that does not exist. The demo passes its own.
   */
  stations?: (ctx: LayerContext) => StationExclusions;
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
  /**
   * Own the whole answer instead. This REPLACES the footprint, the clearing and the stations, so a
   * caller that reaches for it is taking responsibility for the spawn being standable too. Prefer
   * `stations` and `footprintTiles`, which add to a floor that is already right.
   */
  exclusions?: (ctx: LayerContext) => Exclusions;
}

export interface ScatterLayer extends WorldLayer {
  readonly name: "scatter";
  /** What the placer decided, or null before the build. */
  placement(): Placement | null;
  /** The colliders of everything solid, or null before the build. */
  colliders(): ColliderIndex | null;
  /** The classes this cell was dressed with, in registry order. Empty before the build. */
  classes(): readonly AssetClass[];
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
 * Which land biomes this cell actually holds, in the table's order.
 *
 * The mask is already in hand, so this is a sweep and not a second field evaluation. Two things
 * make it cheap enough to do unconditionally. A grid point whose biome index has already been
 * accepted is skipped before the region test, so a homogeneous cell settles after a few hundred
 * points and the rest is an array read. And the region test is worth paying at all because over-
 * selection cannot move a single instance, only cost a full lattice sweep per surplus class: a
 * class whose only qualifying biome lies in the square's corners outside the hexagonal union
 * places nothing, since every candidate is rejected on the bound anyway. Gating here is the
 * cheaper side of that trade and it also makes the reported class list honest.
 */
function landBiomesIn(mask: BiomeMask, bound: RegionBound): Biome[] {
  const seen = new Set<number>();
  for (let j = 0; j < mask.size; j++) {
    const y = -mask.extentM + j * mask.stepM;
    for (let i = 0; i < mask.size; i++) {
      const index = mask.biomes[j * mask.size + i]!;
      if (seen.has(index)) continue;
      const x = -mask.extentM + i * mask.stepM;
      if (!bound.contains(x, y)) continue;
      seen.add(index);
    }
  }
  const held = new Set<Biome>();
  for (const index of seen) held.add(BIOMES[index]!);
  return LAND_BIOMES.filter((b) => held.has(b));
}

/**
 * The classes that can actually be drawn, and a named complaint about the ones that cannot.
 *
 * Dropping happens HERE, before `placeAssets`, and not later at the mesh loop, because an instance
 * that reaches the ColliderIndex without reaching a mesh is an invisible wall. Thinner ground is a
 * gap you can see and walk through; a wall you cannot see is a bug report about the controls.
 */
function drawableClasses(classes: readonly AssetClass[], present: readonly Biome[]): AssetClass[] {
  const out: AssetClass[] = [];
  for (const cls of classes) {
    if (hasScatterGeometry(cls.id)) {
      out.push(cls);
      continue;
    }
    const asked = present.filter((b) => (cls.biomes[b] ?? 0) > 0);
    console.warn(
      `[scatter] no form for class "${cls.id}", called for here by ` +
        `${asked.length ? asked.join(", ") : "the caller's own class list"}: it is skipped entirely, so this ` +
        `ground is thinner rather than walled off by something nobody can see. Add a builder to scatterGeometry.ts.`,
    );
  }
  return out;
}

export function scatterLayer(options: ScatterLayerOptions = {}): ScatterLayer {
  const maskStepM = options.maskStepM ?? 10;
  const falloff = options.falloff ?? SCATTER_FALLOFF;
  const footprintTiles = options.footprintTiles ?? BUILDABLE_FOOTPRINT_TILES;
  const clearingM = options.clearingM ?? 3.5;
  const colliderCellM = options.colliderCellM ?? 8;
  const shadows = options.shadows ?? true;
  const blockingHeightM = options.blockingHeightM ?? 1.7;

  const meshes = new Map<AssetClassId, THREE.InstancedMesh>();
  // The registry is not known until the mask says what this cell is made of, so these two are
  // filled in `build` and cleared by `dispose`, exactly as `placement` and `index` already are.
  let classes: readonly AssetClass[] = [];
  let blocking: ReadonlySet<AssetClassId> = new Set<AssetClassId>();
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
    classes = [];
    blocking = new Set<AssetClassId>();
    placement = null;
    index = null;
    used = null;
    frame = null;
  };

  /**
   * The floor every cell gets, and the furniture only some cells have.
   *
   * The two footprints are not negotiable and are not the demo's: the plot you are given stays
   * buildable, which means it stays empty, and the ground you land on stays walkable. Stations add
   * to that rather than replacing it, so a caller cannot pass furniture and lose the spawn.
   */
  const defaultExclusions = (ctx: LayerContext): Exclusions => {
    const spawn = ctx.region.spawn;
    const footprints: Array<Array<[number, number]>> = [
      footprintToLocalM(spawn, footprintTiles, ctx.frame.tileM),
      clearing(spawn.x, spawn.y, clearingM),
    ];
    const furniture = options.stations?.(ctx);
    for (const c of furniture?.clearings ?? []) footprints.push(clearing(c.x, c.y, c.radiusM));
    return {
      footprints,
      paths: furniture?.paths ?? [],
      sightlines: furniture?.sightlines ?? [],
    };
  };

  /**
   * One class, one InstancedMesh. The scene positions are collected as they are computed so the
   * bounding sphere can be built without asking the height function for all of them a second time:
   * `toScene` is a terrain field evaluation, and there are forty thousand of them in a build.
   */
  const buildClass = (ctx: LayerContext, cls: AssetClass, group: readonly PlacedAsset[]): THREE.InstancedMesh => {
    // Both lookups are total over `classes`, which `drawableClasses` filtered before anything was
    // placed. That filter is the only thing standing between here and a crash.
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

    // The same mask the ranking script measured the demo cell with: the region's own extent, at
    // 10 m. Its extent is load bearing beyond coverage, because the placer's lattice is laid out
    // from `-extentM`, so a smaller mask would not merely place less, it would place ELSEWHERE.
    const mask = sampleBiomeMask(ctx.frame.patch, ctx.field, ctx.calibration, ctx.region.extentM, maskStepM);
    await yieldToLoop();
    if (signal.aborted) return dispose();

    // What the ground is made of decides what stands on it. An explicit list still wins, but it is
    // filtered for forms on the same terms, because a class nobody can draw is nobody's answer.
    const present = landBiomesIn(mask, ctx.region.bound);
    if (present.length === 0) {
      // Not an error: a cell can be all water. It is worth saying out loud, because "bare ground"
      // and "no ground" look identical from a screenshot.
      console.warn(`[scatter] cell ${ctx.region.cell} holds no land inside the region; nothing is dressed.`);
    }
    classes = drawableClasses(options.classes ?? classesForBiomes(present), present);
    blocking = new Set<AssetClassId>(
      classes.filter((c) => c.collider !== null && c.collider.heightM >= blockingHeightM).map((c) => c.id),
    );

    used = options.exclusions ? options.exclusions(ctx) : defaultExclusions(ctx);

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
          `The disk past that point is bare. Raise INSTANCE_CEILING, or pass a thinner \`falloff\` ` +
          `(a shorter \`cutoffM\` or a smaller \`farFactor\`); do not ignore this.`,
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
    classes: () => classes,
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
