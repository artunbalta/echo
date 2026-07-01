/**
 * Flow-1 orchestrator (ECHO_level_design_7flows.md §FLOW 1). Places every F1 embodied-activity object on
 * the player's own island and runs the controllers — the flagship raft build (RaftBuild), the remaining
 * beats (Flow1Beats: plant-vs-eat, gamble cave, marker study, buried cache, shy creature) and the
 * continuous passive sampler (LocomotionSampler). One shared implementation so the isolated /flow1 slice
 * and the canonical /play own-island seep behave identically. Everything is CLIENT-LOCAL and routes
 * through the proven /observe/behavioral ingress (buildFlow1Event, solo context). Zero-key, procedural
 * animation, backend math untouched.
 */
import type { PixiWorld } from "../PixiWorld";
import type { TileMap } from "../tilemap";
import { RaftBuild, type RaftPhase } from "./raftBuild";
import { Flow1Beats, type BeatSpec } from "./flow1Beats";
import { LocomotionSampler } from "./sampler";
import { RAFT_BUILD, type BehavioralEvent, type EntitySnapshot } from "@echo/shared";

export interface Flow1SceneHooks {
  onWhisper?: (t: string | null) => void;
  /** The single contextual prompt (raft "pick" OR a beat prompt — the scene shows the active one). */
  onPrompt?: (t: string | null) => void;
  /** The driftwood counter (null when not gathering). */
  onCounter?: (g: { gathered: number; needed: number } | null) => void;
  onPhase?: (p: RaftPhase) => void;
  /** Raft launched (F1→F2 seam) — the caller unlocks sailing (client-side solo, or net.sendSetSail in /play). */
  onLaunched?: () => void;
}

export interface Flow1SceneOpts {
  world: PixiWorld;
  map: TileMap;
  home: { x: number; y: number };
  actorId: () => string;
  sessionId: () => string;
  send: (events: BehavioralEvent[]) => void;
  hooks?: Flow1SceneHooks;
  /** Prefix for client-local entity ids (default "f1_"); keeps them distinct from room entities. */
  idPrefix?: string;
}

/** Beat props laid out inland (away from the shore raft zone so their inputs never overlap). Egocentric
 *  tile offsets from the home centre; snapped to walkable land at placement. */
const BEAT_LAYOUT = {
  fertile_patch: { dx: 4, dy: -2 },
  berry_bush: { dx: 7, dy: -1 },
  gamble_cave: { dx: -3, dy: -5 },
  marker_stone: { dx: 2, dy: -4 },
  buried_cache: { dx: 5, dy: -5 },
  creature: { dx: -1, dy: -2 },
};

export class Flow1Scene {
  private raft: RaftBuild | null = null;
  private beats: Flow1Beats | null = null;
  private sampler: LocomotionSampler | null = null;
  private pickPrompt: string | null = null;
  private beatPrompt: string | null = null;
  private seedUsed = false;
  /** The LIVE set of client-local F1 entities. In /play this is re-merged into every server snapshot,
   *  so the controllers MUST mutate it (not raw world.add/remove) or a pick would be undone next tick. */
  private liveMap = new Map<string, EntitySnapshot>();

  constructor(private o: Flow1SceneOpts) {}

  private removeEntityImpl = (id: string) => {
    this.o.world.removeEntity(id);
    this.liveMap.delete(id);
  };
  private addEntityImpl = (snap: EntitySnapshot, px?: number) => {
    this.liveMap.set(snap.id, snap);
    this.o.world.addEntity(snap);
    if (px) this.o.world.setEntityDisplayHeight(snap.id, px);
  };
  /** Current client-local F1 entities. /play merges this into every snapshot so add/remove persist. */
  liveEntities(): EntitySnapshot[] { return [...this.liveMap.values()]; }

  private p = (dx: number, dy: number) => nearestWalkable(this.o.map, this.o.home.x + dx, this.o.home.y + dy);
  private pre = (s: string) => `${this.o.idPrefix ?? "f1_"}${s}`;

