/**
 * The director's route (DECISIONS C63), on Senstrand's real ground, with the engine's
 * `/select-situation` replaced by a recorder that answers as told.
 *
 * Run:  node --import tsx --test apps/web/tests/director.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import {
  DIRECTOR,
  SITUATIONS,
  ageYears,
  createTangentPatch,
  dayPlans,
  present,
  timeOfDay,
  verbsOf,
  villageAt,
  walkableAt,
  whereabouts,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
} from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { GET, POST } = await import("../src/app/api/world/director/route");
const { GET: MIRROR } = await import("../src/app/api/echo/mirror/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { planet } = await import("../src/lib/planet");
const { measurementFor } = await import("../src/lib/acts");

const CELL = "843f6a1ffffffff";
const SECRET = "director-secret-aa";
const SUBJECT = "d1d2d3d4-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const START = Math.round(CLOCK.epochMs + (DAY + 0.45) * WORLD_DAY_S * 1000);
let now = START;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, url: process.env.ML_SERVICE_URL, token: process.env.ML_SERVICE_TOKEN, fetch: globalThis.fetch, now: Date.now };

/** The engine, as each test tells it: what it prefers, and how many a day it still wants. */
let prefer: string[] = [];
let cap = 3;
let offered: string[][] = [];

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://ml.test/select-situation") {
      const body = JSON.parse(String(init!.body)) as { npcs: { id: string }[] };
      const ids = body.npcs.map((n) => n.id);
      offered.push(ids);
      const ranked = [...prefer.filter((p) => ids.includes(p)), ...ids.filter((i) => !prefer.includes(i))];
      return new Response(JSON.stringify({ selected: ranked[0] ?? null, cap, uncertainty01: cap / 3, ranking: ranked.map((c, i) => ({ candidate: c, info_gain: 0.3 - i * 0.05, p: 0.5 })) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://ml.test/persona/")) return new Response(JSON.stringify({ persona: { mu: new Array(8).fill(0), version: 0 }, var: new Array(8).fill(1) }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel], ["ML_SERVICE_URL", saved.url], ["ML_SERVICE_TOKEN", saved.token]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  now = START;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
  prefer = [];
  cap = 3;
  offered = [];
  resetMemoryStore();
});

const auth = (subject = SUBJECT) => ({ "content-type": "application/json", authorization: `Bearer ${signIdentity(subject, SECRET, now)}` });
const post = (body: unknown, subject?: string) => POST(new Request("https://echo.test/api/world/director", { method: "POST", headers: auth(subject), body: JSON.stringify(body) }));
type Shown = { id: string; situation: keyof typeof SITUATIONS; x: number; y: number; facing: number; ownerName: string | null };
const ask = async (at: { x: number; y: number }) => (await (await post({ op: "ask", cell: CELL, at })).json()) as { staging: Shown | null; reason?: string };

const village = () => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
};
const ground = () => {
  const { field, calibration, world } = planet();
  const patch = createTangentPatch(CELL, world.radiusKm);
  return { land: (x: number, y: number) => walkableAt(patch, field, calibration.seaLevel, x, y) };
};
/** Where the village is: the dock, at the water. */
const atDock = () => ({ ...village().plan.dock!.root });

test("C63: the engine picks from what this place allows, and it is set out near you, out of every villager's sight, at the water for a gull", async () => {
  prefer = ["netted_gull"];
  const at = atDock();
  const r = await ask(at);
  assert.ok(r.staging, JSON.stringify(r));
  assert.deepEqual(offered[0]!.sort(), ["carved_mark", "dark_cleft", "lost_pouch", "netted_gull"]);
  const s = r.staging!;
  assert.equal(s.situation, "netted_gull");
  const d = Math.hypot(s.x - at.x, s.y - at.y);
  assert.ok(d >= DIRECTOR.nearM[0] && d <= DIRECTOR.nearM[1], `${d} m`);
  const { land } = ground();
  assert.ok(land(s.x, s.y), "set out in the sea");
  assert.ok(!land(s.x + Math.cos(s.facing) * DIRECTOR.waterM, s.y + Math.sin(s.facing) * DIRECTOR.waterM), "a netted gull not at the water");
  // Nobody out of doors at this hour within sight of it.
  const v = village();
  const { plans, boats, moorings } = dayPlans(v.settlement, v.plan, DAY, []);
  const hour = timeOfDay(CLOCK, now);
  for (const p of plans) {
    const w = whereabouts(p, hour, boats, moorings);
    if (w.visible && w.boat === null) assert.ok(Math.hypot(w.x - s.x, w.y - s.y) > DIRECTOR.sightM, `${p.person} can see it`);
  }
  // Not told why, in advance.
  assert.equal("infoGain" in s || "asks" in s, false);
  // Asked again: the same one, still standing; and a reload finds it.
  assert.deepEqual((await ask(at)).staging, s);
  assert.deepEqual(((await (await GET(new Request(`https://echo.test/api/world/director?cell=${CELL}`, { headers: auth() }))).json()) as { staging: Shown }).staging, s);
  assert.equal(((await (await GET(new Request(`https://echo.test/api/world/director?cell=${CELL}`, { headers: auth("d9d9d9d9-1111-4222-8333-444455556667") }))).json()) as { staging: Shown | null }).staging, null, "set out for someone else too");
});

