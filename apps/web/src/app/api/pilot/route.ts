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
 *
 * The owner's groups (C85), while `ECHO_GROUPS=1`, all with `x-pilot-admin`:
 * - `GET ?op=groups`: every group, its link's code, who is in it and who is waiting to be let in.
 * - `POST ?op=group` `{ name, visits? }`: a new group and its code.
 * - `POST ?op=approve` `{ subject }` lets someone waiting in; `POST ?op=decline` `{ subject }` says no,
 *   and their request is gone (they may ask again).
 * - A group's code opens it as a circle's does, and says its name. Whoever joins waits for the owner's
 *   yes: until then they cannot begin a visit, rate anyone, or be seen by the group. A group is part of
 *   the study: one yes is to the research, its debrief is the owner's switch, and it is in the export.
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
import { STUDY, cleanGroupName, codeHash, newCircleCode, newCircleId, normalCode, type PilotCircle } from "@/lib/pilotCircles";
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

/**
 * Where a person plays: how many visits their circle has, whether it is the owner's study (the study
 * itself, or one of the owner's groups, C85), and the group's name. Null: unreadable.
 */
async function placeOf(store: VillageStore, person: PilotPerson, cfg: Config): Promise<{ visits: number; study: boolean; name: string | null } | null> {
  if (inStudy(person)) return { visits: cfg.visits, study: true, name: null };
  const circle = await store.pilotCircle({ id: person.circle });
  if (circle === undefined) return null;
  return { visits: circle?.visits ?? 3, study: circle?.owner ?? false, name: circle?.name ?? null };
}

interface Opened {
  circle: string;
  visits: number;
  kind: "study" | "circle" | "group";
  name: string | null;
  approval: boolean;
}

/** What a typed code opens: the study, a circle, one of the owner's groups, or nothing. Undefined: unreadable. */
async function opens(store: VillageStore, typed: unknown, cfg: Config): Promise<Opened | null | undefined> {
  if (codeMatches(typed, cfg.code)) return { circle: STUDY, visits: cfg.visits, kind: "study", name: null, approval: false };
  if ((!cfg.circles && !cfg.groups) || !normalCode(typed)) return null;
  const circle = await store.pilotCircle({ codeHash: codeHash(typed as string) });
  if (circle === undefined) return undefined;
  // A circle's code opens it only with circles on, and a group's only with groups on.
  if (!circle || (circle.owner ? !cfg.groups : !cfg.circles)) return null;
  return { circle: circle.id, visits: circle.visits, kind: circle.owner ? "group" : "circle", name: circle.name, approval: circle.approval };
}

export async function GET(req: Request) {
  const cfg = pilotConfig();
  if (!cfg) return off();
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const op = new URL(req.url).searchParams.get("op");
  if (op === "export") return exportAll(req, cfg);
  if (op === "reveal") return revealFor(req, cfg);
  if (op === "code") return codeCheck(req, cfg);
  if (op === "groups") return groupsFor(req, cfg);

  const caller = subjectOf(req);
  const base = { on: true, cell: cfg.cell, sessionMs: PILOT.sessionMs, sessions: cfg.visits, circles: cfg.circles, groups: cfg.groups, study: Boolean(cfg.code) };
  if (!caller.ok) return NextResponse.json({ ...base, me: null, group: [] });
  const now = Date.now();
  let person = await store.pilotPersonOf(caller.subject);
  if (person === undefined) return bad("unreadable", 503);
  if (!person) return NextResponse.json({ ...base, me: null, group: [] });

  let notices: PilotNotice[] = [];
  let pack: Pack | null = null;
  const settled = await settlePilot(store, person, now);
  if (settled) ({ person, notices, pack } = settled);

  const [people, ratings, place] = await Promise.all([store.pilotPeople(person.circle), store.pilotRatings(person.circle), placeOf(store, person, cfg)]);
  if (!people || !ratings || place === null) return bad("unreadable", 503);
  const mine = new Set(ratings.filter((r) => r.rater === person!.subject).map((r) => r.ratee));
  const waiting = person.waitingSince !== null;
  return NextResponse.json({
    ...base,
    sessions: place.visits,
    me: {
      nickname: person.nickname,
      inStudy: place.study,
      groupName: place.name,
      waiting,
      sessions: person.sessions,
      open: openSession(person, now),
      start: waiting ? { ok: false, why: "waiting" } : canStart(person, now, place.visits),
    },
    // Whoever is still waiting for the owner's yes is not in the group yet, and sees nobody in it (C85).
    group: waiting ? [] : people.filter((p) => p.subject !== person!.subject && p.waitingSince === null).map((p) => ({ nickname: p.nickname, rated: mine.has(p.subject) })),
    notices,
    ...(pack ? { pack } : {}),
  });
}

