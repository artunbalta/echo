/**
 * The model's half of an echo learning to talk (DECISIONS C108), with the provider answered here: the guess
 * is asked for before the answer exists and is shown the person's lines, the judge is shown two replies as
 * A and B and is never told that one is a guess, and a refusal or a reply that cannot be read counts as
 * nothing either way.
 *
 * Run:  node --import tsx --test apps/web/tests/echoWordsModel.test.mts
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { worldKey } from "@echo/shared";
import { signSpeak } from "@echo/shared/standin";

process.env.VILLAGE_STORE = "memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const WORDS = await import("../src/app/api/echo/words/route");
const SAID = await import("../src/app/api/echo/said/route");
const GUESS = await import("../src/app/api/echo/guess/route");
const SETTLE = await import("../src/app/api/echo/settle/route");
const SPEAK = await import("../src/app/api/echo/speak/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { signConversation } = await import("../src/lib/villageTalk");

const SECRET = "words-model-secret";
const ME = "e1f3e0fc-1111-4222-8333-444455550009";
const D = "84dcee5ffffffff";
const PERSON = "0123456789abcdef";
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch };

/** What the provider was sent, and what it answers next. */
let sent: { url: string; body: { model: string; system: { text: string }[]; messages: { role: string; content: string }[]; output_config: unknown } }[] = [];
let answers: { text: string; stop?: string }[] = [];

const message = (text: string, stop = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      const a = answers.shift() ?? { text: "{}" };
      return new Response(JSON.stringify(message(a.text, a.stop)), { status: 200, headers: { "content-type": "application/json" } });
    }
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
  sent = [];
  answers = [];
});

const auth = () => ({ authorization: `Bearer ${signIdentity(ME, SECRET, Date.now())}`, "content-type": "application/json" });
const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown) => route.POST(new Request(`https://echo.test${path}`, { method: "POST", headers: auth(), body: JSON.stringify(body) }));
const history = [
  { role: "stranger", text: "hello there" },
  { role: "villager", text: "Good day. Where are you headed?" },
];
const guess = () => post(GUESS, "/api/echo/guess", { cell: D, person: PERSON, conv: signConversation(ME, worldKey(D, null), PERSON, Date.now()), history });

test("the guess is asked for with their lines and the conversation, before any answer exists, and comes back sealed", async () => {
  await post(WORDS, "/api/echo/words", { on: true });
  await post(SAID, "/api/echo/said", { cell: D, to: "villager", said: "nah im good thx", heard: "Would you like some bread?" });
  answers.push({ text: JSON.stringify({ say: "just wandering", sure: 0.35 }) });
  const res = await guess();
  assert.equal(res.status, 200);
  const { box } = (await res.json()) as { box: string };
  assert.ok(!box.includes("wandering"));
  assert.equal(sent.length, 1);
  const asked = sent[0]!.body;
  assert.equal(asked.model, "claude-opus-5-5");
  const prompt = asked.messages.map((m) => m.content).join("\n");
  assert.ok(prompt.includes("nah im good thx"), "their own line is shown");
  assert.ok(prompt.includes("Where are you headed?"), "and the villager's line it answers");
  assert.match(asked.system[0]!.text, /as they would/);

  // The judge: two replies as A and B, the villager's line, and no word of which was guessed.
  answers.push({ text: JSON.stringify({ same: true, why: "both say they are wandering" }) });
  const settled = await post(SETTLE, "/api/echo/settle", { box, said: "just wandering about" });
  assert.equal(settled.status, 200);
  const judged = sent[1]!.body;
  const shown = judged.messages.map((m) => m.content).join("\n");
  assert.ok(shown.includes("Reply A") && shown.includes("Reply B"));
  assert.ok(shown.includes('"just wandering"') && shown.includes('"just wandering about"'));
  assert.ok(!/guess/i.test(shown) && !/guess/i.test(judged.system[0]!.text), "the judge is not told one is a guess");
  const looks = (await villageStore()!.talkLooksOf(ME))!;
  assert.deepEqual(
    looks.map((l) => [l.guess, l.said, l.p, l.hit, l.why]),
    [["just wandering", "just wandering about", 0.35, true, "both say they are wandering"]],
  );
});

