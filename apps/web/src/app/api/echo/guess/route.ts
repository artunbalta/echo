/**
 * Your echo guesses what you will say to a villager, and seals it (DECISIONS C108).
 *
 * POST `{ cell, room?, person, conv, history }`: the moment a villager's line comes, the panel asks for the
 * echo's guess of your answer. `history` is the conversation as the talk route has it, ending on that line;
 * `conv` is the conversation's token (`talk/begin`), so a guess is made only inside a conversation that was
 * begun where the villager stood. The answer is `{ box }`: the guess sealed in a box the page carries and
 * cannot open (`talkGuess.ts`), handed back with your answer to `/api/echo/settle`. Nothing is kept here.
 *
 * Only while you have said yes to keeping your words (`/api/echo/words`): refused with 409 otherwise, before
 * anything is spent.
 *
 * IT SPENDS, SO IT IS GUARDED LIKE THE ROUTES THAT SPEND (⚑30): a signed subject first, the conversation's
 * token, caps answered 413 before any provider call, a rate limit that fails closed on a deployment, and no
 * guess at all on a deployment without a key.
 *
 * PRIVATE. Signed subject: your own lines, your own guess.
 */
import { NextResponse } from "next/server";
import { roomOfRequest, worldKey } from "@echo/shared";

import { GUESS_LIMITS, LINES_SHOWN, guessLine, mockGuess, readTurns, sealGuess, type SealedGuess } from "@/lib/knowable/talkGuess";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { identitySecrets, subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";
import { loadVillage, verifyConversation } from "@/lib/villageTalk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; room?: unknown; person?: unknown; conv?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, person } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  const room = roomOfRequest(cell, body.room);
  if (!room.ok) return bad("bad_room");
  if (typeof person !== "string" || !PERSON.test(person)) return bad("bad_person");
  if (Array.isArray(body.history) && body.history.length > GUESS_LIMITS.turns) return bad("history_too_long", 413);
  const turns = readTurns(body.history);
  if (!turns) return bad("bad_history");
  const now = Date.now();
  if (!verifyConversation(body.conv, caller.subject, worldKey(cell, room.room), person, now)) return bad("no_conversation", 403);

  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const on = await store.wordsOf(caller.subject);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);
  const [secret] = identitySecrets();
  if (!secret) return bad("identity_unconfigured", 503);

  const deployed = process.env.NODE_ENV === "production" || !!process.env.VERCEL_ENV;
  if (!KEY && deployed) return bad("no_model", 503);
  const rate = await rateLimit(req, { bucket: "echo-guess", windowMs: 10 * 60 * 1000, max: 100, onUnavailable: deployed ? "deny" : "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const lines = (await store.linesOf(caller.subject, LINES_SHOWN)) ?? [];
  // The villager by their given name, as the person sees them; the village as this world has it (C102).
  const loaded = await loadVillage(cell, now, villageStore(room.room)).catch(() => null);
  const villager = loaded?.village.settlement.people.find((p) => p.id === person)?.given ?? "The villager";
  let made: { say: string; sure: number } | null;
  let source: SealedGuess["source"] = "model";
  if (!KEY) {
    made = mockGuess(lines);
    source = "mock";
  } else {
    try {
      made = await guessLine(KEY, lines, turns, villager);
    } catch (err) {
      console.warn("[echo-guess] failed:", (err as Error).message);
      return bad("no_guess", 502);
    }
  }
  if (!made) return bad("no_guess", 502);
  const heard = turns[turns.length - 1]!.text;
  const box = sealGuess({ v: 1, sub: caller.subject, cell, room: room.room, person, heard, guess: made.say, sure: made.sure, at: now, source }, secret);
  return NextResponse.json({ box }, { headers: { "cache-control": "no-store" } });
}
