/**
 * The remaining Flow-1 embodied beats (ECHO_level_design_7flows.md §FLOW 1), as performed activities that
 * share the same manner→raw_signals→ingress contract as the raft build:
 *
 *   plant-vs-eat   — carry the seed and PLANT it at the fertile patch (delayed payoff, save_rate high) OR
 *                    EAT now at the berry bush (instant, save_rate low). A real economic fork, embodied.
 *   gamble cave    — walk to the dark cave mouth; how long you HESITATE at the threshold (decision_latency)
 *                    and whether you ENTER (risk) vs turn back (stay_safe) is the risk cue.
 *   marker study   — press to STUDY the standing stone; the longer you dwell on non-instrumental knowledge
 *                    the more it reveals (dwell → ts_learn / intellect·openness).
 *   buried cache   — HOLD to dig; the cache resists (a few failed strikes) — persisting after failure is the
 *                    grit cue (persist_after_fail → persistence).
 *   shy creature   — appears only if you hold STILL & quiet for ~8s (sit_still → solitude_tol; rewards the
 *                    calm/low-energy end so the flow doesn't only reward go-getters).
 *
 * One manager owns a single rAF loop + one action-key listener and drives whichever beat the player is at,
 * so it never fights the raft-build controller (their zones are disjoint). All animation is procedural
 * (PixiWorld.setActivityState); everything routes through buildFlow1Event → /observe/behavioral.
 */
import type { PixiWorld, ActivityKind } from "../PixiWorld";
import { buildFlow1Event, FLOW1_CUES, type BehavioralEvent, type EntitySnapshot } from "@echo/shared";

export interface BeatSpec {
  id: string; // the target entity id (already placed in the scene)
  pos: { x: number; y: number };
  mode: "press" | "dwell" | "hold";
  anim: ActivityKind;
  prompt: string; // shown when the player is in range
  action: string; // the cue action (must exist in FLOW1_CUES + ingest._EMBODIED_CUES)
  reveal?: string; // whisper on completion/reveal
  needMs?: number; // dwell target OR hold full duration
  fails?: number; // hold: number of resisting "slips" before it yields → persist_after_fail
  leaveAction?: string; // press: emit this if the player lingers then leaves without acting (cave → stay_safe)
  /** Gate: the beat only offers itself while this returns true (e.g. plant disabled once the seed is used). */
  enabled?: () => boolean;
  /** Called when this beat completes (e.g. consume the shared seed, disable the other fork). */
  onDone?: () => void;
}

export interface Flow1BeatsConfig {
  world: PixiWorld;
  beats: BeatSpec[];
  actorId: () => string;
  sessionId: () => string;
  send: (events: BehavioralEvent[]) => void;
  onWhisper?: (t: string | null) => void;
  onPrompt?: (t: string | null) => void;
  /** Shy-creature stillness beat: fires sit_still after ~stillMs of no movement, spawns the creature. */
  stillness?: { creatureId: string; near: { x: number; y: number }; stillMs?: number };
}

const RANGE = 1.1; // "at the spot" radius (tiles)
const THRESHOLD = 2.2; // outer radius where hesitation at a spot (e.g. the cave mouth) starts counting

interface BeatState { arrivedAt: number; nearMs: number; studying: boolean; dwellMs: number; holdMs: number; slips: number; done: boolean; wasHolding: boolean; }

export class Flow1Beats {
  private st = new Map<string, BeatState>();
  private actionDown = false;
  private activeId: string | null = null;
  private lastTick = 0;
  private raf = 0;
  private disposed = false;
  // stillness
  private lastPos = { x: 0, y: 0 };
  private stillAccum = 0;
  private creatureShown = false;

  constructor(private cfg: Flow1BeatsConfig) {
    for (const b of cfg.beats) this.st.set(b.id, { arrivedAt: 0, nearMs: 0, studying: false, dwellMs: 0, holdMs: 0, slips: 0, done: false, wasHolding: false });
  }

