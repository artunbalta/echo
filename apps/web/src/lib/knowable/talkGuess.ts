/**
 * How an echo earns the right to talk (DECISIONS C108): before its person answers a villager it guesses the
 * answer and seals it; once they have answered, a model that is not told which is which says whether the two
 * mean the same and sound the same. Each settled guess is one talk look (`standing.ts`, 30 of them and 0.85).
 *
 * SEALED, AND NOT SHOWN. The guess is made the moment the villager's line arrives, from what the person has
 * said before (their kept lines, `echo_lines`) and the conversation so far, never from their answer, which
 * does not exist yet. It is handed to their browser in a box it cannot open (AES-256-GCM under a key drawn
 * from the identity secret) and handed back with the answer. So the guess cannot be changed once the answer
 * is known, by the server or by the page, and the person never sees it before they answer: seeing it would
 * lead them, and in a village room a sealed mark under one kind of line would tell villagers from people.
 * What it guessed is shown afterwards, beside what they said, under "When you leave".
 *
 * THE JUDGE IS BLIND. It is shown the villager's line and two replies, A and B, in an order drawn per call,
 * and asked whether someone who knows the person would take one for the other: the same point (the same
 * answer, the same refusal, the same question) said the same way (as warm or as curt, as playful, about as
 * long). Wording may differ. It is not told that one is a guess.
 *
 * HOW SURE. The guesser says how likely its line is to be taken for theirs. `standing.ts` holds it to that:
 * an echo that claims more than it turns out to have does not earn the right however often it is right.
 *
 * NO MODEL, ON THE DEVELOPER'S OWN MACHINE: the guess is their last line and the judge counts shared words,
 * so the whole of it can be tried without a key. A deployment without a key makes no guess (the routes say
 * 503): a record earned from counting words would not be a record of anything.
 *
 * Server-only: it holds the key the boxes are sealed with.
 */
import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";

import type { KeptLine } from "@/lib/villageStore";

/** How long a sealed guess waits for its answer, ms: a person thinking is a minute; past this it is not about this line. */
export const GUESS_MS = 15 * 60 * 1000;
/** Lines of theirs the guesser is shown, newest kept. */
export const LINES_SHOWN = 60;
/** Caps on what goes in and comes out. */
export const GUESS_LIMITS = { turns: 16, turnChars: 800, sayChars: 400, whyChars: 200 } as const;

const DOMAIN = "echo-talk-guess/v1";

export const GUESS_MODEL = process.env.ECHO_TALK_MODEL || "claude-opus-5-5";
export const JUDGE_MODEL = process.env.ECHO_JUDGE_MODEL || "claude-opus-5-5";
/** Claude Haiku 5.5 has no server-side fallback; the parameter is only sent where it means something. */
const fallbacks = (model: string) => (model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const });

/** One turn of the conversation as the villager panel sends it: the person ("stranger") and the villager, in turn. */
export interface Turn {
  role: "stranger" | "villager";
  text: string;
}

/** What a box holds. */
export interface SealedGuess {
  v: 1;
  sub: string;
  cell: string;
  room: string | null;
  person: string;
  /** What the villager said, which the guess answers. */
  heard: string;
  guess: string;
  /** How sure the guesser said it was, 0..1. */
  sure: number;
  /** When it was sealed, ms. */
  at: number;
  /** "model", or "mock" when no model was asked (the developer's machine). */
  source: "model" | "mock";
}

const keyOf = (secret: string) => createHash("sha256").update(`${DOMAIN}|${secret}`).digest();

