/**
 * "That was not me" (DECISIONS C105): the person, of one moment their echo met while it kept their body,
 * says its call was wrong about them.
 *
 * POST `{ at, kind, call }`: the moment as the room logged it (its time, its kind, the echo's call there).
 * Or `{ at, kind: "talk", call: "answer" }` of a line the echo said for them (C109), which asks more of its
 * talking. Kept once per moment, only while the person's yes stands (409 otherwise), and only for a moment in a
 * family: a moment in none is one the echo never stands in at, so there is no right to take back. Each
 * veto raises what the echo must show in that family from then on (C103 `needsOf`: half as many looks
 * again, and 0.05 surer), so `/api/echo/standin` reads them, and the brief it signs carries the new
 * standing. Answers the vetoes by family.
 *
 * WHAT IT CANNOT CHECK: that the echo met that moment. The record is the person's to read and to say of;
 * a veto made up costs only their own echo a right over their own body.
 *
 * PRIVATE. Signed subject: only your own echo.
 */
import { NextResponse } from "next/server";
import { TALK_KIND } from "@echo/shared";

import { familyOf, known, outcomesOf } from "@/lib/knowable/calls";
import { vetoesByBucket } from "@/lib/knowable/standing";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { at?: unknown; kind?: unknown; call?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { at, kind, call } = body;
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return bad("bad_at");
  // A line the echo said for them (C109): "not me" of it asks more of its talking.
  const talked = kind === TALK_KIND;
  if (typeof kind !== "string" || (!talked && (!known(kind) || !familyOf(kind)))) return bad("bad_kind");
  if (typeof call !== "string" || (talked ? call !== "answer" : !outcomesOf(kind).includes(call))) return bad("bad_call");
  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  const on = await store.standInOf(caller.subject);
  if (on === null) return bad("store_unavailable", 503);
  if (!on) return bad("not_on", 409);
  if (!(await store.keepVeto(caller.subject, { at, kind, call }))) return bad("store_unavailable", 503);
  const vetoes = await store.vetoesOf(caller.subject);
  return NextResponse.json({ vetoes: vetoesByBucket(vetoes ?? []) });
}
