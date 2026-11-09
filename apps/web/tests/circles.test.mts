/**
 * Circles (DECISIONS C83): "who knows you best" for any group of friends. Off unless switched on; a
 * circle is started with a code the store keeps only the hash of; friends join by it, with nicknames
 * unique per circle and research a yes of its own; the group, ratings and the debrief stay inside the
 * circle; a circle plays its own number of visits and needs no switch for its debrief; the owner's
 * export is the study's alone; and an erasure leaves a circle for its friends.
 *
 * Run:  node --import tsx --test apps/web/tests/circles.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { signIdentity } from "@echo/shared/identity";
import { worldClock, WORLD_DAY_S, WORLD_EPOCH } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { GET: PILOT_GET, POST: PILOT_POST } = await import("../src/app/api/pilot/route");
const { pilotConfig } = await import("../src/lib/pilot");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");

const SECRET = "pilot-secret-aaaaaaa";
const ADMIN = "pilot-admin-token-123";
const CODE = "Senstrand7";
const CLOCK = worldClock(WORLD_EPOCH);
const T0 = Math.round(CLOCK.epochMs + (4940 + 0.45) * WORLD_DAY_S * 1000);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
let now = T0;
const saved = { env: { ...process.env }, fetch: globalThis.fetch, now: Date.now };

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return json(1);
    if (url.startsWith("https://stub.supabase.test")) return json([]);
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
  process.env.ECHO_PILOT = "1";
  process.env.ECHO_PILOT_CODE = CODE;
  process.env.ECHO_PILOT_ADMIN = ADMIN;
  process.env.ECHO_CIRCLES = "1";
  delete process.env.ECHO_PILOT_VISITS;
  delete process.env.ECHO_PILOT_REVEAL;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
});

const subject = (n: number) => `c${String(n).padStart(7, "0")}-1111-4222-8333-444455556667`;
const [A, B, C, D] = [1, 2, 3, 4].map(subject) as [string, string, string, string];
const auth = (who: string) => ({ "content-type": "application/json", authorization: `Bearer ${signIdentity(who, SECRET, now)}` });
const post = (who: string, op: string, body: unknown = {}) => PILOT_POST(new Request(`https://echo.test/api/pilot?op=${op}`, { method: "POST", headers: auth(who), body: JSON.stringify(body) }));
const get = async (who: string, query = "") => PILOT_GET(new Request(`https://echo.test/api/pilot${query}`, { headers: auth(who) }));
const look = async (who: string) => (await (await get(who)).json()) as { sessions: number; circles: boolean; me: null | { inStudy: boolean; start: { ok: boolean; why?: string } }; group: { nickname: string }[] };
const opens = async (code: string) => (await (await get(A, `?op=code&code=${encodeURIComponent(code)}`)).json()) as { kind: string | null; visits?: number };

const STATED = { give: 2, lend: true, bet: "bet-even", seed: "plant", path: "unmarked", greet: false };
const SELF = [4, 6, 5, 6, 3, 2, 5, 5];
const join = (who: string, code: string, nickname: string, extra: Record<string, unknown> = {}) =>
  post(who, "join", { code, nickname, consent: true, self: SELF, stated: STATED, ...extra });
const start = async (who: string, visits = 3) => {
  const res = await post(who, "circle", { visits });
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { code: string }).code;
};
/** Every visit a person has, played to its end, a day apart. */
const playAll = async (who: string, visits: number) => {
  for (let i = 0; i < visits; i++) {
    assert.equal((await post(who, "start")).status, 200);
    now += 25 * MINUTE;
    assert.equal((await post(who, "end")).status, 200);
    now += 24 * HOUR;
  }
};

test("C83: off unless switched on; the study's code still opens the study", async () => {
  delete process.env.ECHO_CIRCLES;
  assert.equal(pilotConfig()!.circles, false);
  assert.equal((await post(A, "circle")).status, 404);
  assert.deepEqual(await opens(CODE.toLowerCase()), { kind: "study", visits: 2 });
  assert.deepEqual(await opens("abcd-efgh"), { kind: null });
  // On without a study: circles alone switch the pilot on, and an empty code opens nothing.
  process.env.ECHO_CIRCLES = "1";
  delete process.env.ECHO_PILOT_CODE;
  assert.deepEqual(pilotConfig(), { cell: "843f6a1ffffffff", code: "", visits: 2, circles: true, groups: false });
  assert.equal((await join(A, "", "Deniz")).status, 403);
  delete process.env.ECHO_CIRCLES;
  assert.equal(pilotConfig(), null);
});

