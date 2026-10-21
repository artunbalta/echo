/**
 * Five minutes to you (DECISIONS C72): off unless switched on; a visit, paired with the host; the meeting
 * at once; the visitor's own voice only with their yes, for a day, deleted at ElevenLabs on time and on
 * erasure; and every visit gone within a day. Against a recording engine and a recording ElevenLabs.
 *
 * Run:  node --import tsx --test apps/web/tests/demo.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { signIdentity } from "@echo/shared/identity";
import { DIRECTOR, mayStage, worldClock, WORLD_DAY_S, WORLD_EPOCH } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { DEMO, demoConfig, liveVisit, personVoice, sweepDemoVoices } = await import("../src/lib/demo");
const { GET: DEMO_GET, POST: DEMO_POST } = await import("../src/app/api/demo/route");
const { GET: SELF_GET } = await import("../src/app/api/voice/self/route");
const { POST: ERASE } = await import("../src/app/api/account/delete/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");

const SECRET = "demo-secret-aaaaaaaa";
const HOST = "h0h0h0h0-1111-4222-8333-444455556660";
const V = "v1v1v1v1-1111-4222-8333-444455556661";
const W = "w2w2w2w2-1111-4222-8333-444455556662";
const CLOCK = worldClock(WORLD_EPOCH);
const T0 = Math.round(CLOCK.epochMs + (5000 + 0.45) * WORLD_DAY_S * 1000);
const MIN = 60_000;
let now = T0;
const saved = { env: { ...process.env }, fetch: globalThis.fetch, now: Date.now };

let gate: Record<string, string> = {};
let engine: { path: string; body: Record<string, unknown> }[] = [];
let eleven: { method: string; path: string; form?: Record<string, string> }[] = [];
let failDelete = false;
let nextVoice = 1;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return json(1);
    if (url.startsWith("https://stub.supabase.test")) return new Response(null, { status: 204 });
    if (url.startsWith("https://ml.test")) {
      const path = url.slice("https://ml.test".length);
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
      engine.push({ path, body });
      if (path === "/agent/turn") {
        const who = body.userId === HOST ? "host" : "visitor";
        return json({ action: `${who} speaks on the green.`, decision: gate[String(body.userId)] ?? "copilot", confidence: 0.6, p_hat: 0.6, tau: 0.58, explored: false, level: "copilot", rationale: "r", candidates: [] });
      }
      if (path.startsWith("/user/")) return json({ deleted: true });
      return json({ ok: true });
    }
    if (url.startsWith("https://api.elevenlabs.io")) {
      const path = url.slice("https://api.elevenlabs.io".length);
      const method = init?.method ?? "GET";
      if (path === "/v1/voices/add" && method === "POST") {
        const form: Record<string, string> = {};
        for (const [k, v] of (init!.body as FormData).entries()) form[k] = typeof v === "string" ? v : `file:${(v as File).name}:${(v as File).size}:${(v as File).type}`;
        eleven.push({ method, path, form });
        return json({ voice_id: `vc_${nextVoice++}`, requires_verification: false });
      }
      if (path.startsWith("/v1/voices/") && method === "DELETE") {
        eleven.push({ method, path });
        return failDelete ? json({ detail: "busy" }, 500) : json({ status: "ok" });
      }
      if (path.startsWith("/v1/text-to-speech/")) {
        eleven.push({ method, path });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
      }
    }
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
  gate = { [HOST]: "auto" };
  engine = [];
  eleven = [];
  failDelete = false;
  nextVoice = 1;
  process.env.ECHO_DEMO = "1";
  process.env.ECHO_DEMO_HOST = HOST;
  process.env.ECHO_DEMO_HOST_NAME = "Artun";
  delete process.env.ECHO_DEMO_CELL;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
  process.env.ELEVENLABS_API_KEY = "xi-test";
});

const headers = (subject: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${signIdentity(subject, SECRET, now)}`, ...extra });
const op = (subject: string, name: string, body: BodyInit = "{}", extra: Record<string, string> = { "content-type": "application/json" }) =>
  DEMO_POST(new Request(`https://echo.test/api/demo?op=${name}`, { method: "POST", headers: headers(subject, extra), body }));
const start = async (subject = V, name = "Deniz") => {
  const res = await op(subject, "start", JSON.stringify({ name }));
  assert.equal(res.status, 200, await res.clone().text());
};
/** Three seconds of something, as the recorder would send it. */
const audio = () => new Uint8Array(DEMO.audioMinBytes + 1000).fill(7);

