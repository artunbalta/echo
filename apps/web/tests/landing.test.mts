/**
 * Coming ashore from a raft (DECISIONS C57): the landing route, driven as the real handler with the
 * store in memory, and what the village says of it afterwards.
 *
 * Drurnscree and Jerreef are neighbouring parcels with a village and a dock each, a kilometre apart
 * across one sea: found by sampling the planet for docked villages that share water.
 *
 * Run:  node --import tsx --test apps/web/tests/landing.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { gridDisk } from "h3-js";

import { signIdentity } from "@echo/shared/identity";
import {
  ageYears,
  cellAtLocal,
  createTangentPatch,
  isLand,
  landingWitnesses,
  onShore,
  present,
  timeOfDay,
  villageAt,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
  type SettledParcel,
} from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";
delete process.env.VILLAGER_MODEL;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: LAND } = await import("../src/app/api/world/landing/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { whereNow } = await import("../src/lib/villager");

const DRURNSCREE = "84dcee5ffffffff";
const JERREEF = "84dce33ffffffff";
const SECRET = "landing-secret-aaaa";
const SUBJECT = "a7c3e0fc-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const HOUR = 0.45;
const at = (day: number, hour = HOUR) => Math.round(CLOCK.epochMs + (day + hour) * WORLD_DAY_S * 1000);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

let calls: { url: string; body: Record<string, unknown> | null }[] = [];
let jerreef!: SettledParcel;
let drurnscree!: SettledParcel;
/** A beach below Jerreef's dock, in Jerreef's metres. */
let beach!: { x: number; y: number };
/** Where a raft is launched from Drurnscree's dock, in Drurnscree's metres. */
let launch!: { x: number; y: number };
/** A shore of an empty neighbouring parcel, in its own metres. */
let bare: { cell: string; at: { x: number; y: number } } | null = null;

const { field, calibration, commons, world } = planet();
const patchOf = (cell: string) => createTangentPatch(cell, world.radiusKm);
/** The nearest shore to a point, searching outward. */
function shoreNear(cell: string, p: { x: number; y: number }, maxM = 200): { x: number; y: number } | null {
  const patch = patchOf(cell);
  for (let r = 0; r <= maxM; r += 2) {
    for (let k = 0; k < Math.max(1, Math.round(r)); k++) {
      const a = (k / Math.max(1, Math.round(r))) * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (cellAtLocal(patch, q.x, q.y) === cell && onShore(patch, field, calibration, q.x, q.y)) return q;
    }
  }
  return null;
}

