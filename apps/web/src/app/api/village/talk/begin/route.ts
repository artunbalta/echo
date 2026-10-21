/**
 * Begin a conversation with a villager (DECISIONS C44): the stranger has pressed E.
 *
 * The server finds the villager where the closed form has them NOW and refuses a stranger who is not
 * near them, or a villager who is indoors or out at sea — then counts the meeting in the villager's
 * memory of this stranger and signs a token every line of the conversation carries. Nothing is spent:
 * there is no model call here. See `lib/villageTalk.ts` for why the check is at the beginning and
 * what it does not prove.
 *
 * A VILLAGER YOU HAVE WRONGED TURNS AWAY (C45): if they know of a wrong you did to their household in
 * the last month and you have not made it good, there is no conversation (409 `turns_away`).
 *
 * THE LIMIT FAILS OPEN HERE, and only here. This route spends nothing and writes one row per stranger
 * per villager (an upsert on its key), so "the counter is down" is not a cost; the line that calls a
 * model is still closed when the counter is.
 */
import { NextResponse } from "next/server";
import { ageYears, dayPlans, doorOf, grievance, homeState, present, residentsOn } from "@echo/planet";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";
import { refuseBarred } from "@/lib/moderation";
import { recognition, whereNow } from "@/lib/villager";
import { TALK_REACH_M, loadVillage, signConversation } from "@/lib/villageTalk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  // A stranger barred by a moderator changes nothing in the shared world (C67).
  const barredNow = await refuseBarred(villageStore(), caller.subject);
  if (barredNow) return barredNow;
  let body: { cell?: unknown; person?: unknown; at?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, person, at } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof person !== "string" || !PERSON.test(person)) return bad("bad_person");
  const pos = at as { x?: unknown; y?: unknown } | undefined;
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return bad("bad_position");

  const rate = await rateLimit(req, { bucket: "villager", windowMs: 10 * 60 * 1000, max: 40, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const now = Date.now();
  const loaded = await loadVillage(cell, now);
  if (!loaded) return bad("no_village", 404);
  const { village, changes, store, day, hour } = loaded;
  const s = village.settlement;
  const me = s.people.find((p) => p.id === person);
  if (!me || !present(s, me, day)) return bad("no_such_villager", 404);
  if (ageYears(me, day) < 4) return bad("too_young", 422);

  const w = whereNow(s, village.plan, me, day, hour, changes);
  if (!w) return bad("not_out", 409);
  if (!w.visible) {
    // At home (C54): awake, and the stranger in the same house with them, or nothing.
    const home = residentsOn(s, village.plan, day).find((r) => r.person.id === me.id)?.plot;
    if (!home) return bad("not_out", 409);
    const d = dayPlans(s, village.plan, day, changes).plans.find((x) => x.person === me.id);
    const state = homeState(d, hour, doorOf(home));
    if (state === "asleep") return bad("asleep", 409);
    if (state !== "awake") return bad("not_out", 409);
    const c = Math.cos(home.facing);
    const sn = Math.sin(home.facing);
    const along = (pos.x - home.x) * c + (pos.y - home.y) * sn;
    const across = -(pos.x - home.x) * sn + (pos.y - home.y) * c;
    if (Math.abs(along) > home.depthM / 2 + 0.6 || Math.abs(across) > home.widthM / 2 + 0.6) return bad("not_out", 409);
  } else {
    if (w.boat !== null) return bad("at_sea", 409);
    const distanceM = Math.hypot(w.x - pos.x, w.y - pos.y);
    if (distanceM > TALK_REACH_M) return bad("too_far", 403);
  }

  // A wrong done to their own household, that they know of and that you have not made good (C45):
  // they will not talk to you. Said as what they do, never as a number.
  const deeds = store ? ((await store.deedsFor(caller.subject, cell)) ?? []) : [];
  const held = grievance(s, me, deeds, day, village.plan);
  if (held) return NextResponse.json({ error: "turns_away", deed: held.verb }, { status: 409 });

  const conv = signConversation(caller.subject, cell, person, now);
  if (!conv) return bad("identity_unconfigured", 503);

  // The meeting, counted. A store that cannot be read or written costs the villager their memory of
  // you, not the conversation.
  let known: Awaited<ReturnType<NonNullable<typeof store>["memoryOf"]>> = null;
  if (store) {
    known = await store.memoryOf(caller.subject, cell, person);
    if (known !== null) {
      const before = known === "none" ? null : known;
      await store.remember(caller.subject, cell, person, {
        note: before?.note ?? "",
        meetings: (before?.meetings ?? 0) + 1,
        firstDay: before?.firstDay ?? day,
        lastDay: day,
      });
    }
  }
  const memory = known && known !== "none" ? { ...known, meetings: known.meetings + 1 } : null;
  return NextResponse.json({
    conv,
    meetings: memory?.meetings ?? 1,
    recognised: recognition(memory, me.given, day),
    remembers: store !== null && known !== null,
  });
}
