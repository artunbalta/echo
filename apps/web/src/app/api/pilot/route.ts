/**
 * The pilot village (DECISIONS C75): `/api/pilot`. Every call answers 404 while the pilot is off
 * (`lib/pilot.ts` `pilotConfig`).
 *
 * - `GET`: that it is on, its village, and the caller as the pilot knows them. Their nickname, their
 *   visits, whether the next may begin (or when), and the group, to rate. What became of a raft they
 *   lent or a seed they planted is settled here, once, and said (`notices`).
 * - `POST ?op=join` `{ code, nickname, consent: true, self, stated }`: joining. A yes to the research,
 *   the group's code, a name the friends know, where they place themselves on the eight axes, and what
 *   they say they would do in each of the six. All of it before the first visit, never after.
 * - `POST ?op=start`: a visit begins (two, a day apart). The pack is topped up to three loaves and a raft.
 * - `POST ?op=end`: the visit is over.
 * - `POST ?op=rate` `{ ratee, know, axes, predicted }`: how they place a friend, by the friend's nickname,
 *   and what they think the friend would do in each of the six (C76).
 * - `GET ?op=export` with `x-pilot-admin`: everything, for the owner's analysis.
 */
import { NextResponse } from "next/server";
import { PILOT, PILOT_SITUATIONS, type Pack, type Staging } from "@echo/planet";

import { readAllOf } from "@/lib/behavioral-store";
import { getPersona } from "@/lib/ml";
import {
  canStart,
  cleanNickname,
  codeMatches,
  openSession,
  pilotAdmin,
  pilotConfig,
  settlePilot,
  toppedUp,
  validAxes,
  validRating,
  validStated,
  type PilotNotice,
  type PilotPerson,
} from "@/lib/pilot";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const off = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(req: Request) {
  const cfg = pilotConfig();
  if (!cfg) return off();
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  if (new URL(req.url).searchParams.get("op") === "export") return exportAll(req, cfg.cell);

  const caller = subjectOf(req);
  const base = { on: true, cell: cfg.cell, sessionMs: PILOT.sessionMs, sessions: PILOT.sessions };
  if (!caller.ok) return NextResponse.json({ ...base, me: null, group: [] });
  const now = Date.now();
  let person = await store.pilotPersonOf(caller.subject);
  if (person === undefined) return bad("unreadable", 503);
  if (!person) return NextResponse.json({ ...base, me: null, group: [] });

  let notices: PilotNotice[] = [];
  let pack: Pack | null = null;
  const settled = await settlePilot(store, person, now);
  if (settled) ({ person, notices, pack } = settled);

  const [people, ratings] = await Promise.all([store.pilotPeople(), store.pilotRatings()]);
  if (!people || !ratings) return bad("unreadable", 503);
  const mine = new Set(ratings.filter((r) => r.rater === person!.subject).map((r) => r.ratee));
  return NextResponse.json({
    ...base,
    me: { nickname: person.nickname, sessions: person.sessions, open: openSession(person, now), start: canStart(person, now) },
    group: people.filter((p) => p.subject !== person!.subject).map((p) => ({ nickname: p.nickname, rated: mine.has(p.subject) })),
    notices,
    ...(pack ? { pack } : {}),
  });
}

export async function POST(req: Request) {
  const cfg = pilotConfig();
  if (!cfg) return off();
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const rate = await rateLimit(req, { bucket: "pilot", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const op = new URL(req.url).searchParams.get("op");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = Date.now();
  const me = caller.subject;
  const person = await store.pilotPersonOf(me);
  if (person === undefined) return bad("unreadable", 503);

  if (op === "join") {
    if (person) return bad("already_joined", 409);
    if (body.consent !== true) return bad("no_consent", 403);
    if (!codeMatches(body.code, cfg.code)) return bad("wrong_code", 403);
    const nickname = cleanNickname(body.nickname);
    const self = validAxes(body.self);
    const stated = validStated(body.stated);
    if (!nickname) return bad("bad_nickname");
    if (!self) return bad("bad_self");
    if (!stated) return bad("bad_stated");
    const people = await store.pilotPeople();
    if (!people) return bad("unreadable", 503);
    if (people.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) return bad("name_taken", 409);
    const at = new Date(now).toISOString();
    const joined: PilotPerson = { subject: me, nickname, joinedAt: at, consentAt: at, self, stated, sessions: [], settled: {} };
    if (!(await store.savePilotPerson(joined))) return bad("name_taken", 409);
    return NextResponse.json({ ok: true, nickname });
  }

  if (!person) return bad("not_joined", 404);

  if (op === "start") {
    const open = openSession(person, now);
    if (open) return NextResponse.json({ session: open, cell: cfg.cell });
    const may = canStart(person, now);
    if (!may.ok) return NextResponse.json({ error: may.why, at: may.at ?? null }, { status: 409 });
    const held = await store.packOf(me);
    if (held === null) return bad("unreadable", 503);
    // Every visit starts the same: three loaves, a raft.
    const pack = toppedUp(held);
    if (!(await store.setPack(me, pack))) return bad("not_recorded", 503);
    const session = { n: may.n, startedAt: new Date(now).toISOString(), endedAt: null };
    if (!(await store.savePilotPerson({ ...person, sessions: [...person.sessions, session] }))) return bad("not_recorded", 503);
    return NextResponse.json({ session, cell: cfg.cell, pack });
  }

  if (op === "end") {
    const open = openSession(person, now);
    if (!open) return NextResponse.json({ ok: true });
    const sessions = person.sessions.map((s) => (s.n === open.n ? { ...s, endedAt: new Date(now).toISOString() } : s));
    if (!(await store.savePilotPerson({ ...person, sessions }))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true });
  }

  if (op === "rate") {
    const r = validRating(body);
    if (!r) return bad("bad_rating");
    const people = await store.pilotPeople();
    if (!people) return bad("unreadable", 503);
    const ratee = people.find((p) => p.nickname.toLowerCase() === r.ratee.toLowerCase());
    if (!ratee) return bad("no_such_friend", 404);
    if (ratee.subject === me) return bad("not_yourself");
    if (!(await store.savePilotRating({ rater: me, ratee: ratee.subject, know: r.know, axes: r.axes, predicted: r.predicted, at: new Date(now).toISOString() }))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true });
  }

  return bad("bad_op");
}

/** Everything the pilot holds, for the owner's analysis: the people, the ratings, what was set out, every event, and each echo now. */
async function exportAll(req: Request, cell: string) {
  if (!pilotAdmin(req)) return bad("not_found", 404);
  const store = villageStore()!;
  const [people, ratings] = await Promise.all([store.pilotPeople(), store.pilotRatings()]);
  if (!people || !ratings) return bad("unreadable", 503);
  const pilotOnly = (list: Staging[] | null) => (list ?? []).filter((s) => (PILOT_SITUATIONS as readonly string[]).includes(s.situation));
  const each = await Promise.all(
    people.map(async (p) => {
      const [stagings, events, echo] = await Promise.all([store.stagingsOf(p.subject), readAllOf(p.subject), getPersona(p.subject)]);
      return [p.subject, { stagings: pilotOnly(stagings), events, echo }] as const;
    }),
  );
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    cell,
    pilot: PILOT,
    people,
    ratings,
    byPerson: Object.fromEntries(each),
  });
}
