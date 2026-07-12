/**
 * Client-side telemetry collector (§9.1). Buffers implicit revealed-preference signals
 * and flushes them in batches to the realtime server, which forwards to the ML loop.
 * Debounced; never blocks rendering. Consent-gated at the SOURCE: a collector built
 * with `enabled: false` records nothing at all (event-schema §5 — telemetry off, the
 * world fully playable, emits nothing; not even into the buffer).
 */
import type { TelemetryEvent, TelemetryType } from "@echo/shared";

type Sender = (events: TelemetryEvent[]) => void;

export class TelemetryCollector {
  private buf: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sessionId: string,
    private send: Sender,
    private flushMs = 2000,
    private enabled = true,
  ) {}

  start() {
    if (this.timer || !this.enabled) return;
    this.timer = setInterval(() => this.flush(), this.flushMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
  }

  emit(type: TelemetryType, payload: Record<string, unknown> = {}) {
    if (!this.enabled) return; // consent off → nothing is recorded, not even buffered
    this.buf.push({ type, sessionId: this.sessionId, ts: Date.now(), payload });
    if (this.buf.length >= 25) this.flush();
  }

  flush() {
    if (!this.buf.length) return;
    const batch = this.buf;
    this.buf = [];
    try {
      this.send(batch);
    } catch {
      // drop on failure; telemetry is best-effort
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LocomotionSampler — the continuous passive movement channel (P3; closes
// known-gaps #2). Locomotion is the least-fakeable cue channel (blueprint II.4)
// and the openness apparatus: HOW you cover ground — novelty-seeking breadth,
// wander vs beeline, backtracking — is what the ★ W re-anchor (P5) will load
// onto `openness`. Until then the scalars flow and are recorded, nothing more.
//
// Constraints (the exact known-gaps #2 bar):
//   • ≤1 `passive_locomotion` event per EMIT_MS (~1.5 s) — never floods /observe
//   • debounced: an idle window (no real movement) emits NOTHING
//   • change-thresholded: a window that looks like the last emitted one is skipped
//   • hard per-day cap: after MAX_EMITS_PER_DAY the sampler stays silent
// Scalars only — never positions, never paths (§4.4).
// ════════════════════════════════════════════════════════════════════════════

export interface LocomotionScalars {
  /** Mean |heading delta| per second over the window, radians/s. Wandery ↑. */
  heading_change_rate: number;
  /** Path length / net displacement (≥1; clamped). Beeline ≈ 1, meander ↑. */
  path_tortuosity: number;
  /** Fraction of tiles touched this window never visited before this day. Novelty ↑. */
  novel_tile_ratio: number;
  /** Fraction of consecutive segment pairs that reverse (>135°). Backtracking ↑. */
  backtrack_rate: number;
  /** ms of the window spent effectively still (speed < eps) — dwell points. */
  dwell_ms: number;
  /** Distinct tiles touched this window (volume context for the ratios). */
  tiles: number;
}

const SAMPLE_MS = 250; // position sample cadence
const EMIT_MS = 1500; // at most one event per window (the gap #2 bar)
const MIN_PATH_TILES = 0.5; // a window with less real movement is idle → no emit
const CHANGE_EPS = 0.05; // min scalar delta vs last emit to count as "changed"
const MAX_EMITS_PER_DAY = 400; // hard daily cap
const MAX_VISITED = 30_000; // visited-tile memory bound

export class LocomotionSampler {
  private samples: { x: number; y: number; t: number }[] = [];
  private lastSampleAt = 0;
  private lastEmitAt = 0;
  private lastEmitted: LocomotionScalars | null = null;
  private visited = new Set<string>();
  private emitsToday = 0;

  constructor(private emit: (scalars: LocomotionScalars) => void) {}

  /** Feed the local player's predicted position; call freely (internally throttled). */
  feed(x: number, y: number, now = Date.now()) {
    if (now - this.lastSampleAt >= SAMPLE_MS) {
      this.lastSampleAt = now;
      this.samples.push({ x, y, t: now });
      // keep ~2 windows of history
      const cutoff = now - EMIT_MS * 2;
      while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    }
    if (now - this.lastEmitAt >= EMIT_MS) {
      this.lastEmitAt = now;
      this.tryEmit(now);
    }
  }

  /** New day → novelty resets with the world (yesterday's ground can be novel again). */
  resetDay() {
    this.samples = [];
    this.visited.clear();
    this.emitsToday = 0;
    this.lastEmitted = null;
  }

  private tryEmit(now: number) {
    if (this.emitsToday >= MAX_EMITS_PER_DAY) return; // hard daily cap
    const win = this.samples.filter((s) => s.t >= now - EMIT_MS);
    if (win.length < 3) return;

    // Segments + path length.
    let pathLen = 0;
    let dwellMs = 0;
    const headings: number[] = [];
    for (let i = 1; i < win.length; i++) {
      const dx = win[i].x - win[i - 1].x;
      const dy = win[i].y - win[i - 1].y;
      const seg = Math.hypot(dx, dy);
      pathLen += seg;
      if (seg < 0.05) dwellMs += win[i].t - win[i - 1].t;
      else headings.push(Math.atan2(dy, dx));
    }
    if (pathLen < MIN_PATH_TILES) return; // idle window → debounced, nothing emitted

    // Heading dynamics.
    let headingDelta = 0;
    let reversals = 0;
    for (let i = 1; i < headings.length; i++) {
      let d = Math.abs(headings[i] - headings[i - 1]);
      if (d > Math.PI) d = 2 * Math.PI - d;
      headingDelta += d;
      if (d > (3 * Math.PI) / 4) reversals++;
    }
    const windowSec = (win[win.length - 1].t - win[0].t) / 1000 || 1;
    const net = Math.hypot(win[win.length - 1].x - win[0].x, win[win.length - 1].y - win[0].y);

    // Novel tiles this window vs the day's visited set.
    const winTiles = new Set<string>();
    let novel = 0;
    for (const s of win) {
      const key = `${Math.round(s.x)},${Math.round(s.y)}`;
      if (winTiles.has(key)) continue;
      winTiles.add(key);
      if (!this.visited.has(key)) {
        novel++;
        if (this.visited.size < MAX_VISITED) this.visited.add(key);
      }
    }

    const scalars: LocomotionScalars = {
      heading_change_rate: Number((headingDelta / windowSec).toFixed(3)),
      path_tortuosity: Number(Math.min(10, pathLen / Math.max(net, 0.05)).toFixed(3)),
      novel_tile_ratio: Number((novel / Math.max(1, winTiles.size)).toFixed(3)),
      backtrack_rate: Number((headings.length > 1 ? reversals / (headings.length - 1) : 0).toFixed(3)),
      dwell_ms: Math.round(dwellMs),
      tiles: winTiles.size,
    };

    // Change threshold: a window statistically like the last emitted one is skipped.
    const last = this.lastEmitted;
    if (
      last &&
      Math.abs(scalars.heading_change_rate - last.heading_change_rate) < CHANGE_EPS &&
      Math.abs(scalars.path_tortuosity - last.path_tortuosity) < CHANGE_EPS &&
      Math.abs(scalars.novel_tile_ratio - last.novel_tile_ratio) < CHANGE_EPS &&
      Math.abs(scalars.backtrack_rate - last.backtrack_rate) < CHANGE_EPS
    ) {
      return;
    }
    this.lastEmitted = scalars;
    this.emitsToday++;
    this.emit(scalars);
  }
}
