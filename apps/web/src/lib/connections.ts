/**
 * Connection analysis (§10). Reads each end-of-day conversation the user actually had and
 * produces a grounded, conversation-specific observation of why it stood out — plus a
 * suggestion on whether it's worth a real connection. The human still makes the final call;
 * this only surfaces a real read instead of a turn-count guess.
 *
 * Server-only. Uses Claude when an API key is configured; otherwise a deterministic
 * heuristic fallback (flagged `mocked: true`) so the panel always shows something.
 */
import "server-only";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL_STRONG ?? "claude-sonnet-4-6";

export interface ConvLine {
  who: "you" | "them";
  text: string;
}

export interface PersonInput {
  id: string;
  name: string;
  turns: number; // how many times the user spoke
  lines: ConvLine[]; // full transcript (you + them)
}

export type ConnectionDepth = "brief" | "warming" | "real";

export interface ConnectionAnalysis {
  id: string;
  reason: string;
  recommend: boolean;
  depth: ConnectionDepth;
  mocked?: boolean;
}

const SYSTEM = `You analyze short conversations someone had while wandering a social world, and
judge how genuine each connection was. You are warm and curious, never flattering, never a judge.

For EACH person you are given a transcript labelled "User:" (the human) and the other person's name.
Return ONE observation per person, grounded ONLY in what was actually said.

RULES:
- The "reason" is a single short sentence that points at a CONCRETE moment in THIS conversation
  (a topic they opened up about, a question the user asked, a shared detail) — not a generic line.
  Never invent content that isn't in the transcript. Paraphrase; don't fabricate quotes.
- "recommend": true only if the exchange shows real mutual interest or depth worth following up on.
- "depth": "real" = a genuine back-and-forth with substance; "warming" = past the first hello but light;
  "brief" = barely a greeting or nothing of substance.
- If no words were exchanged, say so plainly ("barely a hello") with depth "brief", recommend false.

Output STRICT JSON only — an array, no prose, no markdown fences:
[{"id":"<id>","reason":"<one sentence>","recommend":<bool>,"depth":"brief|warming|real"}]`;

export async function analyzeConnections(people: PersonInput[]): Promise<ConnectionAnalysis[]> {
  if (people.length === 0) return [];
  const hasDialogue = people.some((p) => p.lines.some((l) => l.text.trim()));
  if (KEY && hasDialogue) {
    try {
      const out = await llmAnalyze(people);
      if (out) return out;
    } catch (err) {
      console.warn("[connections] LLM failed, using heuristic:", (err as Error).message);
    }
  }
  return people.map(heuristic);
}

async function llmAnalyze(people: PersonInput[]): Promise<ConnectionAnalysis[] | null> {
  const blocks = people
    .map((p, i) => {
      const convo = p.lines.length
        ? p.lines.map((l) => `${l.who === "you" ? "User" : p.name}: ${l.text}`).join("\n")
        : "(no words exchanged)";
      return `Person ${i + 1} — id="${p.id}", name="${p.name}", user_turns=${p.turns}\n${convo}`;
    })
    .join("\n\n---\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: `${blocks}\n\nReturn the JSON array now.` }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { content?: { text?: string }[] };
  const parsed = extractJsonArray(data.content?.[0]?.text ?? "");
  if (!parsed) return null;

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of parsed) {
    if (item && typeof item.id === "string") byId.set(item.id, item);
  }
  // Map back per person; any the model missed or malformed falls back to the heuristic.
  return people.map((p) => {
    const it = byId.get(p.id);
    if (!it || typeof it.reason !== "string" || !it.reason.trim()) return heuristic(p);
    const depth = it.depth === "real" || it.depth === "warming" || it.depth === "brief" ? it.depth : heuristic(p).depth;
    return {
      id: p.id,
      reason: String(it.reason).trim().slice(0, 220),
      recommend: it.recommend === true,
      depth,
    };
  });
}

/** Pull a JSON array out of the model's reply, tolerating stray prose or code fences. */
function extractJsonArray(raw: string): Record<string, unknown>[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const val = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(val) ? val : null;
  } catch {
    return null;
  }
}

/** Deterministic turn-count read — the same signal the panel used before, now flagged. */
function heuristic(p: PersonInput): ConnectionAnalysis {
  if (p.turns >= 4)
    return { id: p.id, reason: "a long, real conversation — you stayed when you could have moved on", recommend: true, depth: "real", mocked: true };
  if (p.turns >= 2)
    return { id: p.id, reason: "you kept it going past the first hello", recommend: false, depth: "warming", mocked: true };
  return { id: p.id, reason: "a brief hello", recommend: false, depth: "brief", mocked: true };
}
