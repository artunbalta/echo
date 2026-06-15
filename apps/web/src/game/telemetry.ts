/**
 * Client-side telemetry collector (§9.1). Buffers implicit revealed-preference signals
 * and flushes them in batches to the realtime server, which forwards to the ML loop.
 * Debounced; never blocks rendering.
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
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
  }

  emit(type: TelemetryType, payload: Record<string, unknown> = {}) {
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
