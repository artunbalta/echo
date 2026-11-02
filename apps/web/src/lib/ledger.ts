/**
 * The mirror's record (DECISIONS C61): what each update did to a person's echo. Server-only.
 *
 * The two ingress routes write here after they forward: `/api/observe/behavioral` a row per act, and
 * `/api/telemetry` a row per choice or implicit signal, with walking folded into one row while
 * nothing else moves the echo in between (0027 `echo_ledger_walk`). A row is only ever what the
 * engine reported: its move on each axis and the versions it moved between (`movedOf`). A mocked
 * answer, or an engine from before C61 that reports no move, writes nothing, and an update that
 * moved nothing (a window with nothing in it) is not a row either.
 *
 * Two backends behind one seam, as `behavioral-store.ts` has it: the `echo_ledger` table through the
 * service role, or this process's memory when Supabase is unkeyed, `VILLAGE_STORE=memory` (the dev
 * and test switch for what the world keeps about a stranger), or the write failed. Writes never
 * throw: a mirror that cannot write must not block the act it would have recorded.
 */
import "server-only";

import { PERSONA_AXIS_KEYS, type TelemetryEvent } from "@echo/shared";

import type { LedgerKind, LedgerRow } from "@/lib/mirror";
import { adminClient } from "@/lib/supabaseAdmin";

const TABLE = "echo_ledger";
const AXES = PERSONA_AXIS_KEYS.length;
/** Rows read back for the mirror, newest first. Older ones are "not in this record". */
export const LEDGER_READ = 1000;
/** Rows a subject keeps in memory. */
const RING = 2000;
/** A walk row takes more windows for this long (0027 says ten minutes too). */
const FOLD_MS = 10 * 60 * 1000;

export type LedgerEntry = Omit<LedgerRow, "id" | "at">;

const g = globalThis as unknown as { __echoLedger?: Map<string, LedgerRow[]>; __echoLedgerId?: number; __echoLedgerWarned?: Set<string> };
const ring = (g.__echoLedger ??= new Map());
const warned = (g.__echoLedgerWarned ??= new Set());
const memoryOnly = () => process.env.VILLAGE_STORE === "memory";

/** The move an engine answer reports (C61), or null: a mock, or an engine that reports none. */
export function movedOf(r: { mocked?: boolean; delta?: unknown; version_before?: unknown; version?: unknown }): { delta: number[]; v0: number; v1: number } | null {
  if (r.mocked) return null;
  const d = r.delta;
  if (!Array.isArray(d) || d.length !== AXES || !d.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  if (!Number.isInteger(r.version_before) || !Number.isInteger(r.version)) return null;
  return { delta: d as number[], v0: r.version_before as number, v1: r.version as number };
}

/** An engine answer, as far as the ledger reads it. */
type Result = { mocked?: boolean; delta?: unknown; version_before?: unknown; version?: unknown; polarity?: unknown; cond_key?: unknown; telemetry_used?: unknown };

/** Plain features only: numbers and booleans, at most a dozen, so a row stays small. */
function features(x: unknown): Record<string, number | boolean> | null {
  if (!x || typeof x !== "object") return null;
  const out: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean") out[k] = typeof v === "number" ? Math.round(v * 1000) / 1000 : v;
    if (Object.keys(out).length >= 12) break;
  }
  return Object.keys(out).length ? out : null;
}

const str = (x: unknown): string | null => (typeof x === "string" && x ? x.slice(0, 80) : null);

/** A row for an act forwarded to `/observe/behavioral`, from what came back. */
export function entryForAct(event: Record<string, unknown>, result: Result): LedgerEntry | null {
  const moved = movedOf(result);
  if (!moved || moved.v1 === moved.v0) return null;
  const polarity = result.polarity === "refuse" || event.polarity === "refuse" ? "refuse" : "take";
  return {
    kind: "act",
    action: str(event.action) ?? str(event.cue) ?? "act",
    cue: str(event.cue),
    polarity,
    cond_key: str(result.cond_key),
    read_as: features(result.telemetry_used),
    delta: moved.delta,
    v0: moved.v0,
    v1: moved.v1,
    windows: 1,
  };
}