before(() => {
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
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ say: "You came off the water.", remember: "The one off the raft.", change: null }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  jerreef = villageAt(world.seed, JERREEF, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  drurnscree = villageAt(world.seed, DRURNSCREE, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  assert.ok(jerreef?.plan.dock && drurnscree?.plan.dock, "Jerreef or Drurnscree has no dock");
  beach = shoreNear(JERREEF, jerreef.plan.dock!.root)!;
  assert.ok(beach, "no beach below Jerreef's dock");
  launch = drurnscree.plan.dock!.tip;
  for (const c of gridDisk(DRURNSCREE, 1)) {
    if (c === DRURNSCREE || villageAt(world.seed, c, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })) continue;
    const p = shoreNear(c, { x: 0, y: 0 }, 700);
    if (p) {
      bare = { cell: c, at: p };
      break;
    }
  }
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

const token = () => signIdentity(SUBJECT, SECRET, Date.now());
const post = (handler: (r: Request) => Promise<Response>, path: string, body: unknown, bearer: string | null = token()) =>
  handler(new Request(`https://echo.test${path}`, { method: "POST", headers: bearer ? { "content-type": "application/json", authorization: `Bearer ${bearer}` } : { "content-type": "application/json" }, body: JSON.stringify(body) }));
const land = (body: unknown, bearer?: string | null) => post(LAND, "/api/world/landing", body, bearer);

test("C57: across the water from Drurnscree to Jerreef is far — a peopled shore, counted by the server, and seen", async () => {
  const res = await land({ cell: JERREEF, at: beach, from: DRURNSCREE, launchedAt: launch });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const a = (await res.json()) as { side: string; rings: number; distanceM: number; destOccupants: number; village: string; seenBy: string[]; recorded: boolean };
  assert.equal(a.side, "far");
  assert.equal(a.rings, 1);
  assert.ok(a.distanceM > 700 && a.distanceM < 1600, `${a.distanceM} m across`);
  assert.equal(a.destOccupants, jerreef.settlement.people.filter((p) => present(jerreef.settlement, p, DAY)).length, "dest_occupants is not the people living there");
  assert.ok(a.destOccupants > 0);
  assert.equal(a.village, jerreef.settlement.name);
  assert.equal(a.recorded, true);
  const [l] = (await villageStore()!.landingsIn(SUBJECT, JERREEF))!;
  assert.equal(l.fromCell, DRURNSCREE);
  assert.equal(l.fromName, drurnscree.settlement.name);
  assert.equal(l.side, "far");
  assert.deepEqual(l.witnesses, landingWitnesses(jerreef.settlement, jerreef.plan, DAY, timeOfDay(CLOCK, Date.now()), beach));
  assert.equal(a.seenBy.length, l.witnesses.length);
});

test("C57: an empty coast is far too, and there is nobody there — dest_occupants 0, the bare shore ingest.py reads as pure novelty", async () => {
  assert.ok(bare, "Drurnscree has no empty neighbouring parcel with a shore");
  const a = (await (await land({ cell: bare!.cell, at: bare!.at, from: DRURNSCREE, launchedAt: launch })).json()) as { side: string; destOccupants: number; village: string | null; seenBy: string[] };
  assert.equal(a.side, "far");
  assert.equal(a.destOccupants, 0);
  assert.equal(a.village, null);
  assert.deepEqual(a.seenBy, []);
});

test("C57: back ashore where you set out is near; a push off the beach is nothing, and nothing is kept", async () => {
  // Another beach of Jerreef's, along the shore from the first.
  const patch = patchOf(JERREEF);
  let other: { x: number; y: number } | null = null;
  for (let r = 60; r <= 400 && !other; r += 4) {
    for (let k = 0; k < 90 && !other; k++) {
      const q = { x: beach.x + Math.cos((k / 90) * 6.283) * r, y: beach.y + Math.sin((k / 90) * 6.283) * r };
      if (cellAtLocal(patch, q.x, q.y) === JERREEF && onShore(patch, field, calibration, q.x, q.y)) other = q;
    }
  }
  assert.ok(other, "no second beach in Jerreef");
  const near = (await (await land({ cell: JERREEF, at: other, from: JERREEF, launchedAt: beach })).json()) as { side: string; rings: number };
  assert.deepEqual([near.side, near.rings], ["near", 0]);
  const before = (await villageStore()!.landingsIn(SUBJECT, JERREEF))!.length;
  const push = (await (await land({ cell: JERREEF, at: beach, from: JERREEF, launchedAt: { x: beach.x + 6, y: beach.y + 6 } })).json()) as { side: string | null };
  assert.equal(push.side, null);
  assert.equal((await villageStore()!.landingsIn(SUBJECT, JERREEF))!.length, before, "a push off the beach was kept as a trip");
});

test("C57: a raft comes ashore on a shore of the parcel it names — not in the sea, not inland, not somewhere else", async () => {
  const patch = patchOf(JERREEF);
  let inland: { x: number; y: number } | null = null;
  let sea: { x: number; y: number } | null = null;
  for (let r = 50; r < 900 && (!inland || !sea); r += 10) {
    for (let k = 0; k < 16; k++) {
      const q = { x: Math.cos((k / 16) * 6.283) * r, y: Math.sin((k / 16) * 6.283) * r };
      if (cellAtLocal(patch, q.x, q.y) !== JERREEF) continue;
      const dry = isLand(field, calibration.seaLevel, patch.toDirection(q.x, q.y));
      if (!inland && dry && !onShore(patch, field, calibration, q.x, q.y)) inland = q;
      if (!sea && !dry && !onShore(patch, field, calibration, q.x, q.y)) sea = q;
    }
  }
  assert.ok(inland && sea);
  assert.equal((await land({ cell: JERREEF, at: inland, from: DRURNSCREE, launchedAt: launch })).status, 409, "dragged ashore far inland");
  assert.equal((await land({ cell: JERREEF, at: sea, from: DRURNSCREE, launchedAt: launch })).status, 409, "came ashore in the open sea");
  // Drurnscree's centre, in Jerreef's frame, is not in Jerreef.
  const elsewhere = patch.toLocal(patchOf(DRURNSCREE).toDirection(0, 0))!;
  const wrong = await land({ cell: JERREEF, at: { x: elsewhere[0], y: elsewhere[1] }, from: DRURNSCREE, launchedAt: launch });
  assert.equal(wrong.status, 409);
  assert.equal(((await wrong.json()) as { error: string }).error, "not_in_cell");
  assert.equal((await villageStore()!.landingsIn(SUBJECT, JERREEF))!.length, 0);
  // Alongside the dock is a landing, as for any boat, though the end of a dock is over the water.
  const tip = jerreef.plan.dock!.tip;
  assert.equal(isLand(field, calibration.seaLevel, patch.toDirection(tip.x, tip.y)), false, "the dock's end is on land");
  const docked = await land({ cell: JERREEF, at: { x: tip.x + 1, y: tip.y }, from: DRURNSCREE, launchedAt: launch });
  assert.equal(docked.status, 200, "a raft brought alongside the dock was not landed");
  assert.equal(((await docked.json()) as { side: string }).side, "far");
});

test("C57: who may say they landed — an identity, real cells, and a launch near enough to have been rowed from", async () => {
  assert.ok([401, 403].includes((await land({ cell: JERREEF, at: beach, from: DRURNSCREE, launchedAt: launch }, null)).status));
  assert.equal((await land({ cell: "not-a-cell", at: beach, from: DRURNSCREE, launchedAt: launch })).status, 400);
  assert.equal((await land({ cell: JERREEF, at: { x: "1", y: 2 }, from: DRURNSCREE, launchedAt: launch })).status, 400);
  const farAway = gridDisk(JERREEF, 14).find((c) => !gridDisk(JERREEF, 13).includes(c))!;
  assert.equal((await land({ cell: JERREEF, at: beach, from: farAway, launchedAt: { x: 0, y: 0 } })).status, 403, "a raft from fourteen parcels off in one page");
});

test("C57: the village knows — whoever saw the raft come in says so that day, and the rest have heard by the next", async () => {
  await land({ cell: JERREEF, at: beach, from: DRURNSCREE, launchedAt: launch });
  const [l] = (await villageStore()!.landingsIn(SUBJECT, JERREEF))!;
  // Someone grown and out of doors the next morning, who did not see it.
  Date.now = () => at(DAY + 1, 0.42);
  const hour = timeOfDay(CLOCK, Date.now());
  const s = jerreef.settlement;
  const me = s.people.find((p) => {
    if (!present(s, p, DAY + 1) || ageYears(p, DAY + 1) < 20 || l.witnesses.includes(p.id)) return false;
    const w = whereNow(s, jerreef.plan, p, DAY + 1, hour);
    return w !== null && w.visible && w.boat === null;
  });
  assert.ok(me, "nobody in Jerreef is out the next morning");
  const w = whereNow(s, jerreef.plan, me!, DAY + 1, hour)!;
  const where = { x: w.x + 2, y: w.y };
  const begun = await post(BEGIN, "/api/village/talk/begin", { cell: JERREEF, person: me!.id, at: where });
  assert.equal(begun.status, 200, JSON.stringify(await begun.clone().json()));
  const { conv } = (await begun.json()) as { conv: string };
  const res = await post(TALK, "/api/village/talk", { cell: JERREEF, person: me!.id, message: "Good morning.", conv, at: where });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const asked = calls.filter((c) => c.url.includes("api.anthropic.com")).at(-1)!;
  const note = (asked.body!.messages as Array<{ role: string; content: string }>).at(-1)!.content;
  assert.match(note, /Word went round that they came in out of the sea on a raft, from the direction of Drurnscree, yesterday/, note);
});
