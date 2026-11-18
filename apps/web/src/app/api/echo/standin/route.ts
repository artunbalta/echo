/**
 * Your echo standing in for you in a village room (DECISIONS C103): whether you let it, and where it has
 * earned the right to.
 *
 * GET: `{ on, kept, standing, brief? }`. Vetoes ("that was not me", C105) raise what each kind asks for. `standing` is, for every kind of situation, where the echo stands
 * (`lib/knowable/standing.ts`), read off the settled calls kept for you and nothing else; for talking, off the
 * guesses it sealed of what you would say (C108). With a yes, `brief`
 * is what the echo keeps your body by in a village room when you leave it (C104): for every moment it can
 * meet there, its call, made from the same kept record, and where it stands in that moment's kind of
 * situation, signed so that the room reads it as it was written here. Your page carries it to the room;
 * the room keeps it beside your body and sends it nowhere.
 *
 * POST `{ on }`: yes, or no. No deletes the yes and every call kept, then and there, and says so only if it
 * happened: a no that failed must not read as one that worked (⚑26).
 *
 * PRIVATE. Signed subject: your yes and your record, and nobody else's.
 */
import { NextResponse } from "next/server";

import { briefFor } from "@/lib/knowable/brief";
import { standingOf, vetoesByBucket, type SettledCall } from "@/lib/knowable/standing";
import { known } from "@/lib/knowable/calls";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { identitySecrets, subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore, type KeptLook } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The kept calls as the standing reads them: a kind the village still has. */
const settled = (looks: readonly KeptLook[]): SettledCall[] =>
  looks.filter((l) => known(l.kind)).map((l) => ({ kind: l.kind as SettledCall["kind"], call: l.call, p: l.p, did: l.did }));

export async function GET(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return NextResponse.json({ on: false, kept: 0, standing: standingOf([]), available: false });
  const [on, looks, vetoes, talk] = await Promise.all([
    store.standInOf(caller.subject),
    store.looksOf(caller.subject),
    store.vetoesOf(caller.subject),
    store.talkLooksOf(caller.subject),
  ]);
  if (on === null || looks === null) return bad("store_unavailable", 503);
  // Each "that was not me" asks more of the echo in its kind of situation (C105); unreadable vetoes ask nothing extra.
  // Talking is earned from its sealed guesses of what you would say (C108); unreadable, it has earned nothing.
  const standing = standingOf(settled(looks), vetoesByBucket(vetoes ?? []), (talk ?? []).map((t) => ({ p: t.p, hit: t.hit })));
  const secret = identitySecrets()[0];
  const brief = on && secret ? briefFor(caller.subject, looks, standing, Date.now(), secret) : null;
  return NextResponse.json({ on, kept: looks.length, standing, ...(brief ? { brief } : {}) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { on?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  if (typeof body.on !== "boolean") return bad("bad_on");
  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 60, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("store_unavailable", 503);
  if (!(await store.setStandIn(caller.subject, body.on))) return bad("store_unavailable", 503);
  return NextResponse.json({ on: body.on, ...(body.on ? {} : { erased: true }) });
}