/** A row for a telemetry event, from what came back: a choice, a walking window, or another signal. */
export function entryForTelemetry(ev: TelemetryEvent, result: Result, choice: boolean, readAs?: Record<string, unknown>): LedgerEntry | null {
  const moved = movedOf(result);
  if (!moved || moved.v1 === moved.v0) return null;
  const kind: LedgerKind = choice ? "choice" : ev.type === "passive_locomotion" ? "walk" : "sense";
  return {
    kind,
    action: ev.type,
    cue: null,
    polarity: null,
    cond_key: null,
    read_as: kind === "walk" ? null : features(readAs ?? ev.payload),
    delta: moved.delta,
    v0: moved.v0,
    v1: moved.v1,
    windows: 1,
  };
}

/** Walking windows that follow one another, folded: deltas added, versions joined. */
export function foldWalks(entries: readonly LedgerEntry[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === "walk" && e.kind === "walk" && prev.v1 === e.v0) {
      out[out.length - 1] = { ...prev, delta: prev.delta.map((d, i) => d + e.delta[i]!), v1: e.v1, windows: prev.windows + e.windows };
    } else out.push({ ...e });
  }
  return out;
}

function remember(subject: string, entries: readonly LedgerEntry[], now = Date.now()): void {
  const rows = ring.get(subject) ?? [];
  for (const e of entries) {
    const last = rows[rows.length - 1];
    if (e.kind === "walk" && last && last.kind === "walk" && last.v1 === e.v0 && now - Date.parse(last.at) < FOLD_MS) {
      rows[rows.length - 1] = { ...last, delta: last.delta.map((d: number, i: number) => d + e.delta[i]!), v1: e.v1, windows: last.windows + e.windows, at: new Date(now).toISOString() };
    } else {
      g.__echoLedgerId = (g.__echoLedgerId ?? 0) + 1;
      rows.push({ ...e, id: g.__echoLedgerId, at: new Date(now).toISOString() });
    }
  }
  if (rows.length > RING) rows.splice(0, rows.length - RING);
  ring.set(subject, rows);
}

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[ledger] ${message}; kept in this process instead`);
}

/** Record what the engine reported, in order. Awaited by the routes; never throws. */
export async function appendLedger(subject: string, entries: readonly LedgerEntry[]): Promise<{ durable: boolean }> {
  const folded = foldWalks(entries);
  if (!folded.length) return { durable: false };
  const admin = memoryOnly() ? null : adminClient();
  if (!admin) {
    remember(subject, folded);
    return { durable: false };
  }
  try {
    for (const e of folded) {
      const { error } =
        e.kind === "walk"
          ? await admin.rpc("echo_ledger_walk", { p_subject: subject, p_delta: e.delta, p_v0: e.v0, p_v1: e.v1, p_windows: e.windows })
          : await admin.from(TABLE).insert({ subject, ...e });
      if (error) throw new Error(error.message);
    }
    return { durable: true };
  } catch (err) {
    warnOnce(`write failed: ${(err as Error).message}`);
    remember(subject, folded);
    return { durable: false };
  }
}

/** The subject's record, oldest first: the latest `LEDGER_READ` rows. `capped` when there may be older ones. */
export async function readLedger(subject: string): Promise<{ rows: LedgerRow[]; source: "table" | "memory"; capped: boolean }> {
  const fromMemory = () => {
    const rows = (ring.get(subject) ?? []).slice(-LEDGER_READ);
    return { rows, source: "memory" as const, capped: (ring.get(subject)?.length ?? 0) > LEDGER_READ };
  };
  const admin = memoryOnly() ? null : adminClient();
  if (!admin) return fromMemory();
  try {
    const { data, error } = await admin.from(TABLE).select("id, at, kind, action, cue, polarity, cond_key, read_as, delta, v0, v1, windows").eq("subject", subject).order("id", { ascending: false }).limit(LEDGER_READ);
    if (error) throw new Error(error.message);
    // A row kept in memory after a failed write is not read back here: its ids are this process's,
    // not the table's. The update it recorded shows as "not in this record", counted by version.
    const rows = ((data ?? []) as LedgerRow[]).map((r) => ({ ...r, id: Number(r.id) })).reverse();
    return { rows, source: "table", capped: rows.length >= LEDGER_READ };
  } catch (err) {
    warnOnce(`read failed: ${(err as Error).message}`);
    return fromMemory();
  }
}

/** Erasure's half that lives in memory (the table is in the account delete route's list). */
export function forgetLedger(subject: string): void {
  ring.delete(subject);
}

/** For tests: empty the in-process record. */
export function resetLedger(): void {
  ring.clear();
  warned.clear();
}
