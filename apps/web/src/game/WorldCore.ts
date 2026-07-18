/**
 * WorldCore — everything about the world that is not pixels.
 *
 * This is an EXTRACTION, not a rewrite. Every method here was lifted from PixiWorld.ts with its
 * math intact, because the pieces it owns are the ones we cannot afford to "port":
 *
 *   • Local movement prediction. The client and the AUTHORITATIVE server (WorldRoom.integrate) run
 *     the SAME geometry over the SAME shared functions (oceanLandAt / clampToMap / driftVector /
 *     hullSpeed / strain01) at the SAME variable dt (dtMs/1000, unclamped, both sides) — so they
 *     SHOULD stay together. Note "should", not "proven 0.0000": the old copresence "drift 0.0000"
 *     was a SERVER-side no-rebound test, and the client reconcile error compared the predictor to
 *     the snapshot on the same client ticker — neither actually measured client-predicted vs
 *     server-authoritative divergence for the same entity. That real number is now measured
 *     directly (getDrift(), sampled in applySnapshot before reconcile) instead of assumed. Keep the
 *     two integrators identical and DON'T re-introduce a clamp or fixed step on one side only.
 *     Gameplay is (x, y) on a flat plane in TILE units, and stays there — 3D height is visual only.
 *   • The separate-axis collision test (X against the old Y, then Y against the new X). That is
 *     what produces wall-sliding, and it is what the server does. A "tidier" single 2D test would
 *     change movement feel AND desync from the server. Do not.
 *   • The locomotion accumulator behind sampleLocomotion(), and onSelfSample — which feeds the P3
 *     passive_locomotion sampler, the canonical locomotion→openness channel that the ★ P5 W
 *     re-anchor was trained on. Its scalars are a measurement contract, not an implementation
 *     detail: change the math and you silently invalidate W's learned directions.
 *   • The owner-locked activity slot, the entity registry + interpolation buffers, proximity and
 *     the CLOSE ≤ 2.0 gate.
 *
 * Renderers (ThreeWorld today, PixiWorld until it is deleted) own pixels and nothing else. They
 * read state from here each frame and draw it.
 */
import {
  WORLD,
  presenceTier,
  oceanLandAt,
  OCEAN_BEACH_W,
  clampToMap,
  hullSpeed,
  driftVector,
  strain01,
  type EntitySnapshot,
  type Facing,
} from "@echo/shared";
import { isBlocked, isWater, type TileMap } from "./tilemap";

/** Render remotes this many ms in the past so interpolation always has two snapshots. */
export const INTERP_DELAY = 100;

/**
 * An embodied-activity animation state layered on top of walk/idle (the F1/F4/F5/F6 rebuild). The
 * animation is PROCEDURAL — a rhythmic bob/lunge + a carried-item overlay + dust/spark particles —
 * so it always runs zero-key and carries the manner cues in 2D or 3D alike. `intensity` scales the
 * motion (a vigorous vs languid build).
 */
export type ActivityKind = "gather" | "carry" | "build" | "dig" | "plant" | "study" | "still";
export interface EntityActivity {
  kind: ActivityKind;
  /** performance.now() when the activity started (drives the rhythmic phase). */
  t0: number;
  /** true → also render the carried-item overlay above the hands. */
  carrying?: boolean;
  intensity?: number;
}

/**
 * An entity as the WORLD knows it: identity, position, interpolation, activity. No sprite, no mesh.
 * The renderer keeps its own view object keyed by the same id.
 */
export interface WorldEntity {
  id: string;
  kind: "user" | "npc";
  name: string;
  refId: string;
  spriteUrl: string;
  targetX: number;
  targetY: number;
  /** The interpolated position this frame — what proximity, camera and the renderer all read.
   *  (Was an untyped `(re as any)._tx/_ty` side channel on the Pixi entity.) */
  ix: number;
  iy: number;
  facing: Facing;
  moving: boolean;
  animTime: number;
  /** Timestamped snapshot buffer for remote entity interpolation (render in the past). */
  buf: { t: number; x: number; y: number; facing: Facing; moving: boolean }[];
  activity?: EntityActivity | null;
  /** Target rendered HEIGHT in source px. Lets a big committed PNG (a 36×75 driftwood) read at
   *  avatar scale. The renderer decides what that means in its own units. */
  targetH?: number;
}

