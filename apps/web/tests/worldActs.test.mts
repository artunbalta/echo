/**
 * Doing things to the world (DECISIONS C45): the behavioural event an act becomes, and the act route
 * driven as the REAL handler — the thing looked up in the village, the reach, who saw it, the deed and
 * the mark — and what a villager does with it afterwards: turns away, or speaks of it.
 *
 * THE CLOCK IS FIXED to mid-morning, as in villagerTalk.test.mts, so people are out to see things.
 *
 * Run:  node --import tsx --test apps/web/tests/worldActs.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import {
  ageYears,
  present,
  timeOfDay,
  verbOf,
  villageAt,
  villageThings,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
  type Thing,
} from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: ACT } = await import("../src/app/api/world/act/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { GET: CHANGES } = await import("../src/app/api/village/changes/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { measurementFor, targetKindOf, touchesTheWorld, verbsInHand } = await import("../src/lib/acts");
const { whereNow } = await import("../src/lib/villager");

// ── the event an act becomes ────────────────────────────────────────────────────

test("C45: an act is sent under its registry label, with the manner it was done in and who could see it", () => {
  const sit = verbOf("bench", "sit")!;
  const m = measurementFor(sit, { ref: "bench:2", kind: "bench" }, { heldMs: 9000, decisionMs: 1200, abandoned: false, distanceM: 0.8 }, 0);
  assert.equal(m.action, "sit_still");
  assert.equal(m.opts.polarity, "take");
  assert.equal(m.opts.raw!.still_ms, 9000, "sitting is its stillness");
  assert.equal(m.opts.raw!.decision_latency_ms, 1200);
  assert.deepEqual(m.opts.target, { id: "bench:2", kind: "structure" });
  assert.equal(m.opts.contextOverride!.public_or_private, "private");

  const tend = verbOf("field", "tend")!;
  const watched = measurementFor(tend, { ref: "field:0", kind: "field" }, { heldMs: 6000, decisionMs: 300, abandoned: false, distanceM: 1 }, 3);
  assert.equal(watched.action, "help_at_cost");
  assert.equal(watched.opts.contextOverride!.audience_size, 3);
  assert.equal(watched.opts.contextOverride!.public_or_private, "public");
  assert.equal(watched.opts.contextOverride!.counterpart_status, "stranger");
  assert.equal(watched.opts.raw!.thoroughness01, 1);
});

test("C45: walking away is measured too — as the act's refusal twin where ingest.py has one", () => {
  const tend = verbOf("field", "tend")!;
  const m = measurementFor(tend, { ref: "field:0", kind: "field" }, { heldMs: 2000, decisionMs: 0, abandoned: true, distanceM: 1 }, 0);
  assert.equal(m.action, "pass_by");
  assert.equal(m.opts.polarity, "refuse");
  assert.equal(m.opts.raw!.thoroughness01, 0.333);
  const force = verbOf("house", "force-door")!;
  assert.equal(measurementFor(force, { ref: "house:1", kind: "house" }, { heldMs: 1000, decisionMs: 0, abandoned: true, distanceM: 1 }, 0).action, "back_off_door");
  const climb = verbOf("boulder", "climb")!;
  const c = measurementFor(climb, { ref: "boulder@1.0,2.0", kind: "boulder" }, { heldMs: 500, decisionMs: 0, abandoned: true, distanceM: 1 }, 0);
  assert.equal(c.action, "climb_hill");
  assert.equal(c.opts.polarity, "refuse");
});

test("only what touches the world goes to the server; only what is in your hands can be given", () => {
  assert.equal(touchesTheWorld(verbOf("bench", "sit")!), false);
  assert.equal(touchesTheWorld(verbOf("field", "trample")!), true);
  assert.equal(touchesTheWorld(verbOf("shell", "pick-up")!), true, "a shell taken is gone for everyone");
  assert.equal(touchesTheWorld(verbOf("boat", "board")!), true);
  const house = [verbOf("house", "knock")!, verbOf("house", "give")!];
  assert.deepEqual(verbsInHand(house, null).map((v) => v.id), ["knock"]);
  assert.deepEqual(verbsInHand(house, "shell").map((v) => v.id), ["knock", "give"]);
  assert.equal(targetKindOf("villager"), "npc");
  assert.equal(targetKindOf("shell"), "resource");
});

// ── the act route ───────────────────────────────────────────────────────────────

const SECRET = "world-act-secret-aaaa";
const SUBJECT = "aa96e0fc-1111-4222-8333-444455556667";
const CELL = "843f6a1ffffffff"; // Senstrand
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const NOW = CLOCK.epochMs + (DAY + 0.42) * WORLD_DAY_S * 1000;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

let field: Thing;
let house: Thing;
let owner = "";

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => NOW;
  // The limiter's rpc answers; nothing else may leave the process.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  const { field: f, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, f, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  const things = villageThings(v.settlement, v.plan, DAY);
  field = things.find((t) => t.kind === "field" && t.owners.length > 0)!;
  house = things.find((t) => t.kind === "house" && t.owners.some((id) => {
    const p = v.settlement.people.find((q) => q.id === id)!;
    if (ageYears(p, DAY) < 20) return false;
    const w = whereNow(v.settlement, v.plan, p, DAY, timeOfDay(CLOCK, NOW));
    return w !== null && w.visible && w.boat === null;
  }))!;
  assert.ok(field && house, "Senstrand has no owned field or no house whose people are out");
  owner = house.owners.find((id) => {
    const p = v.settlement.people.find((q) => q.id === id)!;
    const w = whereNow(v.settlement, v.plan, p, DAY, timeOfDay(CLOCK, NOW));
    return ageYears(p, DAY) >= 20 && w !== null && w.visible && w.boat === null;
  })!;
  void present;
});

after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});

beforeEach(() => resetMemoryStore());

const token = () => signIdentity(SUBJECT, SECRET, Date.now());
const act = (body: unknown, bearer: string | null = token()) =>
  ACT(new Request("https://echo.test/api/world/act", { method: "POST", headers: bearer ? { "content-type": "application/json", authorization: `Bearer ${bearer}` } : { "content-type": "application/json" }, body: JSON.stringify(body) }));

test("C45: an unsigned act is refused, and an act from across the village is too far", async () => {
  assert.ok([401, 403].includes((await act({ cell: CELL, thing: field.ref, kind: "field", verb: "trample", at: { x: field.x, y: field.y } }, null)).status));
  const far = await act({ cell: CELL, thing: field.ref, kind: "field", verb: "trample", at: { x: field.x + 300, y: field.y } });
  assert.equal(far.status, 403);
  assert.equal(((await far.json()) as { error: string }).error, "too_far");
});

test("C45: the thing is the village's, not the request's — a wrong kind, an unknown ref or an unknown verb is refused", async () => {
  assert.equal((await act({ cell: CELL, thing: field.ref, kind: "house", verb: "knock", at: { x: field.x, y: field.y } })).status, 404);
  assert.equal((await act({ cell: CELL, thing: "field:999", kind: "field", verb: "trample", at: { x: field.x, y: field.y } })).status, 404);
  assert.equal((await act({ cell: CELL, thing: field.ref, kind: "field", verb: "set-on-fire", at: { x: field.x, y: field.y } })).status, 404);
  const nothing = (await (await act({ cell: CELL, thing: "bench:0", kind: "bench", verb: "sit", at: { x: 0, y: 0 } })).json()) as { recorded: boolean; reason: string };
  assert.deepEqual(nothing, { recorded: false, reason: "touches_nothing" });
});

test("C45: trampling a field marks it for everyone, records who it was done to, and is not marked twice", async () => {
  const res = await act({ cell: CELL, thing: field.ref, kind: "field", verb: "trample", at: { x: field.x, y: field.y } });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { recorded: boolean; effect: { kind: string; untilDay: number }; seenBy: string[] };
  assert.equal(data.recorded, true);
  assert.equal(data.effect.kind, "trampled");
  assert.equal(data.effect.untilDay, DAY + verbOf("field", "trample")!.effect!.lastsDays);
  await act({ cell: CELL, thing: field.ref, kind: "field", verb: "trample", at: { x: field.x, y: field.y } });
  const pub = (await (await CHANGES(new Request(`https://echo.test/api/village/changes?cell=${CELL}`))).json()) as { effects: { thing: string; subject?: string }[] };
  assert.equal(pub.effects.filter((e) => e.thing === field.ref).length, 1, "one field, two marks");
  assert.equal(pub.effects[0].subject, undefined, "the public marks name who made them");
  const deeds = (await villageStore()!.deedsFor(SUBJECT, CELL))!;
  assert.equal(deeds.length, 2);
  assert.deepEqual(deeds[0].owners, field.owners);
  assert.equal(deeds[0].reading, "harm");
});

test("C45: a household you wronged turns its back on you the next day — and help makes it good", async () => {
  // Forcing their door, while they are out: they find it the next morning.
  await act({ cell: CELL, thing: house.ref, kind: "house", verb: "force-door", at: { x: house.x, y: house.y } });
  const deeds = (await villageStore()!.deedsFor(SUBJECT, CELL))!;
  assert.ok(deeds[0].owners.includes(owner));
  // A day later on the world clock: the owner, out of doors, will not begin a conversation.
  const later = NOW + WORLD_DAY_S * 1000;
  Date.now = () => later;
  try {
    const { field: f, calibration, commons, world } = planet();
    const v = villageAt(world.seed, CELL, f, calibration, world.radiusKm, { commons: commons.cells, day: DAY + 1 })!;
    const me = v.settlement.people.find((p) => p.id === owner)!;
    const w = whereNow(v.settlement, v.plan, me, DAY + 1, timeOfDay(CLOCK, later));
    assert.ok(w && w.visible && w.boat === null, "the owner is not out of doors at this hour tomorrow; pick another fixture");
    const bearer = signIdentity(SUBJECT, SECRET, later);
    const res = await BEGIN(new Request("https://echo.test/api/village/talk/begin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` }, body: JSON.stringify({ cell: CELL, person: owner, at: { x: w.x + 2, y: w.y } }) }));
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: string }).error, "turns_away");
    // Amends: help the household — weed their field, if it is theirs; else tidy nothing, just record help.
    await villageStore()!.addDeed(SUBJECT, CELL, { ...deeds[0], verb: "tend", reading: "help", weight: 2, day: DAY + 1, witnesses: [owner] });
    const again = await BEGIN(new Request("https://echo.test/api/village/talk/begin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` }, body: JSON.stringify({ cell: CELL, person: owner, at: { x: w.x + 2, y: w.y } }) }));
    assert.equal(again.status, 200, "help did not make good");
  } finally {
    Date.now = () => NOW;
  }
});

test("C45: wrongs are bounded — a stranger who has done enough harm in a village today is refused more", async () => {
  for (let i = 0; i < 6; i++) await act({ cell: CELL, thing: field.ref, kind: "field", verb: "trample", at: { x: field.x, y: field.y } });
  const res = await act({ cell: CELL, thing: field.ref, kind: "field", verb: "trample", at: { x: field.x, y: field.y } });
  assert.equal(res.status, 429);
});
