/**
 * The continuous passive locomotion sampler (ECHO_level_design_7flows.md F0 t=5.5–20 beat; the
 * embodied rebuild builds it now, debounced — docs/known-gaps.md #2). It drains PixiWorld's per-frame
 * movement accumulator every ~1.5s, change-thresholds it (an idle window emits nothing), and batches
 * the aggregates into `movement_sample` BehavioralEvents so the manner of *how* someone moves becomes
 * signal without any button.
 *
 * Flood control: ≤1 aggregate per interval, buffered and flushed in batches, hard-capped per flow.
 * ML routing: only `still_ms → solitude_tol` has a W path today; `heading_var`/`speed_var`/
 * `explore_ratio` ride in raw_signals captured for the one-time W re-anchor (unrouted in ingest so a
 * high-frequency sampler cannot bias dominance/warmth before the re-anchor — known-gaps #2/#6).
 */
import type { PixiWorld } from "../PixiWorld";
import { buildFlow1Event, MOVEMENT_SAMPLE, type BehavioralEvent, type LifeStage } from "@echo/shared";

export interface SamplerOpts {
  world: PixiWorld;
  actorId: () => string;
  sessionId: () => string;
  /** POST a batch of events to /observe/behavioral (the scene owns the fetch). */
  send: (events: BehavioralEvent[]) => void;
  intervalMs?: number; // sampling window (default 1500)
  batchSize?: number; // flush after this many buffered samples (default 6)
  maxSamples?: number; // per-flow hard cap (default 48)
  stage?: LifeStage; // context stage stamped on the sample (default 1 = F1)
}

export class LocomotionSampler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private buffer: BehavioralEvent[] = [];
  private count = 0;

  constructor(private opts: SamplerOpts) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.opts.intervalMs ?? 1500);
  }

  private tick() {
    if (this.count >= (this.opts.maxSamples ?? 48)) return; // per-flow cap reached
    const uid = this.opts.actorId();
    if (!uid) return;
    const s = this.opts.world.sampleLocomotion();
    // change-threshold: skip a window where the player barely moved and wasn't still for long — an idle
    // window carries no signal and would only flood ML.
    if (s.distance < 0.35 && s.stillMs < 900) return;
    const ev = buildFlow1Event({
      actorId: uid,
      sessionId: this.opts.sessionId(),
      channel: MOVEMENT_SAMPLE.channel,
      cue: MOVEMENT_SAMPLE.cue,
      action: MOVEMENT_SAMPLE.action,
      targetId: "shore",
      targetKind: "place",
      raw: {
        still_ms: s.stillMs,
        heading_var: s.headingVar,
        speed_var: s.speedVar,
        explore_ratio: s.exploreRatio,
        distance: s.distance,
      },
      contextOverride: this.opts.stage !== undefined ? { stage: this.opts.stage } : undefined,
    });
    this.buffer.push(ev);
    this.count++;
    if (this.buffer.length >= (this.opts.batchSize ?? 6)) this.flush();
  }

  /** Send whatever is buffered now (also called on stop so a partial batch isn't lost). */
  flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer;
    this.buffer = [];
    this.opts.send(batch);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}
