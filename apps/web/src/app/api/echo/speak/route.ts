/**
 * What an echo says for its person in a village room (DECISIONS C109).
 *
 * POST, from a room only: a `SpeakRequest` signed with the identity secret both hold (`x-echo-room`,
 * `@echo/shared/standin` `signSpeak`). Someone talked to a body the person's echo keeps; the room asks what
 * the person would say. Answers `{ say, sure }`, `say` null when they would say nothing.
 *
 * THE RIGHT IS CHECKED HERE, NOT TAKEN FROM THE ROOM. The room answers by the talk level in the brief it holds,
 * which may be up to two hours old. Here the person's yes to keeping their words, their settled guesses and
 * their "not me"s of lines said for them are read again, and talking must stand at `act` for an answer the
 * room will say itself, or at `ask` at least for one it will put to the person watching (409 otherwise).
 *
 * WHAT IS SENT AND WHAT IS KEPT. The person's kept lines and the conversation go to the model; what the other
 * said is theirs and is kept nowhere, here or in the room. The line said for the person is in what the echo
 * did, which the room reports when the keeping ends, for the person to say "not me" of.
 *
 * WHAT IT MAY SAY is bounded in the prompt (`talkGuess.ts` `SPEAK_PREAMBLE`): nothing of who the person is
 * outside the game, no promises or arrangements in their name, never a claim to be human or a denial of
 * being an echo.
 *
 * A deployment without a key says nothing (503). On the developer's own machine without one, the answer is
 * their last line, so the flow can be tried.
 */
import { NextResponse } from "next/server";
import { ROOM, ROOM_VILLAGES, STAND_IN, normalizeRoomCode, type SpeakRequest } from "@echo/shared";
import { verifySpeak } from "@echo/shared/standin";

import { standingOf, vetoesByBucket } from "@/lib/knowable/standing";
import { LINES_SHOWN, answerLine, mockGuess } from "@/lib/knowable/talkGuess";
import { identitySecrets } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
/** A request older than this is not about a line just said, ms. */
const FRESH_MS = 60_000;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The request as it can be answered, or null. */
function readRequest(raw: unknown): SpeakRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sub !== "string" || !r.sub || r.sub.length > 200) return null;
  if (typeof r.cell !== "string" || !ROOM_VILLAGES.includes(r.cell)) return null;
  if (typeof r.room !== "string" || normalizeRoomCode(r.room) !== r.room) return null;
  if (r.mode !== "act" && r.mode !== "ask") return null;
  if (typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  if (!Array.isArray(r.turns) || r.turns.length < 1 || r.turns.length > STAND_IN.talkContext) return null;
  const turns: SpeakRequest["turns"] = [];
  for (const t of r.turns) {
    const x = t as { from?: unknown; text?: unknown } | null;
    if (!x || (x.from !== "them" && x.from !== "me") || typeof x.text !== "string" || !x.text.trim() || x.text.length > ROOM.sayMaxChars) return null;
    turns.push({ from: x.from, text: x.text });
  }
  if (turns[turns.length - 1]!.from !== "them") return null;
  return { sub: r.sub, cell: r.cell, room: r.room, mode: r.mode, turns, at: r.at };
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 20_000) return bad("too_long", 413);
  if (!verifySpeak(raw, req.headers.get("x-echo-room"), identitySecrets())) return bad("not_a_room", 401);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return bad("bad_request");
  }
  const ask = readRequest(parsed);
  if (!ask) return bad("bad_request");
  const now = Date.now();
  if (Math.abs(now - ask.at) > FRESH_MS) return bad("stale", 410);

  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const [on, talk, vetoes] = await Promise.all([store.wordsOf(ask.sub), store.talkLooksOf(ask.sub), store.vetoesOf(ask.sub)]);
  if (on === null || talk === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);
  const level = standingOf([], vetoesByBucket(vetoes ?? []), talk.map((t) => ({ p: t.p, hit: t.hit }))).find((s) => s.bucket === "talk")!.level;
  if (level === "watch" || (ask.mode === "act" && level !== "act")) return bad("not_earned", 409);

  const deployed = process.env.NODE_ENV === "production" || !!process.env.VERCEL_ENV;
  if (!KEY && deployed) return bad("no_model", 503);
  const lines = (await store.linesOf(ask.sub, LINES_SHOWN)) ?? [];
  if (!KEY) {
    const m = mockGuess(lines);
    return NextResponse.json({ say: m.say, sure: m.sure });
  }
  try {
    const got = await answerLine(KEY, lines, ask.turns);
    if (!got) return NextResponse.json({ say: null });
    return NextResponse.json({ say: got.say || null, sure: got.sure });
  } catch (err) {
    console.warn("[echo-speak] failed:", (err as Error).message);
    return bad("no_answer", 502);
  }
}