  start() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.lastPos = this.cfg.world.getSelfTile();
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
      if (!this.actionDown) { this.actionDown = true; this.onPressEdge(); }
    } else {
      this.actionDown = false;
    }
  };

  private beat(id: string | null) {
    return this.cfg.beats.find((b) => b.id === id);
  }

  private dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onPressEdge() {
    const b = this.beat(this.activeId);
    if (!b) return;
    const s = this.st.get(b.id)!;
    if (s.done || (b.enabled && !b.enabled())) return;
    if (b.mode === "press") this.completePress(b, s);
    else if (b.mode === "dwell") s.studying = true; // hold-free dwell; accrues in tick while near
    // hold mode: handled by the held level in tick
  }

  private tick(now: number) {
    const dtMs = now - this.lastTick;
    this.lastTick = now;
    const self = this.cfg.world.getSelfTile();

    // ── stillness → the shy creature ──
    if (this.cfg.stillness && !this.creatureShown) {
      const moved = this.dist(self, this.lastPos);
      if (moved < 0.06) this.stillAccum += dtMs; else this.stillAccum = 0;
      this.lastPos = self;
      if (this.stillAccum >= (this.cfg.stillness.stillMs ?? 8000)) {
        this.creatureShown = true;
        this.spawnCreature();
        this.emit("sit_still", { still_ms: this.stillAccum });
        this.cfg.onWhisper?.("you kept still, and something small crept out of the grass to look at you.");
      }
    } else {
      this.lastPos = self;
    }

    // ── the nearest enabled, not-done beat becomes the active one (shows its prompt) ──
    let active: BeatSpec | null = null;
    let bestD = RANGE;
    for (const b of this.cfg.beats) {
      const s = this.st.get(b.id)!;
      if (s.done || (b.enabled && !b.enabled())) continue;
      const d = this.dist(self, b.pos);
      // count hesitation at the threshold of a press beat (the cave mouth) even before entering range
      if (b.mode === "press" && d < THRESHOLD) s.nearMs += dtMs; else if (b.mode === "press" && d >= THRESHOLD) {
        // left the threshold after lingering without acting → the alternative (e.g. stay_safe)
        if (b.leaveAction && s.nearMs > 700 && !s.done) { s.done = true; this.emit(b.leaveAction, { risk01: 0.1, decision_latency_ms: s.nearMs }); b.onDone?.(); this.cfg.onWhisper?.("you think better of it, and step back from the dark."); }
        s.nearMs = 0;
      }
      if (d < bestD) { bestD = d; active = b; }
    }
    // prompt for the active beat
    if ((active?.id ?? null) !== this.activeId) {
      this.activeId = active?.id ?? null;
      this.cfg.onPrompt?.(active ? active.prompt : null);
      // leaving a dwell beat without a second press → finish it
    }

    // ── drive the active beat's per-frame state ──
    for (const b of this.cfg.beats) {
      const s = this.st.get(b.id)!;
      if (s.done) continue;
      const near = this.dist(self, b.pos) < RANGE + (b.mode === "hold" ? 0.4 : 0);
      if (b.mode === "dwell" && s.studying) {
        if (near) {
          s.dwellMs += dtMs;
          this.cfg.world.setSelfActivityState(b.anim, {});
          if (b.reveal && s.dwellMs > (b.needMs ?? 2500) && !s.wasHolding) { s.wasHolding = true; this.cfg.onWhisper?.(b.reveal); }
        } else {
          // walked away from the stone → the study is over; emit what was learned
          s.studying = false; s.done = true;
          this.cfg.world.setSelfActivityState(null);
          this.emit(b.action, { dwell_ms: s.dwellMs });
          b.onDone?.();
        }
      } else if (b.mode === "hold") {
        const holding = this.actionDown && near && this.activeId === b.id;
        if (holding) {
          s.holdMs += dtMs;
          this.cfg.world.setSelfActivityState(b.anim, { intensity: 1 });
          // resistance: the cache yields only after `fails` slips (persistence after failure)
          const per = (b.needMs ?? 3600) / ((b.fails ?? 2) + 1);
          if (s.slips < (b.fails ?? 2) && s.holdMs > per * (s.slips + 1)) {
            s.slips++;
            this.cfg.onWhisper?.("the earth resists — the spade slips. you set your feet and dig again.");
          }
          if (s.holdMs >= (b.needMs ?? 3600)) {
            s.done = true;
            this.cfg.world.setSelfActivityState(null);
            this.emit(b.action, { persist_after_fail: Math.min(1, 0.55 + 0.15 * s.slips), dwell_ms: s.holdMs });
            if (b.reveal) this.cfg.onWhisper?.(b.reveal);
            b.onDone?.();
          }
        } else if (!near || this.activeId !== b.id) {
          if (b.anim && this.activeId !== b.id) this.cfg.world.setSelfActivityState(null);
        }
      }
    }
  }

  private completePress(b: BeatSpec, s: BeatState) {
    s.done = true;
    this.cfg.world.setSelfActivityState(b.anim, {});
    setTimeout(() => !this.disposed && this.cfg.world.setSelfActivityState(null), 700);
    // manner: plant vs eat → save_rate; cave enter → risk + hesitation
    const raw: Record<string, unknown> =
      b.action === "plant_seed" ? { delayed: true }
      : b.action === "eat_now" ? { delayed: false }
      : b.action === "enter_cave" ? { risk01: 0.8, decision_latency_ms: s.nearMs }
      : {};
    this.emit(b.action, raw);
    if (b.reveal) this.cfg.onWhisper?.(b.reveal);
    b.onDone?.();
    if (this.activeId === b.id) { this.activeId = null; this.cfg.onPrompt?.(null); }
  }

  private spawnCreature() {
    const st = this.cfg.stillness!;
    const snap: EntitySnapshot = {
      id: st.creatureId, kind: "npc", refId: st.creatureId, name: "",
      spriteUrl: "proc:shy_creature", x: st.near.x, y: st.near.y, facing: "down", moving: false,
    };
    this.cfg.world.addEntity(snap);
    this.cfg.world.setEntityDisplayHeight(st.creatureId, 14);
  }

  private emit(action: string, raw: Record<string, unknown>, polarity?: "take" | "refuse") {
    const uid = this.cfg.actorId();
    if (!uid) return;
    const def = (FLOW1_CUES as Record<string, { channel: string; cue: string; targetKind: string }>)[action];
    const ev = buildFlow1Event({
      actorId: uid, sessionId: this.cfg.sessionId(),
      channel: (def?.channel ?? "C") as never, cue: (def?.cue ?? "C7") as never, action, polarity,
      targetId: action, targetKind: (def?.targetKind ?? "structure") as never,
      stakes: action === "enter_cave" ? "high" : "medium", raw,
    });
    this.cfg.send([ev]);
  }
}
