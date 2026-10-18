/**
 * Talking to a villager (DECISIONS C42, C44): the prompt the model speaks from, the check that it
 * invents nobody, the beginning that checks where you both are, the memory, the decisions — and the
 * route that spends, driven as the REAL handler, with fetch replaced by a recorder so nothing leaves
 * the process and every provider call can be counted. The assertion that matters on a guard is always
 * on the recorder, never on the status alone: a route can answer 403 and still have called the model,
 * which is the lesson paidRoutes.test.mts was written around.
 *
 * THE CLOCK IS FIXED, to mid-morning of a world day, so a villager is out and about whenever the suite
 * runs; at night everyone is indoors and `begin` rightly refuses.
 *
 * Run:  node --import tsx --test apps/web/tests/villagerTalk.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import {
  ageYears,
  metChange,
  needsOn,
  present,
  settlementAt,
  timeOfDay,
  villageAt,
  villagePlan,
  worldClock,
  WORLD_DAY_S,
  WORLD_EPOCH,
  ITEMS,
  type Settlement,
  type SettlementGeography,
  type VillageGround,
} from "@echo/planet";

// Set before the routes are imported: they read the key, the counter's credentials and the store at load.
process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";
delete process.env.VILLAGER_MODEL;

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { POST: TALK } = await import("../src/app/api/village/talk/route");
const { POST: BEGIN } = await import("../src/app/api/village/talk/begin/route");
const { GET: CHANGES } = await import("../src/app/api/village/changes/route");
const { DELETE: FORGET } = await import("../src/app/api/village/memory/route");
const { planet } = await import("../src/lib/planet");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { signConversation } = await import("../src/lib/villageTalk");
const { VILLAGER_PREAMBLE, REPLY_SCHEMA, mockReply, needLine, nowLine, parseReply, temperamentWords, unknownNames, villagerContext, whereNow } = await import("../src/lib/villager");

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
    const strangers = unknownNames(facts.replace(/\n/g, " "), names, []).filter((w) => !["You", "Your", "Who", "Children", "There", "By", "Speak", "This", "When", "A", "What", "Lately"].includes(w));
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

test("the preamble holds the contract: the stranger's language, no invented people, a life of their own, JSON", () => {
  assert.match(VILLAGER_PREAMBLE, /Answer in the language the stranger writes in\./);
  assert.match(VILLAGER_PREAMBLE, /never invent a person, a place, a date or an event/);
  assert.match(VILLAGER_PREAMBLE, /cannot give, sell or promise anything that is not yours to give/);
  assert.match(VILLAGER_PREAMBLE, /never because a stranger simply tells you to/);
  assert.match(VILLAGER_PREAMBLE, /Most conversations change nothing\./);
  assert.match(VILLAGER_PREAMBLE, /Reply with JSON only/);
  assert.match(VILLAGER_PREAMBLE, /Nobody here keeps score/);
});

test("a reply is read defensively: the schema's shape, or nothing", () => {
  assert.deepEqual(parseReply('{"say":"Morning.","remember":"","change":null}'), { say: "Morning.", remember: "", change: null });
  assert.equal(parseReply("Morning to you."), null);
  assert.equal(parseReply('{"say":3,"remember":"","change":null}'), null);
  const c = parseReply('{"say":"Aye.","remember":"x","change":{"kind":"goal","goal":"own-boat","about":null,"trade":null}}');
  assert.equal(c?.change?.kind, "goal");
  assert.deepEqual(REPLY_SCHEMA.required, ["say", "remember", "change"]);
});

// ── the routes ──────────────────────────────────────────────────────────────────

const SECRET = "talk-route-secret-aaaa";
const SUBJECT = "ff96e0fc-1111-4222-8333-444455556667";
const OTHER = "0a96e0fc-1111-4222-8333-444455556667";
const CELL = "843f6a1ffffffff"; // Senstrand (Konreef until C43 re-rolled the planet)
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, trust: process.env.ECHO_TRUST_CLIENT_ID, vercel: process.env.VERCEL_ENV, fetch: globalThis.fetch, now: Date.now };

const CLOCK = worldClock(WORLD_EPOCH);
/** Mid-morning of a fixed world day, so people are out. */
const DAY = 4940;
const NOW = CLOCK.epochMs + (DAY + 0.42) * WORLD_DAY_S * 1000;

