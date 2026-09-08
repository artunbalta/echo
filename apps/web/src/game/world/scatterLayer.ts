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
 * DRAW CALLS AND TRIANGLES, AND THE BUDGET THIS USED TO BREAK. One InstancedMesh per class was
 * fifteen draw calls for the demo's whole disk, and one bounding sphere over the whole disk is
 * never culled, so every instance was submitted every frame. The demo's cell is 45% ocean and
 * measured 566,249 triangles, under the 600,000 budget, and that number was quietly doing the
 * arguing. Made general, the layer hands out homogeneous rainforest: 8482589ffffffff measured
 * 844,775 in the main pass plus 594,335 through the shadow pass, and the worst of 120 sampled
 * assignable res-4 cells submitted 1.43 M. That was steady state, not a peak.
 *
 * A7 SPLIT IT, and the split is scatterSplit.ts's: the instances of a class are sorted into a grid
 * of buckets once at build, and every frame the buckets whose boxes meet the frustum are copied as
 * whole runs into the front of the class's instance buffer, with `count` set to how many landed
 * there. It is one draw call per class, exactly what the layer already spent, and the grid can be
 * as fine as it likes because a bucket is not a mesh. A class that casts shadows gets a second
 * InstancedMesh packed against the shadow camera instead, because three uploads a matrix buffer at
 * most once per `render()` and the two passes need two different sets; that twin draws zero
 * instances in the main pass, which three skips before the draw call, so it costs neither a call
 * nor a triangle there. See scatterSplit.ts for why the plan's per-cell split was measured and
 * abandoned, and why the grid is not resolved in the scene graph.
 *
 * WHAT IT COSTS AND WHAT IT BUYS, measured in the browser on the real GPU, whole frame, both
 * passes (`info.autoReset` off with a wrapper on `shadowMap.render`), against the same frame in the
 * same session with the split taken back out.
 *
 * THE TURN COLUMN IS A WHOLE TURN NOW, and it did not used to be. It read "worst of twelve views",
 * and the views came from an e2e helper that fed degrees into a radians-per-pixel dial: its twelve
 * drags swept 97 degrees in total, 27% of the circle, so 622,210 and 553,466 were the worst of a
 * quarter turn presented as the worst a drag can reach. Re-measured over twenty-four headings
 * fifteen degrees apart, each one read back off the camera's own yaw:
 *
 *                          at the spawn            worst over a whole turn     draw calls
 *   8482589ffffffff   1,623,152 -> 445,158 tri     1,623,354 -> 629,366        39 at both
 *   847b949ffffffff   1,118,418 -> 368,606 tri     1,139,246 -> 564,363        53 spawn, 67 turned
 *
 * That is 3.65x and 3.03x at the spawn and 2.58x and 2.02x at the worst heading, and NOT ONE DRAW
 * CALL of the budget's 120 was spent to get it. Over a walk of about 870 frames the parcel runs p50
 * 605,524 and worst 615,746 in 39 calls, and the demo p50 516,798 and worst 551,355 in 61.
 *
 * WHAT WAS STILL OVER, and what closed it. After A7 the 600,000 of DECISIONS C16 was met at both
 * spawns and missed on the parcel at ELEVEN OF THE TWENTY-FOUR HEADINGS, worst 629,366, of which
 * 284,259 was the main pass and 345,107 the shadow pass. The shadow pass was the LARGER HALF, 55%
 * of that frame, and the split could not touch it: 345,437 at the spawn against 345,107 at the
 * worst heading, because the 240 m box follows the lens POSITION and only 12 m of its direction.
 *
 * DECISIONS C20 CLOSED IT, on the same 24 headings on the same GPU. Nothing under shoulder height
 * casts any more (see {@link SHOULDER_HEIGHT_M}), which is thicket, fallen-log, driftwood and
 * shore-rock here, and the whole frame becomes:
 *
 *                    at the spawn        worst over a whole turn      of 24 headings over 600,000
 *   8482589ffffffff  444,052 -> 325,308  615,220 -> 497,080           6 -> 0
 *   8496a91ffffffff  654,655 -> 538,179  658,396 -> 541,768          24 -> 0
 *   8477057ffffffff  642,787 -> 527,555  668,653 -> 553,481          12 -> 0
 *   847b949ffffffff  365,589 -> 280,561  550,837 -> 476,959           0 -> 0
 *
 * Both columns of every row are one session on one machine, which is the only way a difference is
 * a difference. tests/e2e/scatterSplit.spec.ts re-reads the two shipped routes in its own session
 * and gets 326,414 and 511,322 on the parcel and 283,578 and 476,959 on the demo, so session to
 * session is worth about 1 to 3% and none of it is worth arguing over.
 *
 * The scatter's own shadow pass halves on every route: 243,114 -> 125,846 at the parcel's spawn,
 * 178,195 -> 92,119 at the demo's, and its worst over 33 stand points 245,215 -> 127,551, which is
 * 21.3% of the frame against the 45% tests/scatterSplit.test.mts allows a pass that draws no
 * picture. It gives back draw calls rather than spending them: the scatter's shadow pass goes 5 to
 * 3 on the parcel and 7 to 3 on the demo.
 *
 * DECISIONS C21 IS THE OTHER HALF, AND IT IS THE RIM'S. Everything above is measured at the spawn
 * or turning on the spot, which is where the split works. Walk out to the rim and look back and it
 * stops working, because from out there almost the whole disk is inside the cone: measured on the
 * real GPU at eighteen stand points per route, the worst frame is 704,644 triangles on the parcel,
 * 744,331 on 8477057ffffffff and 772,275 on 8496a91ffffffff, and 21 of the 84 views over five
 * routes are over C16's 600,000. Past each class's own `lod.farM` an instance now drops to the
 * two-triangle card scatterImpostor.ts derives from the class's own form, and the whole frame
 * becomes:
 *
 *                    at the spawn        worst of eighteen stand points   of those views over 600,000
 *   8482589ffffffff  326,414 -> 326,414  704,644 -> 544,164                4 -> 0
 *   8477057ffffffff  567,139 -> 537,459  744,331 -> 587,271                5 -> 0
 *   8496a91ffffffff  549,849 -> 523,249  772,275 -> 616,355               12 -> 2
 *   847b949ffffffff  283,578 -> 281,748  597,464 -> 495,062                0 -> 0
 *   847b959ffffffff  202,499 -> 202,499  359,789 -> 334,163                0 -> 0
 *
 * THE SPAWN COLUMN IS THE CORRECTED ONE. It first read 496,615 -> 470,655 on the parcel and four
 * more like it, and not one of those was a frame: each was this layer's own cull report at the
 * spawn POSITION at a heading nobody is put at, plus a per-route constant for everything in the
 * frame that is not the scatter, with the "before" column computed as the "after" plus
 * `farBandFullTriangles - impostorTriangles` rather than rendered a second time. On the parcel that
 * heading was yaw 0 and C4's spawn rule leaves you at yaw PI. DECISIONS "C21, the spawn column
 * corrected" carries the recovery, heading by heading.
 *
 * IT BUYS LITTLE AT THE SPAWN AND MUCH AT THE RIM, and that is exactly what it is for: NOTHING off
 * the parcel's spawn frame against 22.8% off its worst, and 0.6% off the demo's spawn against
 * 20.4%. At the parcel's spawn the far band holds zero instances, because looking the way the game
 * points you the scatter is 15,356 triangles of main pass in 8 draw calls and no bucket in the cone
 * is past any class's own `farM`. The two views on 8496a91ffffffff that are still over are 616,355
 * and 601,080, 2.7% and 0.2% past the ceiling where they were 28.7% and 25.6% past it; what is left
 * there is the ground, and the terrain's own split is where the next hundred thousand is.
 *
 * IT SPENDS DRAW CALLS RATHER THAN GIVING THEM BACK, which C20 did not: one more per class that has
 * a far band, which at the spawn is 37 to 37 on the parcel because no class has one there, 37 to 42
 * on 8477057ffffffff, 49 to 51 on the demo, and 57 to 64 at the demo's rim, against the 120 of C16.
 * And it does not touch the shadow pass at all: identical, triangle for triangle, at all 84 views
 * measured, because no class that casts is ever past its own `farM` inside the 240 m box.
 *
 * DECISIONS C22 THEN MOVED THE THRESHOLD, and the two paragraphs above are what it was measured
 * against. C21 shipped `farM` as it had been authored, and six classes carried 900 m over a disk
 * that ends at 500, so no tree on a rainforest parcel could ever enter the band; the row above that
 * reads 326,414 -> 326,414 at the parcel's spawn is that fact showing. C22 re-derived all
 * twenty-six distances by measuring where each form falls to two pixels of the shipped frame, the
 * six landed at 400 to 410 m, and measured again on the real GPU at sixty-one WALKABLE stands 448 m
 * out across the five shipped routes:
 *
 *   over C16's 600,000        14 of 61 views -> 0 of 61
 *   the worst view anywhere   664,310 -> 508,260
 *   the parcel at 448 m       606,798 -> 446,386, 26.4% of the frame
 *   8477057 at 448 m          639,324 -> 481,250, 24.7%
 *   the demo at 448 m         509,644 -> 416,127, 18.3%
 *
 * The class that changed most is the one C21 could not reach: at the parcel's worst stand,
 * buttress-tree goes from 24 instances in the far band to 2,664 and canopy-palm from 65 to 4,122,
 * worth 76,560 and 73,026 triangles. Two classes went the other way, because their old `farM` was
 * NEARER than the measurement: fern 220 -> 340 m and bromeliad 200 -> 300 give back 11,720 and
 * 1,330 triangles at the same view, and the net is still 160,412. The draw calls it spends grew
 * with it, 44 at the parcel's rim and 73 at the demo's, still against 120.
 *
 * AND A CASTER CAN NOW BE IN THE FAR BAND, which C21 recorded as impossible and C22 made possible:
 * the shortest casting `farM` is cactus at 350 m against the 591 m a caster inside the 240 m shadow
 * box reaches. It still does not touch the shadow pass, for a different reason: the twin is packed
 * by `visibleRuns` against the shadow camera and never sees `farM` at all, so an instance drawn as
 * a card casts the shadow of its own full form. tests/scatterImpostor.test.mts culls one cell under
 * two `farM` tables three hundred metres apart and holds the shadow pass identical.
 *
 * THE SHADOW PASS IS STILL THE LARGER HALF AT REST, 226,693 of the parcel's 325,308, because the
 * terrain still has the shape the scatter had before A7: seven meshes over a 4 km disk with a
 * bounding sphere each, about 102,000 triangles through the shadow pass whatever you look at. The
 * same split applied to the ground is where the next 100,000 is, and it is terrainChunks.ts's to
 * make.
 *
 * WHAT IT COSTS PER FRAME: the cull is 0.2 ms p50 and 0.4 ms worst on the parcel over that walk,
 * on an M4 Pro, and skips its copy and its upload entirely on a frame whose visible bucket set has
 * not changed. AT BUILD: 9.3 ms of a 413 ms build on the parcel and 7.3 of 468 on the demo, 2.2%
 * and 1.6%, inside the same yields and abort checks the rest of the build already had. IN MEMORY:
 * three copies of an instance matrix for a class that casts and two for one that does not, 9.90 MB
 * on the parcel and 6.63 on the demo, plus 0.45 MB and 0.32 MB of bucket boxes.
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
import { impostorFor, impostorMaterial, sweptRadius } from "./scatterImpostor";
import {
  bucketise,
  frustumHas,
  packInto,
  planesOf,
  visibleRuns,
  visibleRunsByRange,
  SHADOW_PAD_M,
  type ScatterBuckets,
} from "./scatterSplit";
import type { LayerContext, WorldFrame, WorldLayer } from "./PlanetWorld";

