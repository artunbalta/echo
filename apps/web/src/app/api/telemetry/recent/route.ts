/**
 * The read side of the record (plan W5-0): the last n events for one actor, newest first, for the
 * inspector and for anyone checking that what the world sent is what the table holds. Reads the
 * table when Supabase is keyed and the per-instance ring otherwise; `source` says which, so a ring
 * read is never mistaken for durable history.
 *
 * Keyed by uid with no auth, exactly as GET /api/agent/persona?uid= is today: the id is the only
 * credential either read has. That is the repo's current posture, not this route's invention, and
 * it is the same posture the erasure route takes. Tighten all three together when auth lands.
 */
import { NextResponse } from "next/server";
import { readRecent } from "@/lib/behavioral-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uid = (url.searchParams.get("uid") ?? "").trim();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
  const n = Number(url.searchParams.get("n") ?? 25);
  const recent = await readRecent(uid, Number.isFinite(n) ? n : 25);
  return NextResponse.json({ ok: true, uid, count: recent.rows.length, ...recent });
}
