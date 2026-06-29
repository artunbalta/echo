/**
 * Stage 4 — the town (PixiJS scene). The richest cue ecology: a market stall with a SERVER
 * who cannot reciprocate (courtesy is a top individuating cue), a living QUEUE of townsfolk you
 * can wait in or cut, and a flower stall to linger at. The scene only renders + reports
 * proximity; the React layer (TownClient) turns the player's acts into BehavioralEvent
 * envelopes and forwards them to the engine. Nothing here is a score — it is a place to be.
 *
 * Adapted from the venue scene (movement, collision, camera, sprite, queue lifecycle).
 */
import { Application, Container, Rectangle, Sprite, Text, Texture, TilingSprite } from "pixi.js";
import { SPRITE, FACING_ROW, type Facing } from "@echo/shared";
import { buildCharacterSheet, styleFromId, type CharStyle } from "@/game/art";
import { loadVenueArt } from "@/game/venue/venueArt";

const TILE = 16;
const SCALE = 2;
const MAPW = 40;
const MAPH = 26;
const SPEED = 4.2;

const BOOTH = { x: 24, y: 7, w: 7, h: 5 }; // market stall body (solid)
const SERVER_POINT = { x: 27, y: 12 }; // the clerk, behind the counter
const COUNTER = { x: 27, y: 14 }; // where you step up to be served
const STALL = { x: 7, y: 9, w: 5, h: 4 }; // flower stall (solid) to linger at
const STALL_POINT = { x: 9, y: 14 };
const PORTAL = { x: 2, y: 11, w: 3, h: 4 };
const PLAYER_SPAWN = { x: 20, y: 20 };
const EXIT = { x: 34, y: 25 };
const COUNTER_RADIUS = 2.2;

const QUEUE_X = 27;
const QUEUE_HEAD_Y = 15.2; // first waiting slot, just south of the counter
const QUEUE_GAP = 1.15;
const queueSlot = (i: number) => ({ x: QUEUE_X, y: QUEUE_HEAD_Y + i * QUEUE_GAP });

type WState = "toSlot" | "leaving" | "done";

interface Towns {
  id: string;
  sprite: Sprite;
  frames: Record<Facing, Texture[]>;
  x: number;
  y: number;
  facing: Facing;
  anim: number;
  state: WState;
  tx: number;
  ty: number;
}

export interface TownProximity {
  nearCounter: boolean;
  npcsWaiting: number;
  nearTail: boolean;
  nearStall: boolean;
  nearPortal: boolean;
}

export interface TownHooks {
  onReady?: () => void;
  onProximity?: (p: TownProximity) => void;
  /** First time the player reaches the counter on a given approach (cue A1). */
  onApproachServer?: (distance: number) => void;
  /** Player lingered at the flower stall ≥ 3s (cue J2/A4). */
  onStallDwell?: (seconds: number) => void;
}

export class TownScene {
  app = new Application();
  private world = new Container();
  private entityLayer = new Container();
  private tex!: Awaited<ReturnType<typeof loadVenueArt>>;
  private collision = new Uint8Array(MAPW * MAPH);

  private player!: Sprite;
  private playerFrames!: Record<Facing, Texture[]>;
  private px = PLAYER_SPAWN.x;
  private py = PLAYER_SPAWN.y;
  private pfacing: Facing = "up";
  private panim = 0;
  private keys = new Set<string>();
  private clickTarget: { x: number; y: number } | null = null;
  private zoom = 1;
  private static readonly MIN_ZOOM = 0.7;
  private static readonly MAX_ZOOM = 2.5;

  private waiting: Towns[] = [];
  private leaving: Towns[] = [];
  private recycleAccum = 0;
  private spawnSeq = 0;

  private prox: TownProximity = { nearCounter: false, npcsWaiting: 0, nearTail: false, nearStall: false, nearPortal: false };
  private wasNearCounter = false;
  private stallDwell = 0;
  private stallFired = false;
  private destroyed = false;
  private initialized = false;
  private hooks: TownHooks;

