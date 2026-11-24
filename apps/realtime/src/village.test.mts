/**
 * Village rooms (DECISIONS C101, C107), headless: the real Colyseus server with the real VillageRoom on an
 * ephemeral port, and real `colyseus.js` clients from Node, each signed in with a real identity token.
 *
 *   1. ONE CODE, ONE ROOM — two people with the same code are in the same copy and see each other's
 *      body; a third with another code is in another copy and sees neither.
 *   2. NO SUBJECT ON THE WIRE — what the room syncs about a person never contains their subject, and no
 *      name (C107): a page names a body from its look.
 *   3. A BODY MOVES AS A BODY CAN — a pose is taken, a teleport is pulled back to a walk, nonsense is
 *      dropped.
 *   4. EARSHOT — a line reaches the one standing near and not the one across the village.
 *   4b. A LINE TO ONE BODY (C107) — reaches that body's person alone, within earshot, and nobody else; not
 *      the speaker, not a bystander, not someone out of earshot.
 *   5. THE DOOR — a cell that is not the reference village, a bad code or a forged token is refused.
 *   6. LEAVING — a body that leaves on purpose is gone from the others' state.
 *
 * Run:  npm run test:village -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
 */
import "./env.js";
import { createServer, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { ROOM, ROOM_VILLAGES, VILLAGE_C2S, VILLAGE_ROOM, VILLAGE_S2C, type SaidMsg } from "@echo/shared";
import { identitySecretsFor, signIdentity } from "@echo/shared/identity";

import { VillageRoom } from "./VillageRoom.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function waitFor(pred: () => boolean, label: string, timeoutMs = 6000): Promise<void> {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    (function loop() {
      if (pred()) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error(`timeout waiting for ${label}`));
      setTimeout(loop, 20);
    })();
  });
}

const CELL = ROOM_VILLAGES[0]!;
const secret = identitySecretsFor({
  secret: process.env.ECHO_IDENTITY_SECRET,
  previous: process.env.ECHO_IDENTITY_SECRET_OLD,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
})[0]!;
const signed = (subject: string) => ({ userId: subject, token: signIdentity(subject, secret, Math.floor(Date.now() / 1000)) });

type Seen = { x: number; y: number; here: boolean; lookSeed: string; sex: string; age: number; trade: string; speed: number; activity: string };
function bodies(room: Room): Map<string, Seen> {
  const out = new Map<string, Seen>();
  (room.state as any).walkers?.forEach((w: any, id: string) => out.set(id, { ...w.toJSON() }));
  return out;
}