  /** The client-local entity snapshots to place (driftwood + beat props). The caller renders them via its
   *  own client-local mechanism (applySnapshot for the isolated scene; the f0/f1 merge set for /play). */
  entities(): { snaps: EntitySnapshot[]; heights: { id: string; px: number }[] } {
    const used = new Set<string>();
    const snapUnique = (dx: number, dy: number) => {
      let q = this.p(dx, dy);
      let g = 0;
      while (used.has(`${q.x},${q.y}`) && g++ < 12) q = nearestWalkable(this.o.map, q.x + (g % 2 ? 1 : -1), q.y + (g % 3 ? 1 : 0));
      used.add(`${q.x},${q.y}`);
      return q;
    };
    const snaps: EntitySnapshot[] = [];
    const heights: { id: string; px: number }[] = [];
    const add = (id: string, sprite: string, x: number, y: number, px?: number) => {
      // role "flow1" marks these as embodied-activity props: the /play WorldClient skips them in its
      // proximity/menu system so its chat/menu never fights the Flow1Scene controllers' own input.
      snaps.push({ id, kind: "npc", refId: id, name: "", spriteUrl: sprite, x, y, facing: "down", moving: false, role: "flow1", status: "none" });
      if (px) heights.push({ id, px });
    };

    // raft driftwood
    this.woodPos = RAFT_BUILD.driftwoodOffsets.map((off, i) => {
      const q = snapUnique(off.dx, off.dy);
      const id = this.pre(`wood_${i}`);
      add(id, RAFT_BUILD.sprites.driftwood, q.x, q.y, RAFT_BUILD.displayH.driftwood);
      return { id, x: q.x, y: q.y };
    });
    this.assembly = this.p(RAFT_BUILD.assemblySpot.dx, RAFT_BUILD.assemblySpot.dy);
    this.launch = this.p(RAFT_BUILD.launchSpot.dx, RAFT_BUILD.launchSpot.dy);

    // beat props
    const bp: Record<string, { x: number; y: number }> = {};
    for (const [k, off] of Object.entries(BEAT_LAYOUT)) {
      const q = snapUnique(off.dx, off.dy);
      bp[k] = q;
    }
    this.beatPos = bp;
    add(this.pre("fertile_patch"), "proc:fertile_patch", bp.fertile_patch.x, bp.fertile_patch.y, 20);
    add(this.pre("berry_bush"), "proc:berry_bush", bp.berry_bush.x, bp.berry_bush.y, 20);
    add(this.pre("gamble_cave"), "proc:gamble_cave", bp.gamble_cave.x, bp.gamble_cave.y, 30);
    add(this.pre("marker_stone"), "proc:marker_stone", bp.marker_stone.x, bp.marker_stone.y, 22);
    add(this.pre("buried_cache"), "proc:buried_cache", bp.buried_cache.x, bp.buried_cache.y, 16);

    this.entityHeights = heights;
    for (const s of snaps) this.liveMap.set(s.id, s); // seed the live set with the initial props
    return { snaps, heights };
  }

  private woodPos: { id: string; x: number; y: number }[] = [];
  private assembly = { x: 0, y: 0 };
  private launch = { x: 0, y: 0 };
  private beatPos: Record<string, { x: number; y: number }> = {};

  private refreshPrompt() {
    // the raft "pick" prompt takes priority while gathering; else the nearest beat's prompt
    this.o.hooks?.onPrompt?.(this.pickPrompt ?? this.beatPrompt);
  }

