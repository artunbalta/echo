/**
 * A stranger's own house on their own land (DECISIONS C59): the home route driven as the real
 * handler, with the registry and the store in memory; what the echo is told; what a village says;
 * and the house's walls in the world.
 *
 * Run:  node --import tsx --test apps/web/tests/home.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import {
  DEFAULT_REGION_OPTIONS,
  DEFAULT_SCENE_OPTIONS,
  HOME,
  createSceneHeight,
  createTangentPatch,
  fromHouse,
  isLand,
  regionBound,
  siteProblem,
  villageAt,
  walkableAt,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
  type Home,
} from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";
delete process.env.VILLAGER_MODEL;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const route = await import("../src/app/api/home/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { homeMeasurement, arrangementMeasurement } = await import("../src/lib/homeMeasure");
const { whereNow } = await import("../src/lib/villager");

const SECRET = "home-secret-aaaa";
const OWNER = "e1f3e0fc-1111-4222-8333-444455556667";
const VISITOR = "e2f3e0fc-1111-4222-8333-444455556668";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const at = (day: number, hour = 0.45) => Math.round(CLOCK.epochMs + (day + hour) * WORLD_DAY_S * 1000);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

let calls: { url: string; body: Record<string, unknown> | null }[] = [];
const { field, calibration, commons, world, registry } = planet();
let cell = "";
let site = { x: 0, y: 0 };

before(async () => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => at(DAY);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: Record<string, unknown> | null = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    calls.push({ url, body });
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    return new Response(
      JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify({ say: "Good day.", remember: "A stranger.", change: null }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  // A parcel of the owner's own, by the registry, and a good site on it.
  const claimed = await registry().claim(OWNER, { displayName: "Home Owner" });
  assert.equal(claimed.status, "assigned");
  cell = claimed.parcel!.h3Index;
  const ground = groundOf(cell);
  let found: { x: number; y: number } | null = null;
  for (let r = 0; r < 900 && !found; r += 12) for (let k = 0; k < Math.max(1, Math.round(r / 6)) && !found; k++) {
    const a = (k / Math.max(1, Math.round(r / 6))) * Math.PI * 2;
    if (siteProblem(ground, Math.cos(a) * r, Math.sin(a) * r, 0) === null) found = { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }
  assert.ok(found, `no site for a house anywhere on ${cell}`);
  site = found!;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  Date.now = () => at(DAY);
  calls = [];
  resetMemoryStore();
});

function groundOf(c: string) {
  const patch = createTangentPatch(c, world.radiusKm);
  const bound = regionBound(c, 1, world.radiusKm);
  const height = createSceneHeight(patch, field, calibration, { heightScaleM: DEFAULT_SCENE_OPTIONS.heightScaleM, resolution: DEFAULT_REGION_OPTIONS.resolution });
  const village = villageAt(world.seed, c, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY, market: false });
  return { cell: c, patch, standable: (x: number, y: number) => walkableAt(patch, field, calibration.seaLevel, x, y, bound), heightAt: height, plan: village?.plan ?? null };
}
const token = (who: string) => signIdentity(who, SECRET, Date.now());
const post = async (body: Record<string, unknown>, who = OWNER) => {
  const res = await route.POST(new Request("https://echo.test/api/home", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token(who)}` }, body: JSON.stringify({ cell, ...body }) }));
  return { status: res.status, ...((await res.json()) as { home?: Home; pack?: Record<string, number>; look?: { shirt?: string }; error?: string }) };
};
const get = async (who: string | null, c = cell) => {
  const res = await route.GET(new Request(`https://echo.test/api/home?cell=${c}`, { headers: who ? { authorization: `Bearer ${token(who)}` } : {} }));
  return (await res.json()) as { owner: boolean; home: Home | null; look: { shirt?: string } | null };
};
const pack = (p: Record<string, number>) => villageStore()!.setPack(OWNER, p);

test("C59: the registry says whose land it is — the owner may build, and nobody else may, anywhere", async () => {
  assert.deepEqual([(await get(OWNER)).owner, (await get(VISITOR)).owner, (await get(null)).owner], [true, false, false]);
  assert.equal((await post({ op: "stake", at: site, facing: 0 }, VISITOR)).status, 403, "a house on somebody else's land");
  const elsewhere = await route.POST(new Request("https://echo.test/api/home", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token(OWNER)}` }, body: JSON.stringify({ cell: "843f6a1ffffffff", op: "stake", at: { x: 0, y: 0 }, facing: 0 }) }));
  assert.equal(elsewhere.status, 403, "the owner built on Senstrand");
});

test("C59: staked where you stand on good ground, once; not in the water", async () => {
  const ground = groundOf(cell);
  let wet: { x: number; y: number } | null = null;
  for (let r = 0; r < 1500 && !wet; r += 25) for (let k = 0; k < 12 && !wet; k++) {
    const p = { x: Math.cos((k / 12) * 6.283) * r, y: Math.sin((k / 12) * 6.283) * r };
    if (!isLand(field, calibration.seaLevel, ground.patch.toDirection(p.x, p.y)) && siteProblem(ground, p.x, p.y, 0) === "water") wet = p;
  }
  if (wet) assert.equal((await post({ op: "stake", at: wet, facing: 0 })).error, "water");
  const r = await post({ op: "stake", at: site, facing: 0.3 });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual([r.home!.stage, r.home!.x, r.home!.y, r.home!.facing], [0, site.x, site.y, 0.3]);
  assert.equal((await post({ op: "stake", at: site, facing: 0 })).error, "have_one");
  assert.equal((await get(VISITOR)).home!.stage, 0, "a visitor does not see the house on the land");
});

test("C59: four stages from what is carried — short is short, and the work is done where the house is", async () => {
  await post({ op: "stake", at: site, facing: 0 });
  await pack({ stone: 3 });
  assert.equal((await post({ op: "build", at: site })).error, "short");
  await pack({ stone: 4, shell: 1 });
  assert.equal((await post({ op: "build", at: { x: site.x + 40, y: site.y } })).error, "too_far");
  const one = await post({ op: "build", at: site });
  assert.deepEqual([one.home!.stage, one.pack], [1, { shell: 1 }]);
  await pack({ driftwood: 4, "dry branch": 2 });
  assert.equal((await post({ op: "build", at: site })).home!.stage, 2);
  await pack({ reed: 6 });
  assert.equal((await post({ op: "build", at: site })).home!.stage, 3);
  await pack({ driftwood: 2 });
  const done = await post({ op: "build", at: site });
  assert.equal(done.home!.stage, 4);
  await pack({ driftwood: 2 });
  assert.equal((await post({ op: "build", at: site })).error, "built");
});

const walls = async () => {
  await post({ op: "stake", at: site, facing: 0 });
  for (const p of [{ stone: 4 }, { driftwood: 4, "dry branch": 2 }] as Record<string, number>[]) {
    await pack(p);
    await post({ op: "build", at: site });
  }
};

test("C59: paint the walls with a dye from the pack, the door only once it is hung; dye your shirt inside", async () => {
  await walls();
  await pack({ berries: 2, herbs: 1 });
  const painted = await post({ op: "paint", part: "walls", dye: "berries", at: site });
  assert.deepEqual([painted.home!.colours.walls, painted.pack], ["berries", { berries: 1, herbs: 1 }]);
  assert.equal((await post({ op: "paint", part: "door", dye: "berries", at: site })).error, "not_built");
  assert.equal((await post({ op: "paint", part: "walls", dye: "ore", at: site })).error, "not_carried");
  const outside = fromHouse({ x: site.x, y: site.y, facing: 0 }, HOME.depthM / 2 + 2, 0);
  assert.equal((await post({ op: "dress", dye: "herbs", at: outside })).error, "not_at_home");
  const dressed = await post({ op: "dress", dye: "herbs", at: site });
  assert.equal(dressed.look!.shirt, "herbs");
  assert.equal((await get(OWNER)).look!.shirt, "herbs");
});

test("C59: set things down inside, square or as they are; turn one; take one back up", async () => {
  await walls();
  await pack({ table: 1, stool: 2 });
  const sq = await post({ op: "place", kind: "table", mode: "square", facing: 0.4, at: site });
  assert.equal(sq.home!.items.length, 1);
  assert.ok(Math.abs(sq.home!.items[0]!.turn) < 1e-9, "a table set down square is not square");
  const loose = await post({ op: "place", kind: "stool", mode: "loose", facing: 0.4, at: site });
  assert.ok(Math.abs(loose.home!.items[1]!.turn - 0.4) < 1e-9);
  const outside = fromHouse({ x: site.x, y: site.y, facing: 0 }, HOME.depthM / 2 + 2, 0);
  assert.equal((await post({ op: "place", kind: "stool", mode: "loose", facing: 0, at: outside })).error, "not_inside");
  assert.equal((await post({ op: "place", kind: "bed", mode: "loose", facing: 0, at: site })).error, "not_carried");
  const stoolAt = fromHouse({ x: site.x, y: site.y, facing: 0 }, loose.home!.items[1]!.u, loose.home!.items[1]!.v);
  const turned = await post({ op: "turn", index: 1, at: stoolAt });
  assert.ok(Math.abs(turned.home!.items[1]!.turn - (0.4 + Math.PI / 4)) < 1e-9);
  const lifted = await post({ op: "lift", index: 1, at: stoolAt });
  assert.deepEqual([lifted.home!.items.length, lifted.pack!.stool], [1, 2]);
  assert.equal((await post({ op: "lift", index: 0, at: { x: site.x + 30, y: site.y } })).error, "too_far");
});

test("C59: the echo hears building as time at a structure, customising as J1, and the room as J5 — orderly, as things fell, or nothing", () => {
  const b = homeMeasurement("build", 10_400);
  assert.deepEqual([b.action, b.opts.cue, b.opts.raw!.dwell_ms, b.opts.target!.id], ["build_home", "F6", 10400, "structure"]);
  assert.deepEqual([homeMeasurement("paint").action, homeMeasurement("paint").opts.cue], ["customize_home", "J1"]);
  assert.deepEqual([homeMeasurement("dress").action, homeMeasurement("dress").opts.target!.kind], ["customize_self", "self"]);
  const iu = HOME.depthM / 2 - HOME.wallM;
  const iv = HOME.widthM / 2 - HOME.wallM;
  const orderly = [
    { kind: "bed", u: -iu + 0.98, v: -iv + 0.46, turn: 0 },
    { kind: "bed", u: -iu + 0.98, v: iv - 0.46, turn: 0 },
    { kind: "table", u: 0, v: 0, turn: 0 },
  ];
  const tidy = arrangementMeasurement(orderly)!;
  assert.deepEqual([tidy.action, tidy.opts.polarity, tidy.opts.cue], ["stack_tidy", "take", "J5"]);
  const scattered = [
    { kind: "stool", u: 0.4, v: 0.3, turn: 0.7 },
    { kind: "pot", u: -0.6, v: -0.2, turn: 2.2 },
    { kind: "basket", u: 0.9, v: -0.5, turn: 1.1 },
  ];
  assert.equal(arrangementMeasurement(scattered)!.opts.polarity, "refuse");
  assert.equal(arrangementMeasurement([orderly[0]!]), null, "one thing read as an arrangement");
  // The browser's own room before it was squared: a table on the middle line, a stool square, a stool
  // left loose. 0.63: neither, and nothing is sent.
  const middling = [{ kind: "table", u: 1, v: 0, turn: 0 }, { kind: "stool", u: -0.5, v: 0.6, turn: 0 }, { kind: "stool", u: 0.1, v: -0.8, turn: 0 }];
  assert.equal(arrangementMeasurement(middling), null, "a room between orderly and organic read as one");
});

test("C59: a village knows a stranger has built on its land, and whether it is the one in front of them", async () => {
  // Senstrand's land is not the owner's: the house is put there directly, as a record, for the talk route to find.
  const SENSTRAND = "843f6a1ffffffff";
  await villageStore()!.saveHome(VISITOR, { cell: SENSTRAND, x: 120, y: -60, facing: 0, stage: 2, colours: {}, items: [], madeDay: DAY - 3 });
  const v = villageAt(world.seed, SENSTRAND, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  const me = v.settlement.people.find((p) => {
    const w = whereNow(v.settlement, v.plan, p, DAY, 0.45);
    return w && w.visible && w.boat === null && (DAY - p.birthDay) / 365 > 20;
  })!;
  const w = whereNow(v.settlement, v.plan, me, DAY, 0.45)!;
  const where = { x: w.x + 2, y: w.y };
  const ask = async (who: string) => {
    const begin = await BEGIN(new Request("https://echo.test/api/village/talk/begin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token(who)}` }, body: JSON.stringify({ cell: SENSTRAND, person: me.id, at: where }) }));
    const { conv } = (await begin.json()) as { conv: string };
    calls = [];
    await TALK(new Request("https://echo.test/api/village/talk", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token(who)}` }, body: JSON.stringify({ cell: SENSTRAND, person: me.id, message: "Hello.", conv, at: where }) }));
    const asked = calls.find((c) => c.url.includes("api.anthropic.com"))!;
    return (asked.body!.messages as Array<{ content: string }>).at(-1)!.content;
  };
  assert.match(await ask(VISITOR), /This stranger has the walls of a house up of their own on this land, .* metres [a-z-]+ of the green: the land is theirs/);
  assert.match(await ask(OWNER), /A stranger has the walls of a house up of their own on this land, .* — not the one in front of you/);
});

test("C59: in the world — the walls stop a body but the doorway does not, the roof lifts off inside, and only the owner is offered the house", async () => {
  const { homeLayer } = await import("../src/game/world/homeLayer");
  const { localMToTile, tileToLocalM, initialMover } = await import("../src/game/world/controller");
  const TILE = 1.6;
  const house: Home = { cell, x: 50, y: 20, facing: 0.5, stage: 4, colours: {}, items: [{ kind: "table", u: 0, v: 0, turn: 0 }], madeDay: DAY };
  let body = { x: 0, y: 0 };
  const ctx = {
    region: { cell, village: null },
    frame: {
      tileM: TILE,
      patch: createTangentPatch(cell, world.radiusKm),
      fromLocalM: (x: number, y: number) => localMToTile(x, y, TILE),
      toLocalM: (x: number, y: number) => tileToLocalM(x, y, TILE),
      heightAtTile: () => 3,
      walkableTile: () => true,
    },
    scene: { add() {} },
    layer: (name: string) =>
      name === "player"
        ? { position: () => ({ ...(([x, y]) => ({ x, y }))(localMToTile(body.x, body.y, TILE)), liftM: 0 }), mover: () => initialMover(0, 0), aboard: () => false, holding: () => false }
        : undefined,
  } as never;
  const layer = homeLayer();
  await layer.build(ctx, new AbortController().signal);
  layer.setHome({ home: house, owner: true });
  const tile = (u: number, v: number) => {
    const p = fromHouse(house, u, v);
    return localMToTile(p.x, p.y, TILE);
  };
  assert.equal(layer.blockedTile(...tile(-HOME.depthM / 2 + 0.05, 0), 0.35), true, "walked through the back wall");
  assert.equal(layer.blockedTile(...tile(HOME.depthM / 2 - 0.05, 0), 0.3), false, "the doorway is shut");
  assert.equal(layer.blockedTile(...tile(0, 0), 0.3), true, "walked through the table");
  assert.equal(layer.blockedTile(...tile(-1.5, 1.2), 0.3), false, "the floor is blocked");
  // Inside: the roof off, the house and the table to hand.
  body = fromHouse(house, -1.2, -1);
  layer.update!(0.5, ctx);
  assert.equal(layer.inside(), true);
  const kinds = layer.things(body.x, body.y).map((t) => t.kind).sort();
  assert.deepEqual(kinds, ["furnishing", "home"]);
  // A visitor is offered nothing of somebody else's house.
  layer.setHome({ home: house, owner: false });
  layer.update!(0.5, ctx);
  assert.deepEqual(layer.things(body.x, body.y), []);
  layer.dispose!();
});

test("C59: on land with no village — most of the planet — what is nobody's can still be gathered, and nothing else can be done", async () => {
  const { gridDisk } = await import("h3-js");
  const { POST: ACT } = await import("../src/app/api/world/act/route");
  const empty = gridDisk("84dcee5ffffffff", 2).find((c) => !villageAt(world.seed, c, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY, market: false }))!;
  const act = async (body: Record<string, unknown>) => {
    const res = await ACT(new Request("https://echo.test/api/world/act", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token(OWNER)}` }, body: JSON.stringify({ cell: empty, ...body }) }));
    return { status: res.status, ...((await res.json()) as { pack?: Record<string, number>; recorded?: boolean; error?: string }) };
  };
  await pack({});
  const got = await act({ thing: "driftwood@12.0,-4.0", kind: "driftwood", verb: "pick-up", at: { x: 12, y: -4 } });
  assert.equal(got.status, 200, JSON.stringify(got));
  assert.deepEqual(got.pack, { driftwood: 1 });
  assert.equal(got.recorded, true, "no mark left where the driftwood was");
  assert.equal((await act({ thing: "driftwood@90.0,-4.0", kind: "driftwood", verb: "pick-up", at: { x: 12, y: -4 } })).status, 403, "picked up from eighty metres off");
  assert.equal((await act({ thing: "house:0", kind: "house", verb: "knock", at: { x: 0, y: 0 } })).error, "no_village", "knocked at a house nobody built");
});
