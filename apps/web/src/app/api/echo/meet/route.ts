/**
 * Two echoes meeting (DECISIONS C71): `POST /api/echo/meet`.
 *
 * - `{ op: "back" }`: after the page has come back (`/api/echo/away`, which plans any meeting due), fill
 *   one planned meeting of the caller's, if nobody else is filling it, and hand back the meetings not yet
 *   told, as the caller is allowed to see them (`shownMeeting`): their own echo's lines with the gate's
 *   reading; the other's lines only where they were said aloud.
 * - `{ op: "answer", id, line, agreed }`: the caller's word on one of THEIR OWN echo's lines, once. It goes
 *   to the engine as an outing's answer does, with the confidence the gate had then, and trains the same
 *   bucket. Nobody answers for the other person's echo.
 * - `{ op: "read", id }`: told to the caller; the other person's copy is theirs.
 * - `{ op: "voice", id, line }`: one line of the meeting, spoken in its speaker's own voice when they have
 *   one here (C62, C71), for the two people in the meeting only, and only lines that were said aloud
 *   unless the line is the caller's own. No voice: 204, and the page uses a voice of its own. The words
 *   are the stored line's, never the caller's, so nobody can make another person's voice say anything.
 */
import { NextResponse } from "next/server";

import { MEETING, fillMeeting, shownMeeting, sideOf, untoldMeetings } from "@/lib/echoMeeting";
import { agentFeedback } from "@/lib/ml";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";
import { speakLine, voiceOf } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { op?: unknown; id?: unknown; line?: unknown; agreed?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const voiceOp = body.op === "voice";
  const rate = await rateLimit(req, voiceOp ? { bucket: "voice", windowMs: 10 * 60 * 1000, max: 80, onUnavailable: "allow" } : { bucket: "meet", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const now = Date.now();
  const me = caller.subject;

  const meetings = await store.meetingsOf(me, 20);
  if (meetings === null) return NextResponse.json({ meetings: [], reason: "unreadable" });

  if (body.op === "back") {
    // One fill a request: a fill can take forty seconds, and the route has sixty.
    const due = meetings
      .filter((m) => m.status === "planned" || (m.status === "making" && m.makingAt !== null && now - Date.parse(m.makingAt) > MEETING.staleMs))
      .sort((a, b) => a.madeAt.localeCompare(b.madeAt))[0];
    let list = meetings;
    if (due) {
      const made = await fillMeeting(store, due, now);
      if (made) list = meetings.map((m) => (m.id === made.id ? made : m));
    }
    return NextResponse.json({ meetings: untoldMeetings(list, me, now).map((m) => shownMeeting(m, me)) });
  }

  const m = typeof body.id === "string" ? meetings.find((x) => x.id === body.id) : undefined;
  const side = m ? sideOf(m, me) : null;
  if (!m || !side || m.status !== "made") return bad("not_yours", 404);

  if (body.op === "read") {
    if (!(await store.readMeeting(m.id, side, new Date(now).toISOString()))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true });
  }

  const i = typeof body.line === "number" && Number.isInteger(body.line) ? body.line : -1;
  const l = m.lines[i];
  if (!l) return bad("bad_line");

  if (body.op === "answer") {
    if (l.who !== side) return bad("not_your_echo", 403);
    if (typeof body.agreed !== "boolean") return bad("bad_answer");
    const mine = side === "a" ? m.feedbackA : m.feedbackB;
    if (mine[String(i)] !== undefined) return bad("answered", 409);
    if (now - Date.parse(m.madeAt) > MEETING.unreadMs) return bad("too_late", 409);
    const agreed = body.agreed;
    const result = (await agentFeedback({
      userId: me,
      bucket: l.turn.bucket,
      confidence: l.turn.confidence,
      agreed,
      context: l.turn.context,
      ...(agreed ? {} : { rejected: l.text }),
    })) as { mocked?: boolean; bucket?: { level?: string; changed?: boolean } };
    if (result.mocked) return bad("no_engine", 503);
    if (!(await store.answerMeeting(m.id, side, { ...mine, [String(i)]: agreed }))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true, bucket: result.bucket ?? null });
  }

  if (voiceOp) {
    // The other person's held-back words are theirs: not shown, so not spoken either.
    if (l.who !== side && !l.said) return bad("held_back", 403);
    const voice = voiceOf(l.who === "a" ? m.a : m.b);
    if (!voice || !process.env.ELEVENLABS_API_KEY) return new Response(null, { status: 204 });
    const audio = await speakLine(l.text, voice);
    if (!audio) return new Response(null, { status: 204 });
    return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
  }

  return bad("bad_op");
}
