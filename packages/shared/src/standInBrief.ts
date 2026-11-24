/**
 * The brief an echo keeps its person's body by (DECISIONS C104), signed by the web app and read by the
 * village room.
 *
 * WHY SIGNED. The web app is where the person's record is kept (C103) and where the echo's calls and
 * standing are worked out; the room is where the body is. The page carries the brief between the two,
 * so the page could change it on the way: a forged brief would let an echo do, in a room of friends,
 * what it has not earned. Signed with the identity secret both already hold (`identityToken.ts`), the
 * room reads it as the web app wrote it, or not at all.
 *
 * WHAT IS NOT SECRET about it: nothing in it is sent on to anyone. The room keeps it beside the body,
 * on the server's side of the process, and uses it only to move that body.
 *
 * Reached by the `@echo/shared/standin` subpath, not the barrel: it imports `node:crypto` (see
 * `identityToken.ts` for why the barrel must not).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { STAND_IN, STAND_IN_LEVELS, type StandInBrief, type StandInCall, type StandInLevel } from "./village.js";

const VERSION = "standin1";
/** A word of its own in what is signed, so no signature over a brief can ever pass for one over anything else. */
const DOMAIN = "echo.standin";
const KIND = /^[a-z-]{1,40}$/;
const KINDS_MAX = 120;

const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(`${DOMAIN}|${payload}`).digest("base64url");

/** The brief as a token: `standin1.<json, base64url>.<signature>`. */
export function signBrief(brief: StandInBrief, secret: string): string {
  if (!brief.sub) throw new Error("[standin] refusing to sign a brief for nobody");
  if (!secret) throw new Error("[standin] refusing to sign with an empty secret");
  const payload = `${VERSION}.${Buffer.from(JSON.stringify(brief), "utf8").toString("base64url")}`;
  return `${payload}.${signature(payload, secret)}`;
}

function readCall(raw: unknown): StandInCall | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.call !== "string" || !KIND.test(c.call)) return null;
  if (typeof c.p !== "number" || !Number.isFinite(c.p) || c.p < 0 || c.p > 1) return null;
  if (!STAND_IN_LEVELS.includes(c.may as StandInLevel)) return null;
  return { call: c.call, p: c.p, may: c.may as StandInLevel };
}

/**
 * The brief a token carries, or null: not one, not signed by any of `secrets`, out of date at `now`, or
 * not in the shape the room reads. Null is the only failure, as `verifyIdentity`'s is.
 */
export function verifyBrief(token: unknown, secrets: readonly string[], now: number): StandInBrief | null {
  if (typeof token !== "string" || token.length > STAND_IN.briefMaxChars) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const offered = Buffer.from(parts[2]!, "base64url");
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(signature(payload, secret), "base64url");
    if (expected.length === offered.length && timingSafeEqual(expected, offered)) matched = true;
  }
  if (!matched) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.sub !== "string" || !b.sub || b.sub.length > 200) return null;
  if (typeof b.exp !== "number" || !Number.isFinite(b.exp) || b.exp <= now) return null;
  if (!b.calls || typeof b.calls !== "object" || Array.isArray(b.calls)) return null;
  const entries = Object.entries(b.calls as Record<string, unknown>);
  if (entries.length > KINDS_MAX) return null;
  const calls: Record<string, StandInCall> = {};
  for (const [kind, c] of entries) {
    const call = KIND.test(kind) ? readCall(c) : null;
    if (!call) return null;
    calls[kind] = call;
  }
  // Talking (C109): one of the three. A brief from before it has no word on it, and the room reads that as silent.
  if (b.talk !== undefined && !STAND_IN_LEVELS.includes(b.talk as StandInLevel)) return null;
  return { sub: b.sub, exp: b.exp, calls, ...(b.talk !== undefined ? { talk: b.talk as StandInLevel } : {}) };
}

// ── a room's report to the web app (DECISIONS C105) ────────────────────────────────

/** Its own word in what is signed: a report's signature can pass for nothing else, and nothing else for it. */
const REPORT = "echo.away";

