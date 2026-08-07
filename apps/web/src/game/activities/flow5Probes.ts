/**
 * Flow 5 — the two Ring-of-Gyges probes as PERFORMED activities.
 *
 * Why this is its own controller and not two more Flow1Beats specs: `Flow1Beats.mode === "hold"` only
 * emits when the hold COMPLETES (`holdMs >= needMs`). For F5 the partial performance is the whole
 * measurement. A gull half freed and abandoned, and a cache dug a third of the way and left, are the
 * readings that separate people; a controller that only fires on completion would throw them away and
 * leave the beat as a disguised binary again.
 *
 * So this one emits on LEAVING, with whatever progress was actually made, and it samples the approach
 * as well as the act. See docs/world-design/f5-beats.md for the beat table and the routing decisions.
 *
 * WHAT IS MEASURED, AND WHAT IS DELIBERATELY NOT ROUTED. `latency_ms`, `persist_after_fail`,
 * `thoroughness01`, `dwell_ms` and `taken01` land on existing anchored features. `cost_paid01`,
 * `approach_detour01`, `circled01` and `dwell_at_marker_ms` are carried in raw_signals for the next
 * re-anchor's corpus and are NOT routed, because no existing feature's definition fits them. That is
 * flagged in known-gaps rather than attached to the nearest plausible loading, which is the silent
 * re-route the cross-cutting rule forbids. `circled01` in particular is the behavioural definition of
 * the unobserved self and is exactly the one with nowhere clean to go.
 *
 * Law 2 is preserved: walking past emits nothing. Only an act is measured.
 * No points, no score, no bar, no timer. The gull's posture and the cache's emptiness are the progress.
 */
import type { ThreeWorld } from "../ThreeWorld";
import {
  buildFlow1Event, FLOW5_PROBES, FLOW5_CUES,
  type BehavioralEvent, type EntitySnapshot,
} from "@echo/shared";

export type ProbeKind = "gull" | "cache";

export interface Flow5ProbesConfig {
  world: ThreeWorld;
  /** Which probe is live this session, and under which condition. Chosen by the existing P7 director. */
  probe: ProbeKind;
  privacy: "public" | "private";
  /** Home-island centre, for egocentric placement. */
  home: { x: number; y: number };
  /** Snap an egocentric offset to walkable land (the scene owns the map). */
  place: (dx: number, dy: number) => { x: number; y: number };
  actorId: () => string;
  sessionId: () => string;
  send: (events: BehavioralEvent[]) => void;
  addEntity: (snap: EntitySnapshot, heightPx?: number) => void;
  setEntitySprite: (id: string, spriteUrl: string, heightPx?: number) => void;
  /** Real cost: the gull's work drains vitality. The caller owns the day loop's vitality. */
  spendVitality?: (amount: number) => void;
  onWhisper?: (t: string | null) => void;
  onPrompt?: (t: string | null) => void;
  idPrefix?: string;
}

const RANGE = 1.6;
/** Approach sampling starts when the player first comes within this of the probe. */
const AWARE = 9;

interface Approach {
  started: boolean;
  startAt: { x: number; y: number } | null;
  startT: number;
  pathLen: number;
  last: { x: number; y: number } | null;
  /** Cumulative |change in bearing| from the probe, in radians. A direct walk sweeps almost none. */
  angleSweep: number;
  lastBearing: number | null;
}

export class Flow5Probes {
  private cfg: Flow5ProbesConfig;
  private raf = 0;
  private lastT = 0;
  private disposed = false;
  private actionDown = false;
  private ownsActivity = false;

  private spot = { x: 0, y: 0 };
  private markerSpot = { x: 0, y: 0 };
  private ids: { probe: string; marker: string; witness: string };

  private ap: Approach = { started: false, startAt: null, startT: 0, pathLen: 0, last: null, angleSweep: 0, lastBearing: null };
  /** ms adjacent to the owner's mark before any dig input. Hesitation in the presence of ownership. */
  private markerDwellMs = 0;
  /** ms in range before the first act input: deliberation. */
  private nearMs = 0;
  private workMs = 0;
  private slips = 0;
  private stage = 0;
  private acted = false;
  private emitted = false;
  private covering = 0;
  private vitalitySpent = 0;