export async function POST(req: Request) {
  const cfg = pilotConfig();
  if (!cfg) return off();
  const asked = new URL(req.url).searchParams.get("op");
  // The owner's page (C85) speaks with the admin token, not as a player.
  if (asked === "group" || asked === "approve" || asked === "decline") return ownerPost(req, asked, cfg);
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
      const circle: PilotCircle = { id: newCircleId(), codeHash: codeHash(code), createdBy: me, createdAt: new Date(now).toISOString(), visits, research: false, name: null, code: null, owner: false, approval: false };
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
    // In the study and the owner's groups the one yes is to the research. In a circle it is a yes to play,
    // and research is a yes of its own.
    const researchAt = opened.kind !== "circle" || body.research === true ? at : null;
    // A group that needs the owner's yes (C85): in, but waiting for it.
    const waitingSince = opened.approval ? at : null;
    const joined: PilotPerson = { subject: me, circle: opened.circle, nickname, joinedAt: at, consentAt: at, researchAt, waitingSince, self, stated, sessions: [], settled: {} };
    if (!(await store.savePilotPerson(joined))) return bad("name_taken", 409);
    return NextResponse.json({ ok: true, nickname, waiting: waitingSince !== null });
  }

  if (!person) return bad("not_joined", 404);
  // Waiting for the owner's yes (C85): nothing to do yet but wait.
  if (person.waitingSince !== null && op !== "end") return NextResponse.json({ error: "waiting" }, { status: 409 });

  if (op === "start") {
    const open = openSession(person, now);
    if (open) return NextResponse.json({ session: open, cell: cfg.cell });
    const place = await placeOf(store, person, cfg);
    if (place === null) return bad("unreadable", 503);
    const may = canStart(person, now, place.visits);
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
    const ratee = people.find((p) => p.waitingSince === null && p.nickname.toLowerCase() === r.ratee.toLowerCase());
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
  if (!person || person.waitingSince !== null) return off();
  const place = await placeOf(store, person, cfg);
  if (place === null) return bad("unreadable", 503);
  // The study's debrief, and its groups' (C85), are the owner's switch.
  if (place.study && process.env.ECHO_PILOT_REVEAL !== "1") return off();
  const start = canStart(person, Date.now(), place.visits);
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
  return NextResponse.json({ ready: true, shareable: !place.study, ...reveal(person, mine, ratings, others) });
}

/**
 * Everything the pilot holds, for the owner's analysis: the people, the ratings, what was set out, every
 * event, each echo now, and whether the debrief was on. The study's and its groups' (C85), never a
 * circle's (C83), and nobody still waiting to be let in.
 */
