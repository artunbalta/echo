/**
 * The mirror (DECISIONS C61): the account that adds up, the record the routes keep, and the mirror
 * route over it — against a small engine that keeps a real running posterior and reports each move.
 *
 * Run:  node --import tsx --test apps/web/tests/mirror.test.mts
 */
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { signIdentity } from "@echo/shared/identity";
import { PERSONA_AXIS_KEYS } from "@echo/shared";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
process.env.VILLAGE_STORE = "memory";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { MIRROR, actWords, currentEpoch, howMuch, mirrorOf, readAsWords } = await import("../src/lib/mirror");
type LedgerRow = import("../src/lib/mirror").LedgerRow;
const { appendLedger, entryForAct, entryForTelemetry, foldWalks, forgetLedger, readLedger, resetLedger } = await import("../src/lib/ledger");
const { POST: OBSERVE } = await import("../src/app/api/observe/behavioral/route");
const { POST: TELEMETRY } = await import("../src/app/api/telemetry/route");
const { GET: MIRROR_GET } = await import("../src/app/api/echo/mirror/route");

const D = PERSONA_AXIS_KEYS.length;
const SECRET = "mirror-secret-aaaa";
const SUBJECT = "a1b2c3d4-1111-4222-8333-444455556667";
const NOW = 1_800_000_000_000;
const saved = { secret: process.env.ECHO_IDENTITY_SECRET, vercel: process.env.VERCEL_ENV, url: process.env.ML_SERVICE_URL, token: process.env.ML_SERVICE_TOKEN, fetch: globalThis.fetch, now: Date.now };

const vec = (o: Partial<Record<(typeof PERSONA_AXIS_KEYS)[number], number>>) => PERSONA_AXIS_KEYS.map((k) => o[k] ?? 0);
const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]!);
const close = (a: number[], b: number[], eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]!) < eps);

// ── a small engine: a running posterior per user, every update reporting its own move ──────────
let engine = new Map<string, { mu: number[]; version: number }>();
let engineCalls: string[] = [];
const stateOf = (uid: string) => engine.get(uid) ?? (engine.set(uid, { mu: new Array(D).fill(0), version: 0 }), engine.get(uid)!);
const MOVES: Record<string, number[]> = {
  help_at_cost: vec({ warmth: 0.06, dominance: -0.01 }),
  force_door: vec({ warmth: -0.05, dominance: 0.07 }),
  sit_still: vec({ energy: -0.02 }),
};
function update(uid: string, delta: number[]) {
  const s = stateOf(uid);
  const before = { mu: [...s.mu], version: s.version };
  if (delta.some((x) => x !== 0)) {
    s.mu = add(s.mu, delta);
    s.version += 1;
  }
  return { delta: s.mu.map((x, i) => x - before.mu[i]!), version_before: before.version, version: s.version };
}
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

