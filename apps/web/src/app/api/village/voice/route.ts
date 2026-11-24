/**
 * A villager's reply, in their own voice (DECISIONS C60): `POST /api/village/voice`.
 *
 * It speaks only words that villager said to this stranger, in the last ten minutes: the talk route
 * signs every reply (`signLine`), and this checks the signature. Otherwise it would read anything
 * anyone sent it aloud, on this project's account. The voice is the person's (`voices.ts`
 * `pickVoice`), from their sex, age and temperament, the same on every visit.
 *
 * A LINE SAID IN A VILLAGE ROOM (C110) is read the same way, in a voice picked the same way for the body that
 * said it: its look (`roomLookOf`: a digest, a sex, an age) stands for a villager's sex, age and temperament,
 * so nothing about the voice says whether someone came in through the door. It speaks only a line the room
 * handed this caller in the last ten minutes, by the room's token for it (`signToldVoice`), bound to them, the
 * room, the body's look, the line and the moment.
 *
 * 503 `no_voice` means there is no key, or no list of voices, or ElevenLabs did not answer. The panel
 * then speaks with the browser's own local voice, as before C60.
 */
import { NextResponse } from "next/server";
import { ageYears, present, temperamentOf } from "@echo/planet";
import { PERSONA_AXIS_KEYS, ROOM, ROOM_VILLAGES, normalizeRoomCode } from "@echo/shared";
import { verifyToldVoice } from "@echo/shared/standin";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { identitySecrets, subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage, verifyLine } from "@/lib/villageTalk";
import { pickVoice, speakLine, voiceList } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;
/** "Lively and quick" against "slow and unhurried", in a temperament. */
const ENERGY = PERSONA_AXIS_KEYS.indexOf("energy");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
/** How long a room's token for a line is good for, ms: a line just said, not one kept to be read later. */
const TOLD_MS = 10 * 60 * 1000;
const SEED = /^[0-9a-f]{8}$/;

/** A number in [0, 1) from a string: how lively a body from a room is, from its look, as a temperament gives a villager's. */
function unitOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * A line said in a village room (C110): the voice for the body that said it, if the room's token is for exactly
 * this line said to this caller; else why not.
 */
function roomVoice(subject: string, b: Record<string, unknown>): { id: string; sex: "f" | "m"; ageYears: number; lively: number } | { error: string; status: number } {
  const { cell, room, seed, sex, age, at, text, token } = b;
  if (typeof cell !== "string" || !ROOM_VILLAGES.includes(cell)) return { error: "bad_cell", status: 400 };
  if (typeof room !== "string" || normalizeRoomCode(room) !== room) return { error: "bad_room", status: 400 };
  if (typeof seed !== "string" || !SEED.test(seed) || (sex !== "f" && sex !== "m") || typeof age !== "number" || !Number.isInteger(age) || age < 0 || age > 120) return { error: "bad_body", status: 400 };
  if (typeof text !== "string" || !text.trim() || text.length > ROOM.sayMaxChars) return { error: "bad_text", status: 400 };
  if (typeof at !== "number" || !Number.isFinite(at) || Date.now() - at > TOLD_MS || at - Date.now() > 60_000) return { error: "not_their_words", status: 403 };
  if (!verifyToldVoice({ sub: subject, cell, room, seed, sex, age, text, at }, token, identitySecrets())) return { error: "not_their_words", status: 403 };
  return { id: `room:${seed}`, sex, ageYears: age, lively: unitOf(`${seed}/lively`) * 2 - 1 };
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; person?: unknown; text?: unknown; token?: unknown; room?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  // Someone in a village room said it (C110): their body's voice, by the room's token.
  if (body && typeof body === "object" && body.room !== undefined) {
    const who = roomVoice(caller.subject, body as Record<string, unknown>);
    if ("error" in who) return bad(who.error, who.status);
    const rate = await rateLimit(req, { bucket: "voice", windowMs: 10 * 60 * 1000, max: 80, onUnavailable: "allow" });
    if (!rate.ok) {
      const { body: error, status } = rateLimitRejection(rate);
      return NextResponse.json(error, { status });
    }
    const voices = await voiceList();
    const choice = voices ? pickVoice(who, voices) : null;
    const audio = choice ? await speakLine(String(body.text), choice) : null;
    if (!audio) return bad("no_voice", 503);
    return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
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
