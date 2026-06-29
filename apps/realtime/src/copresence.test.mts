/**
 * Cross-device co-presence — headless integration test (Step 3 evidence).
 *
 * Headless WebGL is unreliable, so we prove the REAL realtime spine server-side instead of faking a
 * canvas: boot the actual Colyseus Server (the same WorldRoom + WebSocketTransport as production) on
 * an ephemeral port and connect TWO real `colyseus.js` clients from Node (the same client library
 * the browser uses). Then assert:
 *
 *   1. CO-PRESENCE + STATE SYNC — both sessions join the SAME room; each sees the OTHER's entity;
 *      when A moves, B sees A's position update (mirrored byte-for-byte), and the server acks A's
 *      last input seq.
 *   2. SLOT SPAWN — A (slot 0) and B (slot 1) spawn at their archipelago coordinates, adjacent
 *      (Step-1 clustering → a reachable neighbour in the shared ocean).
 *   3. PER-ACTOR MEASUREMENT — when the two LIVE players open an interaction, the authoritative
 *      server emits exactly TWO BehavioralEvents to /observe/behavioral — one per actor, each from
 *      that actor's own vantage (counterpart = the other, status peer), with the FULL mandatory
 *      context envelope (so the ingress accepts it, not 422). Never co-mingled.
 *
 * Run (decorators need apps/realtime/tsconfig → cwd MUST be apps/realtime, file MUST live here):
 *   npm run test:copresence  -w @echo/realtime
 *   (or)  cd apps/realtime && node ../../node_modules/.bin/tsx src/copresence.test.mts
 *
 * Zero keys: in-memory rooms, no Supabase/ML required (a local stub ML captures the per-actor POSTs).
 */
