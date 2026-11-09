/**
 * The owner's groups (DECISIONS C85): named groups in the study, each with its own link, and a yes from
 * the owner before anyone who asks to join can play. Off unless switched on, apart from circles; only the
 * owner's token makes a group, lists them, or says yes or no; whoever is waiting cannot begin a visit,
 * rate anyone, or be seen by the group; a no takes the request away; and a group is part of the study:
 * one yes is to the research, its debrief is the owner's switch, and it is in the export.
 *
 * Run:  node --import tsx --test apps/web/tests/groups.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

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
  process.env.ECHO_GROUPS = "1";
  delete process.env.ECHO_CIRCLES;
  delete process.env.ECHO_PILOT_VISITS;
  delete process.env.ECHO_PILOT_REVEAL;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
});

const subject = (n: number) => `g${String(n).padStart(7, "0")}-1111-4222-8333-444455556667`;
const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(subject) as [string, string, string, string, string];
const auth = (who: string) => ({ "content-type": "application/json", authorization: `Bearer ${signIdentity(who, SECRET, now)}` });
const post = (who: string, op: string, body: unknown = {}) => PILOT_POST(new Request(`https://echo.test/api/pilot?op=${op}`, { method: "POST", headers: auth(who), body: JSON.stringify(body) }));
const get = async (who: string, query = "") => PILOT_GET(new Request(`https://echo.test/api/pilot${query}`, { headers: auth(who) }));
const owner = (op: string, body: unknown = {}, token: string | null = ADMIN) =>
  PILOT_POST(new Request(`https://echo.test/api/pilot?op=${op}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-pilot-admin": token } : {}) }, body: JSON.stringify(body) }));
const listed = async (token: string | null = ADMIN) => PILOT_GET(new Request("https://echo.test/api/pilot?op=groups", { headers: token ? { "x-pilot-admin": token } : {} }));
type Listed = { groups: { id: string; name: string; code: string; visits: number; waiting: { subject: string; nickname: string }[]; members: { nickname: string; visits: number }[] }[] };
const look = async (who: string) =>
  (await (await get(who)).json()) as { sessions: number; me: null | { inStudy: boolean; waiting: boolean; groupName: string | null; start: { ok: boolean; why?: string } }; group: { nickname: string }[] };
const opens = async (code: string) => (await (await get(A, `?op=code&code=${encodeURIComponent(code)}`)).json()) as { kind: string | null; visits?: number; name?: string };

const STATED = { give: 2, lend: true, bet: "bet-even", seed: "plant", path: "unmarked", greet: false };
const SELF = [4, 6, 5, 6, 3, 2, 5, 5];
const join = (who: string, code: string, nickname: string, extra: Record<string, unknown> = {}) =>
  post(who, "join", { code, nickname, consent: true, self: SELF, stated: STATED, ...extra });
const makeGroup = async (name: string, visits?: number) => {
  const res = await owner("group", { name, ...(visits ? { visits } : {}) });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as { id: string; code: string; name: string; visits: number };
};
const letIn = async (who: string) => assert.equal((await owner("approve", { subject: who })).status, 200);
/** Every visit a person has, played to its end, a day apart. */
const playAll = async (who: string, visits: number) => {
  for (let i = 0; i < visits; i++) {
    assert.equal((await post(who, "start")).status, 200);
    now += 25 * MINUTE;
    assert.equal((await post(who, "end")).status, 200);
    now += 24 * HOUR;
  }
};

test("C85: off unless switched on, apart from circles; groups alone switch the pilot on", async () => {
  delete process.env.ECHO_GROUPS;
  assert.equal(pilotConfig()!.groups, false);
  assert.equal((await owner("group", { name: "Girvak" })).status, 404);
  assert.equal((await listed()).status, 404);
  process.env.ECHO_GROUPS = "1";
  delete process.env.ECHO_PILOT_CODE;
  assert.deepEqual(pilotConfig(), { cell: "843f6a1ffffffff", code: "", visits: 2, circles: false, groups: true });
  // Groups without circles: nobody else can start a circle.
  assert.equal((await post(A, "circle")).status, 404);
  delete process.env.ECHO_GROUPS;
  assert.equal(pilotConfig(), null);
});