/** The signature a room sends beside a report's body, as the header `x-echo-room`. */
export function signReport(body: string, secret: string): string {
  if (!secret) throw new Error("[standin] refusing to sign with an empty secret");
  return createHmac("sha256", secret).update(`${REPORT}|${body}`).digest("base64url");
}

/** Whether `signature` is a room's over exactly `body`, by any of `secrets`. */
export function verifyReport(body: string, signature: unknown, secrets: readonly string[]): boolean {
  if (typeof signature !== "string" || !signature) return false;
  const offered = Buffer.from(signature, "base64url");
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(createHmac("sha256", secret).update(`${REPORT}|${body}`).digest("base64url"), "base64url");
    if (expected.length === offered.length && timingSafeEqual(expected, offered)) matched = true;
  }
  return matched;
}

// ── a room asking the web app what an echo would say (DECISIONS C109) ─────────────────

/** Its own word in what is signed: neither a report's nor a brief's signature can pass for a request to speak. */
const SPEAK = "echo.speak";

/** The signature a room sends beside a request to speak, as the header `x-echo-room`. */
export function signSpeak(body: string, secret: string): string {
  if (!secret) throw new Error("[standin] refusing to sign with an empty secret");
  return createHmac("sha256", secret).update(`${SPEAK}|${body}`).digest("base64url");
}

/** Whether `signature` is a room's request to speak over exactly `body`, by any of `secrets`. */
export function verifySpeak(body: string, signature: unknown, secrets: readonly string[]): boolean {
  if (typeof signature !== "string" || !signature) return false;
  const offered = Buffer.from(signature, "base64url");
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(createHmac("sha256", secret).update(`${SPEAK}|${body}`).digest("base64url"), "base64url");
    if (expected.length === offered.length && timingSafeEqual(expected, offered)) matched = true;
  }
  return matched;
}

// ── things passed between people in a room, and the voice a line is said in (DECISIONS C110) ──

const sign = (domain: string, body: string, secret: string) => {
  if (!secret) throw new Error("[standin] refusing to sign with an empty secret");
  return createHmac("sha256", secret).update(`${domain}|${body}`).digest("base64url");
};
const verify = (domain: string, body: string, signature: unknown, secrets: readonly string[]) => {
  if (typeof signature !== "string" || !signature) return false;
  const offered = Buffer.from(signature, "base64url");
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = Buffer.from(createHmac("sha256", secret).update(`${domain}|${body}`).digest("base64url"), "base64url");
    if (expected.length === offered.length && timingSafeEqual(expected, offered)) matched = true;
  }
  return matched;
};

/** Its own word: a hand-over the room asks the web app to make, which no other signature passes for. */
const HAND = "echo.hand";

/** The signature a room sends beside a hand-over between two people (`HandRequest`), as `x-echo-room`. */
export const signHand = (body: string, secret: string): string => sign(HAND, body, secret);

/** Whether `signature` is a room's hand-over over exactly `body`, by any of `secrets`. */
export const verifyHand = (body: string, signature: unknown, secrets: readonly string[]): boolean => verify(HAND, body, signature, secrets);

/** Its own word: a line the room vouches was said to this person, by a body that looks like this. */
const VOICE = "echo.voice";

/** What a room vouches for when it hands a line on (`ToldVoice`), in the one order it is signed in. */
export interface ToldVoice {
  /** Who it was said to: only they may have it said aloud. */
  sub: string;
  cell: string;
  room: string;
  /** The look of the body that said it (`roomLookOf`): what its voice is picked from, as a villager's is. */
  seed: string;
  sex: "f" | "m";
  age: number;
  text: string;
  at: number;
}

const voiceBody = (v: ToldVoice) => JSON.stringify([v.sub, v.cell, v.room, v.seed, v.sex, v.age, v.text, v.at]);

/** The token beside a line handed on in a room, which the voice route reads it aloud on. */
export const signToldVoice = (v: ToldVoice, secret: string): string => sign(VOICE, voiceBody(v), secret);

/** Whether `token` is the room's for exactly this line, to this person, by any of `secrets`. */
export const verifyToldVoice = (v: ToldVoice, token: unknown, secrets: readonly string[]): boolean => verify(VOICE, voiceBody(v), token, secrets);
