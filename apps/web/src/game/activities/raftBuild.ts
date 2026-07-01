/**
 * The raft build — the flagship EMBODIED activity (ECHO_level_design_7flows.md §FLOW 1, the doc's own
 * headline example of "building a raft"). It is a *performed* activity, not a button menu:
 *
 *   gather  — you physically walk the shore and pick up driftwood (auto on walk-over). HOW MUCH you
 *             gather (just the 4 you need ↔ every last piece) is the thoroughness cue.
 *   assemble— you stand at the shore's edge and HOLD to work the wood: an animated, rhythmic build.
 *             How long you deliberate before starting (pace), whether you slip and re-engage (redo →
 *             self-monitoring), how long you persist, and whether you keep going past "done" to add a
 *             flourish (decoration → openness ⚑) are all cues.
 *   launch  — you push the finished raft into the water (the commitment moment → the F1→F2 seam).
 *
 * The measurement is extracted from the MANNER (continuous raw_signals), never from a discrete choice —
 * so two people building the same raft in different styles move their posteriors measurably differently.
 * Everything routes through the proven /observe/behavioral ingress via buildFlow1Event (solo context).
 * The animation is procedural (PixiWorld.setActivityState), so it runs zero-key with no new sprite art.
 */
import type { PixiWorld } from "../PixiWorld";
import { buildFlow1Event, FLOW1_CUES, RAFT_BUILD, type BehavioralEvent, type EntitySnapshot } from "@echo/shared";

export type RaftPhase = "gather" | "ready" | "building" | "built" | "launched";

export interface RaftBuildConfig {
  world: PixiWorld;
  selfId: string;
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
  onWhisper?: (text: string | null) => void;
  onPhase?: (p: RaftPhase) => void;
}

const GATHER_COOLDOWN_MS = 380; // min between pick-ups (also the length of the stoop animation)
const BUILD_FULL_MS = 4200; // total held time to complete the raft (0..1 progress)
const DECOR_SPAN_MS = 2600; // extra held time past "done" that reads as full decoration (0..1)
const NEAR = 0.75; // pick-up radius (tiles)
const AT_STATION = 1.1; // "at the assembly / launch spot" radius (tiles)

export class RaftBuild {
  private phase: RaftPhase = "gather";
  private remaining: { id: string; x: number; y: number }[];
  private gathered = 0;
  private gatherStartAt = 0;
  private lastGatherAt = 0;
  private gatherEmitted = false;

  // build accounting
  private buildArrivedAt = 0;
  private firstPressAt = 0;
  private buildMs = 0;
  private progress = 0; // 0..1 = building, up to 1.5 with decoration
  private redo = 0;
  private wasHolding = false;
  private completeAt = 0;
  private raftPlaced = false;

  private holding = false;
  private raf = 0;
  private lastTick = 0;
  private disposed = false;

  constructor(private cfg: RaftBuildConfig) {
    this.remaining = [...cfg.wood];
  }

