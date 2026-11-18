/**
 * Settled calls kept for an echo that stands in for its person (DECISIONS C103).
 *
 * POST `{ rows }`: envelopes the browser has settled, as `{ seal, cell, kind, arm, call, p, did, at }`.
 * Taken only while the person has said yes (`/api/echo/standin`); refused with 409 otherwise, so nothing
 * is kept before a yes or after a no. Answers `{ taken, refused }` by seal, as the count does (C91): a row
 * refused is not offered again, and a seal already kept is not kept twice.
 *
 * WHAT IS CHECKED is that a row could have been: a moment the village has, a call and an outcome that are
 * ways it can end, a confidence between nought and one, a hash of the chain's spelling. What is not, and
 * cannot be from here, is that the person did not write their own record: the chain is theirs, so a
 * record made up would give their own echo a right over their own body, in their own room, and nothing
 * more (see C103).
 *
 * PRIVATE. Signed subject: only your own record.
 */
import { NextResponse } from "next/server";

import { known, outcomesOf } from "@/lib/knowable/calls";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore, type KeptLook } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const SEAL = /^[0-9a-f]{64}$/;
const ARM = /^[a-z0-9-]{1,40}$/;
/** Rows in one request: the browser sends what has settled since it last sent, a few at a time. */
const ROWS_MAX = 200;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** A row as it can be kept, or null when it could not have been. */
function readRow(raw: unknown): KeptLook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.seal !== "string" || !SEAL.test(r.seal)) return null;
  if (typeof r.cell !== "string" || !CELL.test(r.cell)) return null;
  if (typeof r.kind !== "string" || !known(r.kind)) return null;
  const ways = outcomesOf(r.kind);
  if (typeof r.call !== "string" || !ways.includes(r.call)) return null;
  if (typeof r.did !== "string" || !ways.includes(r.did)) return null;
  if (typeof r.p !== "number" || !Number.isFinite(r.p) || r.p < 0 || r.p > 1) return null;
  const arm = r.arm === null || r.arm === undefined ? null : typeof r.arm === "string" && ARM.test(r.arm) ? r.arm : undefined;
  if (arm === undefined) return null;
  const at = typeof r.at === "string" ? Date.parse(r.at) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  return { seal: r.seal, cell: r.cell, kind: r.kind, arm, call: r.call, p: r.p, did: r.did, sealedAt: new Date(at).toISOString() };
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  if (!Array.isArray(body.rows) || body.rows.length > ROWS_MAX) return bad("bad_rows");
  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const on = await store.standInOf(caller.subject);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);

  const rows: KeptLook[] = [];
  const refused: string[] = [];
  for (const raw of body.rows) {
    const row = readRow(raw);
    if (row) rows.push(row);
    else if (raw && typeof (raw as { seal?: unknown }).seal === "string") refused.push((raw as { seal: string }).seal.slice(0, 64));
  }
  const taken = await store.keepLooks(caller.subject, rows);
  if (taken === null) return bad("store_unavailable", 503);
  return NextResponse.json({ taken, refused });
}
