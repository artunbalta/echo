/**
 * What you said, against what your echo guessed you would (DECISIONS C108).
 *
 * POST `{ box, said }`: the box `/api/echo/guess` sealed before you answered, and your answer. The box is
 * opened here and nowhere else; a model shown the villager's line and the two replies as A and B, in an
 * order drawn now, says whether they mean the same and sound the same (`talkGuess.ts`). That is one talk
 * look, kept under the seal of what was guessed, so a box settled twice counts once; your answer is kept as
 * one of your lines. Answers `{ kept, seal }` and nothing of the verdict: the panel you are talking in shows
 * nothing of it (in a village room that would tell a villager from a person), and "When you leave" does.
 *
 * Refused (409) without a yes to keeping your words, and a box that is not yours, was changed, or waited
 * longer than {@link GUESS_MS} for its answer is refused too: it is no longer about this line.
 *
 * PRIVATE. Signed subject.
 */
import { randomInt } from "node:crypto";

import { NextResponse } from "next/server";

import { GUESS_MS, judgeLines, mockSame, openGuess, sealOf } from "@/lib/knowable/talkGuess";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { identitySecrets, subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SAID_MAX = 400;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { box?: unknown; said?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  if (typeof body.said !== "string" || body.said.trim() === "") return bad("bad_said");
  if (body.said.length > SAID_MAX) return bad("said_too_long", 413);
  const said = body.said.trim();
  const g = openGuess(body.box, identitySecrets());
  if (!g) return bad("bad_box");
  if (g.sub !== caller.subject) return bad("not_yours", 403);
  const now = Date.now();
  if (now - g.at > GUESS_MS || g.at - now > 60_000) return bad("stale", 410);

  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const on = await store.wordsOf(caller.subject);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);

  const deployed = process.env.NODE_ENV === "production" || !!process.env.VERCEL_ENV;
  // A guess made by a model is judged by one; one made without (the developer's machine) is counted by words.
  if (g.source === "model" && !KEY) return bad("no_model", 503);
  const rate = await rateLimit(req, { bucket: "echo-guess", windowMs: 10 * 60 * 1000, max: 100, onUnavailable: deployed ? "deny" : "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  // Your answer is one of your lines, whatever the judge says.
  const line = await store.keepLine(caller.subject, { at: new Date(now).toISOString(), cell: g.cell, room: g.room, to: "villager", heard: g.heard, said });

  let verdict: { same: boolean; why: string } | null;
  if (g.source === "mock") verdict = mockSame(g.guess, said);
  else {
    try {
      verdict = await judgeLines(KEY, g.heard, g.guess, said, randomInt(2) === 0);
    } catch (err) {
      console.warn("[echo-settle] judge failed:", (err as Error).message);
      verdict = null;
    }
  }
  // No verdict, no look: a guess nobody judged is not counted either way.
  if (!verdict) return NextResponse.json({ kept: false, line }, { status: 502 });
  const seal = sealOf(g);
  const kept = await store.keepTalkLook(caller.subject, {
    seal,
    cell: g.cell,
    heard: g.heard,
    guess: g.guess,
    p: g.sure,
    said,
    hit: verdict.same,
    why: verdict.why || null,
    sealedAt: new Date(g.at).toISOString(),
  });
  if (!kept) return bad("store_unavailable", 503);
  return NextResponse.json({ kept: true, seal });
}
