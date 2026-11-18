/**
 * Your words kept for your echo to learn to talk from (DECISIONS C108), through its routes as the real
 * handlers, on the in-process store and with no model (the developer's machine): nothing is kept or guessed
 * before a yes; a guess is made only inside a conversation that was begun, and comes back sealed; settling it
 * is one talk look, counted once, and the answer one line; a box that is not yours, was changed, or waited too
 * long is refused; a deployment without a model guesses nothing; and a no erases every line and every guess.
 *
 * Run:  node --import tsx --test apps/web/tests/echoWords.test.mts
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { worldKey } from "@echo/shared";

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
delete process.env.ANTHROPIC_API_KEY;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const WORDS = await import("../src/app/api/echo/words/route");
const SAID = await import("../src/app/api/echo/said/route");
const GUESS = await import("../src/app/api/echo/guess/route");
const SETTLE = await import("../src/app/api/echo/settle/route");
const STANDIN = await import("../src/app/api/echo/standin/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { signConversation } = await import("../src/lib/villageTalk");
const { sealGuess } = await import("../src/lib/knowable/talkGuess");

const SECRET = "words-secret-aaaa";
const ME = "e1f3e0fc-1111-4222-8333-444455550007";
const YOU = "e1f3e0fc-1111-4222-8333-444455550008";
const D = "84dcee5ffffffff";
const PERSON = "0123456789abcdef";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  delete process.env.VERCEL_ENV;
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
  Date.now = saved.now;
});
beforeEach(() => {
  resetMemoryStore();
  Date.now = saved.now;
  delete process.env.VERCEL_ENV;
});

const auth = (who = ME) => ({ authorization: `Bearer ${signIdentity(who, SECRET, Date.now())}`, "content-type": "application/json" });
const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown, who = ME) =>
  route.POST(new Request(`https://echo.test${path}`, { method: "POST", headers: auth(who), body: JSON.stringify(body) }));
const words = async (who = ME) => (await (await WORDS.GET(new Request("https://echo.test/api/echo/words", { headers: auth(who) }))).json()) as { on: boolean; kept: number; guesses: { heard: string; guess: string; said: string; hit: boolean }[] };
const yes = (on: boolean, who = ME) => post(WORDS, "/api/echo/words", { on }, who);
const conv = (who = ME, room: string | null = null) => signConversation(who, worldKey(D, room), PERSON, Date.now())!;
const history = [
  { role: "stranger", text: "hello there" },
  { role: "villager", text: "Good day. Where are you headed?" },
];
const guess = (who = ME, extra: Record<string, unknown> = {}) => post(GUESS, "/api/echo/guess", { cell: D, person: PERSON, conv: conv(who), history, ...extra }, who);

test("nobody's words without a signed identity", async () => {
  const res = await WORDS.GET(new Request("https://echo.test/api/echo/words"));
  assert.ok([401, 403].includes(res.status));
});

test("before a yes: no line is kept and no guess is made", async () => {
  assert.equal((await words()).on, false);
  assert.equal((await post(SAID, "/api/echo/said", { cell: D, to: "person", said: "hi" })).status, 409);
  assert.equal((await guess()).status, 409);
  assert.equal((await villageStore()!.linesOf(ME, 10))!.length, 0);
});

test("a guess is made only inside a conversation that was begun, and comes back sealed", async () => {
  await yes(true);
  assert.equal((await post(GUESS, "/api/echo/guess", { cell: D, person: PERSON, conv: "1.forged", history })).status, 403);
  assert.equal((await post(GUESS, "/api/echo/guess", { cell: D, person: PERSON, conv: conv(YOU), history })).status, 403, "someone else's conversation");
  assert.equal((await guess(ME, { history: [history[0]] })).status, 400, "nothing to answer");
  assert.equal((await guess(ME, { history: Array.from({ length: 18 }, (_, i) => history[i % 2]) })).status, 413);
  const res = await guess();
  assert.equal(res.status, 200);
  const { box } = (await res.json()) as { box: string };
  assert.equal(typeof box, "string");
  assert.ok(!box.includes("Hello"), "what it guessed is not readable in the box");
});

test("settling: one talk look, counted once, and the answer kept as a line with the villager's words beside it", async () => {
  await yes(true);
  // Without a model the guess is the last line kept, so a line first, then the guess, then the same answer.
  assert.equal((await post(SAID, "/api/echo/said", { cell: D, to: "villager", said: "just passing through", heard: "Morning." })).status, 200);
  const { box } = (await (await guess()).json()) as { box: string };
  const s1 = await post(SETTLE, "/api/echo/settle", { box, said: "Just passing through!" });
  assert.equal(s1.status, 200);
  const r1 = (await s1.json()) as { kept: boolean; seal: string; hit?: unknown };
  assert.equal(r1.kept, true);
  assert.equal(r1.hit, undefined, "the panel is told nothing of the verdict");
  await post(SETTLE, "/api/echo/settle", { box, said: "Just passing through!" });
  const w = await words();
  assert.equal(w.guesses.length, 1, "a box settled twice counts once");
  assert.deepEqual({ heard: w.guesses[0]!.heard, guess: w.guesses[0]!.guess, said: w.guesses[0]!.said, hit: w.guesses[0]!.hit }, {
    heard: "Good day. Where are you headed?",
    guess: "just passing through",
    said: "Just passing through!",
    hit: true,
  });
  const lines = (await villageStore()!.linesOf(ME, 10))!;
  assert.equal(lines[0]!.heard, "Good day. Where are you headed?");
  assert.equal(lines[0]!.to, "villager");

  // Where talking stands is read off those looks, beside every other kind.
  await post(STANDIN, "/api/echo/standin", { on: true });
  const st = (await (await STANDIN.GET(new Request("https://echo.test/api/echo/standin", { headers: auth() }))).json()) as { standing: { bucket: string; looks: number; right: number }[] };
  const talk = st.standing.find((s) => s.bucket === "talk")!;
  assert.deepEqual([talk.looks, talk.right], [1, 1]);
});

test("a box that is not yours, was changed, or waited too long is refused, and nothing is counted", async () => {
  await yes(true);
  await yes(true, YOU);
  const { box } = (await (await guess()).json()) as { box: string };
  assert.equal((await post(SETTLE, "/api/echo/settle", { box, said: "x" }, YOU)).status, 403);
  const raw = Buffer.from(box, "base64url");
  raw[raw.length - 1] ^= 1;
  assert.equal((await post(SETTLE, "/api/echo/settle", { box: raw.toString("base64url"), said: "x" })).status, 400);
  const old = sealGuess({ v: 1, sub: ME, cell: D, room: null, person: PERSON, heard: "Hm?", guess: "hm", sure: 0.2, at: Date.now() - 16 * 60 * 1000, source: "mock" }, SECRET);
  assert.equal((await post(SETTLE, "/api/echo/settle", { box: old, said: "hm" })).status, 410);
  assert.equal((await post(SETTLE, "/api/echo/settle", { box, said: "" })).status, 400);
  assert.equal((await post(SETTLE, "/api/echo/settle", { box, said: "x".repeat(401) })).status, 413);
  assert.equal((await words()).guesses.length, 0);
});

test("a line to a person is kept without anything they said; a person's words are never taken", async () => {
  await yes(true);
  assert.equal((await post(SAID, "/api/echo/said", { cell: D, room: "ABCDE", to: "person", said: "over here!", heard: "where are you?" })).status, 200);
  assert.equal((await post(SAID, "/api/echo/said", { cell: D, room: "ABCDE", to: "aloud", said: "anyone?" })).status, 200);
  assert.equal((await post(SAID, "/api/echo/said", { cell: D, to: "shout", said: "x" })).status, 400);
  const lines = (await villageStore()!.linesOf(ME, 10))!;
  assert.deepEqual(
    lines.map((l) => [l.to, l.said, l.heard, l.room]),
    [
      ["aloud", "anyone?", null, "ABCDE"],
      ["person", "over here!", null, "ABCDE"],
    ],
  );
});

test("a deployment with no model guesses nothing", async () => {
  await yes(true);
  process.env.VERCEL_ENV = "production";
  const res = await guess();
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, "no_model");
});

test("a no erases every line and every guess, and nothing is kept after it", async () => {
  await yes(true);
  await post(SAID, "/api/echo/said", { cell: D, to: "aloud", said: "hello all" });
  const { box } = (await (await guess()).json()) as { box: string };
  await post(SETTLE, "/api/echo/settle", { box, said: "hello all" });
  assert.equal((await words()).kept, 2);
  const no = await yes(false);
  assert.deepEqual(await no.json(), { on: false, erased: true });
  assert.equal((await villageStore()!.linesOf(ME, 10))!.length, 0);
  assert.equal((await villageStore()!.talkLooksOf(ME))!.length, 0);
  assert.equal((await post(SETTLE, "/api/echo/settle", { box, said: "hello all" })).status, 409);
  assert.equal((await post(SAID, "/api/echo/said", { cell: D, to: "aloud", said: "again" })).status, 409);
});

test("an erasure takes the yes, the lines and the guesses", async () => {
  await yes(true);
  await post(SAID, "/api/echo/said", { cell: D, to: "aloud", said: "bye" });
  await villageStore()!.forgetSubject(ME);
  assert.equal(await villageStore()!.wordsOf(ME), false);
  assert.equal((await villageStore()!.linesOf(ME, 10))!.length, 0);
});
