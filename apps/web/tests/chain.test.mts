/**
 * The measurement chain, proven without a network (plan W5-1).
 *
 * A browser is faked just far enough for identity.ts and the consent gate (window.location,
 * localStorage), and globalThis.fetch is a recorder that answers with canned route responses. No
 * request ever leaves the process.
 *
 * Run:  node --import tsx --test apps/web/tests/chain.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { PERSONA_AXIS_KEYS, type BehavioralEvent, type TelemetryEvent } from "@echo/shared";

import type { LocomotionScalars } from "../src/game/telemetry";
import { CONSENT_KEY, createMeasureChain, landingConsent, LANDING_CONTEXT } from "../src/game/world/measure";

// ── the fake browser ────────────────────────────────────────────────────────────
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});
Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { location: { search: "" } } });

interface Call {
  url: string;
  method: string;
  body: unknown;
}
const calls: Call[] = [];
let respond: (url: string, body: unknown) => unknown = () => ({});
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ url, method, body });
  return new Response(JSON.stringify(respond(url, body)), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

/**
 * The POSTs that WRITE something, which is what every count in this file is about.
 *
 * `/api/identity/session` is excluded because it is the credential handshake and not a write: it
 * carries no event, no telemetry and no user data, and it exists so that the writes below can be
 * attributed to a subject the server verified rather than one the client asserted (SOC-2.E). Counting
 * it as a write would make "one action is exactly one POST" a claim about network traffic instead of
 * a claim about the chain, which is the thing being tested.
 */
const writes = () => calls.filter((c) => c.method === "POST" && c.url !== "/api/identity/session");

/** Every request the chain makes about the WORLD — the handshake excluded, for the same reason. */
const traffic = () => calls.filter((c) => c.url !== "/api/identity/session");

/** Let the fire-and-forget sends settle (fetch → json → log). */
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const SEED_MU = [0.1, -0.2, 0.3, 0, 0.05, -0.1, 0.2, 0.4];
const MOVED_MU = [0.1, -0.13, 0.3, 0.01, 0.05, -0.1, 0.2, 0.4];
const SIGMA = SEED_MU.map((_, i) => SEED_MU.map((__, j) => (i === j ? 0.25 : 0)));
const REQUIRED = ["stakes", "audience_size", "public_or_private", "counterpart_status", "stage", "scarcity_level", "mood_proxy", "time_pressure"] as const;

const online: typeof respond = (url, body) => {
  if (url.startsWith("/api/agent/persona")) return { userId: "u-test", traits: [], persona: { mu: SEED_MU, Sigma: SIGMA, version: 3 }, var: SIGMA.map((r, i) => r[i]) };
  if (url === "/api/observe/behavioral") {
    return {
      ok: true, forwarded: 1, mocked: false, durable: true,
      results: [{ userId: "u-test", polarity: "take", cond_key: "low|0|private|none|1", persona: { mu: MOVED_MU, Sigma: SIGMA, version: 4 }, delta_mu: 0.0731, cond_persona: { mu: MOVED_MU }, telemetry_used: { risk_index: 0.75 } }],
    };
  }
  if (url === "/api/telemetry") return { ok: true, forwarded: (body as { events: unknown[] }).events.length, mocked: false, durable: true };
  return {};
};

const offline: typeof respond = (url) => {
  if (url.startsWith("/api/agent/persona")) return { userId: "u-test", traits: [], mocked: true, reason: "ml_service_url_unset" };
  if (url === "/api/observe/behavioral") return { ok: true, forwarded: 1, mocked: true, reason: "ml_service_url_unset", durable: false, durable_reason: "supabase_unkeyed", results: [{ ok: true, mocked: true, reason: "ml_service_url_unset" }] };
  if (url === "/api/telemetry") return { ok: true, forwarded: 1, mocked: true, durable: false, durable_reason: "supabase_unkeyed" };
  return {};
};

function reset(r: typeof respond) {
  store.clear();
  calls.length = 0;
  respond = r;
}

/** A straight ten-tile walk east at 5 tiles/s, a frame every 50 ms, from t0. */
function walkEast(feed: (x: number, y: number, now: number) => void, t0 = 10_000) {
  for (let i = 0; i <= 40; i++) feed(i * 0.25, 0, t0 + i * 50);
}

// ── consent ─────────────────────────────────────────────────────────────────────

test("the landing reads the shared key the strict way: only an explicit true is accepted", () => {
  reset(online);
  assert.equal(landingConsent(), "unset");
  store.set(CONSENT_KEY, JSON.stringify({ voice: true }));
  assert.equal(landingConsent(), "unset", "a record without the telemetry field is unset, not on");
  store.set(CONSENT_KEY, JSON.stringify({ telemetry: false }));
  assert.equal(landingConsent(), "declined");
  store.set(CONSENT_KEY, JSON.stringify({ telemetry: true }));
  assert.equal(landingConsent(), "accepted");
  store.set(CONSENT_KEY, "not json");
  assert.equal(landingConsent(), "unset", "a corrupt record is unset, the safe side");
});

