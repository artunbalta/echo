/**
 * What an echo says for its person in a village room (DECISIONS C109), through the routes as the real
 * handlers, on the in-process store and with no model: only a room's signed request is answered; the right to
 * talk is read again here, not taken from the room (`act` to answer, `ask` to put a line to the person); the
 * brief carries where talking stands; "not me" of a line said asks more of talking; a room's report keeps the
 * lines said and nothing said to the echo.
 *
 * Run:  node --import tsx --test apps/web/tests/echoSpeak.test.mts
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import type { AwayReport, SpeakRequest } from "@echo/shared";
import { signIdentity } from "@echo/shared/identity";
import { signReport, signSpeak, verifyBrief } from "@echo/shared/standin";

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
delete process.env.ANTHROPIC_API_KEY;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const SPEAK = await import("../src/app/api/echo/speak/route");
const STANDIN = await import("../src/app/api/echo/standin/route");
const VETO = await import("../src/app/api/echo/veto/route");
const KEEPING = await import("../src/app/api/echo/keeping/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");

const SECRET = "speak-secret-aaaa";
const ME = "e1f3e0fc-1111-4222-8333-444455550011";
const D = "84dcee5ffffffff";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  process.env.ECHO_IDENTITY_SECRET = saved.secret;
  if (saved.vercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = saved.vercel;
  globalThis.fetch = saved.fetch;
});
beforeEach(() => {
  resetMemoryStore();
  delete process.env.VERCEL_ENV;
});

const json = { "content-type": "application/json" };
const auth = () => ({ authorization: `Bearer ${signIdentity(ME, SECRET, Date.now())}`, ...json });
const ask = (over: Partial<SpeakRequest> = {}): SpeakRequest => ({ sub: ME, cell: D, room: "TAKES", mode: "act", turns: [{ from: "them", text: "hello, where to?" }], at: Date.now(), ...over });
const speak = (r: unknown, key = SECRET, tamper = (b: string) => b) => {
  const body = JSON.stringify(r);
  return SPEAK.POST(new Request("https://echo.test/api/echo/speak", { method: "POST", headers: { ...json, "x-echo-room": signSpeak(body, key) }, body: tamper(body) }));
};
/** Their words kept, a line of theirs, and `n` settled guesses, `right` of them right. */
async function earned(n: number, right = n) {
  const s = villageStore()!;
  await s.setWords(ME, true);
  await s.keepLine(ME, { at: new Date().toISOString(), cell: D, room: null, to: "villager", heard: "Morning.", said: "just passing through" });
  for (let i = 0; i < n; i++) {
    await s.keepTalkLook(ME, { seal: i.toString(16).padStart(64, "0"), cell: D, heard: "h", guess: "g", p: 0.8, said: "s", hit: i < right, why: null, sealedAt: new Date(Date.UTC(2026, 10, 18, 0, i)).toISOString() });
  }
}

test("only a room's request is answered: signed with the server's key, over exactly what it sent", async () => {
  await earned(30);
  assert.equal((await speak(ask(), "another-key")).status, 401);
  assert.equal((await speak(ask(), SECRET, (b) => b.replace("where to", "where from"))).status, 401);
  const unsigned = await SPEAK.POST(new Request("https://echo.test/api/echo/speak", { method: "POST", headers: json, body: JSON.stringify(ask()) }));
  assert.equal(unsigned.status, 401);
  assert.equal((await speak(ask())).status, 200);
});

test("a request it could not have sent is refused", async () => {
  await earned(30);
  assert.equal((await speak(ask({ turns: [{ from: "me", text: "hi" }] }))).status, 400, "it answers a line said to it");
  assert.equal((await speak(ask({ turns: [] }))).status, 400);
  assert.equal((await speak(ask({ turns: [{ from: "them", text: "x".repeat(241) }] }))).status, 400);
  assert.equal((await speak(ask({ turns: Array.from({ length: 9 }, () => ({ from: "them" as const, text: "a" })) }))).status, 400);
  assert.equal((await speak(ask({ room: "takes" }))).status, 400);
  assert.equal((await speak(ask({ cell: "8a2a1072b59ffff" }))).status, 400);
  assert.equal((await speak(ask({ mode: "shout" as never }))).status, 400);
  assert.equal((await speak(ask({ at: Date.now() - 120_000 }))).status, 410, "an old request is not about a line just said");
});

