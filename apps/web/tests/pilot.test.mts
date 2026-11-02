/**
 * The pilot village (DECISIONS C75): off unless switched on; joining (a yes, the code, a name nobody has,
 * the eight axes, the six answers); two visits a day apart, each starting with three loaves and a raft;
 * the pilot's six set out one at a time in a person's own order, with no engine asked; the world's own
 * stakes (bread and a raft out of the pack, the tide's catch, a raft brought back or not, a crop a day
 * later); friends rating friends; the owner's export; and the erasure.
 *
 * Run:  node --import tsx --test apps/web/tests/pilot.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { signIdentity } from "@echo/shared/identity";
import {
  PILOT,
  PILOT_SITUATIONS,
  SITUATIONS,
  loanComesBack,
  pilotOrder,
  tideCatch,
  verbsOf,
  villageAt,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
  type SituationId,
  type Staging,
} from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { GET: PILOT_GET, POST: PILOT_POST } = await import("../src/app/api/pilot/route");
const { POST: DIRECTOR_POST } = await import("../src/app/api/world/director/route");
const { pilotConfig, validStated } = await import("../src/lib/pilot");
const { measurementFor } = await import("../src/lib/acts");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { planet } = await import("../src/lib/planet");
const { BEATS_TR_FOR_TEST, VERBS_TR_FOR_TEST } = await import("../src/lib/i18n");

const CELL = "843f6a1ffffffff";
const SECRET = "pilot-secret-aaaaaaa";
const ADMIN = "pilot-admin-token-123";
const CODE = "Senstrand7";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const T0 = Math.round(CLOCK.epochMs + (DAY + 0.45) * WORLD_DAY_S * 1000);
const HOUR = 60 * 60 * 1000;
let now = T0;
const saved = { env: { ...process.env }, fetch: globalThis.fetch, now: Date.now };

/** What the engine was asked to pick among, if anything. */
let offered: string[][] = [];

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return json(1);
    if (url.startsWith("https://stub.supabase.test")) return json([]);
    if (url === "https://ml.test/select-situation") {
      const ids = (JSON.parse(String(init!.body)) as { npcs: { id: string }[] }).npcs.map((n) => n.id);
      offered.push(ids);
      return json({ selected: ids[0] ?? null, cap: 3, uncertainty01: 1, ranking: ids.map((c, i) => ({ candidate: c, info_gain: 0.3 - i * 0.05, p: 0.5 })) });
    }
    if (url.startsWith("https://ml.test/persona/")) return json({ persona: { mu: new Array(8).fill(0), version: 3 }, var: new Array(8).fill(1) });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  process.env = saved.env;
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  resetMemoryStore();
  now = T0;
  offered = [];
  process.env.ECHO_PILOT = "1";
  process.env.ECHO_PILOT_CODE = CODE;
  process.env.ECHO_PILOT_ADMIN = ADMIN;
  delete process.env.ECHO_PILOT_CELL;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
});

const subject = (n: number) => `p${String(n).padStart(7, "0")}-1111-4222-8333-444455556667`;
const A = subject(1);
const B = subject(2);
const auth = (who: string, extra: Record<string, string> = {}) => ({ "content-type": "application/json", authorization: `Bearer ${signIdentity(who, SECRET, now)}`, ...extra });
const pilot = (who: string, op: string, body: unknown = {}) => PILOT_POST(new Request(`https://echo.test/api/pilot?op=${op}`, { method: "POST", headers: auth(who), body: JSON.stringify(body) }));
const look = async (who: string) => (await (await PILOT_GET(new Request("https://echo.test/api/pilot", { headers: auth(who) }))).json()) as Record<string, unknown> & { me: null | Record<string, unknown>; group: { nickname: string; rated: boolean }[]; notices?: { key: string; vars: Record<string, string | number> }[]; pack?: Record<string, number> };
const director = (who: string, body: unknown) => DIRECTOR_POST(new Request("https://echo.test/api/world/director", { method: "POST", headers: auth(who), body: JSON.stringify(body) }));