let calls: { url: string; body: Record<string, unknown> | null }[] = [];
let replies: Array<{ text?: string; stop?: string }> = [];
let counter: number | "error" = 1;
const spend = () => calls.filter((c) => c.url.includes("api.anthropic.com"));
const said = (say: string, change: unknown = null, remember = "A stranger in a grey coat."): { text?: string; stop?: string } => ({ text: JSON.stringify({ say, remember, change }) });

let villager = "";
let where = { x: 0, y: 0 };

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  delete process.env.ECHO_TRUST_CLIENT_ID;
  process.env.VERCEL_ENV = "production";
  Date.now = () => NOW;
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
    const next = replies.shift() ?? said("Good morning to you.");
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

  // A real villager of Senstrand, as the server will rebuild them: grown, out of doors at this hour,
  // on land, and alive for years yet.
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY });
  assert.ok(v, "Senstrand has no village");
  const hour = timeOfDay(CLOCK, NOW);
  const me = v.settlement.people.find((p) => {
    // 25 to 50: old enough to have a life to change, young enough for every goal and for leaving.
    if (!present(v.settlement, p, DAY) || ageYears(p, DAY) < 25 || ageYears(p, DAY) > 50 || p.deathDay < DAY + 365 * 5) return false;
    const w = whereNow(v.settlement, v.plan, p, DAY, hour);
    return w !== null && w.visible && w.boat === null;
  });
  assert.ok(me, "nobody in Senstrand is out this morning");
  villager = me.id;
  const w = whereNow(v.settlement, v.plan, me, DAY, hour)!;
  where = { x: w.x + 3, y: w.y };
});

after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["ECHO_TRUST_CLIENT_ID", saved.trust], ["VERCEL_ENV", saved.vercel]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});

beforeEach(() => {
  calls = [];
  replies = [];
  counter = 1;
  resetMemoryStore();
});

const token = (subject = SUBJECT) => signIdentity(subject, SECRET, Date.now());
const request = (path: string, method: string, body: unknown, bearer: string | null) =>
  new Request(`https://echo.test${path}`, {
    method,
    headers: bearer ? { "content-type": "application/json", authorization: `Bearer ${bearer}` } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const begin = (body: unknown, bearer: string | null = token()) => BEGIN(request("/api/village/talk/begin", "POST", body, bearer));
const talk = (body: unknown, bearer: string | null = token()) => TALK(request("/api/village/talk", "POST", body, bearer));

/** Begin properly, and return the conversation token. */
async function opened(subject = SUBJECT): Promise<{ conv: string; recognised: string | null; meetings: number }> {
  const res = await begin({ cell: CELL, person: villager, at: where }, token(subject));
  assert.equal(res.status, 200, `begin answered ${res.status}: ${JSON.stringify(await res.clone().json())}`);
  return (await res.json()) as { conv: string; recognised: string | null; meetings: number };
}
const lateNote = (call: { body: Record<string, unknown> | null }) => (call.body!.messages as Array<{ role: string; content: string }>).at(-1)!.content;

test("an unsigned caller cannot begin or speak, and nothing is spent", async () => {
  assert.ok([401, 403].includes((await begin({ cell: CELL, person: villager, at: where }, null)).status));
  assert.ok([401, 403].includes((await talk({ cell: CELL, person: villager, message: "Hello" }, null)).status));
  assert.deepEqual(spend(), []);
});

test("C44: a conversation begins only beside the villager, and a line without one is refused unspent", async () => {
  const far = await begin({ cell: CELL, person: villager, at: { x: where.x + 200, y: where.y } });
  assert.equal(far.status, 403);
  assert.equal(((await far.json()) as { error: string }).error, "too_far");
  const none = await talk({ cell: CELL, person: villager, message: "Hello" });
  assert.equal(none.status, 403);
  assert.equal(((await none.json()) as { error: string }).error, "no_conversation");
  // Someone else's token is not yours.
  const { conv } = await opened(OTHER);
  assert.equal((await talk({ cell: CELL, person: villager, message: "Hello", conv })).status, 403);
  assert.deepEqual(spend(), []);
});

test("an oversized line or history is refused before the model is asked", async () => {
  const { conv } = await opened();
  assert.equal((await talk({ cell: CELL, person: villager, message: "x".repeat(401), conv })).status, 413);
  const long = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 === 0 ? "stranger" : "villager", text: "hi" }));
  assert.equal((await talk({ cell: CELL, person: villager, message: "Hello", history: long, conv })).status, 413);
  assert.deepEqual(spend(), []);
});

