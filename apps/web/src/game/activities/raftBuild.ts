/**
 * The raft build — the flagship EMBODIED activity (ECHO_level_design_7flows.md §FLOW 1, the doc's own
 * headline "building a raft" example). A *performed* activity, not a button menu:
 *
 *   gather  — you walk up to a piece of driftwood and PRESS to pick it up (a deliberate, embodied pick,
 *             not a passive walk-over). A raft needs five lengths; there are eight on the shore. Taking
 *             only what you need ↔ taking every last piece is the thoroughness cue — and it is not free
 *             advice: the wood you carry is the wood the raft is made of, so it BUYS REACH.
 *   assemble— you stand at the shore's edge and HOLD to work the wood. The raft grows under your hands,
 *             stage by stage, out of the planks you laid down. The lashing SLIPS twice; setting your feet
 *             and working through it is the grit cue. How long you deliberate first (pace), how long you
 *             persist, and whether you keep going past "it will float" (care → openness ⚑) are all cues.
 *   launch  — you carry the raft to the water and push it in (the commitment moment → the F1→F2 seam).
 *
 * WHAT THE EFFORT BUYS. The manner is measured (continuous raw_signals → the persona posterior), but it is
 * ALSO a fact about the world: wood carried + time held → `seaworthiness` → how much open water the raft
 * puts behind it before the sea starts pushing back (packages/shared/src/raft.ts). A raft lashed from five
 * planks in four seconds reaches the near shore and nothing else; one worked out of all eight planks for
 * fifteen seconds crosses to islands you could only look at before. Haste is never punished — the reach
 * floor clears the widest crossing in the archipelago, so any raft always gets you somewhere. Haste is a
 * style we MEASURE, and the world is merely honest about what it physically buys.
 *
 * The player is never shown a number. There is no quality meter and no score: there is a pile of wood, an
 * amount of time you chose to spend on the lashings, and an ocean.
 */
import type { ThreeWorld } from "../ThreeWorld";
import type { ActivityKind } from "../WorldCore";
import {
  buildFlow1Event, FLOW1_CUES, RAFT_BUILD, RAFT_STAGES, RAFT_SLIPS,
  MIN_BUILD_MS, SOLID_MS, LAVISH_BUILD_MS, seaworthiness,
  type BehavioralEvent, type EntitySnapshot, type RaftBuildState,
} from "@echo/shared";

export type RaftPhase = "gather" | "ready" | "building" | "built" | "launched";

export interface RaftBuildConfig {
  world: ThreeWorld;
  /** The driftwood entities placed on the shore (client-local). */
  wood: { id: string; x: number; y: number }[];
  assembly: { x: number; y: number };
  launch: { x: number; y: number };
  raftId: string;
  needed: number;
  actorId: () => string;
  sessionId: () => string;
  /** POST events to /observe/behavioral (the scene owns the fetch + evidence log). */
  send: (events: BehavioralEvent[]) => void;
  /** Remove/add a client-local entity THROUGH the scene, so its live merge-set stays in sync (in /play
   *  the scene's set is re-merged into every server snapshot; a raw world.removeEntity would be undone). */
  removeEntity: (id: string) => void;
  addEntity: (snap: EntitySnapshot, heightPx?: number) => void;
  /** Re-skin a live entity through the scene (same re-merge reason as above). */
  setEntitySprite: (id: string, spriteUrl: string, heightPx?: number) => void;
  onWhisper?: (text: string | null) => void;
  onPhase?: (p: RaftPhase) => void;
  /** A driftwood piece is in pick range (show a "pick" prompt) — null when none is. */
  onNearWood?: (id: string | null) => void;
  /** A free-text contextual prompt from the raft itself (e.g. the push-off, once you carry it to the
   *  water). Distinct from onNearWood, which the scene renders as the fixed "pick up the driftwood" line. */
  onPrompt?: (text: string | null) => void;
  /** Gather counter changed (for the side "driftwood N / needed" readout). */
  onProgress?: (g: { gathered: number; needed: number; total: number }) => void;
  /**
   * The raft as it now stands — the day loop's SOURCE OF TRUTH for the shore. Fires on every
   * real change (a pick, a slip, work crossing a stage, the launch), never per frame. The day
   * loop stores this verbatim and derives its own 0..1 read from it, so there is no second
   * counter to drift from the wood and the work this describes.
   */
  onRaftState?: (r: RaftBuildState) => void;
  /**
   * The self-imposed gate, now made of acts instead of a menu (P4's start_ship fork):
   *  - "start": the first plank leaves the sand. You have begun the long work of leaving.
   *  - "stay":  you stood over the wood long enough to be deciding, and walked away from it.
   * Never touching the wood at all commits nothing — that is the K4 refusal, read at dusk.
   */
  onLeaveFork?: (option: "start" | "stay") => void;
  /** The raft as persisted from earlier sessions (weathered on load) — the build resumes from
   *  it instead of starting over. Undefined = an untouched shore. */
  restore?: RaftBuildState;
  /** The raft was pushed off (the F1→F2 seam). The caller unlocks sailing — client-side in the solo
   *  slice (world.setSailing), or authoritatively in /play (net.sendSetSail). `sea` (0..1) is what the
   *  build was worth and sets the raft's reach; it is never displayed. */
  onLaunched?: (sea: number) => void;
}

