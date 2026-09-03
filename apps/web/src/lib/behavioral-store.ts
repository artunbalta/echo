/**
 * The durable record of measurement (plan W5-0). Every event a room-less session sends to the
 * learning engine passes through here on the way: the two ingress routes (/api/observe/behavioral
 * and /api/telemetry) call recordEvents() and put its `durable` flag in their JSON, and
 * /api/telemetry/recent reads readRecent() back for the inspector.
 *
 * Two backends behind one seam, as island-state.ts has it:
 *   • Supabase `behavioral_events` (db/migrations/0011) through the service-role client.
 *   • a bounded in-memory ring of RING_SIZE rows when Supabase is unkeyed or the insert fails.
 *
 * The flag is honest. recordEvents() AWAITS the insert and reports what actually happened; there
 * is no fire-and-forget path, because a `durable:true` that really meant "queued, probably" is
 * worse than none: the inspector prints this flag beside every event and the erasure cascade
 * trusts it. The ring is per serverless instance and vanishes on cold start, so a read from it is
 * labelled `source:"ring"` and nobody mistakes it for history. Server-only.
 */
import "server-only";
import { CUE_FOR_TYPE, type BehavioralEvent, type TelemetryEvent } from "@echo/shared";
import { adminClient } from "@/lib/supabaseAdmin";

export type StoredKind = "behavioral" | "telemetry";

/** One row of behavioral_events, in the table's own column names. */
export interface BehavioralEventRow {
  kind: StoredKind;
  actor_id: string;
  session_id: string | null;
  /** ISO timestamp of the act, from the client's clock. */
  t: string;
  type: string;
  channel: string | null;
  cue: string | null;
  action: string;
  polarity: "take" | "refuse" | null;
  target_json: Record<string, unknown> | null;
  context_json: Record<string, unknown> | null;
  raw_signals_json: Record<string, unknown> | null;
  payload_json: Record<string, unknown>;
  session_mode: string | null;
  provenance: string | null;
}

/** A row as read back: the write shape plus what the database (or the ring) stamped on it. */
export interface StoredEventRow extends BehavioralEventRow {
  id: string;
  created_at: string;
}

export interface RecordResult {
  durable: boolean;
  /** Why not, when not: "supabase_unkeyed" | "insert_failed: <message>" | "nothing_to_record". */
  reason?: string;
}

export interface RecentEvents {
  rows: StoredEventRow[];
  source: "table" | "ring";
  reason?: string;
}

const TABLE = "behavioral_events";
const RING_SIZE = 500;

// The ring lives on globalThis so Next dev's module reloads do not wipe it between requests, for
// the same reason the island-state memory store does. It is one instance's memory, nothing more.
const g = globalThis as unknown as { __echoBehavioralRing?: StoredEventRow[] };
const ring = (g.__echoBehavioralRing ??= []);

function remember(rows: BehavioralEventRow[]): StoredEventRow[] {
  const stamped = rows.map((r) => ({ ...r, id: `ring-${crypto.randomUUID()}`, created_at: new Date().toISOString() }));
  ring.push(...stamped);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
  return stamped;
}

function fromRing(actorId: string, limit: number): StoredEventRow[] {
  return ring.filter((r) => r.actor_id === actorId).slice(-limit).reverse();
}

/**
 * Persist rows, awaited. `durable:true` means the insert returned without error; anything else
 * means the rows went to the ring and `reason` says why. Never throws: measurement must not
 * block the player, but it must not lie about being kept either.
 */
export async function recordEvents(rows: BehavioralEventRow[]): Promise<RecordResult> {
  if (!rows.length) return { durable: false, reason: "nothing_to_record" };
  const admin = adminClient();
  if (!admin) {
    remember(rows);
    return { durable: false, reason: "supabase_unkeyed" };
  }
  try {
    const { error } = await admin.from(TABLE).insert(rows);
    if (error) throw new Error(error.message);
    return { durable: true };
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[behavioral-store] insert of ${rows.length} row(s) failed, kept in the ring: ${message}`);
    remember(rows);
    return { durable: false, reason: `insert_failed: ${message}` };
  }
}

/** The last n rows for one actor, newest first: from the table when it can be read, else the ring. */
export async function readRecent(actorId: string, n = 25): Promise<RecentEvents> {
  const limit = Math.max(1, Math.min(200, Math.floor(n) || 25));
  const admin = adminClient();
  if (!admin) return { rows: fromRing(actorId, limit), source: "ring", reason: "supabase_unkeyed" };
  try {
    const { data, error } = await admin
      .from(TABLE)
      .select("*")
      .eq("actor_id", actorId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as StoredEventRow[], source: "table" };
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`[behavioral-store] select failed, reading the ring: ${message}`);
    return { rows: fromRing(actorId, limit), source: "ring", reason: `select_failed: ${message}` };
  }
}

/**
 * The row for a BehavioralEvent envelope as the client sent it. Null without an actor_id: there is
 * no silo for it to land in, and ML rejects it on the same ground.
 */
export function rowFromBehavioral(ev: Record<string, unknown>): BehavioralEventRow | null {
  const e = ev as Partial<BehavioralEvent>;
  if (typeof e.actor_id !== "string" || !e.actor_id) return null;
  return {
    kind: "behavioral",
    actor_id: e.actor_id,
    session_id: str(e.sessionId) || null,
    t: iso(e.t),
    type: str(e.type) || "unknown",
    channel: str(e.channel) || null,
    cue: str(e.cue) || null,
    action: str(e.action) || str(e.cue) || str(e.type) || "unknown",
    polarity: e.polarity === "refuse" ? "refuse" : e.polarity === "take" ? "take" : null,
    target_json: obj(e.target),
    context_json: obj(e.context),
    raw_signals_json: obj(e.raw_signals),
    payload_json: obj(e.payload) ?? {},
    session_mode: str(e.session_mode) || null,
    provenance: str(e.provenance) || null,
  };
}

/**
 * The row for a TelemetryEvent on the /api/telemetry path. channel and cue come from the static
 * CUE_FOR_TYPE map so the row reads beside the behavioral ones; the envelope fields it never had
 * (polarity, target, context, raw_signals) stay null.
 */
export function rowFromTelemetry(actorId: string, sessionId: string | undefined, ev: TelemetryEvent): BehavioralEventRow {
  const map = CUE_FOR_TYPE[ev.type] as { channel: string; cue: string } | undefined;
  return {
    kind: "telemetry",
    actor_id: actorId,
    session_id: sessionId ?? (str(ev.sessionId) || null),
    t: iso(ev.ts),
    type: str(ev.type) || "unknown",
    channel: map?.channel ?? null,
    cue: map?.cue ?? null,
    action: str(ev.type) || "unknown",
    polarity: null,
    target_json: null,
    context_json: null,
    raw_signals_json: null,
    payload_json: obj(ev.payload) ?? {},
    session_mode: str(ev.session_mode) || null,
    provenance: null,
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const iso = (t: unknown): string =>
  typeof t === "number" && Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
