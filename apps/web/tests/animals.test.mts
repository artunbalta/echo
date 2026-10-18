/**
 * Animals (DECISIONS C55): what an act on one is measured as, and the act route held to the animal
 * as the hour has it — the real handler, with the store in memory.
 *
 * Run:  node --import tsx --test apps/web/tests/animals.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { ANIMALS, animalAt, animalsOf, bondWith, verbOf, verbsOf, villageAt, worldClock, WORLD_DAY_S, WORLD_EPOCH, type Animal } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: ACT } = await import("../src/app/api/world/act/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { measurementFor, targetKindOf, verbsInHand } = await import("../src/lib/acts");

test("C55: a stroke is the catalogue's D11, with the bond in it; shooing it away is nothing; a dog is a pet", () => {
  const stroke = verbOf("dog", "stroke")!;
  const m = measurementFor(stroke, { ref: "animal:stray:0", kind: "dog" }, { heldMs: 3000, decisionMs: 200, abandoned: false, distanceM: 1, amount: 0.84 }, 0);
  assert.equal(m.action, "warm_to_pet");
  assert.equal(m.opts.cue, "D11");
  assert.equal(m.opts.raw!.amount, 0.84, "the bond is not the amount ingest.py reads into pet_attach");
  assert.equal(m.opts.target!.kind, "pet");
  const shoo = measurementFor(verbOf("dog", "shoo")!, { ref: "animal:stray:0", kind: "dog" }, { heldMs: 1000, decisionMs: 0, abandoned: false, distanceM: 1, amount: 0.9 }, 0);
  assert.equal(shoo.opts.raw!.amount, 0.05, "shooing a dog away said there was something in it");
  assert.equal(targetKindOf("dog"), "pet");
});

test("C55: food for an animal is food — a dog is not offered a stone", () => {
  const dog = verbsOf("dog");
  assert.ok(verbsInHand(dog, "berries").some((v) => v.id === "feed"));
  assert.ok(!verbsInHand(dog, "stone").some((v) => v.id === "feed"), "a stone held out to a dog to eat");
  assert.ok(verbsInHand(dog, null).some((v) => v.id === "stroke"));
});

// ── the act route ───────────────────────────────────────────────────────────────

const SECRET = "animal-secret-aaaa";
const SUBJECT = "dd96e0fc-1111-4222-8333-444455556667";
const CELL = "843f6a1ffffffff";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const HOUR = 0.45;
const at = (day: number) => Math.round(CLOCK.epochMs + (day + HOUR) * WORLD_DAY_S * 1000);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

let stray: Animal;
before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => at(DAY);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  stray = animalsOf(v.settlement, v.plan, DAY).find((a) => a.id.startsWith("stray:"))!;
  assert.ok(stray, "Senstrand has no stray");
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
  resetMemoryStore();
});

const act = (body: unknown) =>
  ACT(new Request("https://echo.test/api/world/act", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(SUBJECT, SECRET, Date.now())}` }, body: JSON.stringify(body) }));
const where = (day: number) => animalAt(stray, HOUR + (day - day));

test("C55: stroking the village's stray is a kindness to nobody's dog, recorded under its name", async () => {
  const p = where(DAY);
  const res = await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "dog", verb: "stroke", at: { x: p.x + 1, y: p.y } });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const [d] = (await villageStore()!.deedsFor(SUBJECT, CELL))!;
  assert.equal(d.thing, `animal:${stray.id}`);
  assert.equal(d.thingName, stray.name);
  assert.deepEqual(d.owners, [], "a stray belongs to somebody");
  const far = await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "dog", verb: "stroke", at: { x: p.x + 40, y: p.y } });
  assert.equal(far.status, 403, "stroked a dog forty metres off");
  assert.equal((await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "goat", verb: "chase", at: { x: p.x, y: p.y } })).status, 404, "a dog chased as a goat");
});

test("C55: a stone is not food, and is not taken from the pack for trying", async () => {
  await villageStore()!.setPack(SUBJECT, { stone: 1 });
  const p = where(DAY);
  const res = await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "dog", verb: "feed", at: p, item: "stone" });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { error: string }).error, "not_food");
  assert.deepEqual(await villageStore()!.packOf(SUBJECT), { stone: 1 }, "the stone went into the dog");
  await villageStore()!.setPack(SUBJECT, { berries: 1 });
  const fed = (await (await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "dog", verb: "feed", at: p, item: "berries" })).json()) as { pack: Record<string, number> };
  assert.deepEqual(fed.pack, {});
});

test("C55: kindness on two days and the dog is the stranger's friend — and then it is wherever they are", async () => {
  for (const day of [DAY, DAY + 1]) {
    Date.now = () => at(day);
    for (const verb of ["stroke", "play"]) {
      const p = where(day);
      const res = await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "dog", verb, at: p });
      assert.equal(res.status, 200, `${verb} on day ${day}: ${JSON.stringify(await res.clone().json())}`);
    }
  }
  const deeds = (await villageStore()!.deedsFor(SUBJECT, CELL))!;
  assert.ok(bondWith(deeds, stray.id, DAY + 1) >= ANIMALS.follows, `bond ${bondWith(deeds, stray.id, DAY + 1)}`);
  // At the stranger's heel, far from where its day would have it: still within reach.
  const p = where(DAY + 1);
  Date.now = () => at(DAY + 1);
  const res = await act({ cell: CELL, thing: `animal:${stray.id}`, kind: "dog", verb: "stroke", at: { x: p.x + 60, y: p.y } });
  assert.equal(res.status, 200, "a dog that follows the stranger cannot be stroked where it follows them to");
});
