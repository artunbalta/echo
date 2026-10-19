/**
 * Meeting a death on its way, through the act route (DECISIONS C66), in Senstrand after the switch.
 *
 * Run:  node --import tsx --test apps/web/tests/fates.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { MORTALITY, fateOf, healerFor, occupationOn, present, residentsOn, villageAt, villageThings, worldClock, WORLD_DAY_S, WORLD_EPOCH, type SettledParcel } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: ACT } = await import("../src/app/api/world/act/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { planet } = await import("../src/lib/planet");
const { villagerContext } = await import("../src/lib/villager");

const CELL = "843f6a1ffffffff";
const SECRET = "fates-secret-aaaa";
const SUBJECT = "f1f2f3f4-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const FROM = MORTALITY.fromDay;
const HORIZON = FROM + 365 * 8;
let now = 0;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };
const at = (day: number, hour: number) => Math.round(CLOCK.epochMs + (day + hour) * WORLD_DAY_S * 1000);

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
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

const village = (day: number): SettledParcel => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day })!;
};
const act = (body: Record<string, unknown>) =>
  ACT(new Request("https://echo.test/api/world/act", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(SUBJECT, SECRET, now)}` }, body: JSON.stringify({ cell: CELL, ...body }) }));

/** Someone in Senstrand who will lie ill after the switch, with a house to call at. */
function anIll() {
  const v = village(HORIZON);
  const s = v.settlement;
  for (const p of s.people) {
    if (p.deathCause !== "illness" || p.ailingFrom! <= FROM || !present(s, p, p.ailingFrom!)) continue;
    const plot = residentsOn(s, v.plan, p.ailingFrom!).find((r) => r.person.id === p.id)?.plot;
    if (plot) return { p, plot, day: p.ailingFrom! };
  }
  throw new Error("nobody in Senstrand lies ill in eight years");
}

test("C66: herbs left at the door of a house where someone lies ill become a change in their life, weighed by the risk model; at any other door, nothing", async () => {
  const { p, plot, day } = anIll();
  now = at(day, 0.5);
  const v = village(day);
  const door = villageThings(v.settlement, v.plan, day).find((t) => t.ref === `house:${plot.index}`)!;
  await villageStore()!.setPack(SUBJECT, { herbs: 2 });
  const res = await act({ thing: door.ref, kind: "house", verb: "leave-herbs", at: { x: door.x, y: door.y }, item: "herbs" });
  assert.equal(res.status, 200, await res.clone().text());
  const data = (await res.json()) as { changes?: { person: string; kind: string; by?: string; day: number }[]; pack?: Record<string, number> };
  assert.deepEqual(data.changes?.map((c) => [c.person, c.kind, c.by, c.day]), [[p.id, "tend", "herbs", day]]);
  assert.equal(data.pack?.herbs, 1, "the herbs never left the pack");
  const changes = (await villageStore()!.changesFor(CELL))!;
  assert.equal(changes.length, 1);
  // The village rebuilt with it: their death is exactly what the risk model says of herbs that day.
  const { field, calibration, commons, world } = planet();
  const after = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: HORIZON, changes })!;
  const expected = fateOf(p.seedKey, p.birthDay, (d) => occupationOn(p, d), Infinity, [{ kind: "tend", day, by: "herbs" }]);
  assert.equal(after.settlement.people.find((q) => q.id === p.id)!.deathDay, expected.deathDay);
  // The healer: fetched only where there is one.
  const healer = await act({ thing: door.ref, kind: "house", verb: "fetch-healer", at: { x: door.x, y: door.y } });
  assert.equal(healer.status, healerFor(v.settlement, day, p.id) ? 200 : 409);
  // A house where nobody lies ill.
  const well = villageThings(v.settlement, v.plan, day).find((t) => t.kind === "house" && !residentsOn(v.settlement, v.plan, day).some((r) => r.plot.index === Number(t.ref.slice(6)) && r.person.deathCause === "illness" && r.person.ailingFrom! <= day && r.person.deathDay > day))!;
  const none = await act({ thing: well.ref, kind: "house", verb: "leave-herbs", at: { x: well.x, y: well.y }, item: "herbs" });
  assert.equal(none.status, 409);
  assert.equal(((await none.json()) as { error: string }).error, "nothing_to_turn");
  // What the village says that day: they are ill, and keep to bed.
  const other = v.settlement.people.find((q) => q.id !== p.id && present(v.settlement, q, day) && q.birthDay < day - 365 * 20)!;
  assert.match(villagerContext(v.settlement, v.plan, other, day, [], () => null).facts, new RegExp(`${p.given} is ill, and keeps to bed`));
});

test("C66: a fisher set on going out under a wrong sky can be asked to stay ashore the evening before, or that dawn; not once the boat has gone", async () => {
  const v = village(HORIZON);
  const s = v.settlement;
  const lost = s.people.find((p) => p.deathCause === "sea" && p.seaDay! > FROM + 1 && present(s, p, p.seaDay!))!;
  assert.ok(lost, "no fisher lost at sea in Senstrand in eight years");
  const sea = lost.seaDay!;
  now = at(sea, 0.5);
  const late = await act({ thing: `villager:${lost.id}`, kind: "villager", verb: "ask-ashore", at: { x: 0, y: 0 } });
  assert.equal(late.status, 409, "asked once the boat had gone");
  now = at(sea - 1, 0.7);
  const res = await act({ thing: `villager:${lost.id}`, kind: "villager", verb: "ask-ashore", at: { x: 0, y: 0 } });
  assert.equal(res.status, 200, await res.clone().text());
  const data = (await res.json()) as { changes: { person: string; kind: string; day: number; madeDay: number }[] };
  assert.deepEqual(data.changes.map((c) => [c.person, c.kind, c.day, c.madeDay]), [[lost.id, "ashore", sea, sea - 1]]);
  const { field, calibration, commons, world } = planet();
  const kept = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: HORIZON, changes: (await villageStore()!.changesFor(CELL))! })!;
  assert.ok(kept.settlement.people.find((q) => q.id === lost.id)!.deathDay > lost.deathDay, "kept ashore, and lost anyway");
  // A fisher with no wrong sky ahead is asked nothing.
  const other = s.people.find((p) => p.id !== lost.id && p.occupation === "fisher" && present(s, p, sea - 1) && p.seaDay !== sea && p.seaDay !== sea - 1)!;
  assert.equal((await act({ thing: `villager:${other.id}`, kind: "villager", verb: "ask-ashore", at: { x: 0, y: 0 } })).status, 409);
});
