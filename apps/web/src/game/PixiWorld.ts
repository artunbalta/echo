/**
 * PixiJS world renderer (§7). Pixel-perfect top-down view: procedural tilemap, sprite
 * entities z-sorted by y, camera follows the local player, client-side prediction for
 * local movement, interpolation for remote entities, proximity detection for
 * interactions, and implicit telemetry emission (approach/avoid/dwell).
 *
 * PixiJS is a 2D WebGL renderer — a library, not a game engine. All simulation/netcode
 * lives here and in the authoritative server, not in an engine.
 */
import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
  Rectangle,
  TilingSprite,
  Text,
  Graphics,
} from "pixi.js";
import {
  WORLD,
  SPRITE,
  FACING_ROW,
  presenceTier,
  oceanLandAt,
  OCEAN_BEACH_W,
  type EntitySnapshot,
  type Facing,
} from "@echo/shared";
import {
  buildCharacterSheet,
  buildGrassTexture,
  buildTreeTexture,
  buildBushTexture,
  buildPortalTexture,
  buildWaterTexture,
  buildSandTexture,
  buildFlowerTexture,
  styleFromId,
} from "./art";
import { buildPropSheet, isPropUrl, propKindFromUrl } from "./props";
import { PROP_ASSETS } from "./propAssets";

/**
 * Generated atmospheric pixel-art world art (Higgsfield, §3). These replace the
 * procedural placeholders from art.ts; if a load fails we fall back to procedural so
 * the world always renders. The renderer consumes them through the same texture seam.
 */
const ART_URLS = {
  grass: "/assets/world/grass.png",
  tree: "/assets/world/tree.png",
  bush: "/assets/world/bush.png",
  flower: "/assets/world/flower.png",
  // Same Higgsfield-generated portal the venue uses, so both sides show the identical door.
  portal: "/assets/venue/portal.png",
} as const;
import { generateTileMap, isBlocked, isWater, isBeach, type TileMap } from "./tilemap";

const TILE = WORLD.TILE_SIZE;
const SCALE = WORLD.RENDER_SCALE;

interface RenderEntity {
  sprite: Sprite;
  label: Text;
  /** Soft glow ring beneath live players (not NPCs) so real humans stand out on the map. */
  ring?: Graphics;
  /** Cast shadow — its length/direction track the sun arc (diegetic daylight, blueprint V.1). */
  shadow?: Graphics;
  frames: Record<Facing, Texture[]>;
  // interpolation buffer (remote)
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  facing: Facing;
  moving: boolean;
  animTime: number;
  id: string;
  kind: "user" | "npc";
  name: string;
  refId: string;
  loadedSpriteUrl?: string;
  /** Timestamped snapshot buffer for remote entity interpolation (render in the past). */
  buf: { t: number; x: number; y: number; facing: Facing; moving: boolean }[];
}

/** Render remotes this many ms in the past so interpolation always has two snapshots. */
const INTERP_DELAY = 100;

export interface WorldHooks {
  onNearbyChange?: (target: { id: string; name: string; refId: string; kind: "user" | "npc" } | null) => void;
  onMoveIntent?: (dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 }, facing: Facing, seq: number) => void;
  onStop?: (seq: number) => void;
  emitTelemetry?: (type: string, payload: Record<string, unknown>) => void;
  /** Fires when the local player steps in/out of the portal doorway's interaction radius. */
  onPortalChange?: (near: boolean) => void;
  /** The local player's predicted tile position, every frame — feeds the passive
   *  locomotion sampler (P3). The consumer throttles; positions never leave the client. */
  onSelfSample?: (x: number, y: number) => void;
}

export class PixiWorld {
  app = new Application();
  private world = new Container();
  private entityLayer = new Container();
  private map: TileMap;
  private proceduralArt: boolean;
  private artDir: string | null;
  private entities = new Map<string, RenderEntity>();
  private grassTex!: Texture;
  private treeTex!: Texture;
  private bushTex!: Texture;
  private flowerTex!: Texture;
  private waterTex!: Texture;
  private sandTex!: Texture;
  private portalTex!: Texture;

  private selfId = "";
  // local predicted position (tile units)
  private localX = WORLD.MAP_WIDTH / 2;
  private localY = WORLD.MAP_HEIGHT / 2;
  private localFacing: Facing = "down";
  private keys = new Set<string>();
  private seq = 0;
  private lastDirSent = "";
  private hooks: WorldHooks;
  private nearbyId: string | null = null;
  private nearbyKind: "user" | "npc" | null = null;
  private dwellTimer = 0;
  // "Locate" a live player from the roster: pan the camera toward them and pulse their
  // ring for a moment, then ease back to the player. Separate from drag-pan so the two
  // don't fight (drag-pan resets on walk; this eases on its own timer).
  private locateId: string | null = null;
  private locateUntil = 0;
  private locOffX = 0;
  private locOffY = 0;
  private destroyed = false;
  /** When set, the sea is passable (the player has built a raft and can sail between islands). */
  private canSail = false;
  private portalCenter = { x: 0, y: 0 };
  private portalNear = false;
  // Mouse-wheel zoom: a multiplier on top of the base RENDER_SCALE, clamped.
  private zoom = 1;
  private static readonly MIN_ZOOM = 0.32; // zoom out far enough to survey the archipelago
  private static readonly MAX_ZOOM = 2.5;
  // Mouse-drag pan: a screen-space offset added on top of the player-centered camera.
  // Lets the user look around without moving; player movement re-centers it (see stepLocal).
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  // Click-to-move (like the venue): a press that doesn't turn into a drag steers the
  // player toward the clicked tile. `pointerStart`/`pointerMoved` separate a click from a pan.
  private clickTarget: { x: number; y: number } | null = null;
  private pointerStart = { x: 0, y: 0 };
  private pointerMoved = false;
  private static readonly DRAG_THRESHOLD = 6; // px before a press counts as a drag, not a click
  // ── the diegetic survival state (blueprint V.1: in the WORLD, never a HUD bar) ──
  // Daylight = the sky (ambient light + shadow length); vitality = the body (self-sprite
  // posture tint); scarcity = the world (bushes thin out). Set by the day-loop each tick.
  private dayPhase = 0.35; // 0 dawn → 1 nightfall; default mid-morning until the loop drives it
  private vitality = 1; // 0..1; below ~0.5 the self avatar visibly cools/slumps
  private scarcity = 0; // 0..1; drives bush thinning
  private ambient: Graphics | null = null; // screen-space light wash over the world
  private bushSprites: Sprite[] = []; // recorded at build for scarcity thinning