async function exportAll(req: Request, cfg: Config) {
  if (!pilotAdmin(req)) return bad("not_found", 404);
  const store = villageStore()!;
  const groups = cfg.groups ? await store.pilotGroups() : [];
  if (!groups) return bad("unreadable", 503);
  const lists = await Promise.all([STUDY, ...groups.map((g) => g.id)].map((c) => Promise.all([store.pilotPeople(c), store.pilotRatings(c)])));
  if (lists.some(([p, r]) => !p || !r)) return bad("unreadable", 503);
  const people = lists.flatMap(([p]) => p!).filter((p) => p.waitingSince === null);
  const ratings = lists.flatMap(([, r]) => r!);
  const pilotOnly = (list: Staging[] | null) => (list ?? []).filter((s) => (PILOT_SITUATIONS as readonly string[]).includes(s.situation));
  const each = await Promise.all(
    people.map(async (p) => {
      const [stagings, events, echo] = await Promise.all([store.stagingsOf(p.subject), readAllOf(p.subject), getPersona(p.subject)]);
      return [p.subject, { stagings: pilotOnly(stagings), events, echo }] as const;
    }),
  );
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    cell: cfg.cell,
    pilot: PILOT,
    // The analysis tells the ratings made once a rater's debrief was open from the rest (registration §2).
    visits: cfg.visits,
    reveal: process.env.ECHO_PILOT_REVEAL === "1",
    // Each person's `circle` is "study" or one of these: a group's friends rate only each other.
    groups: groups.map((g) => ({ id: g.id, name: g.name, visits: g.visits })),
    people,
    ratings,
    byPerson: Object.fromEntries(each),
  });
}

/** The owner's page (C85): every group, its code, who is in it and who is waiting. */
async function groupsFor(req: Request, cfg: Config) {
  if (!cfg.groups || !pilotAdmin(req)) return off();
  const store = villageStore()!;
  const groups = await store.pilotGroups();
  if (!groups) return bad("unreadable", 503);
  const people = await Promise.all(groups.map((g) => store.pilotPeople(g.id)));
  if (people.some((p) => !p)) return bad("unreadable", 503);
  return NextResponse.json({
    cell: cfg.cell,
    groups: groups.map((g, i) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      visits: g.visits,
      createdAt: g.createdAt,
      waiting: people[i]!.filter((p) => p.waitingSince !== null).map((p) => ({ subject: p.subject, nickname: p.nickname, since: p.waitingSince })),
      members: people[i]!.filter((p) => p.waitingSince === null).map((p) => ({ nickname: p.nickname, joinedAt: p.joinedAt, visits: p.sessions.length })),
    })),
  });
}

/** The owner's page (C85): a new group, and a yes or a no to someone waiting. */
async function ownerPost(req: Request, op: "group" | "approve" | "decline", cfg: Config) {
  if (!cfg.groups || !pilotAdmin(req)) return off();
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (op === "group") {
    const name = cleanGroupName(body.name);
    if (!name) return bad("bad_name");
    const visits = body.visits === 2 || body.visits === 3 ? body.visits : cfg.visits === 3 ? 3 : 2;
    for (let i = 0; i < 3; i++) {
      const code = newCircleCode();
      const group: PilotCircle = {
        id: newCircleId(),
        codeHash: codeHash(code),
        createdBy: null,
        createdAt: new Date().toISOString(),
        visits,
        research: true,
        name,
        code,
        owner: true,
        approval: true,
      };
      if (await store.savePilotCircle(group)) return NextResponse.json({ id: group.id, name, code, visits });
    }
    return bad("not_recorded", 503);
  }
  const subject = typeof body.subject === "string" ? body.subject : "";
  const person = subject ? await store.pilotPersonOf(subject) : null;
  if (person === undefined) return bad("unreadable", 503);
  if (!person || person.waitingSince === null) return bad("not_waiting", 404);
  const done = op === "approve" ? await store.savePilotPerson({ ...person, waitingSince: null }) : await store.dropPilotPerson(subject);
  return done ? NextResponse.json({ ok: true }) : bad("not_recorded", 503);
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
  return NextResponse.json(opened ? { kind: opened.kind, visits: opened.visits, ...(opened.name ? { name: opened.name } : {}) } : { kind: null });
}
