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
} from "pixi.js";
import {
  WORLD,
  SPRITE,
  FACING_ROW,
  type EntitySnapshot,
  type Facing,
} from "@echo/shared";
import {
  buildCharacterSheet,
  buildGrassTexture,
  buildTreeTexture,
  buildBushTexture,
  buildPortalTexture,
  styleFromId,
} from "./art";

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
import { generateTileMap, isBlocked, type TileMap } from "./tilemap";

const TILE = WORLD.TILE_SIZE;
const SCALE = WORLD.RENDER_SCALE;

interface RenderEntity {
  sprite: Sprite;
  label: Text;
  frames: Record<Facing, Texture[]>;
  // interpolation buffer (remote)
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  facing: Facing;
  moving: boolean;
  animTime: number;
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
  onNearbyChange?: (target: { id: string; name: string; refId: string } | null) => void;
  onMoveIntent?: (dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 }, facing: Facing, seq: number) => void;
  onStop?: (seq: number) => void;
  emitTelemetry?: (type: string, payload: Record<string, unknown>) => void;
  /** Fires when the local player steps in/out of the portal doorway's interaction radius. */
  onPortalChange?: (near: boolean) => void;
}

export class PixiWorld {
  app = new Application();
  private world = new Container();
  private entityLayer = new Container();
  private map: TileMap;
  private entities = new Map<string, RenderEntity>();
  private grassTex!: Texture;
  private treeTex!: Texture;
  private bushTex!: Texture;
  private flowerTex!: Texture;
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
  private dwellTimer = 0;
  private destroyed = false;
  private portalCenter = { x: 0, y: 0 };
  private portalNear = false;
  // Mouse-wheel zoom: a multiplier on top of the base RENDER_SCALE, clamped.
  private zoom = 1;
  private static readonly MIN_ZOOM = 0.5;
  private static readonly MAX_ZOOM = 2.5;
  // Mouse-drag pan: a screen-space offset added on top of the player-centered camera.
  // Lets the user look around without moving; player movement re-centers it (see stepLocal).
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor(hooks: WorldHooks) {
    this.hooks = hooks;
    this.map = generateTileMap();
  }

  private initialized = false;

  async init(canvasParent: HTMLElement) {
    await this.app.init({
      background: "#74c365",
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

    this.bindInput();
    this.app.ticker.add((t) => this.update(t.deltaMS));
  }

  /**
   * Load the generated atmospheric pixel-art textures. Each falls back to its
   * procedural builder independently, so a missing/failed asset never blanks the world.
   */
  private async loadWorldArt() {
    const load = async (url: string): Promise<Texture | null> => {
      try {
        return nearest(await Assets.load(url));
      } catch {
        return null;
      }
    };
    const [grass, tree, bush, flower, portal] = await Promise.all([
      load(ART_URLS.grass),
      load(ART_URLS.tree),
      load(ART_URLS.bush),
      load(ART_URLS.flower),
      load(ART_URLS.portal),
    ]);
    this.grassTex = grass ?? nearest(Texture.from(buildGrassTexture(TILE)));
    this.treeTex = tree ?? nearest(Texture.from(buildTreeTexture(TILE)));
    this.bushTex = bush ?? nearest(Texture.from(buildBushTexture(TILE)));
    this.flowerTex = flower ?? this.bushTex;
    this.portalTex = portal ?? nearest(Texture.from(buildPortalTexture(TILE)));
  }

  setSelf(id: string, x: number, y: number) {
    this.selfId = id;
    this.localX = x;
    this.localY = y;
  }

  // ── tilemap rendering ─────────────────────────────────────────────────────────
  private buildGround() {
    const ground = new TilingSprite({
      texture: this.grassTex,
      width: WORLD.MAP_WIDTH * TILE,
      height: WORLD.MAP_HEIGHT * TILE,
    });
    this.world.addChild(ground);
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
      }
    }
    this.entityLayer.sortableChildren = true;
  }

