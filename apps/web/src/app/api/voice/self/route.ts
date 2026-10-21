/**
 * Your own voice (DECISIONS C62): `GET /api/voice/self` says whether the caller has one here, and
 * `POST /api/voice/self` speaks their own words in it.
 *
 * Only their own: the owner's, bound by `ECHO_OWNER_SUBJECTS` and `ELEVENLABS_OWNER_VOICE_ID`; anyone's
 * bound in `ECHO_VOICES` (C71); or a demo visitor's, for its day (C72) — `lib/demo.ts` `personVoice`. The
 * subject comes from the caller's signed identity. The
 * words are theirs to choose, so no token is asked for, unlike a villager's line; but nobody else
 * gets a word of it, and it is rate-limited with the rest of speech (bucket `voice`).
 */
import { NextResponse } from "next/server";

import { personVoice } from "@/lib/demo";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";
import { speakLine } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) return NextResponse.json({ mine: false });
  return NextResponse.json({ mine: (await personVoice(villageStore(), caller.subject)) !== null && !!process.env.ELEVENLABS_API_KEY });
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const voice = await personVoice(villageStore(), caller.subject);
  if (!voice) return bad("not_your_voice", 403);
  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return bad("bad_text");
  if (text.length > 400) return bad("too_long", 413);
  const rate = await rateLimit(req, { bucket: "voice", windowMs: 10 * 60 * 1000, max: 80, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const audio = await speakLine(text, voice);
  if (!audio) return bad("no_voice", 503);
  return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
}
