/**
 * Thin persistence layer for the realtime server. Writes interactions/telemetry to
 * Supabase via the REST endpoint using the service-role key. No-ops gracefully when
 * Supabase isn't configured, so the world runs locally with zero backend.
 */
import type { TelemetryEvent, BehavioralEvent } from "@echo/shared";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ML_URL = process.env.ML_SERVICE_URL;
const ML_TOKEN = process.env.ML_SERVICE_TOKEN ?? "";

const enabled = Boolean(SUPABASE_URL && SERVICE_KEY);
let warned = false;
function warnOnce() {
  if (!warned) {
    warned = true;
    console.warn("[persistence] Supabase not configured — telemetry/interactions are in-memory only.");
  }
}

async function insert(table: string, row: Record<string, unknown>) {
  if (!enabled) {
    warnOnce();
    return;
  }
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SERVICE_KEY!,
      authorization: `Bearer ${SERVICE_KEY}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  });
}

export async function logTelemetry(
  userId: string,
  sessionId: string | undefined,
  ev: TelemetryEvent,
) {
  // Forward to ML service for online featurization (§9.1) — fire and forget.
  if (ML_URL) {
    fetch(`${ML_URL}/telemetry`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ML_TOKEN}` },
      body: JSON.stringify({ userId, sessionId, event: ev }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  }
  await insert("telemetry_events", {
    user_id: userId,
    session_id: sessionId ?? null,
    type: ev.type,
    payload_json: ev.payload ?? {},
  }).catch(() => {});
}

/**
 * Forward one BehavioralEvent envelope to the proven per-actor measurement ingress
 * (ML POST /observe/behavioral → ingest → persona.observe). This is the SAME spine the solitary
 * flows use — NOT a parallel path. The realtime server is authoritative for a live player↔player
 * interaction, so it emits one event PER actor (each from that actor's vantage) here; the ingress
 * enforces mandatory context (422) and routes strictly by actor_id into that actor's own posterior.
 * Fire-and-forget, best-effort: a no-op when ML isn't configured, so the room never blocks.
 * Returns the ML response (or null) so an integration test can assert the emission.
 */
async function postObservation(event: BehavioralEvent): Promise<unknown | null> {
  if (!ML_URL) {
    warnOnce();
    return null;
  }
  try {
    const res = await fetch(`${ML_URL}/observe/behavioral`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ML_TOKEN}` },
      body: JSON.stringify({ event }),
      signal: AbortSignal.timeout(8000),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * One in-flight observation per actor at a time.
 *
 * A persona update is a read-modify-write on that actor's posterior, so two updates for the SAME
 * actor in flight at once lose one of them. This is not hypothetical: the F4 interaction-path
 * siloing check found it. `emitFirstContact` fires TWO events per actor back to back with `void`,
 * and the ML service recorded both in the behavior index while advancing the posterior only once —
 * four events, four behaviors, two versions. Eight concurrent events for one actor produced two
 * updates. Half of every live player-to-player interaction's measurement was being dropped, on the
 * exact path F4's repeated games run on.
 *
 * The web app's own forwarder already does this, for the same stated reason ("Forward sequentially:
 * persona updates are stateful and order-sensitive within an actor"); the realtime server did not.
 * Keyed PER ACTOR because the loss is per actor: six users' events posted concurrently each landed
 * intact, so serializing globally would cost throughput and buy nothing.
 *
 * Callers keep their fire-and-forget `void` semantics — the chain never blocks the room's tick, and
 * a rejected link never poisons the next one.
 *
 * NOTE, and it is flagged in docs/known-gaps.md: this closes the emission site, not the underlying
 * defect. The persona store has no per-actor lock of its own, so any OTHER concurrent writer for one
 * actor still loses updates. That fix lives in services/ml, which is frozen.
 */
const observeChain = new Map<string, Promise<unknown | null>>();

export function observeBehavioral(event: BehavioralEvent): Promise<unknown | null> {
  const key = String(event.actor_id ?? "");
  const prev = observeChain.get(key) ?? Promise.resolve(null);
  const next = prev.then(() => postObservation(event), () => postObservation(event));
  // Keep the chain settled so one failure never blocks the actor's later observations, and drop the
  // entry once it is the tail again so a long-lived room does not accumulate one promise per visitor.
  const settled = next.catch(() => null);
  observeChain.set(key, settled);
  void settled.then(() => {
    if (observeChain.get(key) === settled) observeChain.delete(key);
  });
  return next;
}

export interface InteractionLog {
  worldId: string;
  actorId: string;
  targetId: string;
  userText: string;
  npcText: string;
  latencyMs?: number;
  editsCount?: number;
}

export async function logInteraction(log: InteractionLog) {
  // Push to the ML online loop so the persona posterior / reward model update (§9.8).
  if (ML_URL) {
    fetch(`${ML_URL}/observe`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ML_TOKEN}` },
      body: JSON.stringify({
        userId: log.actorId,
        context: { targetId: log.targetId, kind: "message" },
        action: log.userText,
        telemetry: { latencyMs: log.latencyMs, editsCount: log.editsCount },
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  }
  await insert("interactions", {
    world_id: log.worldId,
    actor_id: log.actorId,
    target_id: log.targetId,
    kind: "message",
    content: { user: log.userText, npc: log.npcText },
    context_json: { latency_ms: log.latencyMs, edits_count: log.editsCount },
  }).catch(() => {});
}