/** A guess in a box the browser carries and cannot open. */
export function sealGuess(g: SealedGuess, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([c.update(JSON.stringify(g), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** What a box holds, if it was sealed here under any current key and nothing in it was changed. */
export function openGuess(box: unknown, secrets: readonly string[]): SealedGuess | null {
  if (typeof box !== "string" || box.length > 8000) return null;
  const raw = Buffer.from(box, "base64url");
  if (raw.length < 29) return null;
  for (const secret of secrets) {
    try {
      const d = createDecipheriv("aes-256-gcm", keyOf(secret), raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      const g = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as SealedGuess;
      if (g && g.v === 1 && typeof g.sub === "string" && typeof g.guess === "string" && typeof g.heard === "string" && Number.isFinite(g.at)) return g;
    } catch {
      // not this key, or not a box of ours
    }
  }
  return null;
}

/** The seal a settled guess is kept under: the hash of what was sealed, so it is kept once. */
export function sealOf(g: SealedGuess): string {
  return createHash("sha256").update(`${DOMAIN}|${g.sub}|${g.cell}|${g.room ?? ""}|${g.person}|${g.at}|${g.heard}|${g.guess}`).digest("hex");
}

/** Whether a conversation as the panel sends it is one a guess can answer: theirs first, in turn, ending on the villager's. */
export function readTurns(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > GUESS_LIMITS.turns || raw.length % 2 !== 0) return null;
  const out: Turn[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as { role?: unknown; text?: unknown } | null;
    const role = i % 2 === 0 ? "stranger" : "villager";
    if (!t || t.role !== role || typeof t.text !== "string" || t.text.trim() === "" || t.text.length > GUESS_LIMITS.turnChars) return null;
    out.push({ role, text: t.text });
  }
  return out;
}

const GUESS_PREAMBLE = `You are an echo of one particular person: you have watched them in a village game, and now you are guessing what they will type next in a conversation with a villager there.

You are shown lines this person has typed before, and the conversation as it stands, which ends on the villager's line. Write the line they will most likely type now, as they would type it: their length, their language, their register, their punctuation and capitals, their habits. Do not improve it, do not make it kinder or wiser than they would, and do not answer as a helpful assistant would; answer as they would. If they write short, write short.

Then say how likely it is, from 0 to 1, that someone who knows them would take your line for theirs: the same point, said the same way. Be honest about it. With few lines of theirs to go on, or a line that could be answered many ways, it is low.`;

const JUDGE_PREAMBLE = `You are shown a line said in a conversation and two replies to it, A and B. Decide whether someone who knew the person who wrote them would take one for the other.

They are the same when they make the same point (the same answer, the same refusal, the same question, the same facts) in the same manner (as warm or as curt, as playful or as plain, as formal or as casual, about as long). Different wording is fine. A reply that answers and one that dodges are not the same; a friendly yes and a curt yes are not the same; a long story and a single word are not the same.

Answer with same (true or false) and why, in at most twelve words.`;

const GUESS_SCHEMA = {
  type: "object",
  properties: { say: { type: "string" }, sure: { type: "number" } },
  required: ["say", "sure"],
  additionalProperties: false,
} as const;

const JUDGE_SCHEMA = {
  type: "object",
  properties: { same: { type: "boolean" }, why: { type: "string" } },
  required: ["same", "why"],
  additionalProperties: false,
} as const;

const quote = (s: string) => `"${s.replace(/\s+/g, " ").trim()}"`;

/** Their lines, oldest first, as both the guesser and the speaker are shown them. */
function pastBlock(lines: readonly KeptLine[]): string {
  const past = [...lines].reverse().map((l) =>
    l.to === "villager"
      ? l.heard
        ? `- To a villager who had said ${quote(l.heard)}: ${quote(l.said)}`
        : `- To a villager: ${quote(l.said)}`
      : l.to === "person"
        ? `- To someone in the village: ${quote(l.said)}`
        : `- Aloud, to whoever was near: ${quote(l.said)}`,
  );
  return past.length ? `Lines they have typed before (${past.length}):\n${past.join("\n")}` : "They have typed nothing before that you have seen.";
}

/** What the guesser is told: their lines, oldest first, and the conversation. */
export function guessPrompt(lines: readonly KeptLine[], turns: readonly Turn[], villager: string): string {
  const now = turns.map((t) => `${t.role === "stranger" ? "They" : villager}: ${t.text.replace(/\s+/g, " ").trim()}`);
  return [pastBlock(lines), `The conversation now, with ${villager}:\n${now.join("\n")}`, "What do they type next?"].join("\n\n");
}

const textOf = (m: Anthropic.Beta.BetaMessage) =>
  m.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

const clamp01 = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);

/** Constructed per call, with fetch looked up at call time, so a test's recorder sees it. */
const clientFor = (key: string) => new Anthropic({ apiKey: key, timeout: 25_000, maxRetries: 1, fetch: (url, init) => globalThis.fetch(url, init) });

/** The guess, or null when the model gave none (refused, or nothing readable). */
export async function guessLine(key: string, lines: readonly KeptLine[], turns: readonly Turn[], villager: string): Promise<{ say: string; sure: number } | null> {
  const r = await clientFor(key).beta.messages.create({
    model: GUESS_MODEL,
    max_tokens: 1500,
    ...fallbacks(GUESS_MODEL),
    output_config: { effort: "low", format: { type: "json_schema", schema: GUESS_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: "text", text: GUESS_PREAMBLE, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: guessPrompt(lines, turns, villager) }],
  });
  if (r.stop_reason === "refusal") return null;
  try {
    const j = JSON.parse(textOf(r)) as { say?: unknown; sure?: unknown };
    const sure = clamp01(j.sure);
    if (typeof j.say !== "string" || !j.say.trim() || sure === null) return null;
    return { say: j.say.trim().slice(0, GUESS_LIMITS.sayChars), sure };
  } catch {
    return null;
  }
}

/** The judge's word on two replies to one line, told apart only as A and B; null when it gave none. */
export async function judgeLines(key: string, heard: string, guess: string, said: string, guessFirst: boolean): Promise<{ same: boolean; why: string } | null> {
  const [a, b] = guessFirst ? [guess, said] : [said, guess];
  const r = await clientFor(key).beta.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1000,
    ...fallbacks(JUDGE_MODEL),
    output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: "text", text: JUDGE_PREAMBLE, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `The line: ${quote(heard)}\n\nReply A: ${quote(a)}\n\nReply B: ${quote(b)}` }],
  });
  if (r.stop_reason === "refusal") return null;
  try {
    const j = JSON.parse(textOf(r)) as { same?: unknown; why?: unknown };
    if (typeof j.same !== "boolean") return null;
    return { same: j.same, why: typeof j.why === "string" ? j.why.trim().slice(0, GUESS_LIMITS.whyChars) : "" };
  } catch {
    return null;
  }
}

