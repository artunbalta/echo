/**
 * Letting your echo meet someone's you know (DECISIONS C71): `POST /api/echo/pair`.
 *
 * - `{ op: "invite", name }`: a code to hand someone, single use, for a day, with the name they know you
 *   by. Making one is half of a yes.
 * - `{ op: "accept", code, name }`: the other half. Two echoes may meet only once both people have said
 *   it: one made the code, the other typed it in.
 * - `{ op: "list" }`: whom your echo may meet, by the names they gave, and since when.
 * - `{ op: "leave", id }`: no more meetings with them. Meetings already had are kept, to be told and
 *   answered, until either of you erases.
 *
 * Only by your own signed identity, and the page sends nothing of this without consent: an echo exists
 * because its person let it watch.
 */
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { EchoPair } from "@/lib/echoTypes";
import { MEETING, cleanName, newInviteCode, otherIn, readCode, showCode } from "@/lib/echoMeeting";
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
  let body: { op?: unknown; name?: unknown; code?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const rate = await rateLimit(req, { bucket: "pair", windowMs: 10 * 60 * 1000, max: 30, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const now = Date.now();
  const me = caller.subject;

  const pairs = await store.pairsOf(me);
  if (pairs === null) return bad("unreadable", 503);

  if (body.op === "list") {
    return NextResponse.json({ pairs: pairs.map((p) => ({ id: p.id, name: otherIn(p, me).name, since: p.createdAt })) });
  }

  if (body.op === "invite") {
    const name = cleanName(body.name);
    if (!name) return bad("bad_name");
    if (pairs.length >= MEETING.pairs) return bad("too_many", 409);
    const code = newInviteCode();
    const expiresAt = new Date(now + MEETING.inviteMs).toISOString();
    if (!(await store.addInvite({ code, subject: me, name, createdAt: new Date(now).toISOString(), expiresAt }))) return bad("not_recorded", 503);
    return NextResponse.json({ code: showCode(code), expiresAt });
  }

  if (body.op === "accept") {
    const code = readCode(body.code);
    const name = cleanName(body.name);
    if (!code) return bad("bad_code");
    if (!name) return bad("bad_name");
    const invite = await store.inviteOf(code);
    if (invite === undefined) return bad("unreadable", 503);
    if (invite === null) return bad("no_such_code", 404);
    if (invite.subject === me) return bad("own_code", 409);
    if (Date.parse(invite.expiresAt) <= now) {
      await store.dropInvite(code);
      return bad("expired", 410);
    }
    if (pairs.length >= MEETING.pairs) return bad("too_many", 409);
    const pair: EchoPair = { id: `pair_${randomUUID().replace(/-/g, "").slice(0, 16)}`, a: invite.subject, b: me, aName: invite.name, bName: name, createdAt: new Date(now).toISOString() };
    const added = await store.addPair(pair);
    // Used once, whatever the outcome: a code is not a standing door.
    await store.dropInvite(code);
    if (added === "exists") return bad("already", 409);
    if (added === "failed") return bad("not_recorded", 503);
    return NextResponse.json({ pair: { id: pair.id, name: pair.aName, since: pair.createdAt } });
  }

  if (body.op === "leave") {
    const p = typeof body.id === "string" ? pairs.find((x) => x.id === body.id) : undefined;
    if (!p) return bad("not_yours", 404);
    if (!(await store.dropPair(p.id))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true });
  }

  return bad("bad_op");
}
