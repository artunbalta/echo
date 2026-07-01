/**
 * The raft build — the flagship EMBODIED activity (ECHO_level_design_7flows.md §FLOW 1, the doc's own
 * headline "building a raft" example). A *performed* activity, not a button menu:
 *
 *   gather  — you walk up to a piece of driftwood and PRESS to pick it up (a deliberate, embodied pick,
 *             not a passive walk-over). How much you gather — just the minimum ↔ every last piece — is the
 *             thoroughness cue. A side counter shows how many a raft needs.
 *   assemble— you stand at the shore's edge and HOLD to work the wood: an animated, rhythmic build. How
 *             long you deliberate first (pace), whether you slip and re-engage (redo → self-monitoring),
 *             how long you persist, and whether you keep going past "done" to add a flourish (decoration →
 *             openness ⚑) are all cues.
 *   launch  — you push the finished raft into the water (the commitment moment → the F1→F2 seam).
 *
 * The measurement is the MANNER (continuous raw_signals), never a discrete choice — so two people building
 * the same raft in different styles move their posteriors measurably differently. Everything routes through
 * the proven /observe/behavioral ingress via buildFlow1Event (solo context). Animation is procedural
 * (PixiWorld.setActivityState), so it runs zero-key with no new sprite art.
 */
import type { PixiWorld } from "../PixiWorld";
import { buildFlow1Event, FLOW1_CUES, RAFT_BUILD, type BehavioralEvent, type EntitySnapshot } from "@echo/shared";

export type RaftPhase = "gather" | "ready" | "building" | "built" | "launched";

export interface RaftBuildConfig {
  world: PixiWorld;
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
  /** A driftwood piece is in pick range (show a "pick" prompt) — null when none is. */
  onNearWood?: (id: string | null) => void;
  /** Gather counter changed (for the side "driftwood N / needed" readout). */
  onProgress?: (g: { gathered: number; needed: number; total: number }) => void;
  /** The raft was pushed off (the F1→F2 seam). The caller unlocks sailing — client-side in the solo
   *  slice (world.setSailing), or authoritatively in /play (net.sendSetSail). Falls back to
   *  world.setSailing(true) if omitted. */
  onLaunched?: () => void;
}

const BUILD_FULL_MS = 4200; // total held time to complete the raft (0..1 progress)
const DECOR_SPAN_MS = 2600; // extra held time past "done" that reads as full decoration (0..1)
const PICK = 0.85; // pick range (tiles) — walk up to a plank to pick it
const AT_STATION = 1.1; // "at the assembly / launch spot" radius (tiles)

export class RaftBuild {
  private phase: RaftPhase = "gather";
  private remaining: { id: string; x: number; y: number }[];
  private gathered = 0;
  private total: number;
  private gatherStartAt = 0;
  private gatherEmitted = false;
  private nearWoodId: string | null = null;

  // build accounting
  private buildArrivedAt = 0;
  private firstPressAt = 0;
  private buildMs = 0;
  private progress = 0; // 0..1 = building, up to ~1.6 with decoration
  private redo = 0;
  private wasHolding = false;
  private completeAt = 0;
  private raftPlaced = false;

  private actionDown = false; // action key currently held (build hold + rising-edge picks/launch)
  private raf = 0;
  private lastTick = 0;
  private disposed = false;

  constructor(private cfg: RaftBuildConfig) {
    this.remaining = [...cfg.wood];
    this.total = cfg.wood.length;
  }

