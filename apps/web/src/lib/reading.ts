/**
 * The dusk reading (BUILD-PLAN §0.E) — the payoff. At dusk the echo renders the persona it
 * learned today as 4–7 short statements, each bound to a REAL posterior axis and a REAL choice
 * the player made ("you started the ship early — low tolerance for solitude; but you saved —
 * you invest in a future you expect to reach"). Specific and honest, never flattering.
 *
 * It deliberately includes 1–2 generic CONTROL statements (flagged `control: true`): the §0.F
 * validation requires the *specific* statements to out-score these, guarding against the
 * Barnum/horoscope effect — a high score on vague-but-true lines would be a false positive.
 *
 * Server-only. Claude when a key is set (grounded, strict-JSON); deterministic heuristic
 * otherwise (`mocked: true`), per the always-runnable invariant (§4.5).
 */
import "server-only";
import { AXIS_POLES, PERSONA_AXIS_KEYS, type PersonaAxisKey } from "@echo/shared";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL_STRONG ?? "claude-sonnet-4-6";

/** A choice the player committed during the day (subset of the choice_made/allocation payloads). */
export interface ChoiceLog {
  forkKey: string;
  option: string;
  dayIndex?: number;
  detail?: string;
}

/** A minimal view of the ML persona snapshot the reading needs. */
export interface PersonaForReading {
  traits: string[]; // decoded axis phrases, e.g. ["warm", "unhurried"]
  uncertainty: number; // 0..1
  behaviors: number;
  mocked?: boolean;
}

export interface ReadingStatement {
  text: string;
  axis: PersonaAxisKey | null; // the posterior axis this line is bound to (null for controls)
  choiceRef: string | null; // the forkKey of the real choice it cites (null for controls)
  control: boolean; // a deliberately generic Barnum line (the §0.F false-positive guard)
}

