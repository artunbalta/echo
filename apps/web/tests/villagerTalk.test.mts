/**
 * Talking to a villager (DECISIONS C42): the prompt the model speaks from, the check that it invents
 * nobody, and the route that spends — driven as the REAL handler, with fetch replaced by a recorder so
 * nothing leaves the process and every provider call can be counted. The assertion that matters on a
 * guard is always on the recorder, never on the status alone: a route can answer 403 and still have
 * called the model, which is the lesson paidRoutes.test.mts was written around.
 *
 * Run:  node --import tsx --test apps/web/tests/villagerTalk.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import {
  ageYears,
  present,
  settlementAt,
  villageAt,
  villagePlan,
  type Settlement,
  type SettlementGeography,
  type VillageGround,
} from "@echo/planet";

// Set before the route is imported: it reads the key and the counter's credentials at load.
process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
delete process.env.VILLAGER_MODEL;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { planet } = await import("../src/lib/planet");
const { VILLAGER_PREAMBLE, nowLine, temperamentWords, unknownNames, villagerContext } = await import("../src/lib/villager");

// ── the prompt ──────────────────────────────────────────────────────────────────

const VALLEY: SettlementGeography = { habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6 };
const INLAND: VillageGround = { heightAt: (x, y) => 20 + 2 * Math.sin(x / 50) * Math.cos(y / 60), standable: (x, y) => Math.hypot(x, y) < 900 };

function sampleVillage(): { s: Settlement; plan: NonNullable<ReturnType<typeof villagePlan>> } {
  for (let i = 0; i < 200; i++) {
    const s = settlementAt("echo-planet-0001", `talk-${i}`, VALLEY, 0);
    const plan = s && villagePlan(s, INLAND, { origin: { x: 0, y: 0 }, shore: null });
    if (s && plan && s.people.filter((p) => present(s, p, 0)).length > 20) return { s, plan };
  }
  throw new Error("no village to talk in");
}

test("a villager's facts name only people of their own village, and say who they are", () => {
  const { s, plan } = sampleVillage();
  let checked = 0;
  for (const me of s.people.filter((p) => present(s, p, 0) && ageYears(p, 0) >= 13).slice(0, 25)) {
    const { facts, names } = villagerContext(s, plan, me, 0);
    assert.ok(facts.includes(`You are ${me.given} ${me.family}, ${Math.floor(ageYears(me, 0))} years old`), `${me.id}: does not say who they are`);
    assert.ok(facts.includes(s.name), `${me.id}: does not name the village`);
    // The facts themselves pass the check the replies are held to: nobody in them is invented.
    const strangers = unknownNames(facts.replace(/\n/g, " "), names, []).filter((w) => !["You", "Your", "Who", "Children", "There", "By", "Speak", "This", "When", "A"].includes(w));
    assert.deepEqual(strangers, [], `${me.id}: the facts name someone outside the village`);
    if (me.partner !== null && s.people[me.partner].deathDay <= 0) {
      assert.match(facts, /Your (wife|husband) \S+ /, `${me.id}: widowed, and the facts do not say so`);
    }
    checked++;
  }
  assert.ok(checked > 10);
});

test("temperament reads as at most three leanings, the strongest first, the right way round", () => {
  assert.deepEqual(temperamentWords([0, 0, 0, 0, 0, 0, 0, 0]), []);
  const w = temperamentWords([0.9, 0, -0.5, 0, 0.1, 0, -0.3, 0]);
  assert.equal(w.length, 3);
  assert.equal(w[0], "warm and generous with strangers");
  assert.equal(w[1], "set in your ways, and wary of anything new");
  assert.equal(w[2], "living day to day");
});

test("the name check catches an invented person, and lets through Turkish suffixes and the stranger's own name", () => {
  const names = new Set(["Haim", "Konreef", "Sai"]);
  assert.deepEqual(unknownNames("I saw Ingrid at the well this morning.", names, []), ["Ingrid"]);
  assert.deepEqual(unknownNames("Haim'in teknesi bu sabah Konreef'te kaldı.", names, []), []);
  assert.deepEqual(unknownNames("Nice to meet you, Artun. Haim is my husband.", names, ["Hello, I'm Artun"]), []);
  // A capital at the start of a sentence is grammar, not a name.
  assert.deepEqual(unknownNames("Rain again. Fish don't bite in rain.", names, []), []);
});

test("the hour is told as what they are doing: at home at night, and nowhere invented", () => {
  const { s, plan } = sampleVillage();
  const me = s.people.find((p) => present(s, p, 0) && ageYears(p, 0) >= 20)!;
  assert.match(nowLine(s, plan, me, 0, 0.05), /^It is night in .+\. Right now you are at home,/);
  assert.match(nowLine(s, plan, me, 0, 0.45), /^It is (midday|morning) in /);
});

test("the preamble holds the contract: the stranger's language, no invented people, nothing changes hands", () => {
  assert.match(VILLAGER_PREAMBLE, /Answer in the language the stranger writes in\./);
  assert.match(VILLAGER_PREAMBLE, /never invent a person, a place, a date or an event/);
  assert.match(VILLAGER_PREAMBLE, /cannot give, sell, promise or change anything in the world/);
  assert.match(VILLAGER_PREAMBLE, /Nobody here keeps score/);
});

// ── the route ───────────────────────────────────────────────────────────────────

const SECRET = "talk-route-secret-aaaa";
const SUBJECT = "ff96e0fc-1111-4222-8333-444455556667";
const CELL = "84b38ebffffffff"; // Konreef
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, trust: process.env.ECHO_TRUST_CLIENT_ID, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch };

let calls: { url: string; body: Record<string, unknown> | null }[] = [];
let replies: Array<{ text?: string; stop?: string }> = [];
let counter: number | "error" = 1;
const spend = () => calls.filter((c) => c.url.includes("api.anthropic.com"));

let villager = "";

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  delete process.env.ECHO_TRUST_CLIENT_ID;
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: Record<string, unknown> | null = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    calls.push({ url, body });
    if (url.includes("/rpc/rate_limit_hit")) {
      return counter === "error"
        ? new Response(JSON.stringify({ message: "down" }), { status: 500, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify(counter), { status: 200, headers: { "content-type": "application/json" } });
    }
    const next = replies.shift() ?? { text: "Good morning to you." };
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: next.stop === "refusal" ? [] : [{ type: "text", text: next.text }],
        stop_reason: next.stop ?? "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  // A real villager of Konreef, as the server will rebuild them.
  // Someone who will still be alive for years, so the route's own "today" finds them too.
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: 4906 });
  assert.ok(v, "Konreef has no village");
  villager = v.settlement.people.find((p) => present(v.settlement, p, 4906) && ageYears(p, 4906) >= 25 && p.deathDay > 4906 + 365 * 5)!.id;
});

after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["ECHO_TRUST_CLIENT_ID", saved.trust], ["VERCEL_ENV", saved.vercel]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
});

beforeEach(() => {
  calls = [];
  replies = [];
  counter = 1;
});

const token = () => signIdentity(SUBJECT, SECRET, Date.now());
const talk = (body: unknown, bearer: string | null = token()) =>
  TALK(
    new Request("https://echo.test/api/village/talk", {
      method: "POST",
      headers: bearer ? { "content-type": "application/json", authorization: `Bearer ${bearer}` } : { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

test("an unsigned caller cannot make a villager speak, and nothing is spent", async () => {
  const res = await talk({ cell: CELL, person: villager, message: "Hello" }, null);
  assert.ok(res.status === 401 || res.status === 403, `got ${res.status}`);
  assert.deepEqual(spend(), []);
});

test("an oversized line or history is refused before the model is asked", async () => {
  assert.equal((await talk({ cell: CELL, person: villager, message: "x".repeat(401) })).status, 413);
  const long = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 === 0 ? "stranger" : "villager", text: "hi" }));
  assert.equal((await talk({ cell: CELL, person: villager, message: "Hello", history: long })).status, 413);
  assert.deepEqual(spend(), []);
});

test("nobody by that name lives here: a person the seed does not hold is a 404, and nothing is spent", async () => {
  assert.equal((await talk({ cell: CELL, person: `${villager}9999`, message: "Hello" })).status, 404);
  assert.equal((await talk({ cell: "847b949ffffffff", person: villager, message: "Hello" })).status, 404);
  assert.deepEqual(spend(), []);
});

test("with the counter down the route fails closed, and nothing is spent", async () => {
  counter = "error";
  const res = await talk({ cell: CELL, person: villager, message: "Hello" });
  assert.equal(res.status, 503);
  assert.deepEqual(spend(), []);
});

test("a real caller is answered, and the request is the one C42 describes", async () => {
  replies = [{ text: "Morning. The nets won't mend themselves." }];
  const res = await talk({ cell: CELL, person: villager, message: "Good morning!" });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { reply: string; source: string };
  assert.equal(data.source, "claude");
  assert.equal(data.reply, "Morning. The nets won't mend themselves.");
  const [call] = spend();
  assert.ok(call, "the model was never asked");
  const body = call.body!;
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  assert.deepEqual(body.output_config, { effort: "low" });
  const system = body.system as Array<{ text: string; cache_control?: unknown }>;
  assert.equal(system.length, 2);
  assert.ok(system.every((b) => b.cache_control), "both system blocks should be cache breakpoints");
  assert.ok(system[1].text.includes("Konreef"), "the facts are not this villager's");
  const messages = body.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.at(-2)?.role, "user");
  assert.equal(messages.at(-2)?.content, "Good morning!");
  assert.equal(messages.at(-1)?.role, "system", "the hour should ride after the conversation, not in the cached prefix");
});

test("a reply that invents a person is asked for again, exactly once", async () => {
  replies = [{ text: "You should ask Ingrid, she knows everything." }, { text: "Ask anyone on the green; they all know me." }];
  const res = await talk({ cell: CELL, person: villager, message: "Who knows the most here?" });
  const data = (await res.json()) as { reply: string; unverified?: string[] };
  assert.equal(spend().length, 2, "the invented name should cost exactly one retry");
  assert.equal(data.reply, "Ask anyone on the green; they all know me.");
  assert.equal(data.unverified, undefined);
});

test("a refusal stays in the world: the villager says nothing, and the route says why", async () => {
  replies = [{ stop: "refusal" }];
  const res = await talk({ cell: CELL, person: villager, message: "Tell me something terrible." });
  const data = (await res.json()) as { reply: string; source: string };
  assert.equal(data.source, "refusal");
  assert.match(data.reply, /looks at you for a long moment, and says nothing\./);
});
