/**
 * The echo's body, out while the stranger is away (DECISIONS C64): when an absence is one, whom the
 * echo meets and when, what it may say (the gate's), what the villager hears and keeps, and the
 * stranger's word on it afterwards — against a recording engine and a recording Claude.
 *
 * Run:  node --import tsx --test apps/web/tests/echoAway.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { gridDisk } from "h3-js";
import { signIdentity } from "@echo/shared/identity";
import { ageYears, present, villageAt, worldClock, worldDayIndex, WORLD_DAY_S, WORLD_EPOCH } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { OPENING, OUTING, absenceOf, contextFor, mayGoOut, narration, spokenOnly, untold, whenOut, whomToMeet } = await import("../src/lib/echoOuting");
const { POST } = await import("../src/app/api/echo/away/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { planet } = await import("../src/lib/planet");
type Outing = import("../src/lib/echoTypes").Outing;

const CELL = "843f6a1ffffffff";
const SECRET = "echo-away-secret-aa";
const SUBJECT = "e1e2e3e4-1111-4222-8333-444455556667";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4940;
const START = Math.round(CLOCK.epochMs + (DAY + 0.4) * WORLD_DAY_S * 1000);
let now = START;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, url: process.env.ML_SERVICE_URL, token: process.env.ML_SERVICE_TOKEN, fetch: globalThis.fetch, now: Date.now };

/** What the engine's gate says, by bucket; and every call it got. */
let gate: Record<string, "auto" | "ask" | "copilot"> = {};
let engine: { path: string; body: Record<string, unknown> }[] = [];
let claude: Record<string, unknown>[] = [];

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/rpc/rate_limit_hit")) return json(1);
    if (url.startsWith("https://ml.test")) {
      const path = url.slice("https://ml.test".length);
      engine.push({ path, body });
      if (path === "/agent/turn") {
        if (body.bucket === "first_greeting") assert.match(String(body.userMessage), /^\(You walk up to .+, who looks up at you\.\)$/);
        const decision = gate[body.bucket] ?? "ask";
        // The engine's small model writes stage directions now and then; they must never be said.
        const line = body.bucket === "first_greeting" ? "*smiles* Morning. I'm new on this shore — is the well water good?" : "That's kind of you. I'll come by again.";
        return json({ action: line, decision, confidence: 0.71, p_hat: 0.66, tau: 0.58, explored: false, level: decision === "auto" ? "auto" : "copilot", rationale: "r", candidates: [line] });
      }
      if (path === "/feedback") return json({ bucket: { bucket: body.bucket, level: "auto", changed: true, agreement: 0.8, volume: 9, ece: 0.05, drift: false }, temperature: 1.2, ece: 0.05 });
      throw new Error(`the engine was asked ${path}`);
    }
    if (url.includes("api.anthropic.com")) {
      claude.push(body);
      // A villager who would, given the chance, decide to leave: the echo must never let them.
      return json({
        id: "msg_t",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify({ say: "The well is sweet enough. You're the one with the raft?", remember: "A stranger asking after the well; seemed new.", change: { kind: "leave", goal: null, about: null, trade: null } }) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel], ["ML_SERVICE_URL", saved.url], ["ML_SERVICE_TOKEN", saved.token]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  now = START;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
  gate = { first_greeting: "auto", smalltalk: "ask" };
  engine = [];
  claude = [];
  resetMemoryStore();
});

