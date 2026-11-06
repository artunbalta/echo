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
 * - `GET ?op=reveal`: who knew the caller best (C80), once their last visit is over, and only while the
 *   owner has switched it on (`ECHO_PILOT_REVEAL=1`). It holds their own words, their friends' median
 *   guess (two or more friends), their echo's guess, and what they did.
 *
 * Circles (C83, `lib/pilotCircles.ts`), while `ECHO_CIRCLES=1`:
 * - `POST ?op=circle` `{ visits? }`: a new circle and its code, for its starter to give their friends.
 * - `GET ?op=code&code=…`: whether a code opens the study, a circle, or nothing, and how many visits.
 * - Joining takes a circle's code as it takes the study's, with an optional yes to research of its own.
 * - Everything else stays inside the caller's circle: the group, ratings, the debrief's crowd. A circle's
 *   debrief needs no switch, since a circle is not the study; the export is the study's alone.
 */
import { NextResponse } from "next/server";
import { PILOT, PILOT_SITUATIONS, type Pack, type Staging } from "@echo/planet";

import { readAllOf } from "@/lib/behavioral-store";
import { getPersona } from "@/lib/ml";
import {
  canStart,
  cleanNickname,
  codeMatches,
  inStudy,
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
import { STUDY, codeHash, newCircleCode, newCircleId, normalCode, type PilotCircle } from "@/lib/pilotCircles";
import { choices, reveal } from "@/lib/pilotReveal";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore, type VillageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const off = () => NextResponse.json({ error: "not_found" }, { status: 404 });

type Config = NonNullable<ReturnType<typeof pilotConfig>>;

/** How many visits a person's circle plays: the study's setting, or their circle's. Null: unreadable. */
async function visitsOf(store: VillageStore, person: PilotPerson, cfg: Config): Promise<number | null> {
  if (inStudy(person)) return cfg.visits;
  const circle = await store.pilotCircle({ id: person.circle });
  return circle === undefined ? null : (circle?.visits ?? 3);
}

/** What a typed code opens: the study, a circle, or nothing. Undefined: unreadable. */
async function opens(store: VillageStore, typed: unknown, cfg: Config): Promise<{ circle: string; visits: number } | null | undefined> {
  if (codeMatches(typed, cfg.code)) return { circle: STUDY, visits: cfg.visits };
  if (!cfg.circles || !normalCode(typed)) return null;
  const circle = await store.pilotCircle({ codeHash: codeHash(typed as string) });
  return circle === undefined ? undefined : circle ? { circle: circle.id, visits: circle.visits } : null;
}

export async function GET(req: Request) {
  const cfg = pilotConfig();
  if (!cfg) return off();
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const op = new URL(req.url).searchParams.get("op");
  if (op === "export") return exportAll(req, cfg.cell, cfg.visits);
  if (op === "reveal") return revealFor(req, cfg);
  if (op === "code") return codeCheck(req, cfg);

  const caller = subjectOf(req);
  const base = { on: true, cell: cfg.cell, sessionMs: PILOT.sessionMs, sessions: cfg.visits, circles: cfg.circles, study: Boolean(cfg.code) };
  if (!caller.ok) return NextResponse.json({ ...base, me: null, group: [] });
  const now = Date.now();
  let person = await store.pilotPersonOf(caller.subject);
  if (person === undefined) return bad("unreadable", 503);
  if (!person) return NextResponse.json({ ...base, me: null, group: [] });

  let notices: PilotNotice[] = [];
  let pack: Pack | null = null;
  const settled = await settlePilot(store, person, now);
  if (settled) ({ person, notices, pack } = settled);

  const [people, ratings, visits] = await Promise.all([store.pilotPeople(person.circle), store.pilotRatings(person.circle), visitsOf(store, person, cfg)]);
  if (!people || !ratings || visits === null) return bad("unreadable", 503);
  const mine = new Set(ratings.filter((r) => r.rater === person!.subject).map((r) => r.ratee));
  return NextResponse.json({
    ...base,
    sessions: visits,
    me: { nickname: person.nickname, inStudy: inStudy(person), sessions: person.sessions, open: openSession(person, now), start: canStart(person, now, visits) },
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

  if (op === "circle") {
    if (!cfg.circles) return off();
    const daily = await rateLimit(req, { bucket: "pilot-circle", windowMs: 24 * 60 * 60 * 1000, max: 5, onUnavailable: "allow" });
    if (!daily.ok) {
      const { body: error, status } = rateLimitRejection(daily);
      return NextResponse.json(error, { status });
    }
    const visits = body.visits === 2 ? 2 : 3;
    // A code is drawn from 31^8; a clash is next to impossible, and a second draw settles it.
    for (let i = 0; i < 3; i++) {
      const code = newCircleCode();
      const circle: PilotCircle = { id: newCircleId(), codeHash: codeHash(code), createdBy: me, createdAt: new Date(now).toISOString(), visits, research: false };
      if (await store.savePilotCircle(circle)) return NextResponse.json({ code, visits });
    }
    return bad("not_recorded", 503);
  }

  if (op === "join") {
    if (person) return bad("already_joined", 409);
    if (body.consent !== true) return bad("no_consent", 403);
    const opened = await opens(store, body.code, cfg);
    if (opened === undefined) return bad("unreadable", 503);
    if (!opened) return bad("wrong_code", 403);
    const nickname = cleanNickname(body.nickname);
    const self = validAxes(body.self);
    const stated = validStated(body.stated);
    if (!nickname) return bad("bad_nickname");
    if (!self) return bad("bad_self");
    if (!stated) return bad("bad_stated");
    const people = await store.pilotPeople(opened.circle);
    if (!people) return bad("unreadable", 503);
    if (people.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) return bad("name_taken", 409);
    const at = new Date(now).toISOString();
    // In the study the one yes is to the research. In a circle it is a yes to play, and research is a yes of its own.
    const researchAt = opened.circle === STUDY || body.research === true ? at : null;
    const joined: PilotPerson = { subject: me, circle: opened.circle, nickname, joinedAt: at, consentAt: at, researchAt, self, stated, sessions: [], settled: {} };
    if (!(await store.savePilotPerson(joined))) return bad("name_taken", 409);
    return NextResponse.json({ ok: true, nickname });
  }

  if (!person) return bad("not_joined", 404);

  if (op === "start") {
    const open = openSession(person, now);
    if (open) return NextResponse.json({ session: open, cell: cfg.cell });
    const visits = await visitsOf(store, person, cfg);
    if (visits === null) return bad("unreadable", 503);
    const may = canStart(person, now, visits);
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
    // Only someone in their own circle: a friend in another circle is no one here.
    const people = await store.pilotPeople(person.circle);
    if (!people) return bad("unreadable", 503);
    const ratee = people.find((p) => p.nickname.toLowerCase() === r.ratee.toLowerCase());
    if (!ratee) return bad("no_such_friend", 404);
    if (ratee.subject === me) return bad("not_yourself");
    const rating = { rater: me, ratee: ratee.subject, know: r.know, axes: r.axes, predicted: r.predicted, at: new Date(now).toISOString() };
    if (!(await store.savePilotRating(rating, person.circle))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true });
  }

  return bad("bad_op");
}

/**
 * The debrief (C80): only for someone whose visits are all over, so that nothing they see can change what
 * they do; in the study, only while the owner allows it; and friends' guesses only as a median of two or
 * more. A circle's debrief is always on (C83): a circle is not the study, and the debrief is why it plays.
 */
async function revealFor(req: Request, cfg: Config) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    if (process.env.ECHO_PILOT_REVEAL !== "1" && !cfg.circles) return off();
    const { body, status } = subjectRejection(caller);
    return NextResponse.json(body, { status });
  }
  const store = villageStore()!;
  const person = await store.pilotPersonOf(caller.subject);
  if (person === undefined) return bad("unreadable", 503);
  if (!person) return off();
  if (inStudy(person) && process.env.ECHO_PILOT_REVEAL !== "1") return off();
  const visits = await visitsOf(store, person, cfg);
  if (visits === null) return bad("unreadable", 503);
  const start = canStart(person, Date.now(), visits);
  if (start.ok || start.why !== "done") return NextResponse.json({ ready: false });
  const [people, ratings, mine] = await Promise.all([store.pilotPeople(person.circle), store.pilotRatings(person.circle), store.stagingsOf(person.subject)]);
  if (!people || !ratings || !mine) return bad("unreadable", 503);
  const others = await Promise.all(
    people
      .filter((p) => p.subject !== person.subject)
      .slice(0, 40)
      .map(async (p) => choices((await store.stagingsOf(p.subject)) ?? [], p.sessions)),
  );
  // A circle's debrief can be passed on as a card (C83); the study's cannot, so it cannot reach a friend still playing.
  return NextResponse.json({ ready: true, shareable: !inStudy(person), ...reveal(person, mine, ratings, others) });
}

/** Everything the pilot holds, for the owner's analysis: the people, the ratings, what was set out, every event, each echo now, and whether the debrief was on. */
async function exportAll(req: Request, cell: string, visits: number) {
  if (!pilotAdmin(req)) return bad("not_found", 404);
  const store = villageStore()!;
  // The study's alone (C83): nothing from a circle of friends is in the owner's export.
  const [people, ratings] = await Promise.all([store.pilotPeople(STUDY), store.pilotRatings(STUDY)]);
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
    // The analysis tells the ratings made once a rater's debrief was open from the rest (registration §2).
    visits,
    reveal: process.env.ECHO_PILOT_REVEAL === "1",
    people,
    ratings,
    byPerson: Object.fromEntries(each),
  });
}

/** What a code opens (C83), for the joining page to say which before anyone agrees to anything. */
async function codeCheck(req: Request, cfg: Config) {
  const rate = await rateLimit(req, { bucket: "pilot-code", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const opened = await opens(villageStore()!, new URL(req.url).searchParams.get("code"), cfg);
  if (opened === undefined) return bad("unreadable", 503);
  return NextResponse.json(opened ? { kind: opened.circle === STUDY ? "study" : "circle", visits: opened.visits } : { kind: null });
}
