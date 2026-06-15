/**
 * PixiJS venue scene (§6/§7): a plaza with a concert stage (top), the THY brand stand
 * (right), and a portal to "another island" (left). The human player walks (WASD / click);
 * visitor NPCs spawn from the bottom, queue at the stand, hold an autonomous conversation
 * via /api/venue/dialogue/simulate, then resolve — booking (leave happy), abandoning, or
 * defecting through the portal. Produces the research dataset with zero human input.
 *
 * PixiJS is a 2D renderer, not a game engine; all simulation lives here.
 */
import { Application, Container, Rectangle, Sprite, Text, Texture, TilingSprite } from "pixi.js";
import { SPRITE, FACING_ROW, type Facing } from "@echo/shared";
import { buildCharacterSheet, styleFromId, type CharStyle } from "@/game/art";
import { generateTravelerProfile, newVisitorId, SEGMENT_HINT } from "@/lib/venue/npc/profiles";
import type { Outcome, TravelerProfile } from "@/lib/venue/types";
import { loadVenueArt } from "./venueArt";

const TILE = 16;
const SCALE = 2; // zoomed out a touch so stage + crowd + stand read together
const MAPW = 42;
const MAPH = 26;
const SPEED = 4.2; // tiles/s

// Key tile-space anchors — stage across the top, stand on the right, portal on the left.
const STAGE = { x: 16, y: 1, w: 10, h: 7 };
const BOOTH = { x: 34, y: 10, w: 7, h: 6 };
const PORTAL = { x: 2, y: 10, w: 3, h: 5 };
const SALES_POINT = { x: 37, y: 16 };
const STAND_POINT = { x: 37, y: 19 }; // where the served visitor / human stands
const PLAYER_SPAWN = { x: 21, y: 18 };
const EXIT = { x: 21, y: 25 };
const STAND_RADIUS = 2.4;

type VState = "approach" | "toStand" | "talking" | "leaving" | "done";

interface Visitor {
  id: string;
  profile: TravelerProfile;
  sprite: Sprite;
  label: Text;
  bubble: Text;
  frames: Record<Facing, Texture[]>;
  x: number;
  y: number;
  facing: Facing;
  anim: number;
  state: VState;
  tx: number;
  ty: number;
  talkStart: number;
  outcome?: Outcome;
  leaveTo?: { x: number; y: number };
}

export interface VenueHooks {
  onStandProximity?: (near: boolean) => void;
  onVisitorResolved?: (o: Outcome) => void;
  onReady?: () => void;
  /** Fires when the human player steps in/out of the portal doorway (→ back to the world). */
  onPortalProximity?: (near: boolean) => void;
}

export class VenueScene {
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

  private visitors = new Map<string, Visitor>();
  private waiting: string[] = [];
  private talker: string | null = null;
  private simInFlight = false;
  private spawnAccum = 0;
  private nearStand = false;
  private nearPortal = false;
  private humanEngaged = false;
  private destroyed = false;
  private initialized = false;
  private hooks: VenueHooks;

  constructor(hooks: VenueHooks = {}) {
    this.hooks = hooks;
    this.buildCollision();
  }

  private buildCollision() {
    const block = (b: { x: number; y: number; w: number; h: number }) => {
      for (let y = b.y; y < b.y + b.h; y++)
        for (let x = b.x; x < b.x + b.w; x++)
          if (x >= 0 && y >= 0 && x < MAPW && y < MAPH) this.collision[y * MAPW + x] = 1;
    };
    block(STAGE);
    block({ ...BOOTH, h: BOOTH.h }); // booth body is solid; players stop at the counter
  }

  private isBlocked(tx: number, ty: number): boolean {
    const x = Math.round(tx);
    const y = Math.round(ty);
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return true;
    return this.collision[y * MAPW + x] === 1;
  }

