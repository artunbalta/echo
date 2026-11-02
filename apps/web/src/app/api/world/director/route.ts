/**
 * The director (DECISIONS C63): `GET /api/world/director?cell=` and `POST /api/world/director`.
 *
 * GET gives back what is set out for the caller in this parcel, if anything still stands there, so a
 * reload finds the gull where it was.
 *
 * POST `{ op: "ask", cell, at }` is the page asking, now and then, whether the world should set
 * something out. In order, and the engine is asked only if the first two allow it:
 *
 * 1. Nothing of the caller's still stands, and the last was at least twenty minutes ago.
 * 2. The candidates are what this place allows (the gull needs a shore within reach).
 * 3. The engine picks (`/select-situation`, BALD over the situations' axis vectors) and says how many
 *    a day it still wants; fewer than that have been set out today.
 * 4. It is set out near the caller, out of every villager's sight where it must be
 *    (`director.ts` `stagingSpot`). Failing that, the engine's next choice, and so on.
 *
 * Without the engine (no ML, or a mock) nothing is set out: the director learns for the echo, and
 * with no echo listening there is nothing for it to do. Without consent the page never asks.
 *
 * POST `{ op: "act", id, verb, at }` answers one: the verb must be the thing's own and the caller
 * within reach of it; what it gives goes into the pack. POST `{ op: "pass", id, at }` records walking
 * past one whose passing is data (the gull, the mark), once the caller is well away from it.
 *
 * The page measures the answer (lib/acts.ts), consent permitting; this only keeps the world straight.
 *
 * THE PILOT VILLAGE (C75). For someone in a pilot visit, in the pilot's village, `ask` sets out the
 * pilot's six instead (`pilotAsk`): one at a time, in their own fixed order, half a minute after the last
 * was answered or gone, nearer than the world's, and with no engine asked. One left unmet four minutes is
 * gone ("unmet"), and the next comes. The world's own director never sets the six out, and the six never
 * hold it up. `act` takes what a verb spends out of the pack (the bread given, the raft lent) and
 * gives what the tide gave.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { DEMO, liveVisit } from "@/lib/demo";
import {
  SITUATIONS,
  WORLD_SITUATIONS,
  DIRECTOR,
  PILOT,
  add,
  available,
  ageYears,
  cellAtLocal,
  createTangentPatch,
  dayPlans,
  mayStage,
  present,
  pilotOrder,
  regionBound,
  remove,
  stagingSpot,
  standing,
  strangerName,
  tideCatch,
  verbsOf,
  walkableAt,
  whereabouts,
  type Ground,
  type Pack,
  type SituationId,
  type Staging,
} from "@echo/planet";

import { selectSituation } from "@/lib/ml";
import { addUpTo, isPilotSituation, livePilot, type PilotSession } from "@/lib/pilot";
import { planet } from "@/lib/planet";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage } from "@/lib/villageTalk";
import { villageStore, type VillageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** What the page is shown of a staging: where and what. Not why: that is told afterwards, in the mirror. */
const shown = (s: Staging) => ({ id: s.id, cell: s.cell, situation: s.situation, x: s.x, y: s.y, facing: s.facing, ownerName: s.ownerName });

/** How long one stands: the pilot's six four minutes, the world's two hours. */
const lifeOf = (s: Staging) => (isPilotSituation(s.situation) ? PILOT.lifeMs : DIRECTOR.lifeMs);
const stands = (s: Staging, now: number) => standing(s, now, lifeOf(s));

/** What the tide gave, as the fisher's beat says it. */
function tideBeat(verb: string, caught: number, kept: number): string {
  if (kept < caught) return "Your pack is too full to carry them all.";
  if (verb === "bet-safe") return "Two fish, still cold from the sea.";
  if (caught === 0) return "The tide goes out and stays out. Nothing.";
  if (caught === 1) return "Low water: one fish.";
  if (caught === 3) return "The tide comes in high: three fish.";
  return "The tide turns your way: four fish.";
}

function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** The ground of a parcel, and who in its village could see what, now. */
async function groundOf(cell: string, now: number): Promise<{ ground: Ground; owners: { id: string; given: string }[] }> {
  const { field, calibration, world } = planet();
  const patch = createTangentPatch(cell, world.radiusKm);
  const bound = regionBound(cell, 1, world.radiusKm);
  const loaded = await loadVillage(cell, now);
  const eyes: { x: number; y: number }[] = [];
  const owners: { id: string; given: string }[] = [];
  if (loaded) {
    const { settlement: s, plan } = loaded.village;
    const { plans, boats, moorings } = dayPlans(s, plan, loaded.day, loaded.changes);
    for (const d of plans) {
      const w = whereabouts(d, loaded.hour, boats, moorings);
      if (w.visible && w.boat === null) eyes.push({ x: w.x, y: w.y });
    }
    for (const p of s.people) if (present(s, p, loaded.day) && ageYears(p, loaded.day) >= 16) owners.push({ id: p.id, given: p.given });
  }
  return {
    owners,
    ground: {
      standable: (x, y) => walkableAt(patch, field, calibration.seaLevel, x, y, bound) && cellAtLocal(patch, x, y) === cell,
      sea: (x, y) => !walkableAt(patch, field, calibration.seaLevel, x, y),
      seen: (x, y) => eyes.some((e) => Math.hypot(e.x - x, e.y - y) <= DIRECTOR.sightM),
      plan: loaded?.village.plan ?? null,
    },
  };
}