async function main() {
  const http: HttpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: http }) });
  gameServer.define(VILLAGE_ROOM, VillageRoom).filterBy(["cell", "code"]);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const port = (http.address() as { port: number }).port;
  const url = `ws://127.0.0.1:${port}`;
  const join = (code: string, subject: string, cell = CELL) => new Client(url).joinOrCreate(VILLAGE_ROOM, { cell, code, ...signed(subject) });

  try {
    // ── 1. one code, one room ──
    const a = await join("ABCDE", "subject-artun");
    const b = await join("ABCDE", "subject-deniz");
    const c = await join("XYZ23", "subject-ece");
    assert.equal(a.roomId, b.roomId, "the same code is the same room");
    await assert.rejects(join("abcde", "subject-deniz"), Error, "a code not written as the page writes it makes no second copy");
    assert.notEqual(a.roomId, c.roomId, "another code is another copy");

    a.send(VILLAGE_C2S.POSE, { x: 10, y: 5, yaw: 1, speed: 1.6, activity: "walk" });
    b.send(VILLAGE_C2S.POSE, { x: 13, y: 5, yaw: -1, speed: 0, activity: "stand" });
    c.send(VILLAGE_C2S.POSE, { x: 10, y: 5, yaw: 0, speed: 0, activity: "stand" });
    await waitFor(() => bodies(b).get(a.sessionId)?.here === true && bodies(a).get(b.sessionId)?.here === true, "A and B see each other");
    const aSeenByB = bodies(b).get(a.sessionId)!;
    assert.ok(!("name" in aSeenByB), "no name on the wire (C107)");
    assert.equal(aSeenByB.x, 10);
    assert.equal(aSeenByB.activity, "walk");
    assert.ok(Math.abs(aSeenByB.speed - 1.6) < 1e-5, "speed, to float32");
    assert.ok(aSeenByB.lookSeed && aSeenByB.trade && (aSeenByB.sex === "f" || aSeenByB.sex === "m"), "a body comes with a look");
    await sleep(150);
    assert.equal(bodies(c).size, 1, "the other copy holds only its own person");
    assert.ok(!bodies(a).has(c.sessionId) && !bodies(b).has(c.sessionId), "nobody in ABCDE sees the one in XYZ23");
    console.log("✓ one code, one room; another code, another copy");

    // ── 2. no subject on the wire ──
    const wire = JSON.stringify((b.state as any).toJSON());
    for (const s of ["subject-artun", "subject-deniz"]) assert.ok(!wire.includes(s), `${s} is not in the synced state`);
    console.log("✓ no subject in the synced state");

    // ── 3. a body moves as a body can ──
    await sleep(120);
    a.send(VILLAGE_C2S.POSE, { x: 1010, y: 5, yaw: 1, speed: 1.6, activity: "walk" });
    await waitFor(() => (bodies(b).get(a.sessionId)?.x ?? 10) !== 10, "A's next pose");
    const jumped = bodies(b).get(a.sessionId)!.x;
    assert.ok(jumped > 10 && jumped < 10 + ROOM.maxSpeedMps * 2, `a teleport of 1000 m is pulled back to a walk (got to x=${jumped.toFixed(2)})`);
    await sleep(120);
    a.send(VILLAGE_C2S.POSE, { x: Number.NaN, y: 0, yaw: 0, speed: 0, activity: "walk" });
    a.send(VILLAGE_C2S.POSE, { x: 0, y: 0, yaw: 0, speed: 0, activity: "teleport" });
    await sleep(200);
    assert.equal(bodies(b).get(a.sessionId)!.x, jumped, "nonsense poses are dropped");
    console.log("✓ a walk is taken, a teleport pulled back, nonsense dropped");

    // ── 4. earshot ──
    // Bring A back beside B, step by step, as a body would walk.
    for (let i = 0; i < 400 && Math.abs((bodies(b).get(a.sessionId)?.x ?? 0) - 11) > 0.01; i++) {
      a.send(VILLAGE_C2S.POSE, { x: 11, y: 5, yaw: 1, speed: 1.6, activity: "walk" });
      await sleep(110);
    }
    assert.ok(Math.abs(bodies(b).get(a.sessionId)!.x - 11) < 0.01, "A walked back beside B");
    const d = await join("ABCDE", "subject-far");
    d.send(VILLAGE_C2S.POSE, { x: 11 + ROOM.hearM + 30, y: 5, yaw: 0, speed: 0, activity: "stand" });
    await waitFor(() => bodies(a).get(d.sessionId)?.here === true, "the far one is in the village");
    const heardB: SaidMsg[] = [], heardD: SaidMsg[] = [], heardA: SaidMsg[] = [];
    b.onMessage(VILLAGE_S2C.SAID, (m: SaidMsg) => heardB.push(m));
    d.onMessage(VILLAGE_S2C.SAID, (m: SaidMsg) => heardD.push(m));
    a.onMessage(VILLAGE_S2C.SAID, (m: SaidMsg) => heardA.push(m));
    a.send(VILLAGE_C2S.SAY, { text: "  good   morning\n" });
    await waitFor(() => heardB.length === 1, "B hears A");
    await sleep(200);
    assert.deepEqual(heardB[0], { from: a.sessionId, text: "good morning" });
    assert.equal(heardD.length, 0, "the far one does not hear it");
    assert.equal(heardA.length, 0, "the speaker is not sent their own line");
    a.send(VILLAGE_C2S.SAY, { text: "again, too soon" });
    await sleep(200);
    assert.equal(heardB.length, 1, "a second line inside the limit is dropped");
    console.log("✓ a line reaches earshot only, once per limit");

    // ── 4b. a line to one body (C107) ──
    const toldB: SaidMsg[] = [], toldD: SaidMsg[] = [], toldA: SaidMsg[] = [];
    b.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => toldB.push(m));
    d.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => toldD.push(m));
    a.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => toldA.push(m));
    await sleep(ROOM.sayEveryMs + 50);
    a.send(VILLAGE_C2S.TALK, { to: b.sessionId, text: " are you  from here?\n" });
    await waitFor(() => toldB.length === 1, "B is told");
    await sleep(200);
    assert.deepEqual({ from: toldB[0]!.from, text: toldB[0]!.text }, { from: a.sessionId, text: "are you from here?" });
    assert.equal(typeof toldB[0]!.voice?.token, "string", "with the room's token for its voice (C110)");
    assert.equal(heardB.length, 1, "it is not said to the street: B's earshot heard nothing new");
    assert.equal(toldD.length + toldA.length + heardD.length + heardA.length, 0, "nobody else is told, the speaker included");
    await sleep(ROOM.sayEveryMs + 50);
    a.send(VILLAGE_C2S.TALK, { to: d.sessionId, text: "can you hear me from there?" });
    a.send(VILLAGE_C2S.TALK, { to: a.sessionId, text: "to myself" });
    a.send(VILLAGE_C2S.TALK, { to: "nobody-here", text: "anyone?" });
    a.send(VILLAGE_C2S.TALK, { to: b.sessionId, text: "   " });
    await sleep(300);
    assert.equal(toldD.length + toldA.length, 0, "out of earshot, to oneself, to no one: nothing");
    assert.equal(toldB.length, 1, "an empty line is no line");
    b.send(VILLAGE_C2S.TALK, { to: a.sessionId, text: "born here" });
    await waitFor(() => toldA.length === 1, "and A is told the answer");
    assert.deepEqual({ from: toldA[0]!.from, text: toldA[0]!.text }, { from: b.sessionId, text: "born here" });
    console.log("✓ a line to one body reaches its person alone, within earshot");

    // ── 5. the door ──
    const refused = async (label: string, p: Promise<unknown>) => {
      await assert.rejects(p, Error, label);
    };
    await refused("a cell that is not the reference village", join("QWERT", "subject-x", "8400000ffffffff"));
    await refused("a bad code", join("ABC0E", "subject-x"));
    await refused("a forged token", new Client(url).joinOrCreate(VILLAGE_ROOM, { cell: CELL, code: "ABCDE", userId: "subject-artun", token: signIdentity("subject-artun", "not-the-secret", 1) }));
    console.log("✓ the door refuses another cell, a bad code, a forged token");

    // ── 6. leaving ──
    await b.leave(true);
    await waitFor(() => !bodies(a).has(b.sessionId), "B is gone from A's state");
    console.log("✓ a body that leaves is gone");

    await Promise.all([a.leave(true), c.leave(true), d.leave(true)]);
  } finally {
    await gameServer.gracefullyShutdown(false).catch(() => {});
    http.close();
  }
  console.log("village rooms: all good");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