/**
 * The buildable footprint the scatter leaves clear, tiles from the spawn, convex.
 *
 * It lived in demoStations.ts and was never demo data: six points naming no cell, no biome and no
 * station, 16 tiles wide and 12 deep in front of where you land. Every parcel has one, the scatter
 * is its only consumer, and this is its address now. A caller with a real surveyed plot passes
 * `footprintTiles` instead.
 */
/**
 * Shoulder height, metres. One number, two decisions, and DECISIONS C20 is why it is one.
 *
 * WHAT IT ALREADY DECIDED: what stops a walking body. A class whose collider reaches this high is
 * something you walk AROUND; anything shorter is something you shoulder through. `blockingHeightM`
 * defaults to it and `blockedTile` honours the set it selects.
 *
 * WHAT IT NOW ALSO DECIDES: what casts a shadow. C20's argument is the same argument seen from the
 * light: a thing you shoulder through is a thing whose own shadow disappears into the bands the
 * canopy is already casting, so it may be drawn and not cast. The bill it pays is the shadow pass,
 * which after the A7 split was the larger half of the frame and does not fall when you turn.
 *
 * THE REGISTRY'S `castsShadow` IS NOT REPLACED BY THIS, IT IS NARROWED BY IT, and the two are
 * ANDed rather than one winning. Measured over the whole of ASSET_CLASSES, the flag and this test
 * disagree in one direction only: five classes are flagged true with a collider under 1.7 m, and
 * NOT ONE class is flagged false with a collider at or above it. So on the shipped table the
 * conjunction and the height test alone select the same nine classes, and the flag is what keeps
 * a future tall class that should not cast (something thin, something glassy) from being given a
 * shadow by arithmetic. The five it silences, with their collider heights:
 *
 *   thicket 1.6 m, fallen-log 0.9, berry-bush 1.1, shore-rock 0.8, driftwood 0.5
 *
 * `tests/scatter.test.mts` pins that list and the one-directional disagreement, so a table edit
 * that puts a tall class on the wrong side of the flag is a failure and not a silence.
 */
