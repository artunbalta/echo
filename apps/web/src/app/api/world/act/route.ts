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
 */
import { NextResponse } from "next/server";
import {
  WRONGS,
  activeEffects,
  parseScatterRef,
  present,
  thingName,
  verbOf,
  villageThings,
  witnessesOf,
  type Deed,
} from "@echo/planet";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
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
  let body: { cell?: unknown; thing?: unknown; kind?: unknown; verb?: unknown; at?: unknown };
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
  if (!verb.deed && !(verb.effect && verb.effect.lastsDays > 0)) return NextResponse.json({ recorded: false, reason: "touches_nothing" });

  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const loaded = await loadVillage(cell);
  if (!loaded) return bad("no_village", 404);
  const { village, changes, store, day, hour } = loaded;
  if (!store) return NextResponse.json({ recorded: false, reason: "no_store" });
  const s = village.settlement;

  // The thing, as the world has it — never as the request describes it.
  let place: { x: number; y: number; sizeM: number; owners: string[]; name: string } | null = null;
  const scatter = parseScatterRef(thing);
  if (scatter) {
    if (scatter.classId !== kind || Math.hypot(scatter.x, scatter.y) > REGION_M) return bad("no_such_thing", 404);
    place = { x: scatter.x, y: scatter.y, sizeM: 1, owners: [], name: `a ${thingName(kind)}` };
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

  const mine = (await store.deedsFor(caller.subject, cell)) ?? [];
  if (verb.deed && WRONGS.has(verb.deed.reading) && mine.filter((d) => d.day === day && WRONGS.has(d.reading)).length >= WRONGS_PER_DAY) {
    return bad("enough", 429);
  }

  const witnesses = witnessesOf(s, village.plan, day, hour, place, changes, kind === "house" ? thing : undefined);
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
    });
  }
  let effect = null;
  if (verb.effect && verb.effect.lastsDays > 0) {
    const standing = (await store.effectsFor(cell, day)) ?? [];
    const already = activeEffects(standing, day).get(thing);
    effect = already && already.kind === verb.effect.kind ? already : await store.addEffect(cell, { thing, kind: verb.effect.kind, day, untilDay: day + verb.effect.lastsDays }, caller.subject);
  }

  const byId = new Map(s.people.map((p) => [p.id, p]));
  return NextResponse.json({
    recorded: deed !== null || effect !== null,
    // Who saw you, by name: the stranger learns it the way a person would, by being looked at.
    seenBy: witnesses.map((id) => byId.get(id)?.given).filter(Boolean),
    ...(effect ? { effect } : {}),
  });
}
