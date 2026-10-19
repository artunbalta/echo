/**
 * A stranger does something to the world (DECISIONS C45): the act, its mark, and who saw it.
 *
 * ONLY ACTS THAT TOUCH SOMETHING COME HERE. Sitting on a bench, climbing a tree or looking into a
 * tidepool changes nothing shared and nobody's opinion, so the browser does it alone and the echo
 * hears about it through the measurement chain (consent-gated, `/api/observe/behavioral`). What comes
 * here is what leaves a mark on the shared world (`effect`) or that somebody would hold against you,
 * or thank you for (`deed`) — both from the registry, never from the request.
 *
 * THE CLIENT NAMES A THING AND A VERB; THE SERVER DECIDES THE REST. The thing is looked up in the
 * village rebuilt from the seed and its changes (`villageThings`), or read back from a scatter
 * reference; the verb must be one that kind of thing affords; the stranger must be within reach of it;
 * who saw it is computed here by the closed form (`witnessesOf`), and whose it was comes from the
 * village, not the request. A crafted request can choose what to do, and nothing about what it means.
 *
 * BOUNDED, because a mark is shared: an act that is already marked is not marked twice, every mark
 * heals (the registry says when), and a stranger who has done {@link WRONGS_PER_DAY} wrongs in a
 * village today is refused more. The limit fails OPEN here: this route spends nothing.
 *
 * WHAT IS KEPT. The deed (`village_deeds`), private to the stranger and erased with them, and the mark
 * (`world_effects`), shared, healing, its subject cleared on erasure. Nothing typed — there is no text.
 * And the pack (C47): what was picked up is added to it, what was given comes out of it, both checked.
 *
 * A NEED MET (C50). If the act is the very thing somebody it touches needed this week (`needs.ts`:
 * the shell handed to the child who wanted one, the trampled field weeded), it is recorded as a `met`
 * change — shared, so the need is gone for every stranger after, and a goal it was for comes nearer —
 * and the deed remembers whose need it met. The answer carries what they say about it.
 */