export interface WorldHooks {
  onNearbyChange?: (target: { id: string; name: string; refId: string; kind: "user" | "npc" } | null) => void;
  onMoveIntent?: (dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 }, facing: Facing, seq: number) => void;
  onStop?: (seq: number) => void;
  emitTelemetry?: (type: string, payload: Record<string, unknown>) => void;
  /** Fires when the local player steps in/out of the portal doorway's interaction radius. */
  onPortalChange?: (near: boolean) => void;
  /** The local player's predicted tile position, every frame — feeds the passive locomotion
   *  sampler (P3). The consumer throttles; positions never leave the client. */
  onSelfSample?: (x: number, y: number) => void;
  /** An entity joined the world — the renderer should build a view for it. */
  onEntityAdded?: (e: WorldEntity) => void;
  /** An entity left — the renderer should destroy its view. */
  onEntityRemoved?: (id: string) => void;
  /** An entity's sprite url changed — the renderer should re-skin it. */
  onEntitySkin?: (id: string, spriteUrl: string) => void;
  /** An entity's display name changed. */
  onEntityName?: (id: string, name: string) => void;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; color: number;
}

/** The per-frame visual reading of one entity. Pure numbers; the renderer maps them to its own
 *  units. Everything here was computed inside PixiWorld.drawEntity and immediately written into a
 *  Pixi object — the computation is core, the writing is not. */
export interface EntityVisual {
  /** Identity is legible only at CLOSE (≤ 2.0 tiles) — the no-leak guarantee, render-side. */
  named: boolean;
  /** Vertical hop from the activity animation, in source px. */
  bob: number;
  /** Body lean/rotation from the activity animation, radians. */
  lean: number;
  carrying: boolean;
  /** Walk-cycle frame index; 0 = idle. */
  frameIndex: number;
  /** Sun-driven cast shadow: `stretch` scales its length, `dir` which side it falls. */
  shadow: { stretch: number; dir: number; alpha: number };
  /** The violet presence ring under live humans (never NPCs); null when not applicable. */
  ring: { alpha: number; scale: number; pulsing: boolean } | null;
}

const quantizeDir = (dx: number, dy: number): { x: -1 | 0 | 1; y: -1 | 0 | 1 } => {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const x = (ax > ay * 0.4 ? Math.sign(dx) : 0) as -1 | 0 | 1;
  const y = (ay > ax * 0.4 ? Math.sign(dy) : 0) as -1 | 0 | 1;
  return { x, y };
};

/** Locally-owned, client-only entities (F0 affordances, day stations, P7 probes) are always "here":
 *  they live on your own island and must never read as distant. */
const isLocalProp = (id: string) => id.startsWith("f0_") || id.startsWith("day_") || id.startsWith("probe_");

export class WorldCore {
  readonly map: TileMap;
  hooks: WorldHooks;

  entities = new Map<string, WorldEntity>();
  private pendingH = new Map<string, number>();

  selfId = "";
  localX: number;
  localY: number;
  localFacing: Facing = "down";

  private keys = new Set<string>();
  private clickTarget: { x: number; y: number } | null = null;
  private seq = 0;
  private lastDirSent = "";

  private nearbyId: string | null = null;
  private nearbyKind: "user" | "npc" | null = null;
  private dwellTimer = 0;

  // ── locomotion sampler accumulators. Drained by sampleLocomotion(). These scalars are the
  //    measurement contract described in the file header — do not "improve" the math. ──
  private sampMs = 0;
  private sampStillMs = 0;
  private sampDist = 0;
  private sampHeadingChanges = 0;
  private sampLastHeading = "";
  private sampSpeeds: number[] = [];
  private sampNewTiles = 0;
  private sampStepTiles = 0;
  private sampVisited = new Set<string>();

  /** Camera "find this player" state. The renderer eases toward it in its own units. */
  locateId: string | null = null;
  locateUntil = 0;

  private canSail = false;
  private raft = { sea: 0, reach: 0, departX: 0, departY: 0 };
  private raftStrain = 0;

  private portalCenter = { x: 0, y: 0 };
  private portalNear = false;

  dayPhase = 0.35;
  vitality = 1;
  scarcity = 0;