test("with consent unset the chain emits nothing: no fetch, no buffer, no sample, no log", async () => {
  reset(online);
  const chain = createMeasureChain({ userId: "u-test", sessionId: "s-unset" });
  try {
    assert.equal(chain.consent(), "unset");
    assert.equal(chain.armed(), false);
    walkEast(chain.feedPosition);
    const r = await chain.emitAction("enter_cave", { raw: { risk01: 0.75 } });
    chain.flush();
    await settle();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "consent_off");
    assert.equal(r.event, null);
    assert.equal(calls.length, 0, "not even the seed GET goes out before accept");
    assert.equal(chain.log().length, 0);
    assert.equal(chain.posterior(), null);
  } finally {
    chain.dispose();
  }
  await settle();
  assert.equal(calls.length, 0, "dispose flushes nothing either");
});

test("LANDING_CONTEXT carries all eight mandatory fields", () => {
  for (const k of REQUIRED) assert.notEqual(LANDING_CONTEXT[k], undefined, k);
});

// ── the action path ─────────────────────────────────────────────────────────────

test("after accept, one action is exactly one POST carrying all eight context fields and session_mode landing, and the posterior comes back", async () => {
  reset(online);
  const chain = createMeasureChain({ userId: "u-test", sessionId: "s-act" });
  try {
    chain.accept();
    assert.equal(chain.consent(), "accepted");
    assert.equal(JSON.parse(store.get(CONSENT_KEY)!).telemetry, true, "accept writes the shared key explicitly");
    assert.equal(chain.armed(), true);
    await settle();

    // ONE seed read, and it is the same uid the events are written under.
    const gets = calls.filter((c) => c.method === "GET");
    assert.equal(gets.length, 1);
    assert.ok(gets[0].url.startsWith("/api/agent/persona?uid=u-test"), gets[0].url);
    assert.deepEqual(chain.posterior()?.mu, SEED_MU);
    assert.equal(chain.posterior()?.version, 3);
    assert.equal(chain.posterior()?.source, "seed");
    assert.equal(chain.posterior()?.mocked, false);

    const r = await chain.emitAction("enter_cave", { raw: { risk01: 0.75, decision_latency_ms: 420 }, target: { id: "cave_mouth", kind: "place" } });

    const posts = writes();
    assert.equal(posts.length, 1, "exactly one POST for one action");
    assert.equal(posts[0].url, "/api/observe/behavioral");
    const ev = (posts[0].body as { event: BehavioralEvent }).event;
    for (const k of REQUIRED) assert.ok(ev.context[k] !== undefined && ev.context[k] !== null, `context.${k}`);
    assert.equal(ev.session_mode, "landing");
    assert.equal(ev.actor_id, "u-test");
    assert.equal(ev.sessionId, "s-act");
    assert.equal(ev.action, "enter_cave");
    assert.equal(ev.cue, "F3");
    assert.equal(ev.channel, "F");
    assert.equal(ev.type, "resource_bet", "the coarse legacy type follows the cue");
    assert.equal(ev.polarity, "take");
    assert.equal(ev.provenance, "live");
    assert.deepEqual(ev.target, { id: "cave_mouth", kind: "place", status: "none" });
    assert.equal(ev.raw_signals.risk01, 0.75);
    assert.equal(ev.raw_signals.decision_latency_ms, 420);
    assert.equal(ev.payload.event_id, r.eventId, "the stored row carries the id the inspector shows");

    // The result is the number: the caller reads it off the return value.
    assert.equal(r.ok, true);
    assert.equal(r.mocked, false);
    assert.equal(r.durable, true);
    assert.deepEqual(r.persona?.mu, MOVED_MU);
    assert.equal(r.persona?.version, 4);
    assert.equal(r.delta_mu, 0.0731);
    assert.deepEqual(r.response?.results?.[0].telemetry_used, { risk_index: 0.75 });

    // …and the same update is now the chain's posterior, event-driven, with diag(Sigma) as var.
    const p = chain.posterior();
    assert.deepEqual(p?.mu, MOVED_MU);
    assert.equal(p?.version, 4);
    assert.equal(p?.source, "event");
    assert.deepEqual(p?.var, PERSONA_AXIS_KEYS.map(() => 0.25));

    const log = chain.log();
    assert.equal(log.length, 1);
    assert.equal(log[0].id, r.eventId);
    assert.equal(log[0].route, "behavioral");
    assert.deepEqual([...log[0].features], ["risk_index", "decision_latency"]);
    assert.equal(log[0].delta_mu, 0.0731);
    assert.equal(log[0].version, 4);
    assert.equal(log[0].durable, true);
    assert.equal(log[0].mocked, false);

    await settle();
    assert.equal(traffic().length, 2, "no polling: one seed GET, one POST, nothing else");
    // The handshake happens ONCE per armed chain and never again — a mint per event would be a
    // different kind of polling, and one nothing else in this file would have caught.
    assert.equal(calls.filter((c) => c.url === "/api/identity/session").length, 1, "one identity mint, not one per event");
  } finally {
    chain.dispose();
  }
});