test("C83: a circle starts with a fresh code, and the store keeps only its hash", async () => {
  const code = await start(A);
  assert.match(code, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  const circle = (await villageStore()!.pilotCircle({ codeHash: createHash("sha256").update(code.replace("-", "")).digest("hex") }))!;
  assert.ok(circle, "found by the hash of the code");
  assert.equal(circle.createdBy, A);
  assert.equal(circle.visits, 3);
  assert.equal(circle.research, false);
  assert.ok(!JSON.stringify(circle).includes(code.replace("-", "")), "the code itself is not kept");
  // Typed any which way, it opens the same circle.
  for (const typed of [code, code.toUpperCase(), ` ${code.replace("-", " ")} `]) assert.deepEqual(await opens(typed), { kind: "circle", visits: 3 });
  assert.notEqual(await start(A, 2), code, "each circle its own code");
});

test("C83: friends join a circle by its code, with names unique per circle and research a yes of its own", async () => {
  const code = await start(A);
  assert.equal((await join(A, code, "Deniz")).status, 200);
  assert.equal((await join(B, CODE, "Deniz")).status, 200, "the same name in the study is someone else");
  assert.equal((await join(C, code, "deniz")).status, 409, "but not twice in one circle");
  assert.equal((await join(C, code, "Ece", { research: true })).status, 200);
  assert.equal((await join(D, "zzzz-zzzz", "Mert")).status, 403);
  const [a, b, c] = await Promise.all([A, B, C].map((s) => villageStore()!.pilotPersonOf(s)));
  assert.notEqual(a!.circle, "study");
  assert.equal(c!.circle, a!.circle);
  assert.equal(b!.circle, "study");
  assert.equal(a!.researchAt, null, "no research yes, none recorded");
  assert.equal(c!.researchAt, c!.consentAt);
  assert.equal(b!.researchAt, b!.consentAt, "in the study the one yes is to the research");
});

test("C83: the group, ratings and the export stay where they belong", async () => {
  const code = await start(A);
  await join(A, code, "Deniz");
  await join(C, code, "Ece");
  await join(B, CODE, "Mert");
  assert.deepEqual((await look(A)).group.map((g) => g.nickname), ["Ece"]);
  assert.deepEqual((await look(B)).group, []);
  assert.equal((await look(A)).me!.inStudy, false);
  assert.equal((await post(A, "rate", { ratee: "Mert", know: 2, axes: SELF })).status, 404, "someone in another circle is no one here");
  assert.equal((await post(A, "rate", { ratee: "Ece", know: 2, axes: SELF, predicted: STATED })).status, 200);
  assert.equal((await villageStore()!.pilotRatings("study"))!.length, 0);
  assert.equal((await villageStore()!.pilotRatings((await villageStore()!.pilotPersonOf(A))!.circle))!.length, 1);
  const res = await PILOT_GET(new Request("https://echo.test/api/pilot?op=export", { headers: { "x-pilot-admin": ADMIN } }));
  const data = (await res.json()) as { people: { subject: string }[]; ratings: unknown[] };
  assert.deepEqual(data.people.map((p) => p.subject), [B], "the export is the study's alone");
  assert.deepEqual(data.ratings, []);
});

test("C83: a circle plays its own visits, and its debrief needs no switch; the study's still does", async () => {
  const code = await start(A, 2);
  await join(A, code, "Deniz");
  await join(B, CODE, "Mert");
  assert.equal((await look(A)).sessions, 2);
  await playAll(A, 2);
  assert.deepEqual((await look(A)).me!.start, { ok: false, why: "done" });
  const mine = await get(A, "?op=reveal");
  assert.equal(mine.status, 200);
  assert.equal(((await mine.json()) as { ready: boolean }).ready, true);
  await playAll(B, 2);
  assert.equal((await get(B, "?op=reveal")).status, 404, "the study's debrief is the owner's switch");
  process.env.ECHO_PILOT_REVEAL = "1";
  assert.equal((await get(B, "?op=reveal")).status, 200);
});

test("C83: an erasure leaves a circle for its friends and takes the person out of it", async () => {
  const code = await start(A);
  await join(A, code, "Deniz");
  await join(C, code, "Ece");
  assert.ok(await villageStore()!.forgetSubject(A));
  assert.deepEqual(await opens(code), { kind: "circle", visits: 3 }, "the circle stays");
  const circle = (await villageStore()!.pilotCircle({ codeHash: createHash("sha256").update(code.replace("-", "")).digest("hex") }))!;
  assert.equal(circle.createdBy, null, "and is no longer theirs");
  assert.deepEqual((await look(C)).group, []);
  const erase = readFileSync(new URL("../src/app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.ok(erase.includes('["pilot_circles", "created_by"]'));
});

test("C83, C85: with circles and groups off, the store asks the tables for nothing 0037 or 0038 adds", () => {
  const store = readFileSync(new URL("../src/lib/villageStore.ts", import.meta.url), "utf8");
  assert.match(store, /const PILOT_COLUMNS = "subject, nickname, joined_at, consent_at, self_axes, stated, sessions, settled";/);
  assert.match(store, /const pilotColumns = \(\) => \(circleTablesOn\(\) \? `\$\{PILOT_COLUMNS\}, circle, research_at, waiting_since` : PILOT_COLUMNS\);/);
  for (const write of ["{ ...row, circle: p.circle, research_at: p.researchAt, waiting_since: p.waitingSince } : row", "{ ...row, circle } : row"]) assert.ok(store.includes(`(circleTablesOn() ? ${write})`), write);
  for (const read of ["pilotCircle(by)", "pilotGroups()", "savePilotCircle(c)", "dropPilotPerson(subject)"]) {
    assert.match(store, new RegExp(`async ${read.replace(/[()]/g, "\\$&")} \\{\\n\\s+if \\(!circleTablesOn\\(\\)\\) return`), read);
  }
});
