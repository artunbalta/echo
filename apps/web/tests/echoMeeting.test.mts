/**
 * Two echoes meeting while both their people are away (DECISIONS C71): who may meet, when a meeting is
 * planned and by whom, what each echo is told and says through its own gate, what each person may see
 * and hear, their answers, and what the villagers who saw it know. Against a recording engine.
 *
 * Run:  node --import tsx --test apps/web/tests/echoMeeting.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { signIdentity } from "@echo/shared/identity";
import { present, villageAt, witnessesOf, worldClock, WORLD_DAY_S, WORLD_EPOCH } from "@echo/planet";

process.env.ANTHROPIC_API_KEY = "sk-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { MEETING, MEETING_OPENING, fillMeeting, meetingContext, planMeetings, readCode, shownMeeting, seenTalkingLine, untoldMeetings } = await import("../src/lib/echoMeeting");
const { POST: PAIR } = await import("../src/app/api/echo/pair/route");
const { POST: MEET } = await import("../src/app/api/echo/meet/route");
const { POST: AWAY } = await import("../src/app/api/echo/away/route");
const { resetMemoryStore, villageStore } = await import("../src/lib/villageStore");
const { strangerNotes } = await import("../src/lib/strangerNotes");
const { voiceOf } = await import("../src/lib/voices");
const { planet } = await import("../src/lib/planet");
type EchoMeeting = import("../src/lib/echoTypes").EchoMeeting;

const CELL = "843f6a1ffffffff";
const SECRET = "echo-meet-secret-aaaa";
const A = "a1a2a3a4-1111-4222-8333-444455556661";
const B = "b1b2b3b4-1111-4222-8333-444455556662";
const C = "c1c2c3c4-1111-4222-8333-444455556663";
const CLOCK = worldClock(WORLD_EPOCH);
const DAY = 4950;
const T0 = Math.round(CLOCK.epochMs + (DAY + 0.4) * WORLD_DAY_S * 1000);
const HOUR = 60 * 60 * 1000;
let now = T0;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, url: process.env.ML_SERVICE_URL, token: process.env.ML_SERVICE_TOKEN, voices: process.env.ECHO_VOICES, eleven: process.env.ELEVENLABS_API_KEY, fetch: globalThis.fetch, now: Date.now };

/** The gate, by person and bucket; every call the engine got; what ElevenLabs was asked to say. */
let gate: Record<string, Record<string, "auto" | "ask" | "copilot">> = {};
let engine: { path: string; body: Record<string, unknown> }[] = [];
let spoken: { voice: string; text: string }[] = [];
let engineUp = true;

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  Date.now = () => now;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
    if (url.includes("/rpc/rate_limit_hit")) return json(1);
    if (url.startsWith("https://ml.test")) {
      if (!engineUp) throw new Error("connection refused");
      const path = url.slice("https://ml.test".length);
      engine.push({ path, body });
      if (path === "/agent/turn") {
        const who = body.userId === A ? "A" : body.userId === B ? "B" : "?";
        const n = engine.filter((e) => e.path === "/agent/turn" && e.body.userId === body.userId).length;
        const decision = gate[String(body.userId)]?.[String(body.bucket)] ?? "copilot";
        // Stage directions now and then, which must never be said.
        const line = `*nods* ${who} line ${n}: the sea is loud today.`;
        return json({ action: line, decision, confidence: 0.7, p_hat: 0.66, tau: 0.58, explored: false, level: decision === "auto" ? "auto" : "copilot", rationale: "r", candidates: [line] });
      }
      if (path === "/feedback") return json({ bucket: { bucket: body.bucket, level: "supervised", changed: true, agreement: 0.82, volume: 9, ece: 0.05, drift: false } });
      throw new Error(`the engine was asked ${path}`);
    }
    if (url.includes("api.elevenlabs.io")) {
      const voice = url.match(/text-to-speech\/([^/?]+)/)?.[1] ?? "?";
      spoken.push({ voice, text: String(body.text ?? "") });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    if (url.includes("api.anthropic.com")) {
      // An outing's villager reply; never part of a meeting.
      return json({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify({ say: "Good day.", remember: "", change: null }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});
after(() => {
  for (const [k, v] of [["ECHO_IDENTITY_SECRET", saved.secret], ["VERCEL_ENV", saved.vercel], ["ML_SERVICE_URL", saved.url], ["ML_SERVICE_TOKEN", saved.token], ["ECHO_VOICES", saved.voices], ["ELEVENLABS_API_KEY", saved.eleven]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = saved.fetch;
  Date.now = saved.now;
});
beforeEach(() => {
  resetMemoryStore();
  now = T0;
  gate = {};
  engine = [];
  spoken = [];
  engineUp = true;
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "t";
  delete process.env.ECHO_VOICES;
  delete process.env.ELEVENLABS_API_KEY;
});

const call = (route: (r: Request) => Promise<Response>, path: string, subject: string, body: Record<string, unknown>) =>
  route(new Request(`https://echo.test${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(subject, SECRET, now)}` }, body: JSON.stringify(body) }));
const pair = (subject: string, body: Record<string, unknown>) => call(PAIR, "/api/echo/pair", subject, body);
const meet = (subject: string, body: Record<string, unknown>) => call(MEET, "/api/echo/meet", subject, body);
const away = (subject: string, body: Record<string, unknown>) => call(AWAY, "/api/echo/away", subject, body);

/** A and B paired: A made the code, B typed it in. */
async function paired(): Promise<string> {
  const code = String(((await (await pair(A, { op: "invite", name: "Artun" })).json()) as { code: string }).code);
  const res = await pair(B, { op: "accept", code, name: "Deniz" });
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { pair: { id: string } }).pair.id;
}

/**
 * A and B paired under a fixed id, so the meeting's hour and spot, which follow from its id, are the same
 * on every run, and so are the villagers who see it.
 */
async function pairedFixed(id = "pair_fixed_0001"): Promise<string> {
  const added = await villageStore()!.addPair({ id, a: A, b: B, aName: "Artun", bName: "Deniz", createdAt: new Date(now).toISOString() });
  assert.equal(added, "added");
  return id;
}

/** Both seen here at T0, then away; A comes back at `back`. */
async function bothAwayThenABack(back = T0 + 2 * HOUR, bSeen = T0): Promise<void> {
  const store = villageStore()!;
  await store.markSeen(A, CELL, new Date(T0).toISOString());
  await store.markSeen(B, CELL, new Date(bSeen).toISOString());
  now = back;
}

const meetingsOf = async (s: string) => (await villageStore()!.meetingsOf(s, 50))!;

// ── pairing ─────────────────────────────────────────────────────────────────────

test("C71: two echoes may meet only when both people said yes: one made a code, the other typed it in, once", async () => {
  const res = await pair(A, { op: "invite", name: "  Artun\u0007 " });
  assert.equal(res.status, 200);
  const { code } = (await res.json()) as { code: string };
  assert.match(code, /^[A-HJ-KM-NP-Z2-9]{3}-[A-HJ-KM-NP-Z2-9]{3}$/);
  // Typed in any case, without the dash.
  const ok = await pair(B, { op: "accept", code: code.toLowerCase().replace("-", ""), name: "Deniz" });
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal(((await ok.json()) as { pair: { name: string } }).pair.name, "Artun", "the name was cleaned of what cannot be shown");
  const listA = (await (await pair(A, { op: "list" })).json()) as { pairs: { name: string }[] };
  const listB = (await (await pair(B, { op: "list" })).json()) as { pairs: { name: string }[] };
  assert.deepEqual(listA.pairs.map((p) => p.name), ["Deniz"]);
  assert.deepEqual(listB.pairs.map((p) => p.name), ["Artun"]);
  // Used once.
  assert.equal((await pair(C, { op: "accept", code, name: "Can" })).status, 404);
  // Not with yourself, not twice, not stale, not nameless.
  const own = ((await (await pair(A, { op: "invite", name: "Artun" })).json()) as { code: string }).code;
  assert.equal((await pair(A, { op: "accept", code: own, name: "Artun" })).status, 409);
  const again = ((await (await pair(A, { op: "invite", name: "Artun" })).json()) as { code: string }).code;
  assert.equal(((await (await pair(B, { op: "accept", code: again, name: "Deniz" })).json()) as { error: string }).error, "already");
  const stale = ((await (await pair(A, { op: "invite", name: "Artun" })).json()) as { code: string }).code;
  now += MEETING.inviteMs + 1;
  assert.equal((await pair(C, { op: "accept", code: stale, name: "Can" })).status, 410);
  assert.equal((await pair(C, { op: "invite", name: "" })).status, 400);
  assert.equal((await pair(C, { op: "invite", name: "x".repeat(41) })).status, 400);
  assert.equal(readCode("abc-12"), null, "a code holds no letter that is easy to misread");
});

test("C71: either person can stop it, and only their own", async () => {
  const id = await paired();
  assert.equal((await pair(C, { op: "leave", id })).status, 404);
  assert.equal((await pair(B, { op: "leave", id })).status, 200);
  assert.deepEqual(((await (await pair(A, { op: "list" })).json()) as { pairs: unknown[] }).pairs, []);
});

// ── planning ────────────────────────────────────────────────────────────────────

test("C71: coming back plans a meeting with a paired echo whose person is away too, and calls no model", async () => {
  await paired();
  await bothAwayThenABack();
  const res = await away(A, { op: "back", cell: CELL });
  assert.equal(res.status, 200);
  const [m] = await meetingsOf(A);
  assert.ok(m, "no meeting was planned");
  assert.equal(m.status, "planned");
  assert.equal(m.from, new Date(T0).toISOString());
  assert.equal(m.to, new Date(now).toISOString());
  assert.equal(m.cell, CELL, "in the village one of them was last in");
  assert.equal(engine.filter((e) => String(e.body.context ?? "").includes("on the green")).length, 0, "planning called the engine");
  assert.deepEqual((await meetingsOf(B)).map((x) => x.id), [m.id], "the other person's copy is the same meeting");
});

test("C71: no meeting without a pair, when the other is here, when the two absences barely overlap, or twice in a gap", async () => {
  await bothAwayThenABack();
  await away(A, { op: "back", cell: CELL });
  assert.equal((await meetingsOf(A)).length, 0, "met without anyone saying yes");

  resetMemoryStore();
  await paired();
  // B was here a minute ago.
  await bothAwayThenABack(T0 + 2 * HOUR, T0 + 2 * HOUR - 60_000);
  await away(A, { op: "back", cell: CELL });
  assert.equal((await meetingsOf(A)).length, 0, "met someone who was here");

  resetMemoryStore();
  await paired();
  // B left only forty minutes before A came back, and A had been gone two hours: an overlap of forty, enough.
  await bothAwayThenABack(T0 + 2 * HOUR, T0 + 2 * HOUR - 40 * 60_000);
  await away(A, { op: "back", cell: CELL });
  assert.equal((await meetingsOf(A)).length, 1, "forty minutes of both away is an absence's length");

  resetMemoryStore();
  await paired();
  // A left only ten minutes before coming back: no absence at all.
  await bothAwayThenABack(T0 + 10 * 60_000);
  await away(A, { op: "back", cell: CELL });
  assert.equal((await meetingsOf(A)).length, 0, "a pause is not an absence");

  resetMemoryStore();
  await paired();
  await bothAwayThenABack();
  await away(A, { op: "back", cell: CELL });
  // Away again for an hour, B still away: within the gap, nothing new.
  await villageStore()!.markSeen(A, CELL, new Date(now).toISOString());
  now += HOUR;
  await away(A, { op: "back", cell: CELL });
  assert.equal((await meetingsOf(A)).length, 1, "two meetings inside one gap");
});

test("C71: an absence that ended earlier counts only its own overlap with the other's", async () => {
  await pairedFixed();
  const store = villageStore()!;
  // A was away from T0 for forty minutes; B left twenty minutes after A did, and is still away.
  await store.markSeen(B, CELL, new Date(T0 + 20 * 60_000).toISOString());
  now = T0 + 2 * HOUR;
  const none = await planMeetings(store, A, { from: T0, to: T0 + 40 * 60_000, cell: CELL }, now);
  assert.deepEqual(none, [], "twenty minutes of both away was taken for a meeting");
  const one = await planMeetings(store, A, { from: T0, to: T0 + 60 * 60_000, cell: CELL }, now);
  assert.equal(one.length, 1, "forty minutes of both away was not");
});

test("C71: two people coming back in the same moment plan one meeting between them", async () => {
  await paired();
  await bothAwayThenABack();
  const store = villageStore()!;
  const seenA = (await store.seenOf(A))!;
  const seenB = (await store.seenOf(B))!;
  // Both plan before either return is recorded, as the route does.
  const [fromA, fromB] = await Promise.all([
    planMeetings(store, A, { from: Date.parse(seenA.at), to: now, cell: CELL }, now),
    planMeetings(store, B, { from: Date.parse(seenB.at), to: now + 3000, cell: CELL }, now + 3000),
  ]);
  assert.equal(fromA.length + fromB.length, 1, "each planned their own");
  assert.equal((await meetingsOf(A)).length, 1);
});

test("C71: through the route, two returns at once still find each other away, and plan exactly one meeting", async () => {
  await pairedFixed();
  await bothAwayThenABack();
  // Both pages open in the same moment: their requests interleave.
  const [ra, rb] = await Promise.all([away(A, { op: "back", cell: CELL }), away(B, { op: "back", cell: CELL })]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.equal((await meetingsOf(A)).length, 1, "each saw the other already back, or both planned their own");
});

// ── filling ─────────────────────────────────────────────────────────────────────

async function planned(): Promise<EchoMeeting> {
  await pairedFixed();
  await bothAwayThenABack();
  await away(A, { op: "back", cell: CELL });
  engine = [];
  return (await meetingsOf(A))[0]!;
}

test("C71: each line is its own echo's, through its own gate, in the outings' buckets, taking turns", async () => {
  const m = await planned();
  gate = { [A]: { smalltalk: "auto", first_greeting: "auto" }, [B]: {} };
  const res = await meet(A, { op: "back" });
  assert.equal(res.status, 200);
  const turns = engine.filter((e) => e.path === "/agent/turn");
  assert.equal(turns.length, MEETING.lines);
  const made = (await meetingsOf(A)).find((x) => x.id === m.id)!;
  assert.equal(made.status, "made");
  assert.equal(made.lines.length, MEETING.lines);
  // Taking turns, each from its own person's engine.
  made.lines.forEach((l, i) => {
    assert.equal(l.who, made.lines[0]!.who === "a" ? (i % 2 === 0 ? "a" : "b") : i % 2 === 0 ? "b" : "a");
    assert.equal(turns[i]!.body.userId, l.who === "a" ? A : B);
    assert.doesNotMatch(l.text, /\*/, "a stage direction was kept as words");
  });
  // A first greeting for each, then small talk; the first speaker walks up, every other answers the last line.
  const firstOf = (s: string) => turns.find((t) => t.body.userId === s)!;
  assert.equal(firstOf(A).body.bucket, "first_greeting");
  assert.equal(firstOf(B).body.bucket, "first_greeting");
  assert.ok(turns.filter((t) => t.body.bucket === "smalltalk").length === MEETING.lines - 2);
  assert.equal(turns[0]!.body.userMessage, MEETING_OPENING(made.lines[0]!.who === "a" ? "Deniz" : "Artun"));
  for (let i = 1; i < turns.length; i++) assert.equal(turns[i]!.body.userMessage, made.lines[i - 1]!.text, "an echo answered something other than the last line");
  // A's gate let A speak; B's held B back. B's held lines were still answered: the conversation runs on.
  for (const l of made.lines) assert.equal(l.said, l.who === "a");
  // Seen by exactly the villagers on the green at that hour, because something was said.
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day: made.day! })!;
  assert.deepEqual(made.witnesses, witnessesOf(v.settlement, v.plan, made.day!, made.hour!, { x: made.x!, y: made.y! }, []).slice(0, MEETING.witnesses));
  // By day, inside the overlap.
  assert.ok(made.hour! >= 0.36 && made.hour! <= 0.74, `met at hour ${made.hour}`);
});

test("C71: two echoes nobody has trained hold everything back: a rehearsal, seen by nobody", async () => {
  await planned();
  await meet(B, { op: "back" });
  const made = (await meetingsOf(A))[0]!;
  assert.equal(made.status, "made");
  assert.ok(made.lines.every((l) => !l.said));
  assert.deepEqual(made.witnesses, [], "two people standing silent were seen talking");
});

test("C71: an echo is told where, when, whom and what the village is saying, and nothing of anyone's life with the villagers", async () => {
  const m = await planned();
  const store = villageStore()!;
  await store.remember(A, CELL, "p-anyone", { note: "SECRET-NOTE-A: told me about their sister", meetings: 2, firstDay: DAY - 3, lastDay: DAY - 1 });
  await store.addDeed(B, CELL, { verb: "trample", kind: "field", thing: "field:1", thingName: "SECRET-DEED-B the barley", reading: "harm", weight: 3, day: DAY - 1, hour: 0.5, witnesses: [], owners: [] });
  gate = { [A]: { smalltalk: "auto", first_greeting: "auto" }, [B]: { smalltalk: "auto", first_greeting: "auto" } };
  await fillMeeting(store, m, now);
  const contexts = engine.filter((e) => e.path === "/agent/turn").map((e) => ({ who: e.body.userId, context: String(e.body.context) }));
  for (const { who, context } of contexts) {
    assert.match(context, /Senstrand/);
    assert.match(context, new RegExp(who === A ? "Deniz" : "Artun"), "an echo was not told whom it met");
    for (const secret of ["SECRET-NOTE-A", "SECRET-DEED-B", A, B]) assert.ok(!context.includes(secret), `an echo was told ${secret}`);
  }
  assert.equal(meetingContext({ village: "V", hour: 0.5, otherName: "N", topic: null, metBefore: false, so: [] }).includes("So far"), false);
});

test("C71: a fill is taken once; one that died is taken over; no engine, no meeting, and it is filled later", async () => {
  const m = await planned();
  const store = villageStore()!;
  const [one, two] = await Promise.all([fillMeeting(store, m, now), fillMeeting(store, m, now)]);
  assert.equal([one, two].filter(Boolean).length, 1, "both filled it");
  assert.equal(engine.filter((e) => e.path === "/agent/turn").length, MEETING.lines, "the engine spoke for both twice");

  resetMemoryStore();
  engine = [];
  const m2 = await planned();
  await store.saveMeeting({ ...m2, status: "making", makingAt: new Date(now - MEETING.staleMs - 1000).toISOString() });
  await meet(A, { op: "back" });
  assert.equal((await meetingsOf(A))[0]!.status, "made", "a fill that died was never taken over");

  resetMemoryStore();
  const m3 = await planned();
  engineUp = false;
  const res = (await (await meet(A, { op: "back" })).json()) as { meetings: unknown[] };
  assert.deepEqual(res.meetings, []);
  const back = (await meetingsOf(A)).find((x) => x.id === m3.id)!;
  assert.equal(back.status, "planned", "a stand-in's words were kept as someone's");
  assert.equal(back.reason, "no_engine");
  engineUp = true;
  await meet(B, { op: "back" });
  assert.equal((await meetingsOf(A))[0]!.status, "made");
});

// ── seeing, answering, hearing ──────────────────────────────────────────────────

async function made(gates: typeof gate): Promise<EchoMeeting> {
  const m = await planned();
  gate = gates;
  await meet(A, { op: "back" });
  return (await meetingsOf(A)).find((x) => x.id === m.id)!;
}

test("C71: each sees their own echo's lines, held or not, and only what the other's said aloud; nobody sees the other's gate", async () => {
  const m = await made({ [A]: { smalltalk: "auto", first_greeting: "auto" }, [B]: {} });
  const forA = shownMeeting(m, A)!;
  const forB = shownMeeting(m, B)!;
  assert.equal(forA.friend, "Deniz");
  assert.equal(forB.friend, "Artun");
  m.lines.forEach((l, i) => {
    const a = forA.lines[i]!;
    const b = forB.lines[i]!;
    assert.equal(a.mine, l.who === "a");
    assert.equal(b.mine, l.who === "b");
    // A's lines were said: both see them. B's were held: B sees them, A sees nothing of them.
    assert.equal(a.text, l.who === "a" ? l.text : "");
    assert.equal(b.text, l.text);
  });
  for (const shown of [forA, forB]) {
    const raw = JSON.stringify(shown);
    assert.ok(!raw.includes("context") && !raw.includes("confidence"), "a gate's workings went to the page");
    for (const l of shown.lines) if (!l.mine) assert.equal(l.p_hat, undefined, "the other person's gate reading went to the page");
  }
  assert.ok(shownMeeting(m, C) === null, "a third person was shown it");
  // Told to each until they read it, and then not.
  assert.equal(untoldMeetings([m], A, now).length, 1);
  assert.equal((await meet(A, { op: "read", id: m.id })).status, 200);
  assert.equal(((await (await meet(A, { op: "back" })).json()) as { meetings: unknown[] }).meetings.length, 0);
  assert.equal(((await (await meet(B, { op: "back" })).json()) as { meetings: unknown[] }).meetings.length, 1, "one person's reading told it for both");
});

test("C71: each answers only their own echo's lines, once, and it trains their own bucket; two answering at once lose nothing", async () => {
  const m = await made({ [A]: { smalltalk: "auto", first_greeting: "auto" }, [B]: {} });
  const ia = m.lines.findIndex((l) => l.who === "a");
  const ib = m.lines.findIndex((l) => l.who === "b");
  engine = [];
  assert.equal((await meet(A, { op: "answer", id: m.id, line: ib, agreed: true })).status, 403, "answered for the other person's echo");
  const [ra, rb] = await Promise.all([meet(A, { op: "answer", id: m.id, line: ia, agreed: true }), meet(B, { op: "answer", id: m.id, line: ib, agreed: false })]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  const feedback = engine.filter((e) => e.path === "/feedback").map((e) => e.body);
  assert.deepEqual(feedback.map((f) => [f.userId, f.bucket, f.agreed]).sort(), [[A, m.lines[ia]!.turn.bucket, true], [B, m.lines[ib]!.turn.bucket, false]].sort());
  assert.equal(feedback.find((f) => f.userId === B)!.rejected, m.lines[ib]!.text, "a 'not me' did not say which line");
  assert.equal(feedback.find((f) => f.userId === A)!.confidence, m.lines[ia]!.turn.confidence, "the page's confidence was trusted over the gate's");
  const after = (await meetingsOf(A)).find((x) => x.id === m.id)!;
  assert.deepEqual([after.feedbackA, after.feedbackB], [{ [String(ia)]: true }, { [String(ib)]: false }]);
  assert.equal((await meet(A, { op: "answer", id: m.id, line: ia, agreed: false })).status, 409);
  engineUp = false;
  const ia2 = m.lines.findIndex((l, i) => l.who === "a" && i !== ia);
  assert.equal((await meet(A, { op: "answer", id: m.id, line: ia2, agreed: true })).status, 503);
  assert.equal((await meetingsOf(A)).find((x) => x.id === m.id)!.feedbackA[String(ia2)], undefined, "an answer the engine never took was kept");
});

test("C71: a line is heard in its own speaker's voice, by the two of them only, never one held back from you, and only the words stored", async () => {
  const m = await made({ [A]: {}, [B]: { smalltalk: "auto", first_greeting: "auto" } });
  const ib = m.lines.findIndex((l) => l.who === "b");
  const ia = m.lines.findIndex((l) => l.who === "a");
  // No voices here: the page uses its own.
  assert.equal((await meet(A, { op: "voice", id: m.id, line: ib })).status, 204);
  process.env.ELEVENLABS_API_KEY = "xi-test";
  process.env.ECHO_VOICES = `${B}=voice-of-deniz`;
  assert.equal(voiceOf(B)?.voiceId, "voice-of-deniz");
  assert.equal(voiceOf(A), null);
  const res = await meet(A, { op: "voice", id: m.id, line: ib, text: "say something else entirely" });
  assert.equal(res.status, 200);
  assert.deepEqual(spoken, [{ voice: "voice-of-deniz", text: m.lines[ib]!.text }], "the words were not the stored line's");
  // B holds nothing back here, but A's lines were all held: B may not hear them; A may hear their own (no voice: 204).
  assert.equal((await meet(B, { op: "voice", id: m.id, line: ia })).status, 403);
  assert.equal((await meet(A, { op: "voice", id: m.id, line: ia })).status, 204);
  assert.equal((await meet(C, { op: "voice", id: m.id, line: ib })).status, 404, "a third person heard it");
});

test("C71: villagers who saw them talk may say so to either of them, with what was said aloud; nobody else knows", async () => {
  const m = await made({ [A]: { smalltalk: "auto", first_greeting: "auto" }, [B]: {} });
  assert.ok(m.witnesses.length > 0, "something was said on the green by day and nobody saw it");
  const meetings = await meetingsOf(A);
  const day = m.day! + 1;
  const { field, calibration, commons, world } = planet();
  const v = villageAt(world.seed, CELL, field, calibration, world.radiusKm, { commons: commons.cells, day })!;
  const witness = v.settlement.people.find((p) => m.witnesses.includes(p.id) && present(v.settlement, p, day))!;
  const other = v.settlement.people.find((p) => !m.witnesses.includes(p.id) && present(v.settlement, p, day) && day - p.birthDay > 365 * 16)!;
  const said = m.lines.find((l) => l.who === "a" && l.said)!;
  assert.ok(witness, "every witness is gone a day later");
  const toA = seenTalkingLine(meetings, A, CELL, witness.id, day);
  assert.match(toA, /yesterday, on the green, talking with another stranger/);
  assert.ok(toA.includes(said.text.slice(0, 40)), "the witness did not catch what was said aloud");
  assert.match(seenTalkingLine(meetings, B, CELL, witness.id, day), /did not catch what this stranger said/, "B said nothing aloud, and the witness heard something");
  const notes = await strangerNotes(villageStore(), A, CELL, v, witness, day, new Set());
  assert.equal(notes.seenTalking, toA, "the villager's notes left it out");
  assert.equal(seenTalkingLine(meetings, A, CELL, other.id, day), "", "someone who was not there knew");
  assert.equal(seenTalkingLine(meetings, C, CELL, witness.id, day), "", "a third stranger was told of it");
});

test("C71: an erasure takes either person's codes, pairs and every meeting their echo was in", () => {
  const src = readFileSync(new URL("../src/app/api/account/delete/route.ts", import.meta.url), "utf8");
  for (const [table, column] of [["echo_invites", "subject"], ["echo_pairs", "a"], ["echo_pairs", "b"], ["echo_meetings", "a"], ["echo_meetings", "b"]]) {
    assert.match(src, new RegExp(`\\["${table}", "${column}"\\]`), `${table}.${column} outlives an erasure`);
  }
  const retention = readFileSync(new URL("../src/lib/retention.ts", import.meta.url), "utf8");
  assert.match(retention, /table: "echo_meetings", column: "made_at"/);
});
