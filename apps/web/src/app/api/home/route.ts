/**
 * A stranger's own house on their own land (DECISIONS C59): `GET /api/home?cell=` and `POST /api/home`.
 *
 * GET says whether the caller owns the parcel, what house stands on it (anyone may see a house on
 * the land it is on), and the caller's own look.
 *
 * POST changes the caller's house, and only on the parcel the registry says is theirs (`parcelOf`):
 *
 * - `stake`: mark out a house where you stand, facing the way you face, on a site `homes.ts`
 *   `siteProblem` allows. One house a stranger.
 * - `build`: the next stage, from the pack.
 * - `paint`: the door or the walls, with a dye from the pack.
 * - `dress`: your shirt, with a dye from the pack, inside your house.
 * - `place`: set down something from the pack inside, square or as it is (`placeSquare` /
 *   `placeLoose`, from where you stand and the way you face).
 * - `turn`, `lift`: turn a thing set down, or take it back up.
 *
 * Everything a request says about the world is checked against the world. Nothing here is a score:
 * the house is not worth anything, and what the room says about you is read by the browser for the
 * echo, under consent.
 */
import { NextResponse } from "next/server";
import {
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  DYES,
  HOME,
  PLACEABLE,
  add,
  createSceneHeight,
  createTangentPatch,
  fromHouse,
  insideHome,
  nextStage,
  placeLoose,
  placeSquare,
  regionBound,
  remove,
  siteProblem,
  spend,
  toHouse,
  turnPlaced,
  villageAt,
  walkableAt,
  worldClock,
  worldDayIndex,
  WORLD_EPOCH,
  type Home,
} from "@echo/planet";

import { planet } from "@/lib/planet";
import { rateLimit, rateLimitRejection } from "@/lib/rateLimit";
import { subjectOf, subjectRejection } from "@/lib/subject";
import { refuseBarred } from "@/lib/moderation";
import { villageStore } from "@/lib/villageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CELL = /^[0-9a-f]{15}$/;
/** How far from the house a stranger may work on it, paint its door or stand to place something, metres. */
const NEAR_M = 6;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Whether the caller owns this parcel, by the registry. */
async function owns(subject: string, cell: string): Promise<boolean> {
  const parcel = await planet().registry().parcelOf(subject);
  return parcel?.h3Index === cell;
}

export async function GET(req: Request) {
  const cell = new URL(req.url).searchParams.get("cell") ?? "";
  if (!CELL.test(cell)) return bad("bad_cell");
  const store = villageStore();
  const home = store ? ((await store.homeIn(cell)) ?? null) : null;
  const caller = subjectOf(req);
  if (!caller.ok) return NextResponse.json({ owner: false, home, look: null });
  return NextResponse.json({ owner: await owns(caller.subject, cell), home, look: store ? await store.lookOf(caller.subject) : null });
}

