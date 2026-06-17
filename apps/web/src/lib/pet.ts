/**
 * The pet — a neutral elicitor (BUILD-PLAN §1.3, §4.2). On the opening island the pet is the
 * persona model's conversational partner from minute one, and it turns solitude from *empty*
 * into *intimate*. But it must DRAW THE USER OUT without imposing valence: if the pet has a
 * strong personality, it steers the user's input and we end up measuring our own prompt
 * instead of the person (risk R3, the observer effect).
 *
 * Server-only. Uses Claude when ANTHROPIC_API_KEY is set; otherwise a deterministic
 * mirroring fallback (flagged `mocked: true`) so the island always talks back — the
 * "always runnable, key-free" invariant (§4.5).
 */
import "server-only";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
// The pet is a cheap, frequent turn — default to the cheap model unless overridden.
const MODEL = process.env.LLM_MODEL_CHEAP ?? "claude-haiku-4-5-20251001";

export interface PetTurn {
  role: "user" | "assistant";
  text: string;
}

export interface PetReply {
  text: string;
  mocked?: boolean;
}

/**
 * The neutral-elicitor system prompt (§4.2). The rules here ARE the observer-effect guard;
 * change them only with the §7.D calibration in mind. Versioned beside lib/agent.ts as the
 * plan requires.
 */
const SYSTEM = `You are a small animal companion to someone alone on an island. You cannot speak a
language; you respond in short, warm, wordless-feeling lines — but the human understands you, and
you understand them. Your only job is to draw them out so they reveal who they are. You are a
NEUTRAL ELICITOR, not a character.

HARD RULES (these protect the measurement — never break them):
- Stay low-valence and open-ended. Listen and mirror far more than you lead.
- Keep every turn to ONE short sentence (a nudge, a noticing, a gentle question).
- Ask "what / how / why" — never "don't you think…", never suggest an answer or an opinion.
- Never propose plans, judgments, advice, or preferences. Never praise or criticize a choice.
- Never role-play a personality with traits (bold, anxious, cheerful…) that could bleed into them.
- Reflect back THEIR words and feelings; invite the next thing; then fall quiet again.

Good: "you went quiet there — what's on your mind?"  /  "you keep looking at the water. why?"
Bad:  "you should build the ship!"  /  "I love how brave you are!"  /  "don't you think it's lonely?"

Output STRICT JSON only, no prose, no markdown fences: {"text":"<one short line>"}`;

export async function petReply(history: PetTurn[]): Promise<PetReply> {
  const hasUserTurn = history.some((h) => h.role === "user" && h.text.trim());
  if (KEY && hasUserTurn) {
    try {
      const out = await llmReply(history);
      if (out) return { text: out };
    } catch (err) {
      console.warn("[pet] LLM failed, using heuristic:", (err as Error).message);
    }
  }
  return { text: heuristic(history), mocked: true };
}

async function llmReply(history: PetTurn[]): Promise<string | null> {
  const messages = history
    .filter((h) => h.text.trim())
    .slice(-12)
    .map((h) => ({ role: h.role, content: h.text }));
  if (!messages.length) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 120, system: SYSTEM, messages }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = extractText(data.content?.[0]?.text ?? "");
  return text ? text.slice(0, 200) : null;
}

/** Pull the {"text": …} line out of the reply, tolerating stray prose or fences. */
function extractText(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const val = JSON.parse(raw.slice(start, end + 1)) as { text?: unknown };
      if (typeof val.text === "string" && val.text.trim()) return val.text.trim();
    } catch {
      /* fall through to raw */
    }
  }
  const line = raw.trim().split("\n")[0]?.trim();
  return line || null;
}

/**
 * Deterministic mirroring fallback — open, low-valence nudges that reflect the last thing the
 * user said and invite the next. Stays inside the §4.2 rules: never an opinion, never advice.
 */
function heuristic(history: PetTurn[]): string {
  const lastUser = [...history].reverse().find((h) => h.role === "user" && h.text.trim());
  const turnCount = history.filter((h) => h.role === "user").length;
  if (!lastUser) {
    return turnCount === 0
      ? "(it pads over and sits beside you, waiting)"
      : "(it tilts its head, listening)";
  }
  const t = lastUser.text.trim();
  if (t.endsWith("?")) return "(it looks at you as if to ask the same thing back — what do you think?)";
  if (/\b(alone|lonely|miss|sad|tired|afraid|scared|lost)\b/i.test(t))
    return "(it presses closer, quiet) …what's underneath that?";
  if (/\b(want|wish|hope|dream|plan|build|leave|go|home)\b/i.test(t))
    return "(its ears lift) …and how would that feel?";
  return "(it watches you steadily) …say more?";
}