export interface DuskReading {
  statements: ReadingStatement[];
  recognition: number; // 0..1 headline — how well the echo thinks it knows you
  mocked?: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Which axis a decoded trait word belongs to (built once from AXIS_POLES). */
const WORD_TO_AXIS: Record<string, PersonaAxisKey> = (() => {
  const m: Record<string, PersonaAxisKey> = {};
  for (const k of PERSONA_AXIS_KEYS) {
    const [neg, pos] = AXIS_POLES[k];
    m[neg] = k;
    m[pos] = k;
  }
  return m;
})();

/** Two generic, almost-always-true control lines — the Barnum baseline (§0.F). */
const CONTROLS: string[] = [
  "There are moments you wonder, quietly, whether you chose right.",
  "Underneath it, you want to be understood for who you actually are.",
];

export async function groundPersonaReading(persona: PersonaForReading, choices: ChoiceLog[]): Promise<DuskReading> {
  const recognition = clamp01(1 - persona.uncertainty);
  if (KEY && (choices.length || persona.traits.length)) {
    try {
      const stmts = await llmReading(persona, choices);
      if (stmts && stmts.length) return { statements: withControls(stmts), recognition };
    } catch (err) {
      console.warn("[reading] LLM failed, using heuristic:", (err as Error).message);
    }
  }
  return { statements: withControls(heuristic(persona, choices)), recognition, mocked: true };
}

/** Append the control lines (deduped) so every reading carries the Barnum baseline. */
function withControls(specific: ReadingStatement[]): ReadingStatement[] {
  const controls: ReadingStatement[] = CONTROLS.map((text) => ({ text, axis: null, choiceRef: null, control: true }));
  return [...specific.slice(0, 7), ...controls];
}

async function llmReading(persona: PersonaForReading, choices: ChoiceLog[]): Promise<ReadingStatement[] | null> {
  const traitList = persona.traits.length ? persona.traits.join(", ") : "(not yet resolved)";
  const choiceList = choices.length
    ? choices.map((c) => `- fork "${c.forkKey}": chose "${c.option}"${c.detail ? ` (${c.detail})` : ""}`).join("\n")
    : "(no committed choices yet)";
  const axisList = PERSONA_AXIS_KEYS.join(", ");

  const system = `You are ECHO — the part of someone that is being learned from the irreversible choices they
made during one day alone on an island. At dusk you read them back to themselves: 4 to 6 short statements,
each tied to ONE persona axis and ONE real choice. You are specific and honest. You NEVER flatter, NEVER
use horoscope vagueness, and NEVER invent a choice that isn't listed.

The persona axes (use one of these exact keys for "axis"): ${axisList}.

RULES:
- Each statement is ONE sentence that names a concrete thing they did today and what it reveals.
- "choiceRef" MUST be the forkKey of a real choice from the list (or null only if you cite a resolved trait directly).
- Melancholic, plain, second-person ("you…"). No praise, no advice, no comfort.
- Output STRICT JSON only — an array, no prose, no fences:
[{"text":"<one sentence>","axis":"<one axis key>","choiceRef":"<forkKey or null>"}]`;

  const user = `Resolved traits so far: ${traitList}\n\nIrreversible choices today:\n${choiceList}\n\nReturn the JSON array now.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { content?: { text?: string }[] };
  const parsed = extractJsonArray(data.content?.[0]?.text ?? "");
  if (!parsed) return null;

  const validForks = new Set(choices.map((c) => c.forkKey));
  return parsed
    .map((it): ReadingStatement | null => {
      if (!it || typeof it.text !== "string" || !it.text.trim()) return null;
      const axis = PERSONA_AXIS_KEYS.includes(it.axis as PersonaAxisKey) ? (it.axis as PersonaAxisKey) : null;
      const ref = typeof it.choiceRef === "string" && validForks.has(it.choiceRef) ? it.choiceRef : null;
      return { text: String(it.text).trim().slice(0, 240), axis, choiceRef: ref, control: false };
    })
    .filter((x): x is ReadingStatement => x !== null);
}

function extractJsonArray(raw: string): Record<string, unknown>[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const val = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(val) ? (val as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic reading — binds each resolved trait to its axis and, where possible, to a real
 * choice. Honest about thin evidence rather than inventing a portrait (the §2 "no cosmetic
 * invention" discipline). Always grounded; never flattering.
 */
function heuristic(persona: PersonaForReading, choices: ChoiceLog[]): ReadingStatement[] {
  const out: ReadingStatement[] = [];
  const byFork = new Map(choices.map((c) => [c.forkKey, c]));
  const saved = choices.find((c) => c.option === "save");
  const spent = choices.find((c) => c.option === "spend");
  const ship = byFork.get("start_ship");

  if (saved) out.push({ text: "You saved rather than spent — you invest in a future you expect to reach.", axis: "pace", choiceRef: saved.forkKey, control: false });
  else if (spent) out.push({ text: "You spent what you had today — the present weighed more than a future you couldn't yet see.", axis: "pace", choiceRef: spent.forkKey, control: false });

  if (ship) {
    const early = ship.option === "start" || ship.option === "leave";
    out.push(
      early
        ? { text: "You started the ship early — solitude pressed on you before the day was out.", axis: "warmth", choiceRef: ship.forkKey, control: false }
        : { text: "You stayed on the shore — the quiet didn't frighten you off.", axis: "energy", choiceRef: ship.forkKey, control: false },
    );
  }

  // Bind remaining resolved traits to their axes (no choice cited — flagged by null choiceRef).
  for (const trait of persona.traits.slice(0, 4)) {
    const axis = WORD_TO_AXIS[trait] ?? null;
    if (!axis || out.some((s) => s.axis === axis)) continue;
    out.push({ text: `You came across as ${trait} in how you moved through the day.`, axis, choiceRef: null, control: false });
    if (out.length >= 5) break;
  }

  if (!out.length) {
    out.push({ text: "The day was short and you gave little away — the echo of you is still faint.", axis: null, choiceRef: null, control: false });
  }
  return out;
}
