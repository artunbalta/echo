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
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SITUATIONS,
  SITUATION_IDS,
  DIRECTOR,
  add,
  available,
  ageYears,
  cellAtLocal,
  createTangentPatch,
  dayPlans,
  mayStage,
  present,
  regionBound,
  stagingSpot,
  standing,
  verbsOf,
  walkableAt,
  whereabouts,
  type Ground,
  type SituationId,
  type Staging,
} from "@echo/planet";

import { selectSituation } from "@/lib/ml";
import { planet } from "@/lib/planet";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { loadVillage } from "@/lib/villageTalk";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** What the page is shown of a staging: where and what. Not why: that is told afterwards, in the mirror. */
const shown = (s: Staging) => ({ id: s.id, cell: s.cell, situation: s.situation, x: s.x, y: s.y, facing: s.facing, ownerName: s.ownerName });

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
  const here = mine?.find((s) => s.cell === cell && standing(s, Date.now())) ?? null;
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
    const up = mine.find((s) => standing(s, now));
    if (up) return NextResponse.json({ staging: up.cell === cell ? shown(up) : null, reason: "standing" });
    const early = mayStage(mine, Infinity, now);
    if (early) return NextResponse.json({ staging: null, reason: early });

    const { ground, owners } = await groundOf(cell, now);
    const candidates = SITUATION_IDS.filter((id) => available(SITUATIONS[id], pos, ground));
    if (!candidates.length) return NextResponse.json({ staging: null, reason: "nothing_fits" });
    const pick = await selectSituation({ userId: caller.subject, npcs: candidates.map((id) => ({ id, axes_vec: [...SITUATIONS[id].axes] })) });
    if (pick.mocked || !pick.selected) return NextResponse.json({ staging: null, reason: pick.mocked ? "no_engine" : "nothing_to_learn" });
    const full = mayStage(mine, pick.cap, now);
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
  if (!standing(s, now)) return bad("gone", 409);
  const sit = SITUATIONS[s.situation];
  const dist = Math.hypot(pos.x - s.x, pos.y - s.y);

  if (body.op === "act") {
    const verb = verbsOf(sit.kind).find((v) => v.id === body.verb);
    if (!verb) return bad("bad_verb");
    if (dist > verb.reachM + sit.sizeM + 1) return bad("too_far", 403);
    let pack = null;
    if (verb.gives) {
      const held = await store.packOf(caller.subject);
      if (held === null) return bad("pack_unavailable", 503);
      pack = add(held, verb.gives);
      if (!pack) return bad("pack_full", 409);
    }
    const answered: Staging = { ...s, resolved: verb.id, resolvedAt: new Date(now).toISOString() };
    if (!(await store.saveStaging(answered))) return bad("not_recorded", 503);
    if (pack) await store.setPack(caller.subject, pack);
    return NextResponse.json({ staging: shown(answered), resolved: verb.id, ...(pack ? { pack } : {}) });
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
