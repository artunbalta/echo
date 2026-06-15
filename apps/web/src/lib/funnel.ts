"use client";

/**
 * Funnel instrumentation (m3) — lightweight, consented, key-free.
 *
 * Records the *first* time a user reaches each activation milestone and the delay from world
 * entry, so prioritization is evidence-based (time-to-first-conversation, drop-off,
 * sessions-to-first-promotion) instead of vibes. No network, no keys: it writes to
 * localStorage and mirrors the latest marks onto `window.__echoFunnel` for inspection.
 * Respects telemetry consent exactly like the behavioral pipe — declined → nothing recorded.
 */
export type FunnelStage =
  | "world_enter"
  | "first_nearby"
  | "first_conversation"
  | "first_let_echo_answer"
  | "first_feedback"
  | "first_promotion"
  | "handover_start";

interface FunnelRecord {
  t: number; // epoch ms of first occurrence
  sinceEnterMs?: number; // delay from world_enter
}

function telemetryConsented(): boolean {
  try {
    return JSON.parse(localStorage.getItem("echo.consent") ?? "{}").telemetry !== false;
  } catch {
    return true;
  }
}

function key(uid: string): string {
  return `echo.funnel.${uid || "anon"}`;
}

function read(uid: string): Record<string, FunnelRecord> {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) ?? "{}");
  } catch {
    return {};
  }
}

/** Mark a milestone the first time it happens. Idempotent per (user, stage). */
export function markFunnel(uid: string, stage: FunnelStage): void {
  if (typeof window === "undefined" || !telemetryConsented()) return;
  const all = read(uid);
  if (all[stage]) return; // first occurrence only
  const now = Date.now();
  const enter = all.world_enter?.t;
  all[stage] = { t: now, sinceEnterMs: enter ? now - enter : stage === "world_enter" ? 0 : undefined };
  try {
    localStorage.setItem(key(uid), JSON.stringify(all));
  } catch {
    /* private mode / quota — best-effort */
  }
  (window as { __echoFunnel?: unknown }).__echoFunnel = all;
}