export async function GET(req: Request) {
  const cell = new URL(req.url).searchParams.get("cell") ?? "";
  if (!CELL.test(cell)) return bad("bad_cell");
  const caller = subjectOf(req);
  if (!caller.ok) return NextResponse.json({ staging: null });
  const store = villageStore();
  const mine = store ? await store.stagingsOf(caller.subject) : null;
  const here = mine?.find((s) => s.cell === cell && stands(s, Date.now())) ?? null;
  return NextResponse.json({ staging: here ? shown(here) : null });
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  let body: { op?: unknown; cell?: unknown; at?: unknown; id?: unknown; verb?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const at = body.at as { x?: unknown; y?: unknown } | undefined;
  if (!at || !finite(at.x) || !finite(at.y) || Math.hypot(at.x, at.y) > 5000) return bad("bad_position");
  const pos = { x: at.x, y: at.y };
  const rate = await rateLimit(req, { bucket: "world", windowMs: 10 * 60 * 1000, max: 120, onUnavailable: "allow" });
  if (!rate.ok) {
    const { body: error, status } = rateLimitRejection(rate);
    return NextResponse.json(error, { status });
  }
  const store = villageStore();
  if (!store) return bad("no_store", 503);
  const mine = await store.stagingsOf(caller.subject);
  if (mine === null) return bad("unreadable", 503);
  const now = Date.now();

  if (body.op === "ask") {
    const cell = typeof body.cell === "string" && CELL.test(body.cell) ? body.cell : null;
    if (!cell) return bad("bad_cell");
    const pilot = await livePilot(store, caller.subject, cell, now);
    if (pilot) return pilotAsk(store, caller.subject, cell, pos, mine, pilot.session, now);
    // The world's director counts only its own: the pilot's six never hold it up (C75).
    const world = mine.filter((s) => !isPilotSituation(s.situation));
    const up = world.find((s) => stands(s, now));
    if (up) return NextResponse.json({ staging: up.cell === cell ? shown(up) : null, reason: "standing" });
    // A demo visitor in their five minutes is set things out at a demo's pace (C72); everyone else at the world's.
    const visit = await liveVisit(store, caller.subject, now);
    const gap = visit ? DEMO.directorGapMs : DIRECTOR.gapMs;
    const early = mayStage(world, Infinity, now, gap);
    if (early) return NextResponse.json({ staging: null, reason: early });

    const { ground, owners } = await groundOf(cell, now);
    const candidates = WORLD_SITUATIONS.filter((id) => available(SITUATIONS[id], pos, ground));
    if (!candidates.length) return NextResponse.json({ staging: null, reason: "nothing_fits" });
    const pick = await selectSituation({ userId: caller.subject, npcs: candidates.map((id) => ({ id, axes_vec: [...SITUATIONS[id].axes] })) });
    if (pick.mocked || !pick.selected) return NextResponse.json({ staging: null, reason: pick.mocked ? "no_engine" : "nothing_to_learn" });
    const full = mayStage(world, visit ? Math.max(pick.cap, DEMO.directorCap) : pick.cap, now, gap);
    if (full) return NextResponse.json({ staging: null, reason: full });

    const ranked = [pick.selected, ...(pick.ranking ?? []).map((r) => r.candidate)].filter(
      (id, i, all): id is SituationId => candidates.includes(id as SituationId) && all.indexOf(id) === i,
    );
    const gains = new Map((pick.ranking ?? []).map((r) => [r.candidate, r.info_gain]));
    const id = `stg_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    for (const situation of ranked) {
      const spot = stagingSpot(SITUATIONS[situation], pos, `${caller.subject}|${id}`, ground);
      if (!spot) continue;
      const owner = situation === "lost_pouch" && owners.length ? owners[Math.floor(unit(id) * owners.length)]! : null;
      const staging: Staging = {
        id,
        subject: caller.subject,
        cell,
        situation,
        ...spot,
        owner: owner?.id ?? null,
        ownerName: owner?.given ?? null,
        infoGain: gains.get(situation) ?? null,
        createdAt: new Date(now).toISOString(),
        resolved: null,
        resolvedAt: null,
      };
      if (!(await store.saveStaging(staging))) return bad("not_recorded", 503);
      return NextResponse.json({ staging: shown(staging) });
    }
    return NextResponse.json({ staging: null, reason: "nowhere_near" });
  }

  const s = typeof body.id === "string" ? mine.find((x) => x.id === body.id) : undefined;
  if (!s) return bad("not_yours", 404);
  if (!stands(s, now)) return bad("gone", 409);
  const sit = SITUATIONS[s.situation];
  const dist = Math.hypot(pos.x - s.x, pos.y - s.y);

  if (body.op === "act") {
    const verb = verbsOf(sit.kind).find((v) => v.id === body.verb);
    if (!verb) return bad("bad_verb");
    if (dist > verb.reachM + sit.sizeM + 1) return bad("too_far", 403);
    const tide = s.situation === "tide_fisher" ? tideCatch(s.id, verb.id) : null;
    let pack: Pack | null = null;
    let beat: string | null = null;
    if (verb.gives || verb.spends || tide !== null) {
      const held = await store.packOf(caller.subject);
      if (held === null) return bad("pack_unavailable", 503);
      pack = held;
    }
    // What it costs comes out of the pack first (C75): the bread given, the raft lent.
    if (verb.spends) {
      for (let i = 0; i < verb.spends.count; i++) {
        const next = remove(pack!, verb.spends.item);
        if (!next) return bad("not_carrying", 409);
        pack = next;
      }
    }
    if (tide !== null) {
      const got = addUpTo(pack!, "fish", tide);
      pack = got.pack;
      beat = tideBeat(verb.id, tide, got.added);
    }
    if (verb.gives) {
      pack = add(pack!, verb.gives);
      if (!pack) return bad("pack_full", 409);
    }
    const answered: Staging = { ...s, resolved: verb.id, resolvedAt: new Date(now).toISOString() };
    if (!(await store.saveStaging(answered))) return bad("not_recorded", 503);
    if (pack) await store.setPack(caller.subject, pack);
    return NextResponse.json({ staging: shown(answered), resolved: verb.id, ...(pack ? { pack } : {}), ...(beat ? { beat } : {}) });
  }

  if (body.op === "pass") {
    if (!sit.passed) return bad("passing_says_nothing", 409);
    if (dist < DIRECTOR.goneM * 0.8) return bad("not_past", 409);
    const answered: Staging = { ...s, resolved: "passed", resolvedAt: new Date(now).toISOString() };
    if (!(await store.saveStaging(answered))) return bad("not_recorded", 503);
    return NextResponse.json({ staging: shown(answered), resolved: "passed" });
  }

  return bad("bad_op");
}

/**
 * The pilot's six, for someone in a pilot visit in the pilot's village (C75): what stands, or, half a
 * minute after the last was answered or gone, the next in their own order that this place allows. The
 * bread and the raft must be in the pack for the two that ask for them; the two at the shore wait until
 * there is a shore near. No engine is asked: the order is the design, not a pick.
 */
async function pilotAsk(store: VillageStore, subject: string, cell: string, pos: { x: number; y: number }, mine: Staging[], session: PilotSession, now: number) {
  const since = Date.parse(session.startedAt);
  const visit = mine.filter((s) => s.cell === cell && isPilotSituation(s.situation) && Date.parse(s.createdAt) >= since);
  // One left unmet past its four minutes is gone, and says so.
  for (const s of visit) {
    if (s.resolved === null && !stands(s, now)) {
      s.resolved = "unmet";
      s.resolvedAt = new Date(now).toISOString();
      if (!(await store.saveStaging(s))) return bad("not_recorded", 503);
    }
  }
  const up = visit.find((s) => stands(s, now));
  if (up) return NextResponse.json({ staging: shown(up), reason: "standing" });
  const last = Math.max(since + PILOT.firstMs - PILOT.gapMs, ...visit.map((s) => Date.parse(s.resolvedAt ?? s.createdAt)));
  if (now - last < PILOT.gapMs) return NextResponse.json({ staging: null, reason: "too_soon" });
  const met = new Set(visit.map((s) => s.situation));
  const next = pilotOrder(subject, session.n).filter((id) => !met.has(id));
  if (!next.length) return NextResponse.json({ staging: null, reason: "all_met" });

  const pack = await store.packOf(subject);
  if (pack === null) return bad("pack_unavailable", 503);
  const { ground } = await groundOf(cell, now);
  const id = `stg_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  for (const situation of next) {
    const sit = SITUATIONS[situation];
    if (situation === "hungry_stranger" && (pack.bread ?? 0) < 1) continue;
    if (situation === "raft_borrower" && (pack.raft ?? 0) < 1) continue;
    const ring = sit.where === "shore" ? PILOT.shoreRing : PILOT.landRing;
    if (!available(sit, pos, ground, ring)) continue;
    const spot = stagingSpot(sit, pos, `${subject}|${id}`, ground, ring);
    if (!spot) continue;
    const staging: Staging = {
      id,
      subject,
      cell,
      situation,
      ...spot,
      owner: null,
      ownerName: sit.person ? strangerName(id) : null,
      infoGain: null,
      createdAt: new Date(now).toISOString(),
      resolved: null,
      resolvedAt: null,
    };
    if (!(await store.saveStaging(staging))) return bad("not_recorded", 503);
    return NextResponse.json({ staging: shown(staging) });
  }
  return NextResponse.json({ staging: null, reason: "nowhere_near" });
}
