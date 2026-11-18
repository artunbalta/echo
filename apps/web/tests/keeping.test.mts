/**
 * What your echo did while it kept your body, and "that was not me" (DECISIONS C105), through the routes
 * as the real handlers: only a room's signed report is kept, and only while the yes stands; the person
 * reads their own; a veto is kept once, only for what the echo can stand in at, and takes back the right
 * it raises the bar on, in the standing and in the brief; a no and an erasure take it all.
 *
 * Run:  node --import tsx --test apps/web/tests/keeping.test.mts
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import type { AwayReport } from "@echo/shared";
import { signIdentity } from "@echo/shared/identity";
import { signReport, verifyBrief } from "@echo/shared/standin";

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const KEEPING = await import("../src/app/api/echo/keeping/route");
const VETO = await import("../src/app/api/echo/veto/route");
const STANDIN = await import("../src/app/api/echo/standin/route");
const LOOKS = await import("../src/app/api/echo/looks/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");

const SECRET = "keeping-secret-aaaa";
const ME = "e1f3e0fc-1111-4222-8333-444455550003";
const D = "84dcee5ffffffff";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch };

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
  process.env.ECHO_IDENTITY_SECRET = saved.secret;
  process.env.VERCEL_ENV = saved.vercel;
  globalThis.fetch = saved.fetch;
});
beforeEach(() => resetMemoryStore());

const auth = (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${signIdentity(ME, SECRET, Date.now())}`, ...extra });
const json = { "content-type": "application/json" };
const say = (on: boolean) => STANDIN.POST(new Request("https://echo.test/api/echo/standin", { method: "POST", headers: auth(json), body: JSON.stringify({ on }) }));
const standin = async () => (await (await STANDIN.GET(new Request("https://echo.test/api/echo/standin", { headers: auth() }))).json()) as { standing: { bucket: string; level: string }[]; brief?: string };
const veto = (body: unknown) => VETO.POST(new Request("https://echo.test/api/echo/veto", { method: "POST", headers: auth(json), body: JSON.stringify(body) }));
const read = async () => (await (await KEEPING.GET(new Request("https://echo.test/api/echo/keeping", { headers: auth() }))).json()) as { records: AwayReport[]; vetoes: { at: number; kind: string }[] };

const T = Date.UTC(2026, 10, 17, 9);
const report = (over: Partial<AwayReport> = {}): AwayReport => ({
  sub: ME,
  cell: D,
  room: "WATCH",
  since: T,
  until: T + 10 * 60_000,
  log: [
    { at: T + 60_000, kind: "greeting", call: "greet-warm", p: 0.8, may: "act", did: "greet-warm" },
    { at: T + 120_000, kind: "lost-purse", call: "leave", p: 0.6, may: "watch", did: "on" },
  ],
  ...over,
});
const fromRoom = (r: unknown, key = SECRET, tamper = (b: string) => b) => {
  const body = JSON.stringify(r);
  return KEEPING.POST(new Request("https://echo.test/api/echo/keeping", { method: "POST", headers: { ...json, "x-echo-room": signReport(body, key) }, body: tamper(body) }));
};

test("only a room's report is kept: signed with the server's key, over exactly what it sent", async () => {
  await say(true);
  assert.equal((await fromRoom(report(), "not-the-secret")).status, 401, "another key");
  assert.equal((await fromRoom(report(), SECRET, (b) => b.replace('"leave"', '"take-all"'))).status, 401, "a word changed on the way");
  const unsigned = await KEEPING.POST(new Request("https://echo.test/api/echo/keeping", { method: "POST", headers: json, body: JSON.stringify(report()) }));
  assert.equal(unsigned.status, 401, "no signature");
  assert.equal((await read()).records.length, 0);
});

test("a report that could not have been is refused, even signed", async () => {
  await say(true);
  for (const bad of [report({ cell: "8400000ffffffff" }), report({ room: "abcde" }), report({ until: T - 1 }), report({ log: [{ at: T, kind: "not-a-moment", call: "x", p: 0.5, may: "act", did: "x" }] })]) {
    assert.equal((await fromRoom(bad)).status, 400, JSON.stringify(bad).slice(0, 90));
  }
});

test("kept while the yes stands, once per keeping, and read by the person, newest first", async () => {
  assert.equal((await fromRoom(report())).status, 409, "nothing is kept before a yes");
  await say(true);
  assert.equal((await fromRoom(report())).status, 200);
  assert.equal((await fromRoom(report())).status, 200, "the same keeping again");
  assert.equal((await fromRoom(report({ since: T + 3_600_000, until: T + 3_700_000 }))).status, 200);
  const { records } = await read();
  assert.equal(records.length, 2, "one per keeping");
  assert.ok(records[0]!.since > records[1]!.since, "newest first");
  assert.ok(!("sub" in records[0]!), "the subject is not handed back");
});

test("a veto is kept once, only for what the echo can stand in at, only with a yes", async () => {
  assert.equal((await veto({ at: T + 60_000, kind: "greeting", call: "greet-warm" })).status, 409, "no yes, nothing to take back");
  await say(true);
  assert.equal((await veto({ at: T, kind: "ball-game", call: "to-alone" })).status, 400, "a moment in no family: the echo never stands in there");
  assert.equal((await veto({ at: T, kind: "greeting", call: "fly" })).status, 400, "a call the moment does not have");
  const first = await veto({ at: T + 60_000, kind: "greeting", call: "greet-warm" });
  assert.deepEqual(await first.json(), { vetoes: { courtesy: 1 } });
  const again = await veto({ at: T + 60_000, kind: "greeting", call: "greet-warm" });
  assert.deepEqual(await again.json(), { vetoes: { courtesy: 1 } }, "once per moment");
  assert.equal((await read()).vetoes.length, 1);
});

test("vetoes take back the right they raise the bar on, in the standing and in the brief the room is handed", async () => {
  await say(true);
  const greeting = (i: number) => ({ seal: i.toString(16).padStart(64, "0"), cell: D, kind: "greeting", arm: null, call: "greet-warm", p: 0.7, did: "greet-warm", at: new Date(T + i * 60_000).toISOString() });
  await LOOKS.POST(new Request("https://echo.test/api/echo/looks", { method: "POST", headers: auth(json), body: JSON.stringify({ rows: Array.from({ length: 9 }, (_, i) => greeting(i + 1)) }) }));
  const courtesy = async () => (await standin()).standing.find((s) => s.bucket === "courtesy")!.level;
  const greetingMay = async () => verifyBrief((await standin()).brief, [SECRET], Date.now())!.calls.greeting!.may;
  assert.equal(await courtesy(), "act", "nine greetings called right");
  await veto({ at: T + 60_000, kind: "greeting", call: "greet-warm" });
  assert.equal(await courtesy(), "act", "one veto asks for nine looks and 0.65: nine right still pass");
  await veto({ at: T + 120_000, kind: "narrow-way", call: "aside" });
  assert.equal(await courtesy(), "ask", "two ask for twelve: close, and it holds back");
  assert.equal(await greetingMay(), "ask", "and the brief the room is handed says so");
});

test("a no takes the record of what it did and every veto; so does an erasure", async () => {
  await say(true);
  await fromRoom(report());
  await veto({ at: T + 60_000, kind: "greeting", call: "greet-warm" });
  await say(false);
  assert.deepEqual(await read(), { records: [], vetoes: [] });
  await say(true);
  await fromRoom(report());
  await veto({ at: T + 60_000, kind: "greeting", call: "greet-warm" });
  await villageStore()!.forgetSubject(ME);
  assert.equal((await villageStore()!.awayOf(ME))!.length, 0);
  assert.equal((await villageStore()!.vetoesOf(ME))!.length, 0);
});
