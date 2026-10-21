/**
 * Five minutes to you (DECISIONS C72): `/api/demo`. Every call answers 404 while the demo is off
 * (`lib/demo.ts` `demoConfig`).
 *
 * - `GET`: that it is on, whose echo a visitor's meets, and the caller's visit, if any.
 * - `POST ?op=start`, `{ name }`: begin a visit under the caller's (fresh) identity, or carry on one begun
 *   within the hour; the visitor is paired with the host at once.
 * - `POST ?op=voice`, the recording as the body, with `x-voice-consent: yes`: their own voice, cloned at
 *   ElevenLabs from what they read aloud, for a day. Without that header nothing is sent anywhere.
 * - `POST ?op=meet`: their echo meets the host's now (C71's meeting, with no absence to wait for), once a
 *   visit has had time to teach the echo something.
 * - `POST ?op=erase`: their voice deleted at ElevenLabs, now; the page then erases everything else
 *   through `/api/account/delete`, which removes the visit last. A voice that would not go fails the
 *   erase, and the visit stays for the sweep.
 *
 * Every call also sweeps the voices past their day, and the visits past theirs.
 */
import { NextResponse } from "next/server";

import { DEMO, demoConfig, demoMeeting, demoPair, forgetDemoVoice, meetAfterMs, sweepDemoVisits, sweepDemoVoices } from "@/lib/demo";
import { cleanName, shownMeeting } from "@/lib/echoMeeting";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";
import { addVoice, removeVoice } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const off = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(req: Request) {
  const cfg = demoConfig();
  if (!cfg) return off();
  const store = villageStore();
  const caller = subjectOf(req);
  const visit = caller.ok && store ? await store.demoVisitOf(caller.subject) : null;
  return NextResponse.json({
    on: true,
    host: cfg.hostName,
    cell: cfg.cell,
    visitMs: DEMO.visitMs,
    meetAfterMs: meetAfterMs(),
    visit: visit ? { startedAt: visit.startedAt, name: visit.name, voice: !!visit.voiceId && !visit.voiceDeletedAt, voiceUntil: visit.voiceUntil } : null,
  });
}

export async function POST(req: Request) {
  const cfg = demoConfig();
  if (!cfg) return off();
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const op = new URL(req.url).searchParams.get("op");
  const rate = await rateLimit(
    req,
    op === "voice" ? { bucket: "voice", windowMs: 10 * 60 * 1000, max: 6, onUnavailable: "allow" } : { bucket: "demo", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" },
  );
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const now = Date.now();
  const me = caller.subject;
  await sweepDemoVoices(store, now);
  await sweepDemoVisits(store, now);

  if (op === "start") {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanName(body.name) ?? "Guest";
    if (me === cfg.host) return bad("you_are_the_host", 409);
    const was = await store.demoVisitOf(me);
    if (was === undefined) return bad("unreadable", 503);
    const visit = was && now - Date.parse(was.startedAt) < DEMO.liveMs ? was : { subject: me, host: cfg.host, name, startedAt: new Date(now).toISOString(), voiceId: null, voiceUntil: null, voiceDeletedAt: null };
    if (visit !== was && !(await store.saveDemoVisit(visit))) return bad("not_recorded", 503);
    if (!(await demoPair(store, cfg, visit, now))) return bad("not_paired", 503);
    return NextResponse.json({ startedAt: visit.startedAt, host: cfg.hostName, cell: cfg.cell });
  }

  const visit = await store.demoVisitOf(me);
  if (visit === undefined) return bad("unreadable", 503);

  if (op === "erase") {
    // Their voice, now, whatever else happens. Everything else goes through the one erasure there is
    // (`/api/account/delete`, which the page calls next): it removes the visit last, and only once all
    // the rest has gone, so a half-finished erasure stays marked for the sweep to finish.
    if (visit && !(await forgetDemoVoice(store, me, now))) return bad("voice_not_deleted", 502);
    return NextResponse.json({ ok: true });
  }

  if (!visit || now - Date.parse(visit.startedAt) >= DEMO.liveMs) return bad("no_visit", 404);

  if (op === "voice") {
    // Nothing is sent to ElevenLabs without a yes to exactly this, given on the page just now.
    if (req.headers.get("x-voice-consent") !== "yes") return bad("no_consent", 403);
    const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!/^audio\/[a-z0-9.+-]+$/.test(type)) return bad("bad_audio");
    const audio = await req.arrayBuffer();
    if (audio.byteLength < DEMO.audioMinBytes) return bad("too_short");
    if (audio.byteLength > DEMO.audioMaxBytes) return bad("too_long", 413);
    if (!process.env.ELEVENLABS_API_KEY) return bad("no_voice_service", 503);
    // A second recording replaces the first, which is deleted before the new one exists.
    if (visit.voiceId && !visit.voiceDeletedAt && !(await removeVoice(visit.voiceId))) return bad("voice_not_deleted", 502);
    const until = new Date(now + DEMO.voiceMs).toISOString();
    const id = await addVoice(`echo visitor ${me.slice(0, 8)}`, audio, type, `Echo demo (C72): one visitor's own voice, used only for their own echo, deleted by ${until}.`);
    if (!id) {
      await store.saveDemoVisit({ ...visit, voiceId: null, voiceUntil: null, voiceDeletedAt: visit.voiceId ? new Date(now).toISOString() : visit.voiceDeletedAt });
      return bad("not_cloned", 502);
    }
    if (!(await store.saveDemoVisit({ ...visit, voiceId: id, voiceUntil: until, voiceDeletedAt: null }))) {
      // Not recorded means not findable by the sweep: it must not outlive this request.
      await removeVoice(id);
      return bad("not_recorded", 503);
    }
    return NextResponse.json({ ok: true, until });
  }

  if (op === "meet") {
    const since = now - Date.parse(visit.startedAt);
    if (since < meetAfterMs()) return NextResponse.json({ error: "too_soon", inMs: meetAfterMs() - since }, { status: 409 });
    const m = await demoMeeting(store, cfg, visit, now);
    if (!m) {
      const making = ((await store.meetingsOf(me, 20)) ?? []).some((x) => x.status === "making" && x.madeAt >= visit.startedAt);
      return making ? NextResponse.json({ making: true }, { status: 202 }) : bad("no_engine", 503);
    }
    if (m.status !== "made") return bad(m.reason ?? "not_made", 503);
    return NextResponse.json({ meeting: shownMeeting(m, me) });
  }

  return bad("bad_op");
}
