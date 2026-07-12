/**
 * Server-side bridge to the ML learning engine (§9). Holds ML_SERVICE_TOKEN so the
 * browser never sees it. Every call degrades to a graceful mock when the ML service
 * isn't running, so the agency UI works standalone (best with the service up).
 */
import "server-only";

/**
 * Read the ML service config at REQUEST time (not module scope). Two reasons:
 *   1. A Vercel env var added/changed in the dashboard takes effect on the next invocation,
 *      without depending on when this module was first evaluated.
 *   2. In Next.js only NEXT_PUBLIC_* vars are inlined; ML_SERVICE_URL / ML_SERVICE_TOKEN are
 *      SERVER-ONLY and must be present in the runtime environment (Vercel Production, not just
 *      Preview or a local .env). If they aren't, we degrade to a mock — see `call`.
 * Trailing slashes are trimmed so `${url}${path}` never becomes `…//observe/behavioral` (a 404).
 */
function mlConfig(): { url: string; token: string } {
  return {
    url: (process.env.ML_SERVICE_URL ?? "").trim().replace(/\/+$/, ""),
    token: (process.env.ML_SERVICE_TOKEN ?? "").trim(),
  };
}

/** Attach a machine-readable `reason` to an object fallback so the caller / Network tab can see
 *  WHY a response was mocked ("ml_service_url_unset" vs "ml_forward_failed"), instead of a silent
 *  fake success. No-op for non-object fallbacks. */
function withReason<T>(fallback: T, reason: string): T {
  return fallback && typeof fallback === "object"
    ? ({ ...(fallback as object), reason } as T)
    : fallback;
}

