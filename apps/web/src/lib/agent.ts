/**
 * Client helpers for the agency layer (§10). Talk to the server-side proxy routes (which
 * hold the ML token). Every agent utterance can show "why it said that"; every human
 * approve/edit/reject becomes a high-signal label feeding §9.3/§9.4/§9.5/§9.7.
 */
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

export async function proposeReply(
  userId: string,
  context: string,
  userMessage: string,
  bucket: string,
  stakes = "low",
): Promise<AgentTurn> {
  const res = await fetch("/api/agent/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, context, userMessage, bucket, stakes }),
  });
  return res.json();
}

/** Record the human's verdict on a proposal → labels (§9.8 ASK/COPILOT branch). */
export async function sendFeedback(body: {
  userId: string;
  bucket: string;
  confidence: number;
  agreed: boolean;
  chosen?: string;
  rejected?: string;
  context?: string;
}): Promise<void> {
  await fetch("/api/agent/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getPersona(userId: string): Promise<PersonaSnapshot> {
  const res = await fetch(`/api/agent/persona?uid=${encodeURIComponent(userId)}`);
  return res.json();
}

export async function approveMeeting(body: {
  userId: string;
  counterpartId: string;
  action: string;
  context: string;
  occurred: boolean;
  rating?: number;
}): Promise<void> {
  await fetch("/api/agent/meeting-outcome", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface ConnectionAnalysis {
  id: string;
  reason: string;
  recommend: boolean;
  depth: "brief" | "warming" | "real";
  mocked?: boolean;
}

/** Ask the server to read the actual conversation transcripts and return a grounded,
 *  conversation-specific "why this stood out" per person (real LLM when configured). */
export async function requestConnectionAnalysis(
  userId: string,
  sessionId: string,
  people: { id: string; name: string; turns: number; lines: { who: "you" | "them"; text: string }[] }[],
): Promise<ConnectionAnalysis[]> {
  try {
    const res = await fetch("/api/connections/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, sessionId, people }),
    });
    const data = (await res.json()) as { analyses?: ConnectionAnalysis[] };
    return Array.isArray(data.analyses) ? data.analyses : [];
  } catch {
    return [];
  }
}
