/**
 * Flow 4 — "Repeated Games & Trust", the four beats as PERFORMED activities.
 *
 * See docs/world-design/f4-beats.md for the beat table and the routing decisions, and flow4.ts for
 * the cue vocabulary. What matters about this file is what it refuses to do.
 *
 * NO MENU EVER APPEARS. F4's beats are written in the level design as decisions — a promise kept or
 * broken, a conflict forgiven or retaliated or withdrawn from or repaired, generosity given or
 * withheld. Four named branches invite four buttons, and a button cannot individuate people. So
 * every branch here is INFERRED FROM WHAT THE BODY DID:
 *
 *   leaving something at their post              IS repair
 *   taking back from the emptied cache           IS retaliation
 *   coming close, settling there, doing nothing  IS forgiveness
 *   stopping short of them and turning away      IS withdrawal
 *   arriving at all, the session after you said you would  IS keeping the promise
 *
 * And every beat emits CONTINUOUS manner scalars that survive holding the branch fixed, because the
 * test each beat had to pass is: if both personas take the same branch, is there still something to
 * measure? Two players who both keep the promise still differ in how soon they set out, how straight
 * they walked, and how much of their own business they did first.
 *
 * WHAT IS ROUTED AND WHAT IS FLAGGED. `decision_latency_ms`, the cooperation rate, promise-kept,
 * `repair_hold01`, `trips` and `gift_amount01` land on features whose definitions genuinely fit.
 * `response_to_defect01`, `settle_distance`, `circled01`, `return_directness01`, `detoured_first01`,
 * `unprompted`, `stake_amount01` and `cost_paid01` are carried in raw_signals for the second
 * re-anchor's corpus and are NOT routed. `response_to_defect01` is the one that stings: the
 * iterated-game signature is F4's whole reason to exist and it is exactly the cue with nowhere clean
 * to go, the same shape as F5's `circled01`. Inventing a loading for it would be the silent re-route
 * the cross-cutting rule forbids.
 *
 * No points, no score, no bar, no timer, no tally of kept promises. The cache's silhouette and the
 * distance you stop at are the only things that show state.
 */
import type { ThreeWorld } from "../ThreeWorld";
import {
  buildFlow1Event, FLOW4_CUES, FLOW4_SCENE,
  type BehavioralEvent, type EntitySnapshot, type Flow4Beat,
} from "@echo/shared";

export interface Flow4TrustConfig {
  world: ThreeWorld;
  /** Which beat is live this session. One at a time, so a capture drives exactly one cell. */
  beat: Flow4Beat;
  /** The recurring partner's counterpart id — the key tieWarmth and promisedTo are stored under. */
  partnerId: string;
  home: { x: number; y: number };
  place: (dx: number, dy: number) => { x: number; y: number };
  actorId: () => string;
  sessionId: () => string;
  send: (events: BehavioralEvent[]) => void;
  addEntity: (snap: EntitySnapshot, heightPx?: number) => void;
  setEntitySprite: (id: string, spriteUrl: string, heightPx?: number) => void;
  /** Real cost: carrying and giving drains vitality. The caller owns the day loop's vitality. */
  spendVitality?: (amount: number) => void;
  /** WORLD state, not the posterior: the island remembering who you tended. */
  onTendTie?: (delta: number) => void;
  /** The promise, persisted in island state so the return beat spans real sessions. */
  onPromiseMade?: () => void;
  onPromiseResolved?: (kept: boolean) => void;
  onWhisper?: (t: string | null) => void;
  onPrompt?: (t: string | null) => void;
  idPrefix?: string;
}

type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

interface Approach {
  started: boolean;
  startAt: Pt | null;
  pathLen: number;
  last: Pt | null;
  angleSweep: number;
  lastBearing: number | null;
}

const freshApproach = (): Approach => ({
  started: false, startAt: null, pathLen: 0, last: null, angleSweep: 0, lastBearing: null,
});

export class Flow4Trust {
  private cfg: Flow4TrustConfig;
  private raf = 0;
  private lastT = 0;
  private disposed = false;
  private actionDown = false;
  private ownsActivity = false;