  async init(parent: HTMLElement) {
    await this.app.init({ background: "#2a2440", resizeTo: parent, antialias: false, roundPixels: true });
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

    // ground
    const ground = new TilingSprite({ texture: this.tex.plaza, width: MAPW * TILE, height: MAPH * TILE });
    this.world.addChild(ground);

    // props (stage + portal flat; booth z-sorts with entities so visitors can pass in front)
    this.addProp(this.tex.stage, STAGE.x, STAGE.y, true);
    this.addProp(this.tex.portal, PORTAL.x, PORTAL.y, true);
    this.world.addChild(this.entityLayer);
    this.entityLayer.sortableChildren = true;
    this.addProp(this.tex.booth, BOOTH.x, BOOTH.y, false);

    // salesperson
    this.addSalesperson();

    // player
    this.playerFrames = sliceFrames(nearest(Texture.from(buildCharacterSheet(styleFromId("you")))));
    this.player = new Sprite(this.playerFrames.up[0]);
    this.player.anchor.set(0.5, 1);
    this.entityLayer.addChild(this.player);

    this.bindInput();
    this.app.ticker.add((t) => this.update(t.deltaMS));
    this.hooks.onReady?.();
  }

  private addProp(tex: Texture, tx: number, ty: number, flat: boolean) {
    const s = new Sprite(tex);
    s.x = tx * TILE;
    s.y = ty * TILE;
    if (flat) this.world.addChildAt(s, 1);
    else {
      (s as any).zIndex = (ty + tex.height / TILE) * TILE; // base line for z-sort
      this.entityLayer.addChild(s);
    }
  }

