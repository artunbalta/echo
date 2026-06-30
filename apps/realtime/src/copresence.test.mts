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
import { WORLD, tileDistance, islandSlot, OCEAN, clampToMap, type EventContext } from "@echo/shared";

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
}
const captured: CapturedEvent[] = [];
const evsBy = (action: string) => captured.filter((e) => e.action === action);

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
  roomA.onMessage("interact_opened", () => {});
  roomB.onMessage("interact_opened", () => {});
  roomA.onMessage("error", () => {});

  const ent = (room: any, id: string) => room.state?.entities?.get?.(id);
  const A = () => ent(roomA, roomA.sessionId);
  const B = () => ent(roomB, roomB.sessionId);

  log("=".repeat(96));
  log("ECHO Steps 3+4 — co-presence + F2 dialogue + F3 clearing (two real clients, one WorldRoom)");
  log("=".repeat(96));

  // steer A toward a target tile until within `within` tiles (poll the authoritative state)
  async function steerA(tx: () => number, ty: () => number, within: number, label: string) {
    for (let i = 0; i < 200 && tileDistance(A().x, A().y, tx(), ty()) > within; i++) {
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
  assert.ok(gap0 < 8, "Step-1 neighbours spawn adjacent");
  const ax0 = A().x;
  roomA.send("move_intent", { dir: { x: 1, y: 0 }, facing: "right", seq: 1 });
  await waitFor(() => A().x > ax0 + 0.5 && Math.abs(ent(roomB, roomA.sessionId).x - A().x) < 0.05, 5000, "B sees A move");
  roomA.send("stop", { seq: 2 });
  await waitFor(() => A().lastSeq === 2, 3000, "server acks A's stop seq");
  assert.equal(A().lastSeq, 2, "server acked A's last input seq");
  log(`      A moved → B mirrors A.x=${ent(roomB, roomA.sessionId).x.toFixed(2)} (|Δ|<0.05); lastSeq=${A().lastSeq}`);

  // ── (3) first contact: per-actor first_contact + proxemics ───────────────────────────────────
  await steerA(() => B().x, () => B().y, 1.3, "interaction range of B");
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

  // ── (5) F3 CLEARING: walk to the low-status server NPC and be courteous ──────────────────────
  const server = () => ent(roomA, "stn_server");
  await waitFor(() => !!server(), 4000, "clearing server NPC present in shared room");
  await steerA(() => server().x, () => server().y, 1.4, "the stall server");
  roomA.send("social_cue", { targetId: "stn_server", action: "courtesy_warm_server", latencyMs: 900 });
  await waitFor(() => evsBy("courtesy_warm_server").length >= 1, 4000, "courtesy_warm_server emitted");
  const cs = evsBy("courtesy_warm_server").find((e) => e.actor_id === "userA")!;
  assert.ok(cs, "courtesy_warm_server emitted");
  assert.equal(cs.target.id, "stn_server");
  assert.equal(cs.context.counterpart_status, "low", "server is low-status → counterpart:low (the gradient anchor)");
  assertFullContext(cs, 3, "courtesy_warm_server");
  log(`[5] F3 station courtesy_warm_server → actor=${cs.actor_id} counterpart=${cs.target.id}(${cs.context.counterpart_status}) stage=${cs.context.stage}`);

  // ── (6) TRAVEL STAND — the co-presence amplifier: reach a FAR, non-adjacent island ───────────
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
  assert.ok(evsBy("prepare_before_travel").length >= 1, "prepare_before_travel emitted (kit readied)");
  const hopHome = tileDistance(aBefore.x, aBefore.y, A().x, A().y);
  assert.ok(hopHome > 8, `A travelled a long way from its home region (${hopHome.toFixed(1)} tiles)`);
  log(`\n[6] travel stand → A sailed to a non-adjacent island (slot ${FAR}): (${aBefore.x.toFixed(1)},${aBefore.y.toFixed(1)}) → (${A().x.toFixed(1)},${A().y.toFixed(1)}), hop ${hopHome.toFixed(1)} tiles; cue travel_far stage ${tv.context.stage}`);

  // B follows to the SAME far island → the two reach the same distant shore and see each other.
  roomB.send("travel", { destinationSlot: FAR });
  await waitFor(() => tileDistance(B().x, B().y, farTile.x, farTile.y) < 0.6, 5000, "B arrives at the same far island");
  await waitFor(() => {
    const aSeenByB = ent(roomB, roomA.sessionId), bSeenByA = ent(roomA, roomB.sessionId);
    return aSeenByB && bSeenByA && tileDistance(aSeenByB.x, aSeenByB.y, B().x, B().y) < 2;
  }, 5000, "A and B co-located at the far island");
  const reunion = tileDistance(A().x, A().y, B().x, B().y);
  assert.ok(reunion < 2, `two players rendezvous at the far island (gap ${reunion.toFixed(2)})`);
  log(`    two players both travelled to slot ${FAR} → co-located at the far shore (gap ${reunion.toFixed(2)} tiles) — co-presence amplified beyond the home cluster`);

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