  private spots: Record<string, Pt> = {};
  private ids: Record<string, string>;

  /** ms since the beat began. Every latency in F4 is measured from here, not from a prompt. */
  private beatMs = 0;
  private ap = freshApproach();
  private emitted = false;

  // ── the return ──
  private moved = false;
  private arrivedMs: number | null = null;
  private errandMs = 0;
  private reminded = false;
  private promiseHoldMs = 0;

  // ── the exchange ──
  private round = 1;
  private roundStartMs = 0;
  private reachedCache = false;
  private carrying = false;
  private placeHoldMs = 0;
  private placeLatency: number | null = null;
  private amounts: number[] = [];
  private cooperated = 0;
  private defected = false;          // the partner has taken more than their share
  private defectSeenAtRound = 0;

  // ── the conflict ──
  private discoveredMs: number | null = null;
  private stoodAt: Pt | null = null;
  private lastSelf: Pt | null = null;
  private approachStartMs: number | null = null;
  private minDist = Infinity;
  private holdAtDist = new Map<number, number>();
  private settleDist: number | null = null;
  private repairHoldMs = 0;
  private retaliateHoldMs = 0;

  // ── generosity ──
  private trips = 0;
  private holdActive = false;
  private restMs = 0;
  private giveHoldMs = 0;
  private giveLatency: number | null = null;
  private atPostMs = 0;
  private vitalitySpent = 0;

  constructor(cfg: Flow4TrustConfig) {
    this.cfg = cfg;
    const p = cfg.idPrefix ?? "f4_";
    this.ids = {
      partner: `${p}partner`, post: `${p}post`, cache: `${p}cache`,
      store: `${p}store`, mark: `${p}mark`, errand0: `${p}errand0`, errand1: `${p}errand1`,
    };
  }

  /** The client-local entities this beat puts on the island. Merged into every snapshot by the scene. */
  entities(): EntitySnapshot[] {
    const S = FLOW4_SCENE;
    const out: EntitySnapshot[] = [];
    const at = (k: string, d: { dx: number; dy: number }) => (this.spots[k] = this.cfg.place(d.dx, d.dy));

    at("partner", S.partner);
    at("post", S.post);
    at("cache", S.cache);
    at("store", S.store);
    at("errand0", S.errands[0]);
    at("errand1", S.errands[1]);

    const npc = (id: string, name: string, url: string, sp: Pt, role: string): EntitySnapshot => ({
      id, kind: "npc", refId: id, name, spriteUrl: url,
      x: sp.x, y: sp.y, facing: "down", moving: false, role, status: "none",
    });

    // The partner is present for every beat EXCEPT non-reciprocal generosity, where the whole point
    // is that nobody sees and nothing can come back. Their post stays either way.
    if (this.cfg.beat !== "generosity") {
      out.push(npc(this.ids.partner, "someone you have met before", S.sprites.partner,
        this.spots.partner, "flow4_partner"));
    }
    out.push(npc(this.ids.post, "their post, the hollow worn smooth", S.sprites.post,
      this.spots.post, "flow4"));
    out.push(npc(this.ids.cache, "the cache you both put into",
      this.cfg.beat === "conflict" ? S.sprites.cache : S.sprites.cache, this.spots.cache, "flow4"));
    out.push(npc(this.ids.store, "your own store", S.sprites.store, this.spots.store, "flow4"));

    // The partner's mark, on the emptied cache. Nothing announces what happened; you find it.
    if (this.cfg.beat === "conflict") {
      out.push(npc(this.ids.mark, "their mark, on the empty cache", S.sprites.mark,
        { x: this.spots.cache.x + 1.1, y: this.spots.cache.y + 0.6 }, "flow4"));
    }
    // Your own errands, so "I got to it eventually" is a real path rather than an idle timer.
    if (this.cfg.beat === "return") {
      out.push(npc(this.ids.errand0, "berries, ripe", S.sprites.errand, this.spots.errand0, "flow4"));
      out.push(npc(this.ids.errand1, "berries, ripe", S.sprites.errand, this.spots.errand1, "flow4"));
    }
    return out;
  }

