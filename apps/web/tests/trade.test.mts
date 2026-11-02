/**
 * Trading with a villager, and labour for labour (DECISIONS C58): the trade route driven as the real
 * handler with the store in memory, the measurement, and what the village knows of its market.
 *
 * Senstrand trades with Dragcrachadit, 2.7 km off, for knives and pots; its market is every sixth day.
 *
 * Run:  node --import tsx --test apps/web/tests/trade.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import {
  ageYears,
  isMarketDay,
  needOf,
  occupationOn,
  present,
  sparesOf,
  timeOfDay,
  villageAt,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
  type Person,
  type SettledParcel,
} from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: TRADE } = await import("../src/app/api/village/trade/route");
const { POST: ACT } = await import("../src/app/api/world/act/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { villagerContext, whereNow } = await import("../src/lib/villager");
const { tradeMeasurement } = await import("../src/lib/barter");

const CELL = "843f6a1ffffffff";
const SECRET = "trade-secret-aaaa";
const SUBJECT = "c5d3e0fc-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const HOUR = 0.45;
const at = (day: number, hour = HOUR) => Math.round(CLOCK.epochMs + (day + hour) * WORLD_DAY_S * 1000);
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

let v!: SettledParcel;
const { field, calibration, commons, world } = planet();
const out = (p: Person, day: number, hour = HOUR) => {
  const w = whereNow(v.settlement, v.plan, p, day, timeOfDay(CLOCK, at(day, hour)));
  return w && w.visible && w.boat === null ? { x: w.x + 1, y: w.y } : null;
};
const villagerOut = (pred: (p: Person) => boolean, day = DAY, hour = HOUR) =>
  v.settlement.people.find((p) => present(v.settlement, p, day) && ageYears(p, day) >= 18 && ageYears(p, day) < 66 && pred(p) && out(p, day, hour) !== null);

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => at(DAY);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  assert.ok(v?.plan.market, "Senstrand has no market");
});
after(() => {
  for (const [k, val] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel]] as const) {
    if (val === undefined) delete process.env[k];
    else process.env[k] = val;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  Date.now = () => at(DAY);
  resetMemoryStore();
});

const token = () => signIdentity(SUBJECT, SECRET, Date.now());
const post = (handler: (r: Request) => Promise<Response>, path: string, body: unknown) =>
  handler(new Request(`https://echo.test${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token()}` }, body: JSON.stringify(body) }));
type Reply = { ok: boolean; why: string; gives?: string; words: string; pack: Record<string, number>; deed?: { verb: string; item?: string; got?: string; reading: string }; met?: unknown; changes?: unknown[]; spares?: string[] };
const trade = async (p: Person, offered: string | null, where = out(p, DAY)!) => {
  const res = await post(TRADE, "/api/village/trade", { cell: CELL, person: p.id, at: where, offered, asked: null });
  return { status: res.status, ...((await res.json()) as Reply) };
};
const familyOf = (p: Person) => {
  const h = (q: Person) => (q.partnerDay !== null && q.partnerDay <= DAY ? q.household : q.bornInto);
  return v.settlement.people.filter((q) => h(q) === h(p) && present(v.settlement, q, DAY)).map((q) => q.id);
};

test("C58: a farmer takes a basket and gives grain for it — one thing out of the pack and one in, and the deed says both", async () => {
  const farmer = villagerOut((p) => occupationOn(p, DAY) === "farmer")!;
  assert.ok(farmer, "no farmer out at mid-morning");
  await villageStore()!.setPack(SUBJECT, { basket: 1, shell: 2 });
  const r = await trade(farmer, "basket");
  assert.equal(r.status, 200, JSON.stringify(r));
  // Glad of it — or, for a farmer short of one this week, the very thing they needed.
  assert.ok(r.ok && (r.why === "glad" || r.why === "need"), r.why);
  assert.equal(r.gives, "a handful of grain");
  assert.deepEqual(r.pack, { shell: 2, "a handful of grain": 1 });
  assert.deepEqual(await villageStore()!.packOf(SUBJECT), r.pack);
  assert.deepEqual([r.deed!.verb, r.deed!.item, r.deed!.got, r.deed!.reading], ["trade", "basket", "a handful of grain", "respect"]);
  assert.match(r.words, r.why === "glad" ? /glad/ : /just what I was after/);
  // Once a day, you and I.
  await villageStore()!.setPack(SUBJECT, { basket: 1 });
  const again = await trade(farmer, "basket");
  assert.deepEqual([again.ok, again.why], [false, "busy"]);
  assert.deepEqual(await villageStore()!.packOf(SUBJECT), { basket: 1 }, "a refusal took something out of the pack");
});

test("C58: what is not carried cannot be offered; a villager across the green cannot be handed it; the act route does not trade", async () => {
  const farmer = villagerOut((p) => occupationOn(p, DAY) === "farmer")!;
  await villageStore()!.setPack(SUBJECT, { shell: 1 });
  const notCarried = await post(TRADE, "/api/village/trade", { cell: CELL, person: farmer.id, at: out(farmer, DAY), offered: "basket", asked: null });
  assert.equal(notCarried.status, 409);
  assert.equal(((await notCarried.json()) as { error: string }).error, "not_carried");
  const far = out(farmer, DAY)!;
  assert.equal((await trade(farmer, "shell", { x: far.x + 40, y: far.y })).status, 403);
  const act = await post(ACT, "/api/world/act", { cell: CELL, thing: `villager:${farmer.id}`, kind: "villager", verb: "trade", at: far });
  assert.equal(act.status, 400, "the act route recorded a trade with nothing traded");
  assert.equal(((await act.json()) as { error: string }).error, "use_trade_route");
  assert.equal((await villageStore()!.deedsFor(SUBJECT, CELL))!.length, 0);
});

test("C58: labour for labour — help to a household is asked back once, and then it is square", async () => {
  const farmer = villagerOut((p) => occupationOn(p, DAY) === "farmer")!;
  await villageStore()!.setPack(SUBJECT, {});
  const none = await trade(farmer, null);
  assert.deepEqual([none.ok, none.why], [false, "not-owed"]);
  await villageStore()!.addDeed(SUBJECT, CELL, { verb: "tend", kind: "field", thing: "field:0", thingName: "the field", reading: "help", weight: 2, day: DAY - 2, hour: 0.4, witnesses: [], owners: familyOf(farmer) });
  const back = await trade(farmer, null);
  assert.deepEqual([back.ok, back.why, back.gives], [true, "owed", "a handful of grain"]);
  assert.equal(back.deed!.verb, "ask-back");
  Date.now = () => at(DAY + 1);
  const twice = await trade(farmer, null, out(farmer, DAY + 1) ?? out(farmer, DAY)!);
  assert.equal(twice.why === "not-owed" || twice.status !== 200, true, `asked back twice for one day's help: ${JSON.stringify(twice)}`);
});

test("C58: the very thing someone needed, traded to them, is a need met — for the village, as a gift would be", async () => {
  const s = v.settlement;
  let who: Person | null = null;
  let item: string | null = null;
  for (const p of s.people) {
    if (!present(s, p, DAY) || ageYears(p, DAY) < 18 || out(p, DAY) === null) continue;
    const n = needOf(s, v.plan, p, DAY, [], []);
    if (n?.item && sparesOf(s, v.plan, p, DAY).length > 0 && !sparesOf(s, v.plan, p, DAY).includes(n.item)) {
      who = p;
      item = n.item;
      break;
    }
  }
  assert.ok(who && item, "nobody out this morning needs something they do not make");
  await villageStore()!.setPack(SUBJECT, { [item!]: 1 });
  const r = await trade(who!, item!);
  assert.deepEqual([r.ok, r.why], [true, "need"]);
  assert.ok(r.met && r.changes?.length === 1, "the need met was not recorded");
  assert.equal((await villageStore()!.changesFor(CELL))!.filter((c) => c.kind === "met").length, 1);
});

test("C58: a trader has the market's goods on market day, for a friend; before it, nothing — and says when the market is", async () => {
  const m = v.plan.market!;
  let market = DAY;
  while (!isMarketDay(m, market)) market++;
  Date.now = () => at(market);
  const trader = villagerOut((p) => m.goers.includes(p.id), market)!;
  assert.ok(trader, "no trader at the stall on market day");
  await villageStore()!.setPack(SUBJECT, { shell: 1 });
  const cold = await trade(trader, "shell", out(trader, market)!);
  assert.deepEqual([cold.ok, cold.why], [false, "no-use"]);
  await villageStore()!.addDeed(SUBJECT, CELL, { verb: "give", kind: "villager", thing: `villager:${trader.id}`, thingName: trader.given, reading: "kindness", weight: 2, day: market - 1, hour: 0.5, witnesses: [trader.id], owners: familyOf(trader), item: "berries" });
  const warm = await trade(trader, "shell", out(trader, market)!);
  assert.deepEqual([warm.ok, warm.why], [true, "friend"]);
  assert.ok(m.brings.includes(warm.gives!), `a trader gave ${warm.gives}, which did not come from ${m.partner.name}`);
  // Two days before the market, nothing to spare, and they say when.
  resetMemoryStore();
  Date.now = () => at(market - 2);
  const early = villagerOut((p) => m.goers.includes(p.id), market - 2);
  if (early) {
    await villageStore()!.setPack(SUBJECT, { shell: 1 });
    const r = await trade(early, "shell", out(early, market - 2)!);
    assert.equal(r.why, "spare");
    assert.match(r.words, new RegExp(`market in 2 days — I'll have .* from ${m.partner.name}`));
  }
});

test("C58: the echo hears barter (F9) and asking back (G12), unrouted, and pressing a villager who said no as bargain_hard", () => {
  const made = tradeMeasurement("trade", { ok: true }, false, 2, "abc");
  assert.deepEqual(made.map((m) => [m.action, m.opts.cue, m.opts.contextOverride!.public_or_private]), [["barter", "F9", "public"]]);
  assert.deepEqual(tradeMeasurement("ask-back", { ok: true }, false, 0).map((m) => [m.action, m.opts.cue]), [["ask_return", "G12"]]);
  assert.deepEqual(tradeMeasurement("trade", { ok: false }, false, 0), [], "a refusal told the echo something");
  assert.deepEqual(tradeMeasurement("trade", { ok: false }, true, 0).map((m) => [m.action, m.opts.cue]), [["bargain_hard", "F9"]]);
  assert.deepEqual(tradeMeasurement("trade", { ok: true }, true, 0).map((m) => m.action), ["bargain_hard", "barter"]);
});

test("C58: a villager knows what they can spare, that there is no money, and when market day is and who goes where", () => {
  const s = v.settlement;
  const m = v.plan.market!;
  const fisher = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) > 20 && occupationOn(p, DAY) === "fisher")!;
  const { facts, names } = villagerContext(s, v.plan, fisher, DAY, []);
  assert.match(facts, /What your work leaves you to spare, to trade or to give: a fish\. There is no money and nothing has a price/);
  assert.match(facts, new RegExp(`Every sixth day is market day in ${s.name}: .* go to ${m.partner.name} the day before`));
  assert.ok(names.has(m.partner.name));
  const goer = s.people.find((p) => m.goers.includes(p.id))!;
  assert.match(villagerContext(s, v.plan, goer, DAY, []).facts, new RegExp(`you are one of those who go for it: the day before, you set off for ${m.partner.name}`));
});

test("C58: the stall is up on market day with what the traders brought, and gone the day after the stock", async () => {
  const { marketLayer } = await import("../src/game/world/marketLayer");
  const { localMToTile } = await import("../src/game/world/controller");
  const m = v.plan.market!;
  let market = DAY;
  while (!isMarketDay(m, market)) market++;
  const added: unknown[] = [];
  const ctx = {
    region: { village: v },
    frame: { tileM: 1.6, fromLocalM: (x: number, y: number) => localMToTile(x, y, 1.6), heightAtTile: () => 2 },
    scene: { add: (o: unknown) => added.push(o) },
  } as never;
  const layer = marketLayer({ clock: CLOCK });
  Date.now = () => at(market);
  await layer.build(ctx, new AbortController().signal);
  assert.deepEqual(layer.shown(), { day: market, goods: m.brings });
  assert.equal(added.length, 1);
  Date.now = () => at(market + 1);
  layer.update!(1.1, ctx);
  assert.equal(layer.shown(), null, "the stall stood the day after market");
  layer.dispose!();
});

test("C58: a body cannot walk through the stall while it is up, and can when it is not", async () => {
  const { marketLayer } = await import("../src/game/world/marketLayer");
  const { localMToTile } = await import("../src/game/world/controller");
  const { stallOf } = await import("@echo/planet");
  const m = v.plan.market!;
  let market = DAY;
  while (!isMarketDay(m, market)) market++;
  const ctx = { region: { village: v }, frame: { tileM: 1.6, fromLocalM: (x: number, y: number) => localMToTile(x, y, 1.6), heightAtTile: () => 2 }, scene: { add() {} } } as never;
  const layer = marketLayer({ clock: CLOCK });
  Date.now = () => at(market);
  await layer.build(ctx, new AbortController().signal);
  const st = stallOf(v.plan);
  const tile = (dx: number, dy: number) => localMToTile(st.x + dx, st.y + dy, 1.6);
  assert.equal(layer.blockedTile(...tile(0, 0), 0.35), true, "walked through the table");
  const ahead = (d: number) => tile(Math.cos(st.heading) * d, Math.sin(st.heading) * d);
  assert.equal(layer.blockedTile(...ahead(1.5), 0.35), false, "the buyers' side is blocked");
  Date.now = () => at(market + 1);
  layer.update!(1.1, ctx);
  assert.equal(layer.blockedTile(...tile(0, 0), 0.35), false, "the stall stops you the day it is not there");
});
