/**
 * One list, and a walk that is really measured (tasks A2 and A1).
 *
 * Two things are checked here, and both of them are things that were true of the demo and were not
 * true of a parcel.
 *
 * THE LIST. /parcel and /demo build the same layers in the same order, and the order is not a
 * preference: the terrain layer paints an orange fallback sky unless the sky layer claimed the air
 * first, and the player takes the scatter's collider index at build, so a player built before the
 * scatter walks through trunks. Asserting the ORDER rather than the set is the point. The list is
 * taken from `parcelLayers` through `sliceOptionsFor`, which is the branch the route itself runs,
 * not from a copy of its
 * shape: a parcel passes a chain and nothing else, and the demo passes a chain and a slice.
 *
 * THE WALK. The locomotion channel used to be fed by the demo's slice layer alone, so a person on
 * their own parcel emitted nothing at all. The chain here is the real one with a stubbed fetch, so
 * the assertion is that a scripted walk reaches /api/telemetry as passive_locomotion, and that the
 * tally the inspector shows is the same walk in metres.
 *
 * Run:  node --import tsx --test apps/web/tests/parcelWorld.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TILE_M } from "@echo/shared";

import { CONSENT_KEY, createMeasureChain, type MeasureChain } from "../src/game/world/measure";
import { parcelLayers, sliceOptionsFor } from "../src/game/world/parcelWorld";
import { walkLayer, type WalkLayer } from "../src/game/world/walkLayer";
import type { LayerContext } from "../src/game/world/PlanetWorld";

// ── the fake browser, as chain.test.mts builds it ───────────────────────────────
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

const posts: { url: string; body: unknown }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  const answer = url.startsWith("/api/agent/persona")
    ? { userId: "u-test", mocked: true, reason: "ml_service_url_unset" }
    : { ok: true, forwarded: 1, mocked: true, durable: false };
  return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

/** Let the fire-and-forget sends settle (fetch, json, log). */
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

// ── the world the walk layer is built against ───────────────────────────────────

/**
 * The layer reads exactly one thing from the context, and this is the value both routes really
 * give it: neither /parcel nor /demo passes `tileM`, so PlanetWorld's frame carries TILE_M.
 */
const ctx = { frame: { tileM: TILE_M } } as unknown as LayerContext;

/** A frame every 50 ms, which is the cadence the chain's own locomotion test walks at. */
const FRAME_MS = 50;
const FRAME_S = FRAME_MS / 1000;

// ── the list ────────────────────────────────────────────────────────────────────

test("a parcel and the demo build one list, in one order, differing only in the slice", () => {
  const chain = { armed: () => false, feedPosition: () => {} } as unknown as MeasureChain;

  const parcel = parcelLayers({ chain, slice: sliceOptionsFor(undefined, {}) }).map((l) => l.name);
  const demo = parcelLayers({ chain, slice: sliceOptionsFor("slice", {}) }).map((l) => l.name);

  assert.deepEqual(parcel, ["sky", "terrain", "settlement", "scatter", "canopy-closure", "detail", "player", "villagers", "animals", "market", "meadow", "weather", "walk", "interact", "interior", "home", "director", "sound"]);
  assert.deepEqual(demo, ["sky", "terrain", "settlement", "scatter", "canopy-closure", "detail", "player", "villagers", "animals", "market", "meadow", "weather", "walk", "interact", "interior", "home", "director", "sound", "slice"]);

  // The rationales that are load-bearing, stated as the relations they are, so that a reordering
  // fails here with the reason and not merely with a different array.
  assert.equal(parcel[0], "sky", "the terrain layer paints its orange fallback unless the sky claimed the air first");
  assert.ok(parcel.indexOf("scatter") < parcel.indexOf("player"), "the player takes the scatter's collider index at build, so it must be built after it");
  // DECISIONS C41: the player takes the village's walls at build in the same way, so a village built
  // after the player would be a village you walk through.
  assert.ok(parcel.indexOf("settlement") < parcel.indexOf("player"), "the player takes the village's walls at build, so it must be built after it");
  assert.ok(parcel.indexOf("player") < parcel.indexOf("villagers"), "the nameplate is for whoever is nearest the player THIS frame");
  // C45: what is within reach is read off the scatter's placement and the villagers' last frame.
  assert.ok(parcel.indexOf("scatter") < parcel.indexOf("interact") && parcel.indexOf("villagers") < parcel.indexOf("interact"), "the interact layer reads the scatter and the villagers, so it is built after both");
  // C48: the weather leans on the sky the frame has already computed.
  assert.ok(parcel.indexOf("sky") < parcel.indexOf("weather"), "the weather leans on the sky, so it comes after it");
  assert.ok(demo.indexOf("player") < demo.indexOf("walk"), "the walk layer reports the position the mover committed this frame");
  // DECISIONS C17: the closure darkens the ground the TERRAIN uploaded by the crowns the SCATTER
  // placed, so it is the one layer that has two predecessors and both of them are hard.
  assert.ok(parcel.indexOf("terrain") < parcel.indexOf("canopy-closure"), "the closure writes into the terrain's own colour attribute, so there has to be one");
  assert.ok(parcel.indexOf("scatter") < parcel.indexOf("canopy-closure"), "the closure is computed from the placement, so the scatter has to have placed it");
});