  /** Client-vs-server drift, in tiles. Sampled per self-snapshot in applySnapshot, before reconcile.
   *  Split by whether the local player was moving, because those measure different things:
   *   • MOVING: dominated by the client-side predictor leading a snapshot that reflects the server a
   *     moment ago (≈ MOVE_SPEED × snapshot age). Expected and benign — a predictor is supposed to
   *     be ahead of the last stale snapshot.
   *   • SETTLED (not moving): no lead, so this is the true position-AGREEMENT number. If the two
   *     integrators actually disagreed, it would show here; it should collapse toward ~0. */
  private drift = { last: 0, moving: { max: 0, sum: 0, n: 0 }, settled: { max: 0, sum: 0, n: 0 } };
  private selfMoving = false;
  /** performance.now() of the last frame the local player was moving — so the settled bucket can
   *  wait out the post-stop convergence transient (the client stops instantly; the server keeps
   *  integrating the last input for ~one round-trip) and measure only the truly-converged rest. */
  private lastMovingAt = 0;

  particles: Particle[] = [];

  constructor(hooks: WorldHooks, map: TileMap) {
    this.hooks = hooks;
    this.map = map;
    this.localX = map.width / 2;
    this.localY = map.height / 2;
    // Computed here, NOT in a render-side buildPortal(). It used to live there, which meant a
    // renderer that skipped building the portal art would silently never fire onPortalChange.
    if (map.portal) {
      this.portalCenter = { x: map.portal.x + map.portal.w / 2, y: map.portal.y + map.portal.h / 2 };
    }
  }

  // ── lifecycle / identity ────────────────────────────────────────────────────────

  setSelf(id: string, x: number, y: number) {
    this.selfId = id;
    this.localX = x;
    this.localY = y;
  }

  getSelfTile(): { x: number; y: number } {
    return { x: this.localX, y: this.localY };
  }

  isSharedOcean(): boolean {
    return !!this.map.sharedOcean;
  }

  // ── input (the renderer owns the listeners; the state lives here) ────────────────

  setKey(key: string, down: boolean) {
    if (down) this.keys.add(key);
    else this.keys.delete(key);
  }

  clearKeys() {
    this.keys.clear();
  }

  private readInputDir(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    return { x, y };
  }

  setAutoWalk(target: { x: number; y: number } | null) {
    this.clickTarget = target;
  }

  isMoving(): boolean {
    const d = this.readInputDir();
    return d.x !== 0 || d.y !== 0 || this.clickTarget !== null;
  }

  // ── collision — same geometry as WorldRoom.integrate, so client and server agree (measured by
  //    getDrift(), not assumed). ──

  blockedAt(x: number, y: number): boolean {
    if (this.isSharedOcean()) {
      if (this.canSail) return false; // sailing: sea + land all passable
      return !oceanLandAt(x, y, OCEAN_BEACH_W); // on foot: only the open sea (beyond grass+beach) blocks
    }
    if (!isBlocked(this.map, x, y)) return false;
    return !(this.canSail && isWater(this.map, x, y));
  }

  // ── the raft ────────────────────────────────────────────────────────────────────

  setSailing(on: boolean) {
    this.canSail = on;
  }

  /** Mirror the authoritative raft (from the server snapshot) so the client predicts the same
   *  current. In the solo slice there is no server, so the caller passes the built raft directly. */
  setRaft(r: { sea: number; reach: number; departX: number; departY: number }) {
    this.raft = { ...r };
  }

  /** How hard the sea is pushing back, 0..1 — for the wake/strain render. Never shown as a number. */
  getRaftStrain(): number {
    return this.raftStrain;
  }

  // ── the local step: prediction, collision, sampling, intent ──────────────────────