export const SHOULDER_HEIGHT_M = 1.7;

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
   * the client says what a walking body bumps into. It has to exist, and {@link SHOULDER_HEIGHT_M}
   * is where it goes. Overriding it here moves what BLOCKS and never what casts: DECISIONS C20's
   * shadow test reads the constant directly, because a caller loosening a movement rule for its own
   * reasons must not quietly hand the shadow pass a hundred thousand triangles. Measured on the
   * demo cell: honouring every collider puts about 45% of the ground
   * within 120 m of the spawn inside a disc, and randomly placed overlapping discs stop leaving a
   * connected path through them at around 33%, which is not a dense rainforest, it is a maze with
   * no way out. Honouring only trunks and boulders puts it near 19%, and the walk test proves the
   * ground stays connected. What you actually feel is the right thing anyway: you shoulder through
   * a bush and you walk around a tree.
   */
  blockingHeightM?: number;
  /**
   * Let the classes that ask for it cast shadows. Off is a cheap way to buy back a shadow pass.
   *
   * "Ask for it" is two tests since DECISIONS C20, not one: the registry's `castsShadow` and a
   * collider at least {@link SHOULDER_HEIGHT_M} tall. This flag is the third and it is the caller's.
   */
  shadows?: boolean;
  /**
   * Grid step of the frustum-culling buckets, metres. See {@link DEFAULT_BUCKET_M} for the sweep
   * this was chosen off; it changes what is SUBMITTED and can never change what is placed.
   */
  bucketM?: number;
  /**
   * Let each class drop to its two-triangle far form past its own `lod.farM` (DECISIONS C21).
   *
   * On is the shipped answer. Off is not a taste: it is the control the guards render against, in
   * the same session on the same machine, so "what the impostor bought" and "what the impostor
   * changed" are differences and not two remembered numbers. It changes what is SUBMITTED and, like
   * `bucketM`, can never change where an instance stands.
   */
  impostors?: boolean;
  /**
   * Own the whole answer instead. This REPLACES the footprint, the clearing and the stations, so a
   * caller that reaches for it is taking responsibility for the spawn being standable too. Prefer
   * `stations` and `footprintTiles`, which add to a floor that is already right.
   */
  exclusions?: (ctx: LayerContext) => Exclusions;
}