test("a refusal, or a verdict that cannot be read, counts as nothing either way; the answer is still one of their lines", async () => {
  await post(WORDS, "/api/echo/words", { on: true });
  answers.push({ text: JSON.stringify({ say: "home", sure: 0.5 }) });
  const { box } = (await (await guess()).json()) as { box: string };
  answers.push({ text: "", stop: "refusal" });
  const r1 = await post(SETTLE, "/api/echo/settle", { box, said: "home, to sleep" });
  assert.equal(r1.status, 502);
  answers.push({ text: "not json" });
  const r2 = await post(SETTLE, "/api/echo/settle", { box, said: "home, to sleep" });
  assert.equal(r2.status, 502);
  assert.equal((await villageStore()!.talkLooksOf(ME))!.length, 0);
  assert.ok((await villageStore()!.linesOf(ME, 10))!.some((l) => l.said === "home, to sleep"));
});

test("a guess the model would not give is no guess, and nothing is sealed", async () => {
  await post(WORDS, "/api/echo/words", { on: true });
  answers.push({ text: "", stop: "refusal" });
  assert.equal((await guess()).status, 502);
  answers.push({ text: JSON.stringify({ say: "", sure: 0.5 }) });
  assert.equal((await guess()).status, 502);
  answers.push({ text: JSON.stringify({ say: "ok", sure: 7 }) });
  const res = await guess();
  assert.equal(res.status, 200, "a sureness past 1 is read as 1");
});

test("speaking for them (C109): their lines and the conversation go to the model, under rules of what it never says", async () => {
  const s = villageStore()!;
  await s.setWords(ME, true);
  await s.keepLine(ME, { at: new Date().toISOString(), cell: D, room: "TAKES", to: "aloud", heard: null, said: "anyone up for fishing" });
  for (let i = 0; i < 30; i++) {
    await s.keepTalkLook(ME, { seal: i.toString(16).padStart(64, "0"), cell: D, heard: "h", guess: "g", p: 0.8, said: "s", hit: true, why: null, sealedAt: new Date(Date.UTC(2026, 10, 18, 0, i)).toISOString() });
  }
  const call = (turns: { from: "them" | "me"; text: string }[]) => {
    const body = JSON.stringify({ sub: ME, cell: D, room: "TAKES", mode: "act", turns, at: Date.now() });
    return SPEAK.POST(new Request("https://echo.test/api/echo/speak", { method: "POST", headers: { "content-type": "application/json", "x-echo-room": signSpeak(body, SECRET) }, body }));
  };
  answers.push({ text: JSON.stringify({ say: "fishing, mostly", sure: 0.55 }) });
  const res = await call([{ from: "them", text: "what are you up to?" }]);
  assert.deepEqual(await res.json(), { say: "fishing, mostly", sure: 0.55 });
  const asked = sent.at(-1)!.body;
  const prompt = asked.messages.map((m) => m.content).join("\n");
  assert.ok(prompt.includes("anyone up for fishing"), "their own line");
  assert.ok(prompt.includes("Someone in the village: what are you up to?"), "and what was said to them, to be answered");
  const rules = asked.system[0]!.text;
  assert.match(rules, /never claim to be a human, and never deny being an echo/);
  assert.match(rules, /never say who they are outside the game/);
  assert.match(rules, /never promise anything for them/);

  // They would not answer: an empty line is silence.
  answers.push({ text: JSON.stringify({ say: "", sure: 0.5 }) });
  assert.deepEqual(await (await call([{ from: "them", text: "oi" }])).json(), { say: null, sure: 0.5 });
  // A refusal is silence too.
  answers.push({ text: "", stop: "refusal" });
  assert.deepEqual(await (await call([{ from: "them", text: "oi?" }])).json(), { say: null });
});