  private addSalesperson() {
    const style: CharStyle = { skin: "#e0a87e", hair: "#241a2e", shirt: "#b9543f", pants: "#2a3640", hairStyle: "short" };
    const frames = sliceFrames(nearest(Texture.from(buildCharacterSheet(style))));
    const s = new Sprite(frames.down[0]);
    s.anchor.set(0.5, 1);
    s.x = SALES_POINT.x * TILE + TILE / 2;
    s.y = SALES_POINT.y * TILE + TILE;
    (s as any).zIndex = s.y;
    this.entityLayer.addChild(s);
    const tag = new Text({ text: "THY · temsilci", style: { fontSize: 6, fill: 0xffd98a, fontFamily: "monospace" } });
    tag.anchor.set(0.5, 1);
    tag.scale.set(0.8);
    tag.x = s.x;
    tag.y = s.y - SPRITE.FRAME_H - 2;
    (tag as any).zIndex = s.y + 0.1;
    this.entityLayer.addChild(tag);
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private bindInput() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.app.canvas.addEventListener("pointerdown", this.onPointer);
  }
  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.type === "keydown") this.keys.add(e.key.toLowerCase());
    else this.keys.delete(e.key.toLowerCase());
  };
  private onPointer = (e: PointerEvent) => {
    const rect = this.app.canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - this.world.x) / SCALE;
    const wy = (e.clientY - rect.top - this.world.y) / SCALE;
    this.clickTarget = { x: wx / TILE, y: wy / TILE };
  };
  /** React tells us when the human opens/closes the stand conversation. */
  setHumanEngaged(v: boolean) {
    this.humanEngaged = v;
  }

  // ── main loop ────────────────────────────────────────────────────────────────
  private update(dtMs: number) {
    if (this.destroyed) return;
    const dt = Math.min(0.05, dtMs / 1000);
    this.stepPlayer(dt);
    this.spawn(dt);
    this.promote();
    for (const v of this.visitors.values()) this.stepVisitor(v, dt);
    this.detectProximity();
    this.camera();
  }

  private stepPlayer(dt: number) {
    let dx = 0,
      dy = 0;
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
      else {
        dx = ddx / d;
        dy = ddy / d;
      }
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

  // ── visitor lifecycle ──────────────────────────────────────────────────────
  private spawn(dt: number) {
    this.spawnAccum += dt;
    const cap = 14;
    if (this.spawnAccum > 2.4 && this.visitors.size < cap) {
      this.spawnAccum = 0;
      this.addVisitor();
    }
  }

  private addVisitor() {
    const id = newVisitorId();
    const profile = generateTravelerProfile(id);
    const frames = sliceFrames(nearest(Texture.from(buildCharacterSheet(styleFromId(id)))));
    const sprite = new Sprite(frames.up[0]);
    sprite.anchor.set(0.5, 1);
    const hint = SEGMENT_HINT[profile.segment];
    const label = new Text({ text: hint.label, style: { fontSize: 5, fill: hint.color, fontFamily: "monospace" } });
    label.anchor.set(0.5, 1);
    label.scale.set(0.8);
    const bubble = new Text({ text: "", style: { fontSize: 6, fill: 0xf4e9d0, fontFamily: "monospace", align: "center" } });
    bubble.anchor.set(0.5, 1);
    bubble.scale.set(0.8);
    bubble.visible = false;
    this.entityLayer.addChild(sprite, label, bubble);

    const x = 18 + Math.random() * 8;
    const v: Visitor = {
      id, profile, sprite, label, bubble, frames,
      x, y: MAPH - 1.5, facing: "up", anim: 0,
      state: "approach", tx: STAND_POINT.x, ty: STAND_POINT.y, talkStart: 0,
    };
    this.visitors.set(id, v);
    this.waiting.push(id);
  }

  /** Move the front of the queue to the stand when it's free (and no human is engaging). */
  private promote() {
    if (this.talker || this.humanEngaged || this.waiting.length === 0) return;
    const frontId = this.waiting[0];
    const v = this.visitors.get(frontId);
    if (!v) {
      this.waiting.shift();
      return;
    }
    // Front must have arrived near its queue slot before stepping up.
    if (dist(v.x, v.y, STAND_POINT.x, STAND_POINT.y + 1.4) < 1.0) {
      this.waiting.shift();
      this.talker = frontId;
      v.state = "toStand";
      v.tx = STAND_POINT.x;
      v.ty = STAND_POINT.y;
    }
  }

  private stepVisitor(v: Visitor, dt: number) {
    switch (v.state) {
      case "approach": {
        const idx = Math.max(0, this.waiting.indexOf(v.id));
        v.tx = STAND_POINT.x;
        v.ty = STAND_POINT.y + 1.4 + idx * 1.2; // line up south of the stand
        this.moveToward(v, dt);
        break;
      }
      case "toStand": {
        if (this.moveToward(v, dt)) {
          v.state = "talking";
          v.facing = "up";
          v.talkStart = performance.now();
          v.bubble.visible = true;
          v.bubble.text = "…";
          this.beginConversation(v);
        }
        break;
      }
      case "talking": {
        this.drawSprite(v.sprite, v.frames, v.x, v.y, "up", false, dt, (a) => (v.anim = a), v.anim);
        // Resolve once the API has returned and a minimum beat has passed (readable).
        if (v.outcome && performance.now() - v.talkStart > 3500) this.resolve(v);
        this.placeLabels(v);
        return;
      }
      case "leaving": {
        if (this.moveToward(v, dt)) {
          v.state = "done";
          this.despawn(v);
          return;
        }
        break;
      }
      case "done":
        return;
    }
    this.placeLabels(v);
  }

  private async beginConversation(v: Visitor) {
    // One conversation in flight at a time keeps mock snappy and live cheap.
    if (this.simInFlight) {
      // retry shortly by resetting talkStart so the min-beat check waits
      v.talkStart = performance.now();
    }
    this.simInFlight = true;
    const dwellSeconds = Math.round(25 + Math.random() * 95);
    try {
      const res = await fetch("/api/venue/dialogue/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: v.profile, dwellSeconds }),
      });
      const data = (await res.json()) as { outcome?: Outcome; messages?: { who: string; text: string }[] };
      v.outcome = data.outcome;
      // Show a short visitor line, then the verdict, as a bubble.
      const firstVisitorLine = data.messages?.find((m) => m.who === "visitor")?.text;
      if (firstVisitorLine) v.bubble.text = trim(firstVisitorLine);
    } catch {
      v.outcome = undefined;
      v.bubble.text = "(bağlantı yok)";
    } finally {
      this.simInFlight = false;
    }
  }

  private resolve(v: Visitor) {
    const o = v.outcome!;
    if (this.talker === v.id) this.talker = null;
    if (o.booked) {
      v.bubble.text = "✓ rezervasyon";
      v.bubble.style.fill = 0x6fcf7f;
      v.leaveTo = EXIT;
    } else if (o.defectedTo) {
      v.bubble.text = `→ ${trim(o.defectedTo, 16)}`;
      v.bubble.style.fill = 0xe06c75;
      v.leaveTo = { x: PORTAL.x + 1.5, y: PORTAL.y + PORTAL.h }; // walk into the portal
    } else {
      v.bubble.text = reasonLabel(o.noPurchaseReason);
      v.bubble.style.fill = 0xd0a93a;
      v.leaveTo = EXIT;
    }
    v.tx = v.leaveTo.x;
    v.ty = v.leaveTo.y;
    v.state = "leaving";
    this.hooks.onVisitorResolved?.(o);
    // hide the bubble after a moment
    window.setTimeout(() => (v.bubble.visible = false), 2200);
  }

  /** Move a visitor toward (tx,ty); returns true on arrival. */
  private moveToward(v: Visitor, dt: number): boolean {
    const dx = v.tx - v.x;
    const dy = v.ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.12) {
      this.drawSprite(v.sprite, v.frames, v.x, v.y, v.facing, false, dt, (a) => (v.anim = a), v.anim);
      return true;
    }
    const step = Math.min(d, SPEED * 0.85 * dt);
    const nx = v.x + (dx / d) * step;
    const ny = v.y + (dy / d) * step;
    if (!this.isBlocked(nx, v.y)) v.x = nx;
    if (!this.isBlocked(v.x, ny)) v.y = ny;
    v.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    this.drawSprite(v.sprite, v.frames, v.x, v.y, v.facing, true, dt, (a) => (v.anim = a), v.anim);
    return false;
  }

  private despawn(v: Visitor) {
    v.sprite.destroy();
    v.label.destroy();
    v.bubble.destroy();
    this.visitors.delete(v.id);
    const i = this.waiting.indexOf(v.id);
    if (i >= 0) this.waiting.splice(i, 1);
    if (this.talker === v.id) this.talker = null;
  }

  private placeLabels(v: Visitor) {
    const sx = v.x * TILE + TILE / 2;
    const sy = v.y * TILE + TILE;
    v.label.x = sx;
    v.label.y = sy - SPRITE.FRAME_H - 2;
    (v.label as any).zIndex = sy + 0.1;
    v.bubble.x = sx;
    v.bubble.y = sy - SPRITE.FRAME_H - 9;
    (v.bubble as any).zIndex = sy + 0.2;
  }

  private detectProximity() {
    const near = dist(this.px, this.py, STAND_POINT.x, STAND_POINT.y) <= STAND_RADIUS;
    if (near !== this.nearStand) {
      this.nearStand = near;
      this.hooks.onStandProximity?.(near);
    }
    const portalCx = PORTAL.x + PORTAL.w / 2;
    const portalCy = PORTAL.y + PORTAL.h / 2;
    const nearP = dist(this.px, this.py, portalCx, portalCy) <= 2.4;
    if (nearP !== this.nearPortal) {
      this.nearPortal = nearP;
      this.hooks.onPortalProximity?.(nearP);
    }
  }

  private camera() {
    const vw = this.app.screen.width;
    const vh = this.app.screen.height;
    const cx = (this.px * TILE + TILE / 2) * SCALE;
    const cy = (this.py * TILE + TILE) * SCALE;
    const maxX = 0;
    const minX = vw - MAPW * TILE * SCALE;
    const maxY = 0;
    const minY = vh - MAPH * TILE * SCALE;
    this.world.x = Math.round(clamp(vw / 2 - cx, Math.min(minX, maxX), maxX));
    this.world.y = Math.round(clamp(vh / 2 - cy, Math.min(minY, maxY), maxY));
  }

  private drawSprite(
    sprite: Sprite,
    frames: Record<Facing, Texture[]>,
    tileX: number,
    tileY: number,
    facing: Facing,
    moving: boolean,
    dt: number,
    setAnim: (a: number) => void,
    anim: number,
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

  getNearStand() {
    return this.nearStand;
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    if (this.initialized) {
      try {
        this.app.canvas.removeEventListener("pointerdown", this.onPointer);
        this.app.destroy(true);
      } catch { /* ignore teardown races */ }
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
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
const trim = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function reasonLabel(reason?: Outcome["noPurchaseReason"]): string {
  return {
    price: "✕ fiyat",
    schedule: "✕ tarih",
    route: "✕ rota",
    competitor: "✕ rakip",
    browsing: "✕ geziniyor",
    other: "✕ diğer",
  }[reason ?? "other"];
}