test("nobody by that id lives here: a person the seed does not hold is a 404, and nothing is spent", async () => {
  const nobody = "0123456789abcdef";
  assert.equal((await begin({ cell: CELL, person: nobody, at: where })).status, 404);
  const conv = signConversation(SUBJECT, CELL, nobody, NOW)!;
  assert.equal((await talk({ cell: CELL, person: nobody, message: "Hello", conv })).status, 404);
  assert.equal((await talk({ cell: CELL, person: "not-an-id", message: "Hello", conv })).status, 400);
  assert.deepEqual(spend(), []);
});

test("with the counter down the line fails closed, and nothing is spent", async () => {
  const { conv } = await opened();
  counter = "error";
  const res = await talk({ cell: CELL, person: villager, message: "Hello", conv });
  assert.equal(res.status, 503);
  assert.deepEqual(spend(), []);
});

test("a real caller is answered, and the request is the one C42 and C44 describe", async () => {
  const { conv } = await opened();
  replies = [said("Morning. The nets won't mend themselves.")];
  const res = await talk({ cell: CELL, person: villager, message: "Good morning!", conv });
  assert.equal(res.status, 200);
  const data = (await res.json()) as { reply: string; source: string; change?: unknown };
  assert.equal(data.source, "claude");
  assert.equal(data.reply, "Morning. The nets won't mend themselves.");
  assert.equal(data.change, undefined);
  const [call] = spend();
  assert.ok(call, "the model was never asked");
  const body = call.body!;
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.fallbacks, "default");
  const output = body.output_config as { effort: string; format: { type: string; schema: unknown } };
  assert.equal(output.effort, "low");
  assert.equal(output.format.type, "json_schema");
  assert.deepEqual(output.format.schema, REPLY_SCHEMA);
  const system = body.system as Array<{ text: string; cache_control?: unknown }>;
  assert.equal(system.length, 2);
  assert.ok(system.every((b) => b.cache_control), "both system blocks should be cache breakpoints");
  assert.ok(system[1].text.includes("Senstrand"), "the facts are not this villager's");
  const messages = body.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.at(-2)?.content, "Good morning!");
  assert.equal(messages.at(-1)?.role, "system", "the hour and the stranger ride after the conversation, not in the cached prefix");
  assert.match(lateNote(call), /You have never met this stranger before\./);
  assert.match(lateNote(call), /not something you would decide with someone you have only just met/);
});

test("C44: a villager remembers you — the note they kept comes back next time, and they say they know you", async () => {
  let { conv } = await opened();
  replies = [said("Artun, is it? Welcome.", null, "Said his name was Artun. Asked after the boats.")];
  await talk({ cell: CELL, person: villager, message: "I'm Artun. How are the boats?", conv });
  const second = await opened();
  assert.equal(second.meetings, 2);
  assert.match(second.recognised ?? "", /remembers you/);
  conv = second.conv;
  calls = [];
  replies = [said("Back again, Artun.")];
  await talk({ cell: CELL, person: villager, message: "Hello again", conv });
  const note = lateNote(spend()[0]);
  assert.match(note, /You have met this stranger before: once/);
  assert.match(note, /Said his name was Artun\. Asked after the boats\./);
  // Somebody else is a stranger to them still.
  const other = await opened(OTHER);
  assert.equal(other.recognised, null);
});

