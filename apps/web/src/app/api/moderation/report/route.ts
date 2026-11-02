/**
 * A stranger's report that something is wrong here (DECISIONS C67): `POST /api/moderation/report`
 * `{ cell, reason, note? }`.
 *
 * Anyone may report, consent or none: reporting is not being watched. The reporter is their signed
 * identity when they have one, and nothing otherwise. With the report the server keeps a snapshot of
 * who left what in the cell over the last `MODERATION.snapshotDays` world days (life changes, marks,
 * deeds, by subject), the reporter left out, so a moderator sees what was there when it was reported
 * and not after. The reporter is never told who that was.
 */
import { NextResponse } from "next/server";
import { worldClock, worldDayIndex, WORLD_EPOCH } from "@echo/planet";

import { MODERATION } from "@/lib/moderation";
import type { ReportReason } from "@/lib/moderationTypes";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const REASONS: readonly ReportReason[] = ["ruining", "offensive", "other"];
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  let body: { cell?: unknown; reason?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const cell = typeof body.cell === "string" && CELL.test(body.cell) ? body.cell : null;
  if (!cell) return bad("bad_cell");
  const reason = REASONS.find((r) => r === body.reason);
  if (!reason) return bad("bad_reason");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MODERATION.noteChars) : "";
  const rate = await rateLimit(req, { bucket: "report", windowMs: 60 * 60 * 1000, max: 6, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const caller = subjectOf(req);
  const reporter = caller.ok ? caller.subject : null;
  const now = Date.now();
  const day = worldDayIndex(worldClock(WORLD_EPOCH), now);
  const traces = (await store.tracesIn(cell, day - MODERATION.snapshotDays)) ?? [];
  const report = await store.addReport({
    reporter,
    cell,
    reason,
    note: note || null,
    day,
    madeAt: new Date(now).toISOString(),
    snapshot: traces.filter((t) => t.subject !== reporter),
    resolvedAt: null,
    resolvedBy: null,
    outcome: null,
  });
  if (!report) return bad("not_recorded", 503);
  return NextResponse.json({ ok: true });
}