import { NextResponse } from "next/server";
import {
  ANIMALS,
  WRONGS,
  add,
  activeEffects,
  animalAt,
  animalsOf,
  bondWith,
  dayPlans,
  residentsOn,
  whereabouts,
  meets,
  metChange,
  needOf,
  remove,
  thanksFor,
  parseScatterRef,
  present,
  thingName,
  verbOf,
  villageThings,
  witnessesOf,
  worldClock,
  worldDayIndex,
  WORLD_EPOCH,
  type Deed,
  type LifeChange,
  type Need,
} from "@echo/planet";
import { FATE_VERBS, fateTurn } from "@echo/planet";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { villageStore } from "@/lib/villageStore";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage } from "@/lib/villageTalk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
/** Wrongs a stranger may do in one village in one world day before the village stops recording more. */
const WRONGS_PER_DAY = 6;
/** Metres beyond a verb's reach and a thing's size a stranger may stand: clocks and frames disagree a little. */
const SLACK_M = 3;
/** How far from the parcel's centre a scatter or water thing may be, metres. */
const REGION_M = 3000;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; thing?: unknown; kind?: unknown; verb?: unknown; at?: unknown; item?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, thing, kind, verb: verbId, at } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof thing !== "string" || thing.length > 64) return bad("bad_thing");
  if (typeof kind !== "string" || kind.length > 32) return bad("bad_kind");
  if (typeof verbId !== "string" || verbId.length > 32) return bad("bad_verb");
  const pos = at as { x?: unknown; y?: unknown } | undefined;
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return bad("bad_position");

  const verb = verbOf(kind, verbId);
  if (!verb) return bad("no_such_verb", 404);
  // Something comes back from a trade (C58): the trade route does those, or the deed would be free.
  if (verb.id === "trade" || verb.id === "ask-back") return bad("use_trade_route", 400);
  if (!verb.deed && !(verb.effect && verb.effect.lastsDays > 0)) return NextResponse.json({ recorded: false, reason: "touches_nothing" });

  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const loaded = await loadVillage(cell);
  if (!loaded) return unpeopled(caller.subject, cell, thing, kind, verb, pos, body.item);
  const { village, changes, store, day, hour } = loaded;
  if (!store) return NextResponse.json({ recorded: false, reason: "no_store" });
  const s = village.settlement;

  // The thing, as the world has it — never as the request describes it.
  let place: { x: number; y: number; sizeM: number; owners: string[]; name: string } | null = null;
  const scatter = parseScatterRef(thing);
  if (scatter) {
    if (scatter.classId !== kind || Math.hypot(scatter.x, scatter.y) > REGION_M) return bad("no_such_thing", 404);
    place = { x: scatter.x, y: scatter.y, sizeM: 1, owners: [], name: `a ${thingName(kind)}` };
  } else if (thing.startsWith("animal:")) {
    // An animal (C55): the village's, where the hour has it — with room for a hen that shied from the
    // stranger, and none needed for a dog that has taken to them and is at their heel.
    const a = animalsOf(s, village.plan, day).find((x) => x.id === thing.slice(7));
    const kindOf = a?.kind === "hen" ? "hen" : a?.kind === "goat" ? "goat" : a?.kind === "dog" ? "dog" : null;
    if (!a || kindOf !== kind) return bad("no_such_thing", 404);
    const { plans, boats, moorings } = dayPlans(s, village.plan, day, changes);
    const at = animalAt(a, hour, (id) => {
      const d = plans.find((x) => x.person === id);
      return d ? whereabouts(d, hour, boats, moorings) : null;
    });
    if (at.activity === "hidden") return bad("no_such_thing", 404);
    const owners =
      a.household === null
        ? []
        : residentsOn(s, village.plan, day)
            .filter(({ person: p }) => (p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto) === a.household)
            .map(({ person: p }) => p.id);
    const bond = a.kind === "dog" ? bondWith((await store?.deedsFor(caller.subject, cell)) ?? [], a.id, day) : 0;
    const name = a.name ?? (a.kind === "hen" ? "the hens" : "the goats");
    place = { x: bond >= ANIMALS.follows ? pos.x : at.x, y: bond >= ANIMALS.follows ? pos.y : at.y, sizeM: 4, owners, name };
  } else if (thing.startsWith("villager:")) {
    const p = s.people.find((q) => q.id === thing.slice(9));
    if (!p || !present(s, p, day) || kind !== "villager") return bad("no_such_thing", 404);
    const household = s.people.filter((q) => q.household === p.household && present(s, q, day)).map((q) => q.id);
    place = { x: pos.x, y: pos.y, sizeM: 0, owners: [...new Set([p.id, ...household])], name: p.given };
  } else {
    const t = villageThings(s, village.plan, day).find((x) => x.ref === thing);
    if (!t || t.kind !== kind) return bad("no_such_thing", 404);
    place = t;
  }
  if (Math.hypot(place.x - pos.x, place.y - pos.y) > verb.reachM + place.sizeM + SLACK_M) return bad("too_far", 403);

  // A death met on its way (C66): only when there is one to meet, and for whom the world says.
  const turn = FATE_VERBS.has(verb.id) ? fateTurn(verb.id, thing, s, village.plan, day, hour) : null;
  if (FATE_VERBS.has(verb.id) && !turn) return bad("nothing_to_turn", 409);

  // The pack (C47): what is picked up goes into it, and a gift comes out of it — checked here, so a
  // gift is of something actually carried, before anything about the act is recorded.
  let pack = verb.gives || verb.needs === "carrying" ? await store.packOf(caller.subject) : null;
  let gift: string | null = null;
  if (verb.gives) {
    if (pack === null) return bad("pack_unavailable", 503);
    const next = add(pack, verb.gives);
    if (!next) return bad("pack_full", 409);
    pack = next;
  }
  if (verb.needs === "carrying") {
    if (pack === null) return bad("pack_unavailable", 503);
    if (typeof body.item !== "string") return bad("bad_item");
    // Food for an animal is food (C55): nothing comes out of the pack for a stone held out to a dog.
    if (verb.takes && !verb.takes.includes(body.item)) return bad("not_food", 409);
    const next = remove(pack, body.item);
    if (!next) return bad("not_carried", 409);
    pack = next;
    gift = body.item;
  }

  const mine = (await store.deedsFor(caller.subject, cell)) ?? [];
  if (verb.deed && WRONGS.has(verb.deed.reading) && mine.filter((d) => d.day === day && WRONGS.has(d.reading)).length >= WRONGS_PER_DAY) {
    return bad("enough", 429);
  }

  const witnesses = witnessesOf(s, village.plan, day, hour, place, changes, kind === "house" ? thing : undefined);
  const standing = (await store.effectsFor(cell, day)) ?? [];

  // Whose need this meets (C50): the villager handed it, or whoever the thing belongs to. One gift
  // meets one need; weeding a household's field puts it right for all of them.
  const byId = new Map(s.people.map((p) => [p.id, p]));
  const toPerson = thing.startsWith("villager:") ? thing.slice(9) : null;
  const act = { verb: verb.id, thing, item: gift, toPerson, owners: place.owners };
  const metNeeds: Need[] = [];
  for (const id of toPerson ? [toPerson] : place.owners) {
    const p = byId.get(id);
    const n = p ? needOf(s, village.plan, p, day, changes, standing) : null;
    if (!n || !meets(n, act)) continue;
    metNeeds.push(n);
    if (n.item) break;
  }

  let deed: Deed | null = null;
  if (verb.deed) {
    deed = await store.addDeed(caller.subject, cell, {
      verb: verb.id,
      kind,
      thing,
      thingName: place.name,
      reading: verb.deed.reading,
      weight: verb.deed.weight,
      day,
      hour,
      witnesses,
      owners: place.owners,
      ...(gift ? { item: gift } : {}),
      ...(metNeeds.length > 0 ? { met: metNeeds.map((n) => n.person) } : {}),
    });
  }
  const met: { person: string; name: string; words: string }[] = [];
  const recorded: LifeChange[] = [];
  for (const n of metNeeds) {
    const c = await store.addChange(cell, metChange(n, day), caller.subject);
    if (!c) continue;
    recorded.push(c);
    met.push({ person: n.person, name: byId.get(n.person)?.given ?? "", words: thanksFor(n) });
  }
  // The healer fetched, herbs left, a fisher kept ashore: a change in their life from today, which the
  // risk model weighs (`mortality.ts`). Whether it is enough is the world's to say, later.
  if (turn) {
    const c = await store.addChange(cell, { person: turn.person.id, kind: turn.kind, madeDay: day, day: turn.day, ...(turn.by ? { by: turn.by } : {}) }, caller.subject);
    if (c) recorded.push(c);
  }
  if (pack !== null) await store.setPack(caller.subject, pack);
  let effect = null;
  if (verb.effect && verb.effect.lastsDays > 0) {
    const already = activeEffects(standing, day).get(thing);
    effect = already && already.kind === verb.effect.kind ? already : await store.addEffect(cell, { thing, kind: verb.effect.kind, day, untilDay: day + verb.effect.lastsDays }, caller.subject);
  }

  return NextResponse.json({
    recorded: deed !== null || effect !== null,
    // Who saw you, by name: the stranger learns it the way a person would, by being looked at.
    seenBy: witnesses.map((id) => byId.get(id)?.given).filter(Boolean),
    ...(effect ? { effect } : {}),
    ...(pack !== null ? { pack } : {}),
    // The need met, a death met, and the changes that say so, for the page to fold into its own village.
    ...(met.length > 0 ? { met } : {}),
    ...(recorded.length > 0 ? { changes: recorded } : {}),
  });
}

