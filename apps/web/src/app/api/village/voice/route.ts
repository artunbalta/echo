/**
 * A villager's reply, in their own voice (DECISIONS C60): `POST /api/village/voice`.
 *
 * It speaks only words that villager said to this stranger, in the last ten minutes: the talk route
 * signs every reply (`signLine`), and this checks the signature. Otherwise it would read anything
 * anyone sent it aloud, on this project's account. The voice is the person's (`voices.ts`
 * `pickVoice`), from their sex, age and temperament, the same on every visit.
 *
 * 503 `no_voice` means there is no key, or no list of voices, or ElevenLabs did not answer. The panel
 * then speaks with the browser's own local voice, as before C60.
 */
import { NextResponse } from "next/server";
import { ageYears, present, temperamentOf } from "@echo/planet";
import { PERSONA_AXIS_KEYS } from "@echo/shared";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage, verifyLine } from "@/lib/villageTalk";
import { pickVoice, speakLine, voiceList } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;
/** "Lively and quick" against "slow and unhurried", in a temperament. */
const ENERGY = PERSONA_AXIS_KEYS.indexOf("energy");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; person?: unknown; text?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, person, text, token } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof person !== "string" || !PERSON.test(person)) return bad("bad_person");
  if (typeof text !== "string" || text.trim().length === 0) return bad("bad_text");
  if (text.length > 900) return bad("too_long", 413);
  if (!verifyLine(token, caller.subject, cell, person, text, Date.now())) return bad("not_their_words", 403);

  const rate = await rateLimit(req, { bucket: "voice", windowMs: 10 * 60 * 1000, max: 80, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const loaded = await loadVillage(cell);
  if (!loaded) return bad("no_village", 404);
  const s = loaded.village.settlement;
  const me = s.people.find((p) => p.id === person);
  if (!me || !present(s, me, loaded.day)) return bad("no_such_villager", 404);

  const voices = await voiceList();
  const choice = voices ? pickVoice({ id: me.id, sex: me.sex, ageYears: ageYears(me, loaded.day), lively: temperamentOf(s, me)[ENERGY] }, voices) : null;
  const audio = choice ? await speakLine(text, choice) : null;
  if (!audio) return bad("no_voice", 503);
  return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
}
