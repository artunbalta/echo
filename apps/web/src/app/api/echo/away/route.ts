/**
 * The echo's outings (DECISIONS C64): `POST /api/echo/away`.
 *
 * - `{ op: "seen", cell }`: the page is open, here. Sent every couple of minutes and on leaving, so
 *   an absence is measured from when the stranger actually went.
 * - `{ op: "back", cell }`: the page has opened. If the stranger was away long enough, and the echo
 *   has not been out lately, the absence is filled now (`echoOuting.ts` `makeOuting`). Either way the
 *   newest outing not yet told comes back, with the echo's own account of it, and a voice token for
 *   each villager's line (C60) so the page may play them in their voices.
 * - `{ op: "answer", id, encounter, turn, agreed }`: the stranger's word on one line the echo said or
 *   held back, "that's me" or "not me". It goes to the engine as the old copilot's feedback did, with
 *   the confidence the gate had at the time (never one the page sends): it trains the reward head, the
 *   calibration and the bucket's autonomy. Once per line.
 * - `{ op: "read", id }`: told; it is not told again.
 *
 * Only the caller's own outings, by their signed identity. The page sends nothing of this without
 * consent: the echo exists because the stranger let it watch.
 */
import { NextResponse } from "next/server";

import type { Outing } from "@/lib/echoTypes";
import { OUTING, absenceOf, makeOuting, mayGoOut, narration, untold } from "@/lib/echoOuting";
import { agentFeedback } from "@/lib/ml";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { signLine } from "@/lib/villageTalk";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CELL = /^[0-9a-f]{15}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** An outing as the page is shown it: its own, with tokens for the villagers' voices. */
function shown(o: Outing | null, subject: string) {
  if (!o) return null;
  const { subject: _whose, ...rest } = o;
  void _whose;
  return {
    ...rest,
    told: narration(o),
    encounters: o.encounters.map((e) => ({
      ...e,
      lines: e.lines.map((l) => (l.who === "villager" ? { ...l, voice: signLine(subject, e.cell, e.person, l.text, Date.now()) } : l)),
    })),
  };
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { op?: unknown; cell?: unknown; id?: unknown; encounter?: unknown; turn?: unknown; agreed?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const now = Date.now();

  if (body.op === "seen" || body.op === "back") {
    const cell = typeof body.cell === "string" && CELL.test(body.cell) ? body.cell : null;
    if (!cell) return bad("bad_cell");
    const seen = body.op === "back" ? await store.seenOf(caller.subject) : null;
    if (!(await store.markSeen(caller.subject, cell, new Date(now).toISOString()))) return bad("not_recorded", 503);
    if (body.op === "seen") return NextResponse.json({ ok: true });
    const outings = (await store.outingsOf(caller.subject)) ?? null;
    if (seen === undefined || outings === null) return NextResponse.json({ outing: null, reason: "unreadable" });
    const away = absenceOf(seen, now);
    let made: Outing | null = null;
    if (away && mayGoOut(outings, now)) {
      made = await makeOuting(store, caller.subject, away, now);
      if (made && !(await store.saveOuting(made))) made = null;
    }
    const tell = untold(made ? [made, ...outings] : outings, now);
    return NextResponse.json({ outing: shown(tell, caller.subject), away: away ? away.to - away.from : null });
  }

  const outings = await store.outingsOf(caller.subject);
  if (outings === null) return bad("unreadable", 503);
  const o = typeof body.id === "string" ? outings.find((x) => x.id === body.id) : undefined;
  if (!o) return bad("not_yours", 404);

  if (body.op === "read") {
    if (!(await store.saveOuting({ ...o, readAt: o.readAt ?? new Date(now).toISOString() }))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true });
  }

  if (body.op === "answer") {
    const e = typeof body.encounter === "number" ? o.encounters[body.encounter] : undefined;
    const t = e && typeof body.turn === "number" ? e.turns[body.turn] : undefined;
    if (!e || !t || typeof body.agreed !== "boolean") return bad("bad_answer");
    if (e.feedback[body.turn as number] !== null) return bad("answered", 409);
    if (now - Date.parse(o.madeAt) > OUTING.unreadMs) return bad("too_late", 409);
    const agreed = body.agreed;
    const result = (await agentFeedback({
      userId: caller.subject,
      bucket: t.bucket,
      confidence: t.confidence,
      agreed,
      context: t.context,
      ...(agreed ? {} : { rejected: t.line }),
    })) as { mocked?: boolean; bucket?: { level?: string; changed?: boolean } };
    if (result.mocked) return bad("no_engine", 503);
    const feedback = e.feedback.map((f, i) => (i === body.turn ? agreed : f));
    const next: Outing = { ...o, encounters: o.encounters.map((x, i) => (i === body.encounter ? { ...x, feedback } : x)) };
    if (!(await store.saveOuting(next))) return bad("not_recorded", 503);
    return NextResponse.json({ ok: true, bucket: result.bucket ?? null });
  }

  return bad("bad_op");
}
