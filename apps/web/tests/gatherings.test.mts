/**
 * Being at a burial, a wedding or a new child's door (DECISIONS C52): presence read from where the
 * stranger stands (`lib/gatherings.ts`), the route that records it, and what villagers know of the day.
 *
 * THE CLOCK IS FIXED to the middle of a gathering in Senstrand, found by reading the village's year.
 *
 * Run:  node --import tsx --test apps/web/tests/gatherings.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { gatheringsOn, villageAt, worldClock, WORLD_DAY_S, WORLD_EPOCH, type Gathering } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: ATTEND_ROUTE } = await import("../src/app/api/village/attend/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { ATTEND, attendanceLabel, attendStep, newAttendState, outerRing, realLengthMs, realWhen } = await import("../src/lib/gatherings");
const { nowLine, villagerContext } = await import("../src/lib/villager");

// ── presence, pure ──────────────────────────────────────────────────────────────

const fake = (kind: Gathering["kind"]): Gathering => ({
  id: `${kind}:aaaaaaaaaaaaaaaa`,
  kind,
  day: 100,
  t0: 0.58,
  t1: 0.68,
  at: { x: 0, y: 0 },
  about: ["aaaaaaaaaaaaaaaa"],
  centre: [],
  guests: ["b", "c"],
  family: ["b"],
  places: new Map([
    ["b", { at: { x: 1.5, y: 0 }, heading: Math.PI }],
    ["c", { at: { x: -2.3, y: 0 }, heading: 0 }],
  ]),
});

test("C52: standing in the rings for two-fifths of a gathering is being at it — once, and only while it holds", () => {
  const g = fake("funeral");
  const st = newAttendState();
  const step = realLengthMs(g) / 20;
  const inRing = { x: outerRing(g) + ATTEND.reachM - 0.5, y: 0 };
  assert.deepEqual(attendStep(st, [g], 0.5, inRing, realLengthMs(g)), [], "being there before it began counted");
  let joined = 0;
  for (let k = 0; k < 20; k++) {
    const events = attendStep(st, [g], 0.58 + (k / 20) * 0.1, inRing, step);
    joined += events.filter((e) => e.kind === "joined").length;
    if (k < 7) assert.equal(joined, 0, `joined after ${k + 1} of 20 steps`);
  }
  assert.equal(joined, 1);
  const far = newAttendState();
  for (let k = 0; k < 20; k++) assert.deepEqual(attendStep(far, [g], 0.6, { x: outerRing(g) + ATTEND.reachM + 1, y: 0 }, step), []);
});

test("C52: a wedding watched from across the green and never joined is G4's refusal; a burial watched is nothing", () => {
  for (const kind of ["wedding", "funeral"] as const) {
    const g = fake(kind);
    const st = newAttendState();
    const step = realLengthMs(g) / 10;
    const across = { x: 20, y: 0 };
    let events: ReturnType<typeof attendStep> = [];
    for (let k = 0; k < 10; k++) events = events.concat(attendStep(st, [g], 0.58 + k * 0.01, across, step));
    events = events.concat(attendStep(st, [g], 0.7, across, step), attendStep(st, [g], 0.72, across, step));
    if (kind === "wedding") {
      assert.equal(events.length, 1, "watching a wedding from apart was read twice, or not at all");
      assert.equal(events[0].kind, "stayed-apart");
      assert.deepEqual(attendanceLabel(events[0]), { action: "stays_solo", cue: "G4", channel: "G", polarity: "refuse" });
    } else assert.equal(events.length, 0, "a burial watched from apart was read as something");
  }
  assert.equal(attendanceLabel({ kind: "joined", gathering: fake("funeral"), dwellMs: 1, distanceM: 1 }).action, "mourns");
  assert.equal(attendanceLabel({ kind: "joined", gathering: fake("naming"), dwellMs: 1, distanceM: 1 }).action, "joins_group");
});

test("C52: the news says a world hour in real minutes", () => {
  assert.equal(realWhen(10, 0.5, 10, 0.5), "now");
  assert.equal(realWhen(10, 0.5, 13, 0.5), `in about ${Math.round((3 * WORLD_DAY_S) / 60)} minutes`);
});

// ── the route ───────────────────────────────────────────────────────────────────

const SECRET = "gathering-secret-aaaa";
const SUBJECT = "ab96e0fc-1111-4222-8333-444455556667";
const CELL = "843f6a1ffffffff"; // Senstrand: its burials
const WEDDING_CELL = "84aed1dffffffff"; // Kamgull: Senstrand has no wedding in these years
const CLOCK = worldClock(WORLD_EPOCH);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

/** Senstrand's first burial and Kamgull's first wedding from day 4900. */
const found: Partial<Record<Gathering["kind"], Gathering>> = (() => {
  const { field, calibration, commons, world } = planet();
  const out: Partial<Record<Gathering["kind"], Gathering>> = {};
  for (const [cell, kind] of [[CELL, "funeral"], [WEDDING_CELL, "wedding"]] as const) {
    for (let d = 4900; d < 4900 + 1200 && !out[kind]; d++) {
      const v = villageAt(world.seed, cell, field, calibration, world.radiusKm, { commons: commons.cells, day: d });
      if (!v) continue;
      out[kind] = gatheringsOn(v.settlement, v.plan, d).find((g) => g.kind === kind);
    }
  }
  return out;
})();
const at = (g: Gathering, hour: number) => CLOCK.epochMs + (g.day + hour) * WORLD_DAY_S * 1000;

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
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
beforeEach(() => resetMemoryStore());

