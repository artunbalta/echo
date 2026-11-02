/**
 * Coming ashore from a raft (DECISIONS C57): `POST /api/world/landing`.
 *
 * WHAT THE REQUEST SAYS, AND WHAT IS CHECKED. The browser says where the raft was launched (a parcel
 * and a point in its frame) and where it came ashore (likewise). The server checks:
 *
 * - that the landing is a shore, dry ground with water beside it (`onShore`), or the village's dock,
 *   which a raft comes alongside like any boat;
 * - that the point is in the parcel it is said to be in;
 * - that the launch is near enough to have been rowed from in a page.
 *
 * Then it says what the trip was. The travel stand's side comes from `tripVerdict`: far if ashore in
 * another parcel, near if back in the one launched from, nothing for a push off the beach.
 * `dest_occupants` is counted here: the people living in the parcel come ashore in, 0 for an empty
 * coast. That is the number ingest.py reads to tell a bare shore from a peopled one.
 *
 * WHAT IS KEPT. The landing, with the villagers who saw the raft come in (`landingWitnesses`), so
 * the village can say so: they at once, everyone the next day (`landings.ts`). Private to the
 * stranger, erased with them. A trip that was not a trip is kept nowhere.
 *
 * The echo is told by the browser, under consent, with this answer's numbers (⚑10: the parcel
 * world's cues are the client's to send).
 */
import { NextResponse } from "next/server";
import { getResolution, gridDistance } from "h3-js";
import {
  CROSSING,
  PLANET_PARAMS,
  cellAtLocal,
  createTangentPatch,
  landingWitnesses,
  onShore,
  present,
  sphereDistanceM,
  timeOfDay,
  tripVerdict,
  villageAt,
  worldClock,
  worldDayIndex,
  WORLD_EPOCH,
} from "@echo/planet";

import { planet } from "@/lib/planet";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
/** How many parcels apart a launch and a landing may be: a long day's sail, and no more. */
const MAX_RINGS = 12;
/** Metres a landing may be outside the parcel it names: the edge is a line on water, and frames round. */
const EDGE_SLACK_M = 2;
/** How near the dock's line a raft brought alongside it is, metres. */
const DOCK_M = 3;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const point = (v: unknown): { x: number; y: number } | null => {
  const p = v as { x?: unknown; y?: unknown } | undefined;
  return p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x, p.y) < 5000 ? { x: p.x, y: p.y } : null;
};

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { cell?: unknown; at?: unknown; from?: unknown; launchedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { cell, from } = body;
  if (typeof cell !== "string" || !CELL.test(cell) || getResolution(cell) !== PLANET_PARAMS.startResolution) return bad("bad_cell");
  if (typeof from !== "string" || !CELL.test(from) || getResolution(from) !== PLANET_PARAMS.startResolution) return bad("bad_from");
  const at = point(body.at);
  const launchedAt = point(body.launchedAt);
  if (!at || !launchedAt) return bad("bad_position");
  if (gridDistance(from, cell) > MAX_RINGS) return bad("too_far", 403);

  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }

  const { field, calibration, commons, world } = planet();
  const patch = createTangentPatch(cell, world.radiusKm);
  // In the parcel it names, give or take the width of a line on the water.
  if (cellAtLocal(patch, at.x, at.y) !== cell && !nearEdge(patch, at)) return bad("not_in_cell", 409);

  const clock = worldClock(WORLD_EPOCH);
  const now = Date.now();
  const day = worldDayIndex(clock, now);
  const hour = timeOfDay(clock, now);
  const store = villageStore();
  const changes = store ? ((await store.changesFor(cell)) ?? []) : [];
  const village = villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day, changes });
  const dock = village?.plan.dock ?? null;
  const alongside = dock !== null && toSegment(at, dock.root, dock.tip) <= DOCK_M;
  if (!alongside && !onShore(patch, field, calibration, at.x, at.y)) return bad("not_a_shore", 409);

  const launch = createTangentPatch(from, world.radiusKm);
  const distanceM = sphereDistanceM(world.radiusKm * 1000, launch.toDirection(launchedAt.x, launchedAt.y), patch.toDirection(at.x, at.y));
  const verdict = tripVerdict(from, cell, distanceM);
  if (verdict.side === null) return NextResponse.json({ side: null, rings: 0, distanceM: Math.round(distanceM), destOccupants: null, village: null, seenBy: [] });

  const s = village?.settlement ?? null;
  const destOccupants = s ? s.people.filter((p) => present(s, p, day)).length : 0;
  const witnesses = village ? landingWitnesses(village.settlement, village.plan, day, hour, at, changes) : [];
  const fromVillage = from === cell ? village : villageAt(world.seed, from, field, calibration, world.radiusKm, { commons: commons.cells, day });
  const recorded = store
    ? await store.addLanding(caller.subject, cell, { day, hour, fromCell: from, fromName: fromVillage?.settlement.name ?? null, side: verdict.side, rings: verdict.rings, witnesses })
    : null;
  const byId = new Map((s?.people ?? []).map((p) => [p.id, p.given]));
  return NextResponse.json({
    side: verdict.side,
    rings: verdict.rings,
    distanceM: Math.round(distanceM),
    destOccupants,
    village: s?.name ?? null,
    seenBy: witnesses.map((id) => byId.get(id)).filter(Boolean),
    recorded: recorded !== null,
  });
}

function toSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}

/** On the line between two parcels, within the slack: the request's frame and ours rounding differently. */
function nearEdge(patch: ReturnType<typeof createTangentPatch>, at: { x: number; y: number }): boolean {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (cellAtLocal(patch, at.x + Math.cos(a) * EDGE_SLACK_M, at.y + Math.sin(a) * EDGE_SLACK_M) === patch.cell) return true;
  }
  return false;
}

// The trip minimum is the stand's (crossing.ts); named here so a reader of the route finds it.
void CROSSING.tripM;