import { createServer, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { WORLD, tileDistance, type EventContext } from "@echo/shared";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function waitFor(pred: () => boolean, timeoutMs = 6000, label = "condition"): Promise<void> {
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

interface Captured { event: { actor_id: string; action: string; channel: string; target: { id: string; status: string }; context: EventContext } }

async function main() {
  const captured: Captured[] = [];

  // 1) Stub ML capture server — stands in for /observe/behavioral so we can assert the per-actor
  //    emission WITHOUT a live ML service. Started first so we can point the realtime server at it.
  const mlStub: HttpServer = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/observe/behavioral") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try { captured.push(JSON.parse(body)); } catch { /* ignore */ }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, delta_mu: 0.1, polarity: "take" }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => mlStub.listen(0, "127.0.0.1", () => r()));
  const mlPort = (mlStub.address() as { port: number }).port;
  // persistence.ts reads ML_SERVICE_URL at module load → set BEFORE importing WorldRoom.
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${mlPort}`;
  process.env.ML_SERVICE_TOKEN = "dev-ml-token-change-me";

  // 2) Boot the REAL realtime server (mirrors apps/realtime/src/index.ts).
  const { WorldRoom } = await import("./WorldRoom.js");
  const httpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("world", WorldRoom);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
  const port = (httpServer.address() as { port: number }).port;
  const url = `ws://127.0.0.1:${port}`;

  // 3) Two real clients on ADJACENT archipelago slots (Step-1 cluster: slot 0 & slot 1).
  const clientA = new Client(url);
  const clientB = new Client(url);
  const roomA = await clientA.joinOrCreate("world", { userId: "userA", name: "Alice", slotIndex: 0 });
  const roomB = await clientB.joinOrCreate("world", { userId: "userB", name: "Bob", slotIndex: 1 });
  roomA.onMessage("welcome", () => {});
  roomB.onMessage("welcome", () => {});

  // Optional-chain the state reads: room.state.entities is empty/undefined until the first schema
  // patch lands (just after joinOrCreate), so the waitFor predicates must poll safely, not throw.
  const A = () => (roomA.state as any)?.entities?.get?.(roomA.sessionId);
  const B = () => (roomB.state as any)?.entities?.get?.(roomB.sessionId);
  const aSeenByB = () => (roomB.state as any)?.entities?.get?.(roomA.sessionId);
  const bSeenByA = () => (roomA.state as any)?.entities?.get?.(roomB.sessionId);

  const out: string[] = [];
  const log = (s: string) => { out.push(s); };
  log("=".repeat(92));
  log('ECHO Step 3 — cross-device co-presence (two REAL colyseus.js clients, one shared WorldRoom)');
  log("=".repeat(92));

  // ── (1) both join the SAME room and SEE each other ──────────────────────────────────────────
  await waitFor(() => !!A() && !!B() && !!aSeenByB() && !!bSeenByA(), 6000, "mutual visibility");
  assert.equal(roomA.name, "world");
  assert.equal(roomB.name, "world");
  assert.notEqual(roomA.sessionId, roomB.sessionId);
  log(`\n[1] both joined room "world"  ·  A=${roomA.sessionId}  B=${roomB.sessionId}`);
  log(`    A sees ${(roomA.state as any).entities.size} entities incl. B(${roomB.sessionId}); B sees A(${roomA.sessionId})`);

  // ── (2) slot spawn → adjacent neighbours ────────────────────────────────────────────────────
  const a0 = { x: A().x, y: A().y };
  const b0 = { x: B().x, y: B().y };
  const gap0 = tileDistance(a0.x, a0.y, b0.x, b0.y);
  log(`\n[2] slot spawn  ·  A(slot0)=(${a0.x.toFixed(1)},${a0.y.toFixed(1)})  B(slot1)=(${b0.x.toFixed(1)},${b0.y.toFixed(1)})  gap=${gap0.toFixed(2)} tiles`);
  assert.ok(gap0 < 8, "Step-1-clustered neighbours spawn adjacent (within sight), not scattered");

  // ── (1b) A moves → B sees A move (real state sync over the wire) ─────────────────────────────
  const ax0 = A().x;
  roomA.send("move_intent", { dir: { x: 1, y: 0 }, facing: "right", seq: 1 });
  await waitFor(() => A().x > ax0 + 0.5, 4000, "A integrates movement");
  await waitFor(() => Math.abs(aSeenByB().x - A().x) < 0.05, 4000, "B sees A's updated x");
  roomA.send("stop", { seq: 2 });
  await sleep(120);
  const aInA = A(), aInB = aSeenByB();
  assert.ok(aInA.x > ax0, "A moved on its own authoritative state");
  assert.ok(Math.abs(aInB.x - aInA.x) < 0.05, "B sees A at the same x — co-presence over the wire");
  assert.equal(aInA.lastSeq, 2, "server acked A's last input seq (reconciliation)");
  log(`\n[1b] A moved right: x ${ax0.toFixed(2)} → ${aInA.x.toFixed(2)} (own state)`);
  log(`     B's view of A: x=${aInB.x.toFixed(2)}  (mirrored, |Δ|<0.05)  ·  server lastSeq=${aInA.lastSeq}`);

  // ── (3) per-actor measurement: steer A to B, open the interaction, assert TWO events ─────────
  for (let i = 0; i < 120 && tileDistance(A().x, A().y, B().x, B().y) > 1.2; i++) {
    const dx = B().x - A().x, dy = B().y - A().y;
    roomA.send("move_intent", {
      dir: { x: Math.abs(dx) > 0.4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 0.4 ? Math.sign(dy) : 0 },
      facing: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
      seq: 3 + i,
    });
    await sleep(70);
  }
  roomA.send("stop", { seq: 999 });
  const contactGap = tileDistance(A().x, A().y, B().x, B().y);
  assert.ok(contactGap <= WORLD.INTERACTION_RADIUS + 0.5, `A reached interaction range of B (gap ${contactGap.toFixed(2)})`);

  // A opens the interaction with B (entity ids are Colyseus sessionIds)
  roomA.send("interact_start", { targetId: roomB.sessionId });
  await waitFor(() => captured.length >= 2, 5000, "two per-actor BehavioralEvents emitted");
  await sleep(100); // let any stragglers land (there must be exactly two)

  log(`\n[3] A opened an interaction with B at gap ${contactGap.toFixed(2)} tiles → server emitted ${captured.length} per-actor events:`);
  const byActor = new Map(captured.map((c) => [c.event.actor_id, c.event]));
  for (const c of captured) {
    const e = c.event;
    log(`     actor=${e.actor_id}  action=${e.action}  ch=${e.channel}  counterpart=${e.target.id}(${e.target.status})  ` +
        `audience=${e.context.audience_size}  public=${e.context.public_or_private}  stage=${e.context.stage}`);
  }

  assert.equal(captured.length, 2, "exactly two events — one per participant");
  assert.ok(byActor.has("userA") && byActor.has("userB"), "one event per actor, keyed by each real userId");
  const eA = byActor.get("userA")!, eB = byActor.get("userB")!;
  // each from its OWN vantage: counterpart is the OTHER player, status peer
  assert.equal(eA.target.id, "userB"); assert.equal(eA.target.status, "peer");
  assert.equal(eB.target.id, "userA"); assert.equal(eB.target.status, "peer");
  assert.equal(eA.action, "first_contact"); assert.equal(eA.channel, "G");
  // mandatory context fully populated on BOTH (the ingress would 422 otherwise)
  for (const e of [eA, eB]) {
    for (const k of REQUIRED_CONTEXT) {
      assert.ok((e.context as any)[k] !== undefined && (e.context as any)[k] !== null, `context.${k} present`);
    }
    assert.equal(e.context.stage, 2, "F2 stage");
    assert.equal(e.context.public_or_private, "public", "the crossing is public");
  }
  assert.notEqual(eA.actor_id, eB.actor_id, "the two reads are siloed by distinct actor_id");

  log(`\n    ✓ two independent per-actor events, distinct actor_ids, peer counterpart, full mandatory context`);

  // ── teardown ────────────────────────────────────────────────────────────────────────────────
  await roomA.leave(true);
  await roomB.leave(true);
  await gameServer.gracefullyShutdown(false);
  httpServer.close();
  mlStub.close();

  log("\n" + "-".repeat(92));
  log("RESULT: PASS ✅  — two devices share one room, see each other move, and each interaction");
  log("        produces two siloed per-actor BehavioralEvents with mandatory context.");
  log("=".repeat(92));
  console.log(out.join("\n"));
  process.exit(0);
}

main().catch((err) => {
  console.error("\nRESULT: FAIL ❌\n", err);
  process.exit(1);
});