  start() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.cfg.onWhisper?.("driftwood lies along the shore. gather what you need — a raft could cross this.");
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
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "e") {
      this.holding = e.type === "keydown";
      if (e.type === "keydown") e.preventDefault();
    }
  };

  private dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private tick(now: number) {
    const dtMs = now - this.lastTick;
    this.lastTick = now;
    const self = this.cfg.world.getSelfTile();

    if (this.phase === "gather" || this.phase === "ready") {
      // Auto-gather any driftwood you walk over (embodied: you walked there, you pick it up).
      if (now - this.lastGatherAt > GATHER_COOLDOWN_MS) {
        const idx = this.remaining.findIndex((w) => this.dist(self, w) < NEAR);
        if (idx >= 0) {
          const w = this.remaining.splice(idx, 1)[0];
          this.cfg.world.removeEntity(w.id);
          this.gathered++;
          this.lastGatherAt = now;
          if (!this.gatherStartAt) this.gatherStartAt = now;
          this.cfg.world.setActivityState(this.cfg.selfId, "gather", { carrying: true });
          this.cfg.onWhisper?.(
            this.gathered < this.cfg.needed
              ? `you gather a length of driftwood. (${this.gathered})`
              : `you have enough now — but there is more, if you want it. (${this.gathered})`,
          );
        }
      }
      // Between pick-ups: keep the carried-wood overlay if you have any, else clear.
      if (now - this.lastGatherAt > GATHER_COOLDOWN_MS) {
        this.cfg.world.setActivityState(this.cfg.selfId, this.gathered > 0 ? "carry" : null, {
          carrying: this.gathered > 0,
        });
      }
      if (this.gathered >= this.cfg.needed && this.phase === "gather") this.setPhase("ready");

      // Arriving at the shore's edge with wood begins the build.
      if (this.gathered >= 1 && this.dist(self, this.cfg.assembly) < AT_STATION) {
        if (!this.gatherEmitted) {
          this.emitGather(now);
          this.gatherEmitted = true;
        }
        this.buildArrivedAt = now;
        this.placeRaft();
        this.setPhase("building");
        this.cfg.onWhisper?.("hold [space] to work the wood into a raft. take your time, or don't.");
      }
      return;
    }

    if (this.phase === "building") {
      const near = this.dist(self, this.cfg.assembly) < AT_STATION + 0.4;
      if (near && this.holding) {
        if (this.firstPressAt === 0) this.firstPressAt = now;
        this.buildMs += dtMs;
        const prev = this.progress;
        this.progress = Math.min(1 + DECOR_SPAN_MS / BUILD_FULL_MS, this.progress + dtMs / BUILD_FULL_MS);
        this.cfg.world.setActivityState(this.cfg.selfId, "build", { intensity: 1 });
        if (prev < 1 && this.progress >= 1) this.cfg.onWhisper?.("the raft holds together. it would float.");
      } else {
        // released mid-build (before completion) then this is a pause → count a redo when re-engaged
        if (this.wasHolding && this.progress > 0.05 && this.progress < 1) this.redo++;
        this.cfg.world.setActivityState(this.cfg.selfId, this.gathered > 0 ? "carry" : null, {
          carrying: this.gathered > 0,
        });
      }
      // deliberation = time stood at the wood before the first strike
      if (this.firstPressAt === 0 && near) this.buildMs = 0; // don't count idle deliberation as build time
      this.wasHolding = this.holding && near;

      // Finish: raft complete AND you carry it away toward the water (leaving the workspace = done).
      if (this.progress >= 1 && this.dist(self, this.cfg.assembly) > AT_STATION + 0.6) {
        this.emitAssemble(now);
        this.completeAt = now;
        this.setPhase("built");
        this.cfg.world.setActivityState(this.cfg.selfId, "carry", { carrying: true });
        this.cfg.onWhisper?.("you heft the raft toward the water's edge. push it in when you're ready.");
      }
      return;
    }

    if (this.phase === "built") {
      if (this.dist(self, this.cfg.launch) < AT_STATION && this.holding) {
        this.emitLaunch(now);
        this.cfg.world.setActivityState(this.cfg.selfId, null);
        this.cfg.world.setSailing(true);
        this.setPhase("launched");
        this.cfg.onWhisper?.("you push the raft into the shallows. the water takes it. the far shore waits.");
      }
    }
  }

  private placeRaft() {
    if (this.raftPlaced) return;
    this.raftPlaced = true;
    const snap: EntitySnapshot = {
      id: this.cfg.raftId,
      kind: "npc",
      refId: this.cfg.raftId,
      name: "",
      spriteUrl: RAFT_BUILD.sprites.raft,
      x: this.cfg.assembly.x,
      y: this.cfg.assembly.y,
      facing: "down",
      moving: false,
    };
    this.cfg.world.addEntity(snap);
  }

  private setPhase(p: RaftPhase) {
    if (this.phase === p) return;
    this.phase = p;
    this.cfg.onPhase?.(p);
  }

  // ── the emit contract: continuous MANNER → raw_signals → the existing 16 features (ingest) ──────────
  private emit(action: string, raw: Record<string, unknown>, polarity?: "take" | "refuse") {
    const uid = this.cfg.actorId();
    if (!uid) return;
    const def = (FLOW1_CUES as Record<string, { channel: string; cue: string; targetKind: string }>)[action];
    const ev = buildFlow1Event({
      actorId: uid,
      sessionId: this.cfg.sessionId(),
      channel: (def?.channel ?? "C") as never,
      cue: (def?.cue ?? "C7") as never,
      action,
      polarity,
      targetId: this.cfg.raftId,
      targetKind: (def?.targetKind ?? "structure") as never,
      stakes: "medium",
      raw,
    });
    this.cfg.send([ev]);
  }

  private emitGather(now: number) {
    const total = this.cfg.wood.length;
    this.emit("gather_driftwood", {
      // thoroughness: just-enough (needed/total) ↔ obsessive (all of it) → persistence
      thoroughness01: Math.min(1, this.gathered / total),
      dwell_ms: Math.max(0, now - (this.gatherStartAt || now)),
    });
  }

  private emitAssemble(now: number) {
    const deliberationMs = Math.max(0, this.firstPressAt - this.buildArrivedAt);
    const decoration01 = Math.min(1, Math.max(0, this.progress - 1) / (DECOR_SPAN_MS / BUILD_FULL_MS));
    this.emit("assemble_raft", {
      thoroughness01: Math.min(1, this.progress), // saw the build through → persistence
      ...(this.redo > 0 ? { persist_after_fail: Math.min(1, 0.6 + 0.12 * this.redo) } : {}), // kept going after a slip → grit
      edits: this.redo, // slips/re-engagements → self-monitoring/formality
      decision_latency_ms: deliberationMs, // stood and considered before the first strike → pace
      dwell_ms: this.buildMs, // total time worked → build time-share
      decoration: decoration01, // ⚑ flourish past "done" → openness (carried as ts_build until re-anchor)
    });
  }

  private emitLaunch(now: number) {
    this.emit("launch_raft", {
      decision_latency_ms: Math.max(0, now - (this.completeAt || now)), // commitment latency → pace
    });
  }

  /** Called by the scene if the player leaves F1 without finishing — non-action is data. */
  abandonIfUnfinished() {
    if (this.phase === "building" && this.progress < 1) this.emit("assemble_raft", {}, "refuse");
    else if ((this.phase === "gather" || this.phase === "ready") && !this.gatherEmitted && this.gathered === 0)
      this.emit("gather_driftwood", {}, "refuse");
  }
}
