/**
 * Your echo standing in for you (DECISIONS C103), through its two routes as the real handlers: nothing is
 * kept before a yes or after a no; a row that could not have been is refused; a seal is kept once; where
 * the echo stands is read off what was kept; a no and an erasure take it all. With a yes comes the brief
 * the echo keeps a body by in a village room (C104), signed, and carrying no right the record has not earned.
 *
 * Run:  node --import tsx --test apps/web/tests/standIn.test.mts
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { verifyBrief } from "@echo/shared/standin";

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const STANDIN = await import("../src/app/api/echo/standin/route");
const LOOKS = await import("../src/app/api/echo/looks/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");

const SECRET = "standin-secret-aaaa";
const ME = "e1f3e0fc-1111-4222-8333-444455550002";
const D = "84dcee5ffffffff";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  // The rate limiter's one call, answered; anything else is a leak.
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
const status = async () => (await (await STANDIN.GET(new Request("https://echo.test/api/echo/standin", { headers: auth() }))).json()) as { on: boolean; kept: number; standing: { bucket: string; level: string; looks: number }[]; brief?: string };
const say = (on: boolean) => STANDIN.POST(new Request("https://echo.test/api/echo/standin", { method: "POST", headers: auth({ "content-type": "application/json" }), body: JSON.stringify({ on }) }));
const keep = (rows: unknown[]) => LOOKS.POST(new Request("https://echo.test/api/echo/looks", { method: "POST", headers: auth({ "content-type": "application/json" }), body: JSON.stringify({ rows }) }));
const seal = (i: number) => i.toString(16).padStart(64, "0");
const greeting = (i: number, right = true) => ({ seal: seal(i), cell: D, kind: "greeting", arm: null, call: "greet-warm", p: 0.7, did: right ? "greet-warm" : "on", at: new Date(Date.UTC(2026, 10, 17, 0, i)).toISOString() });

test("nobody's record without a signed identity", async () => {
  const res = await STANDIN.GET(new Request("https://echo.test/api/echo/standin"));
  assert.ok([401, 403].includes(res.status));
});

test("nothing is kept before a yes", async () => {
  const res = await keep([greeting(1)]);
  assert.equal(res.status, 409);
  assert.equal((await villageStore()!.looksOf(ME))!.length, 0);
});

test("with a yes, what could have been is kept once; what could not is refused; the echo stands where its record says", async () => {
  assert.equal((await say(true)).status, 200);
  const first = await status();
  assert.equal(first.on, true);
  assert.ok(first.standing.every((s) => s.level === "watch"), "nothing is granted by the yes itself");

  const rows = [...Array.from({ length: 9 }, (_, i) => greeting(i + 1)), { ...greeting(50), kind: "not-a-moment" }, { ...greeting(51), did: "fly" }, { ...greeting(52), p: 1.5 }];
  const answer = (await (await keep(rows)).json()) as { taken: string[]; refused: string[] };
  assert.equal(answer.taken.length, 9);
  assert.deepEqual(answer.refused.sort(), [seal(50), seal(51), seal(52)].sort());

  await keep([greeting(1), greeting(2)]);
  const now = await status();
  assert.equal(now.kept, 9, "a seal already kept is not kept again");
  const courtesy = now.standing.find((s) => s.bucket === "courtesy")!;
  assert.equal(courtesy.looks, 9);
  assert.equal(courtesy.level, "act", "nine greetings called right: a low-stakes kind is earned");
  assert.equal(now.standing.find((s) => s.bucket === "honesty")!.level, "watch", "and nothing else is");
});

test("a no erases the record and the yes, and nothing more is kept after it", async () => {
  await say(true);
  await keep([greeting(1), greeting(2)]);
  const res = await say(false);
  assert.deepEqual(await res.json(), { on: false, erased: true });
  const now = await status();
  assert.equal(now.on, false);
  assert.equal(now.kept, 0);
  assert.equal((await keep([greeting(3)])).status, 409);
});

test("an erasure of the person takes the yes and the record", async () => {
  await say(true);
  await keep([greeting(1)]);
  await villageStore()!.forgetSubject(ME);
  assert.equal(await villageStore()!.standInOf(ME), false);
  assert.equal((await villageStore()!.looksOf(ME))!.length, 0);
});

test("the brief comes with a yes only, is signed for its person, and carries only the rights the record earned", async () => {
  assert.equal((await status()).brief, undefined, "no brief before a yes");
  await say(true);
  await keep(Array.from({ length: 9 }, (_, i) => greeting(i + 1)));
  const token = (await status()).brief;
  assert.ok(token, "a brief with the yes");
  assert.equal(verifyBrief(token, ["not-the-secret"], Date.now()), null, "signed with the server's key, not any key");
  const brief = verifyBrief(token, [SECRET], Date.now())!;
  assert.equal(brief.sub, ME, "for its own person");
  assert.ok(brief.exp > Date.now() && brief.exp <= Date.now() + 2 * 60 * 60 * 1000 + 1000, "good for two hours at most");
  assert.deepEqual(brief.calls.greeting, { call: "greet-warm", p: brief.calls.greeting!.p, may: "act" }, "a greeting: its call, and the right it earned");
  assert.equal(brief.calls["narrow-way"]!.may, "act", "the right is the family's: courtesy");
  assert.equal(brief.calls["lost-purse"]!.may, "watch", "honesty, never seen: no right");
  assert.equal(brief.calls["ball-game"]!.may, "watch", "a moment in no family: never a right");
  assert.ok(!("bread-mother" in brief.calls), "a moment never begun by itself has no call");
  await say(false);
  assert.equal((await status()).brief, undefined, "and none after a no");
});