  constructor(cfg: Flow5ProbesConfig) {
    this.cfg = cfg;
    const p = cfg.idPrefix ?? "probe_";
    this.ids = { probe: `${p}${cfg.probe}`, marker: `${p}cache_mark`, witness: `${p}witness` };
  }

  /** The client-local entities this probe puts on the island. Merged into every snapshot by the scene. */
  entities(): EntitySnapshot[] {
    const P = FLOW5_PROBES;
    const out: EntitySnapshot[] = [];
    const cfgSpot = this.cfg.probe === "gull" ? P.gull.spot : P.cache.spot;
    this.spot = this.cfg.place(cfgSpot.dx, cfgSpot.dy);
    out.push({
      id: this.ids.probe, kind: "npc", refId: this.ids.probe,
      name: this.cfg.probe === "gull" ? "a gull, tangled in the trap line" : "a cache, another's mark on it",
      spriteUrl: this.cfg.probe === "gull" ? P.sprites.gull : P.sprites.cache,
      x: this.spot.x, y: this.spot.y, facing: "down", moving: false, role: "flow5", status: "none",
    });
    if (this.cfg.probe === "cache") {
      this.markerSpot = this.cfg.place(P.cache.markerSpot.dx, P.cache.markerSpot.dy);
      out.push({
        id: this.ids.marker, kind: "npc", refId: this.ids.marker, name: "the owner's mark",
        spriteUrl: P.sprites.marker, x: this.markerSpot.x, y: this.markerSpot.y,
        facing: "down", moving: false, role: "flow5", status: "none",
      });
    }
    // The public condition puts a witness in SIGHT but outside the CLOSE <= 2.0 gate, so being seen is
    // a fact about the situation and never a conversation.
    if (this.cfg.privacy === "public") {
      out.push({
        id: this.ids.witness, kind: "npc", refId: this.ids.witness, name: "someone, further up the shore",
        spriteUrl: "", x: this.spot.x + P.witnessOffset.dx, y: this.spot.y + P.witnessOffset.dy,
        facing: "down", moving: false, role: "flow5_witness", status: "none",
      });
    }
    return out;
  }