before(() => {
  process.env.ECHO_IDENTITY_SECRET = SECRET;
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rpc/rate_limit_hit")) return json(1);
    if (url.startsWith("https://stub.supabase.test/rest/v1/behavioral_events")) return new Response(null, { status: 201 });
    if (!url.startsWith("https://ml.test")) throw new Error(`unexpected fetch ${url}`);
    const path = url.slice("https://ml.test".length);
    engineCalls.push(`${init?.method ?? "GET"} ${path.split("?")[0]}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === "/observe/behavioral") {
      const e = body.event;
      const moved = update(e.actor_id, (MOVES[e.action] ?? vec({ openness: 0.01 })).map((x) => (e.polarity === "refuse" ? -x : x)));
      return json({ userId: e.actor_id, polarity: e.polarity, cond_key: "stakes:low", persona: { mu: stateOf(e.actor_id).mu, version: moved.version }, delta_mu: Math.hypot(...moved.delta), telemetry_used: { risk_index: 0.4, note: "x" }, ...moved });
    }
    if (path === "/telemetry") {
      const p = body.event.payload ?? {};
      const moved = update(body.userId, body.event.type === "passive_locomotion" && typeof p.novel_tile_ratio === "number" ? vec({ openness: 0.004 * p.novel_tile_ratio, affect: 0.001 }) : new Array(D).fill(0));
      return json({ ok: true, uncertainty: 0.5, ...moved });
    }
    if (path === "/observe") return json({ persona: { mu: stateOf(body.userId).mu }, ...update(body.userId, vec({ pace: -0.03 })) });
    if (path.startsWith("/persona/")) {
      const s = stateOf(decodeURIComponent(path.slice("/persona/".length)));
      return json({ persona: { mu: s.mu, version: s.version }, var: vec({ warmth: 0.3, dominance: 0.5 }).map((x) => x || 0.9), self_monitoring: { delta: vec({ warmth: 0.15 }) }, measurement: { openness: [{ feature: "novel_tile_ratio", loading: 0.6 }, { feature: "emb_12", loading: 0.4 }] } });
    }
    throw new Error(`unexpected engine path ${path}`);
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
  process.env.ML_SERVICE_URL = "https://ml.test";
  process.env.ML_SERVICE_TOKEN = "ml-token";
  Date.now = () => NOW;
  engine = new Map();
  engineCalls = [];
  resetLedger();
});

let rowId = 0;
const row = (over: Partial<LedgerRow> & { delta: number[]; v0: number; v1: number }): LedgerRow => ({
  id: ++rowId,
  at: new Date(NOW - 60_000 + rowId * 1000).toISOString(),
  kind: "act",
  action: "help_at_cost",
  cue: "H9",
  polarity: "take",
  cond_key: "stakes:low",
  read_as: null,
  windows: 1,
  ...over,
});

// ── the account ─────────────────────────────────────────────────────────────────

test("C61: the moves on record and the line for what is not add up to where the echo puts you, on every axis", () => {
  const rows = [
    row({ delta: vec({ warmth: 0.06 }), v0: 3, v1: 4 }),
    row({ kind: "walk", action: "passive_locomotion", polarity: null, windows: 9, delta: vec({ openness: 0.03 }), v0: 4, v1: 13 }),
    row({ action: "force_door", delta: vec({ warmth: -0.02, dominance: 0.07 }), v0: 15, v1: 16 }),
    row({ delta: vec({ warmth: 0.05 }), v0: 16, v1: 17 }),
  ];
  const unrecorded = vec({ warmth: 0.01, pace: -0.04 });
  const mu = add(rows.reduce((s, r) => add(s, r.delta), new Array(D).fill(0)), unrecorded);
  const v = mirrorOf({ mu, var: new Array(D).fill(0.4), version: 19 }, rows, { at: NOW });
  assert.ok(close(PERSONA_AXIS_KEYS.map((k) => v.notInRecord![k]), unrecorded), JSON.stringify(v.notInRecord));
  // 3 before the record, 2 between, 2 after.
  assert.equal(v.missing, 3 + 2 + 2);
  // Warmth: helping twice, then the door, and nothing below what would be noticed.
  assert.deepEqual(v.evidence.warmth.map((c) => [c.label, c.count, c.words, c.towards]), [["Helped at a cost to yourself", 2, "noticeably", "warm"], ["Forced a door", 1, "a little", "cold"]]);
  assert.deepEqual(v.evidence.openness.map((c) => [c.label, c.count]), [["Walking about", 9]]);
  assert.equal(v.timeline[0]!.label, "Helped at a cost to yourself", "newest first");
  assert.deepEqual(v.timeline[1]!.moves.map((m) => m.axis), ["dominance", "warmth"]);
  assert.equal(v.rows, 4);
  // A strong push the other way outranks a weak one this way, and turning an act down is its own line.
  const both = mirrorOf({ mu: vec({ warmth: -0.07 }), var: new Array(D).fill(0.4), version: 3 }, [
    row({ delta: vec({ warmth: 0.01 }), v0: 0, v1: 1 }),
    row({ polarity: "refuse", delta: vec({ warmth: -0.03 }), v0: 1, v1: 2 }),
    row({ action: "force_door", delta: vec({ warmth: -0.05 }), v0: 2, v1: 3 }),
  ], { at: NOW });
  assert.deepEqual(both.evidence.warmth.map((c) => c.label), ["Forced a door", "Did not help", "Helped at a cost to yourself"]);
});

test("C61: an engine that started over voids what came before it — and two requests finishing out of order are not that", () => {
  const old = [row({ delta: vec({ warmth: 0.3 }), v0: 0, v1: 1 }), row({ delta: vec({ warmth: 0.2 }), v0: 1, v1: 60 })];
  const fresh = row({ delta: vec({ affect: 0.05 }), v0: 0, v1: 1 });
  const e = currentEpoch([...old, fresh]);
  assert.deepEqual(e.rows.map((r) => r.id), [fresh.id]);
  assert.equal(e.restarted, fresh.at);
  const v = mirrorOf({ mu: fresh.delta, var: new Array(D).fill(0.4), version: 1 }, [...old, fresh], { at: NOW });
  assert.deepEqual(v.evidence.warmth, []);
  // Out of order by a step or two, a second apart: the same run, sorted back by version.
  const a = row({ delta: vec({ warmth: 0.01 }), v0: 61, v1: 62 });
  const b = row({ delta: vec({ warmth: 0.02 }), v0: 60, v1: 61 });
  const same = currentEpoch([...old, a, b]);
  assert.equal(same.restarted, null);
  assert.deepEqual(same.rows.map((r) => r.v0), [0, 1, 60, 61]);
  // A small step back after a quiet hour is a restart all the same.
  const later = row({ at: new Date(NOW + 3_600_000).toISOString(), delta: vec({ affect: 0.01 }), v0: 55, v1: 56 });
  assert.equal(currentEpoch([...old, later]).restarted, later.at);
});

test("C61: an engine that started over after the record voids all of it; a row written after it answered is not counted", () => {
  const rows = [row({ delta: vec({ warmth: 0.3 }), v0: 0, v1: 80 })];
  const v = mirrorOf({ mu: vec({ affect: 0.02 }), var: new Array(D).fill(0.9), version: 2 }, rows, { at: NOW });
  assert.equal(v.restarted, true);
  assert.equal(v.rows, 0);
  assert.ok(close(PERSONA_AXIS_KEYS.map((k) => v.notInRecord![k]), vec({ affect: 0.02 })));
  const ahead = mirrorOf({ mu: vec({ warmth: 0.3 }), var: new Array(D).fill(0.9), version: 80 }, [...rows, row({ delta: vec({ warmth: 0.1 }), v0: 80, v1: 81 })], { at: NOW });
  assert.equal(ahead.rows, 1);
  assert.ok(Math.abs(ahead.notInRecord!.warmth) < 1e-12);
});

test("C61: words only where the engine would say one, sizes in words, and 'when others can see you' only for a real difference", () => {
  const v = mirrorOf({ mu: vec({ warmth: 0.7, dominance: -0.4, openness: 0.5 }), var: vec({ warmth: 0.3, dominance: 0.5, openness: 0.8 }), version: 0, watched: vec({ affect: -0.12, warmth: 0.05 }) }, [], { at: NOW });
  const words = Object.fromEntries(v.axes.map((a) => [a.key, a.words]));
  assert.equal(words.warmth, "strongly warm");
  assert.equal(words.dominance, "deferential");
  assert.equal(words.openness, null, "a word for an axis the engine is unsure of");
  assert.deepEqual([v.watched!.axis, v.watched!.towards], ["affect", "reserved"]);
  assert.equal(mirrorOf({ mu: new Array(D).fill(0), var: new Array(D).fill(1), version: 0, watched: vec({ warmth: 0.05 }) }, []).watched, null);
  assert.deepEqual(["barely", "a little", "noticeably", "a lot"], [0.004, 0.02, 0.1, 0.3].map(howMuch));
  assert.equal(actWords("stack_tidy", "refuse"), "Left your room as things fell");
  assert.equal(actWords("help_at_cost", "refuse"), "Did not help");
  assert.equal(actWords("sit_still", "refuse"), "Turned down: sat still a while");
  assert.equal(actWords("some_new_act", "take"), "Some new act");
  assert.deepEqual(readAsWords({ risk_index: 0.75, mystery: 3, ts_social: 0.2, approach: true }), ["going up to people", "risk taken", "a little time with people"]);
  assert.deepEqual(readAsWords({ decision_latency: 1009, ts_learn: 0.5 }), ["1 s to decide", "some time learning"]);
  assert.deepEqual(readAsWords({ approach: false }), ["no going up to people"]);
  // Without the engine: the record alone, nothing claimed about where it puts you.
  const off = mirrorOf(null, [row({ delta: vec({ warmth: 0.06 }), v0: 0, v1: 1 })], { reason: "ml_forward_failed" });
  assert.equal(off.live, false);
  assert.equal(off.notInRecord, null);
  assert.ok(off.axes.every((a) => a.words === null));
  assert.equal(off.evidence.warmth.length, 1);
});

// ── the record ──────────────────────────────────────────────────────────────────

test("C61: a row is only ever what the engine reported; walking folds while nothing else moves the echo in between", async () => {
  const moved = { delta: vec({ warmth: 0.05 }), version_before: 4, version: 5 };
  assert.equal(entryForAct({ action: "help_at_cost" }, { ...moved, mocked: true }), null, "a mock recorded");
  assert.equal(entryForAct({ action: "help_at_cost" }, { delta: [1, 2] , version_before: 1, version: 2 }), null);
  assert.equal(entryForAct({ action: "help_at_cost" }, { delta: new Array(D).fill(0), version_before: 5, version: 5 }), null, "an update that moved nothing");
  assert.equal(entryForAct({ action: "help_at_cost" }, { persona: { mu: [] } } as never), null, "an engine from before C61");
  const act = entryForAct({ action: "help_at_cost", cue: "H9", polarity: "take" }, { ...moved, cond_key: "stakes:low", telemetry_used: { risk_index: 0.4, text: "no" } })!;
  assert.deepEqual([act.kind, act.action, act.v0, act.v1, act.read_as], ["act", "help_at_cost", 4, 5, { risk_index: 0.4 }]);
  const walk = (v0: number) => entryForTelemetry({ type: "passive_locomotion", sessionId: "s", ts: 0, payload: {} }, { delta: vec({ openness: 0.01 }), version_before: v0, version: v0 + 1 }, false)!;
  const folded = foldWalks([walk(5), walk(6), walk(7), act, walk(9)]);
  assert.deepEqual(folded.map((e) => [e.kind, e.v0, e.v1, e.windows]), [["walk", 5, 8, 3], ["act", 4, 5, 1], ["walk", 9, 10, 1]]);
  assert.ok(Math.abs(folded[0]!.delta[2]! - 0.03) < 1e-12);
  assert.equal(foldWalks([walk(5), walk(8)]).length, 2, "walks folded across updates something else made");
  // Across requests too, in memory as in the table's function: only when the versions meet.
  await appendLedger(SUBJECT, [walk(5), walk(6)]);
  await appendLedger(SUBJECT, [walk(7)]);
  await appendLedger(SUBJECT, [walk(20)]);
  const { rows } = await readLedger(SUBJECT);
  assert.deepEqual(rows.map((r) => [r.v0, r.v1, r.windows]), [[5, 8, 3], [20, 21, 1]]);
  forgetLedger(SUBJECT);
  assert.equal((await readLedger(SUBJECT)).rows.length, 0, "erasure left the record in memory");
});

// ── the routes ──────────────────────────────────────────────────────────────────

const auth = () => ({ "content-type": "application/json", authorization: `Bearer ${signIdentity(SUBJECT, SECRET, NOW)}` });
const ctx = { stakes: "low", audience_size: 0, public_or_private: "private", counterpart_status: "none", stage: 0, scarcity_level: 0, mood_proxy: 0, time_pressure: 0 };
const act = (action: string, polarity = "take") => ({ actor_id: SUBJECT, sessionId: "s1", t: NOW, type: "action", channel: "H", cue: "H9", action, polarity, target: { id: "x", kind: "none", status: "none" }, context: ctx, raw_signals: {}, payload: {} });
const observe = (events: unknown[]) => OBSERVE(new Request("https://echo.test/api/observe/behavioral", { method: "POST", headers: auth(), body: JSON.stringify({ events }) }));
const telemetry = (events: unknown[]) => TELEMETRY(new Request("https://echo.test/api/telemetry", { method: "POST", headers: auth(), body: JSON.stringify({ userId: SUBJECT, sessionId: "s1", events }) }));
const look = (headers: Record<string, string> = auth()) => MIRROR_GET(new Request("https://echo.test/api/echo/mirror", { headers }));
const stroll = (n: number) => Array.from({ length: n }, (_, i) => ({ type: "passive_locomotion", sessionId: "s1", ts: NOW + i, payload: { novel_tile_ratio: 0.5 + i * 0.1, path_tortuosity: 1.2, tiles: 10 } }));

test("C61: what the person does is recorded with what it did, and the mirror says which act moved which axis — adding up to the engine's own read", async () => {
  assert.equal((await observe([act("help_at_cost"), act("force_door")])).status, 200);
  assert.equal((await telemetry(stroll(4))).status, 200);
  assert.equal((await observe([act("help_at_cost")])).status, 200);
  assert.equal((await telemetry([{ type: "choice_made", sessionId: "s1", ts: NOW, payload: { option: "save" } }])).status, 200);
  // An update by a route that records nothing.
  update(SUBJECT, vec({ intellect: 0.02 }));
  const { rows } = await readLedger(SUBJECT);
  assert.deepEqual(rows.map((r) => [r.kind, r.action, r.windows]), [["act", "help_at_cost", 1], ["act", "force_door", 1], ["walk", "passive_locomotion", 4], ["act", "help_at_cost", 1], ["choice", "choice_made", 1]]);
  const res = await look();
  assert.equal(res.status, 200);
  const v = (await res.json()) as ReturnType<typeof mirrorOf>;
  assert.equal(v.live, true);
  assert.deepEqual(v.evidence.warmth.map((c) => [c.label, c.count, c.towards]), [["Helped at a cost to yourself", 2, "warm"], ["Forced a door", 1, "cold"]]);
  assert.equal(v.evidence.openness[0]!.label, "Walking about");
  assert.equal(v.evidence.pace[0]!.label, "Made a choice");
  // The one update not on record is the line that is not: intellect, exactly, and nothing else.
  assert.ok(close(PERSONA_AXIS_KEYS.map((k) => v.notInRecord![k]), vec({ intellect: 0.02 }), 1e-9), JSON.stringify(v.notInRecord));
  assert.equal(v.missing, 1);
  assert.deepEqual(v.reads.openness, ["new ground covered"], "an embedding dimension named to the person");
  assert.equal(v.watched!.axis, "warmth");
  assert.equal(engineCalls.filter((c) => c.startsWith("GET /persona")).length, 1, "the engine read more than once for one look");
});

test("C61: the mirror is the caller's own; without the engine it shows the record alone; a mock is never recorded", async () => {
  assert.ok([401, 403].includes((await look({})).status));
  await observe([act("help_at_cost")]);
  delete process.env.ML_SERVICE_URL;
  await observe([act("force_door")]);
  await telemetry(stroll(3));
  assert.equal((await readLedger(SUBJECT)).rows.length, 1, "a mocked answer was recorded as a move");
  const v = (await (await look()).json()) as ReturnType<typeof mirrorOf>;
  assert.equal(v.live, false);
  assert.equal(v.reason, "ml_service_url_unset");
  assert.equal(v.notInRecord, null);
  assert.equal(v.evidence.warmth[0]!.label, "Helped at a cost to yourself");
});

test("C61: the record ages off and is erased like the rest of what a person did", async () => {
  const { RAW_TABLES } = await import("../src/lib/retention");
  assert.ok(RAW_TABLES.some((t) => t.table === "echo_ledger" && t.column === "at"));
  const src = (await import("node:fs")).readFileSync(new URL("../src/app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(src, /\["echo_ledger", "subject"\]/);
  assert.match(src, /forgetLedger\(uid\)/);
  assert.ok(MIRROR.restartGap > 2, "a restart threshold that two requests out of order would cross");
});