const attend = (body: unknown, now: number) => {
  Date.now = () => now;
  return ATTEND_ROUTE(new Request("https://echo.test/api/village/attend", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(SUBJECT, SECRET, now)}` }, body: JSON.stringify(body) }));
};

test("C52: Senstrand has a burial and Kamgull a wedding in their next years", () => {
  assert.ok(found.funeral, "no burial in Senstrand in 1200 days");
  assert.ok(found.wedding, "no wedding in Kamgull in 1200 days");
});

test("C52: being at a burial is a deed the family has and everyone there saw — once", async () => {
  const g = found.funeral!;
  const mid = at(g, (g.t0 + g.t1) / 2);
  const res = await attend({ cell: CELL, gathering: g.id, at: g.at }, mid);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.deepEqual(await res.json(), { recorded: true, knew: false });
  const [d] = (await villageStore()!.deedsFor(SUBJECT, CELL))!;
  assert.equal(d.verb, "attend");
  assert.equal(d.thing, g.id);
  assert.equal(d.reading, "respect");
  assert.equal(d.weight, 2);
  assert.deepEqual(d.owners, g.family);
  assert.deepEqual([...d.witnesses].sort(), [...g.centre, ...g.guests].sort());
  const again = (await (await attend({ cell: CELL, gathering: g.id, at: g.at }, mid)).json()) as { recorded: boolean; already?: boolean };
  assert.equal(again.recorded, false);
  assert.equal(again.already, true);
  assert.equal((await villageStore()!.deedsFor(SUBJECT, CELL))!.length, 1, "one burial, two deeds");
});

test("C52: the claim is held to the day: the wrong hour, too far, or a gathering that is not, is refused", async () => {
  const g = found.wedding!;
  assert.equal((await attend({ cell: WEDDING_CELL, gathering: g.id, at: g.at }, at(g, 0.3))).status, 409, "a wedding attended in the morning");
  assert.equal((await attend({ cell: WEDDING_CELL, gathering: g.id, at: { x: g.at.x + 60, y: g.at.y } }, at(g, 0.63))).status, 403, "a wedding attended from across the village");
  assert.equal((await attend({ cell: WEDDING_CELL, gathering: "wedding:0000000000000000+1111111111111111", at: g.at }, at(g, 0.63))).status, 404);
  assert.equal((await attend({ cell: WEDDING_CELL, gathering: g.id, at: g.at }, at(g, 0.63 + 1))).status, 404, "yesterday's wedding attended today");
  assert.equal((await villageStore()!.deedsFor(SUBJECT, WEDDING_CELL))!.length, 0);
  const ok = (await (await attend({ cell: WEDDING_CELL, gathering: g.id, at: g.at }, at(g, 0.63))).json()) as { recorded: boolean };
  assert.equal(ok.recorded, true);
  const [d] = (await villageStore()!.deedsFor(SUBJECT, WEDDING_CELL))!;
  assert.deepEqual(d.owners, g.centre, "a wedding is the couple's");
  assert.equal(d.reading, "kindness");
});

test("C52: the route says whether the stranger knew them — had talked to them", async () => {
  const g = found.funeral!;
  await villageStore()!.remember(SUBJECT, CELL, g.about[0], { note: "A stranger who asked about the boats.", meetings: 2, firstDay: g.day - 30, lastDay: g.day - 5 });
  const res = (await (await attend({ cell: CELL, gathering: g.id, at: g.at }, at(g, 0.62))).json()) as { knew: boolean };
  assert.equal(res.knew, true);
});

// ── what villagers know of the day ──────────────────────────────────────────────

test("C52: on the day, a villager knows the burial is this afternoon, and at it says so", () => {
  const g = found.funeral!;
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: g.day })!;
  const s = v.settlement;
  const dead = s.people.find((p) => p.id === g.about[0])!;
  const mourner = s.people.find((p) => p.id === (g.family[0] ?? g.guests[0]))!;
  const facts = villagerContext(s, v.plan, mourner, g.day).facts;
  assert.match(facts, new RegExp(`${dead.given}.*(died yesterday|burial)`), `the mourner does not know of ${dead.given}'s burial:\n${facts.split("\n\n").find((l) => l.startsWith("In ")) ?? "(no news line)"}`);
  const line = nowLine(s, v.plan, mourner, g.day, (g.t0 + g.t1) / 2 + 0.01);
  assert.match(line, new RegExp(`standing at ${dead.given}'s grave with the mourners`), line);
  const notGoing = s.people.find((p) => !g.places.has(p.id) && p.deathDay > g.day && p.birthDay < g.day - 365 * 20 && p.leftDay > g.day);
  assert.ok(notGoing, "everyone grown in the village is at the burial; pick another fixture");
  assert.match(villagerContext(s, v.plan, notGoing, g.day).facts, /you are not going/);
});