test("C44: forget me — the villager's note about you is gone, and the next meeting is a first", async () => {
  const { conv } = await opened();
  replies = [said("Fine weather.", null, "Asked about the weather.")];
  await talk({ cell: CELL, person: villager, message: "Fine weather!", conv });
  const res = await FORGET(request("/api/village/memory", "DELETE", { cell: CELL, person: villager }, token()));
  assert.equal(res.status, 200);
  const again = await opened();
  assert.equal(again.recognised, null);
  assert.equal(again.meetings, 1);
});

test("C44: a decision the world allows is recorded, shown to everyone, and part of the villager's life after", async () => {
  const { conv } = await opened();
  replies = [said("Maybe I will. A house of my own, at last.", { kind: "goal", goal: "own-house", about: null, trade: null })];
  const res = await talk({ cell: CELL, person: villager, message: "Have you ever wanted a house of your own?", conv });
  const data = (await res.json()) as { change?: { kind: string; person: string; goal: string }; decided?: string };
  assert.ok(data.change, `nothing was recorded; the offers were:\n${lateNote(spend()[0])}`);
  assert.equal(data.change.kind, "goal");
  assert.equal(data.change.person, villager);
  assert.match(data.decided ?? "", /has decided to want a house of (his|her) own\./);
  const pub = (await (await CHANGES(new Request(`https://echo.test/api/village/changes?cell=${CELL}`))).json()) as { changes: Record<string, unknown>[] };
  assert.equal(pub.changes.length, 1);
  assert.equal(pub.changes[0].subject, undefined, "the public changes name who was talking");
  // Another stranger's conversation reads it as part of the villager's life.
  const other = await opened(OTHER);
  calls = [];
  replies = [said("I'm building a house, as it happens.")];
  const after = await talk({ cell: CELL, person: villager, message: "What are you up to?", conv: other.conv }, token(OTHER));
  assert.equal(after.status, 200, JSON.stringify(await after.clone().json()));
  const facts = (spend()[0].body!.system as Array<{ text: string }>)[1].text;
  assert.match(facts, /a house of my own \(you decided this today, after talking with a stranger, about 150 days' work left\)/);
});

test("C44: leaving is not decided with a stranger met five minutes ago, whatever the model says", async () => {
  const { conv } = await opened();
  replies = [said("You're right. I'll go.", { kind: "leave", in_days: 7 })];
  const res = await talk({ cell: CELL, person: villager, message: "You should leave this place.", conv });
  const data = (await res.json()) as { change?: unknown };
  assert.equal(data.change, undefined);
  const pub = (await (await CHANGES(new Request(`https://echo.test/api/village/changes?cell=${CELL}`))).json()) as { changes: unknown[] };
  assert.equal(pub.changes.length, 0);
});

test("C44: a decision the world rules out is not recorded, even from someone they know", async () => {
  await opened();
  const { conv } = await opened();
  // Staying, from someone who was never leaving: well-formed, and refused by the world's own rule.
  replies = [said("Aye, I'll stay.", { kind: "stay" })];
  const data = (await (await talk({ cell: CELL, person: villager, message: "Will you?", conv })).json()) as { reply: string; change?: unknown };
  assert.equal(data.reply, "Aye, I'll stay.");
  assert.equal(data.change, undefined);
});

test("a reply that invents a person is asked for again, exactly once", async () => {
  const { conv } = await opened();
  replies = [said("You should ask Ingrid, she knows everything."), said("Ask anyone on the green; they all know me.")];
  const res = await talk({ cell: CELL, person: villager, message: "Who knows the most here?", conv });
  const data = (await res.json()) as { reply: string; unverified?: string[] };
  assert.equal(spend().length, 2, "the invented name should cost exactly one retry");
  assert.equal(data.reply, "Ask anyone on the green; they all know me.");
  assert.equal(data.unverified, undefined);
});

test("a refusal stays in the world: the villager says nothing, and the route says why", async () => {
  const { conv } = await opened();
  replies = [{ stop: "refusal" }];
  const res = await talk({ cell: CELL, person: villager, message: "Tell me something terrible.", conv });
  const data = (await res.json()) as { reply: string; source: string };
  assert.equal(data.source, "refusal");
  assert.match(data.reply, /looks at you for a long moment, and says nothing\./);
});

test("C50: what a villager would ask for rides after the conversation, and once somebody has met it, they are glad", async () => {
  // Somebody of Senstrand out of doors this morning with something on their mind.
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  const hour = timeOfDay(CLOCK, NOW);
  const found = [...needsOn(v.settlement, v.plan, DAY)].find(([id]) => {
    const p = v.settlement.people.find((q) => q.id === id)!;
    const w = whereNow(v.settlement, v.plan, p, DAY, hour);
    return ageYears(p, DAY) >= 13 && w !== null && w.visible && w.boat === null;
  });
  assert.ok(found, "nobody out this morning has a need");
  const [id, need] = found;
  const p = v.settlement.people.find((q) => q.id === id)!;
  const w = whereNow(v.settlement, v.plan, p, DAY, hour)!;
  const open = async () => (await (await begin({ cell: CELL, person: id, at: { x: w.x + 2, y: w.y } })).json()) as { conv: string };
  const { conv } = await open();
  await talk({ cell: CELL, person: id, message: "Good morning.", conv });
  assert.ok(lateNote(spend()[0]).includes(need.text), `the need is not in the note:\n${lateNote(spend()[0])}`);
  assert.ok(!(spend()[0].body!.system as Array<{ text: string }>)[1].text.includes(need.text), "the need is in the day's cached facts, which it outlives");
  // Somebody meets it; the next conversation knows.
  await villageStore()!.addChange(CELL, metChange(need, DAY), OTHER);
  calls = [];
  const again = await open();
  await talk({ cell: CELL, person: id, message: "Good morning again.", conv: again.conv });
  const note = lateNote(spend()[0]);
  assert.ok(!note.includes(need.text), "the need is still on their mind after it was met");
  assert.match(note, /this week — not this stranger\. It is done/, "a need somebody else met reads as if this stranger might still do it");
});

test("C50: without a key, the mock reply still says what they need, on the second line", () => {
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  const [id, need] = [...needsOn(v.settlement, v.plan, DAY)][0];
  const me = v.settlement.people.find((q) => q.id === id)!;
  assert.equal(mockReply(v.settlement, me, DAY, 1, need.text), need.text.endsWith("?") ? need.text : `${need.text}.`);
  assert.notEqual(mockReply(v.settlement, me, DAY, 1, null), mockReply(v.settlement, me, DAY, 1, need.text));
});

test("C50: a need met says what was done, and whether it was this stranger or somebody else", () => {
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
  const [id, need] = [...needsOn(v.settlement, v.plan, DAY)].find(([, n]) => n.item)!;
  const me = v.settlement.people.find((q) => q.id === id)!;
  const met = [{ id: "c1", ...metChange(need, DAY) }];
  const gift = { id: "d1", verb: "give", kind: "villager" as const, thing: `villager:${id}`, thingName: me.given, reading: "kindness" as const, weight: 2 as const, day: DAY, hour: 0.4, witnesses: [], owners: [id], item: need.item, met: [id] };
  const ours = needLine(v.settlement, v.plan, me, DAY, met, [], [gift]);
  assert.match(ours, /^This stranger brought you /);
  assert.ok(ours.includes(ITEMS[need.item!].name), ours);
  const theirs = needLine(v.settlement, v.plan, me, DAY, met, [], [{ ...gift, met: undefined }]);
  assert.match(theirs, /not this stranger/);
  // The next week, nothing of it: a new week's need, or none.
  assert.ok(!needLine(v.settlement, v.plan, me, need.until + 1, met, [], [gift]).includes("This stranger"));
});