async function call<T>(path: string, init: RequestInit, fallback: T): Promise<T> {
  const { url, token } = mlConfig();
  if (!url) {
    // NOT configured for this runtime. This is a MISCONFIGURATION in production (the world can't
    // measure), not a feature — make it loud in the server logs and label the response, rather than
    // silently pretending success. Local/dev without an ML service still degrades gracefully.
    const msg = `[ml] ML_SERVICE_URL is unset in this runtime — cannot forward ${path}; returning mock.`;
    if (process.env.NODE_ENV === "production") {
      console.error(`${msg} Set ML_SERVICE_URL (and ML_SERVICE_TOKEN) for the Vercel PRODUCTION environment and redeploy.`);
    } else {
      console.warn(msg);
    }
    return withReason(fallback, "ml_service_url_unset");
  }
  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`ml ${path} ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    // A real forward was attempted and failed (network / non-200 / 401). Loud in prod so a broken
    // token or unreachable service surfaces, and labeled so it's distinguishable from "unset".
    const msg = `[ml] ${path} forward FAILED (${url}${path}): ${(err as Error).message} — returning mock.`;
    if (process.env.NODE_ENV === "production") console.error(msg);
    else console.warn(msg);
    return withReason(fallback, "ml_forward_failed");
  }
}

export interface AgentTurn {
  action: string;
  decision: "auto" | "ask" | "copilot";
  confidence: number;
  p_hat: number;
  tau: number;
  explored: boolean;
  level: string;
  rationale: string;
  candidates: string[];
  mocked?: boolean;
}

export function agentTurn(body: {
  userId: string;
  context: string;
  userMessage: string;
  bucket: string;
  stakes: string;
}): Promise<AgentTurn> {
  return call<AgentTurn>(
    "/agent/turn",
    { method: "POST", body: JSON.stringify(body) },
    {
      action: mockProposal(body.userMessage),
      // Zero-key path (P6 acceptance): the mock policy still drives a VISIBLE handover —
      // `auto` in the demo smalltalk bucket so the echo walks and talks; honestly labeled
      // (mocked + the rationale) and vetoable exactly like the real thing.
      decision: body.bucket === "smalltalk" ? "auto" : "copilot",
      confidence: 0.5,
      p_hat: 0.5,
      tau: 0.58,
      explored: false,
      level: body.bucket === "smalltalk" ? "auto" : "copilot",
      rationale: "ML service offline — a demo turn so the handover is visible. Start services/ml for real proposals.",
      candidates: [mockProposal(body.userMessage)],
      mocked: true,
    },
  );
}

export function agentFeedback(body: Record<string, unknown>): Promise<unknown> {
  return call("/feedback", { method: "POST", body: JSON.stringify(body) }, { ok: true, mocked: true });
}

/**
 * Push a user action (with derived behavioral telemetry) into the persona posterior
 * (BUILD-PLAN §0.D). The ML `/observe` update reads `telemetry` via persona._telemetry_features,
 * so behavioral choices move the posterior — the spine that turns choices into signal (§3).
 */
export function observeEvent(body: {
  userId: string;
  context?: Record<string, unknown>;
  action?: string;
  telemetry?: Record<string, unknown>;
}): Promise<{ ok: boolean; mocked?: boolean }> {
  return call(
    "/observe",
    { method: "POST", body: JSON.stringify({ context: {}, action: "", telemetry: {}, ...body }) },
    { ok: true, mocked: true },
  );
}

/** Forward one implicit telemetry event ({type, payload}) to the ML revealed-preference path. */
export function telemetryEvent(body: {
  userId: string;
  sessionId?: string;
  event: { type: string; payload?: Record<string, unknown> };
}): Promise<{ ok: boolean; mocked?: boolean }> {
  return call("/telemetry", { method: "POST", body: JSON.stringify(body) }, { ok: true, mocked: true });
}

export function meetingOutcome(body: Record<string, unknown>): Promise<unknown> {
  return call("/meeting-outcome", { method: "POST", body: JSON.stringify(body) }, { ok: true, mocked: true });
}

export interface BehavioralObserveResult {
  ok?: boolean;
  mocked?: boolean;
  /** When mocked, WHY: "ml_service_url_unset" (env missing in this runtime) | "ml_forward_failed"
   *  (a real forward to echo-ml threw / returned non-200). Absent on a real forwarded result. */
  reason?: string;
  userId?: string;
  polarity?: "take" | "refuse";
  cond_key?: string;
  persona?: { mu: number[]; Sigma?: number[][]; version?: number };
  delta_mu?: number;
  cond_persona?: { mu: number[] };
}

/**
 * Forward one BehavioralEvent envelope to the engine's instrumentation ingress
 * (ML POST /observe/behavioral → ingest → persona.observe → featurize_raw). The ML
 * endpoint reads actor_id from the event, enforces mandatory context, folds the cue
 * into the pooled + conditional posteriors, and reports how far the posterior moved —
 * including for Channel-K refusals (non-action is data). Mocks gracefully when ML is down.
 */
export function observeBehavioralEvent(body: {
  event: Record<string, unknown>;
}): Promise<BehavioralObserveResult> {
  return call<BehavioralObserveResult>(
    "/observe/behavioral",
    { method: "POST", body: JSON.stringify(body) },
    { ok: true, mocked: true },
  );
}

export interface PersonaSnapshot {
  userId: string;
  traits: string[];
  uncertainty: number;
  behaviors: number;
  ece: number | null;
  buckets: Record<string, { level: string; agreement_ewma: number; volume: number; ece: number }>;
  reward_version: number;
  mocked?: boolean;
}

export function deleteUser(uid: string): Promise<unknown> {
  return call(`/user/${encodeURIComponent(uid)}`, { method: "DELETE" }, { deleted: false, mocked: true });
}

export function getPersona(uid: string): Promise<PersonaSnapshot> {
  return call<PersonaSnapshot>(
    `/persona/${uid}`,
    { method: "GET" },
    {
      userId: uid, traits: [], uncertainty: 1, behaviors: 0, ece: null,
      // Zero-key path (P6): one demo `auto` bucket so the handover on-ramp is reachable and
      // visibly demonstrable with no services. Honest: the whole snapshot is mocked:true and
      // every consumer labels it (the meter's DEMO badge, the panel's offline line).
      buckets: { smalltalk: { level: "auto", agreement_ewma: 0.85, volume: 12, ece: 0.05 } },
      reward_version: 0, mocked: true,
    },
  );
}

function mockProposal(msg: string): string {
  const m = msg.trim();
  if (!m) return "…go on, I'm listening.";
  if (m.endsWith("?")) return "Good question — let me think about that honestly.";
  return `That lands for me. ${m.slice(0, 30)}… yeah, I'd say more.`;
}
