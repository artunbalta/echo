/**
 * Narrator summarizer (§11). Turns a grounded session/encounter digest into 1–2 sparse,
 * specific, slightly-surprising, warm/curious observations — never judging. If nothing
 * specific stands out, it STAYS SILENT (returns ""). This is a forcing function: only
 * narrate what the signals actually support.
 *
 * Server-only. Uses Claude when available; otherwise a deterministic grounded fallback
 * that still only speaks when a concrete fact qualifies.
 */
import "server-only";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL_STRONG ?? "claude-opus-4-8";

export interface SessionDigest {
  mode: "encounter" | "session";
  counterpart?: { name: string; turns: number };
  approaches: number;
  avoids: number;
  dwell: number;
  revisits: number;
  edits: number;
  avgReplyMs?: number;
  maxReplyMs?: number;
  metNames: string[];
  traits?: string[];
}

const SYSTEM = `You are the narrator of ECHO — an interested companion, never a judge, never an
assistant. After a person's encounter or session, you offer at most 1–2 short observations.
RULES:
- Be SPECIFIC and grounded ONLY in the facts given. Never invent. Never generalize ("you
  seem friendly") — point at a concrete thing they did.
- Slightly surprising is good; warm and curious in tone. Never evaluative or flattering.
- 1–2 short sentences, second person, present/past tense. No preamble, no emoji.
- If the facts contain nothing specific worth noting, reply with exactly: [SILENT]`;

export async function narrate(d: SessionDigest): Promise<string> {
  const facts = factLines(d);
  if (facts.length === 0) return ""; // nothing grounded → silence

  if (KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 120,
          system: SYSTEM,
          messages: [{ role: "user", content: `Facts:\n${facts.join("\n")}\n\nYour observation:` }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: { text?: string }[] };
        const text = (data.content?.[0]?.text ?? "").trim();
        if (!text || text.includes("[SILENT]")) return "";
        return text;
      }
    } catch (err) {
      console.warn("[narrator] LLM failed, using grounded fallback:", (err as Error).message);
    }
  }
  return groundedFallback(d);
}

/** Extract only the concrete, narratable facts. Empty ⇒ stay silent. */
function factLines(d: SessionDigest): string[] {
  const f: string[] = [];
  if (d.counterpart && d.counterpart.turns >= 3)
    f.push(`stayed in conversation with ${d.counterpart.name} for ${d.counterpart.turns} exchanges`);
  if (d.maxReplyMs && d.maxReplyMs >= 2500)
    f.push(`once waited ${(d.maxReplyMs / 1000).toFixed(1)}s before replying`);
  if (d.avgReplyMs && d.avgReplyMs <= 800)
    f.push(`replied fast, around ${Math.round(d.avgReplyMs)}ms`);
  if (d.edits >= 3) f.push(`rewrote a message ${d.edits} times before sending`);
  if (d.approaches >= 1 && d.avoids >= 1)
    f.push(`approached ${d.approaches} and steered away from ${d.avoids} others`);
  if (d.revisits >= 1) f.push(`returned to someone already met`);
  if (d.dwell >= 1) f.push(`lingered near someone without speaking`);
  if (d.metNames.length >= 3) f.push(`spoke with ${d.metNames.length} different people`);
  return f;
}

function groundedFallback(d: SessionDigest): string {
  if (d.maxReplyMs && d.maxReplyMs >= 2500)
    return `You waited ${(d.maxReplyMs / 1000).toFixed(0)} seconds before answering. You don't rush your words.`;
  if (d.edits >= 3) return `You rewrote that one a few times before letting it go.`;
  if (d.approaches >= 1 && d.avoids >= 1)
    return `You skipped the others and went straight to the one you wanted. Noted.`;
  if (d.counterpart && d.counterpart.turns >= 3)
    return `You stayed with ${d.counterpart.name} past the first hello — longer than most first days allow.`;
  if (d.revisits >= 1) return `You went back to a face you'd already met. That says something.`;
  return "";
}
