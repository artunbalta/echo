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
  createTangentPatch,
  createTerrain,
  regionBound,
  sceneHeightAt,
  spawnPointFor,
  walkableAt,
  DEFAULT_SCENE_OPTIONS,
  type Calibration,
  type RegionBound,
  type SpawnPoint,
  type TangentPatch,
  type TerrainField,
} from "@echo/planet";
import { TILE_M } from "@echo/shared";

import { localMToTile, tileToLocalM } from "./controller";

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

export function createRendererHandle(host: HTMLElement): RendererHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  /** Metres above sea level at a tile position; negative under water. The I1 function. */
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
  /** A renderer to share. Absent: the host makes and owns one. */
  handle?: RendererHandle;
  heightScaleM?: number;
  tileM?: number;
  /** Sample renderer.info every second into `info`. Costs nothing when off. */
  devInfo?: boolean;
}

export interface RenderInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Frames per second over the last sampling window. */
  fps: number;
}

export type BuildPhase = "idle" | "building" | "ready" | "aborted" | "failed";

const HOST_OWNER = "planet-world";

export class PlanetWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
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
    const k = options.k ?? 1;
    const bound = regionBound(options.cell, k, options.radiusKm);
    const spawn = spawnPointFor(options.cell, this.field, this.calibration, options.radiusKm);
    if (!spawn) throw new Error(`${options.cell} has no dry ground to spawn on`);

    const field = this.field;
    const calibration = this.calibration;
    const toLocalM = (x: number, y: number) => tileToLocalM(x, y, tileM);
    const fromLocalM = (xm: number, ym: number) => localMToTile(xm, ym, tileM);
    const heightAtTile = (x: number, y: number) => {
      const [xm, ym] = toLocalM(x, y);
      return sceneHeightAt(patch, field, calibration, xm, ym) * heightScaleM;
    };
    const walkableTile = (x: number, y: number) => {
      const [xm, ym] = toLocalM(x, y);
      return walkableAt(patch, field, calibration.seaLevel, xm, ym, bound);
    };
    this.frame = {
      patch,
      tileM,
      heightScaleM,
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

    // Provisional light: one low western key and a cool fill, per the art bible's one rule. The
    // day-cycle layer takes these over; until it exists the world is lit at a fixed dusk.
    this.scene.background = new THREE.Color(0x8a6a9e);
    this.scene.fog = new THREE.Fog(0x8a6a9e, 300, 2200);
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
        await layer.build(ctx, controller.signal);
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
    for (const layer of this.layers) layer.update?.(dt, ctx);
    this.stepCamera(dt);
    this.handle.renderer.render(this.scene, this.camera);
    if (this.options.devInfo) this.sampleInfo(now);
  };

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

  private sampleInfo(now: number) {
    this.infoSamples++;
    if (now - this.infoAt < 1000) return;
    const r = this.handle.renderer.info;
    this.info = {
      calls: r.render.calls,
      triangles: r.render.triangles,
      geometries: r.memory.geometries,
      textures: r.memory.textures,
      fps: this.infoAt === 0 ? 0 : (this.infoSamples * 1000) / (now - this.infoAt),
    };
    this.infoAt = now;
    this.infoSamples = 0;
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
    this.disposeLayers();
    this.scene.clear();
    this.handle.release(HOST_OWNER);
    if (this.ownsRenderer) this.handle.dispose();
    this.phase = "idle";
  }
}
