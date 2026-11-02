/**
 * Inside a house (DECISIONS C54): the door that lets a body in, being asked in, and talking to
 * someone at home — the real routes, with the model stubbed.
 *
 * Run:  node --import tsx --test apps/web/tests/interiors.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { dayPlans, doorOf, homeState, residentsOn, roomToLocal, villageAt, whereabouts, worldClock, WORLD_DAY_S, WORLD_EPOCH, type Person, type SettledParcel } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";
delete process.env.VILLAGER_MODEL;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { blockedByHouse } = await import("../src/game/world/settlementLayer");
const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { whereNow } = await import("../src/lib/villager");

// ── the door ────────────────────────────────────────────────────────────────────

test("C54: a shut house is solid; an open one is floor inside and in its doorway, and wall everywhere else", () => {
  // A house at the origin facing east (+x), five deep and six wide, its doorway at z = 1 as drawn.
  const f = { x: 0, y: 0, heading: 0, halfAlong: 2.7, halfAcross: 3.2, house: { plot: 0, state: "lived" as const, floor: 0, door: 1, hearth: 2.2, depthM: 5, widthM: 6 } };
  const r = 0.35;
  assert.equal(blockedByHouse(f, false, 0, 0, r), true, "walked into a shut house");
  assert.equal(blockedByHouse(f, true, 0, 0, r), false, "an open house has no floor");
  // The drawing's +z is local -y (across is the other way round), so the doorway is at y = -1.
  assert.equal(blockedByHouse(f, true, 2.55, -1, r), false, "the doorway is a wall");
  assert.equal(blockedByHouse(f, true, 2.55, 1, r), true, "the front wall beside the doorway is not a wall");
  assert.equal(blockedByHouse(f, true, 0, 3.0, r), true, "the side wall is not a wall");
  assert.equal(blockedByHouse(f, true, -2.6, 0, r), true, "the back wall is not a wall");
  assert.equal(blockedByHouse(f, true, 6, 0, r), false, "the street is blocked");
  assert.equal(blockedByHouse({ ...f, house: { ...f.house, state: "ruin" as const } }, true, 0, 0, r), true, "a ruin's stumps let a body through");
});

// ── asked in, and at home ───────────────────────────────────────────────────────

const SECRET = "interior-secret-aaaa";
const SUBJECT = "cc96e0fc-1111-4222-8333-444455556667";
const CELL = "843f6a1ffffffff";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };
let replies: string[] = [];
let notes: string[] = [];
const said = (say: string, change: unknown = null) => JSON.stringify({ say, remember: "A stranger at the door.", change });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (body?.messages) notes.push((body.messages as Array<{ content: string }>).at(-1)!.content);
    const text = replies.shift() ?? said("Hello.");
    return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
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
  replies = [];
  notes = [];
  resetMemoryStore();
});

const village = (): SettledParcel => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
};
// Whole milliseconds, as the real clock gives: a token's issue time is written in base 36 and a fraction breaks it.
const at = (hour: number) => (Date.now = () => Math.round(CLOCK.epochMs + (DAY + hour) * WORLD_DAY_S * 1000));
const post = (h: (r: Request) => Promise<Response>, path: string, body: unknown) =>
  h(new Request(`https://echo.test${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(SUBJECT, SECRET, Date.now())}` }, body: JSON.stringify(body) }));
/** Where someone is at an hour, from one day plan for the whole village (whereNow builds it per call). */
const whereAll = (v: SettledParcel, hour: number) => {
  const { plans, boats, moorings } = dayPlans(v.settlement, v.plan, DAY);
  return (p: Person) => {
    const d = plans.find((x) => x.person === p.id);
    return d ? whereabouts(d, hour, boats, moorings) : null;
  };
};