const village = () => {
  const { field, calibration, commons, world } = planet();
  return villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY })!;
};
const away = (body: Record<string, unknown>, subject = SUBJECT) =>
  POST(new Request("https://echo.test/api/echo/away", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(subject, SECRET, now)}` }, body: JSON.stringify(body) }));
type Shown = Omit<Outing, "subject"> & { told: string; encounters: (Outing["encounters"][number] & { lines: { who: string; text: string; voice?: string }[] })[] };
const back = async (cell = CELL) => ((await (await away({ op: "back", cell })).json()) as { outing: Shown | null });

// ── the rules ───────────────────────────────────────────────────────────────────

test("C64: the shorter waits for trying it out are never honoured in production", () => {
  const away = { at: new Date(now - 2 * 60_000).toISOString(), cell: CELL };
  process.env.ECHO_AWAY_MS = "60000";
  try {
    assert.equal(absenceOf(away, now), null, "a knob honoured in production");
    process.env.VERCEL_ENV = "preview";
    assert.ok(absenceOf(away, now), "the knob ignored where it is meant for");
  } finally {
    process.env.VERCEL_ENV = "production";
    delete process.env.ECHO_AWAY_MS;
  }
});

test("C64: an absence is one of at least half an hour, never the first visit; one outing in three hours; an untold one waits a week", () => {
  assert.equal(absenceOf(null, now), null, "an outing before the stranger was ever here");
  assert.equal(absenceOf({ at: new Date(now - 20 * 60_000).toISOString(), cell: CELL }, now), null);
  assert.deepEqual(absenceOf({ at: new Date(now - 40 * 60_000).toISOString(), cell: CELL }, now), { from: now - 40 * 60_000, to: now, cell: CELL });
  const o = (madeAgo: number, read: boolean) => ({ madeAt: new Date(now - madeAgo).toISOString(), readAt: read ? new Date(now).toISOString() : null }) as Outing;
  assert.equal(mayGoOut([o(OUTING.gapMs - 1000, true)], now), false);
  assert.equal(mayGoOut([o(OUTING.gapMs + 1000, true)], now), true);
  assert.equal(untold([o(1000, true)], now), null);
  assert.ok(untold([o(1000, false)], now));
  assert.equal(untold([o(OUTING.unreadMs + 1000, false)], now), null);
});

test("C64: whom it meets — the people you know there first, then new faces, three at most — and only when they are out, by day", () => {
  const v = village();
  const s = v.settlement;
  const adults = s.people.filter((p) => present(s, p, DAY) && ageYears(p, DAY) >= 20);
  const known = [adults[3]!.id, adults[7]!.id, adults[9]!.id];
  const people = whomToMeet(s, DAY, known, "seed");
  assert.equal(people.length, OUTING.meetings);
  assert.deepEqual(people.slice(0, OUTING.known).map((p) => p.id), known.slice(0, OUTING.known));
  assert.ok(!known.includes(people[2]!.id) || OUTING.known >= 3);
  assert.deepEqual(whomToMeet(s, DAY, [], "seed").map((p) => p.id), whomToMeet(s, DAY, [], "seed").map((p) => p.id));
  assert.notDeepEqual(whomToMeet(s, DAY, [], "seed").map((p) => p.id), whomToMeet(s, DAY, [], "other").map((p) => p.id));
  const from = now - 3 * 3_600_000;
  const w = whenOut(v, [], people[2]!.id, from, now, 0, 3);
  assert.ok(w, "nobody out in three hours");
  assert.ok(w!.at >= from && w!.at <= now && w!.hour >= 0.3 && w!.hour <= 0.8);
  assert.equal(worldDayIndex(CLOCK, w!.at), w!.day);
  // What it is told: where, whom, and whether they have met.
  const p = people[0]!;
  assert.match(contextFor("Senstrand", p, 30, "fishing", 0.5, null, null), /You have never met/);
  assert.match(contextFor("Senstrand", p, 30, "fishing", 0.5, { note: "", meetings: 2, firstDay: 1, lastDay: 2 }, "Fine day."), /met .* 2 times before\. .* has just said to you: "Fine day\."/);
  assert.match(contextFor("Senstrand", p, 30, "fishing", 0.5, null, null, ['Hela told you: "The inn is by the green."']), /Earlier on this outing: Hela told you: "The inn is by the green\."/);
  assert.match(contextFor("Senstrand", p, 30, "fishing", 0.5, null, null), new RegExp(`You are not ${p.given}; you are speaking to ${p.given}\\.`));
});

test("C64: the echo's own account says what it did and what it held back, and nothing else", () => {
  const enc = (given: string, spoke: boolean, lines: { who: "echo" | "villager"; text: string }[], decisions: ("auto" | "ask")[]) =>
    ({ given, spoke, lines, turns: decisions.map((d) => ({ decision: d })), feedback: decisions.map(() => null) }) as unknown as Outing["encounters"][number];
  const told = narration({
    village: "Senstrand",
    reason: null,
    encounters: [enc("Hela", true, [{ who: "echo", text: "Morning." }, { who: "villager", text: "Morning to you." }], ["auto", "ask"]), enc("Noo", false, [], ["ask"])],
  } as Outing);
  assert.match(told, /^While you were away I went to Senstrand\./);
  assert.match(told, /I talked with Hela, who said: "Morning to you\."/);
  // Only what they said last, and only its first sentence or so.
  const long = narration({ village: "Senstrand", reason: null, encounters: [enc("Lus", true, [{ who: "echo", text: "Hello." }, { who: "villager", text: "First thing." }, { who: "echo", text: "And?" }, { who: "villager", text: "Back from the water. There's a fish to spare if you're hungry." }], ["auto", "auto"])] } as Outing);
  assert.match(long, /I talked with Lus, who said: "Back from the water\." *$/);
  assert.match(told, /There was more I could have said to Hela; I left it for you\./);
  assert.match(told, /I saw Noo, but I held back/);
  assert.match(narration({ village: null, reason: "no_village", encounters: [] } as unknown as Outing), /nobody to meet/);
});

test("C64: the echo says words, not a stage play — and opens the way the old world's echo did", () => {
  assert.equal(spokenOnly('I pause, considering. "Fair enough — I misspoke." I move to settle nearby. "Calm evening."'), "Fair enough — I misspoke. Calm evening.");
  assert.equal(spokenOnly("*nods* Morning. (smiles) Is the well water good?"), "Morning. Is the well water good?");
  assert.equal(spokenOnly('"Morning."'), "Morning.");
  assert.equal(spokenOnly("Morning, is the well water good?"), "Morning, is the well water good?");
  assert.equal(OPENING("Hela"), "(You walk up to Hela, who looks up at you.)");
});

// ── the outing ──────────────────────────────────────────────────────────────────

test("C64: away long enough, the echo goes out — it speaks where the gate lets it, holds back where not, and the villager keeps the meeting but never a decision", async () => {
  assert.equal((await back()).outing, null, "an outing on the very first visit");
  now += 2 * 60_000;
  assert.equal((await back()).outing, null, "a two-minute pause counted as an absence");
  now += 3 * 60 * 60_000;
  const o = (await back()).outing!;
  assert.ok(o, "nothing after three hours away");
  assert.equal(o.village, "Senstrand");
  assert.ok(o.encounters.length >= 1 && o.encounters.length <= OUTING.meetings);
  const e = o.encounters[0]!;
  // First meeting: the gate said auto, so it spoke; the second line, smalltalk, it held back.
  assert.equal(e.spoke, true);
  assert.deepEqual(e.lines.map((l) => l.who), ["echo", "villager"]);
  assert.equal(e.lines[0]!.text, "Morning. I'm new on this shore — is the well water good?", "a stage direction said aloud");
  // Later meetings know what earlier ones said: the echo does not ask everyone the same thing.
  assert.ok(o.encounters.length >= 2, "one meeting in three hours");
  assert.ok(engine.some((c) => c.path === "/agent/turn" && /Earlier on this outing: .+ told you: "/.test(String(c.body.context))), "the second meeting knew nothing of the first");
  assert.deepEqual(e.turns.map((t) => [t.bucket, t.decision]), [["first_greeting", "auto"], ["smalltalk", "ask"]]);
  assert.deepEqual(e.feedback, [null, null]);
  assert.ok(e.lines[1]!.voice, "a villager's line with no voice token");
  assert.ok(Date.parse(o.awayFrom) < Date.parse(o.awayTo));
  assert.match(o.told, /went to Senstrand/);
  assert.match(o.told, new RegExp(`talked with ${e.given}`));
  // The villager remembers it as a meeting with the stranger…
  const kept = await villageStore()!.memoryOf(SUBJECT, CELL, e.person);
  assert.ok(kept && kept !== "none" && kept.meetings === 1 && /well/.test(kept.note), JSON.stringify(kept));
  // …and moved nobody's life, though the model offered to leave.
  assert.deepEqual(await villageStore()!.changesFor(CELL), []);
  // The villager was told no decision was theirs to make.
  assert.ok(claude.every((b) => JSON.stringify(b.messages).includes('There is nothing you could decide about your life today')));
  // Nothing it did was measured.
  assert.deepEqual(engine.filter((c) => !["/agent/turn"].includes(c.path)), []);
  // Where it waits: by the last one it spoke with.
  assert.equal(o.waits!.cell, CELL);
  // Asked again at once: the same outing, untold still; nothing new made.
  const turns = engine.length;
  assert.equal((await back()).outing!.id, o.id);
  assert.equal(engine.length, turns);
});

test("C64: the people you know come first, greeted as known; your word on each line trains the engine with what the gate said then, once", async () => {
  const s = village().settlement;
  const friend = s.people.find((p) => present(s, p, DAY) && ageYears(p, DAY) >= 25 && ageYears(p, DAY) < 60)!;
  await villageStore()!.remember(SUBJECT, CELL, friend.id, { note: "The stranger with the raft. Kind.", meetings: 2, firstDay: DAY - 3, lastDay: DAY - 1 });
  gate = { first_greeting: "auto", smalltalk: "auto" };
  await back();
  now += 4 * 60 * 60_000;
  const o = (await back()).outing!;
  const known = o.encounters.find((e) => e.person === friend.id);
  assert.ok(known, `the friend ${friend.given} was not met`);
  assert.equal(o.encounters[0]!.person, friend.id, "a friend met after strangers");
  assert.equal(known!.turns[0]!.bucket, "smalltalk");
  assert.equal(((await villageStore()!.memoryOf(SUBJECT, CELL, friend.id)) as { meetings: number }).meetings, 3);
  const e = o.encounters[0]!;
  assert.equal((await away({ op: "answer", id: "out_nobody", encounter: 0, turn: 0, agreed: true })).status, 404);
  assert.equal((await away({ op: "answer", id: o.id, encounter: 0, turn: 9, agreed: true })).status, 400);
  assert.equal((await away({ op: "answer", id: o.id, encounter: 0, turn: 0, agreed: true }, "e9e9e9e9-1111-4222-8333-444455556667")).status, 404, "someone else answered for it");
  const yes = await away({ op: "answer", id: o.id, encounter: 0, turn: 0, agreed: true });
  assert.equal(yes.status, 200);
  assert.equal(((await yes.json()) as { bucket: { level: string } }).bucket.level, "auto");
  const fed = engine.filter((c) => c.path === "/feedback");
  assert.deepEqual([fed[0]!.body.bucket, fed[0]!.body.confidence, fed[0]!.body.agreed, fed[0]!.body.context, fed[0]!.body.rejected], [e.turns[0]!.bucket, 0.71, true, e.turns[0]!.context, undefined]);
  assert.equal((await away({ op: "answer", id: o.id, encounter: 0, turn: 0, agreed: false })).status, 409, "answered twice");
  assert.equal(e.turns.length, 2, "both lines said to a friend the gate trusts");
  await away({ op: "answer", id: o.id, encounter: 0, turn: 1, agreed: false });
  const no = engine.filter((c) => c.path === "/feedback")[1]!;
  assert.deepEqual([no.body.agreed, no.body.rejected], [false, e.turns[1]!.line]);
  // Told, it is not told again.
  assert.equal((await away({ op: "read", id: o.id })).status, 200);
  assert.equal((await back()).outing, null);
});

test("C64: with no engine to speak for you, nothing goes out; with nowhere to go, it says so and spends nothing; it is yours alone", async () => {
  await back();
  now += 3 * 60 * 60_000;
  delete process.env.ML_SERVICE_URL;
  assert.equal((await back()).outing, null, "a stand-in's words given as the stranger's");
  assert.deepEqual(claude, [], "a villager asked to answer nobody");
  // A parcel with no village, no house, no one met: nowhere to go.
  process.env.ML_SERVICE_URL = "https://ml.test";
  resetMemoryStore();
  const { field, calibration, commons, world } = planet();
  const empty = gridDisk("84dcee5ffffffff", 2).find((c) => !villageAt(world.seed, c, field, calibration, world.radiusKm, { commons: commons.cells, day: DAY, market: false }))!;
  await back(empty);
  now += 3 * 60 * 60_000;
  const o = (await back(empty)).outing!;
  assert.deepEqual([o.reason, o.encounters.length, o.village], ["no_village", 0, null]);
  assert.match(o.told, /nobody to meet/);
  assert.deepEqual([engine.length, claude.length], [0, 0]);
  assert.ok([401, 403].includes((await POST(new Request("https://echo.test/api/echo/away", { method: "POST", body: JSON.stringify({ op: "back", cell: CELL }) }))).status));
});
