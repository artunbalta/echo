/**
 * The scene host (contract, plan §4). Replaces ParcelWorld.
 *
 * It owns exactly what a host should: a renderer (its own, or one handed to it), a scene, a
 * camera, lights, the frame loop, resize and disposal. Everything that makes the world a world is
 * a LAYER: terrain chunks, scatter, the player, stations, the day cycle, reactions. Layers are
 * built in order, asynchronously, under one abort signal, so a React StrictMode double-mount or a
 * navigation away cancels a build cleanly instead of leaking a second world into the first.
 *
 * Coordinates. Layers work in the tile frame from controller.ts: tile (x east, y south), tile
 * (0, 0) at the anchor cell's centre. The host converts to three's (x east, y up, z south) and to
 * the planet's local metres (x east, y north); `frame.heightAtTile` is the one height function,
 * and it is `sceneHeightAt`, the function the cross-renderer agreement test pins to the globe (I1).
 *
 * The renderer handle. The landing shows a globe first and this world second, and the budget is
 * one WebGL context on the page. `RendererHandle` is how the two share it: whoever mounts first
 * creates it, the other acquires it when it is its turn to draw, and releasing hands the context
 * back to whoever had it before. A world built with a handle never disposes the renderer.
 */

import * as THREE from "three";
import {
  createSceneHeight,
  createTangentPatch,
  createTerrain,
  regionBound,
  spawnPointFor,
  walkableAt,
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  type Calibration,
  type RegionBound,
  type SpawnPoint,
  type TangentPatch,
  type TerrainField,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { localMToTile, tileToLocalM } from "./controller";
// Relative, not the "@/" alias: everything in this directory reaches outside it for TYPES only, and
// tsx (which runs the node tests) does not honour the alias for a runtime import.
import { coarsePointer } from "../../lib/pointerKind";

// ── the shared renderer ─────────────────────────────────────────────────────────

export interface RendererHandle {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  /** Who is drawing right now. A party that is not the owner must not render or resize. */
  readonly owner: string | null;
  /** Take the context. The previous owner is remembered and gets it back on release. */
  acquire(owner: string): void;
  /** Give the context back to whoever had it before you. A no-op if you are not the owner. */
  release(owner: string): void;
  /** Move the canvas into another element, e.g. from the globe's host to the world's. */
  attach(host: HTMLElement): void;
  /** The element the canvas currently lives in. */
  readonly host: HTMLElement;
  /** Dispose the GL context. Only the party that created the handle may call this. */
  dispose(): void;
}

/**
 * A phone draws MORE pixels than the laptop every number in DECISIONS.md was measured on, not fewer
 * (DECISIONS C23). A 393 x 852 iPhone at device pixel ratio 3 hits the cap of 2 and comes out at
 * 786 x 1704 = 1.34 MPix, against the 1280 x 800 = 1.02 MPix the C22 tables were derived at — 31%
 * more fragments on a part with roughly half the bandwidth. So the two settings that are purely
 * about fragments, and about nothing this world's geometry or placement decides, are turned down on
 * a coarse pointer: the ratio to 1.5, which is 1.78x fewer fragments and still past what an eye
 * resolves at arm's length on a 3x display, and multisampling off, which on a tile-based mobile GPU
 * is paid for in tile memory rather than in time and is the setting most likely to cost a whole
 * extra pass. Nothing about WHAT is drawn changes — no instance moves, no density is second-guessed
 * — which is the line scatterLayer's header draws and this stays on the safe side of.
 */
export function createRendererHandle(host: HTMLElement): RendererHandle {
  const lean = coarsePointer();
  const renderer = new THREE.WebGLRenderer({ antialias: !lean, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(lean ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);
  const owners: string[] = [];
  let where = host;
  return {
    renderer,
    canvas: renderer.domElement,
    get owner() {
      return owners.length ? owners[owners.length - 1]! : null;
    },
    get host() {
      return where;
    },
    acquire(who) {
      const i = owners.indexOf(who);
      if (i >= 0) owners.splice(i, 1);
      owners.push(who);
    },
    release(who) {
      const i = owners.indexOf(who);
      if (i >= 0) owners.splice(i, 1);
    },
    attach(next) {
      if (next === where) return;
      next.appendChild(renderer.domElement);
      where = next;
    },
    dispose() {
      owners.length = 0;
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// ── the frame and the layer contract ────────────────────────────────────────────

export interface WorldFrame {
  readonly patch: TangentPatch;
  readonly tileM: number;
  readonly heightScaleM: number;
  /**
   * The lattice the ground is drawn on, metres. The terrain layer builds its mesh on exactly this
   * grid and the walking-scale displacement is defined on it, so a layer that wanted a different
   * one would be drawing a surface `heightAtTile` does not describe: it is read here, never passed.
   */
  readonly resolutionM: number;
  /**
   * Metres above sea level at a tile position; negative under water. The I1 function, plus the
   * displacement of DECISIONS C2, which the terrain mesh carries exactly because it is defined on
   * the mesh's own lattice. Everything that stands on the ground is seated by this and nothing
   * else.
   */
  heightAtTile(x: number, y: number): number;
  /** Land and inside the region: the mover's only gate. */
  walkableTile(x: number, y: number): boolean;
  /** Tile position to three's world space, at ground height plus `liftM`. */
  toScene(x: number, y: number, liftM?: number, out?: THREE.Vector3): THREE.Vector3;
  /** three's world space back to a tile position. */
  fromScene(v: THREE.Vector3): [number, number];
  /** Tile to planet-local metres (east, north). */
  toLocalM(x: number, y: number): [number, number];
  fromLocalM(xm: number, ym: number): [number, number];
}

export interface RegionInfo {
  readonly cell: string;
  readonly k: number;
  /** The exact hexagonal union the scene builds, in the anchor frame. */
  readonly bound: RegionBound;
  /** Radius of a circle containing the region: the mask and chunk extents. */
  readonly extentM: number;
  readonly spawn: SpawnPoint;
  /** The spawn in tiles. */
  readonly spawnTile: [number, number];
}

export interface LayerContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly frame: WorldFrame;
  readonly field: TerrainField;
  readonly calibration: Calibration;
  readonly seed: string;
  readonly radiusKm: number;
  readonly region: RegionInfo;
  /** Layers may look each other up by name (the reactions layer finds the campfire). */
  layer<T extends WorldLayer>(name: string): T | undefined;
}

export interface WorldLayer {
  readonly name: string;
  /**
   * Build once. Check `signal.aborted` after every await and before every scene mutation; a build
   * that adds geometry after abort is the leak this contract exists to prevent.
   */
  build(ctx: LayerContext, signal: AbortSignal): Promise<void>;
  update?(dt: number, ctx: LayerContext): void;
  /**
   * The last moment before `renderer.render`, after EVERY layer's `update` and after the camera
   * has moved. `update` is not that moment: the player layer drives the camera and runs after the
   * scatter, so a layer that culls in its own `update` culls against the previous frame's eye, and
   * on a turn that is a wall of trees arriving one frame late. A layer that needs the final camera
   * or the final light takes this hook and nothing else; it runs sixty times a second and may not
   * build, allocate or await.
   */
  beforeRender?(ctx: LayerContext): void;
  dispose?(): void;
}

// ── the host ────────────────────────────────────────────────────────────────────

export interface PlanetWorldOptions {
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  /** The anchor cell. Its centre is tile (0, 0). */
  cell: string;
  /** Ring count of the built disk. 1 = the cell and its six neighbours. */
  k?: number;
  /**
   * Grid spacing of the ground mesh, metres. It lives here rather than on the terrain layer because
   * the height function is built here and the displacement is defined on this lattice; two owners
   * would be two lattices, and every prop would float by the difference.
   */
  resolution?: number;
  /** A renderer to share. Absent: the host makes and owns one. */
  handle?: RendererHandle;
  heightScaleM?: number;
  tileM?: number;
  /** Sample renderer.info every second into `info`, whole frame, both passes. Costs nothing when off. */
  devInfo?: boolean;
  /**
   * Also attribute every draw to the layer that added the object. Implies `devInfo`.
   *
   * A separate flag because it is not free: it walks the scene once a frame and brackets every
   * object's draws with four closures. The frame it measures is a frame with an instrument in it,
   * so the fps beside a per-layer table is worth less than the fps beside a bare one.
   */
  devLayers?: boolean;
}

/** What one layer cost in the frame that was sampled, split by pass. */
export interface LayerCost {
  calls: number;
  triangles: number;
  shadowCalls: number;
  shadowTriangles: number;
}

export interface RenderInfo {
  /**
   * Draw calls and triangles, WHOLE FRAME: the shadow pass and the main pass together.
   *
   * They were the main pass alone until SOC-1.A, and not by anyone's choice. three draws the whole
   * shadow map and THEN calls `info.reset()`, so a plain read after `render()` reports only what was
   * drawn since that reset. `tests/e2e/scatterSplit.spec.ts` had already found this from the
   * outside, and DECISIONS C28 is the number: the ordinary parcel's whole frame is 907,250 triangles
   * where a plain read says 664,805. Every number this host has ever put in a data attribute —
   * including the 628,415 in `living-world-rendering.md` — is a frame minus its shadow map. The
   * instrument that separates them now lives here rather than only in a spec, because the question
   * C23 ends on is about the page a person opens, not about a page with a harness attached.
   */
  calls: number;
  triangles: number;
  /** The main pass alone: what `calls` and `triangles` used to mean. */
  mainCalls: number;
  mainTriangles: number;
  shadowCalls: number;
  shadowTriangles: number;
  /** The WORST whole frame of the sampling window, which is what DECISIONS C16 is read against. */
  worstCalls: number;
  worstTriangles: number;
  geometries: number;
  textures: number;
  /** Frames per second over the last sampling window. */
  fps: number;
  /**
   * What the reading was taken at. A phone caps its ratio at 1.5 and turns multisampling off
   * (`createRendererHandle`, DECISIONS C23) and the e2e helpers force a ratio of 1, so a row that
   * does not carry these three numbers cannot be compared with any table in DECISIONS.
   */
  pixelRatio: number;
  width: number;
  height: number;
  /**
   * Per layer, by the name the layer gave itself; empty unless the "layers" level was asked for.
   *
   * IT CANNOT BE DERIVED. `parcelWorld.ts` composes a FLAT list of layers into ONE scene, so nothing
   * downstream knows whose mesh is whose, and the names do not settle it either: `detailLayer` names
   * its meshes `scatter:<class>:detail`, the slice names its props "campfire" and "cave_mouth", and
   * the player's body is a tree of unnamed meshes under one named root. Whoever ADDED the object is
   * the one fact that is always right, and the host is the one holding it. See `instrument`.
   *
   * A layer that adds nothing to the scene has no row here, and that is correct rather than a gap:
   * `canopyClosure` edits the terrain's colours in place and `walk` allocates nothing at all, so
   * neither draws, and a zero row for them would imply they were measured and found free.
   */
  layers: Record<string, LayerCost>;
}

export type BuildPhase = "idle" | "building" | "ready" | "aborted" | "failed";

const HOST_OWNER = "planet-world";

/**
 * The lens, in degrees of VERTICAL field of view, which is what three's PerspectiveCamera takes.
 *
 * Exported because DECISIONS C22 measures against it: every class's `lod.farM` is the distance at
 * which its own form falls to a few pixels through this camera, so a change here is a change to
 * twenty-six distances in packages/planet/lib/assets.ts and tests/farBand.test.mts will say so.
 */
export const CAMERA_FOV_DEG = 50;

export class PlanetWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 6000);
  readonly frame: WorldFrame;
  readonly region: RegionInfo;
  readonly field: TerrainField;
  readonly calibration: Calibration;
  readonly handle: RendererHandle;

  private readonly ownsRenderer: boolean;
  private readonly layers: WorldLayer[] = [];
  private readonly byName = new Map<string, WorldLayer>();
  private abort: AbortController | null = null;
  private generation = 0;
  private raf = 0;
  private lastT = 0;
  private observer: ResizeObserver | null = null;
  private disposed = false;
  private follow: (() => { x: number; y: number; liftM?: number }) | null = null;
  private readonly camPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private infoSamples = 0;
  private infoAt = 0;
  /** The layer whose code is running right now, so `scene.add` can stamp whatever it adds. */
  private attributing: string | null = null;
  private readonly cost = new Map<string, LayerCost>();
  private shadowPass = { calls: 0, triangles: 0 };
  private worstFrame = { calls: 0, triangles: 0 };
  private readonly reporting: boolean;
  private readonly attributingLayers: boolean;
  private restoreInstrument: (() => void) | null = null;
  private readonly bufferSize = new THREE.Vector2();
  phase: BuildPhase = "idle";
  info: RenderInfo | null = null;
  /** Called on every phase change of the CURRENT build; a superseded build never reports. */
  onPhase: ((phase: BuildPhase, error?: unknown) => void) | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: PlanetWorldOptions,
  ) {
    // Everything that can throw comes before anything that allocates a GL context, so a bad cell
    // leaves nothing behind in the DOM.
    this.field = createTerrain(options.seed);
    this.calibration = {
      seaLevel: options.seaLevel,
      peakElevation: options.peakElevation,
      landFraction: 0.6,
    };
    const patch = createTangentPatch(options.cell, options.radiusKm);
    const tileM = options.tileM ?? TILE_M;
    const heightScaleM = options.heightScaleM ?? DEFAULT_SCENE_OPTIONS.heightScaleM;
    const resolutionM = options.resolution ?? DEFAULT_REGION_OPTIONS.resolution;
    const k = options.k ?? 1;
    const bound = regionBound(options.cell, k, options.radiusKm);
    const spawn = spawnPointFor(options.cell, this.field, this.calibration, options.radiusKm);
    if (!spawn) throw new Error(`${options.cell} has no dry ground to spawn on`);

    const field = this.field;
    const calibration = this.calibration;
    const toLocalM = (x: number, y: number) => tileToLocalM(x, y, tileM);
    const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, tileM);
    // One height function for the world, the same one buildRegionScene builds its mesh from.
    const sceneHeight = createSceneHeight(patch, field, calibration, { heightScaleM, resolution: resolutionM });
    const heightAtTile = (x: number, y: number) => {
      const [xm, ym] = toLocalM(x, y);
      return sceneHeight(xm, ym);
    };
    const walkableTile = (x: number, y: number) => {
      const [xm, ym] = toLocalM(x, y);
      return walkableAt(patch, field, calibration.seaLevel, xm, ym, bound);
    };
    this.frame = {
      patch,
      tileM,
      heightScaleM,
      resolutionM,
      heightAtTile,
      walkableTile,
      toScene: (x, y, liftM = 0, out = new THREE.Vector3()) =>
        out.set(x * tileM, Math.max(0, heightAtTile(x, y)) + liftM, y * tileM),
      fromScene: (v) => [v.x / tileM, v.z / tileM],
      toLocalM,
      fromLocalM,
    };
    this.region = { cell: options.cell, k, bound, extentM: bound.radiusM, spawn, spawnTile: fromLocalM(spawn.x, spawn.y) };

    this.ownsRenderer = !options.handle;
    this.handle = options.handle ?? createRendererHandle(host);
    this.acquire();
    this.attributingLayers = options.devLayers === true;
    this.reporting = options.devInfo === true || this.attributingLayers;
    if (this.reporting) this.instrument();

    // Provisional light: one low western key and a cool fill, per the art bible's one rule. The
    // sky layer takes both over by name, "key" and "fill", and drives them with the hour.
    //
    // The host deliberately leaves `background` and `fog` NULL. They are the air, the air belongs
    // to one layer, and a null background is how the terrain layer's fallback recognises that
    // nobody has claimed it yet. A provisional colour here would silence that fallback forever.
    this.scene.add(new THREE.HemisphereLight(0xc98a8f, 0x2a2340, 0.75));
    const key = new THREE.DirectionalLight(0xffb877, 1.4);
    key.name = "key";
    key.position.set(-400, 260, 120);
    this.scene.add(key);

    this.camera.position.set(0, 12, 14);
    this.observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    this.observer?.observe(host);
    window.addEventListener("resize", this.resize);
  }

  /**
   * Take the shared context (or take it back after the globe had it): the canvas moves into this
   * host and is sized to it. The hero calls this when it switches from the globe to the world.
   */
  acquire(): void {
    if (this.disposed) return;
    this.handle.acquire(HOST_OWNER);
    this.handle.attach(this.host);
    this.resize();
  }

  /** Hand the context back to whoever had it before (the globe). Drawing stops until acquire(). */
  release(): void {
    this.handle.release(HOST_OWNER);
  }

  addLayer(layer: WorldLayer): this {
    if (this.byName.has(layer.name)) throw new Error(`layer ${layer.name} already added`);
    this.layers.push(layer);
    this.byName.set(layer.name, layer);
    return this;
  }

  /** The layer context, for layers and for tests. */
  context(): LayerContext {
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.handle.renderer,
      frame: this.frame,
      field: this.field,
      calibration: this.calibration,
      seed: this.options.seed,
      radiusKm: this.options.radiusKm,
      region: this.region,
      layer: <T extends WorldLayer>(name: string) => this.byName.get(name) as T | undefined,
    };
  }

  /**
   * Build every layer in order, then start drawing. Calling it again aborts the build in flight,
   * disposes what that build put in the scene, and starts over; only the newest build ever
   * reports a phase.
   */
  async start(): Promise<void> {
    if (this.disposed) return;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    const generation = ++this.generation;
    if (generation > 1) this.disposeLayers();
    this.setPhase(generation, "building");
    const ctx = this.context();
    try {
      for (const layer of this.layers) {
        if (controller.signal.aborted) break;
        this.attributing = layer.name;
        await layer.build(ctx, controller.signal);
        this.attributing = null;
      }
      if (controller.signal.aborted || generation !== this.generation) {
        // A superseded or disposed build: clean up whatever it managed to add, say nothing.
        if (this.disposed) this.disposeLayers();
        return;
      }
      this.setPhase(generation, "ready");
      this.lastT = 0;
      this.loop();
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) {
        if (this.disposed) this.disposeLayers();
        return;
      }
      this.setPhase(generation, "failed", error);
      throw error;
    }
  }

  private setPhase(generation: number, phase: BuildPhase, error?: unknown) {
    if (generation !== this.generation || this.disposed) return;
    this.phase = phase;
    this.onPhase?.(phase, error);
  }

  /**
   * Provisional follow camera: behind and above the target, eased, looking at chest height. The
   * camera layer (W3-4) replaces it with orbit and collision; until then this is what ThreeWorld
   * did, in metres.
   */
  setFollow(getTarget: (() => { x: number; y: number; liftM?: number }) | null) {
    this.follow = getTarget;
  }

  private loop = () => {
    if (this.disposed || this.phase !== "ready") return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.handle.owner !== HOST_OWNER) return; // someone else is drawing with this context
    const now = performance.now();
    const dt = this.lastT === 0 ? 1 / 60 : Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const ctx = this.context();
    // The layer's name is set around its own code, not only around its build: the meadow adds a
    // patch from inside `update` for the life of the page, and an attribution that stopped at build
    // would leave every blade of grass in an "unattributed" row.
    for (const layer of this.layers) {
      this.attributing = layer.name;
      layer.update?.(dt, ctx);
    }
    this.attributing = null;
    this.stepCamera(dt);
    // After the camera, before the renderer: see WorldLayer.beforeRender for why the scatter's
    // frustum cull cannot live in `update`.
    for (const layer of this.layers) {
      this.attributing = layer.name;
      layer.beforeRender?.(ctx);
    }
    this.attributing = null;
    if (this.reporting) this.beginFrame();
    this.handle.renderer.render(this.scene, this.camera);
    if (this.reporting) this.sampleInfo(now);
  };

  /**
   * The provisional boom. NOT RE-DERIVED UNDER DECISIONS C1, because it ships nowhere: parcelWorld
   * forbids `follow` outright, so on both routes that exist the player layer drives the camera from
   * followCamera.ts and this method never runs. Re-tuning the 9 and the 5.5 against a taller
   * landscape would have been tuning a configuration nobody can reach, which is the failure this
   * phase is being watched for. It stays as the scaffold for a mount that has no player layer.
   */
  private stepCamera(dt: number) {
    if (!this.follow) return;
    const t = this.follow();
    const target = this.frame.toScene(t.x, t.y, 1.2 + (t.liftM ?? 0), this.tmp);
    const back = 9;
    const up = 5.5;
    const desired = new THREE.Vector3(target.x, target.y + up, target.z + back);
    // Never below the ground along the boom: the one collision rule the scaffold keeps. `desired`
    // is in three's metres, so it is converted to tiles before the height function is asked.
    const [cx, cy] = this.frame.fromScene(desired);
    const groundAtCam = Math.max(0, this.frame.heightAtTile(cx, cy));
    desired.y = Math.max(desired.y, groundAtCam + 1.5);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(desired);
    else this.camPos.lerp(desired, Math.min(1, dt * 6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);
  }

  /**
   * Turn the host into an instrument, ONCE, and only where a reading was asked for.
   *
   * Three wrappers, and each is a fact about three rather than a preference:
   *
   *   `autoReset` off, because three resets the counters between the shadow pass and the main pass,
   *   and the shadow map is the half nobody has been reading.
   *
   *   `shadowMap.render` wrapped, because that is where the shadow subtotal can be read: with the
   *   reset off, the counters at the moment that call returns ARE the shadow pass.
   *
   *   `scene.add` wrapped, because `parcelWorld.ts` composes a flat list into one scene and the
   *   object names cannot be trusted to say whose they are. This is the same instrument
   *   `tests/e2e/scatterSplit.spec.ts` installs from the outside, moved inside so the page a person
   *   opens can answer without a harness attached.
   */
  private instrument() {
    if (this.restoreInstrument) return;
    const renderer = this.handle.renderer;
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    const shadowMap = renderer.shadowMap;
    const shadowRender = shadowMap.render.bind(shadowMap);
    shadowMap.render = (lights, scene, camera) => {
      shadowRender(lights, scene, camera);
      this.shadowPass = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    };
    const scene = this.scene as THREE.Object3D;
    const add = scene.add.bind(scene);
    scene.add = ((...objects: THREE.Object3D[]) => {
      if (this.attributing) for (const object of objects) object.userData.echoLayer ??= this.attributing;
      return add(...objects);
    }) as THREE.Object3D["add"];
    this.restoreInstrument = () => {
      renderer.info.autoReset = autoReset;
      shadowMap.render = shadowRender;
      scene.add = add;
      this.restoreInstrument = null;
    };
  }

  /**
   * Bracket one object's draws with three's own hooks, CHAINING whatever is already there.
   *
   * Never replacing. `scatterLayer` zeroes its shadow twin's count in `onBeforeRender` and puts it
   * back in `onAfterRender`, and that pair is the whole reason the twin does not draw in the main
   * pass; an instrument that overwrote it would double the frame it was sent to measure. The shadow
   * pass has its own pair, `onBeforeShadow` / `onAfterShadow`, which is how a twin's cost is told
   * from the mesh a person sees.
   */
  private hook(object: THREE.Object3D) {
    if (object.userData.echoHooked) return;
    // ONLY THINGS THAT DRAW. three calls `scene.onBeforeRender` at the top of `render()` and
    // `scene.onAfterRender` at the bottom, so hooking the root brackets the ENTIRE FRAME as one
    // object — measured, before this line existed: an "unattributed" row of 643,197 triangles
    // against a 434,859 main pass, which is the whole frame plus the shadow map, counted twice.
    // Groups, lights and cameras are the same class of mistake more quietly. A drawable is a mesh,
    // a line, a point cloud or a sprite, and nothing else has a cost to attribute.
    const drawable = object as THREE.Object3D & {
      isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean;
    };
    if (!(drawable.isMesh || drawable.isLine || drawable.isPoints || drawable.isSprite)) return;
    object.userData.echoHooked = true;
    const render = this.handle.renderer.info.render;
    const before = object.onBeforeRender;
    const after = object.onAfterRender;
    const beforeShadow = object.onBeforeShadow;
    const afterShadow = object.onAfterShadow;
    let calls = 0;
    let triangles = 0;
    const bucket = (): LayerCost => {
      let name = "unattributed";
      for (let at: THREE.Object3D | null = object; at; at = at.parent) {
        if (typeof at.userData.echoLayer === "string") {
          name = at.userData.echoLayer;
          break;
        }
      }
      let cost = this.cost.get(name);
      if (!cost) this.cost.set(name, (cost = { calls: 0, triangles: 0, shadowCalls: 0, shadowTriangles: 0 }));
      return cost;
    };
    object.onBeforeRender = (...args: Parameters<THREE.Object3D["onBeforeRender"]>) => {
      before.apply(object, args);
      calls = render.calls;
      triangles = render.triangles;
    };
    object.onAfterRender = (...args: Parameters<THREE.Object3D["onAfterRender"]>) => {
      const cost = bucket();
      cost.calls += render.calls - calls;
      cost.triangles += render.triangles - triangles;
      after.apply(object, args);
    };
    object.onBeforeShadow = (...args: Parameters<THREE.Object3D["onBeforeShadow"]>) => {
      beforeShadow.apply(object, args);
      calls = render.calls;
      triangles = render.triangles;
    };
    object.onAfterShadow = (...args: Parameters<THREE.Object3D["onAfterShadow"]>) => {
      const cost = bucket();
      cost.shadowCalls += render.calls - calls;
      cost.shadowTriangles += render.triangles - triangles;
      afterShadow.apply(object, args);
    };
  }

  /** Zero the counters for the frame about to be drawn, and hook whatever has appeared since. */
  private beginFrame() {
    this.handle.renderer.info.reset();
    this.shadowPass = { calls: 0, triangles: 0 };
    if (!this.attributingLayers) return;
    for (const cost of this.cost.values()) {
      cost.calls = 0;
      cost.triangles = 0;
      cost.shadowCalls = 0;
      cost.shadowTriangles = 0;
    }
    this.scene.traverse((object) => this.hook(object));
  }

  private sampleInfo(now: number) {
    const r = this.handle.renderer.info;
    this.infoSamples++;
    // The worst frame of the window, kept every frame, because the budget of DECISIONS C16 is a
    // bound on the worst view and a mean would hide the heading that breaks it.
    if (r.render.triangles > this.worstFrame.triangles) {
      this.worstFrame = { calls: r.render.calls, triangles: r.render.triangles };
    }
    if (now - this.infoAt < 1000) return;
    const size = this.handle.renderer.getSize(this.bufferSize);
    const layers: Record<string, LayerCost> = {};
    for (const [name, cost] of this.cost) layers[name] = { ...cost };
    this.info = {
      calls: r.render.calls,
      triangles: r.render.triangles,
      mainCalls: r.render.calls - this.shadowPass.calls,
      mainTriangles: r.render.triangles - this.shadowPass.triangles,
      shadowCalls: this.shadowPass.calls,
      shadowTriangles: this.shadowPass.triangles,
      worstCalls: this.worstFrame.calls,
      worstTriangles: this.worstFrame.triangles,
      geometries: r.memory.geometries,
      textures: r.memory.textures,
      fps: this.infoAt === 0 ? 0 : (this.infoSamples * 1000) / (now - this.infoAt),
      pixelRatio: this.handle.renderer.getPixelRatio(),
      width: size.x,
      height: size.y,
      layers,
    };
    this.infoAt = now;
    this.infoSamples = 0;
    this.worstFrame = { calls: 0, triangles: 0 };
  }

  private resize = () => {
    if (this.disposed || this.handle.owner !== HOST_OWNER) return;
    // Measure the element the canvas actually lives in.
    const el = this.handle.host;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.handle.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** Dispose every layer and every geometry and material the scene holds. Lights stay. */
  private disposeLayers() {
    for (const layer of this.layers) layer.dispose?.();
    const doomed: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).skeleton.dispose();
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
      if (m.geometry || mat) doomed.push(o);
    });
    for (const o of doomed) o.removeFromParent();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.observer?.disconnect();
    this.restoreInstrument?.();
    this.disposeLayers();
    this.scene.clear();
    this.handle.release(HOST_OWNER);
    if (this.ownsRenderer) this.handle.dispose();
    this.phase = "idle";
  }
}