test("every parcel gets the walk layer, which is what feeds the chain on ground with no slice", () => {
  const chain = { armed: () => false, feedPosition: () => {} } as unknown as MeasureChain;
  assert.ok(parcelLayers({ chain, slice: sliceOptionsFor(null, {}) }).some((l) => l.name === "walk"), "a parcel with no slice would feed the locomotion channel with nothing");
});

// ── the walk ────────────────────────────────────────────────────────────────────

/** Ten tiles east at 5 tiles/s, then four seconds standing still. Returns the layer and the chain. */
async function walkAndStand(chain: MeasureChain, clock: { now: number }): Promise<WalkLayer> {
  const at = { x: 0, y: 0 };
  const layer = walkLayer({ chain, playerTile: () => at });
  await layer.build(ctx, new AbortController().signal);
  for (let i = 0; i <= 40; i++) {
    at.x = i * 0.25;
    clock.now += FRAME_MS;
    layer.update(FRAME_S, ctx);
  }
  for (let i = 0; i < 80; i++) {
    clock.now += FRAME_MS;
    layer.update(FRAME_S, ctx);
  }
  return layer;
}

test("nothing is measured before consent, not on the wire and not in the tally", async () => {
  store.clear();
  posts.length = 0;
  const clock = { now: 10_000 };
  const chain = createMeasureChain({ now: () => clock.now });

  const layer = await walkAndStand(chain, clock);
  chain.flush();
  await settle();

  assert.equal(layer.tally(), null, "a tally was kept behind an unanswered consent card");
  assert.deepEqual(posts, [], "the world reached the network before anyone consented");
  chain.dispose();
});

test("after a yes, the walk is on the wire as passive_locomotion and in the tally as metres", async () => {
  store.clear();
  posts.length = 0;
  const clock = { now: 10_000 };
  const chain = createMeasureChain({ now: () => clock.now });
  chain.accept();

  const layer = await walkAndStand(chain, clock);
  chain.flush();
  await settle();

  // The channel the parcel had none of. The sampler decides how many windows this is; that one
  // arrived at all is the claim.
  const telemetry = posts.filter((p) => p.url === "/api/telemetry");
  assert.ok(telemetry.length > 0, "walking a parcel produced no telemetry");
  const events = (telemetry[0].body as { events: { type: string; session_mode: string }[] }).events;
  assert.ok(events.some((e) => e.type === "passive_locomotion"), "the locomotion channel never fired");
  assert.equal(events[0].session_mode, "landing");

  // The same walk, as the inspector reports it. Ten tiles at TILE_M is 16 m; the first frame only
  // sets the previous position, so it contributes nothing.
  const tally = layer.tally();
  assert.ok(tally, "the walk layer measured nothing");
  assert.equal(Number(tally!.distanceM.toFixed(3)), 16);
  // Four seconds of standing still, and not one millisecond of the walking counted as dwell.
  assert.equal(Math.round(tally!.dwellMs), 4000);
  assert.equal(Math.round(tally!.measuredMs), 6050);
  // x runs 0 to 10 in quarter tiles, which touches eleven distinct tiles once rounded.
  assert.equal(tally!.tiles, 11);
  assert.equal(Number(tally!.areaM2.toFixed(4)), Number((11 * TILE_M * TILE_M).toFixed(4)));
  assert.equal(tally!.capped, false);

  chain.dispose();
});

test("a later no drops the tally as well as the sending, the way revoke drops the log", async () => {
  store.clear();
  posts.length = 0;
  const clock = { now: 10_000 };
  const chain = createMeasureChain({ now: () => clock.now });
  chain.accept();

  const at = { x: 0, y: 0 };
  const layer = walkLayer({ chain, playerTile: () => at });
  await layer.build(ctx, new AbortController().signal);
  for (let i = 0; i <= 40; i++) {
    at.x = i * 0.25;
    clock.now += FRAME_MS;
    layer.update(FRAME_S, ctx);
  }
  assert.ok(layer.tally(), "consent was accepted and nothing was measured");

  chain.decline();
  clock.now += FRAME_MS;
  layer.update(FRAME_S, ctx);
  assert.equal(layer.tally(), null, "a counter kept running behind a no");

  // And it starts from nothing rather than resuming, so a declined stretch is not credited later.
  chain.accept();
  for (let i = 0; i < 3; i++) {
    at.x += 0.25;
    clock.now += FRAME_MS;
    layer.update(FRAME_S, ctx);
  }
  assert.equal(Number(layer.tally()!.distanceM.toFixed(3)), Number((0.5 * TILE_M).toFixed(3)));
  chain.dispose();
});

test("the consent key it reads is the one the card writes", () => {
  store.clear();
  const chain = createMeasureChain();
  assert.equal(chain.consent(), "unset");
  chain.accept();
  assert.equal(store.get(CONSENT_KEY), JSON.stringify({ telemetry: true }));
  assert.equal(chain.consent(), "accepted");
  chain.dispose();
});
