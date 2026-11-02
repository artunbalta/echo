/**
 * The moderators' side (DECISIONS C67). Only for the subjects in `ECHO_MODERATORS`.
 *
 * - `GET /api/moderation`: the latest reports, open first, and the latest actions taken.
 * - `GET /api/moderation?subject=`: everything that stranger has left in the shared world, whether
 *   they are barred, and what an undo would do now (`undoPlan`), before anyone does it.
 * - `POST /api/moderation`:
 *   - `{ op: "undo", subject, report?, removeHome? }`: undo their traces (`lib/moderation.ts`);
 *   - `{ op: "bar", subject, days?, reason, report? }`: bar them from changing the shared world;
 *   - `{ op: "lift", subject }`: lift a bar;
 *   - `{ op: "dismiss", report, outcome? }`: close a report with nothing done.
 *
 *   Every one is logged, with the moderator, and closes the report it was taken on.
 */
import { NextResponse } from "next/server";
import { worldClock, worldDayIndex, WORLD_EPOCH, type Occupation } from "@echo/planet";

import { MODERATION, applyUndo, forgetBars, isModerator, occupationOf, undoPlan } from "@/lib/moderation";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage } from "@/lib/villageTalk";
import { MODERATION_SUBJECT, villageStore, type VillageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const SUBJECT = /^[A-Za-z0-9-]{8,80}$/;

async function moderator(req: Request): Promise<{ who: string; store: VillageStore } | NextResponse> {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  if (!isModerator(caller.subject)) return bad("not_a_moderator", 403);
  const rate = await rateLimit(req, { bucket: "moderation", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  return { who: caller.subject, store };
}

/** What someone did the day before a trade, from their village. */
async function before(): Promise<(cell: string, person: string, day: number) => Promise<Occupation | null>> {
  const villages = new Map<string, Awaited<ReturnType<typeof loadVillage>>>();
  return async (cell, person, day) => {
    if (!villages.has(cell)) villages.set(cell, await loadVillage(cell));
    const v = villages.get(cell);
    return v ? occupationOf(v.village.settlement.people, person, day) : null;
  };
}

async function planFor(store: VillageStore, subject: string, today: number, removeHome: boolean) {
  const traces = await store.tracesOf(subject);
  if (!traces) return null;
  const occ = await before();
  // Read every "before" first, then plan, so the plan itself stays pure.
  const known = new Map<string, Occupation | null>();
  for (const { cell, change } of traces.changes) if (change.kind === "trade") known.set(`${cell}|${change.person}|${change.day - 1}`, await occ(cell, change.person, change.day - 1));
  const plan = undoPlan(traces, today, (cell, person, day) => known.get(`${cell}|${person}|${day}`) ?? null, { removeHome });
  return { traces, plan };
}

export async function GET(req: Request) {
  const m = await moderator(req);
  if (m instanceof NextResponse) return m;
  const subject = new URL(req.url).searchParams.get("subject");
  if (subject !== null) {
    if (!SUBJECT.test(subject)) return bad("bad_subject");
    const today = worldDayIndex(worldClock(WORLD_EPOCH), Date.now());
    const found = await planFor(m.store, subject, today, false);
    if (!found) return bad("unreadable", 503);
    return NextResponse.json({ subject, ...found, bar: (await m.store.barOf(subject)) ?? null, today });
  }
  const [reports, log] = await Promise.all([m.store.reports(100), m.store.moderationLog(50)]);
  if (!reports || !log) return bad("unreadable", 503);
  return NextResponse.json({ reports: [...reports.filter((r) => !r.resolvedAt), ...reports.filter((r) => r.resolvedAt)], log });
}

export async function POST(req: Request) {
  const m = await moderator(req);
  if (m instanceof NextResponse) return m;
  let body: { op?: unknown; subject?: unknown; report?: unknown; removeHome?: unknown; days?: unknown; reason?: unknown; outcome?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const now = Date.now();
  const at = new Date(now).toISOString();
  const today = worldDayIndex(worldClock(WORLD_EPOCH), now);
  const report = typeof body.report === "string" ? body.report : null;
  const subject = typeof body.subject === "string" && SUBJECT.test(body.subject) ? body.subject : null;
  const close = async (outcome: string) => (report ? m.store.resolveReport(report, m.who, outcome, at) : true);

  if (body.op === "dismiss") {
    if (!report) return bad("bad_report");
    const outcome = typeof body.outcome === "string" ? body.outcome.slice(0, 200) : "nothing done";
    await close(outcome);
    await m.store.logModeration({ moderator: m.who, subject: null, action: "dismiss", report, detail: { outcome }, at });
    return NextResponse.json({ ok: true });
  }
  if (!subject) return bad("bad_subject");
  if (subject === m.who) return bad("not_yourself", 409);

  if (body.op === "undo") {
    const found = await planFor(m.store, subject, today, body.removeHome === true);
    if (!found) return bad("unreadable", 503);
    const done = await applyUndo(m.store, subject, found.plan, today, MODERATION_SUBJECT);
    await close("traces undone");
    await m.store.logModeration({ moderator: m.who, subject, action: "undo", report, detail: done, at });
    return NextResponse.json({ ok: true, done });
  }
  if (body.op === "bar") {
    const days = typeof body.days === "number" && body.days > 0 && body.days <= 3650 ? body.days : MODERATION.barDays;
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "unstated";
    const until = new Date(now + days * 86_400_000).toISOString();
    if (!(await m.store.bar({ subject, until, reason, by: m.who, at }))) return bad("not_recorded", 503);
    forgetBars(subject);
    await close(`barred for ${days} days`);
    await m.store.logModeration({ moderator: m.who, subject, action: "bar", report, detail: { days, reason, until }, at });
    return NextResponse.json({ ok: true, until });
  }
  if (body.op === "lift") {
    if (!(await m.store.lift(subject))) return bad("not_recorded", 503);
    forgetBars(subject);
    await m.store.logModeration({ moderator: m.who, subject, action: "lift", report: null, detail: {}, at });
    return NextResponse.json({ ok: true });
  }
  return bad("bad_op");
}
