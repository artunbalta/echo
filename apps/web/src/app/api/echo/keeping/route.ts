/**
 * What your echo did while it kept your body in a village room (DECISIONS C105).
 *
 * POST, from the room only: the record of one keeping (`AwayReport`), sent when it ends (its person back,
 * or its time up), with the room's signature over the exact body in `x-echo-room` (`@echo/shared/standin`
 * `signReport`, the identity secret both services hold). Kept only while the person's yes stands: after a
 * no, there is nothing of theirs to keep it with (409). One per keeping.
 *
 * GET, by the person: their last keepings, newest first, and which moments they have said were not them.
 *
 * PRIVATE. The room's signature, or your own signed subject: nobody else's record, either way.
 */
import { NextResponse } from "next/server";
import { ROOM, ROOM_VILLAGES, STAND_IN, TALK_KIND, normalizeRoomCode, type AwayEntry, type AwayReport, type StandInLevel } from "@echo/shared";
import { verifyReport } from "@echo/shared/standin";

import { known, outcomesOf } from "@/lib/knowable/calls";
import { identitySecrets, subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore, type AwayRecord } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS: readonly StandInLevel[] = ["act", "ask", "watch"];
/** A report is small: sixty moments of a few fields. */
const BODY_MAX = 32_000;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** One moment as the room logged it, or null where it could not have been. */
function readEntry(raw: unknown): AwayEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  // A line it said for them (C109): its own words only, as long as a line in the room can be.
  if (e.kind === TALK_KIND) {
    if (typeof e.at !== "number" || !Number.isFinite(e.at) || e.call !== "answer" || e.did !== "answer") return null;
    if (typeof e.said !== "string" || !e.said.trim() || e.said.length > ROOM.sayMaxChars) return null;
    if (typeof e.p !== "number" || !Number.isFinite(e.p) || e.p < 0 || e.p > 1 || !LEVELS.includes(e.may as StandInLevel)) return null;
    return { at: e.at, kind: TALK_KIND, call: "answer", p: e.p, may: e.may as StandInLevel, did: "answer", said: e.said };
  }
  if (typeof e.at !== "number" || !Number.isFinite(e.at) || typeof e.kind !== "string" || !known(e.kind)) return null;
  const ways = outcomesOf(e.kind);
  if (typeof e.call !== "string" || !ways.includes(e.call) || typeof e.did !== "string" || !ways.includes(e.did)) return null;
  if (typeof e.p !== "number" || !Number.isFinite(e.p) || e.p < 0 || e.p > 1 || !LEVELS.includes(e.may as StandInLevel)) return null;
  return { at: e.at, kind: e.kind, call: e.call, p: e.p, may: e.may as StandInLevel, did: e.did };
}

/** A report as it can be kept, or null. */
function readReport(raw: unknown): (AwayRecord & { sub: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof AwayReport, unknown>>;
  if (typeof r.sub !== "string" || !r.sub || typeof r.cell !== "string" || !ROOM_VILLAGES.includes(r.cell)) return null;
  const room = normalizeRoomCode(r.room);
  if (!room || room !== r.room) return null;
  if (typeof r.since !== "number" || typeof r.until !== "number" || !(r.until >= r.since) || r.until - r.since > STAND_IN.maxS * 1000 + 60_000) return null;
  if (!Array.isArray(r.log) || r.log.length > STAND_IN.logMax) return null;
  const log = r.log.map(readEntry);
  if (log.some((e) => e === null)) return null;
  return { sub: r.sub, cell: r.cell, room, since: r.since, until: r.until, log: log as AwayEntry[] };
}

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > BODY_MAX) return bad("too_large", 413);
  if (!verifyReport(body, req.headers.get("x-echo-room"), identitySecrets())) return bad("not_a_room", 401);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return bad("bad_request");
  }
  const report = readReport(raw);
  if (!report) return bad("bad_report");
  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const on = await store.standInOf(report.sub);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);
  const { sub, ...record } = report;
  if (!(await store.keepAway(sub, record))) return bad("store_unavailable", 503);
  return NextResponse.json({ kept: true });
}

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return NextResponse.json({ records: [], vetoes: [] });
  const [records, vetoes] = await Promise.all([store.awayOf(caller.subject, 5), store.vetoesOf(caller.subject)]);
  if (records === null || vetoes === null) return bad("store_unavailable", 503);
  return NextResponse.json({ records, vetoes }, { headers: { "cache-control": "no-store" } });
}