test("C63: a pouch is a villager's; taking from it fills the pack, and then the world waits before setting out another", async () => {
  prefer = ["lost_pouch"];
  const at = atDock();
  const s = (await ask(at)).staging!;
  assert.equal(s.situation, "lost_pouch");
  const v = village();
  assert.ok(v.settlement.people.some((p) => p.given === s.ownerName && present(v.settlement, p, DAY) && ageYears(p, DAY) >= 16), `${s.ownerName} is nobody here`);
  const near = { x: s.x + 1, y: s.y };
  assert.equal((await post({ op: "act", id: s.id, verb: "free", at: near })).status, 400, "a pouch freed like a gull");
  assert.equal((await post({ op: "act", id: s.id, verb: "take-all", at })).status, 403, "taken from thirty metres away");
  assert.equal((await post({ op: "act", id: "stg_not_mine", verb: "take-all", at: near })).status, 404);
  assert.equal((await post({ op: "act", id: s.id, verb: "take-all", at: near }, "d9d9d9d9-1111-4222-8333-444455556667")).status, 404, "someone else's taken");
  const res = await post({ op: "act", id: s.id, verb: "take-all", at: near });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { pack: Record<string, number> }).pack.knife, 1);
  assert.equal((await villageStore()!.packOf(SUBJECT))!.knife, 1);
  assert.equal((await post({ op: "act", id: s.id, verb: "take-all", at: near })).status, 409, "taken twice");
  assert.equal(((await (await GET(new Request(`https://echo.test/api/world/director?cell=${CELL}`, { headers: auth() }))).json()) as { staging: Shown | null }).staging, null, "a reload found the pouch it had emptied");
  const asked = offered.length;
  const told = ((await (await MIRROR(new Request("https://echo.test/api/echo/mirror", { headers: auth() }))).json()) as { setOut: { name: string; answer: string }[] }).setOut;
  assert.deepEqual([told[0]!.name, told[0]!.answer], [`${s.ownerName}'s pouch, dropped by the path`, "Take what is in it"]);
  assert.equal((await ask(at)).reason, "too_soon");
  assert.equal(offered.length, asked, "the engine asked when nothing could be set out anyway");
  now += DIRECTOR.gapMs + 1000;
  cap = 1;
  assert.equal((await ask(at)).reason, "enough_today", "more than the engine wanted");
  cap = 3;
  assert.ok((await ask(at)).staging, "nothing set out after the gap");
});

test("C63: walking past the gull is recorded once you are well away; walking past a pouch says nothing; without the engine nothing is set out", async () => {
  prefer = ["netted_gull"];
  const at = atDock();
  const gull = (await ask(at)).staging!;
  assert.equal((await post({ op: "pass", id: gull.id, at: { x: gull.x + 5, y: gull.y } })).status, 409, "passed while standing next to it");
  const away = { x: gull.x + DIRECTOR.goneM + 1, y: gull.y };
  const r = await post({ op: "pass", id: gull.id, at: away });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { resolved: string }).resolved, "passed");
  now += DIRECTOR.gapMs + 1000;
  prefer = ["lost_pouch"];
  const pouch = (await ask(at)).staging!;
  assert.equal((await post({ op: "pass", id: pouch.id, at: { x: pouch.x + 60, y: pouch.y } })).status, 409);
  // No engine: nothing set out, nothing stored.
  resetMemoryStore();
  delete process.env.ML_SERVICE_URL;
  const none = await ask(at);
  assert.deepEqual([none.staging, none.reason], [null, "no_engine"]);
  assert.deepEqual(await villageStore()!.stagingsOf(SUBJECT), []);
  assert.ok([401, 403].includes((await POST(new Request("https://echo.test/api/world/director", { method: "POST", body: JSON.stringify({ op: "ask", cell: CELL, at }) }))).status));
});

test("C63: the mirror tells what was set out and why, once it has been answered — never while it stands", async () => {
  prefer = ["netted_gull"];
  const at = atDock();
  const gull = (await ask(at)).staging!;
  const look = async () => ((await (await MIRROR(new Request("https://echo.test/api/echo/mirror", { headers: auth() }))).json()) as { setOut: { name: string; asks: string; answer: string }[] });
  assert.deepEqual((await look()).setOut, [], "told in advance");
  const freed = await post({ op: "act", id: gull.id, verb: "free", at: { x: gull.x + 1, y: gull.y } });
  assert.equal(freed.status, 200, await freed.clone().text());
  const told = (await look()).setOut;
  assert.equal(told.length, 1);
  assert.deepEqual([told[0]!.name, told[0]!.answer], [SITUATIONS.netted_gull.name, "Free the gull"]);
  assert.match(told[0]!.asks, /when nobody would know/);
});

test("C63: how much was taken rides with the act, and walking off half-way is the probe's own refusal", () => {
  const [, little, all] = verbsOf("lost-pouch");
  const thing = { ref: "staged:x", kind: "lost-pouch" as const };
  const done = measurementFor(little!, thing, { heldMs: 2100, decisionMs: 900, abandoned: false, distanceM: 1 }, 0);
  assert.deepEqual([done.action, done.opts.raw?.taken01, done.opts.contextOverride?.public_or_private], ["keep_cache", 0.25, "private"]);
  assert.equal(measurementFor(all!, thing, { heldMs: 2600, decisionMs: 900, abandoned: false, distanceM: 1 }, 2).opts.raw?.taken01, 1);
  const off = measurementFor(all!, thing, { heldMs: 800, decisionMs: 900, abandoned: true, distanceM: 1 }, 0);
  assert.equal(off.action, "abandon_take_cache");
  assert.equal(off.opts.raw?.taken01, undefined, "nothing taken, read as everything taken");
});
