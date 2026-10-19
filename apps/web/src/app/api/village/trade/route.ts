/**
 * Trading with a villager, and asking for something back for your help (DECISIONS C58):
 * `POST /api/village/trade`.
 *
 * The request says who, where the stranger stands, what they hold out (or nothing, to ask for a
 * return for help) and what they would like (or nothing, for whatever the villager can spare). The
 * server checks that the villager is there to hand it to, out of doors within reach or awake at home
 * with the stranger inside. It checks that what is held out is in the pack. Then it asks the village
 * (`trade.ts` `tradeAnswer`), and on a yes it does three things:
 *
 * - swaps the two things in the pack;
 * - records the deed: a `trade`, or an `ask-back` for a return, read as respect — dealing fairly —
 *   with who saw it;
 * - when what was handed over was the very thing the villager needed this week, records it met,
 *   as a gift would.
 *
 * NOTHING IS PRICED, ANYWHERE. The answer is a reason, said in the villager's words, and one thing
 * for one thing.
 */
import { NextResponse } from "next/server";
import {
  ITEMS,
  add,
  ageYears,
  daysToMarket,
  dayPlans,
  doorOf,
  homeState,
  metChange,
  needOf,
  present,
  remove,
  residentsOn,
  thanksFor,
  tradeAnswer,
  tradeWords,
  witnessesOf,
  type Deed,
} from "@echo/planet";
import { isAiling } from "@echo/planet";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { whereNow } from "@/lib/villager";
import { loadVillage } from "@/lib/villageTalk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const PERSON = /^[0-9a-f]{16}$/;
/** How near a villager out of doors must be to be handed something, metres: an arm, and frames that disagree. */
const TRADE_REACH_M = 8;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const item = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === "string" && ITEMS[v] ? v : undefined);

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; person?: unknown; at?: unknown; offered?: unknown; asked?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, person } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof person !== "string" || !PERSON.test(person)) return bad("bad_person");
  const raw = body.at as { x?: unknown; y?: unknown } | undefined;
  if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number" || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return bad("bad_position");
  const pos = { x: raw.x, y: raw.y };
  const offered = item(body.offered);
  const asked = item(body.asked);
  if (offered === undefined || asked === undefined) return bad("bad_item");

  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const loaded = await loadVillage(cell);
  if (!loaded) return bad("no_village", 404);
  const { village, changes, store, day, hour } = loaded;
  if (!store) return bad("no_store", 503);
  const s = village.settlement;
  const me = s.people.find((p) => p.id === person);
  if (!me || !present(s, me, day)) return bad("no_such_villager", 404);

  // There to hand it to: out of doors and near, or awake at home with the stranger inside (C54).
  const w = whereNow(s, village.plan, me, day, hour, changes);
  if (w && w.visible) {
    if (w.boat !== null) return bad("at_sea", 409);
    if (Math.hypot(w.x - pos.x, w.y - pos.y) > TRADE_REACH_M) return bad("too_far", 403);
  } else {
    const home = residentsOn(s, village.plan, day).find((r) => r.person.id === me.id)?.plot;
    const d = dayPlans(s, village.plan, day, changes).plans.find((x) => x.person === me.id);
    if (!home || homeState(d, hour, doorOf(home), isAiling(me, day)) !== "awake") return bad("not_out", 409);
    const c = Math.cos(home.facing);
    const sn = Math.sin(home.facing);
    const along = (pos.x - home.x) * c + (pos.y - home.y) * sn;
    const across = -(pos.x - home.x) * sn + (pos.y - home.y) * c;
    if (Math.abs(along) > home.depthM / 2 + 0.6 || Math.abs(across) > home.widthM / 2 + 0.6) return bad("not_out", 409);
  }

  let pack = await store.packOf(caller.subject);
  if (pack === null) return bad("pack_unavailable", 503);
  if (offered !== null && !((pack[offered] ?? 0) > 0)) return bad("not_carried", 409);

  const deeds = (await store.deedsFor(caller.subject, cell)) ?? [];
  const effects = (await store.effectsFor(cell, day)) ?? [];
  const need = needOf(s, village.plan, me, day, changes, effects);
  const ask = { offered, asked };
  const answer = tradeAnswer(s, village.plan, me, day, ask, deeds, need);
  const m = village.plan.market ?? null;
  const market = m && m.goers.includes(me.id) ? { partner: m.partner.name, brings: m.brings, daysTo: daysToMarket(m, day) } : null;
  const words = tradeWords(answer, ask, market);
  if (!answer.ok || !answer.gives) return NextResponse.json({ ok: false, why: answer.why, words, spares: answer.spares, pack });

  // One thing out of the pack and one in: room is made by what goes, so a full pack can still trade.
  const out = offered !== null ? remove(pack, offered) : pack;
  const next = out ? add(out, answer.gives) : null;
  if (!next) return NextResponse.json({ ok: false, why: "pack_full", words: "You've no room to carry it.", spares: answer.spares, pack }, { status: 409 });
  pack = next;

  const household = me.partnerDay !== null && me.partnerDay <= day ? me.household : me.bornInto;
  const owners = s.people.filter((q) => present(s, q, day) && (q.partnerDay !== null && q.partnerDay <= day ? q.household : q.bornInto) === household).map((q) => q.id);
  const metHere = answer.why === "need" && need !== null;
  const deed: Deed | null = await store.addDeed(caller.subject, cell, {
    verb: offered === null ? "ask-back" : "trade",
    kind: "villager",
    thing: `villager:${me.id}`,
    thingName: me.given,
    reading: "respect",
    weight: 1,
    day,
    hour,
    witnesses: witnessesOf(s, village.plan, day, hour, pos, changes),
    owners: [...new Set([me.id, ...owners])],
    ...(offered !== null ? { item: offered } : {}),
    got: answer.gives,
    ...(metHere ? { met: [me.id] } : {}),
  });
  if (!deed) return bad("not_recorded", 503);
  await store.setPack(caller.subject, pack);
  const recorded = metHere ? await store.addChange(cell, metChange(need!, day), caller.subject) : null;

  return NextResponse.json({
    ok: true,
    why: answer.why,
    gives: answer.gives,
    words,
    pack,
    deed,
    ...(recorded ? { met: { person: me.id, words: thanksFor(need!) }, changes: [recorded] } : {}),
    young: ageYears(me, day) < 16,
  });
}