  /** Render the portal doorway and cache its center (tile units) for proximity checks. */
  private buildPortal() {
    const p = this.map.portal;
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
    const style = styleFromId(snap.refId || snap.id);
    const sheet = nearest(Texture.from(buildCharacterSheet(style)));
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
      kind: snap.kind,
      name: snap.name,
      refId: snap.refId,
      buf: [],
    };
    this.entities.set(snap.id, re);
    this.entityLayer.addChild(sprite);
    this.entityLayer.addChild(label);
    // If the entity has a real generated/uploaded sheet, swap it in once loaded.
    this.maybeLoadSheet(re, snap.spriteUrl);
    return re;
  }

  /** Async-load a real sprite sheet (http or data URL) and swap procedural frames out. */
  private maybeLoadSheet(re: RenderEntity, url: string | undefined) {
    if (!url || re.loadedSpriteUrl === url) return;
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

  // ── mouse-drag pan ───────────────────────────────────────────────────────────
  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    (this.app.canvas as HTMLCanvasElement).style.cursor = "grabbing";
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.panX += dx;
    this.panY += dy;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.updateCamera();
  };

  private onPointerUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    (this.app.canvas as HTMLCanvasElement).style.cursor = "grab";
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
    this.updateCamera();
    this.detectProximity(dt);
    this.detectPortal();
  }

  /** Toggle the portal-nearby hook as the player crosses its interaction radius. */
  private detectPortal() {
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
    const dir = this.readInputDir();
    const moving = dir.x !== 0 || dir.y !== 0;
    if (moving) {
      const len = Math.hypot(dir.x, dir.y) || 1;
      const nx = this.localX + (dir.x / len) * WORLD.MOVE_SPEED * dt;
      const ny = this.localY + (dir.y / len) * WORLD.MOVE_SPEED * dt;
      // client-side collision prediction
      if (!isBlocked(this.map, nx, this.localY)) this.localX = nx;
      if (!isBlocked(this.map, this.localX, ny)) this.localY = ny;
      this.localFacing = Math.abs(dir.x) > Math.abs(dir.y) ? (dir.x > 0 ? "right" : "left") : dir.y > 0 ? "down" : "up";
      // Walking re-centers the camera: ease any drag-pan offset back to zero.
      if (!this.dragging && (this.panX !== 0 || this.panY !== 0)) {
        const ease = Math.min(1, dt * 5);
        this.panX += (0 - this.panX) * ease;
        this.panY += (0 - this.panY) * ease;
        if (Math.abs(this.panX) < 0.5) this.panX = 0;
        if (Math.abs(this.panY) < 0.5) this.panY = 0;
      }
    }
    // Send intent on change (and stop edge).
    const sig = `${dir.x},${dir.y},${this.localFacing}`;
    if (sig !== this.lastDirSent) {
      this.seq++;
      if (moving) this.hooks.onMoveIntent?.(dir, this.localFacing, this.seq);
      else this.hooks.onStop?.(this.seq);
      this.lastDirSent = sig;
    }
    // Drive local sprite.
    const self = this.entities.get(this.selfId);
    if (self) {
      this.drawEntity(self, this.localX, this.localY, this.localFacing, moving, dt);
    }
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
    this.world.x = Math.round(vw / 2 - px + this.panX);
    this.world.y = Math.round(vh / 2 - py + this.panY);
  }

  /** Nearest interactable NPC within radius → proximity hook + approach/dwell telemetry. */
  private detectProximity(dt: number) {
    let best: RenderEntity | null = null;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, re] of this.entities) {
      if (re.kind !== "npc") continue;
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
        this.hooks.onNearbyChange?.({ id: within, name: best.name, refId: best.refId });
      } else {
        this.hooks.onNearbyChange?.(null);
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

/** Slice a sprite-sheet texture into per-facing frame arrays. */
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