  constructor(hooks: WorldHooks, opts: { map?: TileMap; proceduralArt?: boolean; artDir?: string } = {}) {
    this.hooks = hooks;
    this.map = opts.map ?? generateTileMap();
    // `artDir` (e.g. "/assets/island") loads a committed PNG set (grass/water/sand/tree/bush/
    // flower), each falling back to its vivid procedural builder if missing — so the island
    // shows the generated art but still runs key-free. `proceduralArt` forces pure procedural.
    this.proceduralArt = opts.proceduralArt ?? false;
    this.artDir = opts.artDir ?? null;
    this.localX = this.map.width / 2;
    this.localY = this.map.height / 2;
  }

  private initialized = false;

  async init(canvasParent: HTMLElement) {
    await this.app.init({
      // Island → deep-sea blue beyond the shore; main world → grass.
      background: this.map.water ? "#1f5e95" : "#74c365",
      resizeTo: canvasParent,
      antialias: false,
      roundPixels: true,
    });
    // StrictMode (or fast navigation) can request teardown before async init
    // finishes. If that happened, tear the freshly-built app down now and bail.
    if (this.destroyed) {
      try {
        this.app.destroy(true);
      } catch {
        /* partially-initialized app */
      }
      return;
    }
    this.initialized = true;
    canvasParent.appendChild(this.app.canvas);
    (this.app.canvas as HTMLCanvasElement).classList.add("pixel");

    await this.loadWorldArt();

    this.world.scale.set(SCALE * this.zoom);
    this.app.stage.addChild(this.world);

    this.buildGround();
    this.buildDecorations();
    this.world.addChild(this.entityLayer);
    this.buildPortal();

    // The sky's light, washed over the whole view in screen space (diegetic daylight).
    this.ambient = new Graphics();
    this.app.stage.addChild(this.ambient);

    this.bindInput();
    this.app.ticker.add((t) => this.update(t.deltaMS));
  }

  /**
   * Load the generated atmospheric pixel-art textures. Each falls back to its
   * procedural builder independently, so a missing/failed asset never blanks the world.
   */
  private async loadWorldArt() {
    const proc = {
      grass: () => nearest(Texture.from(buildGrassTexture(TILE))),
      tree: () => nearest(Texture.from(buildTreeTexture(TILE))),
      bush: () => nearest(Texture.from(buildBushTexture(TILE))),
      flower: () => nearest(Texture.from(buildFlowerTexture(TILE))),
      water: () => nearest(Texture.from(buildWaterTexture(TILE))),
      sand: () => nearest(Texture.from(buildSandTexture(TILE))),
      portal: () => nearest(Texture.from(buildPortalTexture(TILE))),
    };

    // Pure-procedural mode: skip all network loads.
    if (this.proceduralArt && !this.artDir) {
      this.grassTex = proc.grass();
      this.treeTex = proc.tree();
      this.bushTex = proc.bush();
      this.flowerTex = proc.flower();
      this.waterTex = proc.water();
      this.sandTex = proc.sand();
      this.portalTex = proc.portal();
      return;
    }

    const load = async (url: string | null): Promise<Texture | null> => {
      if (!url) return null;
      try {
        return nearest(await Assets.load(url));
      } catch {
        return null;
      }
    };
    // The island loads its committed PNG set; the main world loads ART_URLS (no water/sand/PNG portal there).
    const urls = this.artDir
      ? { grass: `${this.artDir}/grass.png`, tree: `${this.artDir}/tree.png`, bush: `${this.artDir}/bush.png`, flower: `${this.artDir}/flower.png`, water: `${this.artDir}/water.png`, sand: `${this.artDir}/sand.png`, portal: null }
      : { grass: ART_URLS.grass, tree: ART_URLS.tree, bush: ART_URLS.bush, flower: ART_URLS.flower, water: null, sand: null, portal: ART_URLS.portal };

    const [grass, tree, bush, flower, water, sand, portal] = await Promise.all([
      load(urls.grass), load(urls.tree), load(urls.bush), load(urls.flower), load(urls.water), load(urls.sand), load(urls.portal),
    ]);
    this.grassTex = grass ?? proc.grass();
    this.treeTex = tree ?? proc.tree();
    this.bushTex = bush ?? proc.bush();
    this.flowerTex = flower ?? proc.flower();
    this.waterTex = water ?? proc.water();
    this.sandTex = sand ?? proc.sand();
    this.portalTex = portal ?? proc.portal();
  }

  setSelf(id: string, x: number, y: number) {
    this.selfId = id;
    this.localX = x;
    this.localY = y;
  }

