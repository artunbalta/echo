/**
 * Cross-device co-presence + social cue emission — headless integration test (Steps 3 & 4).
 *
 * Headless WebGL is unreliable, so we prove the REAL realtime spine server-side: boot the actual
 * Colyseus Server (the production WorldRoom + WebSocketTransport) on an ephemeral port and connect
 * TWO real `colyseus.js` clients from Node. Asserts:
 *
 *   1. CO-PRESENCE + STATE SYNC — both sessions join the SAME room; each sees the other; A's move
 *      mirrors into B's state; the server acks A's last input seq.
 *   2. SLOT SPAWN — A(slot 0) & B(slot 1) spawn adjacent (Step-1 cluster → reachable neighbour).
 *   3. FIRST CONTACT — opening a live interaction emits, per actor, a `first_contact` event AND a
 *      proxemics event derived from the settled distance (both stage 2, counterpart peer, full ctx).
 *   4. F2 SOCIAL CUE — a SOCIAL_CUE the client sends (an opener register) makes the server emit one
 *      per-actor event from that actor's vantage (stage 2, counterpart peer).
 *   5. F3 CLEARING STATION — walking to the low-status server NPC and being courteous emits an event
 *      the server stamps with counterpart_status:"low" and stage 3 — the courtesy-by-status cue.
 *
 * Run:  npm run test:copresence -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
 * Zero keys: in-memory rooms; a local stub ML captures the per-actor /observe/behavioral POSTs.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { WORLD, tileDistance, islandSlot, OCEAN, clampToMap, presenceTier, PRESENCE, oceanLandAt, OCEAN_BEACH_W, type EventContext } from "@echo/shared";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function waitFor(pred: () => boolean, timeoutMs = 8000, label = "condition"): Promise<void> {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    (function loop() {
      if (pred()) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error(`timeout waiting for ${label}`));
      setTimeout(loop, 20);
    })();
  });
}

const REQUIRED_CONTEXT = [
  "stakes", "audience_size", "public_or_private", "counterpart_status",
  "stage", "scarcity_level", "mood_proxy", "time_pressure",
] as const;

interface CapturedEvent {
  actor_id: string; action: string; channel: string;
  target: { id: string; status: string }; context: EventContext;
  raw_signals?: Record<string, number>;
}
const captured: CapturedEvent[] = [];
const evsBy = (action: string) => captured.filter((e) => e.action === action);
// The Stage-2 SIGHTING (P4) is a SOLITARY cue that deliberately fires while a figure is still
// far + anonymous — it is not social. The "zero social until CLOSE" invariant checks these.
const socialCaptured = () => captured.filter((e) => e.action !== "egg_horizon_seen");

function assertFullContext(e: CapturedEvent, stage: number, label: string) {
  for (const k of REQUIRED_CONTEXT) {
    assert.ok((e.context as any)[k] !== undefined && (e.context as any)[k] !== null, `${label}: context.${k} present`);
  }
  assert.equal(e.context.stage, stage, `${label}: stage ${stage}`);
  assert.equal(e.context.public_or_private, "public", `${label}: public`);
}

const out: string[] = [];
const log = (s: string) => out.push(s);

async function main() {
  // 1) Stub ML capture server (stands in for /observe/behavioral). Started first so the realtime
  //    server can be pointed at it via ML_SERVICE_URL (read at persistence.ts module load).
  const mlStub: HttpServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/observe/behavioral") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try { captured.push(JSON.parse(body).event); } catch { /* ignore */ }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, delta_mu: 0.1, polarity: "take" }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => mlStub.listen(0, "127.0.0.1", () => r()));
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${(mlStub.address() as { port: number }).port}`;
  process.env.ML_SERVICE_TOKEN = "dev-ml-token-change-me";

  // 2) Boot the REAL realtime server (mirrors apps/realtime/src/index.ts).
  const { WorldRoom } = await import("./WorldRoom.js");
  const httpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("world", WorldRoom);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
  const url = `ws://127.0.0.1:${(httpServer.address() as { port: number }).port}`;

  // 3) Two real clients on ADJACENT slots.
  const clientA = new Client(url);
  const clientB = new Client(url);
  const roomA = await clientA.joinOrCreate("world", { userId: "userA", name: "Alice", slotIndex: 0 });
  const roomB = await clientB.joinOrCreate("world", { userId: "userB", name: "Bob", slotIndex: 1 });
  roomA.onMessage("welcome", () => {});
  roomB.onMessage("welcome", () => {});
  // P3: capture the interaction id so a real chat turn can be sent through the live pipe.
  let iidA = "";
  roomA.onMessage("interact_opened", (p: { interactionId: string }) => { iidA = p.interactionId; });
  roomB.onMessage("interact_opened", () => {});
  roomA.onMessage("interact_turn", () => {});
  roomB.onMessage("interact_turn", () => {});
  roomA.onMessage("interact_closed", () => {});
  roomB.onMessage("interact_closed", () => {});
  roomA.onMessage("error", () => {});

  const ent = (room: any, id: string) => room.state?.entities?.get?.(id);
  const A = () => ent(roomA, roomA.sessionId);
  const B = () => ent(roomB, roomB.sessionId);

  log("=".repeat(96));
  log("ECHO Steps 3+4 — co-presence + F2 dialogue + F3 clearing (two real clients, one WorldRoom)");
  log("=".repeat(96));

  // steer A toward a target tile until within `within` tiles (poll the authoritative state)
  async function steerA(tx: () => number, ty: () => number, within: number, label: string) {
    // cap generous enough for a long sail across the widened ocean (≈47 tiles after the #4 detour).
    for (let i = 0; i < 360 && tileDistance(A().x, A().y, tx(), ty()) > within; i++) {
      const dx = tx() - A().x, dy = ty() - A().y;
      roomA.send("move_intent", {
        dir: { x: Math.abs(dx) > 0.4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 0.4 ? Math.sign(dy) : 0 },
        facing: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
        seq: 1000 + i,
      });
      await sleep(60);
    }
    roomA.send("stop", { seq: 9999 });
    assert.ok(tileDistance(A().x, A().y, tx(), ty()) <= within, `A reached ${label}`);
  }

  // ── (1) co-presence + (2) slot spawn ─────────────────────────────────────────────────────────
  await waitFor(() => !!A() && !!B() && !!ent(roomB, roomA.sessionId) && !!ent(roomA, roomB.sessionId), 8000, "mutual visibility");
  const gap0 = tileDistance(A().x, A().y, B().x, B().y);
  log(`\n[1/2] both in room "world"; slot spawn A=(${A().x.toFixed(1)},${A().y.toFixed(1)}) B=(${B().x.toFixed(1)},${B().y.toFixed(1)}) gap=${gap0.toFixed(2)}`);
  assert.ok(gap0 < 45, "Step-1 neighbours spawn on adjacent islands (a short sail apart, ~36 tiles)");
  const ax0 = A().x;
  roomA.send("move_intent", { dir: { x: 1, y: 0 }, facing: "right", seq: 1 });
  await waitFor(() => A().x > ax0 + 0.5 && Math.abs(ent(roomB, roomA.sessionId).x - A().x) < 0.05, 5000, "B sees A move");
  roomA.send("stop", { seq: 2 });
  await waitFor(() => A().lastSeq === 2, 3000, "server acks A's stop seq");
  assert.equal(A().lastSeq, 2, "server acked A's last input seq");
  log(`      A moved → B mirrors A.x=${ent(roomB, roomA.sessionId).x.toFixed(2)} (|Δ|<0.05); lastSeq=${A().lastSeq}`);

  // ── presence #5: distance hides IDENTITY, not VISIBILITY. The render makes distant players SHARP +
  //    fully visible (no silhouette) — but the MEASUREMENT gate is unchanged: social cues fire ONLY at
  //    Tier 1 (CLOSE). So while A & B are merely distant, the Flow-0 baseline cannot leak — ZERO social.
  //    (Names are gated the same way: shown only within CLOSE; see the name-gate assertion below.) ──
  assert.notEqual(presenceTier(gap0), "close", "adjacent-slot neighbours spawn FAR (not at the interactable CLOSE tier)");
  assert.equal(socialCaptured().length, 0, "ZERO social events while not CLOSE (a sharp distant player never starts measurement)");
  // name-gate (#5): identity (the name label) appears ONLY within near/interaction range, never far.
  assert.notEqual(presenceTier(gap0), "close", "#5 a distant player is anonymous — no name shown far (name gate = tier 'close')");
  assert.equal(presenceTier(0.5), "close", "#5 a near player IS named — the name resolves in only within CLOSE");
  log(`      presenceTier(gap ${gap0.toFixed(1)}) = "${presenceTier(gap0)}" → sharp+visible but anonymous & non-interactable; name gate close-only; social events so far = ${captured.length}`);

  // ── WATER IS A WALL: on foot (not sailing), A cannot cross the open sea to B's island ──
  for (let i = 0; i < 70; i++) {
    const dx = B().x - A().x, dy = B().y - A().y;
    roomA.send("move_intent", { dir: { x: Math.sign(dx), y: Math.sign(dy) }, facing: "right", seq: 200 + i });
    await sleep(45);
  }
  roomA.send("stop", { seq: 299 });
  await sleep(150);
  const walkedGap = tileDistance(A().x, A().y, B().x, B().y);
  assert.notEqual(presenceTier(walkedGap), "close", `on foot A cannot reach B across water (gap ${walkedGap.toFixed(1)}, ${presenceTier(walkedGap)})`);
  assert.equal(socialCaptured().length, 0, "still ZERO social events — the water barrier kept A off B's island");
  log(`\n[barrier] A walked straight at B for ~3s WITHOUT sailing → gap ${walkedGap.toFixed(1)} (${presenceTier(walkedGap)}); the sea held.`);

  // ── P4 STAGE-2 SIGHTING: a far, sharp, ANONYMOUS figure across the water is itself a cue
  //    (egg_horizon_seen, once per pair, both viewers) — SOLITARY context (audience 0, private,
  //    no counterpart: nothing social has begun; naming/social start only at CLOSE). ──
  await waitFor(() => evsBy("egg_horizon_seen").length >= 2, 6000, "sighting fired for both viewers");
  const sA = evsBy("egg_horizon_seen").find((e) => e.actor_id === "userA")!;
  const sB = evsBy("egg_horizon_seen").find((e) => e.actor_id === "userB")!;
  assert.ok(sA && sB, "one sighting per viewer (per-actor, once per pair)");
  for (const s of [sA, sB]) {
    assert.equal(s.context.audience_size, 0, "sighting is solitary (audience 0)");
    assert.equal(s.context.public_or_private, "private", "sighting is private (no social has begun)");
    assert.equal(s.context.counterpart_status, "none", "the figure is ANONYMOUS at that tier");
    assert.ok((s.raw_signals?.distance ?? 0) > PRESENCE.APPROACH, "sighted while genuinely far");
  }
  assert.equal(evsBy("egg_horizon_seen").length, 2, "exactly once per (viewer, seen) pair — no re-fires");
  log(`[P4 sighting] egg_horizon_seen fired once per viewer at gap ~${sA.raw_signals?.distance} tiles — solitary, anonymous, capped`);

  // ── #4 SHORELINE CLAMP, NO REBOUND (clean pure-axis test): the barrier walk above pushed A
  //    diagonally, so A slid ALONG its curved coast (sliding ≠ rebound — the server only ever clamps,
  //    never shoves back). To isolate the wall, walk A back to its island centre and then push DUE
  //    EAST straight into the open sea. A must stop CLEANLY at the last walkable tile (the sand's
  //    outer edge) and STAY there under continued push — no drift, no snap-back, never onto the water.
  //    Because the server's barrier predicate is oceanLandAt(x,y,beach) — the SAME function
  //    WorldCore.blockedAt uses for the shared ocean — the client's predicted wall and the server's
  //    authoritative wall are identical, so the client is never reconciled backward (the judder). ──
  const sxA = WORLD.MAP_WIDTH / OCEAN.EXTENT, syA = WORLD.MAP_HEIGHT / OCEAN.EXTENT;
  const homeC = { x: islandSlot(0).x * sxA, y: islandSlot(0).y * syA }; // A's island centre
  await steerA(() => homeC.x, () => homeC.y, 0.6, "back to its island centre");
  // push due east until A is jammed against the wall (x stops advancing for several ticks).
  let prevX = -1, stuck = 0;
  for (let i = 0; i < 140 && stuck < 6; i++) {
    roomA.send("move_intent", { dir: { x: 1, y: 0 }, facing: "right", seq: 600 + i });
    await sleep(45);
    if (A().x - prevX < 0.02) stuck++; else stuck = 0;
    prevX = A().x;
  }
  roomA.send("stop", { seq: 699 });
  await sleep(120);
  const eastStop = { x: A().x, y: A().y };
  assert.ok(oceanLandAt(eastStop.x, eastStop.y, OCEAN_BEACH_W), "#4 A stopped ON LAND at the east shoreline (never on the open sea)");
  assert.ok(!oceanLandAt(eastStop.x + 0.6, eastStop.y, OCEAN_BEACH_W), "#4 one step further east is open sea — A is parked at the LAST walkable tile (a clean wall)");
  for (let i = 0; i < 16; i++) { roomA.send("move_intent", { dir: { x: 1, y: 0 }, facing: "right", seq: 700 + i }); await sleep(45); }
  roomA.send("stop", { seq: 799 });
  await sleep(120);
  const eastDrift = tileDistance(eastStop.x, eastStop.y, A().x, A().y);
  assert.ok(eastDrift < 0.05, `#4 no rebound — A held exactly at the shoreline under continued push (drift ${eastDrift.toFixed(4)} tiles, no snap-back)`);
  log(`[#4 no-rebound] A walked due east into the sea → stopped cleanly on land at the shore (${eastStop.x.toFixed(2)},${eastStop.y.toFixed(2)}); one step further = open sea; stayed put under continued push (drift ${eastDrift.toFixed(4)}). Client+server share oceanLandAt(beach) ⇒ no reconcile snap-back / judder.`);

  // ── SAIL ACROSS: board a raft (set_sail) → the sea becomes traversable → reach B at Tier 1 ──
  roomA.send("set_sail", { on: true });
  await sleep(100);
  await steerA(() => B().x, () => B().y, 1.3, "interaction range of B (by sailing across the water)");
  assert.equal(presenceTier(tileDistance(A().x, A().y, B().x, B().y)), "close", "sailing let A cross to Tier 1");
  log(`[crossing] A boarded a raft (set_sail) and sailed across to B → Tier 1 (CLOSE).`);

  // ── (3) first contact at Tier 1: per-actor first_contact + proxemics (social begins ONLY here) ──
  roomA.send("interact_start", { targetId: roomB.sessionId });
  await waitFor(() => evsBy("first_contact").length >= 2 && evsBy("proxemics_close").length + evsBy("proxemics_far").length >= 2, 5000, "first-contact pair + proxemics pair");
  const fc = evsBy("first_contact");
  const prox = [...evsBy("proxemics_close"), ...evsBy("proxemics_far")];
  assert.equal(fc.length, 2, "two first_contact (one per actor)");
  assert.ok(fc.some((e) => e.actor_id === "userA" && e.target.id === "userB") && fc.some((e) => e.actor_id === "userB" && e.target.id === "userA"), "first_contact siloed per actor");
  assert.equal(prox.length, 2, "two proxemics (one per actor, derived from distance)");
  for (const e of [...fc, ...prox]) { assertFullContext(e, 2, e.action); assert.equal(e.context.counterpart_status, "peer"); }
  log(`\n[3] first contact → ${fc.length} first_contact + ${prox.length} ${prox[0].action} (per actor, stage 2, peer)`);

  // ── (4) F2 SOCIAL CUE: A chooses a warm opener toward B ──────────────────────────────────────
  roomA.send("social_cue", { targetId: roomB.sessionId, action: "opener_warm", latencyMs: 1200, editsCount: 0 });
  await waitFor(() => evsBy("opener_warm").length >= 1, 4000, "opener_warm emitted");
  const ow = evsBy("opener_warm").find((e) => e.actor_id === "userA")!;
  assert.ok(ow, "opener_warm emitted for the acting player only");
  assert.equal(ow.target.id, "userB"); assert.equal(ow.target.status, "peer");
  assertFullContext(ow, 2, "opener_warm");
  log(`[4] F2 SOCIAL_CUE opener_warm → actor=${ow.actor_id} counterpart=${ow.target.id}(${ow.target.status}) stage=${ow.context.stage}`);

  // ── (4b) P3 PER-ACTOR CHAT ROWS (event-schema Rule 3): one live chat turn from A produces TWO
  //    rows — A's dialogue_turn (with the implicit C1 latency / B3 edits riding raw_signals) AND
  //    B's receives_turn from B's OWN vantage. Then closing with B never having spoken emits B's
  //    K1 refusal twin (declines_to_engage) — non-action is first-class data (Law 2). ──
  await waitFor(() => !!iidA, 3000, "interaction id captured");
  roomA.send("chat", { interactionId: iidA, text: "hello across the water", latencyMs: 1500, editsCount: 2 });
  await waitFor(() => evsBy("dialogue_turn").length >= 1 && evsBy("receives_turn").length >= 1, 4000, "per-actor chat rows (both vantages)");
  const dturn = evsBy("dialogue_turn").find((e) => e.actor_id === "userA")!;
  const rturn = evsBy("receives_turn").find((e) => e.actor_id === "userB")!;
  assert.ok(dturn, "sender's dialogue_turn row (their vantage)");
  assert.ok(rturn, "recipient's receives_turn row (their vantage)");
  assert.equal(dturn.target.id, "userB"); assert.equal(rturn.target.id, "userA");
  assertFullContext(dturn, 2, "dialogue_turn"); assertFullContext(rturn, 2, "receives_turn");
  assert.equal(dturn.context.counterpart_status, "peer"); assert.equal(rturn.context.counterpart_status, "peer");
  roomA.send("interact_end", { interactionId: iidA });
  await waitFor(() => evsBy("declines_to_engage").length >= 1, 4000, "K1 refusal twin for the silent side");
  const k1 = evsBy("declines_to_engage").find((e) => e.actor_id === "userB")!;
  assert.ok(k1, "declines_to_engage emitted for the participant who never answered");
  assert.equal(k1.target.id, "userA");
  assertFullContext(k1, 2, "declines_to_engage");
  log(`[4b] P3 chat turn → dialogue_turn(userA→userB) + receives_turn(userB←userA), both full-context; close with B silent → K1 declines_to_engage(userB) — Rule 3 holds`);

  // ── (5) TRAVEL STAND — the co-presence amplifier: reach a FAR, non-adjacent island ───────────
  const FAR = 60; // a fixed distant landmark (A is on slot 0, B on slot 1 — both near the centre)
  const sx = WORLD.MAP_WIDTH / OCEAN.EXTENT, sy = WORLD.MAP_HEIGHT / OCEAN.EXTENT;
  const farTile = clampToMap(islandSlot(FAR).x * sx, islandSlot(FAR).y * sy);
  const aBefore = { x: A().x, y: A().y };
  roomA.send("travel", { destinationSlot: FAR, prepared: true });
  await waitFor(() => tileDistance(A().x, A().y, farTile.x, farTile.y) < 0.6, 5000, "A arrives at the far island");
  await waitFor(() => evsBy("travel_far").length >= 1, 4000, "travel_far cue emitted");
  const tv = evsBy("travel_far").find((e) => e.actor_id === "userA")!;
  assert.ok(tv, "travel_far emitted for the traveller");
  assert.equal(tv.target.id, `island_${FAR}`);
  assertFullContext(tv, 2, "travel_far");
  // P4: the empty-vs-peopled probe + the life-scale crossing read ride the travel event.
  assert.ok(typeof tv.raw_signals?.dest_occupants === "number", "dest_occupants stamped authoritatively (empty-vs-peopled probe, VIII.2)");
  assert.ok((tv.raw_signals?.crossing_latency_ms ?? -1) >= 0, "first-ever sail carries crossing_latency_ms (VIII.11)");
  log(`[P4 travel raw] dest_occupants=${tv.raw_signals?.dest_occupants} crossing_latency_ms=${tv.raw_signals?.crossing_latency_ms}`);
  assert.ok(evsBy("prepare_before_travel").length >= 1, "prepare_before_travel emitted (kit readied)");
  const hopHome = tileDistance(aBefore.x, aBefore.y, A().x, A().y);
  assert.ok(hopHome > 8, `A travelled a long way from its home region (${hopHome.toFixed(1)} tiles)`);
  log(`\n[5] travel stand → A sailed to a non-adjacent island (slot ${FAR}): (${aBefore.x.toFixed(1)},${aBefore.y.toFixed(1)}) → (${A().x.toFixed(1)},${A().y.toFixed(1)}), hop ${hopHome.toFixed(1)} tiles; cue travel_far stage ${tv.context.stage}`);

  // ── (6) F3 CLEARING (on the commons island, slot 60, where A just arrived): be courteous to the
  //    low-status server NPC → counterpart:low (the courtesy-gradient anchor) ──
  const server = () => ent(roomA, "stn_server");
  await waitFor(() => !!server(), 4000, "clearing server NPC present on the commons");
  await steerA(() => server().x, () => server().y, 1.4, "the stall server");
  roomA.send("social_cue", { targetId: "stn_server", action: "courtesy_warm_server", latencyMs: 900 });
  await waitFor(() => evsBy("courtesy_warm_server").length >= 1, 4000, "courtesy_warm_server emitted");
  const cs = evsBy("courtesy_warm_server").find((e) => e.actor_id === "userA")!;
  assert.ok(cs, "courtesy_warm_server emitted");
  assert.equal(cs.target.id, "stn_server");
  assert.equal(cs.context.counterpart_status, "low", "server is low-status → counterpart:low (the gradient anchor)");
  assertFullContext(cs, 3, "courtesy_warm_server");
  log(`[6] F3 station courtesy_warm_server → actor=${cs.actor_id} counterpart=${cs.target.id}(${cs.context.counterpart_status}) stage=${cs.context.stage}`);

  // B follows to the SAME far island, sees A, then WALKS across the commons (same island → all land,
  // no sailing needed) to stand with A at the stall. An ACTIVE rendezvous: B closes the gap itself, so
  // the proof doesn't depend on where A incidentally parked relative to the slot centre (the old
  // `< 2` co-location gate was fragile — A rests at the stall ~3 tiles off the centre where B lands).
  roomB.send("travel", { destinationSlot: FAR });
  await waitFor(() => tileDistance(B().x, B().y, farTile.x, farTile.y) < 0.6, 5000, "B arrives at the same far island");
  await waitFor(() => !!ent(roomB, roomA.sessionId) && !!ent(roomA, roomB.sessionId), 5000, "A and B mutually visible at the far island");
  for (let i = 0; i < 140 && tileDistance(B().x, B().y, A().x, A().y) > 1.4; i++) {
    const dx = A().x - B().x, dy = A().y - B().y;
    roomB.send("move_intent", {
      dir: { x: Math.abs(dx) > 0.4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 0.4 ? Math.sign(dy) : 0 },
      facing: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
      seq: 3000 + i,
    });
    await sleep(60);
  }
  roomB.send("stop", { seq: 3999 });
  await sleep(150);
  const reunion = tileDistance(A().x, A().y, B().x, B().y);
  assert.ok(reunion < 2, `two players rendezvous at the far island (B walked to A; gap ${reunion.toFixed(2)})`);
  log(`    both travelled to slot ${FAR}; B walked across the commons to A → standing together (gap ${reunion.toFixed(2)} tiles) — co-presence amplified beyond the home cluster`);

  // ── teardown ─────────────────────────────────────────────────────────────────────────────────
  await roomA.leave(true);
  await roomB.leave(true);
  await gameServer.gracefullyShutdown(false);
  httpServer.close();
  mlStub.close();

  log("\n" + "-".repeat(96));
  log("RESULT: PASS ✅  — co-presence + per-actor first contact/proxemics + F2 social cues + F3");
  log("        clearing stations + the travel stand (far-island co-presence amplifier) all emit");
  log("        server-authoritative per-actor events with mandatory context.");
  log("=".repeat(96));
  console.log(out.join("\n"));
  process.exit(0);
}

main().catch((err) => {
  console.log(out.join("\n"));
  console.error("\nRESULT: FAIL ❌\n", err);
  process.exit(1);
});