const PICK = 0.85; // pick range (tiles) — walk up to a plank to pick it
const AT_STATION = 1.1; // "at the assembly" radius (tiles)
/** The launch spot sits at the waterline, and on foot you cannot step past it — so a tight radius here
 *  meant a player carrying a finished raft could stand at the very edge, press, and have NOTHING happen,
 *  with no word as to why. Be generous, and say something when they are still short. */
const AT_LAUNCH = 1.7;
/** Standing-over-the-wood radius and dwell that read as "deciding" rather than passing by. Matches
 *  flow1Beats' THRESHOLD/700ms leave-action shape, so the two beats feel like one world. */
const DECIDE_R = 2.2;
const DECIDE_MS = 700;
const SLIP_STALL_MS = 420; // how long a slipped lashing refuses to take, before you can bite again
const CADENCE_WINDOW_MS = 1500; // window over which we read how vigorously you are working

/** Our claim token on the world's single self-activity slot (Flow1Beats holds the other one). */
const ACTIVITY_OWNER = "raftBuild";

export class RaftBuild {
  private phase: RaftPhase = "gather";
  private remaining: { id: string; x: number; y: number }[];
  private gathered = 0;
  private total: number;
  private gatherStartAt = 0;
  private gatherEmitted = false;
  private nearWoodId: string | null = null;
  private notEnoughWarnedAt = 0;

  // build accounting
  private buildArrivedAt = 0;
  private firstPressAt = 0;
  private workMs = 0; // HELD time actually spent working the wood (the thing that buys reach)
  private redo = 0;
  private wasHolding = false;
  private completeAt = 0;
  private floated = false; // has workMs crossed MIN_BUILD_MS (it will float)?

  // the laid-out pile of planks that becomes the deck
  private planks: string[] = [];
  private planksUsed = 0;
  private raftPlaced = false;
  private stageIdx = -1;

  // the lashing slips — working through them is grit (persist_after_fail)
  private slipsHit = 0;
  private slipsRecovered = 0;
  private slipStallUntil = 0;
  private slipPending = false; // the rope has slipped and has not been taken up again yet
  private launchPrompt: string | null = null;

  // the self-imposed gate, as acts: the first pick is "start", lingering-then-leaving is "stay"
  private leaveForkSent = false;
  private woodNearSince = 0; // when we entered the deciding radius of a plank we have not picked

  private strokes: number[] = []; // keydown timestamps, for the work cadence → animation intensity
  private actionDown = false; // action key currently held (build hold + rising-edge picks/launch)
  private ownsActivity = false; // we share ONE global activity slot with Flow1Beats — only clear our own
  private raf = 0;
  private lastTick = 0;
  private disposed = false;