/** What one `cull` submitted, per pass. Triangles here are the renderer's own definition. */
export interface CullReport {
  /** Meshes with at least one instance left, which is one draw call each. */
  mainMeshes: number;
  mainInstances: number;
  mainTriangles: number;
  shadowMeshes: number;
  shadowInstances: number;
  shadowTriangles: number;
  /**
   * The far band, which is inside the three main-pass numbers above and broken out here.
   *
   * BOTH SIDES ARE READ OFF A GEOMETRY, which is the whole point of reporting them:
   * `impostorTriangles` is what the far MESH draws, counted from the geometry that mesh is holding,
   * and `farBandFullTriangles` is what those same instances would have cost through the class's own
   * full form. The difference is exactly what DECISIONS C21 bought. It used to be
   * `instances * IMPOSTOR_TRIANGLES`, a constant, which made the two numbers say the impostor was
   * cheap whatever geometry the far mesh had been pointed at: aim it at the class's own merged form
   * and the report still claimed two triangles an instance while the GPU drew ninety.
   */
  impostorMeshes: number;
  impostorInstances: number;
  impostorTriangles: number;
  farBandFullTriangles: number;
  /** What the same frame would submit with no split at all: every instance, every frame. */
  unsplitMainTriangles: number;
  unsplitShadowTriangles: number;
  /** Wall-clock milliseconds this cull took, both passes. */
  ms: number;
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
  /**
   * The MAIN pass mesh of each class that got at least one instance. Its `count` is what the last
   * `cull` left standing, not the class's whole placement; the placement is `buckets`.
   */
  readonly meshes: ReadonlyMap<AssetClassId, THREE.InstancedMesh>;
  /** The shadow-pass twin of each class that casts one. Empty when `shadows` is off. */
  readonly shadowMeshes: ReadonlyMap<AssetClassId, THREE.InstancedMesh>;
  /**
   * The far-band mesh of each class, drawing the two-triangle card past that class's own
   * `lod.farM`. Empty when `impostors` is off. Its `count` is what the last `cull` left standing.
   */
  readonly impostorMeshes: ReadonlyMap<AssetClassId, THREE.InstancedMesh>;
  /** The split itself: every instance of a class, in bucket order, with each bucket's world box. */
  readonly buckets: ReadonlyMap<AssetClassId, ScatterBuckets>;
  /**
   * Pack each class against these two cameras and report what was submitted. `shadowCamera` null
   * means no shadow pass this frame, and every twin draws nothing.
   */
  cull(camera: THREE.Camera, shadowCamera: THREE.Camera | null): CullReport;
  /** What the last `cull` submitted, or null if none has run. */
  lastCull(): CullReport | null;
  /**
   * Forget what the last `cull` packed, so the next one copies rather than trusting the buffers.
   *
   * The cull skips its copy and its upload when this frame's visible buckets are the same as last
   * frame's, which is what makes a standing camera free. That is only sound while nothing else
   * writes the instance buffers, and the layer cannot know when something has. Anything that does,
   * a harness comparing the split against no split, a future effect, calls this first.
   */
  invalidate(): void;
  /**
   * Would a body of `radiusM` standing at this TILE position be inside something solid. This is
   * the one question the mover asks; the frame conversion lives here so the mover never learns
   * about planet-local metres.
   */
  blockedTile(x: number, y: number, radiusM: number): boolean;
  /** Wall-clock milliseconds the build took. Reported, because the budget is an acceptance number. */
  buildMs(): number;
  /** Milliseconds the split's bucket sort cost on top of the placement. */
  splitMs(): number;
}

/** A macrotask, so the browser can paint and an abort can land between two pieces of work. */
const yieldToLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * How many triangles one instance of this geometry costs the renderer, counted off the buffers it
 * is holding.
 *
 * Every triangle number this layer reports goes through here, the far band's included, so a report
 * is a statement about the geometry that is actually bound and not about which constant the author
 * believed was bound. Indexed and non-indexed both, because the answer must not depend on which
 * one a future form is built as; nothing in SCATTER_GEOMETRY or scatterImpostor is indexed today.
 */
function trianglesOf(geometry: THREE.BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / 3;
}