  stepLocal(dt: number) {
    const preX = this.localX;
    const preY = this.localY;
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
    // ── the sea pushes back (predicted identically to WorldRoom.integrate, from the shared raft.ts) ──
    // Past the raft's reach the current carries you home. It never seizes the keys: you can always paddle,
    // you just stop making headway. Applied before (and independently of) your own input, so idling at the
    // edge of your reach drifts you back rather than freezing you.
    const afloat = this.canSail && !oceanLandAt(this.localX, this.localY, OCEAN_BEACH_W);
    if (afloat) {
      const spent = Math.hypot(this.localX - this.raft.departX, this.localY - this.raft.departY);
      this.raftStrain = strain01(spent, this.raft.reach);
      const df = driftVector(this.localX, this.localY, this.raft.departX, this.raft.departY, spent, this.raft.reach);
      // Clamp to the SAME bounds the server integrates against (WorldRoom.integrate), or a player carried
      // toward a map edge would predict a position outside it, be corrected, and snap.
      const c = clampToMap(this.localX + df.x * dt, this.localY + df.y * dt);
      this.localX = c.x;
      this.localY = c.y;
    } else {
      this.raftStrain = 0;
    }

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      // A raft is not a pair of legs: a true raft is quick, a scrap raft wallows. Only while AFLOAT —
      // beaching the raft must not leave you walking the island at the wrong speed (matches the server).
      const speed = afloat ? hullSpeed(this.raft.sea) : WORLD.MOVE_SPEED;
      const len = Math.hypot(dx, dy) || 1;
      const nx = this.localX + (dx / len) * speed * dt;
      const ny = this.localY + (dy / len) * speed * dt;
      const beforeX = this.localX;
      const beforeY = this.localY;
      // client-side collision prediction (the sea is passable once sailing is unlocked).
      // Separate axes ON PURPOSE: X against the old Y, then Y against the new X. That is what
      // slides you along a wall, and it is what the server does. A single 2D test desyncs.
      if (!this.blockedAt(nx, this.localY)) this.localX = nx;
      if (!this.blockedAt(this.localX, ny)) this.localY = ny;
      // Click-to-move into a wall: if we couldn't budge at all, drop the target so we
      // don't shove into the obstacle forever.
      if (this.clickTarget && this.localX === beforeX && this.localY === beforeY) this.clickTarget = null;
      this.localFacing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    }
    // ── accumulate locomotion for the passive sampler (drained by sampleLocomotion) ──
    this.sampMs += dt * 1000;
    const stepDist = Math.hypot(this.localX - preX, this.localY - preY);
    this.sampDist += stepDist;
    if (moving) {
      this.sampSpeeds.push(stepDist / Math.max(dt, 1e-3));
      const h = this.localFacing;
      if (this.sampLastHeading && h !== this.sampLastHeading) this.sampHeadingChanges++;
      this.sampLastHeading = h;
      // explore ratio: has the player been on this tile before this sample window? (new vs revisited)
      const key = `${Math.round(this.localX)},${Math.round(this.localY)}`;
      this.sampStepTiles++;
      if (!this.sampVisited.has(key)) { this.sampVisited.add(key); this.sampNewTiles++; }
    } else {
      this.sampStillMs += dt * 1000;
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
    // The self entity carries its predicted position like any other, so the renderer's draw pass
    // treats self and remotes uniformly. (PixiWorld called drawEntity inline here instead.)
    const self = this.entities.get(this.selfId);
    if (self) {
      self.ix = this.localX;
      self.iy = this.localY;
      self.facing = this.localFacing;
      self.moving = moving;
    }
    this.selfMoving = moving; // for the drift instrument's moving/settled split
    if (moving) this.lastMovingAt = performance.now();
    this.hooks.onSelfSample?.(this.localX, this.localY);
  }

  // ── remotes: interpolate in the past ────────────────────────────────────────────

  stepRemotes() {
    const renderT = performance.now() - INTERP_DELAY;
    for (const [id, e] of this.entities) {
      if (id === this.selfId) continue;
      const s = this.sampleBuffer(e, renderT);
      e.ix = s.x;
      e.iy = s.y;
      e.facing = s.facing;
      e.moving = s.moving;
    }
  }