  constructor(hooks: TownHooks = {}) {
    this.hooks = hooks;
    const block = (b: { x: number; y: number; w: number; h: number }) => {
      for (let y = b.y; y < b.y + b.h; y++)
        for (let x = b.x; x < b.x + b.w; x++)
          if (x >= 0 && y >= 0 && x < MAPW && y < MAPH) this.collision[y * MAPW + x] = 1;
    };
    block(BOOTH);
    block(STALL);
  }

  private isBlocked(tx: number, ty: number): boolean {
    const x = Math.round(tx);
    const y = Math.round(ty);
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return true;
    return this.collision[y * MAPW + x] === 1;
  }

  async init(parent: HTMLElement) {
    await this.app.init({ background: "#241f38", resizeTo: parent, antialias: false, roundPixels: true });
    if (this.destroyed) {
      try { this.app.destroy(true); } catch { /* partial */ }
      return;
    }
    this.initialized = true;
    parent.appendChild(this.app.canvas);
    (this.app.canvas as HTMLCanvasElement).classList.add("pixel");

    this.tex = await loadVenueArt();
    this.world.scale.set(SCALE);
    this.app.stage.addChild(this.world);

    const ground = new TilingSprite({ texture: this.tex.plaza, width: MAPW * TILE, height: MAPH * TILE });
    this.world.addChild(ground);

    this.addProp(this.tex.portal, PORTAL.x, PORTAL.y, true);
    this.world.addChild(this.entityLayer);
    this.entityLayer.sortableChildren = true;
    this.addProp(this.tex.booth, BOOTH.x, BOOTH.y, false);
    this.addProp(this.tex.booth, STALL.x, STALL.y, false);

    this.addLabel("market", SERVER_POINT.x, BOOTH.y, 0xffd98a);
    this.addLabel("flowers", STALL.x + STALL.w / 2, STALL.y, 0xd6a8e0);
    this.addServer();

    // a living line of townsfolk already waiting at the market
    for (let i = 0; i < 4; i++) this.addTowns(queueSlot(i));

    this.playerFrames = sliceFrames(nearest(Texture.from(buildCharacterSheet(styleFromId("you")))));
    this.player = new Sprite(this.playerFrames.up[0]);
    this.player.anchor.set(0.5, 1);
    this.entityLayer.addChild(this.player);

    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.app.canvas.addEventListener("pointerdown", this.onPointer);
    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.app.ticker.add((t) => this.update(t.deltaMS));
    this.hooks.onReady?.();
  }

  private addProp(tex: Texture, tx: number, ty: number, flat: boolean) {
    const s = new Sprite(tex);
    s.x = tx * TILE;
    s.y = ty * TILE;
    if (flat) this.world.addChildAt(s, 1);
    else {
      (s as any).zIndex = (ty + tex.height / TILE) * TILE;
      this.entityLayer.addChild(s);
    }
  }

  private addLabel(text: string, tx: number, ty: number, fill: number) {
    const tag = new Text({ text, style: { fontSize: 6, fill, fontFamily: "monospace" } });
    tag.anchor.set(0.5, 1);
    tag.scale.set(0.85);
    tag.x = tx * TILE + TILE / 2;
    tag.y = ty * TILE - 2;
    (tag as any).zIndex = 1e6;
    this.entityLayer.addChild(tag);
  }

  private addServer() {
    const style: CharStyle = { skin: "#e0a87e", hair: "#2a1f1a", shirt: "#3f6db9", pants: "#2a3640", hairStyle: "short" };
    const frames = sliceFrames(nearest(Texture.from(buildCharacterSheet(style))));
    const s = new Sprite(frames.down[0]);
    s.anchor.set(0.5, 1);
    s.x = SERVER_POINT.x * TILE + TILE / 2;
    s.y = SERVER_POINT.y * TILE + TILE;
    (s as any).zIndex = s.y;
    this.entityLayer.addChild(s);
  }