test("the right to talk is read here: words kept, and talking at act to answer, at ask to put it to the person", async () => {
  assert.equal((await speak(ask())).status, 409, "no yes to keeping words");
  await earned(29);
  const early = await speak(ask());
  assert.equal(early.status, 409);
  assert.equal(((await early.json()) as { error: string }).error, "not_earned", "29 is not 30");
  resetMemoryStore();
  await earned(30);
  const res = await speak(ask());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { say: "just passing through", sure: 0.3 }, "without a model: their last line");

  // 36 right and one "not me" of a line said: 45 needed now, so close (ask), and not there (act).
  resetMemoryStore();
  await earned(36);
  await villageStore()!.keepVeto(ME, { at: 1, kind: "talk", call: "answer" });
  assert.equal((await speak(ask({ mode: "act" }))).status, 409, "not to answer by itself");
  assert.equal((await speak(ask({ mode: "ask" }))).status, 200, "but to put a line to its person");
});

test("a deployment without a model says nothing", async () => {
  await earned(30);
  process.env.VERCEL_ENV = "production";
  const res = await speak(ask());
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, "no_model");
});

test("the brief carries where talking stands, and 'not me' of a line said asks more of it", async () => {
  await villageStore()!.setStandIn(ME, true);
  await earned(30);
  const st = (await (await STANDIN.GET(new Request("https://echo.test/api/echo/standin", { headers: auth() }))).json()) as { brief: string; standing: { bucket: string; level: string; needs: { looks: number } }[] };
  assert.equal(verifyBrief(st.brief, [SECRET], Date.now())?.talk, "act");
  assert.equal((await VETO.POST(new Request("https://echo.test/api/echo/veto", { method: "POST", headers: auth(), body: JSON.stringify({ at: 5, kind: "talk", call: "shout" }) }))).status, 400);
  const v = await VETO.POST(new Request("https://echo.test/api/echo/veto", { method: "POST", headers: auth(), body: JSON.stringify({ at: 5, kind: "talk", call: "answer" }) }));
  assert.equal(v.status, 200);
  assert.deepEqual(((await v.json()) as { vetoes: Record<string, number> }).vetoes, { talk: 1 });
  const after = (await (await STANDIN.GET(new Request("https://echo.test/api/echo/standin", { headers: auth() }))).json()) as { brief: string; standing: { bucket: string; level: string; needs: { looks: number } }[] };
  const talk = after.standing.find((s) => s.bucket === "talk")!;
  assert.equal(talk.needs.looks, 45);
  assert.notEqual(verifyBrief(after.brief, [SECRET], Date.now())?.talk, "act", "and the brief no longer lets it answer by itself");
});

test("a room's report keeps the lines said for the person, and could not carry anything said to it", async () => {
  await villageStore()!.setStandIn(ME, true);
  const T = Date.UTC(2026, 10, 18, 9);
  const report = (said: unknown, extra: Record<string, unknown> = {}): AwayReport =>
    ({
      sub: ME,
      cell: D,
      room: "TAKES",
      since: T,
      until: T + 60_000,
      log: [{ at: T + 1000, kind: "talk", call: "answer", p: 0.6, may: "act", did: "answer", said, ...extra }],
    }) as AwayReport;
  const send = (r: AwayReport) => {
    const body = JSON.stringify(r);
    return KEEPING.POST(new Request("https://echo.test/api/echo/keeping", { method: "POST", headers: { ...json, "x-echo-room": signReport(body, SECRET) }, body }));
  };
  assert.equal((await send(report("x".repeat(241)))).status, 400, "longer than a line in a room can be");
  assert.equal((await send(report(""))).status, 400);
  assert.equal((await send(report("just walking, you?", { heard: "where are you going?" }))).status, 200);
  const kept = (await villageStore()!.awayOf(ME))!;
  assert.deepEqual(kept[0]!.log, [{ at: T + 1000, kind: "talk", call: "answer", p: 0.6, may: "act", did: "answer", said: "just walking, you?" }]);
  assert.ok(!JSON.stringify(kept).includes("where are you going"), "a field of someone else's words is not kept");
});