  start() {
    const P = FLOW5_PROBES;
    this.cfg.addEntity(
      this.entities()[0],
      this.cfg.probe === "gull" ? P.displayH.gull : P.displayH.cache,
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.lastT = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = now - this.lastT;
      this.lastT = now;
      this.tick(Math.min(dt, 100));
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    // Leaving mid-work is itself a reading, so flush it rather than dropping it.
    this.flushIfActed();
    if (this.ownsActivity) this.releaseActivity();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === " " || e.key.toLowerCase() === "e") this.actionDown = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " " || e.key.toLowerCase() === "e") this.actionDown = false;
  };
  private onBlur = () => { this.actionDown = false; };

  private claimActivity(kind: "dig" | "gather", intensity = 1) {
    this.cfg.world.setSelfActivityState(kind as never, { intensity });
    this.ownsActivity = true;
  }
  private releaseActivity() {
    this.cfg.world.setSelfActivityState(null);
    this.ownsActivity = false;
  }

  private dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private tick(dtMs: number) {
    if (this.emitted) return;
    const self = this.cfg.world.getSelfTile();
    const P = FLOW5_PROBES;
    const d = this.dist(self, this.spot);

    // ── sample the approach: how the player got here is half the reading ──
    if (d < AWARE) {
      if (!this.ap.started) {
        this.ap.started = true;
        this.ap.startAt = { ...self };
        this.ap.startT = performance.now();
        this.ap.last = { ...self };
      } else if (this.ap.last) {
        const step = this.dist(self, this.ap.last);
        if (step > 0.01) {
          this.ap.pathLen += step;
          // bearing FROM the probe TO the player: a direct walk holds it nearly constant, a circling
          // one sweeps it. This is the "did they look around first" tell, carried unrouted.
          const bearing = Math.atan2(self.y - this.spot.y, self.x - this.spot.x);
          if (this.ap.lastBearing !== null) {
            let db = Math.abs(bearing - this.ap.lastBearing);
            if (db > Math.PI) db = 2 * Math.PI - db;
            this.ap.angleSweep += db;
          }
          this.ap.lastBearing = bearing;
          this.ap.last = { ...self };
        }
      }
    }

    const inReach = d < RANGE;
    if (inReach && !this.acted) this.nearMs += dtMs;

    if (this.cfg.probe === "gull") this.tickGull(dtMs, inReach);
    else this.tickCache(dtMs, self, inReach);

    // Walking away after having acted is the ending. Emit what was actually performed.
    if (this.acted && !inReach && d > RANGE + 1.2) this.flushIfActed();
  }

  // ── the gull: hold to work the line, it struggles and slips, the release is progressive ──
  private tickGull(dtMs: number, inReach: boolean) {
    const G = FLOW5_PROBES.gull;
    if (inReach && !this.acted) {
      this.cfg.onPrompt?.("work the line free — hold [space]");
    }
    const holding = this.actionDown && inReach;
    if (holding) {
      if (!this.acted) {
        this.acted = true;
        this.cfg.onPrompt?.(null);
        this.cfg.onWhisper?.("the line is wound tight around one wing. it fights you.");
      }
      this.workMs += dtMs;
      this.claimActivity("gather", 1);
      // real cost, drained as you work
      const spend = (dtMs / G.freeMs) * G.vitalityCost;
      this.vitalitySpent += spend;
      this.cfg.spendVitality?.(spend);
      // the line resists at fixed fractions of the work
      const frac = this.workMs / G.freeMs;
      const nextSlip = G.slipsAt[this.slips];
      if (nextSlip !== undefined && frac > nextSlip) {
        this.slips++;
        this.actionDown = false; // the hold is genuinely broken; it has to be re-taken
        this.cfg.onWhisper?.("the bird thrashes and the line tears out of your hands. you take it again.");
      }
      // the posture opens stage by stage: the silhouette is the progress
      const st = Math.min(G.stages, Math.floor(frac * G.stages));
      if (st > this.stage) {
        this.stage = st;
        if (st >= G.stages) {
          this.cfg.setEntitySprite(this.ids.probe, FLOW5_PROBES.sprites.gullFree, FLOW5_PROBES.displayH.gull);
          this.cfg.onWhisper?.("the last loop slides off. it startles away across the water. nothing marks that this happened.");
          this.flushIfActed();
        }
      }
    } else if (this.ownsActivity) {
      this.releaseActivity();
    }
  }

  // ── the cache: two spots, one key. dig at the mound, or walk to the mark and cover it over ──
  private tickCache(dtMs: number, self: { x: number; y: number }, inReach: boolean) {
    const C = FLOW5_PROBES.cache;
    const dm = this.dist(self, this.markerSpot);
    // reading the mark happens in the body: you have to close to see whose it is
    if (dm < C.markReadRange && !this.acted) {
      this.markerDwellMs += dtMs;
      this.cfg.onPrompt?.("press the mark back and cover it over — hold [space]");
    } else if (inReach && !this.acted) {
      this.cfg.onPrompt?.("dig — hold [space]");
    }

    // covering it over, at the marker stone
    if (this.actionDown && dm < C.markReadRange && this.stage === 0) {
      this.covering += dtMs;
      this.claimActivity("dig", 0.6);
      if (this.covering >= C.coverMs) {
        this.acted = true;
        this.cfg.onWhisper?.("you press the mark back into the sand and cover the mound over, mark up.");
        this.emit("return_cache", "take");
      }
      return;
    }

    // digging, at the mound
    const holding = this.actionDown && inReach;
    if (holding) {
      if (!this.acted) {
        this.acted = true;
        this.cfg.onPrompt?.(null);
      }
      this.workMs += dtMs;
      this.claimActivity("dig", 1);
      const frac = Math.min(1, this.workMs / C.digMs);
      const st = Math.min(C.stages, Math.floor(frac * C.stages));
      if (st > this.stage) {
        this.stage = st;
        this.cfg.setEntitySprite(this.ids.probe, FLOW5_PROBES.sprites.cacheOpen, FLOW5_PROBES.displayH.cache);
        if (st >= C.stages) {
          this.cfg.onWhisper?.("it is empty now. the mark stays under the sand.");
          this.flushIfActed();
        }
      }
    } else if (this.ownsActivity) {
      this.releaseActivity();
    }
  }

  /** Emit whatever was actually performed, once. Partial performances are the point. */
  private flushIfActed() {
    if (this.emitted || !this.acted) return;
    if (this.cfg.probe === "gull") {
      const G = FLOW5_PROBES.gull;
      const thoroughness = Math.min(1, this.workMs / G.freeMs);
      // Abandoned means: work started, release incomplete, and the player left. It routes through the
      // existing abandon branch (time NOT spent reads as leisure/avoidance, an own-axis read).
      this.emit(thoroughness >= 1 ? "help_at_cost" : "abandon_free_gull", thoroughness >= 1 ? "take" : "refuse");
    } else {
      this.emit("keep_cache", "refuse");
    }
  }

  private emit(action: string, polarity: "take" | "refuse") {
    if (this.emitted) return;
    this.emitted = true;
    this.releaseActivity();
    this.cfg.onPrompt?.(null);
    const uid = this.cfg.actorId();
    if (!uid) return;

    const G = FLOW5_PROBES.gull;
    const C = FLOW5_PROBES.cache;
    const straight = this.ap.startAt ? this.dist(this.ap.startAt, this.spot) : 0;
    // >0 when the path was longer than the straight line: a detour toward, or around, the probe.
    const detour01 = straight > 0.5 ? Math.min(1, Math.max(0, this.ap.pathLen / straight - 1)) : 0;
    // a direct approach sweeps almost no bearing; a circling one sweeps toward pi and beyond
    const circled01 = Math.min(1, this.ap.angleSweep / Math.PI);

    const raw: Record<string, unknown> =
      this.cfg.probe === "gull"
        ? {
            // routed
            decision_latency_ms: Math.round(this.nearMs),
            persist_after_fail: this.slips > 0 ? Math.min(1, 0.55 + 0.15 * this.slips) : undefined,
            thoroughness01: Math.min(1, this.workMs / G.freeMs),
            dwell_ms: Math.round(this.workMs),
            // carried, NOT routed (see known-gaps ⚑13)
            cost_paid01: Math.min(1, this.vitalitySpent / G.vitalityCost),
            approach_detour01: detour01,
            slips: this.slips,
          }
        : {
            // routed
            decision_latency_ms: Math.round(this.nearMs),
            dwell_ms: Math.round(this.workMs + this.covering),
            taken01: Math.min(1, this.workMs / C.digMs),
            // carried, NOT routed (see known-gaps ⚑13)
            circled01,
            dwell_at_marker_ms: Math.round(this.markerDwellMs),
            approach_detour01: detour01,
          };
    for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];

    const def = (FLOW5_CUES as Record<string, { channel: string; cue: string; targetKind: string }>)[
      action === "help_at_cost" || action === "abandon_free_gull" ? "free_gull"
      : action === "return_cache" ? "cover_cache" : "take_cache"
    ];
    const ev = buildFlow1Event({
      actorId: uid, sessionId: this.cfg.sessionId(),
      channel: (def?.channel ?? "H") as never, cue: (def?.cue ?? "H9") as never,
      action, polarity,
      targetId: this.ids.probe, targetKind: (def?.targetKind ?? "resource") as never,
      stakes: "high", raw,
    });
    // The privacy condition is the thesis of F5, so it rides on the context the conditional buckets
    // already read. `private` is audience 0; `public` is the one witness up the shore.
    ev.context = {
      ...ev.context,
      public_or_private: this.cfg.privacy,
      audience_size: this.cfg.privacy === "public" ? 1 : 0,
    };
    this.cfg.send([ev]);
  }
}
