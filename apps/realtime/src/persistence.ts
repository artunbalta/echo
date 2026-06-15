/**
 * Thin persistence layer for the realtime server. Writes interactions/telemetry to
 * Supabase via the REST endpoint using the service-role key. No-ops gracefully when
 * Supabase isn't configured, so the world runs locally with zero backend.
 */
import type { TelemetryEvent } from "@echo/shared";

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