test("C54: someone at their own door may ask the stranger in — and nothing is written for it", async () => {
  const v = village();
  const s = v.settlement;
  const hour = 0.45;
  at(hour);
  const homes = new Map(residentsOn(s, v.plan, DAY).map((r) => [r.person.id, r.plot]));
  const where = whereAll(v, hour);
  const host = s.people.find((p) => {
    const w = where(p);
    const plot = homes.get(p.id);
    return w && w.visible && plot && Math.hypot(w.x - doorOf(plot).x, w.y - doorOf(plot).y) < 10;
  });
  assert.ok(host, "nobody in Senstrand is at their own door mid-morning");
  const w = whereNow(s, v.plan, host, DAY, hour)!;
  const conv = ((await (await post(BEGIN, "/api/village/talk/begin", { cell: CELL, person: host.id, at: { x: w.x + 1.5, y: w.y } })).json()) as { conv: string }).conv;
  replies = [said("Come in, come in, out of the wind.", { kind: "invite" })];
  const res = (await (await post(TALK, "/api/village/talk", { cell: CELL, person: host.id, message: "What a fine house.", history: [], conv })).json()) as { invited?: string; decided?: string };
  assert.ok(notes[0].includes("ask the stranger into your house"), "asking in was not offered at their own door");
  assert.equal(res.invited, `house:${homes.get(host.id)!.index}`, JSON.stringify(res));
  assert.match(res.decided ?? "", /asks you in/);
  assert.equal(((await villageStore()!.changesFor(CELL)) ?? []).length, 0, "an invitation wrote a change");
});

test("C54: nobody asks you into a house they are not at", async () => {
  const v = village();
  const s = v.settlement;
  const hour = 0.45;
  at(hour);
  const homes = new Map(residentsOn(s, v.plan, DAY).map((r) => [r.person.id, r.plot]));
  const where = whereAll(v, hour);
  const far = s.people.find((p) => {
    const w = where(p);
    const plot = homes.get(p.id);
    return w && w.visible && w.boat === null && plot && Math.hypot(w.x - doorOf(plot).x, w.y - doorOf(plot).y) > 25;
  })!;
  assert.ok(far, "everyone in Senstrand is at their door mid-morning");
  const w = whereNow(s, v.plan, far, DAY, hour)!;
  const conv = ((await (await post(BEGIN, "/api/village/talk/begin", { cell: CELL, person: far.id, at: { x: w.x + 1.5, y: w.y } })).json()) as { conv: string }).conv;
  replies = [said("Come to my house.", { kind: "invite" })];
  const res = (await (await post(TALK, "/api/village/talk", { cell: CELL, person: far.id, message: "Hello.", history: [], conv })).json()) as { invited?: string };
  assert.ok(!notes[0].includes("ask the stranger into your house"), "asking in was offered away from home");
  assert.equal(res.invited, undefined, "asked in to a house they are nowhere near");
});

test("C54: someone at home and awake can be spoken to by a stranger in the house with them; asleep, nobody", async () => {
  const v = village();
  const s = v.settlement;
  const { plans } = dayPlans(s, v.plan, DAY);
  // Just in for the night: supper by the fire.
  let found: { p: Person; hour: number } | null = null;
  for (const { person, plot } of residentsOn(s, v.plan, DAY)) {
    const d = plans.find((x) => x.person === person.id);
    if (!d || (DAY - person.birthDay) / 365 < 16) continue;
    const bed = d.stays.at(-1)!;
    const hour = bed.t1 + 0.02;
    if (homeState(d, hour, doorOf(plot)) === "awake" && homeState(d, hour + 0.1, doorOf(plot)) === "asleep") {
      found = { p: person, hour };
      break;
    }
  }
  assert.ok(found, "nobody in Senstrand sits up by the fire before bed");
  const plot = residentsOn(s, v.plan, DAY).find((r) => r.person.id === found!.p.id)!.plot;
  const inside = roomToLocal(plot, 0, 0);
  at(found.hour);
  const ok = await post(BEGIN, "/api/village/talk/begin", { cell: CELL, person: found.p.id, at: inside });
  assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  const outside = await post(BEGIN, "/api/village/talk/begin", { cell: CELL, person: found.p.id, at: { x: inside.x + 30, y: inside.y } });
  assert.equal(((await outside.json()) as { error: string }).error, "not_out", "spoken to through the walls from the street");
  at(found.hour + 0.1);
  const asleep = await post(BEGIN, "/api/village/talk/begin", { cell: CELL, person: found.p.id, at: inside });
  assert.equal(((await asleep.json()) as { error: string }).error, "asleep");
});