  constructor(private cfg: RaftBuildConfig) {
    this.remaining = [...cfg.wood];
    this.total = cfg.wood.length;
    // Resume the raft you left on this shore (already weathered by the day loop's wall-clock
    // decay on load). The planks you carried up are gone from the sand — you are holding them —
    // and the lashing time you put in is still in the knots, minus what worked loose.
    const r = cfg.restore;
    if (r && !r.launched && (r.planks > 0 || r.workMs > 0)) {
      this.gathered = Math.min(r.planks, this.total);
      this.remaining = this.remaining.slice(this.gathered); // the ones already hauled up are off the beach
      this.workMs = r.workMs;
      this.slipsHit = r.slipsHit;
      this.slipsRecovered = r.slipsRecovered;
      this.floated = r.workMs >= MIN_BUILD_MS;
      this.leaveForkSent = true; // you began on an earlier day; the fork is long since committed
      if (this.gathered >= cfg.needed) this.phase = "ready";
    }
  }

  /** The raft as it now stands — the day loop's source of truth for this shore. Called on real
   *  changes only (a pick, a slip, a stage, the launch), never per frame. */
  private reportRaft() {
    this.cfg.onRaftState?.({
      planks: this.gathered,
      workMs: this.workMs,
      slipsHit: this.slipsHit,
      slipsRecovered: this.slipsRecovered,
      launched: this.phase === "launched",
    });
  }

  start() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    this.cfg.onProgress?.({ gathered: 0, needed: this.cfg.needed, total: this.total });
    this.cfg.onWhisper?.("driftwood lies along the shore. walk up to a piece and pick it up — a raft needs five.");
    this.lastTick = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.tick(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
  }

  /** Losing the window (alt-tab, a click into a text field) never delivers the keyup, so without this the
   *  key stays latched "down" and the raft goes on building itself while the player is not even here —
   *  and then ships that phantom time to the ML as dwell_ms. */
  private onBlur = () => {
    this.actionDown = false;
  };

  private isActionKey(e: KeyboardEvent) {
    return e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "e";
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (!this.isActionKey(e)) return;
    if (e.type === "keydown") {
      e.preventDefault();
      if (!this.actionDown) {
        this.actionDown = true;
        this.strokes.push(performance.now());
        this.onPressEdge(); // rising edge: pick / launch (build uses the held level in tick)
      }
    } else {
      this.actionDown = false;
    }
  };

  /** A fresh press of the action key (not a repeat) — the deliberate pick / launch act. */
  private onPressEdge() {
    if ((this.phase === "gather" || this.phase === "ready") && this.nearWoodId) {
      this.pick(this.nearWoodId);
    } else if (this.phase === "built") {
      const self = this.cfg.world.getSelfTile();
      if (this.dist(self, this.cfg.launch) < AT_LAUNCH) this.launch();
      else this.cfg.onWhisper?.("not here. carry it down to the water's edge.");
    }
  }

  private pick(id: string) {
    const idx = this.remaining.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const w = this.remaining.splice(idx, 1)[0];
    this.cfg.removeEntity(w.id);
    this.gathered++;
    // The first plank off the sand IS "begin the raft" (P4's start_ship). It used to be a button
    // in a menu; it is now the act itself, which is the only thing that was ever worth measuring.
    if (!this.leaveForkSent) {
      this.leaveForkSent = true;
      this.cfg.onLeaveFork?.("start");
    }
    if (!this.gatherStartAt) this.gatherStartAt = performance.now();
    this.nearWoodId = null;
    this.cfg.onNearWood?.(null);
    this.cfg.onProgress?.({ gathered: this.gathered, needed: this.cfg.needed, total: this.total });
    this.reportRaft();
    // a brief embodied stoop, then keep the carried-wood overlay
    this.claimActivity("gather", { carrying: true });
    this.cfg.onWhisper?.(
      this.gathered < this.cfg.needed
        ? `you pick up a length of driftwood.`
        : this.gathered === this.cfg.needed
          ? `enough for a raft. there is more, if you want a better one.`
          : `another length. the raft will be the wider for it.`,
    );
    if (this.gathered >= this.cfg.needed && this.phase === "gather") this.setPhase("ready");
  }

