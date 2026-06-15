/**
 * NPC dialogue (§8). Event-driven: invoked only on an active conversation turn, never
 * in a loop. Routes through the ML service when available (so persona/agent logic lives
 * in one place, §9), otherwise calls Anthropic directly, otherwise returns a
 * deterministic in-character mock so the world is playable with zero keys.
 */
import type { NpcSpec } from "@echo/shared";

const ML_URL = process.env.ML_SERVICE_URL;
const ML_TOKEN = process.env.ML_SERVICE_TOKEN ?? "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL_CHEAP = process.env.LLM_MODEL_CHEAP ?? "claude-haiku-4-5-20251001";

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export interface NpcReply {
  text: string;
  source: "ml" | "llm" | "mock";
}

export async function npcReply(
  npc: NpcSpec,
  history: Turn[],
  sustained: boolean,
): Promise<NpcReply> {
  // 1) Preferred path: the ML service (handles model tiering, caching, telemetry).
  if (ML_URL) {
    try {
      const res = await fetch(`${ML_URL}/npc/turn`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${ML_TOKEN}` },
        body: JSON.stringify({ npc, history, sustained }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = (await res.json()) as { text: string };
        if (data?.text) return { text: data.text, source: "ml" };
      }
    } catch {
      // fall through
    }
  }

  // 2) Direct Anthropic call.
  if (ANTHROPIC_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL_CHEAP,
          max_tokens: 160,
          system: npc.systemPrompt,
          messages: history.map((t) => ({ role: t.role, content: t.text })),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: { text?: string }[] };
        const text = data.content?.[0]?.text?.trim();
        if (text) return { text, source: "llm" };
      }
    } catch {
      // fall through
    }
  }

  // 3) Deterministic mock — keeps the world alive with no API keys.
  return { text: mockReply(npc, history), source: "mock" };
}

function mockReply(npc: NpcSpec, history: Turn[]): string {
  const last = [...history].reverse().find((t) => t.role === "user")?.text ?? "";
  const first = history.filter((t) => t.role === "user").length <= 1;
  const name = npc.name.split(" ")[0];
  if (first) {
    return `Oh — new face. I'm ${name}. You picked a strange day to arrive at the ${npc.venue}.`;
  }
  if (last.endsWith("?")) {
    return `Hard to say. ${name} has theories, but the ${npc.venue} keeps its secrets.`;
  }
  return `Mm. "${last.slice(0, 40)}". Stick around the ${npc.venue} a while — you'll see what I mean.`;
}