  private addTowns(at: { x: number; y: number }) {
    const id = `t${this.spawnSeq++}`;
    const frames = sliceFrames(nearest(Texture.from(buildCharacterSheet(styleFromId(id)))));
    const sprite = new Sprite(frames.up[0]);
    sprite.anchor.set(0.5, 1);
    this.entityLayer.addChild(sprite);
    const v: Towns = { id, sprite, frames, x: at.x, y: MAPH - 1.2, facing: "up", anim: 0, state: "toSlot", tx: at.x, ty: at.y };
    this.waiting.push(v);
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.type === "keydown") this.keys.add(e.key.toLowerCase());
    else this.keys.delete(e.key.toLowerCase());
  };
  private onPointer = (e: PointerEvent) => {
    const rect = this.app.canvas.getBoundingClientRect();
    const eff = SCALE * this.zoom;
    const wx = (e.clientX - rect.left - this.world.x) / eff;
    const wy = (e.clientY - rect.top - this.world.y) / eff;
    this.clickTarget = { x: wx / TILE, y: wy / TILE };
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.zoom = clamp(this.zoom * factor, TownScene.MIN_ZOOM, TownScene.MAX_ZOOM);
    this.world.scale.set(SCALE * this.zoom);
    this.camera();
  };

  /** Snapshot the current proximity (React reads this on keypress to decide join vs cut). */
  getProximity(): TownProximity {
    return { ...this.prox };
  }

  private update(dtMs: number) {
    if (this.destroyed) return;
    const dt = Math.min(0.05, dtMs / 1000);
    this.stepPlayer(dt);
    this.stepQueue(dt);
    this.detectProximity(dt);
    this.camera();
  }

  private stepPlayer(dt: number) {
    let dx = 0, dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx = -1;
    else if (this.keys.has("d") || this.keys.has("arrowright")) dx = 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy = -1;
    else if (this.keys.has("s") || this.keys.has("arrowdown")) dy = 1;
    if (dx || dy) this.clickTarget = null;
    if (!dx && !dy && this.clickTarget) {
      const ddx = this.clickTarget.x - this.px;
      const ddy = this.clickTarget.y - this.py;
      const d = Math.hypot(ddx, ddy);
      if (d < 0.15) this.clickTarget = null;
      else { dx = ddx / d; dy = ddy / d; }
    }
    const moving = !!(dx || dy);
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      const nx = this.px + (dx / len) * SPEED * dt;
      const ny = this.py + (dy / len) * SPEED * dt;
      if (!this.isBlocked(nx, this.py)) this.px = clamp(nx, 0.5, MAPW - 0.5);
      if (!this.isBlocked(this.px, ny)) this.py = clamp(ny, 0.5, MAPH - 0.5);
      this.pfacing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    }
    this.drawSprite(this.player, this.playerFrames, this.px, this.py, this.pfacing, moving, dt, (a) => (this.panim = a), this.panim);
  }

  /** The line is alive: every ~7s the front is served and leaves; everyone shuffles up, a
   * newcomer joins the back. Purely ambient — it gives the queue social reality to read. */
  private stepQueue(dt: number) {
    this.recycleAccum += dt;
    if (this.recycleAccum > 7 && this.waiting.length > 0) {
      this.recycleAccum = 0;
      const front = this.waiting.shift()!;
      front.state = "leaving";
      front.tx = EXIT.x;
      front.ty = EXIT.y;
      this.leaving.push(front);
      this.addTowns({ x: QUEUE_X, y: MAPH - 1.2 });
    }
    this.waiting.forEach((v, i) => {
      const slot = queueSlot(i);
      v.tx = slot.x;
      v.ty = slot.y;
      this.moveToward(v, dt);
    });
    for (let k = this.leaving.length - 1; k >= 0; k--) {
      const v = this.leaving[k];
      if (this.moveToward(v, dt)) {
        v.sprite.destroy();
        this.leaving.splice(k, 1);
      }
    }
  }

  private moveToward(v: Towns, dt: number): boolean {
    const dx = v.tx - v.x;
    const dy = v.ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.12) {
      this.drawSprite(v.sprite, v.frames, v.x, v.y, "up", false, dt, (a) => (v.anim = a), v.anim);
      return true;
    }
    const step = Math.min(d, SPEED * 0.7 * dt);
    const nx = v.x + (dx / d) * step;
    const ny = v.y + (dy / d) * step;
    if (!this.isBlocked(nx, v.y)) v.x = nx;
    if (!this.isBlocked(v.x, ny)) v.y = ny;
    v.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    this.drawSprite(v.sprite, v.frames, v.x, v.y, v.facing, true, dt, (a) => (v.anim = a), v.anim);
    return false;
  }

  private detectProximity(dt: number) {
    const npcsWaiting = this.waiting.length;
    const tail = queueSlot(npcsWaiting); // just behind the last person
    const nearCounter = dist(this.px, this.py, COUNTER.x, COUNTER.y) <= COUNTER_RADIUS;
    const nearTail = dist(this.px, this.py, tail.x, tail.y) <= 1.5;
    const nearStall = dist(this.px, this.py, STALL_POINT.x, STALL_POINT.y) <= 2.2;
    const nearPortal = dist(this.px, this.py, PORTAL.x + PORTAL.w / 2, PORTAL.y + PORTAL.h / 2) <= 2.4;

    if (nearCounter && !this.wasNearCounter) {
      this.hooks.onApproachServer?.(Number(dist(this.px, this.py, SERVER_POINT.x, SERVER_POINT.y).toFixed(2)));
    }
    this.wasNearCounter = nearCounter;

    // dwell at the flower stall → cue J2
    if (nearStall) {
      this.stallDwell += dt;
      if (this.stallDwell >= 3 && !this.stallFired) {
        this.stallFired = true;
        this.hooks.onStallDwell?.(Math.round(this.stallDwell));
      }
    } else {
      this.stallDwell = 0;
      this.stallFired = false;
    }

    const next = { nearCounter, npcsWaiting, nearTail, nearStall, nearPortal };
    const changed = (Object.keys(next) as (keyof TownProximity)[]).some((k) => next[k] !== this.prox[k]);
    this.prox = next;
    if (changed) this.hooks.onProximity?.({ ...next });
  }

  private camera() {
    const eff = SCALE * this.zoom;
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    const cx = (this.px * TILE + TILE / 2) * eff;
    const cy = (this.py * TILE + TILE) * eff;
    const minX = vw - MAPW * TILE * eff;
    const minY = vh - MAPH * TILE * eff;
    this.world.x = Math.round(clamp(vw / 2 - cx, Math.min(minX, 0), 0));
    this.world.y = Math.round(clamp(vh / 2 - cy, Math.min(minY, 0), 0));
  }

  private drawSprite(
    sprite: Sprite, frames: Record<Facing, Texture[]>, tileX: number, tileY: number,
    facing: Facing, moving: boolean, dt: number, setAnim: (a: number) => void, anim: number,
  ) {
    const sx = tileX * TILE + TILE / 2;
    const sy = tileY * TILE + TILE;
    sprite.x = sx;
    sprite.y = sy;
    (sprite as any).zIndex = sy;
    const arr = frames[facing];
    if (moving) {
      const a = anim + dt;
      setAnim(a);
      sprite.texture = arr[1 + (Math.floor(a * SPRITE.WALK_FPS) % (SPRITE.FRAME_COUNT - 1))];
    } else {
      setAnim(0);
      sprite.texture = arr[0];
    }
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    if (this.initialized) {
      try {
        this.app.canvas.removeEventListener("pointerdown", this.onPointer);
        this.app.canvas.removeEventListener("wheel", this.onWheel);
        this.app.destroy(true);
      } catch { /* ignore teardown races */ }
    }
  }
}

// ── helpers (local copies of the venue scene's) ──────────────────────────────
function nearest(t: Texture): Texture {
  t.source.scaleMode = "nearest";
  return t;
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
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