  private dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * The other arm of the gate, embodied: stand over the wood long enough to be deciding
   * (DECIDE_MS inside DECIDE_R), then walk away from it without picking any up. That is "let it
   * lie" — an ACTIVE choice, and it must stay distinguishable from never going near the wood at
   * all, which commits nothing and is read as the K4 refusal at dusk. Same linger-then-leave
   * shape flow1Beats already uses for the gamble cave's `stay_safe`.
   */
  private trackLeaveFork(now: number, self: { x: number; y: number }) {
    if (this.leaveForkSent || this.gathered > 0) return;
    let nearest = Infinity;
    for (const w of this.remaining) nearest = Math.min(nearest, this.dist(self, w));
    if (nearest < DECIDE_R) {
      if (!this.woodNearSince) this.woodNearSince = now;
    } else if (this.woodNearSince) {
      const lingered = now - this.woodNearSince;
      this.woodNearSince = 0;
      if (lingered > DECIDE_MS) {
        this.leaveForkSent = true;
        this.cfg.onLeaveFork?.("stay");
        this.cfg.onWhisper?.("you let it lie, for now. the horizon keeps.");
      }
    }
  }

  /** The shared self-activity slot (Flow1Beats writes it too) — claim/release by OWNER, never blind-null.
   *  The world refuses a clear from anyone but the current owner. */
  private claimActivity(kind: ActivityKind, opts?: { carrying?: boolean; intensity?: number }) {
    this.ownsActivity = true;
    this.cfg.world.setSelfActivityState(kind, { ...opts, owner: ACTIVITY_OWNER });
  }
  private releaseActivity() {
    if (!this.ownsActivity) return;
    this.ownsActivity = false;
    this.cfg.world.setSelfActivityState(null, { owner: ACTIVITY_OWNER });
  }

  /** How vigorously you are working, 0.55..1 — re-press density over the last 1.5s. A player who leans on
   *  the key and one who hammers at it look different, which is what the animation has always promised. */
  private cadence01(now: number): number {
    this.strokes = this.strokes.filter((t) => now - t < CADENCE_WINDOW_MS);
    return Math.min(1, this.strokes.length / 4);
  }

