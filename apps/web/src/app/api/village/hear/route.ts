/**
 * What the stranger said aloud, as text (DECISIONS C60): `POST /api/village/hear`.
 *
 * The body is the recording itself: a few seconds of audio, taken while the stranger held the key.
 * It goes to ElevenLabs to be written down, and the text comes back. Nothing of the recording is
 * kept here, and nothing about how the stranger sounds is read: what the panel sends on is the
 * words, exactly as if they had been typed. `?lang=` names the stranger's language when the page
 * knows it.
 *
 * 503 `no_ears` without a key or when ElevenLabs does not answer; the panel says so, and the stranger
 * types.
 */
import { NextResponse } from "next/server";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { hearSpeech } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fifteen seconds of speech, compressed, comes nowhere near this. */
const MAX_BYTES = 1_500_000;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!type.startsWith("audio/")) return bad("not_audio", 415);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return bad("too_long", 413);
  const lang = new URL(req.url).searchParams.get("lang");
  const language = lang && /^[a-z]{2,3}$/.test(lang) ? lang : null;

  const rate = await rateLimit(req, { bucket: "voice", windowMs: 10 * 60 * 1000, max: 80, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const audio = await req.arrayBuffer();
  if (audio.byteLength > MAX_BYTES) return bad("too_long", 413);
  if (audio.byteLength < 800) return bad("too_short", 422);
  const text = await hearSpeech(audio, type, language);
  if (text === null) return bad("no_ears", 503);
  return NextResponse.json({ text: text.slice(0, 400) });
}