  start() {
    const S = FLOW4_SCENE;
    for (const e of this.entities()) {
      const h = e.id === this.ids.partner ? S.displayH.partner
        : e.id === this.ids.post ? S.displayH.post
        : e.id === this.ids.cache ? S.displayH.cache
        : e.id === this.ids.store ? S.displayH.store : S.displayH.errand;
      this.cfg.addEntity(e, h);
    }
    if (this.cfg.beat === "exchange") this.roundStartMs = 0;
    if (this.cfg.beat === "conflict") {
      this.cfg.onWhisper?.("the cache is open, and empty. their mark is pressed into the sand beside it.");
    }
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
    // Leaving mid-beat is itself a reading, so flush it rather than dropping it.
    this.flush();
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

  private claimActivity(kind: "dig" | "gather") {
    this.cfg.world.setSelfActivityState(kind as never, { intensity: 1 });
    this.ownsActivity = true;
  }
  private releaseActivity() {
    this.cfg.world.setSelfActivityState(null);
    this.ownsActivity = false;
  }

  /** Sample how the player got to a thing: half the reading is the approach, as in F5.
   *
   *  `whole` samples from the first frame instead of from the awareness radius. The return beat
   *  needs it: the errands are further from the partner than `aware`, so a radius-gated sampler only
   *  ever saw the last few tiles and reported a detoured return as perfectly direct. */
  private sampleApproach(self: Pt, target: Pt, dtMs: number, whole = false) {
    void dtMs;
    if (!whole && dist(self, target) >= FLOW4_SCENE.aware) return;
    if (!this.ap.started) {
      this.ap.started = true;
      this.ap.startAt = { ...self };
      this.ap.last = { ...self };
      return;
    }
    if (!this.ap.last) return;
    const step = dist(self, this.ap.last);
    if (step <= 0.01) return;
    this.ap.pathLen += step;
    // bearing FROM the target TO the player: a direct walk holds it nearly constant, a circling one
    // sweeps it. The "did they go around" tell, carried unrouted for the same reason F5's is.
    const bearing = Math.atan2(self.y - target.y, self.x - target.x);
    if (this.ap.lastBearing !== null) {
      let db = Math.abs(bearing - this.ap.lastBearing);
      if (db > Math.PI) db = 2 * Math.PI - db;
      this.ap.angleSweep += db;
    }
    this.ap.lastBearing = bearing;
    this.ap.last = { ...self };
  }

  private tick(dtMs: number) {
    if (this.emitted) return;
    this.beatMs += dtMs;
    const self = this.cfg.world.getSelfTile();
    switch (this.cfg.beat) {
      case "promise": return this.tickPromise(dtMs, self);
      case "return": return this.tickReturn(dtMs, self);
      case "exchange": return this.tickExchange(dtMs, self);
      case "conflict": return this.tickConflict(dtMs, self);
      case "generosity": return this.tickGenerosity(dtMs, self);
    }
  }

  // ── beat 1a: making the promise. An act, not a menu: a palm pressed to their post. ──
  private tickPromise(dtMs: number, self: Pt) {
    const R = FLOW4_SCENE.reach;
    const inReach = dist(self, this.spots.post) < R;
    if (inReach && this.promiseHoldMs === 0) this.cfg.onPrompt?.("press your palm to the post — hold [space]");
    if (this.actionDown && inReach) {
      this.promiseHoldMs += dtMs;
      this.claimActivity("gather");
      if (this.promiseHoldMs >= FLOW4_SCENE.return.promiseMs) {
        this.cfg.onPrompt?.(null);
        this.cfg.onWhisper?.("the wood is warm where other hands have been. tomorrow, then.");
        this.cfg.onPromiseMade?.();
        this.emit("promise_made", "take", { decision_latency_ms: Math.round(this.beatMs) },
          "make_promise", this.ids.post);
      }
    } else if (this.ownsActivity) this.releaseActivity();
  }

  // ── beat 1b: the return. Nothing prompts you. Whether, how soon, and how straight is the beat. ──
  private tickReturn(dtMs: number, self: Pt) {
    const S = FLOW4_SCENE;
    const partner = this.spots.partner;
    this.sampleApproach(self, partner, dtMs, true);
    if (!this.moved && this.ap.startAt && dist(self, this.ap.startAt) > 0.6) this.moved = true;

    // your own business, done first or not done first
    for (const k of ["errand0", "errand1"] as const) {
      if (dist(self, this.spots[k]) < S.reach + 0.6) this.errandMs += dtMs;
    }

    if (!this.reminded && this.beatMs > S.return.remindAfterMs) {
      this.reminded = true;
      // The world noticing, not a task nag: it never says "you promised".
      this.cfg.onWhisper?.("someone is still standing out by the post.");
    }

    if (this.arrivedMs === null && dist(self, partner) < S.reach + 0.4) {
      this.arrivedMs = this.beatMs;
      this.cfg.onWhisper?.("they look up. they do not say anything about it.");
      this.cfg.onTendTie?.(0.2);
      this.cfg.onPromiseResolved?.(true);
      this.emitReturn(true);
      return;
    }
    // Going away, after the world has noticed, without ever arriving.
    if (this.reminded && dist(self, partner) > S.return.leaveRadius) {
      this.cfg.onTendTie?.(-0.15);
      this.cfg.onPromiseResolved?.(false);
      this.emitReturn(false);
    }
  }

  private emitReturn(kept: boolean) {
    const straight = this.ap.startAt ? dist(this.ap.startAt, this.spots.partner) : 0;
    const elapsed = Math.max(1, this.arrivedMs ?? this.beatMs);
    this.emit(kept ? "promise_kept" : "promise_broken", kept ? "take" : "refuse", {
      // routed: the generic latency block, and consistency via the branch itself
      decision_latency_ms: Math.round(elapsed),
      // carried, NOT routed (⚑ — see f4-beats.md)
      return_latency_ms: Math.round(elapsed),
      return_directness01: this.ap.pathLen > 0.5 && straight > 0.5
        ? Math.max(0, Math.min(1, straight / this.ap.pathLen)) : 1,
      detoured_first01: Math.max(0, Math.min(1, this.errandMs / elapsed)),
      unprompted: !this.reminded,
      circled01: Math.min(1, this.ap.angleSweep / Math.PI),
    }, "keep_promise", this.ids.partner);
  }

  // ── beat 2: the repeated exchange. The PATTERN over rounds is the cue, never one round. ──
  private tickExchange(dtMs: number, self: Pt) {
    const S = FLOW4_SCENE;
    const cache = this.spots.cache;
    const atCache = dist(self, cache) < S.reach;
    // "You brought it here" — gated on CARRYING, not on presence. Standing at the cache with empty
    // hands after a round closed used to set this, and the next pickup at the store then read as
    // walking off with the stake before the player had gone anywhere.
    if (atCache && this.carrying) this.reachedCache = true;

    // Your stake is picked up by going and getting it. No hold, no button: proximity is the act.
    if (!this.carrying && dist(self, this.spots.store) < S.reach) {
      this.carrying = true;
      this.cfg.onPrompt?.("carry it to the cache and hold [space] — as much or as little as you like");
    }

    if (atCache && this.carrying && this.placeLatency === null && this.actionDown) {
      this.placeLatency = this.beatMs - this.roundStartMs;
    }
    if (this.actionDown && atCache && this.carrying) {
      this.placeHoldMs += dtMs;
      this.claimActivity("dig");
      const amt = Math.min(1, this.placeHoldMs / S.exchange.placeMs);
      this.cfg.setEntitySprite(this.ids.cache, S.sprites.cacheFull, S.displayH.cache);
      if (amt >= 1) this.closeRound(1);
    } else if (this.ownsActivity) this.releaseActivity();

    // You carried it all the way there and walked away with it. That is the round's other ending,
    // and it has to be exactly that: `reachedCache` is required so that merely being on the far side
    // of the island on the way TO the cache never reads as walking off with your stake.
    if (this.reachedCache && this.carrying && this.placeHoldMs === 0
        && dist(self, cache) > S.reach + 4) {
      this.closeRound(0);
    }
    // Letting go part-way through is a partial contribution, which is the whole point of the hold.
    if (!this.actionDown && this.placeHoldMs > 0 && !atCache) {
      this.closeRound(Math.min(1, this.placeHoldMs / S.exchange.placeMs));
    }
    this.sampleApproach(self, cache, dtMs);
  }

  private closeRound(amount01: number) {
    const S = FLOW4_SCENE;
    const last = this.round >= S.exchange.rounds;
    this.amounts.push(amount01);
    if (amount01 > 0) this.cooperated++;

    const raw: Record<string, unknown> = {
      decision_latency_ms: Math.round(this.placeLatency ?? (this.beatMs - this.roundStartMs)),
      round: this.round,
      stake_amount01: amount01,                      // ⚑ carried, not routed
    };
    if (last) {
      raw.rounds_cooperated = this.cooperated;       // routed: the PATTERN, via consistency
      raw.rounds_total = S.exchange.rounds;
      // ⚑ the iterated-game signature, and the one with nowhere clean to go. What you did in the
      // round AFTER they took more than their share, against your own mean before it.
      if (this.defectSeenAtRound > 0 && this.amounts.length > this.defectSeenAtRound) {
        const before = this.amounts.slice(0, this.defectSeenAtRound);
        const mean = before.reduce((a, b) => a + b, 0) / Math.max(1, before.length);
        raw.response_to_defect01 = mean > 0.01
          ? Math.max(0, Math.min(1, this.amounts[this.defectSeenAtRound] / mean)) : 0;
      }
    }
    this.emit(amount01 > 0 ? "cooperate" : "defect", amount01 > 0 ? "take" : "refuse", raw,
      "exchange_round", this.ids.cache, !last);

    if (last) return;
    // The partner's side is a fixed schedule, so what varies is the player. On the defect round they
    // take more than their share; nothing announces it, the cache is simply empty and marked.
    this.round++;
    this.roundStartMs = this.beatMs;
    this.reachedCache = false;
    this.carrying = false;
    this.placeHoldMs = 0;
    this.placeLatency = null;
    this.ap = freshApproach();
    if (this.round === S.exchange.defectRound && !this.defected) {
      this.defected = true;
      this.defectSeenAtRound = this.amounts.length;
      this.cfg.setEntitySprite(this.ids.cache, S.sprites.cache, S.displayH.cache);
      this.cfg.onWhisper?.("the cache is empty. it was not empty this morning.");
    } else {
      this.cfg.setEntitySprite(this.ids.cache, S.sprites.cacheFull, S.displayH.cache);
    }
    this.cfg.onPrompt?.(null);
  }

  // ── beat 3: the conflict. FOUR named branches, and not one of them is a button. ──
  private tickConflict(dtMs: number, self: Pt) {
    const S = FLOW4_SCENE;
    const partner = this.spots.partner;
    const d = dist(self, partner);
    this.sampleApproach(self, partner, dtMs);

    if (this.discoveredMs === null) {
      if (dist(self, this.spots.cache) < S.reach + 0.6) {
        this.discoveredMs = this.beatMs;
        // Anchor the distance HERE, at the moment of finding out. Left at Infinity, the very first
        // frame after discovery satisfies "closer than before" and every approach latency read 0.
        this.minDist = d;
        this.cfg.onWhisper?.("everything you put in is gone, and the mark beside it is theirs.");
      }
      this.lastSelf = { ...self };
      return; // nothing is measured until you have actually found out
    }

    // "How long before you go to them at all" — the first real movement after finding out.
    //
    // Two earlier definitions were both wrong. Waiting for the distance to the partner to shrink
    // measured the pathfinder's route, not the pause, and read 19 seconds for a two-second one.
    // Anchoring at the discovery frame measured the last of the walk IN, and read 207 ms for the
    // same pause. So the anchor is where the player came to REST after finding out, and the clock
    // runs from there.
    const step = this.lastSelf ? dist(self, this.lastSelf) : 0;
    this.lastSelf = { ...self };
    if (this.stoodAt === null) {
      if (step < 0.04) this.stoodAt = { ...self };
    } else if (this.approachStartMs === null && dist(self, this.stoodAt) > 0.8) {
      this.approachStartMs = this.beatMs;
    }
    this.minDist = Math.min(this.minDist, d);

    // Where you SETTLED, not where you passed through: a distance has to be held to count.
    const band = Math.round(d * 2) / 2;
    const held = (this.holdAtDist.get(band) ?? 0) + dtMs;
    this.holdAtDist.set(band, held);
    if (held >= S.conflict.settleMs && (this.settleDist === null || band < this.settleDist)) {
      this.settleDist = band;
    }

    // repair: you went to their post and left something of yours there
    if (this.actionDown && dist(self, this.spots.post) < S.reach) {
      this.repairHoldMs += dtMs;
      this.claimActivity("gather");
      if (this.repairHoldMs >= S.conflict.repairMs) {
        this.cfg.onWhisper?.("you leave it at their post. they will find it, or they will not.");
        this.cfg.onTendTie?.(0.15);
        return this.emitConflict("repair");
      }
      return;
    }
    // retaliation: you took back from what is left of their share
    if (this.actionDown && dist(self, this.spots.cache) < S.reach) {
      this.retaliateHoldMs += dtMs;
      this.claimActivity("dig");
      if (this.retaliateHoldMs >= S.conflict.retaliateMs) {
        this.cfg.onWhisper?.("you take back what you can carry. the cache is emptier than they left it.");
        this.cfg.onTendTie?.(-0.2);
        return this.emitConflict("retaliate");
      }
      return;
    }
    if (this.ownsActivity) this.releaseActivity();

    // Leaving is what resolves the other two, and WHICH one it was is read off the distance you
    // settled at. Coming close and doing nothing hostile is forgiveness; never getting near is not.
    if (this.settleDist !== null && d > S.aware) {
      this.emitConflict(this.settleDist <= S.conflict.closeAt ? "forgive"
        : this.settleDist >= S.conflict.shortAt ? "withdraw" : "forgive");
    }
  }

  private emitConflict(branch: "repair" | "retaliate" | "forgive" | "withdraw") {
    const S = FLOW4_SCENE;
    const key = branch === "repair" ? "conflict_repair"
      : branch === "retaliate" ? "conflict_retaliate"
      : branch === "forgive" ? "conflict_forgive" : "conflict_withdraw";
    const lat = Math.round((this.approachStartMs ?? this.beatMs) - (this.discoveredMs ?? 0));
    this.emit(branch, branch === "withdraw" ? "refuse" : "take", {
      decision_latency_ms: Math.max(0, lat),
      // routed: held work, the same quantity the raft's lashings anchored
      repair_hold01: branch === "repair" ? Math.min(1, this.repairHoldMs / S.conflict.repairMs) : undefined,
      // carried, NOT routed (⚑)
      approach_latency_ms: Math.max(0, lat),
      settle_distance: this.settleDist ?? this.minDist,
      circled01: Math.min(1, this.ap.angleSweep / Math.PI),
    }, key, branch === "retaliate" ? this.ids.cache : this.ids.partner);
  }

  // ── beat 4: non-reciprocal generosity. Nobody sees. Nothing is owed. Nothing comes back. ──
  private tickGenerosity(dtMs: number, self: Pt) {
    const S = FLOW4_SCENE;
    const post = this.spots.post;
    this.sampleApproach(self, post, dtMs);

    if (!this.carrying && dist(self, this.spots.store) < S.reach) {
      this.carrying = true;
      this.trips++;
      this.cfg.onPrompt?.("their post is empty, and so are they — hold [space] to leave what you carry");
    }
    const atPost = dist(self, post) < S.reach;
    if (atPost && this.carrying) this.atPostMs += dtMs;

    if (this.actionDown && atPost && this.carrying) {
      if (this.giveLatency === null) this.giveLatency = this.beatMs;
      this.holdActive = true;
      this.giveHoldMs += dtMs;
      this.claimActivity("gather");
      const spend = (dtMs / S.generosity.giveMs) * S.generosity.vitalityCost;
      this.vitalitySpent += spend;
      this.cfg.spendVitality?.(spend);
      if (this.giveHoldMs >= S.generosity.giveMs) {
        this.cfg.onWhisper?.("you set it down and go. nothing marks that this happened.");
        this.cfg.onTendTie?.(0.25);
        return this.emitGenerosity(true);
      }
      return;
    }
    if (this.ownsActivity) this.releaseActivity();
    // What you were carrying is down; your hands are empty. Going back to the store for more is what
    // makes `trips` a real count instead of always 1. Gated on the hold having just ENDED, once:
    // clearing it every idle frame made standing at the store pick up and drop 47 times.
    if (this.holdActive && !this.actionDown) {
      this.holdActive = false;
      this.carrying = false;
    }

    // Leaving is the ending, and a PARTIAL gift is a legitimate one — the whole reason the give is a
    // progressive hold rather than a yes/no. Emit what was actually left, as F5's probes do.
    //
    // But going back to your own store for more is NOT leaving, and their post and your store are
    // deliberately far apart, so any radius test is satisfied somewhere in the middle of that walk.
    // A plain radius ended the beat halfway through the second trip and threw `trips` away. So the
    // ending is REST: time spent away from both, reset the moment you are at either again.
    const away = dist(self, post) > S.reach + 3 && dist(self, this.spots.store) > S.reach + 3;
    this.restMs = away ? this.restMs + dtMs : 0;
    if (this.restMs > 2500) {
      if (this.giveHoldMs > 0) this.emitGenerosity(true);
      // Coming, standing there with it, and leaving anyway is the other branch, and it is a reading.
      else if (this.atPostMs > 700) this.emitGenerosity(false);
    }
  }

  private emitGenerosity(gave: boolean) {
    const S = FLOW4_SCENE;
    const amt = Math.min(1, this.giveHoldMs / S.generosity.giveMs);
    this.emit(gave ? "give_unreciprocated" : "withhold_unreciprocated", gave ? "take" : "refuse", {
      decision_latency_ms: Math.round(this.giveLatency ?? this.beatMs),
      // routed: the existing F7 give/share anchor sets ts_social = amount
      gift_amount01: amt,
      // routed: going back for more is effort past the minimum, the gather's own anchor
      trips: this.trips,
      // carried, NOT routed (⚑), exactly as in F5
      give_latency_ms: Math.round(this.giveLatency ?? this.beatMs),
      cost_paid01: Math.min(1, this.vitalitySpent / S.generosity.vitalityCost),
      circled01: Math.min(1, this.ap.angleSweep / Math.PI),
    }, "give_unreciprocated", this.ids.post);
  }

  /** Flush whatever was actually performed if the player leaves mid-beat. Partials are the point. */
  private flush() {
    if (this.emitted) return;
    if (this.cfg.beat === "conflict" && this.discoveredMs !== null) {
      this.emitConflict(this.settleDist !== null && this.settleDist <= FLOW4_SCENE.conflict.closeAt
        ? "forgive" : "withdraw");
    } else if (this.cfg.beat === "generosity" && this.atPostMs > 0) {
      this.emitGenerosity(this.giveHoldMs > 0);
    }
  }

  private emit(
    action: string,
    polarity: "take" | "refuse",
    raw: Record<string, unknown>,
    cueKey: keyof typeof FLOW4_CUES,
    targetId: string,
    keepOpen = false,
  ) {
    if (this.emitted) return;
    if (!keepOpen) this.emitted = true;
    this.releaseActivity();
    this.cfg.onPrompt?.(null);
    const uid = this.cfg.actorId();
    if (!uid) return;

    for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
    const def = FLOW4_CUES[cueKey];
    const ev = buildFlow1Event({
      actorId: uid, sessionId: this.cfg.sessionId(),
      channel: def.channel, cue: def.cue, action, polarity,
      targetId, targetKind: def.targetKind,
      stakes: "high", raw,
    });
    // F4's counterpart is a persisting partner you have met before, not a stranger, and the
    // conditional buckets key social channels on counterpart_status — so the repeated-partner
    // gradient is recoverable from the bucket rather than only from the pooled posterior.
    ev.context = { ...ev.context, counterpart_status: "peer", stage: 4 };
    this.cfg.send([ev]);
  }
}