  private tick(now: number) {
    // Clamp dt: a backgrounded tab hands rAF a multi-second delta on return, which would otherwise credit
    // the player with work they never did (and post it to the ML as dwell_ms).
    const dtMs = Math.min(now - this.lastTick, 50);
    this.lastTick = now;
    const self = this.cfg.world.getSelfTile();

    if (this.phase === "gather" || this.phase === "ready") {
      // Which driftwood piece (if any) is in pick range → drive the "pick" prompt.
      let near: string | null = null;
      let best = PICK;
      for (const w of this.remaining) {
        const d = this.dist(self, w);
        if (d < best) { best = d; near = w.id; }
      }
      if (near !== this.nearWoodId) {
        this.nearWoodId = near;
        this.cfg.onNearWood?.(near);
      }
      this.trackLeaveFork(now, self);
      // Keep the carried-wood overlay while you have wood. Only touch the slot when WE have something to
      // say — a blind null here would wipe Flow1Beats' animation every frame (the bug, in reverse).
      if (this.gathered > 0) this.claimActivity("carry", { carrying: true });
      else this.releaseActivity();

      // Arriving at the shore's edge with a raft's worth of wood begins the build.
      if (this.dist(self, this.cfg.assembly) < AT_STATION) {
        if (this.gathered >= this.cfg.needed) {
          if (!this.gatherEmitted) {
            this.emitGather(now);
            this.gatherEmitted = true;
          }
          this.nearWoodId = null;
          this.cfg.onNearWood?.(null);
          this.buildArrivedAt = now;
          this.firstPressAt = 0;
          this.workMs = 0;
          this.layPlanks();
          this.setPhase("building");
          this.cfg.onWhisper?.("lay the wood out. hold [space] to work it into a raft — the longer you work it, the further it will carry you.");
        } else if (now - this.notEnoughWarnedAt > 4000) {
          // Not enough wood is not a failure — it is information. Say it once, plainly, and let them go back.
          this.notEnoughWarnedAt = now;
          this.cfg.onWhisper?.(`five lengths make a raft. you have ${this.gathered}.`);
        }
      }
      return;
    }

    if (this.phase === "building") {
      const near = this.dist(self, this.cfg.assembly) < AT_STATION + 0.4;
      const stalled = now < this.slipStallUntil;
      const holding = this.actionDown && near && !stalled;

      // The rope has stopped slipping and you are still on it — you set your feet. That counts whether you
      // gritted your teeth and never let go, or let go and took a fresh bite. (An earlier cut demanded the
      // re-press specifically, which quietly soft-locked anyone who simply kept holding: the slip flag had
      // no other way to clear and the raft would never finish.)
      if (this.slipPending && !stalled && this.actionDown && near) {
        this.slipPending = false;
        this.slipsRecovered++;
        this.reportRaft(); // grit is a channel of seaworthiness — it has to survive the night too
      }

      if (holding) {
        if (this.firstPressAt === 0) this.firstPressAt = now;
        this.workMs += dtMs;
        this.claimActivity("build", { intensity: 0.55 + 0.45 * this.cadence01(now) });
        this.growRaft();
        this.checkSlip(now);
        if (!this.floated && this.workMs >= MIN_BUILD_MS) {
          this.floated = true;
          this.cfg.onWhisper?.("the lashings hold. it would float. work it longer and it will go further — or take it now.");
        }
      } else {
        // You LET GO mid-build → a redo when you re-engage. Do not count the scripted slips: those are the
        // rope failing, not the player second-guessing themselves, and counting them would hand every
        // player an identical +2 `edits` — turning the self-monitoring cue into a measure of the game's own
        // resistance rather than of them. (The slips are already measured, as grit, in persist_after_fail.)
        if (this.wasHolding && this.workMs > 200 && !this.floated && !stalled && !this.slipPending) this.redo++;
        if (this.gathered > 0 || this.floated) this.claimActivity("carry", { carrying: true });
        else this.releaseActivity();
      }
      // deliberation = time stood at the wood before the first strike (not counted as work)
      if (this.firstPressAt === 0 && near) this.workMs = 0;
      this.wasHolding = holding;

      // Finish: it floats AND you carry it away toward the water (leaving the workspace = done).
      if (this.floated && this.dist(self, this.cfg.assembly) > AT_STATION + 0.6) {
        this.emitAssemble(now);
        this.completeAt = now;
        this.cfg.removeEntity(this.cfg.raftId); // you pick it up — it comes with you
        this.raftPlaced = false;
        this.setPhase("built");
        this.claimActivity("carry", { carrying: true });
        this.cfg.onWhisper?.("you heft the raft toward the water's edge. press [space] to push it in.");
      }
      return;
    }

    if (this.phase === "built") {
      // Carrying a finished raft: surface the push-off the moment the water is in reach, so nobody is left
      // standing on the sand pressing a key that silently does nothing. (Launch itself fires on the rising
      // edge in onPressEdge; "launched" is terminal.)
      const atWater = this.dist(self, this.cfg.launch) < AT_LAUNCH;
      const prompt = atWater ? "push the raft into the water — press [space]" : null;
      if (prompt !== this.launchPrompt) {
        this.launchPrompt = prompt;
        this.cfg.onPrompt?.(prompt);
      }
    }
  }