export async function POST(req: Request) {
  const caller = subjectOf(req);
  if (!caller.ok) {
    const { body: error, status } = subjectRejection(caller);
    return NextResponse.json(error, { status });
  }
  // A stranger barred by a moderator changes nothing in the shared world (C67).
  const barredNow = await refuseBarred(villageStore(), caller.subject);
  if (barredNow) return barredNow;
  let body: { op?: unknown; cell?: unknown; at?: unknown; facing?: unknown; part?: unknown; dye?: unknown; kind?: unknown; mode?: unknown; index?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("bad_request");
  }
  const { op, cell } = body;
  if (typeof cell !== "string" || !CELL.test(cell)) return bad("bad_cell");
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
  if (!(await owns(caller.subject, cell))) return bad("not_your_land", 403);
  const pack = await store.packOf(caller.subject);
  if (pack === null) return bad("pack_unavailable", 503);
  const found = await store.homeOf(caller.subject);
  if (found === undefined) return bad("unreadable", 503);
  const day = worldDayIndex(worldClock(WORLD_EPOCH), Date.now());
  const save = async (home: Home, nextPack = pack) => {
    if (!(await store.saveHome(caller.subject, home))) return bad("not_recorded", 503);
    if (nextPack !== pack) await store.setPack(caller.subject, nextPack);
    return NextResponse.json({ home, pack: nextPack });
  };

  if (op === "stake") {
    if (found) return bad("have_one", 409);
    if (!finite(body.facing)) return bad("bad_facing");
    const { field, calibration, commons, world } = planet();
    const patch = createTangentPatch(cell, world.radiusKm);
    const bound = regionBound(cell, 1, world.radiusKm);
    const height = createSceneHeight(patch, field, calibration, { heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM, resolution: DEFAULT_REGION_OPTIONS.resolution });
    const village = villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day, market: false });
    const problem = siteProblem(
      { cell, patch, standable: (x, y) => walkableAt(patch, field, calibration.seaLevel, x, y, bound), heightAt: height, plan: village?.plan ?? null },
      pos.x,
      pos.y,
      body.facing,
    );
    if (problem) return bad(problem, 409);
    return save({ cell, x: pos.x, y: pos.y, facing: body.facing, stage: 0, colours: {}, items: [], madeDay: day });
  }

  if (!found || found.cell !== cell) return bad("no_home", 404);
  const home = found;
  const near = Math.hypot(pos.x - home.x, pos.y - home.y) <= NEAR_M;
  const inside = insideHome(home, pos.x, pos.y);

  if (op === "build") {
    const stage = nextStage(home);
    if (!stage) return bad("built", 409);
    if (!near) return bad("too_far", 403);
    const next = spend(pack, stage);
    if (!next) return bad("short", 409);
    return save({ ...home, stage: home.stage + 1 }, next);
  }

  if (op === "paint" || op === "dress") {
    const dye = typeof body.dye === "string" && DYES[body.dye] ? body.dye : null;
    if (!dye) return bad("bad_dye");
    const next = remove(pack, dye);
    if (!next) return bad("not_carried", 409);
    if (op === "dress") {
      if (home.stage < 2 || !inside) return bad("not_at_home", 409);
      const look = { ...((await store.lookOf(caller.subject)) ?? {}), shirt: dye };
      if (!(await store.setLook(caller.subject, look))) return bad("not_recorded", 503);
      await store.setPack(caller.subject, next);
      return NextResponse.json({ home, pack: next, look });
    }
    const part = body.part === "door" || body.part === "walls" ? body.part : null;
    if (!part) return bad("bad_part");
    if ((part === "door" && home.stage < 4) || (part === "walls" && home.stage < 2)) return bad("not_built", 409);
    if (!near) return bad("too_far", 403);
    return save({ ...home, colours: { ...home.colours, [part]: dye } }, next);
  }

  if (op === "place") {
    const kind = typeof body.kind === "string" && PLACEABLE[body.kind] ? body.kind : null;
    if (!kind) return bad("bad_kind");
    if (home.stage < 2 || !inside) return bad("not_inside", 409);
    if (home.items.length >= HOME.maxItems) return bad("full", 409);
    if (!finite(body.facing)) return bad("bad_facing");
    const next = remove(pack, kind);
    if (!next) return bad("not_carried", 409);
    const where = toHouse(home, pos.x, pos.y);
    const stand = { u: where.u, v: where.v, turn: body.facing - home.facing };
    const placed = body.mode === "square" ? placeSquare(kind, stand) : placeLoose(kind, stand);
    return save({ ...home, items: [...home.items, placed] }, next);
  }

  if (op === "turn" || op === "lift") {
    const i = body.index;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= home.items.length) return bad("bad_index");
    const it = home.items[i]!;
    const p = fromHouse(home, it.u, it.v);
    if (Math.hypot(p.x - pos.x, p.y - pos.y) > 2.5) return bad("too_far", 403);
    if (op === "turn") return save({ ...home, items: home.items.map((x, k) => (k === i ? turnPlaced(x) : x)) });
    const next = add(pack, it.kind);
    if (!next) return bad("pack_full", 409);
    return save({ ...home, items: home.items.filter((_, k) => k !== i) }, next);
  }

  return bad("bad_op");
}