test("an action outside ACTION_AXIS_MAP with no cue is refused, logged, and never sent", async () => {
  reset(online);
  store.set(CONSENT_KEY, JSON.stringify({ telemetry: true }));
  const chain = createMeasureChain({ userId: "u-test", sessionId: "s-unmapped" });
  try {
    await settle();
    const before = calls.length;
    const r = await chain.emitAction("juggle_coconuts");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "unmapped_action");
    assert.equal(calls.length, before);
    assert.equal(chain.log().at(-1)?.reason, "unmapped_action");
  } finally {
    chain.dispose();
  }
});

test("when the service is down the result says so, with the reason, and no number is invented", async () => {
  reset(offline);
  const chain = createMeasureChain({ userId: "u-test", sessionId: "s-off" });
  try {
    chain.accept();
    await settle();
    assert.equal(chain.posterior()?.mocked, true);
    assert.equal(chain.posterior()?.reason, "ml_service_url_unset");

    const r = await chain.emitAction("plant_seed", { raw: { delayed: true } });
    assert.equal(r.mocked, true);
    assert.equal(r.reason, "ml_service_url_unset");
    assert.equal(r.durable, false);
    assert.equal(r.persona, null);
    assert.equal(r.delta_mu, null);
    assert.ok(r.event, "the envelope was still built and sent; only the answer was mocked");

    const p = chain.posterior();
    assert.equal(p?.mocked, true);
    assert.equal(p?.reason, "ml_service_url_unset");
    const e = chain.log()[0];
    assert.equal(e.mocked, true);
    assert.equal(e.durable, false);
    assert.equal(e.mu, null);
    assert.equal(e.delta_mu, null);
  } finally {
    chain.dispose();
  }
});

// ── the locomotion path ─────────────────────────────────────────────────────────

test("a straight ten-tile walk samples as path_tortuosity ≈ 1 and novel_tile_ratio ≈ 1, and reaches /api/telemetry as passive_locomotion", async () => {
  reset(online);
  store.set(CONSENT_KEY, JSON.stringify({ telemetry: true }));
  const chain = createMeasureChain({ userId: "u-test", sessionId: "s-walk" });
  try {
    assert.equal(chain.armed(), true, "a returning, consented visitor arms at construction");
    walkEast(chain.feedPosition);
    chain.flush();
    await settle();

    const posts = calls.filter((c) => c.method === "POST" && c.url === "/api/telemetry");
    assert.equal(posts.length, 1);
    const body = posts[0].body as { userId: string; sessionId: string; events: TelemetryEvent[] };
    assert.equal(body.userId, "u-test");
    assert.equal(body.sessionId, "s-walk");
    const loco = body.events.filter((e) => e.type === "passive_locomotion");
    assert.equal(loco.length, 1, "one 1.5 s window fits in a 2 s walk; the sampler's cadence is untouched");
    for (const e of loco) {
      assert.equal(e.session_mode, "landing");
      const p = e.payload as unknown as LocomotionScalars;
      assert.ok(Math.abs(p.path_tortuosity - 1) < 0.02, `path_tortuosity ${p.path_tortuosity}`);
      assert.ok(Math.abs(p.novel_tile_ratio - 1) < 0.02, `novel_tile_ratio ${p.novel_tile_ratio}`);
      assert.equal(p.backtrack_rate, 0);
      assert.equal(p.heading_change_rate, 0);
      assert.ok(p.tiles >= 6, `tiles ${p.tiles}`);
    }

    // The log shows them as telemetry-routed with the two features the /telemetry branch reads,
    // and honestly without a posterior, since that route returns none.
    const entries = chain.log().filter((l) => l.route === "telemetry");
    assert.equal(entries.length, loco.length);
    assert.deepEqual([...entries[0].features], ["novel_tile_ratio", "path_tortuosity"]);
    assert.equal(entries[0].durable, true);
    assert.equal(entries[0].mocked, false);
    assert.equal(entries[0].delta_mu, null);
  } finally {
    chain.dispose();
  }
});

test("revoke drops what was buffered and nothing is sent afterwards", async () => {
  reset(online);
  const chain = createMeasureChain({ userId: "u-test", sessionId: "s-revoke" });
  try {
    chain.accept();
    await settle();
    walkEast(chain.feedPosition); // one locomotion window now sits in the collector's buffer
    chain.revoke();
    await settle();
    assert.equal(chain.consent(), "declined");
    assert.equal(JSON.parse(store.get(CONSENT_KEY)!).telemetry, false);
    assert.equal(chain.armed(), false);
    assert.equal(calls.filter((c) => c.url === "/api/telemetry").length, 0, "the buffered window was dropped, not flushed");
    const r = await chain.emitAction("enter_cave");
    assert.equal(r.reason, "consent_off");
    walkEast(chain.feedPosition, 20_000);
    chain.flush();
    await settle();
    assert.equal(writes().length, 0);
    assert.equal(chain.log().length, 0, "revoke forgets the local log too");
  } finally {
    chain.dispose();
  }
});