  /** Lay the carried wood out at the shore's edge — one plank per length you brought. Eight planks is a
   *  visibly bigger pile than five, and that pile is the counter: the raft is made of what you carried. */
  private layPlanks() {
    if (this.planks.length) return;
    for (let i = 0; i < this.gathered; i++) {
      const id = `${this.cfg.raftId}_plank_${i}`;
      const col = i % 4;
      const row = Math.floor(i / 4);
      // Laid out BESIDE you, not under you — and spread far enough that eight lengths read as visibly more
      // wood than five. The pile is the counter: you can see what you brought.
      const snap: EntitySnapshot = {
        id, kind: "npc", refId: id, name: "",
        spriteUrl: RAFT_BUILD.sprites.plank,
        x: this.cfg.assembly.x - 1.9 + col * 0.55,
        y: this.cfg.assembly.y - 1.15 + row * 0.62,
        facing: "down", moving: false, role: "flow1", status: "none",
      };
      this.cfg.addEntity(snap, RAFT_BUILD.displayH.plank);
      this.planks.push(id);
    }
  }

  /** The raft grows out of the pile: planks leave the sand and become deck, and the silhouette advances
   *  through its stages. This — not a progress bar — is how holding [space] is legible. */
  private growRaft() {
    // The wood you carried is all bound in by the time the raft would float.
    const bound = Math.min(this.planks.length, Math.floor((this.workMs / MIN_BUILD_MS) * this.planks.length));
    while (this.planksUsed < bound) {
      this.cfg.removeEntity(this.planks[this.planksUsed]);
      this.planksUsed++;
    }
    // Stage the silhouette by held work. Re-skin ONLY on a crossing: setEntitySprite rebuilds a canvas +
    // GPU texture each call, so a per-frame call would leak one texture per frame.
    let idx = 0;
    for (let i = 0; i < RAFT_STAGES.length; i++) if (this.workMs >= RAFT_STAGES[i].at) idx = i;
    if (idx === this.stageIdx) return;
    this.stageIdx = idx;
    // A crossed stage is real, persistable progress at the lashings — and it is a change the
    // silhouette already shows, so it is the honest place to checkpoint the shore.
    this.reportRaft();
    const st = RAFT_STAGES[idx];
    if (!this.raftPlaced) {
      this.raftPlaced = true;
      const snap: EntitySnapshot = {
        id: this.cfg.raftId, kind: "npc", refId: this.cfg.raftId, name: "",
        spriteUrl: st.sprite, x: this.cfg.assembly.x, y: this.cfg.assembly.y,
        facing: "down", moving: false, role: "flow1", status: "none",
      };
      this.cfg.addEntity(snap, st.h);
    } else {
      this.cfg.setEntitySprite(this.cfg.raftId, st.sprite, st.h);
    }
  }

  /** The rope slips. Twice. Setting your feet and biting again is grit — the persistence-after-failure cue
   *  the design doc rates highest and that the ingress has never actually received. */
  private checkSlip(now: number) {
    if (this.slipsHit >= RAFT_SLIPS.length) return;
    const at = RAFT_SLIPS[this.slipsHit] * MIN_BUILD_MS;
    if (this.workMs < at) return;
    this.slipsHit++;
    this.slipStallUntil = now + SLIP_STALL_MS;
    this.slipPending = true;
    this.reportRaft();
    this.cfg.onWhisper?.("the lashing slips loose. set your feet, take it again.");
  }

  /** Whether you worked through the slips instead of walking away. 0..1. */
  private grit01(): number {
    if (!this.slipsHit) return 0;
    return Math.min(1, this.slipsRecovered / this.slipsHit);
  }

  /** What the build was worth — wood carried AND time held, independently. Never shown to the player. */
  private seaworthiness(): number {
    return seaworthiness(this.gathered, this.workMs, this.grit01(), this.cfg.needed, this.total);
  }