/** Props stand upright and turn about the world's up axis, and only about that. */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The bucket grid, metres. SWEPT ON THE ORDINARY PARCEL, at the spawn, whole frame, both passes.
 * Finer is not free: a bucket is a box test twice a frame, and the boxes are per class, so the
 * count is the sum over the classes and not one grid.
 *
 *   grid   buckets   scatter triangles   the worst of twelve   cull p50    split, of a
 *            (all      main + shadow      whole frames         (M4 Pro)    ~390 ms build
 *          classes)     at the spawn
 *   4000 m       32        1,439,110           1,623,354       0.079 ms        3.9 ms
 *    250 m      128          858,196                   -       0.105 ms        4.1 ms
 *    128 m      462          505,519                   -       0.029 ms        4.8 ms
 *     64 m    1,538          356,996                   -       0.032 ms        6.2 ms
 *     32 m    4,977          289,100                   -       0.071 ms        6.8 ms
 *     24 m    7,931          273,894             639,358       0.085 ms        6.9 ms
 *     16 m   14,191          260,010             622,210       0.141 ms        7.3 ms
 *     12 m   20,074          254,022             615,168       0.197 ms       11.2 ms
 *
 * The 4,000 m row is the degenerate control, one bucket per class, and it reproduces the unsplit
 * 1,439,110 exactly, which is how the sweep was checked against the thing it is measuring.
 *
 * SIXTEEN IS WHERE THE MARGINAL BUCKET STOPS PAYING. Going 24 to 16 buys 17,148 whole-frame
 * triangles for 6,260 more buckets, 2.7 triangles a bucket; going 16 to 12 buys 7,042 for 5,883,
 * which is 1.2, less than half the rate, for the same 0.056 ms again. The floor underneath all of
 * it is geometric: at these sizes a bucket's box is mostly the forms' own reach, so halving the
 * grid stops halving the volume.
 */