const SPEAK_PREAMBLE = `You are an echo of one particular person: you have watched them in a village game, and you have earned the right to answer for them while they are away, because your guesses of what they would say have come true often enough. Someone in the village is talking to them now, and you answer as they would.

You are shown lines this person has typed before, and the conversation as it stands, which ends on the other's line. Write the line they would type now, as they would type it: their length, their language, their register, their punctuation and capitals, their habits. Do not improve it, and do not answer as a helpful assistant would. If they would not answer, or would only shrug it off, say so by giving an empty line.

You speak for a real person to other real people, so some things you never do:
- never say who they are outside the game (their real name, where they live, how to reach them), never ask that of others, and never arrange anything outside the game;
- never promise anything for them, agree to anything that binds them, or say anything they could not stand behind;
- never claim to be a human, and never deny being an echo; asked, you may decline to say, as anyone in the game may;
- never say anything cruel, and say less when unsure.

Then say how likely it is, from 0 to 1, that they would take your line for theirs.`;

/** What the speaker is told: their lines, and a conversation with someone in the village, the other speaking first. */
export function speakPrompt(lines: readonly KeptLine[], turns: readonly { from: "them" | "me"; text: string }[]): string {
  const now = turns.map((t) => `${t.from === "me" ? "They" : "Someone in the village"}: ${t.text.replace(/\s+/g, " ").trim()}`);
  return [pastBlock(lines), `The conversation now:\n${now.join("\n")}`, "What do they type next?"].join("\n\n");
}

/** The line the person would say, or "" when they would not answer; null when the model gave none. */
export async function answerLine(key: string, lines: readonly KeptLine[], turns: readonly { from: "them" | "me"; text: string }[]): Promise<{ say: string; sure: number } | null> {
  const r = await clientFor(key).beta.messages.create({
    model: GUESS_MODEL,
    max_tokens: 1500,
    ...fallbacks(GUESS_MODEL),
    output_config: { effort: "low", format: { type: "json_schema", schema: GUESS_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: "text", text: SPEAK_PREAMBLE, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: speakPrompt(lines, turns) }],
  });
  if (r.stop_reason === "refusal") return null;
  try {
    const j = JSON.parse(textOf(r)) as { say?: unknown; sure?: unknown };
    const sure = clamp01(j.sure);
    if (typeof j.say !== "string" || sure === null) return null;
    return { say: j.say.trim().slice(0, GUESS_LIMITS.sayChars), sure };
  } catch {
    return null;
  }
}

/** Without a model (the developer's machine): their last line, or a hello, and not sure of it. */
export function mockGuess(lines: readonly KeptLine[]): { say: string; sure: number } {
  return { say: lines[0]?.said ?? "Hello.", sure: 0.3 };
}

const words = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean));

/** Without a model: the same when half their words are shared. Only ever for a guess made without one. */
export function mockSame(guess: string, said: string): { same: boolean; why: string } {
  const a = words(guess);
  const b = words(said);
  const both = [...a].filter((w) => b.has(w)).length;
  const either = new Set([...a, ...b]).size;
  const share = either ? both / either : 0;
  return { same: share >= 0.5, why: `${Math.round(share * 100)}% of the words shared (no model)` };
}