  private launch() {
    const sea = this.seaworthiness();
    this.emitLaunch(performance.now(), sea);
    this.releaseActivity();
    this.launchPrompt = null;
    this.cfg.onPrompt?.(null);
    // the raft goes in the water where you pushed it
    this.cfg.addEntity(
      {
        id: this.cfg.raftId, kind: "npc", refId: this.cfg.raftId, name: "",
        spriteUrl: RAFT_STAGES[Math.max(0, this.stageIdx)].sprite,
        x: this.cfg.launch.x, y: this.cfg.launch.y,
        facing: "down", moving: false, role: "flow1", status: "none",
      },
      RAFT_STAGES[Math.max(0, this.stageIdx)].h,
    );
    if (this.cfg.onLaunched) this.cfg.onLaunched(sea);
    else this.cfg.world.setSailing(true); // solo slice: unlock sailing client-side
    this.setPhase("launched");
    this.reportRaft(); // the hull is in the water: a finished thing, and finished things never weather
    this.cfg.onWhisper?.(
      sea >= 0.66
        ? "you push the raft into the shallows. it sits high and takes the water well. the far islands are not so far."
        : sea >= 0.33
          ? "you push the raft into the shallows. the water takes it. it will carry you a fair way."
          : "you push the raft into the shallows. the water takes it. it will not carry you far.",
    );
  }

  private setPhase(p: RaftPhase) {
    if (this.phase === p) return;
    this.phase = p;
    this.cfg.onPhase?.(p);
    // the driftwood counter has done its job once the wood is laid out
    if (p === "building") this.cfg.onProgress?.({ gathered: -1, needed: this.cfg.needed, total: this.total });
  }

  // ── the emit contract: continuous MANNER → raw_signals → the existing 16 features (ingest) ──────────
  // One performed act = exactly one event. The world's consequence (reach) is a READ-ONLY function of the
  // same performance and posts nothing of its own — physics reads the manner, the persona reads the manner,
  // and they never read each other.
  private emit(action: string, raw: Record<string, unknown>, polarity?: "take" | "refuse") {
    const uid = this.cfg.actorId();
    if (!uid) return;
    const def = (FLOW1_CUES as Record<string, { channel: string; cue: string; targetKind: string }>)[action];
    const ev = buildFlow1Event({
      actorId: uid, sessionId: this.cfg.sessionId(),
      channel: (def?.channel ?? "C") as never, cue: (def?.cue ?? "C7") as never, action, polarity,
      targetId: this.cfg.raftId, targetKind: (def?.targetKind ?? "structure") as never, stakes: "medium", raw,
    });
    this.cfg.send([ev]);
  }

  private emitGather(now: number) {
    this.emit("gather_driftwood", {
      // thoroughness: the minimum ↔ every last piece → persistence
      thoroughness01: Math.min(1, this.gathered / this.total),
      dwell_ms: Math.max(0, now - (this.gatherStartAt || now)),
    });
  }

  private emitAssemble(now: number) {
    const deliberationMs = Math.max(0, this.firstPressAt - this.buildArrivedAt);
    // thoroughness01 was min(1, progress) — but this only ever fired at progress >= 1, so it was ALWAYS
    // exactly 1.0 for every player who finished. `persistence` therefore carried zero information, and
    // because ingest does tel["persistence"] = max(persistence, persist_after_fail), a constant 1.0 also
    // silently ERASED the grit cue. Scaling by held work makes both live again.
    const grit = this.grit01();
    this.emit("assemble_raft", {
      thoroughness01: Math.min(1, this.workMs / LAVISH_BUILD_MS),
      ...(grit > 0 ? { persist_after_fail: grit } : {}),
      edits: this.redo,
      decision_latency_ms: deliberationMs,
      dwell_ms: this.workMs,
      decoration: Math.min(1, Math.max(0, this.workMs - SOLID_MS) / (LAVISH_BUILD_MS - SOLID_MS)),
    });
  }

  private emitLaunch(now: number, _sea: number) {
    this.emit("launch_raft", { decision_latency_ms: Math.max(0, now - (this.completeAt || now)) });
  }

  /** Called by the scene if the player leaves F1 without finishing — non-action is data. */
  abandonIfUnfinished() {
    if (this.phase === "building" && !this.floated) this.emit("assemble_raft", {}, "refuse");
    else if ((this.phase === "gather" || this.phase === "ready") && !this.gatherEmitted && this.gathered === 0)
      this.emit("gather_driftwood", {}, "refuse");
  }
}