/**
 * An act on a parcel with no village (C59): most of the planet. Nobody lives here to see it or be
 * wronged by it, so only what is nobody's can be acted on — the scatter and the water. That is still
 * driftwood picked up, a stone carried off, a mark left that heals. Before C59 this answered "no
 * village" and nothing was recorded, so a stranger could gather nothing on their own empty land to
 * build a house with.
 */
async function unpeopled(subject: string, cell: string, thing: string, kind: string, verb: NonNullable<ReturnType<typeof verbOf>>, pos: { x?: unknown; y?: unknown }, item: unknown) {
  const scatter = parseScatterRef(thing);
  if (!scatter || verb.deed) return bad("no_village", 404);
  if (scatter.classId !== kind || Math.hypot(scatter.x, scatter.y) > REGION_M) return bad("no_such_thing", 404);
  if (Math.hypot(scatter.x - (pos.x as number), scatter.y - (pos.y as number)) > verb.reachM + 1 + SLACK_M) return bad("too_far", 403);
  const store = villageStore();
  if (!store) return NextResponse.json({ recorded: false, reason: "no_store" });
  const clock = worldClock(WORLD_EPOCH);
  const day = worldDayIndex(clock, Date.now());
  let pack = verb.gives || verb.needs === "carrying" ? await store.packOf(subject) : null;
  if (verb.gives) {
    if (pack === null) return bad("pack_unavailable", 503);
    const next = add(pack, verb.gives);
    if (!next) return bad("pack_full", 409);
    pack = next;
  }
  if (verb.needs === "carrying") {
    if (pack === null) return bad("pack_unavailable", 503);
    if (typeof item !== "string") return bad("bad_item");
    if (verb.takes && !verb.takes.includes(item)) return bad("not_food", 409);
    const next = remove(pack, item);
    if (!next) return bad("not_carried", 409);
    pack = next;
  }
  if (pack !== null) await store.setPack(subject, pack);
  let effect = null;
  if (verb.effect && verb.effect.lastsDays > 0) {
    const standing = (await store.effectsFor(cell, day)) ?? [];
    const already = activeEffects(standing, day).get(thing);
    effect = already && already.kind === verb.effect.kind ? already : await store.addEffect(cell, { thing, kind: verb.effect.kind, day, untilDay: day + verb.effect.lastsDays }, subject);
  }
  return NextResponse.json({ recorded: effect !== null, seenBy: [], ...(effect ? { effect } : {}), ...(pack !== null ? { pack } : {}) });
}