  start() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.cfg.onProgress?.({ gathered: 0, needed: this.cfg.needed, total: this.total });
    this.cfg.onWhisper?.("driftwood lies along the shore. walk up to a piece and pick it up — a raft could cross this.");
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
      if (this.dist(self, this.cfg.launch) < AT_STATION) this.launch();
    }
  }

  private pick(id: string) {
    const idx = this.remaining.findIndex((w) => w.id === id);
    if (idx < 0) return;
    const w = this.remaining.splice(idx, 1)[0];
    this.cfg.world.removeEntity(w.id);
    this.gathered++;
    if (!this.gatherStartAt) this.gatherStartAt = performance.now();
    this.nearWoodId = null;
    this.cfg.onNearWood?.(null);
    this.cfg.onProgress?.({ gathered: this.gathered, needed: this.cfg.needed, total: this.total });
    // a brief embodied stoop, then keep the carried-wood overlay
    this.cfg.world.setSelfActivityState("gather", { carrying: true });
    this.cfg.onWhisper?.(
      this.gathered < this.cfg.needed
        ? `you pick up a length of driftwood.`
        : `you have enough for a raft now — but there is more, if you want it.`,
    );
    if (this.gathered >= this.cfg.needed && this.phase === "gather") this.setPhase("ready");
  }

  private dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private tick(now: number) {
    const dtMs = now - this.lastTick;
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
      // Keep the carried-wood overlay while you have wood (cleared just after a fresh stoop).
      this.cfg.world.setSelfActivityState(this.gathered > 0 ? "carry" : null, {
        carrying: this.gathered > 0,
      });

      // Arriving at the shore's edge with wood begins the build.
      if (this.gathered >= 1 && this.dist(self, this.cfg.assembly) < AT_STATION) {
        if (!this.gatherEmitted) {
          this.emitGather(now);
          this.gatherEmitted = true;
        }
        this.nearWoodId = null;
        this.cfg.onNearWood?.(null);
        this.buildArrivedAt = now;
        this.firstPressAt = 0;
        this.buildMs = 0;
        this.placeRaft();
        this.setPhase("building");
        this.cfg.onWhisper?.("hold [space] to work the wood into a raft. take your time, or don't.");
      }
      return;
    }

    if (this.phase === "building") {
      const near = this.dist(self, this.cfg.assembly) < AT_STATION + 0.4;
      const holding = this.actionDown && near;
      if (holding) {
        if (this.firstPressAt === 0) this.firstPressAt = now;
        this.buildMs += dtMs;
        const prev = this.progress;
        this.progress = Math.min(1 + DECOR_SPAN_MS / BUILD_FULL_MS, this.progress + dtMs / BUILD_FULL_MS);
        this.cfg.world.setSelfActivityState("build", { intensity: 1 });
        if (prev < 1 && this.progress >= 1) this.cfg.onWhisper?.("the raft holds together. it would float. carry it to the water when you're ready.");
      } else {
        // released mid-build (before completion) → a redo when re-engaged
        if (this.wasHolding && this.progress > 0.05 && this.progress < 1) this.redo++;
        this.cfg.world.setSelfActivityState("carry", { carrying: true });
      }
      // deliberation = time stood at the wood before the first strike (not counted as build time)
      if (this.firstPressAt === 0 && near) this.buildMs = 0;
      this.wasHolding = holding;

      // Finish: raft complete AND you carry it away toward the water (leaving the workspace = done).
      if (this.progress >= 1 && this.dist(self, this.cfg.assembly) > AT_STATION + 0.6) {
        this.emitAssemble(now);
        this.completeAt = now;
        this.setPhase("built");
        this.cfg.world.setSelfActivityState("carry", { carrying: true });
        this.cfg.onWhisper?.("you heft the raft toward the water's edge. press [space] to push it in.");
      }
      return;
    }
    // "built" → launch is handled on the action-key rising edge (onPressEdge); "launched" is terminal.
  }

  private placeRaft() {
    if (this.raftPlaced) return;
    this.raftPlaced = true;
    const snap: EntitySnapshot = {
      id: this.cfg.raftId, kind: "npc", refId: this.cfg.raftId, name: "",
      spriteUrl: RAFT_BUILD.sprites.raft, x: this.cfg.assembly.x, y: this.cfg.assembly.y,
      facing: "down", moving: false,
    };
    this.cfg.world.addEntity(snap);
    this.cfg.world.setEntityDisplayHeight(this.cfg.raftId, RAFT_BUILD.displayH.raft);
  }

  private launch() {
    this.emitLaunch(performance.now());
    this.cfg.world.setSelfActivityState(null);
    if (this.cfg.onLaunched) this.cfg.onLaunched();
    else this.cfg.world.setSailing(true); // solo slice: unlock sailing client-side
    this.setPhase("launched");
    this.cfg.onWhisper?.("you push the raft into the shallows. the water takes it. the far shore waits.");
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
      actorId: uid, sessionId: this.cfg.sessionId(),
      channel: (def?.channel ?? "C") as never, cue: (def?.cue ?? "C7") as never, action, polarity,
      targetId: this.cfg.raftId, targetKind: (def?.targetKind ?? "structure") as never, stakes: "medium", raw,
    });
    this.cfg.send([ev]);
  }

  private emitGather(now: number) {
    this.emit("gather_driftwood", {
      // thoroughness: minimum (needed/total) ↔ obsessive (all of it) → persistence
      thoroughness01: Math.min(1, this.gathered / this.total),
      dwell_ms: Math.max(0, now - (this.gatherStartAt || now)),
    });
  }

  private emitAssemble(now: number) {
    const deliberationMs = Math.max(0, this.firstPressAt - this.buildArrivedAt);
    const decoration01 = Math.min(1, Math.max(0, this.progress - 1) / (DECOR_SPAN_MS / BUILD_FULL_MS));
    this.emit("assemble_raft", {
      thoroughness01: Math.min(1, this.progress),
      ...(this.redo > 0 ? { persist_after_fail: Math.min(1, 0.6 + 0.12 * this.redo) } : {}),
      edits: this.redo,
      decision_latency_ms: deliberationMs,
      dwell_ms: this.buildMs,
      decoration: decoration01,
    });
  }

  private emitLaunch(now: number) {
    this.emit("launch_raft", { decision_latency_ms: Math.max(0, now - (this.completeAt || now)) });
  }

  /** Called by the scene if the player leaves F1 without finishing — non-action is data. */
  abandonIfUnfinished() {
    if (this.phase === "building" && this.progress < 1) this.emit("assemble_raft", {}, "refuse");
    else if ((this.phase === "gather" || this.phase === "ready") && !this.gatherEmitted && this.gathered === 0)
      this.emit("gather_driftwood", {}, "refuse");
  }
}