const STATED = { give: 2, lend: true, bet: "bet-even", seed: "plant", path: "unmarked", greet: false };
const SELF = [4, 6, 5, 6, 3, 2, 5, 5];
const join = async (who: string, nickname: string) => {
  const res = await pilot(who, "join", { code: CODE, nickname, consent: true, self: SELF, stated: STATED });
  assert.equal(res.status, 200, await res.clone().text());
};
const village = () => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
};
const atDock = () => ({ ...village().plan.dock!.root });
/** A staging of one of the six, standing, set down in the store as the director would. */
const setOut = async (who: string, situation: SituationId, id: string, at = { x: 0, y: 0 }): Promise<Staging> => {
  const s: Staging = { id, subject: who, cell: CELL, situation, x: at.x, y: at.y, facing: 0, owner: null, ownerName: "Mira", infoGain: null, createdAt: new Date(now).toISOString(), resolved: null, resolvedAt: null };
  assert.ok(await villageStore()!.saveStaging(s));
  return s;
};
const act = async (who: string, s: Staging, verb: string) => director(who, { op: "act", id: s.id, verb, at: { x: s.x + 1, y: s.y } });
const pack = async (who: string) => (await villageStore()!.packOf(who))!;

test("C75: off unless switched on, with a code at least four long", async () => {
  delete process.env.ECHO_PILOT;
  assert.equal(pilotConfig(), null);
  assert.equal((await PILOT_GET(new Request("https://echo.test/api/pilot"))).status, 404);
  assert.equal((await pilot(A, "join", {})).status, 404);
  process.env.ECHO_PILOT = "1";
  process.env.ECHO_PILOT_CODE = "abc";
  assert.equal(pilotConfig(), null, "on with a code anyone could guess");
  process.env.ECHO_PILOT_CODE = CODE;
  assert.deepEqual(pilotConfig(), { cell: CELL, code: CODE });
  const page = readFileSync(new URL("../src/app/pilot/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!cfg\) notFound\(\)/);
});

test("C75: joining takes a yes, the group's code, a name nobody else has, the eight axes and the six answers, once", async () => {
  const body = { code: CODE, nickname: "Deniz", consent: true, self: SELF, stated: STATED };
  assert.equal((await pilot(A, "join", { ...body, consent: false })).status, 403, "joined without a yes");
  assert.equal((await pilot(A, "join", { ...body, code: "wrong" })).status, 403);
  assert.equal((await pilot(A, "join", { ...body, self: [4, 6, 5, 6, 3, 2, 5] })).status, 400, "seven axes");
  assert.equal((await pilot(A, "join", { ...body, self: [4, 6, 5, 6, 3, 2, 5, 8] })).status, 400, "an eight on a seven-point scale");
  assert.equal((await pilot(A, "join", { ...body, stated: { ...STATED, bet: "all-in" } })).status, 400);
  assert.equal((await pilot(A, "join", { ...body, nickname: "   " })).status, 400);
  assert.equal((await pilot(A, "join", { ...body, code: ` ${CODE.toLowerCase()} ` })).status, 200, "the code's case and spaces do not matter");
  assert.equal((await pilot(A, "join", body)).status, 409, "joined twice");
  assert.equal((await pilot(B, "join", { ...body, nickname: "deniz" })).status, 409, "a name a friend already has");
  const me = (await look(A)).me!;
  assert.equal(me.nickname, "Deniz");
  const p = (await villageStore()!.pilotPersonOf(A))!;
  assert.deepEqual([p.self, p.stated, p.sessions], [SELF, STATED, []]);
  assert.ok(validStated(STATED));
});

test("C75: a visit starts with three loaves and a raft; the second only a day later, topped up the same; then no more", async () => {
  await join(A, "Deniz");
  assert.equal((await pilot(A, "start")).status, 200);
  assert.deepEqual(await pack(A), { bread: 3, raft: 1 });
  const again = (await (await pilot(A, "start")).json()) as { session: { n: number } };
  assert.equal(again.session.n, 1, "a reload began a second visit");
  assert.equal((await pilot(A, "end")).status, 200);
  const early = await pilot(A, "start");
  assert.equal(early.status, 409);
  assert.equal(((await early.json()) as { error: string }).error, "too_soon");
  // Some of it given away, some fish caught: the second visit starts with three loaves and a raft again.
  await villageStore()!.setPack(A, { bread: 1, fish: 2 });
  now += PILOT.betweenMs;
  const second = (await (await pilot(A, "start")).json()) as { session: { n: number }; pack: Record<string, number> };
  assert.equal(second.session.n, 2);
  assert.deepEqual(second.pack, { bread: 3, fish: 2, raft: 1 });
  await pilot(A, "end");
  now += PILOT.betweenMs;
  assert.equal(((await (await pilot(A, "start")).json()) as { error: string }).error, "done");
  // A visit left open closes itself after its time and some grace.
  await join(B, "Ece");
  await pilot(B, "start");
  now += PILOT.sessionMs + 11 * 60 * 1000;
  assert.equal((await look(B)).me!.open, null);
});

test("C75: in a visit the pilot's six are set out one at a time, in the person's own order, nearer than the world's, and the engine is never asked", async () => {
  // Someone whose first is the overgrown path: on land, with nobody's sight to keep out of, so it fits by the dock.
  let n = 10;
  while (pilotOrder(subject(n), 1)[0] !== "overgrown_path") n++;
  const who = subject(n);
  await join(who, "Kaan");
  await pilot(who, "start");
  const at = atDock();
  const ask = async () => (await (await director(who, { op: "ask", cell: CELL, at })).json()) as { staging: { id: string; situation: SituationId; x: number; y: number } | null; reason?: string };
  assert.equal((await ask()).reason, "too_soon", "the first before twenty seconds of looking around");
  now += PILOT.firstMs + 1;
  const first = (await ask()).staging!;
  assert.equal(first.situation, "overgrown_path");
  const d = Math.hypot(first.x - at.x, first.y - at.y);
  assert.ok(d >= PILOT.landRing[0] - 0.01 && d <= PILOT.landRing[1] + 0.01, `${d} m`);
  assert.deepEqual((await ask()).staging, first, "asked again: the same one");
  assert.equal((await director(who, { op: "act", id: first.id, verb: "follow", at: { x: first.x + 1, y: first.y } })).status, 200);
  assert.equal((await ask()).reason, "too_soon", "the next straight after the last");
  now += PILOT.gapMs + 1;
  const second = (await ask()).staging!;
  assert.ok(PILOT_SITUATIONS.includes(second.situation) && second.situation !== "overgrown_path", second.situation);
  // Left unmet four minutes: gone, said so, and the next comes half a minute on.
  now += PILOT.lifeMs + 1;
  assert.equal((await ask()).reason, "too_soon");
  const gone = (await villageStore()!.stagingsOf(who))!.find((s) => s.id === second.id)!;
  assert.equal(gone.resolved, "unmet");
  now += PILOT.gapMs + 1;
  const third = (await ask()).staging!;
  assert.ok(![first.situation, second.situation].includes(third.situation));
  assert.deepEqual(offered, [], "the engine was asked to pick");
});

test("C75: the world's director never sets the six out, for anyone, and a pilot person out of a visit is anyone", async () => {
  await join(A, "Deniz");
  const at = atDock();
  await director(A, { op: "ask", cell: CELL, at });
  assert.deepEqual(offered[0]!.sort(), ["carved_mark", "dark_cleft", "lost_pouch", "netted_gull"]);
});

test("C75: bread given and a raft lent come out of the pack, and only while there is enough of it", async () => {
  await join(A, "Deniz");
  await pilot(A, "start");
  const hungry = await setOut(A, "hungry_stranger", "stg_h1");
  assert.equal((await act(A, hungry, "give-two")).status, 200);
  assert.deepEqual(await pack(A), { bread: 1, raft: 1 });
  const again = await setOut(A, "hungry_stranger", "stg_h2");
  assert.equal((await act(A, again, "give-all")).status, 409, "three loaves given out of one");
  assert.deepEqual(await pack(A), { bread: 1, raft: 1 }, "a refused gift still took bread");
  const borrower = await setOut(A, "raft_borrower", "stg_r1");
  assert.equal((await act(A, borrower, "lend")).status, 200);
  assert.equal((await pack(A)).raft ?? 0, 0);
  const no = await setOut(A, "raft_borrower", "stg_r2");
  assert.equal((await act(A, no, "keep")).status, 200, "saying no needs nothing");
});

test("C75: the tide pays what its coin says, the same mean whichever bet, and as many as the pack can hold", async () => {
  await join(A, "Deniz");
  await pilot(A, "start");
  for (const [i, verb] of ["bet-safe", "bet-even", "bet-long"].entries()) {
    const s = await setOut(A, "tide_fisher", `stg_t${i}`);
    const before = (await pack(A)).fish ?? 0;
    const res = await act(A, s, verb);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { beat: string };
    const caught = tideCatch(s.id, verb)!;
    assert.equal(((await pack(A)).fish ?? 0) - before, caught, `${verb}: the pack got other than the tide gave`);
    assert.ok(body.beat && body.beat.length > 0);
    if (verb === "bet-safe") assert.equal(caught, 2);
  }
  // A full pack keeps what it can, and says so.
  await villageStore()!.setPack(A, { bread: 3, raft: 1, stone: 4 });
  let id = 0;
  while (tideCatch(`stg_full${id}`, "bet-long") !== 4) id++;
  const s = await setOut(A, "tide_fisher", `stg_full${id}`);
  const body = (await (await act(A, s, "bet-long")).json()) as { beat: string; pack: Record<string, number> };
  assert.equal(body.pack.fish ?? 0, 0, "an eight-thing pack took more");
  assert.equal(body.beat, "Your pack is too full to carry them all.");
});

test("C75: a lent raft comes back after five minutes with two fish, three times in four, and said once; a planted seed is three handfuls a day later", async () => {
  await join(A, "Deniz");
  await pilot(A, "start");
  let back = 0;
  while (!loanComesBack(`stg_back${back}`)) back++;
  let lost = 0;
  while (loanComesBack(`stg_lost${lost}`)) lost++;
  const kept = await setOut(A, "raft_borrower", `stg_back${back}`);
  await act(A, kept, "lend");
  assert.equal((await look(A)).notices?.length ?? 0, 0, "back before five minutes");
  now += PILOT.loanBackMs + 1;
  const said = await look(A);
  assert.deepEqual(said.notices, [{ key: "pilot.loanBack", vars: { name: "Mira", fish: 2 } }]);
  assert.equal(said.pack!.raft, 1);
  assert.equal(said.pack!.fish, 2);
  assert.equal((await look(A)).notices?.length ?? 0, 0, "said twice");
  // One that never comes back: the raft is simply gone, and nothing says so.
  const gone = await setOut(A, "raft_borrower", `stg_lost${lost}`);
  await act(A, gone, "lend");
  now += PILOT.loanBackMs + 1;
  assert.equal((await look(A)).notices?.length ?? 0, 0);
  assert.equal((await pack(A)).raft ?? 0, 0);
  assert.equal((await villageStore()!.pilotPersonOf(A))!.settled[`stg_lost${lost}`], "lost");
  // The seed: nothing now, three handfuls a day later; taken now, one handful at once.
  const seed = await setOut(A, "seed_offer", "stg_s1");
  assert.equal((await act(A, seed, "plant")).status, 200);
  const now1 = await setOut(A, "seed_offer", "stg_s2");
  assert.equal((await act(A, now1, "now")).status, 200);
  assert.equal((await pack(A))["a handful of grain"], 1);
  // Room for the crop: what the pack holds is eight things, whatever they are.
  await villageStore()!.setPack(A, { "a handful of grain": 1 });
  now += PILOT.growMs + 1;
  const crop = await look(A);
  assert.deepEqual(crop.notices, [{ key: "pilot.harvest", vars: { n: 3 } }]);
  assert.equal((await pack(A))["a handful of grain"], 4);
});

test("C75: what no route reads is sent with no distance, so it is never taken for an approach", () => {
  const thing = (kind: string) => ({ ref: "staged:x", kind } as never);
  const manner = { heldMs: 2000, decisionMs: 900, abandoned: false, distanceM: 2.4 };
  const lend = measurementFor(verbsOf("raft-borrower").find((v) => v.id === "lend")!, thing("raft-borrower"), manner, 0);
  assert.equal(lend.action, "lend_raft");
  assert.equal("distance" in lend.opts.raw!, false);
  const greet = measurementFor(verbsOf("lone-traveler")[0]!, thing("lone-traveler"), manner, 0);
  assert.equal(greet.opts.raw!.distance, 2.4, "an approach read without its distance");
  const give = measurementFor(verbsOf("hungry-stranger")[1]!, thing("hungry-stranger"), manner, 0);
  assert.equal(give.opts.raw!.amount, 0.667);
  assert.equal(give.opts.contextOverride!.counterpart_status, "stranger");
  const passing = readFileSync(new URL("../src/components/world/Director.tsx", import.meta.url), "utf8");
  assert.match(passing, /sit\.passed\.route === "unrouted" \? \{\} :/);
  assert.equal(SITUATIONS.raft_borrower.passed!.route, "unrouted");
});

test("C75: friends rate friends by the name they know, not themselves, and someone they do not know on nothing", async () => {
  await join(A, "Deniz");
  await join(B, "Ece");
  const rate = (who: string, body: unknown) => pilot(who, "rate", body);
  assert.equal((await rate(A, { ratee: "ece", know: 0, axes: SELF })).status, 400, "rated someone they do not know");
  assert.equal((await rate(A, { ratee: "Deniz", know: 2, axes: SELF })).status, 400, "rated themselves");
  assert.equal((await rate(A, { ratee: "Nobody", know: 2, axes: SELF })).status, 404);
  assert.equal((await rate(A, { ratee: "ece", know: 3, axes: [1, 2, 3, 4, 5, 6, 7, 7] })).status, 200);
  assert.equal((await rate(A, { ratee: "Ece", know: 2, axes: null })).status, 200, "would rather not place them");
  const ratings = (await villageStore()!.pilotRatings())!;
  assert.equal(ratings.length, 1, "a second rating of the same friend was not written over the first");
  assert.deepEqual([ratings[0]!.rater, ratings[0]!.ratee, ratings[0]!.know, ratings[0]!.axes, ratings[0]!.predicted], [A, B, 2, null, null]);
  // C76: what they think the friend would do, in the same six; none for someone they do not know.
  const guess = { give: 3, lend: false, bet: "bet-long", seed: "now", path: "marked", greet: true };
  assert.equal((await rate(B, { ratee: "Deniz", know: 0, axes: null, predicted: guess })).status, 400, "guessed at someone they do not know");
  assert.equal((await rate(B, { ratee: "Deniz", know: 2, axes: SELF, predicted: { ...guess, bet: "everything" } })).status, 400);
  assert.equal((await rate(B, { ratee: "Deniz", know: 2, axes: SELF, predicted: guess })).status, 200);
  const theirs = (await villageStore()!.pilotRatings())!.find((r) => r.rater === B)!;
  assert.deepEqual(theirs.predicted, guess);
  assert.deepEqual((await look(A)).group, [{ nickname: "Ece", rated: true }]);
  assert.deepEqual((await look(B)).group, [{ nickname: "Deniz", rated: true }]);
});

test("C75: the export is the owner's alone, and it is everything: people, ratings, the six as set out, events, each echo", async () => {
  await join(A, "Deniz");
  await pilot(A, "start");
  await setOut(A, "lone_traveler", "stg_l1");
  const get = (h: Record<string, string>) => PILOT_GET(new Request("https://echo.test/api/pilot?op=export", { headers: h }));
  assert.equal((await get({})).status, 404);
  assert.equal((await get({ "x-pilot-admin": "pilot-admin-token-12X" })).status, 404);
  process.env.ECHO_PILOT_ADMIN = "short";
  assert.equal((await get({ "x-pilot-admin": "short" })).status, 404, "a token anyone could guess");
  process.env.ECHO_PILOT_ADMIN = ADMIN;
  const res = await get({ "x-pilot-admin": ADMIN });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { people: { subject: string }[]; ratings: unknown[]; byPerson: Record<string, { stagings: Staging[]; echo: { persona: { version: number } } }> };
  assert.deepEqual(data.people.map((p) => p.subject), [A]);
  assert.deepEqual(data.byPerson[A]!.stagings.map((s) => s.situation), ["lone_traveler"]);
  assert.equal(data.byPerson[A]!.echo.persona.version, 3);
});

test("C75: an erasure takes the person out of the pilot, and every rating either way", async () => {
  await join(A, "Deniz");
  await join(B, "Ece");
  await pilot(A, "rate", { ratee: "Ece", know: 2, axes: SELF });
  await pilot(B, "rate", { ratee: "Deniz", know: 3, axes: SELF });
  assert.ok(await villageStore()!.forgetSubject(A));
  assert.equal(await villageStore()!.pilotPersonOf(A), null);
  assert.deepEqual(await villageStore()!.pilotRatings(), []);
  const erase = readFileSync(new URL("../src/app/api/account/delete/route.ts", import.meta.url), "utf8");
  for (const row of ['["pilot_people", "subject"]', '["pilot_ratings", "rater"]', '["pilot_ratings", "ratee"]']) assert.ok(erase.includes(row), row);
});

test("C75: everything the pilot's six say or offer has its Turkish", () => {
  for (const id of PILOT_SITUATIONS) {
    for (const v of verbsOf(SITUATIONS[id].kind)) {
      assert.ok(VERBS_TR_FOR_TEST[v.label], `no Turkish for "${v.label}"`);
      if (v.beat) assert.ok(BEATS_TR_FOR_TEST[v.beat], `no Turkish for "${v.beat}"`);
    }
  }
  for (const line of ["Two fish, still cold from the sea.", "Low water: one fish.", "The tide comes in high: three fish.", "The tide turns your way: four fish.", "The tide goes out and stays out. Nothing.", "Your pack is too full to carry them all."]) {
    assert.ok(BEATS_TR_FOR_TEST[line], line);
  }
});