  /** Linear interpolation between the two buffered snapshots straddling renderT (entity
   *  interpolation). Falls back to the newest snapshot when ahead of the buffer. Pure. */
  sampleBuffer(e: WorldEntity, renderT: number): { x: number; y: number; facing: Facing; moving: boolean } {
    const buf = e.buf;
    if (buf.length === 0) return { x: e.targetX, y: e.targetY, facing: e.facing, moving: e.moving };
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

  // ── the entity registry ─────────────────────────────────────────────────────────

  private ensureEntity(snap: EntitySnapshot): WorldEntity {
    const existing = this.entities.get(snap.id);
    if (existing) return existing;
    const e: WorldEntity = {
      id: snap.id,
      kind: snap.kind,
      name: snap.name,
      refId: snap.refId,
      spriteUrl: snap.spriteUrl,
      targetX: snap.x,
      targetY: snap.y,
      ix: snap.x,
      iy: snap.y,
      facing: snap.facing,
      moving: snap.moving,
      animTime: 0,
      buf: [],
      activity: null,
    };
    const ph = this.pendingH.get(snap.id);
    if (ph !== undefined) {
      e.targetH = ph;
      this.pendingH.delete(snap.id);
    }
    this.entities.set(snap.id, e);
    this.hooks.onEntityAdded?.(e);
    return e;
  }

  /** Apply an authoritative snapshot: set interpolation targets for remotes.
   *  NOTE: `ackSeq` is accepted for call-site compatibility and deliberately unused — there is no
   *  input replay, only the hard error snap below. PixiWorld did exactly the same. */
  applySnapshot(snaps: Map<string, EntitySnapshot>, _ackSeq?: number) {
    for (const [id, snap] of snaps) {
      const e = this.ensureEntity(snap);
      if (id === this.selfId) {
        // ── the honest client-vs-server drift instrument ──
        // This is the invariant that actually matters and was never measured: the divergence
        // between the CLIENT'S predicted (x,y) and the SERVER'S authoritative (x,y) for the SAME
        // entity (self), sampled the instant a fresh server snapshot lands. It is recorded BEFORE
        // the reconcile below, so a snap can never mask it — that masking is exactly how the old
        // "drift 0.0000" story hid the fact it was measuring the predictor against a same-ticker tap
        // rather than against the server. (Caveat: on a real network the snapshot reflects the
        // server a latency ago, so this reads a floor; on the local three-service run latency is a
        // tick or two and this is the real number. Fully tick-aligned via acked-seq history is the
        // rigorous form — see known-gaps.)
        const err = Math.hypot(this.localX - snap.x, this.localY - snap.y);
        this.drift.last = err;
        // Moving → the predictor-lead bucket. Not-moving-and-settled (still for >400ms, past the
        // post-stop convergence transient) → the true position-agreement bucket. The brief window
        // right after stopping counts as neither, so it doesn't inflate "settled".
        const settled = !this.selfMoving && performance.now() - this.lastMovingAt > 400;
        const bucket = this.selfMoving ? this.drift.moving : settled ? this.drift.settled : null;
        if (bucket) {
          if (err > bucket.max) bucket.max = err;
          bucket.sum += err;
          bucket.n += 1;
        }
        // Reconcile only if prediction drifted far (measured above first, so it stays honest).
        if (err > 1.5) {
          this.localX = snap.x;
          this.localY = snap.y;
        }
        continue;
      }
      e.targetX = snap.x;
      e.targetY = snap.y;
      e.facing = snap.facing;
      e.moving = snap.moving;
      e.buf.push({ t: performance.now(), x: snap.x, y: snap.y, facing: snap.facing, moving: snap.moving });
      if (e.buf.length > 20) e.buf.shift();
    }
    // Remove entities that left. This culls EVERY id absent from the snapshot, which is why
    // client-local props (f0_/day_/probe_/f1_) must be merged into `snaps` by the caller every
    // tick — the trap that ate the driftwood pick.
    for (const id of [...this.entities.keys()]) {
      if (!snaps.has(id)) {
        this.entities.delete(id);
        this.hooks.onEntityRemoved?.(id);
      }
    }
  }

  addEntity(snap: EntitySnapshot) {
    if (this.entities.has(snap.id)) return;
    this.ensureEntity(snap);
  }

  removeEntity(id: string) {
    if (!this.entities.delete(id)) return;
    this.hooks.onEntityRemoved?.(id);
    if (this.nearbyId === id) {
      this.nearbyId = null;
      this.nearbyKind = null;
      this.hooks.onNearbyChange?.(null);
    }
  }

  moveEntity(id: string, x: number, y: number, facing?: Facing) {
    const e = this.entities.get(id);
    if (!e) return;
    e.targetX = x;
    e.targetY = y;
    if (facing) e.facing = facing;
    e.buf.push({ t: performance.now(), x, y, facing: e.facing, moving: true });
    if (e.buf.length > 20) e.buf.shift();
  }

  /** Target rendered height in source px. `pendingH` exists because a scene can set a prop's scale
   *  before the entity is merged in from a snapshot. */
  setEntityDisplayHeight(id: string, px: number) {
    const e = this.entities.get(id);
    if (e) e.targetH = px;
    else this.pendingH.set(id, px);
  }

  setEntitySprite(id: string, spriteUrl: string) {
    const e = this.entities.get(id);
    if (!e) return;
    e.spriteUrl = spriteUrl;
    this.hooks.onEntitySkin?.(id, spriteUrl);
  }

  setEntityName(id: string, name: string) {
    const e = this.entities.get(id);
    if (!e) return;
    e.name = name;
    this.hooks.onEntityName?.(id, name);
  }

  listNpcs(): { id: string; refId: string; name: string; x: number; y: number }[] {
    const out: { id: string; refId: string; name: string; x: number; y: number }[] = [];
    for (const [id, e] of this.entities) {
      if (e.kind !== "npc") continue;
      if (isLocalProp(id)) continue;
      out.push({ id, refId: e.refId, name: e.name, x: e.ix, y: e.iy });
    }
    return out;
  }

  // ── the activity slot, owner-locked ─────────────────────────────────────────────

  private activityOwner: string | null = null;

  /**
   * RaftBuild and Flow1Beats both run loops that write the ONE self activity slot. Without this
   * lock, Flow1Beats nulled the slot in the same frame RaftBuild set "build", and the build
   * animation never played. Whoever claims the slot with an `owner` token is the only one who can
   * clear it.
   */
  setSelfActivityState(kind: ActivityKind | null, opts?: { carrying?: boolean; intensity?: number; owner?: string }) {
    if (!this.selfId) return;
    const owner = opts?.owner;
    if (!kind) {
      if (owner && this.activityOwner && this.activityOwner !== owner) return; // not yours to clear
      this.activityOwner = null;
    } else if (owner) {
      this.activityOwner = owner;
    }
    this.setActivityState(this.selfId, kind, opts);
  }

  setActivityState(id: string, kind: ActivityKind | null, opts?: { carrying?: boolean; intensity?: number }) {
    const e = this.entities.get(id);
    if (!e) return;
    if (!kind) {
      e.activity = null;
      return;
    }
    if (e.activity && e.activity.kind === kind) {
      if (opts?.carrying !== undefined) e.activity.carrying = opts.carrying;
      if (opts?.intensity !== undefined) e.activity.intensity = opts.intensity;
      return;
    }
    e.activity = { kind, t0: performance.now(), carrying: opts?.carrying, intensity: opts?.intensity };
  }

  /**
   * Advance the activity animations and spawn their particles. This used to live inside the Pixi
   * draw path, which tied particle density to the render rate; it belongs on the sim step.
   */
  stepActivities() {
    for (const [id, e] of this.entities) {
      if (!e.activity) continue;
      const el = (performance.now() - e.activity.t0) / 1000;
      const kind = e.activity.kind;
      const inten = e.activity.intensity ?? 1;
      if ((kind === "build" || kind === "dig") && id === this.selfId && this.particles.length < 60) {
        const hz = kind === "dig" ? 1.8 : 2.2;
        const phase = Math.sin(el * Math.PI * 2 * hz);
        if (phase > 0.85) {
          this.spawnParticles(e.ix, e.iy, kind === "dig" ? 0x7a4a2b : 0xf0cf5e, 2, kind === "dig" ? 15 : 22);
        }
      }
      void inten;
    }
  }

  /** The per-frame visual reading of an entity — pure numbers, no pixels. */
  entityVisual(e: WorldEntity, dt: number): EntityVisual {
    const dist = isLocalProp(e.id) ? 0 : Math.hypot(this.localX - e.ix, this.localY - e.iy);
    const named = presenceTier(dist) === "close"; // identity only at interaction range

    let bob = 0;
    let lean = 0;
    if (e.activity) {
      const el = (performance.now() - e.activity.t0) / 1000;
      const inten = e.activity.intensity ?? 1;
      const kind = e.activity.kind;
      if (kind === "build" || kind === "dig") {
        const hz = kind === "dig" ? 1.8 : 2.2;
        const phase = Math.sin(el * Math.PI * 2 * hz);
        lean = phase * (kind === "dig" ? 0.14 : 0.16) * inten;
        bob = Math.max(0, phase) * (kind === "dig" ? 2.4 : 2.0) * inten;
      } else if (kind === "gather" || kind === "plant") {
        bob = Math.abs(Math.sin(el * Math.PI * 2 * (kind === "plant" ? 1.2 : 1.4))) * 2.0 * inten;
      } else if (kind === "study") {
        lean = Math.sin(el * 1.5) * 0.06;
      } else if (kind === "still") {
        bob = Math.sin(el * 1.2) * 0.5;
      }
    }

    // Walk cycle.
    let frameIndex = 0;
    if (e.moving) {
      e.animTime += dt;
      frameIndex = 1 + (Math.floor(e.animTime * 8) % 3);
    } else {
      e.animTime = 0;
    }

    // The sun arc drives every cast shadow (diegetic daylight, blueprint V.1).
    const p = this.dayPhase;
    const stretch = 0.35 + Math.abs(p - 0.5) * 2 * 1.5;
    const dir = p < 0.5 ? -1 : 1;
    const shadowAlpha = p > 0.9 ? 0.18 * (1 - (p - 0.9) / 0.1) : 0.18;

    const t = performance.now() / 1000;
    let ring: EntityVisual["ring"] = null;
    if (e.kind === "user") {
      const pulsing = this.locateId === e.id && performance.now() < this.locateUntil;
      const base = pulsing ? 0.85 : 0.45;
      const amp = pulsing ? 0.3 : 0.12;
      ring = {
        alpha: base + Math.sin(t * (pulsing ? 6 : 2)) * amp,
        scale: pulsing ? 1.25 + Math.sin(t * 6) * 0.15 : 1,
        pulsing,
      };
    }

    return {
      named,
      bob,
      lean,
      carrying: !!e.activity?.carrying,
      frameIndex,
      shadow: { stretch, dir, alpha: shadowAlpha },
      ring,
    };
  }

  // ── proximity: the CLOSE ≤ 2.0 gate ─────────────────────────────────────────────

  detectProximity(dt: number) {
    let best: WorldEntity | null = null;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, e] of this.entities) {
      if (id === this.selfId) continue; // never "near" yourself
      const d = Math.hypot(this.localX - e.ix, this.localY - e.iy);
      if (d < bestDist) {
        bestDist = d;
        best = e;
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

  /** The real client-vs-server drift (tiles). `settled` is the true position-agreement number
   *  (no prediction lead); `moving` includes the predictor's expected lead over a stale snapshot.
   *  Zero samples until the first self-snapshot arrives (i.e. a server is actually connected). */
  getDrift(): {
    last: number;
    moving: { max: number; mean: number; samples: number };
    settled: { max: number; mean: number; samples: number };
  } {
    const m = this.drift.moving;
    const s = this.drift.settled;
    return {
      last: this.drift.last,
      moving: { max: m.max, mean: m.n ? m.sum / m.n : 0, samples: m.n },
      settled: { max: s.max, mean: s.n ? s.sum / s.n : 0, samples: s.n },
    };
  }

  getNearbyId(): string | null {
    return this.nearbyId;
  }

  getNearbyKind(): "user" | "npc" | null {
    return this.nearbyKind;
  }

  detectPortal() {
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

  pingEntity(id: string) {
    const e = this.entities.get(id);
    if (!e) return;
    this.locateId = id;
    this.locateUntil = performance.now() + 3000;
    this.clickTarget = { x: e.ix, y: e.iy };
  }

  /** The camera's "find them" target while a ping is live, in TILE units. Null when idle. */
  locateTarget(): { x: number; y: number } | null {
    if (!this.locateId || performance.now() >= this.locateUntil) {
      this.locateId = null;
      return null;
    }
    const e = this.entities.get(this.locateId);
    if (!e) {
      this.locateId = null;
      return null;
    }
    return { x: e.ix, y: e.iy };
  }

  // ── the day loop's diegetic state ───────────────────────────────────────────────

  setDayPhase(phase01: number) {
    this.dayPhase = Math.max(0, Math.min(1, phase01));
  }

  setVitality(v01: number) {
    this.vitality = Math.max(0, Math.min(1, v01));
  }

  /** Returns true when the level actually changed (the renderer only re-thins the bushes then). */
  setScarcity(level01: number): boolean {
    const s = Math.max(0, Math.min(1, level01));
    if (Math.abs(s - this.scarcity) < 0.01 && this.scarcity !== 0) return false;
    this.scarcity = s;
    return true;
  }

  /** Deterministic bush thinning: bush i disappears once scarcity passes its own threshold, so lean
   *  days visibly empty the island and recovery refills it. The hash must stay bit-exact. */
  bushVisible(i: number, s: number): boolean {
    const threshold = ((i * 2654435761) >>> 0) / 4294967296;
    return s < 0.25 || threshold > s * 0.7;
  }

  /** Survivors dry toward straw as scarcity deepens. */
  bushTint(s: number): number {
    const t = Math.min(1, s * 0.8);
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    return (lerp(0xff, 0xd8) << 16) | (lerp(0xff, 0xc4) << 8) | lerp(0xff, 0x9a);
  }

  /** Self-avatar tint from vitality: full colour above half, cooling toward a wan grey-blue as it
   *  falls. The body IS the meter — no red bar anywhere. */
  vitalityTint(): number {
    const v = Math.max(0, Math.min(1, this.vitality));
    if (v >= 0.5) return 0xffffff;
    const t = 1 - v / 0.5;
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    return (lerp(0xff, 0x8e) << 16) | (lerp(0xff, 0xa4) << 8) | lerp(0xff, 0xc2);
  }

  /** The sky's light over the day: clear at midday, amber toward dusk, a deep blue-dark at
   *  nightfall. Pure ramp; the renderer decides how to apply it. */
  ambientFor(p: number): { color: number; alpha: number } {
    if (p < 0.12) return { color: 0xffc98a, alpha: 0.1 * (1 - p / 0.12) };
    if (p > 0.62 && p <= 0.85) return { color: 0xff9a3d, alpha: 0.16 * ((p - 0.62) / 0.23) };
    if (p > 0.85) return { color: 0x1a2440, alpha: 0.16 + 0.3 * ((p - 0.85) / 0.15) };
    return { color: 0x000000, alpha: 0 };
  }

  // ── particles ───────────────────────────────────────────────────────────────────

  /** Spawn a few activity particles at a tile position. Capped so a long build can't leak. */
  spawnParticles(tileX: number, tileY: number, color: number, n: number, spread: number) {
    if (this.particles.length > 80) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + this.particles.length;
      this.particles.push({
        x: tileX + Math.cos(ang) * 0.12,
        y: tileY,
        vx: Math.cos(ang) * spread * 0.06,
        vy: -spread * 0.036 - (i % 3) * 0.25,
        life: 0.5 + (i % 3) * 0.15,
        max: 0.8,
        color,
      });
    }
  }

  stepParticles(dt: number) {
    if (this.particles.length === 0) return;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += 2.5 * dt; // gravity, in tiles/s²
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      next.push(p);
    }
    this.particles = next;
  }

  // ── the locomotion drain ────────────────────────────────────────────────────────

  /**
   * Drain the passive sampler's window. The consumer (activities/sampler.ts) throttles and batches.
   * `sampVisited` is deliberately NOT reset: "new tile" means new to this session, not new to this
   * 1.5s window, or the explore ratio would read ~1.0 forever.
   */
  sampleLocomotion(): { activeMs: number; stillMs: number; distance: number; headingVar: number; speedVar: number; exploreRatio: number } {
    const speeds = this.sampSpeeds;
    let speedVar = 0;
    if (speeds.length > 1) {
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const v = speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
      speedVar = Math.min(1, Math.sqrt(v) / WORLD.MOVE_SPEED);
    }
    const headingVar = Math.min(1, this.sampHeadingChanges / Math.max(1, this.sampDist));
    const exploreRatio = this.sampStepTiles > 0 ? this.sampNewTiles / this.sampStepTiles : 0;
    const out = { activeMs: this.sampMs, stillMs: this.sampStillMs, distance: this.sampDist, headingVar, speedVar, exploreRatio };
    this.sampMs = 0; this.sampStillMs = 0; this.sampDist = 0; this.sampHeadingChanges = 0;
    this.sampSpeeds = []; this.sampNewTiles = 0; this.sampStepTiles = 0;
    return out;
  }

  // ── the frame ───────────────────────────────────────────────────────────────────

  /** One simulation step. The renderer calls this, then draws. Order is load-bearing:
   *  detectProximity reads the interpolated positions stepRemotes just wrote.
   *
   *  dt is the raw render-frame delta, NOT clamped and NOT fixed — because the AUTHORITATIVE server
   *  integrates at exactly this shape (WorldRoom.tick: `dt = dtMs/1000`, variable, no clamp). A
   *  clamp or a fixed step here would make the client integrate differently from the server on any
   *  hitched frame, which is divergence we would then have to reconcile away. The real guard against
   *  a backgrounded tab is clearing the keys on blur (the renderer does that), not capping dt. */
  step(dtMs: number) {
    const dt = dtMs / 1000;
    this.stepLocal(dt);
    this.stepRemotes();
    this.detectProximity(dt);
    this.detectPortal();
    this.stepActivities();
    this.stepParticles(dt);
  }
}