  // ── tilemap rendering ─────────────────────────────────────────────────────────
  private buildGround() {
    const W = this.map.width;
    const H = this.map.height;
    const px = W * TILE;
    const py = H * TILE;

    if (!this.map.water) {
      this.world.addChild(new TilingSprite({ texture: this.grassTex, width: px, height: py }));
      return;
    }

    // Ocean base, then each island drawn as a CONTIGUOUS landmass: a sand disc (the beach) with a
    // grass disc on top, so the uncovered ring reads as a clean sand coastline and the open sea
    // reads clearly as water — no per-tile mosaic. Cheap: a handful of circles, built once.
    this.world.addChild(new TilingSprite({ texture: this.waterTex, width: px, height: py }));

    const isles = this.map.islands;
    if (this.isSharedOcean() && isles) {
      // sand discs (radius r + beach) behind, grass discs (radius r) on top → a sand ring shoreline
      const sandMask = new Graphics();
      const grassMask = new Graphics();
      for (const i of isles) {
        sandMask.circle(i.x * TILE, i.y * TILE, (i.r + OCEAN_BEACH_W) * TILE);
        grassMask.circle(i.x * TILE, i.y * TILE, i.r * TILE);
      }
      sandMask.fill(0xffffff);
      grassMask.fill(0xffffff);
      const sand = new TilingSprite({ texture: this.sandTex, width: px, height: py });
      sand.mask = sandMask;
      const grass = new TilingSprite({ texture: this.grassTex, width: px, height: py });
      grass.mask = grassMask;
      this.world.addChild(sandMask, sand, grassMask, grass);
      return;
    }

    // Small single-island map (organic coastline): per-tile mask (grass on land, sand at the shore).
    const landMask = new Graphics();
    const beachMask = new Graphics();
    let anyBeach = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isWater(this.map, x, y)) continue;
        landMask.rect(x * TILE, y * TILE, TILE, TILE);
        if (isBeach(this.map, x, y)) {
          beachMask.rect(x * TILE, y * TILE, TILE, TILE);
          anyBeach = true;
        }
      }
    }
    landMask.fill(0xffffff);
    const land = new TilingSprite({ texture: this.grassTex, width: px, height: py });
    land.mask = landMask;
    this.world.addChild(landMask, land);

    if (anyBeach) {
      beachMask.fill(0xffffff);
      const beach = new TilingSprite({ texture: this.sandTex, width: px, height: py });
      beach.mask = beachMask;
      this.world.addChild(beachMask, beach);
    }
  }

  private buildDecorations() {
    // Flowers go on a flat layer under entities; trees/bushes z-sort with entities.
    for (const d of this.map.decorations) {
      if (d.kind === "flower") {
        // Flowers sit flat on the ground, beneath entities (no z-sort needed).
        const s = new Sprite(this.flowerTex);
        s.anchor.set(0.5, 1);
        s.x = d.x * TILE + TILE / 2;
        s.y = d.y * TILE + TILE;
        this.world.addChildAt(s, 1);
      } else {
        const tex = d.kind === "tree" ? this.treeTex : this.bushTex;
        const s = new Sprite(tex);
        s.anchor.set(0.5, 1);
        s.x = d.x * TILE + TILE / 2;
        s.y = d.y * TILE + TILE;
        (s as any).zIndex = s.y;
        this.entityLayer.addChild(s); // share z-sort with entities
        // Bushes are the visible larder: on lean days a fraction thin out (setScarcity).
        if (d.kind === "bush") this.bushSprites.push(s);
      }
    }
    this.entityLayer.sortableChildren = true;
  }

  /** Render the portal doorway and cache its center (tile units) for proximity checks. */
  private buildPortal() {
    const p = this.map.portal;
    if (!p) return; // the island has no venue portal
    const s = new Sprite(this.portalTex);
    s.anchor.set(0.5, 1);
    s.x = (p.x + p.w / 2) * TILE;
    s.y = (p.y + p.h) * TILE;
    (s as any).zIndex = s.y; // z-sorts with entities so the player can stand in front
    this.entityLayer.addChild(s);
    this.portalCenter = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }

  // ── entities ──────────────────────────────────────────────────────────────────
  private ensureEntity(snap: EntitySnapshot): RenderEntity {
    let re = this.entities.get(snap.id);
    if (re) return re;
    // A `proc:<kind>` spriteUrl renders a procedural prop (the dog pet, the day's stations)
    // instead of a humanoid character sheet — same texture seam, different silhouette.
    const propKind = isPropUrl(snap.spriteUrl) ? propKindFromUrl(snap.spriteUrl) : null;
    const sheet = propKind
      ? nearest(Texture.from(buildPropSheet(propKind)))
      : nearest(Texture.from(buildCharacterSheet(styleFromId(snap.refId || snap.id))));
    const frames = sliceFrames(sheet);
    const sprite = new Sprite(frames[snap.facing][0]);
    sprite.anchor.set(0.5, 1);

    const label = new Text({
      text: snap.name,
      style: { fontSize: 6, fill: snap.kind === "npc" ? 0xf4e9d0 : 0xa06cd5, fontFamily: "monospace" },
    });
    label.anchor.set(0.5, 1);
    label.scale.set(0.8);

    re = {
      sprite,
      label,
      frames,
      prevX: snap.x,
      prevY: snap.y,
      targetX: snap.x,
      targetY: snap.y,
      facing: snap.facing,
      moving: snap.moving,
      animTime: 0,
      id: snap.id,
      kind: snap.kind,
      name: snap.name,
      refId: snap.refId,
      buf: [],
    };
    this.entities.set(snap.id, re);
    // Live players get a soft glow ring beneath them so a real human reads differently
    // from the 100 wandering NPCs. It draws under the sprite via its zIndex (py - 0.1,
    // set in drawEntity) — entityLayer.sortableChildren sorts by zIndex, not insert order.
    if (snap.kind === "user") {
      const ring = new Graphics();
      ring.ellipse(0, 0, SPRITE.FRAME_W * 0.5, SPRITE.FRAME_W * 0.28).fill({ color: 0xa06cd5, alpha: 0.5 });
      re.ring = ring;
      this.entityLayer.addChild(ring);
    }
    // Cast shadow under every entity: its length/direction track the sun arc, so the hour
    // is readable off the ground itself (diegetic daylight — blueprint V.1, no clock UI).
    const shadow = new Graphics();
    shadow.ellipse(0, 0, SPRITE.FRAME_W * 0.42, SPRITE.FRAME_W * 0.16).fill({ color: 0x0b0e14, alpha: 1 });
    shadow.alpha = 0.18;
    re.shadow = shadow;
    this.entityLayer.addChild(shadow);
    this.entityLayer.addChild(sprite);
    this.entityLayer.addChild(label);
    // If the entity has a real generated/uploaded sheet, swap it in once loaded.
    this.maybeLoadSheet(re, snap.spriteUrl);
    return re;
  }

  /** Async-load a real sprite sheet (http or data URL) and swap procedural frames out. */
  private maybeLoadSheet(re: RenderEntity, url: string | undefined) {
    if (!url || re.loadedSpriteUrl === url) return;
    // A `proc:<kind>` prop: swap in the committed bible PNG (a single static sprite) when one
    // exists in the registry, else stay procedural (ensureEntity already built the proc/character
    // sheet). The PNG renders for all facings/frames (props don't animate), with procedural fallback.
    if (isPropUrl(url)) {
      const assetUrl = PROP_ASSETS[url.slice("proc:".length)];
      if (!assetUrl) return; // no committed PNG → keep the procedural sheet
      re.loadedSpriteUrl = url;
      const pimg = new Image();
      pimg.onload = () => {
        try {
          re.frames = staticFrames(nearest(Texture.from(pimg)));
          re.sprite.texture = re.frames[re.facing][0];
        } catch {
          /* keep procedural frames on failure */
        }
      };
      pimg.src = assetUrl;
      return;
    }
    re.loadedSpriteUrl = url;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const tex = nearest(Texture.from(img));
        re.frames = sliceFrames(tex);
        re.sprite.texture = re.frames[re.facing][0];
      } catch {
        /* keep procedural frames on failure */
      }
    };
    img.src = url;
  }

  /** Apply an authoritative snapshot: set interpolation targets for remotes. */
  applySnapshot(snaps: Map<string, EntitySnapshot>, ackSeq: number) {
    for (const [id, snap] of snaps) {
      const re = this.ensureEntity(snap);
      if (id === this.selfId) {
        // Local player: reconcile only if prediction drifted far (Phase 2 refines).
        const err = Math.hypot(this.localX - snap.x, this.localY - snap.y);
        if (err > 1.5) {
          this.localX = snap.x;
          this.localY = snap.y;
        }
        continue;
      }
      re.targetX = snap.x;
      re.targetY = snap.y;
      re.facing = snap.facing;
      re.moving = snap.moving;
      // Append to the interpolation buffer (cap history).
      re.buf.push({ t: performance.now(), x: snap.x, y: snap.y, facing: snap.facing, moving: snap.moving });
      if (re.buf.length > 20) re.buf.shift();
    }
    // Remove entities that left.
    for (const id of [...this.entities.keys()]) {
      if (!snaps.has(id)) {
        const re = this.entities.get(id)!;
        re.sprite.destroy();
        re.label.destroy();
        re.ring?.destroy();
        re.shadow?.destroy();
        this.entities.delete(id);
      }
    }
  }

  // ── input ──────────────────────────────────────────────────────────────────────
  private bindInput() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.style.cursor = "grab";
  }

  // ── mouse-drag pan + click-to-move ─────────────────────────────────────────────
  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.pointerMoved = false;
    this.pointerStart = { x: e.clientX, y: e.clientY };
    this.lastPointer = { x: e.clientX, y: e.clientY };
    (this.app.canvas as HTMLCanvasElement).style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    // Below the threshold the press is still a potential click — don't pan yet.
    if (
      !this.pointerMoved &&
      Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) <=
        PixiWorld.DRAG_THRESHOLD
    ) {
      return;
    }
    this.pointerMoved = true;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.panX += dx;
    this.panY += dy;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.updateCamera();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    (this.app.canvas as HTMLCanvasElement).style.cursor = "grab";
    // A press that never became a drag is a click → walk to that tile (cancels any pan).
    if (!this.pointerMoved) {
      const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
      const eff = SCALE * this.zoom;
      const wx = (e.clientX - rect.left - this.world.x) / eff;
      const wy = (e.clientY - rect.top - this.world.y) / eff;
      this.clickTarget = { x: wx / TILE, y: wy / TILE };
    }
  };

  /** Mouse wheel zooms the world in/out around the player, clamped to a sane range. */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.zoom = Math.max(PixiWorld.MIN_ZOOM, Math.min(PixiWorld.MAX_ZOOM, this.zoom * factor));
    this.world.scale.set(SCALE * this.zoom);
    this.updateCamera();
  };

  private onKey = (e: KeyboardEvent) => {
    // Ignore when typing in an input/textarea.
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.type === "keydown") this.keys.add(e.key.toLowerCase());
    else this.keys.delete(e.key.toLowerCase());
  };

  private readInputDir(): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
    let x: -1 | 0 | 1 = 0;
    let y: -1 | 0 | 1 = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x = -1;
    else if (this.keys.has("d") || this.keys.has("arrowright")) x = 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y = -1;
    else if (this.keys.has("s") || this.keys.has("arrowdown")) y = 1;
    return { x, y };
  }

  // ── main loop ────────────────────────────────────────────────────────────────
  private update(dtMs: number) {
    if (this.destroyed) return;
    const dt = dtMs / 1000;
    this.stepLocal(dt);
    this.stepRemotes(dt);
    this.stepLocate(dt);
    this.updateCamera();
    this.detectProximity(dt);
    this.detectPortal();
    this.updateAmbient();
  }

  /** The sky's light over the day: clear at midday, amber toward dusk, a deep blue-dark at
   *  nightfall. One screen-space rect, redrawn cheaply; the world beneath stays readable. */
  private updateAmbient() {
    if (!this.ambient) return;
    const p = this.dayPhase;
    let color = 0x000000;
    let alpha = 0;
    if (p < 0.12) {
      color = 0xffc98a; // dawn warmth, fading as the sun climbs
      alpha = 0.1 * (1 - p / 0.12);
    } else if (p > 0.62 && p <= 0.85) {
      color = 0xff9a3d; // the long amber of late day
      alpha = 0.16 * ((p - 0.62) / 0.23);
    } else if (p > 0.85) {
      color = 0x1a2440; // dusk gives way to a deep blue dark
      alpha = 0.16 + 0.3 * ((p - 0.85) / 0.15);
    }
    this.ambient.clear();
    if (alpha > 0.004) {
      this.ambient.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color, alpha });
    }
  }

  /** Self-avatar tint from vitality: full colour above half, cooling toward a wan
   *  grey-blue as it falls (the body IS the meter — no red bar anywhere). */
  private vitalityTint(): number {
    const v = Math.max(0, Math.min(1, this.vitality));
    if (v >= 0.5) return 0xffffff;
    const t = 1 - v / 0.5; // 0 at half vitality → 1 at collapse
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    return (lerp(0xff, 0x8e) << 16) | (lerp(0xff, 0xa4) << 8) | lerp(0xff, 0xc2);
  }

  // ── the day-loop drives the world's diegetic state (blueprint V.1) ──────────────

  /** 0 dawn → 1 nightfall. Moves the ambient light and every cast shadow. */
  setDayPhase(phase01: number) {
    this.dayPhase = Math.max(0, Math.min(1, phase01));
  }

  /** 0 collapsed → 1 full. Cools the local avatar's body below half. */
  setVitality(v01: number) {
    this.vitality = Math.max(0, Math.min(1, v01));
  }

  /** 0 plenty → 1 famine. Thins the bushes — the larder visibly empties on lean days. */
  setScarcity(level01: number) {
    const s = Math.max(0, Math.min(1, level01));
    if (Math.abs(s - this.scarcity) < 0.01 && this.scarcity !== 0) return;
    this.scarcity = s;
    const n = this.bushSprites.length;
    for (let i = 0; i < n; i++) {
      const bush = this.bushSprites[i];
      // Deterministic thinning: bush i disappears once scarcity passes its threshold, so
      // lean days visibly empty the island and recovery visibly refills it.
      const threshold = ((i * 2654435761) >>> 0) / 4294967296; // hashed, stable per bush
      bush.visible = s < 0.25 || threshold > s * 0.7;
      // Survivors dry toward straw as scarcity deepens.
      const t = Math.min(1, s * 0.8);
      const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
      bush.tint = (lerp(0xff, 0xd8) << 16) | (lerp(0xff, 0xc4) << 8) | lerp(0xff, 0x9a);
    }
  }

  /** Ease the camera toward a located player while a ping is active, then back to self. */
  private stepLocate(dt: number) {
    let desiredX = 0;
    let desiredY = 0;
    if (this.locateId && performance.now() < this.locateUntil) {
      const re = this.entities.get(this.locateId);
      if (re) {
        const tx = (re as { _tx?: number })._tx ?? re.targetX;
        const ty = (re as { _ty?: number })._ty ?? re.targetY;
        const eff = SCALE * this.zoom;
        // Offset that shifts the view from the player to the target (centres them).
        desiredX = -(tx - this.localX) * TILE * eff;
        desiredY = -(ty - this.localY) * TILE * eff;
      } else {
        this.locateId = null;
      }
    }
    const ease = Math.min(1, dt * 4);
    this.locOffX += (desiredX - this.locOffX) * ease;
    this.locOffY += (desiredY - this.locOffY) * ease;
    if (Math.abs(this.locOffX) < 0.5 && Math.abs(this.locOffY) < 0.5 && desiredX === 0 && desiredY === 0) {
      this.locOffX = 0;
      this.locOffY = 0;
    }
  }

  /** Toggle the portal-nearby hook as the player crosses its interaction radius. */
  private detectPortal() {
    if (!this.map.portal) return; // no portal on the island
    const d = Math.hypot(this.localX - this.portalCenter.x, this.localY - this.portalCenter.y);
    const near = d <= WORLD.INTERACTION_RADIUS + 0.8;
    if (near !== this.portalNear) {
      this.portalNear = near;
      this.hooks.onPortalChange?.(near);
    }
  }

  isNearPortal(): boolean {
    return this.portalNear;
  }

  private stepLocal(dt: number) {
    const kb = this.readInputDir();
    // Continuous movement direction: keyboard if pressed, else steer toward the click target.
    let dx: number = kb.x;
    let dy: number = kb.y;
    if (dx || dy) this.clickTarget = null; // any key cancels click-to-move
    if (!dx && !dy && this.clickTarget) {
      const ddx = this.clickTarget.x - this.localX;
      const ddy = this.clickTarget.y - this.localY;
      const d = Math.hypot(ddx, ddy);
      if (d < 0.15) this.clickTarget = null; // arrived
      else {
        dx = ddx / d;
        dy = ddy / d;
      }
    }
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      const nx = this.localX + (dx / len) * WORLD.MOVE_SPEED * dt;
      const ny = this.localY + (dy / len) * WORLD.MOVE_SPEED * dt;
      const beforeX = this.localX;
      const beforeY = this.localY;
      // client-side collision prediction (the sea is passable once sailing is unlocked)
      if (!this.blockedAt(nx, this.localY)) this.localX = nx;
      if (!this.blockedAt(this.localX, ny)) this.localY = ny;
      // Click-to-move into a wall: if we couldn't budge at all, drop the target so we
      // don't shove into the obstacle forever.
      if (this.clickTarget && this.localX === beforeX && this.localY === beforeY) this.clickTarget = null;
      this.localFacing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      // Walking re-centers the camera: ease any drag-pan offset back to zero.
      if (!this.dragging && (this.panX !== 0 || this.panY !== 0)) {
        const ease = Math.min(1, dt * 5);
        this.panX += (0 - this.panX) * ease;
        this.panY += (0 - this.panY) * ease;
        if (Math.abs(this.panX) < 0.5) this.panX = 0;
        if (Math.abs(this.panY) < 0.5) this.panY = 0;
      }
    }
    // Send intent on change (and stop edge). Quantize to an 8-way dir so the server and
    // remote players track our heading even when we steer continuously toward a click.
    const q = moving ? quantizeDir(dx, dy) : { x: 0 as -1 | 0 | 1, y: 0 as -1 | 0 | 1 };
    const sig = `${q.x},${q.y},${this.localFacing}`;
    if (sig !== this.lastDirSent) {
      this.seq++;
      if (moving) this.hooks.onMoveIntent?.(q, this.localFacing, this.seq);
      else this.hooks.onStop?.(this.seq);
      this.lastDirSent = sig;
    }
    // Drive local sprite.
    const self = this.entities.get(this.selfId);
    if (self) {
      this.drawEntity(self, this.localX, this.localY, this.localFacing, moving, dt);
    }
    this.hooks.onSelfSample?.(this.localX, this.localY);
  }

  private stepRemotes(dt: number) {
    const renderT = performance.now() - INTERP_DELAY;
    for (const [id, re] of this.entities) {
      if (id === this.selfId) continue;
      const { x, y, facing, moving } = this.sampleBuffer(re, renderT);
      (re as any)._tx = x;
      (re as any)._ty = y;
      this.drawEntity(re, x, y, facing, moving, dt);
    }
  }

  /** Linear interpolation between the two buffered snapshots straddling renderT
   *  (entity interpolation). Falls back to the newest snapshot when ahead of the buffer. */
  private sampleBuffer(re: RenderEntity, renderT: number): { x: number; y: number; facing: Facing; moving: boolean } {
    const buf = re.buf;
    if (buf.length === 0) return { x: re.targetX, y: re.targetY, facing: re.facing, moving: re.moving };
    if (buf.length === 1 || renderT <= buf[0].t)
      return { x: buf[0].x, y: buf[0].y, facing: buf[0].facing, moving: buf[0].moving };
    const newest = buf[buf.length - 1];
    if (renderT >= newest.t) return { x: newest.x, y: newest.y, facing: newest.facing, moving: newest.moving };
    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i];
      const b = buf[i + 1];
      if (renderT >= a.t && renderT <= b.t) {
        const f = b.t === a.t ? 1 : (renderT - a.t) / (b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          facing: b.facing,
          moving: a.moving || b.moving,
        };
      }
    }
    return { x: newest.x, y: newest.y, facing: newest.facing, moving: newest.moving };
  }

  private drawEntity(re: RenderEntity, tileX: number, tileY: number, facing: Facing, moving: boolean, dt: number) {
    const px = tileX * TILE + TILE / 2;
    const py = tileY * TILE + TILE;
    re.sprite.x = px;
    re.sprite.y = py;
    (re.sprite as any).zIndex = py;
    re.label.x = px;
    re.label.y = py - SPRITE.FRAME_H - 2;
    (re.label as any).zIndex = py + 0.1;

    // ── distance presence: distance hides IDENTITY, not VISIBILITY. Every player/NPC renders as a
    //    full, SHARP, fully-visible avatar at ANY distance — so you can see who's out there across
    //    the water clearly, never as a dim ghost. Only the NAME is distance-gated: it appears within
    //    near range (Tier 1 / interaction range) and is hidden farther out — far = a clear person
    //    with no name, near = their name resolves in. This is purely a render rule; social cues +
    //    posterior movement are gated SEPARATELY in detectProximity (and authoritatively on the
    //    server) at exactly Tier 1, so seeing a sharp distant player changes nothing about
    //    measurement — they stay non-interactable until you sail close.
    //    YOUR OWN island's Flow-0 affordances ("f0_*", client-local) belong to you, so they always
    //    render sharp + named (distance 0 → Tier 1). ──
    // Your OWN island's affordances (f0_*) and day stations (day_*) belong to you — always named.
    const dist = re.id.startsWith("f0_") || re.id.startsWith("day_") || re.id.startsWith("probe_") ? 0 : Math.hypot(this.localX - tileX, this.localY - tileY);
    const named = presenceTier(dist) === "close"; // identity only at near/interaction range
    re.sprite.visible = true;
    re.sprite.alpha = 1; // sharp at every distance — no silhouette, no alpha-dim
    // Vitality is the BODY, not a bar (blueprint V.1): as the local player's vitality
    // decays below half, their avatar visibly cools toward a wan grey-blue. Everyone
    // else stays untinted (presence rule: sharp, no silhouette).
    re.sprite.tint = re.id === this.selfId ? this.vitalityTint() : 0xffffff;
    re.label.visible = named;
    re.label.alpha = 1;

    // The cast shadow: length + direction follow the sun (morning: long toward the west;
    // noon: a tight pool; dusk: long toward the east, fading as the light goes).
    if (re.shadow) {
      const p = this.dayPhase;
      const stretch = 0.35 + Math.abs(p - 0.5) * 2 * 1.5; // 0.35 at noon → ~1.85 at the edges
      const dir = p < 0.5 ? -1 : 1;
      re.shadow.x = px + dir * stretch * SPRITE.FRAME_W * 0.3;
      re.shadow.y = py - 1;
      re.shadow.scale.set(stretch, 1);
      re.shadow.alpha = p > 0.9 ? 0.18 * (1 - (p - 0.9) / 0.1) : 0.18; // shadows dissolve at nightfall
      (re.shadow as any).zIndex = py - 0.2; // beneath the ring and the sprite
    }

    if (re.ring) {
      re.ring.visible = true; // the echo-violet glint marks every live human on the map, near or far
      re.ring.x = px;
      re.ring.y = py - 1;
      (re.ring as any).zIndex = py - 0.1; // just under the sprite's feet
      // Gentle idle shimmer; a stronger pulse while this player is being "located".
      const pulsing = this.locateId === re.id && performance.now() < this.locateUntil;
      const t = performance.now() / 1000;
      const base = pulsing ? 0.85 : 0.45;
      const amp = pulsing ? 0.3 : 0.12;
      re.ring.alpha = base + Math.sin(t * (pulsing ? 6 : 2)) * amp;
      re.ring.scale.set(pulsing ? 1.25 + Math.sin(t * 6) * 0.15 : 1);
    }

    const frameArr = re.frames[facing];
    if (moving) {
      re.animTime += dt;
      const idx = 1 + (Math.floor(re.animTime * SPRITE.WALK_FPS) % (SPRITE.FRAME_COUNT - 1));
      re.sprite.texture = frameArr[idx];
    } else {
      re.animTime = 0;
      re.sprite.texture = frameArr[0];
    }
  }

  private updateCamera() {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    const eff = SCALE * this.zoom;
    const px = (this.localX * TILE + TILE / 2) * eff;
    const py = (this.localY * TILE + TILE) * eff;
    this.world.x = Math.round(vw / 2 - px + this.panX + this.locOffX);
    this.world.y = Math.round(vh / 2 - py + this.panY + this.locOffY);
  }

  /** Nearest interactable entity (NPC *or* live player) within radius → proximity hook +
   *  approach/dwell telemetry. Live players are interactable too, so two humans can talk. */
  private detectProximity(dt: number) {
    let best: RenderEntity | null = null;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, re] of this.entities) {
      if (id === this.selfId) continue; // never "near" yourself
      const tx = (re as any)._tx ?? re.targetX;
      const ty = (re as any)._ty ?? re.targetY;
      const d = Math.hypot(this.localX - tx, this.localY - ty);
      if (d < bestDist) {
        bestDist = d;
        best = re;
        bestId = id;
      }
    }
    const within = best && bestDist <= WORLD.INTERACTION_RADIUS + 0.5 ? bestId : null;
    if (within !== this.nearbyId) {
      if (within && best) {
        this.hooks.emitTelemetry?.("approach", { targetId: best.refId, dist: Number(bestDist.toFixed(2)) });
        this.hooks.onNearbyChange?.({ id: within, name: best.name, refId: best.refId, kind: best.kind });
        this.nearbyKind = best.kind;
      } else {
        this.hooks.onNearbyChange?.(null);
        this.nearbyKind = null;
      }
      this.nearbyId = within;
      this.dwellTimer = 0;
    } else if (within) {
      this.dwellTimer += dt;
      if (this.dwellTimer > 3) {
        this.hooks.emitTelemetry?.("dwell", { targetId: best!.refId, seconds: 3 });
        this.dwellTimer = 0;
      }
    }
  }

  getNearbyId(): string | null {
    return this.nearbyId;
  }

  /** Whether the currently-nearby entity is a live player or an NPC (null if none). */
  getNearbyKind(): "user" | "npc" | null {
    return this.nearbyKind;
  }

  /** Locate a live player from the roster: pan toward them, pulse their ring, AND start
   *  walking your avatar toward them so the action actually helps you reach them. Their
   *  position moves as they wander; this gets you close, then proximity + the Talk prompt
   *  take over. Any movement key cancels the walk (stepLocal). */
  pingEntity(id: string) {
    const re = this.entities.get(id);
    if (!re) return;
    this.locateId = id;
    this.locateUntil = performance.now() + 3000;
    const tx = (re as { _tx?: number })._tx ?? re.targetX;
    const ty = (re as { _ty?: number })._ty ?? re.targetY;
    this.clickTarget = { x: tx, y: ty };
  }

  // ── handover support: let the echo see and walk the world on its own ───────────
  /** The local player's current tile position. */
  getSelfTile(): { x: number; y: number } {
    return { x: this.localX, y: this.localY };
  }

  /** Snapshot of all NPCs (interpolated positions, tile units) the echo could approach. */
  listNpcs(): { id: string; refId: string; name: string; x: number; y: number }[] {
    const out: { id: string; refId: string; name: string; x: number; y: number }[] = [];
    for (const [id, re] of this.entities) {
      if (re.kind !== "npc") continue;
      if (id.startsWith("f0_") || id.startsWith("day_") || id.startsWith("probe_")) continue; // client-local own-island affordances/stations/probes aren't room NPCs the echo can approach
      const x = (re as { _tx?: number })._tx ?? re.targetX;
      const y = (re as { _ty?: number })._ty ?? re.targetY;
      out.push({ id, refId: re.refId, name: re.name, x, y });
    }
    return out;
  }

  /** Steer the local avatar toward a tile on the echo's behalf (reuses click-to-move).
   *  Passing null halts the autonomous walk. Any human key press cancels it (stepLocal). */
  setAutoWalk(target: { x: number; y: number } | null) {
    this.clickTarget = target;
  }

  /** True when this is THE shared ocean (generateOcean: the 100 disc-islands at the shared slot
   *  geometry) — its only barrier is open water, so collision is purely geometric (oceanLandAt). The
   *  other maps (main world, the wobbly archipelago, the single island) carry tree/rock collision in
   *  the array and use the tile-based test below. Keyed off the explicit map flag so it can never
   *  misfire on another watered map (e.g. generateArchipelago, which also has >4 islands). */
  private isSharedOcean(): boolean {
    return !!this.map.sharedOcean;
  }

  /** Collision-with-sailing: trees/rocks always block; the sea blocks only until you can sail.
   *  On the shared ocean we test the SAME continuous geometry the server enforces (oceanLandAt with
   *  the beach pad) rather than the tile-rounded collision array — so the client prediction and the
   *  authoritative server agree exactly at the shoreline. That exact agreement is what removes the
   *  boundary rebound: walking into the sea stops cleanly at the last land (the sand's outer edge),
   *  with no reconcile snap-back. Sailing makes the whole sea passable. */
  private blockedAt(x: number, y: number): boolean {
    if (this.isSharedOcean()) {
      if (this.canSail) return false; // sailing: sea + land all passable
      return !oceanLandAt(x, y, OCEAN_BEACH_W); // on foot: only the open sea (beyond grass+beach) blocks
    }
    if (!isBlocked(this.map, x, y)) return false;
    return !(this.canSail && isWater(this.map, x, y));
  }

  /** Unlock sailing — the sea becomes traversable so the player can reach the other islands. */
  setSailing(on: boolean) {
    this.canSail = on;
  }

  /** Move a non-local entity toward a tile (the wandering pet). Interpolates + animates. */
  moveEntity(id: string, x: number, y: number, facing?: Facing) {
    const re = this.entities.get(id);
    if (!re || id === this.selfId) return;
    re.targetX = x;
    re.targetY = y;
    re.moving = true;
    if (facing) re.facing = facing;
    re.buf.push({ t: performance.now(), x, y, facing: re.facing, moving: true });
    if (re.buf.length > 20) re.buf.shift();
  }

  /** Re-skin a live entity to a new procedural prop (e.g. grain sprout → ripe as it grows). */
  setEntitySprite(id: string, spriteUrl: string) {
    const re = this.entities.get(id);
    const kind = isPropUrl(spriteUrl) ? propKindFromUrl(spriteUrl) : null;
    if (!re || !kind) return;
    re.frames = sliceFrames(nearest(Texture.from(buildPropSheet(kind))));
    re.sprite.texture = re.frames[re.facing][0];
  }

  /** Update an entity's display name label in place (e.g. a station's prompt-y caption). */
  setEntityName(id: string, name: string) {
    const re = this.entities.get(id);
    if (!re) return;
    re.name = name;
    re.label.text = name;
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    if (this.initialized) {
      this.app.canvas.removeEventListener("wheel", this.onWheel);
      this.app.canvas.removeEventListener("pointerdown", this.onPointerDown);
    }
    // Only destroy a fully-initialized app; otherwise init() handles teardown once
    // it finishes. Guarded because Pixi's resize plugin can throw on a partial app.
    if (this.initialized) {
      try {
        this.app.destroy(true);
      } catch {
        /* ignore teardown races */
      }
    }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function nearest(tex: Texture): Texture {
  tex.source.scaleMode = "nearest";
  return tex;
}

/** Snap a continuous direction to the nearest 8-way cardinal/diagonal (for server intent).
 *  An axis only counts when it's a meaningful share of the motion (~within 22.5°). */
function quantizeDir(dx: number, dy: number): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const x = (ax > ay * 0.4 ? Math.sign(dx) : 0) as -1 | 0 | 1;
  const y = (ay > ax * 0.4 ? Math.sign(dy) : 0) as -1 | 0 | 1;
  return { x, y };
}

/** Slice a sprite-sheet texture into per-facing frame arrays. */
/** A static prop PNG used for every facing/frame (props don't animate or face). */
function staticFrames(tex: Texture): Record<Facing, Texture[]> {
  const arr = Array.from({ length: SPRITE.FRAME_COUNT }, () => tex);
  return { down: arr, up: arr, left: arr, right: arr };
}

function sliceFrames(sheet: Texture): Record<Facing, Texture[]> {
  const out = {} as Record<Facing, Texture[]>;
  (["down", "up", "left", "right"] as Facing[]).forEach((facing) => {
    const row = FACING_ROW[facing];
    const arr: Texture[] = [];
    for (let f = 0; f < SPRITE.FRAME_COUNT; f++) {
      const frame = new Rectangle(f * SPRITE.FRAME_W, row * SPRITE.FRAME_H, SPRITE.FRAME_W, SPRITE.FRAME_H);
      const t = new Texture({ source: sheet.source, frame });
      t.source.scaleMode = "nearest";
      arr.push(t);
    }
    out[facing] = arr;
  });
  return out;
}
