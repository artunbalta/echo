/**
 * A stranger was there (DECISIONS C52): at a burial, a wedding, a new child's door — while it held.
 *
 * WHAT THE BROWSER SAYS AND WHAT THE SERVER CHECKS. The browser says which gathering and where the
 * stranger stood; the server rebuilds the village's day (`gatheringsOn`, the same closed form), and
 * holds the claim to it: that gathering, today, at this hour, within reach of its rings. Nothing
 * about who was there or whose it is comes from the request.
 *
 * WHAT IS KEPT is a deed (`village_deeds`): the stranger came. Everyone at it saw them, it is the
 * family's (the dead's, the couple's, the parents'), and word of it travels as any deed's does
 * (`social.ts`) — a burial further than a wedding, because coming to a stranger's burial is the
 * rarer kindness. One deed a gathering, however long they stayed.
 *
 * WHAT IS ANSWERED is whether the stranger knew the person it was for — had talked to them
 * (`villager_memories`) — because the measurement wants it (I7 contrasts a tie with no tie) and only
 * the server knows it.
 */
import { NextResponse } from "next/server";
import { gatheringName, gatheringsOn, type Deed } from "@echo/planet";

import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage } from "@/lib/villageTalk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const GATHERING = /^(funeral|wedding|naming):[0-9a-f+]{16,40}$/;
/** Day fractions either side of the hours a gathering holds that still count: clocks disagree a little. */
const EARLY = 0.01;
const LATE = 0.02;
/** Metres beyond the outermost ring that still count as being there. */
const REACH_M = 3.5;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; gathering?: unknown; at?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, gathering } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
  if (typeof gathering !== "string" || !GATHERING.test(gathering)) return bad("bad_gathering");
  const pos = body.at as { x?: unknown; y?: unknown } | undefined;
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return bad("bad_position");

  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const loaded = await loadVillage(cell);
  if (!loaded) return bad("no_village", 404);
  const { village, store, day, hour } = loaded;
  const s = village.settlement;
  const g = gatheringsOn(s, village.plan, day).find((x) => x.id === gathering);
  if (!g) return bad("no_such_gathering", 404);
  if (hour < g.t0 - EARLY || hour > g.t1 + LATE) return bad("not_now", 409);
  const outer = Math.max(0, ...[...g.places.values()].map((p) => Math.hypot(p.at.x - g.at.x, p.at.y - g.at.y)));
  if (Math.hypot(pos.x - g.at.x, pos.y - g.at.y) > outer + REACH_M) return bad("too_far", 403);
  if (!store) return NextResponse.json({ recorded: false, reason: "no_store" });

  // Whether they knew whom it was for: the dead, either of the couple, either parent.
  const whom = g.kind === "funeral" ? g.about : g.kind === "wedding" ? g.about : g.centre;
  let knew = false;
  for (const id of whom) {
    const m = await store.memoryOf(caller.subject, cell, id);
    if (m && m !== "none" && m.meetings > 0) knew = true;
  }

  const mine = (await store.deedsFor(caller.subject, cell)) ?? [];
  if (mine.some((d) => d.verb === "attend" && d.thing === g.id)) return NextResponse.json({ recorded: false, already: true, knew });

  const owners = g.kind === "funeral" ? g.family : g.centre;
  const deed: Omit<Deed, "id"> = {
    verb: "attend",
    kind: g.kind === "funeral" ? "grave" : g.kind === "wedding" ? "villager" : "house",
    thing: g.id,
    thingName: gatheringName(s, g),
    reading: g.kind === "funeral" ? "respect" : "kindness",
    weight: g.kind === "funeral" ? 2 : 1,
    day,
    hour,
    // Everyone at it saw the stranger there.
    witnesses: [...g.centre, ...g.guests],
    owners,
  };
  const recorded = await store.addDeed(caller.subject, cell, deed);
  return NextResponse.json({ recorded: recorded !== null, knew });
}