export const DEFAULT_BUCKET_M = 16;

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
  const blockingHeightM = options.blockingHeightM ?? SHOULDER_HEIGHT_M;

  const bucketM = options.bucketM ?? DEFAULT_BUCKET_M;

  const impostors = options.impostors ?? true;

  const meshes = new Map<AssetClassId, THREE.InstancedMesh>();
  const shadowMeshes = new Map<AssetClassId, THREE.InstancedMesh>();
  const impostorMeshes = new Map<AssetClassId, THREE.InstancedMesh>();
  const buckets = new Map<AssetClassId, ScatterBuckets>();
  /**
   * One material for the whole far band, made on the first class that needs one. The colour rides
   * on the card's vertices, so a fern's card and a thicket's differ only in their buffers; sharing
   * is one shader program for the far band instead of one per class.
   */
  let farMaterial: THREE.MeshLambertMaterial | null = null;
  /** Per class, everything the per-frame cull needs and nothing it has to allocate. */
  const splits: Array<{
    id: AssetClassId;
    trianglesPerInstance: number;
    /**
     * What ONE far-band instance costs, counted off `farMesh.geometry` rather than assumed. Zero
     * when there is no far mesh. See {@link CullReport} for why this is not a constant.
     */
    farTrianglesPerInstance: number;
    /** This class's own `lod.farM`, or Infinity when the far band is switched off. */
    farM: number;
    buckets: ScatterBuckets;
    mesh: THREE.InstancedMesh;
    shadowMesh: THREE.InstancedMesh | null;
    farMesh: THREE.InstancedMesh | null;
    /** What the last cull left in the twin, so the main pass can borrow its count and give it back. */
    shadowCount: number;
    runs: Int32Array;
    farRuns: Int32Array;
    lastMain: { runs: Int32Array; count: number };
    lastFar: { runs: Int32Array; count: number };
    lastShadow: { runs: Int32Array; count: number };
  }> = [];
  // The registry is not known until the mask says what this cell is made of, so these two are
  // filled in `build` and cleared by `dispose`, exactly as `placement` and `index` already are.
  let classes: readonly AssetClass[] = [];
  let blocking: ReadonlySet<AssetClassId> = new Set<AssetClassId>();
  let placement: Placement | null = null;
  let index: ColliderIndex | null = null;
  let used: Exclusions | null = null;
  let frame: WorldFrame | null = null;
  let buildMs = 0;
  let splitMs = 0;
  let report: CullReport | null = null;

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  // The cull's whole working set, allocated once. A per-frame `new THREE.Frustum` is 6 planes and
  // 6 vectors of garbage sixty times a second for a layer whose entire point is not costing that.
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const mainPlanes = new Float32Array(24);
  const shadowPlanes = new Float32Array(24);
  const meshSphere = new THREE.Sphere();
  const eye = new THREE.Vector3();

  const dispose = () => {
    for (const mesh of impostorMeshes.values()) {
      // The card's geometry is memoised per class in scatterImpostor.ts and shared with every
      // other world that ever draws this class, so it is NOT disposed here; the material is this
      // layer's own and is given back once, below. What this frees is the instance buffer.
      mesh.removeFromParent();
      mesh.dispose();
    }
    impostorMeshes.clear();
    farMaterial?.dispose();
    farMaterial = null;
    for (const mesh of shadowMeshes.values()) {
      // The twin SHARES the class's geometry and material with the main mesh, so it gives back
      // only its own instance buffer here; disposing the shared pair is the main mesh's job below.
      mesh.removeFromParent();
      mesh.dispose();
    }
    shadowMeshes.clear();
    for (const mesh of meshes.values()) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      // Frees the instance matrix buffer, which is 64 bytes per instance and the largest thing
      // this layer ever uploads: twenty thousand ferns is 1.3 MB of GPU memory on its own.
      mesh.dispose();
    }
    meshes.clear();
    buckets.clear();
    splits.length = 0;
    report = null;
    splitMs = 0;
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
   * One class: the matrices, the buckets they are sorted into, and the one or two meshes that draw
   * them. The scene positions are collected as they are computed so the bounding sphere can be
   * built without asking the height function for all of them a second time: `toScene` is a terrain
   * field evaluation, and there are forty thousand of them in a build.
   */
  const buildClass = (ctx: LayerContext, cls: AssetClass, group: readonly PlacedAsset[]) => {
    // Both lookups are total over `classes`, which `drawableClasses` filtered before anything was
    // placed. That filter is the only thing standing between here and a crash.
    const geometry = SCATTER_GEOMETRY[cls.id]!();
    const material = SCATTER_MATERIAL[cls.id]!();
    // DECISIONS C21. The card is derived from `geometry` itself, memoised on the class id, so this
    // is 1 to 14 ms on the first cell that grows this class and nothing on any cell after it.
    const card = impostors ? impostorFor(cls.id) : null;

    const source = new Float32Array(group.length * 16);
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
      matrix.toArray(source, i * 16);
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

    // The bounding sphere, computed rather than left to three. `InstancedMesh.computeBoundingSphere`
    // would do it, but it walks every instance matrix a second time, and a WRONG sphere is the
    // classic instancing bug: too small and whole classes blink out at the edge of the screen, too
    // large and nothing is ever culled. `reach` is how far the form's own geometry extends from its
    // instance origin, and it survives the Y rotation because a rotation preserves a length.
    //
    // It is still the sphere over EVERY instance and not over the ones drawn this frame, because it
    // is what three tests the whole object against, in both passes, before the layer's own buckets
    // get a say. A sphere shrunk to the packed set would cull the mesh that is about to be repacked.
    // The form's own sphere, widened to hold the card as well where the card pokes out of it. The
    // bucket boxes are built from this one sphere and are what BOTH main-pass meshes are culled by,
    // so a box that held only the form could cull a bucket whose card was still on screen. See
    // `sweptRadius`: it leaves twenty-five of the twenty-six classes untouched, so C20's shadow
    // pass reads the same numbers it read before C21 on every shipped route.
    const gs = geometry.boundingSphere!;
    const cullRadius = card ? Math.max(gs.radius, sweptRadius(card.geometry, gs.center)) : gs.radius;
    const reach = gs.center.length() + cullRadius;
    const centre = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    let radius = 0;
    for (let i = 0; i < group.length; i++) {
      const dx = scenePositions[i * 3]! - centre.x;
      const dy = scenePositions[i * 3 + 1]! - centre.y;
      const dz = scenePositions[i * 3 + 2]! - centre.z;
      const r = Math.hypot(dx, dy, dz) + group[i]!.scale * reach;
      if (r > radius) radius = r;
    }

    const t0 = performance.now();
    const split = bucketise(source, group.length, gs.center, cullRadius, bucketM);
    splitMs += performance.now() - t0;

    // DECISIONS C20: the registry says whether a class casts AT ALL, and this height test says
    // whether it is tall enough to be worth the shadow pass. Both have to agree. `collider` null is
    // a thing you walk over, which is under any height there is.
    const casts = shadows && cls.castsShadow && cls.collider !== null && cls.collider.heightM >= SHOULDER_HEIGHT_M;
    const make = (suffix: string, cast: boolean, form = geometry, paint: THREE.Material = material): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(form, paint, group.length);
      mesh.name = `scatter:${cls.id}${suffix}`;
      mesh.castShadow = cast;
      // The twin never draws in the main pass, so its own shadow receiving is moot; it matches the
      // main mesh anyway because `receiveShadow` is a PROGRAM parameter and the two share one
      // material. Differing here would compile the same material twice and add a program to a
      // count the budget watches.
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.boundingSphere = new THREE.Sphere(centre.clone(), radius);
      // Rewritten every frame the visible set changes, so the driver is told to expect it rather
      // than left to discover it on a buffer marked static.
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Until the first `cull`, a mesh draws its whole class. That is the honest state for anything
      // that never culls at all, a still frame or a headless build, and it is what the seating test
      // walks; one frame of it is the worst a mount can pay before its first `beforeRender`.
      (mesh.instanceMatrix.array as Float32Array).set(split.matrices);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = group.length;
      return mesh;
    };

    // The main mesh does NOT cast: its twin does, out of a buffer packed against the shadow camera
    // rather than against the eye. With no twin (a class the registry says casts nothing, or
    // `shadows` off) the main mesh is the only mesh and casts nothing either, as before.
    const mesh = make("", false);
    const shadowMesh = casts ? make(":shadow", true) : null;
    // The far band never casts, and after DECISIONS C22 that is a decision rather than an accident.
    // It used to be neither: the shortest casting `farM` was 700 m against the 591 m a caster
    // inside the 240 m shadow box can stand from the lens, so no caster could reach the far band
    // and the question never arose. C22 measured those distances against the disk the scatter
    // actually fills and the shortest casting `farM` is now cactus at 350 m, well inside 591, so a
    // caster IS in the far band and its shadow is cast by the twin below, out of the class's own
    // full form. That is the right way round: a two-triangle card casts a two-triangle sliver, and
    // the ground it would fall on stands at least 350 m away, past everything the lens can see of
    // it. What must stay true is that `farM` never reaches the shadow pass at all, which is why the
    // twin is packed by `visibleRuns` and not by `visibleRunsByRange`; tests/scatterImpostor.test.mts
    // culls the same cell under two `farM` tables three hundred metres apart and holds the shadow
    // pass identical.
    let farMesh: THREE.InstancedMesh | null = null;
    if (card) {
      farMaterial ??= impostorMaterial();
      farMesh = make(":far", false, card.geometry, farMaterial);
      // Until the first cull the far mesh draws NOTHING, where the main mesh draws its whole class.
      // Both are the honest state of a layer that has not been culled: the main mesh is the world
      // in full, and the far band is the part of it that has been replaced, which is none of it.
      farMesh.count = 0;
    }
    const runs = new Int32Array(split.start.length * 2);
    return {
      mesh,
      shadowMesh,
      farMesh,
      split,
      entry: {
        id: cls.id,
        trianglesPerInstance: trianglesOf(geometry),
        farTrianglesPerInstance: farMesh ? trianglesOf(farMesh.geometry) : 0,
        farM: card ? cls.lod.farM : Infinity,
        buckets: split,
        mesh,
        shadowMesh,
        farMesh,
        shadowCount: shadowMesh ? group.length : 0,
        runs,
        farRuns: new Int32Array(split.start.length * 2),
        lastMain: { runs: new Int32Array(runs.length), count: -1 },
        lastFar: { runs: new Int32Array(runs.length), count: -1 },
        lastShadow: { runs: new Int32Array(runs.length), count: -1 },
      },
    };
  };

  /**
   * Pack every class against these two cameras. This is the whole per-frame cost of the split.
   *
   * THE ORDER OF THE TWO PASSES IS THE RENDERER'S, not this function's: three uploads each mesh's
   * instance buffer during `projectObject`, before either pass draws, so both sets have to be in
   * their own buffer before `render` is called at all. That is why the shadow pass has its own
   * mesh, and why this is a `beforeRender` hook rather than an `onBeforeShadow` one.
   *
   * WHEN EACH UPLOAD ACTUALLY HAPPENS, which is worth writing down because it is not obvious and
   * it was measured rather than assumed. `WebGLObjects.update` uploads an instanced mesh at most
   * once per value of `info.render.frame`, and `render()` increments that counter BETWEEN
   * `projectObject` and the shadow pass. So each object is offered two chances a frame and takes
   * the first one it is eligible for: the main meshes, which cast nothing and are therefore never
   * visited by the shadow pass, upload at `projectObject`; the twins, tagged by the previous
   * frame's shadow pass, skip `projectObject` and upload inside the shadow pass, immediately
   * before the draw that reads them. Both land before their own pass, which is all that is needed.
   * Flipping a mesh's `castShadow` between renders breaks that alternation and defers its upload
   * by one render; nothing in the layer does, and a harness that does has to render once to settle.
   */
  const cull = (camera: THREE.Camera, shadowCamera: THREE.Camera | null): CullReport => {
    const t0 = performance.now();
    const out: CullReport = {
      mainMeshes: 0,
      mainInstances: 0,
      mainTriangles: 0,
      shadowMeshes: 0,
      shadowInstances: 0,
      shadowTriangles: 0,
      impostorMeshes: 0,
      impostorInstances: 0,
      impostorTriangles: 0,
      farBandFullTriangles: 0,
      unsplitMainTriangles: 0,
      unsplitShadowTriangles: 0,
      ms: 0,
    };

    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    planesOf(frustum, mainPlanes);
    // The lens's own world position, which is where every far distance is measured from. Read off
    // the matrix rather than off `camera.position`, because a camera parented to something would
    // have a local position and the buckets are in world space.
    eye.setFromMatrixPosition(camera.matrixWorld);
    let shadowReady = false;
    if (shadowCamera) {
      projScreen.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
      planesOf(frustum, shadowPlanes, SHADOW_PAD_M);
      shadowReady = true;
    }

    for (const s of splits) {
      const all = s.buckets.instances * s.trianglesPerInstance;
      out.unsplitMainTriangles += all;
      if (s.shadowMesh) out.unsplitShadowTriangles += all;

      // The object-level test three would do anyway, done first: a class entirely behind the
      // camera costs one sphere test rather than one box test per bucket.
      meshSphere.copy(s.mesh.boundingSphere!).applyMatrix4(s.mesh.matrixWorld);
      let n = 0;
      let far = 0;
      if (frustumHas(mainPlanes, meshSphere)) {
        // One sweep, two lists: the buckets inside this class's own far distance and the ones past
        // it. With no far mesh `farM` is Infinity and this is exactly `visibleRuns`.
        const split = visibleRunsByRange(s.buckets, mainPlanes, eye.x, eye.y, eye.z, s.farM, s.runs, s.farRuns);
        n = packInto(s.mesh, s.buckets, s.runs, split.nearCount, s.lastMain);
        if (s.farMesh) far = packInto(s.farMesh, s.buckets, s.farRuns, split.farCount, s.lastFar);
      } else {
        n = packInto(s.mesh, s.buckets, s.runs, 0, s.lastMain);
        if (s.farMesh) far = packInto(s.farMesh, s.buckets, s.farRuns, 0, s.lastFar);
      }
      if (n > 0) {
        out.mainMeshes++;
        out.mainInstances += n;
        out.mainTriangles += n * s.trianglesPerInstance;
      }
      if (far > 0) {
        out.mainMeshes++;
        out.mainInstances += far;
        out.mainTriangles += far * s.farTrianglesPerInstance;
        out.impostorMeshes++;
        out.impostorInstances += far;
        out.impostorTriangles += far * s.farTrianglesPerInstance;
        out.farBandFullTriangles += far * s.trianglesPerInstance;
      }

      if (!s.shadowMesh) continue;
      let m = 0;
      if (shadowReady && frustumHas(shadowPlanes, meshSphere)) {
        m = packInto(s.shadowMesh, s.buckets, s.runs, visibleRuns(s.buckets, shadowPlanes, s.runs), s.lastShadow);
      } else {
        m = packInto(s.shadowMesh, s.buckets, s.runs, 0, s.lastShadow);
      }
      s.shadowCount = m;
      if (m > 0) {
        out.shadowMeshes++;
        out.shadowInstances += m;
        out.shadowTriangles += m * s.trianglesPerInstance;
      }
    }

    out.ms = performance.now() - t0;
    report = out;
    return out;
  };

  /**
   * The hook PlanetWorld calls after every layer's `update` and after the camera has been moved,
   * which is the last moment the eye is knowable and the first moment three would look at a matrix
   * buffer. Anything culled earlier would be culled against last frame's camera, and on a turn
   * that is a wall of trees arriving a frame late.
   */
  const beforeRender = (ctx: LayerContext) => {
    if (splits.length === 0) return;
    // The player layer writes `camera.position` and `camera.quaternion` directly; the world matrix
    // and its inverse are three's to derive and it does so inside `render`, which is too late.
    ctx.camera.updateMatrixWorld();
    let shadowCamera: THREE.Camera | null = null;
    const key = ctx.scene.getObjectByName("key") as THREE.DirectionalLight | undefined;
    if (key?.isDirectionalLight && key.castShadow && ctx.renderer?.shadowMap?.enabled !== false) {
      // The same three calls `WebGLShadowMap.render` is about to make, made here because it makes
      // them AFTER this hook. They are pure functions of the light's position and its target, both
      // of which the sky and terrain layers have already set for this frame, so three repeating
      // them a moment later lands on the same matrices.
      key.updateWorldMatrix(true, false);
      key.target.updateWorldMatrix(true, false);
      key.shadow.updateMatrices(key);
      shadowCamera = key.shadow.camera;
    }
    cull(ctx.camera, shadowCamera);
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
      const built = buildClass(ctx, cls, group);
      if (signal.aborted) {
        // Nothing built here has been added to the scene yet, so it is given back here and the
        // rest of the layer is torn down by `dispose`. A build that adds after the signal is the
        // leak the layer contract exists to prevent, and a build that drops a buffer on the floor
        // instead is the same leak with no scene graph to find it in.
        built.mesh.geometry.dispose();
        (built.mesh.material as THREE.Material).dispose();
        built.mesh.dispose();
        built.shadowMesh?.dispose();
        built.farMesh?.dispose();
        dispose();
        return;
      }
      ctx.scene.add(built.mesh);
      meshes.set(cls.id, built.mesh);
      buckets.set(cls.id, built.split);
      if (built.farMesh) {
        ctx.scene.add(built.farMesh);
        impostorMeshes.set(cls.id, built.farMesh);
      }
      if (built.shadowMesh) {
        ctx.scene.add(built.shadowMesh);
        shadowMeshes.set(cls.id, built.shadowMesh);
        // The twin is not drawn by the main pass, and this is how: three calls `onBeforeRender`
        // between building the render list and issuing the draw, and `renderInstances` returns
        // before `gl.drawArraysInstanced` when the count is zero, so the main pass sees neither a
        // call nor a triangle.
        //
        // THE COUNT IS PUT BACK IMMEDIATELY, in the paired `onAfterRender`, and this is not
        // tidiness. Leaving it at zero until the next `beforeRender` made the shadow pass of any
        // SECOND render of the same frame draw nothing, and a renderer renders a scene twice for
        // more reasons than a frame loop: a transmission pass, an XR eye, a screenshot taken by
        // hand. The bug was caught by a control that rendered one unchanged state twice and got
        // 620,615 differing pixels of 1,024,000, which no count of instances could have seen.
        built.shadowMesh.onBeforeRender = () => {
          built.shadowMesh!.count = 0;
        };
        built.shadowMesh.onAfterRender = () => {
          built.shadowMesh!.count = built.entry.shadowCount;
        };
      }
      splits.push(built.entry);
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
    shadowMeshes,
    impostorMeshes,
    buckets,
    build,
    beforeRender,
    dispose,
    cull,
    lastCull: () => report,
    invalidate() {
      for (const s of splits) {
        s.lastMain.count = -1;
        s.lastFar.count = -1;
        s.lastShadow.count = -1;
      }
    },
    placement: () => placement,
    colliders: () => index,
    classes: () => classes,
    blockingClasses: () => blocking,
    exclusions: () => used,
    buildMs: () => buildMs,
    splitMs: () => splitMs,
    blockedTile(x, y, radiusM) {
      if (!index || !frame || index.count === 0) return false;
      const [xm, ym] = frame.toLocalM(x, y);
      // queryCircle already widens by the largest radius in the index, so the filter is the last
      // step and never the reason a disc is missed.
      return index.queryCircle(xm, ym, radiusM).some((c) => blocking.has(c.classId));
    },
  };
}