test("C72: off unless switched on, and on only with a host", async () => {
  delete process.env.ECHO_DEMO;
  assert.equal(demoConfig(), null);
  assert.equal((await DEMO_GET(new Request("https://echo.test/api/demo"))).status, 404);
  assert.equal((await op(V, "start")).status, 404);
  process.env.ECHO_DEMO = "1";
  delete process.env.ECHO_DEMO_HOST;
  assert.equal(demoConfig(), null, "on with nobody to meet");
  process.env.ECHO_DEMO_HOST = HOST;
  assert.deepEqual(demoConfig(), { host: HOST, hostName: "Artun", cell: DEMO.defaultCell });
  const page = readFileSync(new URL("../src/app/you/page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!cfg\) notFound\(\)/, "the page exists whether or not the demo is on");
});

test("C72: a visit begins under the visitor's identity, paired with the host at once; the host is no visitor", async () => {
  await start(V, "  Deniz\u0007 ");
  const store = villageStore()!;
  const visit = (await store.demoVisitOf(V))!;
  assert.equal(visit.name, "Deniz");
  assert.equal(visit.host, HOST);
  const [pair] = (await store.pairsOf(V))!;
  assert.deepEqual([pair!.a, pair!.aName, pair!.b, pair!.bName], [HOST, "Artun", V, "Deniz"]);
  // Again within the hour: the same visit, the same pair.
  now += 10 * MIN;
  await start(V, "Someone else");
  assert.equal((await store.demoVisitOf(V))!.startedAt, visit.startedAt);
  assert.equal((await store.pairsOf(V))!.length, 1);
  assert.equal((await op(HOST, "start", JSON.stringify({ name: "Artun" }))).status, 409);
  const got = (await (await DEMO_GET(new Request("https://echo.test/api/demo", { headers: headers(V) }))).json()) as { host: string; visit: { name: string; voice: boolean } };
  assert.equal(got.host, "Artun");
  assert.deepEqual([got.visit.name, got.visit.voice], ["Deniz", false]);
});

test("C72: the meeting comes when there has been time to learn something, at once, through each one's gate, and once", async () => {
  await start();
  const early = await op(V, "meet");
  assert.equal(early.status, 409);
  assert.ok(((await early.json()) as { inMs: number }).inMs > 0);
  now += DEMO.meetAfterMs + 1000;
  const res = await op(V, "meet");
  assert.equal(res.status, 200, await res.clone().text());
  const { meeting } = (await res.json()) as { meeting: { friend: string; lines: { mine: boolean; said: boolean; text: string }[]; cell: string } };
  assert.equal(meeting.friend, "Artun");
  assert.equal(meeting.cell, DEMO.defaultCell);
  const turns = engine.filter((e) => e.path === "/agent/turn");
  assert.equal(turns.length, 6);
  assert.deepEqual([...new Set(turns.map((t) => t.body.userId))].sort(), [HOST, V].sort());
  // The host's echo has earned speech; the visitor's, five minutes old, has not: theirs are what it would have said.
  for (const l of meeting.lines) assert.equal(l.said, !l.mine);
  for (const l of meeting.lines) if (l.mine) assert.match(l.text, /visitor speaks/, "the visitor was not shown their own echo's words");
  engine = [];
  const again = (await (await op(V, "meet")).json()) as { meeting: { lines: unknown[] } };
  assert.equal(again.meeting.lines.length, 6);
  assert.equal(engine.length, 0, "the meeting was made twice");
});

test("C72: their voice is cloned only with their yes, from a real recording, replaces any before it, and is theirs alone", async () => {
  await start();
  assert.equal((await op(V, "voice", audio(), { "content-type": "audio/webm" })).status, 403, "cloned without a yes");
  assert.equal(eleven.length, 0, "something reached ElevenLabs without a yes");
  const yes = { "content-type": "audio/webm", "x-voice-consent": "yes" };
  assert.equal((await op(V, "voice", audio(), { ...yes, "content-type": "text/plain" })).status, 400);
  assert.equal((await op(V, "voice", new Uint8Array(100), yes)).status, 400, "a click was cloned");
  assert.equal((await op(W, "voice", audio(), yes)).status, 404, "a voice with no visit");
  const res = await op(V, "voice", audio(), yes);
  assert.equal(res.status, 200, await res.clone().text());
  const add = eleven.find((e) => e.path === "/v1/voices/add")!;
  assert.match(add.form!.files!, /^file:voice\.webm:\d+:audio\/webm$/);
  assert.match(add.form!.description!, /deleted by/);
  const visit = (await villageStore()!.demoVisitOf(V))!;
  assert.equal(visit.voiceId, "vc_1");
  assert.equal(Date.parse(visit.voiceUntil!) - now, DEMO.voiceMs);
  assert.equal((await personVoice(villageStore(), V))?.voiceId, "vc_1");
  assert.equal(await personVoice(villageStore(), W), null);
  const mine = (await (await SELF_GET(new Request("https://echo.test/api/voice/self", { headers: headers(V) }))).json()) as { mine: boolean };
  assert.equal(mine.mine, true);
  // A second reading: the first voice is deleted before the second exists.
  eleven = [];
  await op(V, "voice", audio(), yes);
  assert.deepEqual(eleven.map((e) => `${e.method} ${e.path}`), ["DELETE /v1/voices/vc_1", "POST /v1/voices/add"]);
  assert.equal((await villageStore()!.demoVisitOf(V))!.voiceId, "vc_2");
});

test("C72: a voice past its day is deleted at ElevenLabs by the next sweep, and speaks no more", async () => {
  await start();
  await op(V, "voice", audio(), { "content-type": "audio/webm", "x-voice-consent": "yes" });
  now += DEMO.voiceMs + 1000;
  eleven = [];
  assert.equal(await sweepDemoVoices(villageStore()!, now), 1);
  assert.deepEqual(eleven.map((e) => `${e.method} ${e.path}`), ["DELETE /v1/voices/vc_1"]);
  assert.ok((await villageStore()!.demoVisitOf(V))!.voiceDeletedAt);
  assert.equal(await personVoice(villageStore(), V), null);
  assert.equal(await sweepDemoVoices(villageStore()!, now), 0, "a deleted voice was deleted again");
});

/** The page's erase: the demo's (the voice, now), then the one erasure there is. */
async function eraseAsThePageDoes(subject: string) {
  const demo = await op(subject, "erase");
  const account = await ERASE(new Request("https://echo.test/api/account/delete", { method: "POST", headers: headers(subject, { "content-type": "application/json" }), body: JSON.stringify({ userId: subject }) }));
  return { demo: demo.status, account: account.status, verdict: (await account.json()) as { ok: boolean; supabaseTablesFailed: string[]; supabaseTablesWiped: string[] } };
}

test("C72: erasing takes the voice at ElevenLabs first, and keeps the visit marked while the voice would not go", async () => {
  await start();
  await op(V, "voice", audio(), { "content-type": "audio/webm", "x-voice-consent": "yes" });
  now += DEMO.meetAfterMs + 1000;
  await op(V, "meet");
  failDelete = true;
  const stuck = await eraseAsThePageDoes(V);
  assert.equal(stuck.demo, 502);
  assert.equal(stuck.verdict.ok, false);
  assert.ok(stuck.verdict.supabaseTablesFailed.some((f) => f.includes("elevenlabs voice")));
  assert.ok(!stuck.verdict.supabaseTablesWiped.includes("demo_visits"), "the mark of an erasure still owed was wiped");
  assert.ok(await villageStore()!.demoVisitOf(V), "the visit whose voice is still out there was forgotten");
  failDelete = false;
  eleven = [];
  const done = await eraseAsThePageDoes(V);
  assert.equal(done.demo, 200);
  assert.equal(done.verdict.ok, true, JSON.stringify(done.verdict.supabaseTablesFailed));
  assert.deepEqual(eleven.map((e) => `${e.method} ${e.path}`), ["DELETE /v1/voices/vc_1"]);
  assert.ok(done.verdict.supabaseTablesWiped.includes("demo_visits"), "the visit was left behind a finished erasure");
  const store = villageStore()!;
  assert.equal(await store.demoVisitOf(V), null);
  assert.deepEqual(await store.pairsOf(V), []);
  assert.deepEqual(await store.meetingsOf(V, 10), []);
  assert.deepEqual(await store.meetingsOf(HOST, 10), [], "the host kept a meeting with someone erased");
});

test("C72: an erasure that only half worked keeps the visit marked, and the sweep finishes it a day later", async () => {
  await start();
  now += DEMO.meetAfterMs + 1000;
  await op(V, "meet");
  // The engine is down: the posterior cannot be erased, so the erasure is not done.
  process.env.ML_SERVICE_URL = "";
  const half = await eraseAsThePageDoes(V);
  assert.equal(half.verdict.ok, false);
  assert.ok(await villageStore()!.demoVisitOf(V), "a half-finished erasure took its own mark with it");
  process.env.ML_SERVICE_URL = "https://ml.test";
  now += DEMO.keepMs + 1000;
  engine = [];
  await start(W, "Can");
  assert.ok(engine.some((e) => e.path === `/user/${V}`), "the sweep never came back to finish it");
  assert.equal(await villageStore()!.demoVisitOf(V), null);
});

test("C72: the demo's own erase deletes the voice and nothing else: the rest is the one erasure's", async () => {
  await start();
  await op(V, "voice", audio(), { "content-type": "audio/webm", "x-voice-consent": "yes" });
  eleven = [];
  assert.equal((await op(V, "erase")).status, 200);
  assert.deepEqual(eleven.map((e) => `${e.method} ${e.path}`), ["DELETE /v1/voices/vc_1"]);
  assert.ok(await villageStore()!.demoVisitOf(V), "the mark went before the erasure it marks");
  assert.equal(await personVoice(villageStore(), V), null);
});

test("C72: an erasure takes a meeting from both people, whichever side the erased one was on", async () => {
  const store = villageStore()!;
  await store.addPair({ id: "pair_side_a", a: V, b: W, aName: "Deniz", bName: "Can", createdAt: new Date(now).toISOString() });
  await store.claimMeeting({ id: "m_side_a", pair: "pair_side_a", a: V, b: W, aName: "Deniz", bName: "Can", status: "made", from: new Date(now - 60 * MIN).toISOString(), to: new Date(now).toISOString(), cell: null, village: null, day: null, hour: null, x: null, y: null, topic: null, lines: [], witnesses: [], madeAt: new Date(now).toISOString(), makingAt: null, readA: null, readB: null, feedbackA: {}, feedbackB: {}, reason: null });
  await store.forgetSubject(V);
  assert.deepEqual(await store.meetingsOf(W, 10), [], "the other person kept a meeting with someone erased");
  assert.deepEqual(await store.pairsOf(W), []);
});

test("C72: a visit nobody erased is erased whole within a day, through the one erasure there is", async () => {
  await start();
  await op(V, "voice", audio(), { "content-type": "audio/webm", "x-voice-consent": "yes" });
  now += DEMO.keepMs + 1000;
  eleven = [];
  engine = [];
  // Any demo request sweeps; here someone else begins a visit.
  await start(W, "Can");
  assert.ok(eleven.some((e) => e.method === "DELETE" && e.path === "/v1/voices/vc_1"), "the voice outlived its day");
  assert.ok(engine.some((e) => e.path === `/user/${V}`), "the echo outlived its day: the erasure never reached the engine");
  assert.equal(await villageStore()!.demoVisitOf(V), null);
  assert.ok(await villageStore()!.demoVisitOf(W), "the sweep took a visit still in its day");
  const src = readFileSync(new URL("../src/lib/demo.ts", import.meta.url), "utf8");
  assert.match(src, /import\("@\/app\/api\/account\/delete\/route"\)/, "a second erasure path");
});

test("C72: the director sets things out at a demo's pace for a visitor in their hour, and at the world's for anyone else", async () => {
  await start();
  const store = villageStore()!;
  assert.ok(await liveVisit(store, V, now));
  assert.equal(await liveVisit(store, W, now), null);
  assert.equal(await liveVisit(store, V, now + DEMO.liveMs + 1), null, "an hour-old visit kept the demo's pace");
  process.env.ECHO_DEMO = "0";
  assert.equal(await liveVisit(store, V, now), null, "the demo's pace outlived the demo");
  const last = [{ id: "s", subject: V, cell: "c", situation: "netted_gull" as const, x: 0, y: 0, facing: 0, owner: null, ownerName: null, infoGain: null, createdAt: new Date(now - 45_000).toISOString(), resolved: "passed", resolvedAt: new Date(now - 40_000).toISOString() }];
  assert.equal(mayStage(last, 9, now), "too_soon", "the world's own gap changed");
  assert.equal(mayStage(last, 9, now, DEMO.directorGapMs), null);
  assert.equal(DIRECTOR.gapMs, 20 * MIN);
  const route = readFileSync(new URL("../src/app/api/world/director/route.ts", import.meta.url), "utf8");
  assert.match(route, /mayStage\(mine, Infinity, now, gap\)/);
});
