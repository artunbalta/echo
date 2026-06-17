/**
 * Server-side bridge to the ML learning engine (§9). Holds ML_SERVICE_TOKEN so the
 * browser never sees it. Every call degrades to a graceful mock when the ML service
 * isn't running, so the agency UI works standalone (best with the service up).
 */
import "server-only";

const ML_URL = process.env.ML_SERVICE_URL ?? "";
const ML_TOKEN = process.env.ML_SERVICE_TOKEN ?? "";

async function call<T>(path: string, init: RequestInit, fallback: T): Promise<T> {
  if (!ML_URL) return fallback;
  try {
    const res = await fetch(`${ML_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ML_TOKEN}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`ml ${path} ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[ml] ${path} failed, using fallback:`, (err as Error).message);
    return fallback;
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
      decision: "copilot",
      confidence: 0.5,
      p_hat: 0.5,
      tau: 0.58,
      explored: false,
      level: "copilot",
      rationale: "ML service offline — showing a neutral draft. Start services/ml to enable real proposals.",
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
    { userId: uid, traits: [], uncertainty: 1, behaviors: 0, ece: null, buckets: {}, reward_version: 0, mocked: true },
  );
}

function mockProposal(msg: string): string {
  const m = msg.trim();
  if (!m) return "…go on, I'm listening.";
  if (m.endsWith("?")) return "Good question — let me think about that honestly.";
  return `That lands for me. ${m.slice(0, 30)}… yeah, I'd say more.`;
}