  /** Start the controllers. Call AFTER entities() have been placed + rendered. Idempotent (a reconnect
   *  can re-fire welcome). */
  begin() {
    if (this.raft) return;
    for (const h of this.entityHeights) this.o.world.setEntityDisplayHeight(h.id, h.px);

    this.raft = new RaftBuild({
      world: this.o.world, wood: this.woodPos, assembly: this.assembly,
      launch: this.launch, raftId: this.pre("raft"), needed: RAFT_BUILD.needed,
      actorId: this.o.actorId, sessionId: this.o.sessionId, send: this.o.send,
      removeEntity: this.removeEntityImpl, addEntity: this.addEntityImpl,
      onWhisper: (t) => this.o.hooks?.onWhisper?.(t),
      onPhase: (p) => this.o.hooks?.onPhase?.(p),
      onNearWood: (id) => { this.pickPrompt = id ? "pick up the driftwood — press [space]" : null; this.refreshPrompt(); },
      onProgress: (g) => this.o.hooks?.onCounter?.(g.gathered >= 0 ? { gathered: g.gathered, needed: g.needed } : null),
      onLaunched: this.o.hooks?.onLaunched,
    });
    this.raft.start();

    const bp = this.beatPos;
    const seedEnabled = () => !this.seedUsed;
    const useSeed = () => { this.seedUsed = true; };
    const beats: BeatSpec[] = [
      { id: this.pre("fertile_patch"), pos: bp.fertile_patch, mode: "press", anim: "plant",
        prompt: "plant the seed here — press [space]", action: "plant_seed",
        reveal: "you press the seed into the tilled earth. it will be a while — but more, later.",
        enabled: seedEnabled, onDone: useSeed },
      { id: this.pre("berry_bush"), pos: bp.berry_bush, mode: "press", anim: "gather",
        prompt: "eat now — press [space]", action: "eat_now",
        reveal: "you eat the berries. small, sweet, gone.", enabled: seedEnabled, onDone: useSeed },
      { id: this.pre("gamble_cave"), pos: bp.gamble_cave, mode: "press", anim: "still",
        prompt: "enter the dark cave — press [space]", action: "enter_cave", leaveAction: "stay_safe",
        reveal: "you step into the dark. the air changes." },
      { id: this.pre("marker_stone"), pos: bp.marker_stone, mode: "dwell", anim: "study",
        prompt: "study the standing stone — press [space]", action: "study_marker",
        reveal: "the weathered glyph resolves under your gaze: a mark, and a direction.", needMs: 2600 },
      { id: this.pre("buried_cache"), pos: bp.buried_cache, mode: "hold", anim: "dig",
        prompt: "dig here — hold [space]", action: "dig_cache", needMs: 3600, fails: 2,
        reveal: "the spade strikes something hollow. you uncover it — not treasure, but a quiet, good view." },
    ];
    this.beats = new Flow1Beats({
      world: this.o.world, beats, addEntity: this.addEntityImpl,
      actorId: this.o.actorId, sessionId: this.o.sessionId, send: this.o.send,
      onWhisper: (t) => this.o.hooks?.onWhisper?.(t),
      onPrompt: (t) => { this.beatPrompt = t; this.refreshPrompt(); },
      stillness: { creatureId: this.pre("creature"), near: bp.creature, stillMs: 8000 },
    });
    this.beats.start();

    this.sampler = new LocomotionSampler({
      world: this.o.world, actorId: this.o.actorId, sessionId: this.o.sessionId, send: this.o.send, stage: 1,
    });
    this.sampler.start();
  }

  private entityHeights: { id: string; px: number }[] = [];

  dispose() {
    this.raft?.abandonIfUnfinished();
    this.raft?.dispose();
    this.beats?.dispose();
    this.sampler?.stop();
  }
}

/** Nearest WALKABLE LAND tile (land + not blocked), spiral search — shared with Flow1Client. */
function nearestWalkable(map: TileMap, x: number, y: number, maxR = 8): { x: number; y: number } {
  const w = map.width, h = map.height;
  const walk = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
    const idx = ty * w + tx;
    return (!map.water || map.water[idx] === 0) && (!map.collision || map.collision[idx] === 0);
  };
  const rx = Math.round(x), ry = Math.round(y);
  if (walk(rx, ry)) return { x: rx, y: ry };
  for (let r = 1; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walk(rx + dx, ry + dy)) return { x: rx + dx, y: ry + dy };
      }
  return { x: rx, y: ry };
}