test("C85: only the owner's token makes a group, lists them, and says yes or no", async () => {
  for (const token of [null, "pilot-admin-token-124", "short"]) {
    assert.equal((await owner("group", { name: "Girvak" }, token)).status, 404, `made with ${token}`);
    assert.equal((await listed(token)).status, 404, `listed with ${token}`);
    assert.equal((await owner("approve", { subject: A }, token)).status, 404);
  }
  assert.equal((await owner("group", { name: "   " })).status, 400);
  const g = await makeGroup("  Girvak   köyü ");
  assert.equal(g.name, "Girvak köyü");
  assert.equal(g.visits, 2, "the study's visits unless the owner says otherwise");
  assert.match(g.code, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  assert.deepEqual(await opens(g.code.toUpperCase()), { kind: "group", visits: 2, name: "Girvak köyü" });
  const three = await makeGroup("Lise", 3);
  assert.equal(three.visits, 3);
  const list = (await (await listed()).json()) as Listed;
  assert.deepEqual(list.groups.map((x) => [x.name, x.code, x.visits]), [["Girvak köyü", g.code, 2], ["Lise", three.code, 3]], "each group's link, again, in the order made");
});

test("C85: whoever joins waits for the owner's yes, and cannot play, rate or be seen until then", async () => {
  const g = await makeGroup("Girvak");
  const res = await join(A, g.code, "Deniz");
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { waiting: boolean }).waiting, true);
  const waiting = await look(A);
  assert.equal(waiting.me!.waiting, true);
  assert.equal(waiting.me!.groupName, "Girvak");
  assert.deepEqual(waiting.me!.start, { ok: false, why: "waiting" });
  assert.equal((await post(A, "start")).status, 409);
  // Someone let in before them does not see them in the group, and they cannot rate anyone.
  await join(B, g.code, "Ece");
  await letIn(B);
  assert.deepEqual((await look(B)).group, []);
  assert.equal((await post(A, "rate", { ratee: "Ece", know: 2, axes: SELF })).status, 409);
  assert.equal((await post(B, "rate", { ratee: "Deniz", know: 2, axes: SELF })).status, 404, "a friend still waiting is no one here yet");
  const list = (await (await listed()).json()) as Listed;
  assert.deepEqual(list.groups[0]!.waiting.map((w) => w.nickname), ["Deniz"]);
  assert.deepEqual(list.groups[0]!.members.map((m) => m.nickname), ["Ece"]);
  // The yes: in, and on their way.
  await letIn(A);
  const inNow = await look(A);
  assert.equal(inNow.me!.waiting, false);
  assert.equal(inNow.me!.inStudy, true, "a group is part of the study");
  assert.deepEqual(inNow.me!.start, { ok: true, n: 1 });
  assert.deepEqual(inNow.group.map((x) => x.nickname), ["Ece"]);
  assert.deepEqual((await look(B)).group.map((x) => x.nickname), ["Deniz"]);
  assert.equal((await post(A, "start")).status, 200);
  assert.equal((await owner("approve", { subject: A })).status, 404, "nobody is let in twice");
});

test("C85: a no takes the request away, and they may ask again", async () => {
  const g = await makeGroup("Girvak");
  await join(A, g.code, "Deniz");
  assert.equal((await owner("decline", { subject: A })).status, 200);
  assert.equal(await villageStore()!.pilotPersonOf(A), null);
  assert.equal((await look(A)).me, null);
  assert.equal((await join(A, g.code, "Deniz")).status, 200, "asked again");
  assert.equal((await look(A)).me!.waiting, true);
  // Someone who is in is never removed this way.
  await join(B, g.code, "Ece");
  await letIn(B);
  assert.equal((await owner("decline", { subject: B })).status, 404);
  assert.ok(await villageStore()!.pilotPersonOf(B));
});

test("C85: a group is part of the study: one yes is research, its debrief is the owner's switch, and it is in the export", async () => {
  process.env.ECHO_CIRCLES = "1";
  const g = await makeGroup("Girvak");
  const circleRes = await post(C, "circle", { visits: 2 });
  const circle = ((await circleRes.json()) as { code: string }).code;
  await join(A, g.code, "Deniz");
  await join(B, g.code, "Ece");
  await join(E, g.code, "Mert");
  await letIn(A);
  await letIn(B);
  await join(C, circle, "Can");
  await join(D, CODE, "Ada");
  const a = (await villageStore()!.pilotPersonOf(A))!;
  assert.equal(a.researchAt, a.consentAt, "in the study the one yes is to the research");
  assert.equal((await post(A, "rate", { ratee: "Ece", know: 3, axes: SELF, predicted: STATED })).status, 200);
  assert.equal((await post(A, "rate", { ratee: "Ada", know: 3, axes: SELF })).status, 404, "the study's own people are another group");
  const res = await PILOT_GET(new Request("https://echo.test/api/pilot?op=export", { headers: { "x-pilot-admin": ADMIN } }));
  const data = (await res.json()) as { groups: { id: string; name: string }[]; people: { subject: string; circle: string }[]; ratings: { rater: string; ratee: string }[] };
  assert.deepEqual(data.groups.map((x) => x.name), ["Girvak"]);
  assert.deepEqual(data.people.map((p) => p.subject), [D, A, B], "the study and its groups; not a circle, not anyone waiting");
  assert.deepEqual(data.people.map((p) => p.circle), ["study", g.id, g.id]);
  assert.deepEqual(data.ratings.map((r) => [r.rater, r.ratee]), [[A, B]]);
  // The debrief: the owner's switch, as the study's, and never a card to pass on.
  await playAll(A, 2);
  assert.equal((await get(A, "?op=reveal")).status, 404);
  process.env.ECHO_PILOT_REVEAL = "1";
  const reveal = await get(A, "?op=reveal");
  assert.equal(reveal.status, 200);
  const body = (await reveal.json()) as { ready: boolean; shareable: boolean };
  assert.equal(body.ready, true);
  assert.equal(body.shareable, false);
});

test("C85: a circle's code opens nothing with circles off, and a group's nothing with groups off", async () => {
  process.env.ECHO_CIRCLES = "1";
  const circle = ((await (await post(C, "circle")).json()) as { code: string }).code;
  const g = await makeGroup("Girvak");
  delete process.env.ECHO_CIRCLES;
  assert.deepEqual(await opens(circle), { kind: null });
  assert.equal((await join(A, circle, "Deniz")).status, 403);
  assert.equal((await opens(g.code)).kind, "group");
  process.env.ECHO_CIRCLES = "1";
  delete process.env.ECHO_GROUPS;
  assert.deepEqual(await opens(g.code), { kind: null });
  assert.equal((await join(A, g.code, "Deniz")).status, 403);
});
