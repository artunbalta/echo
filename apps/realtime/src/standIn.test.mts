/**
 * Your echo keeping your body while you are away (DECISIONS C104).
 *
 * THE WALK AND THE MOMENTS, as pure functions with the clock in hand (`echoBody.ts`):
 *   1. A WAY IS KEPT AS IT IS WALKED — a crumb every stride and a half, a stop as a pause, a jump or the
 *      water as no way at all, the person's pace.
 *   2. IT WALKS ONLY WHERE ITS PERSON WALKED — every pose of the kept body lies on the person's own way,
 *      at their pace, and it stands where they stood, as long.
 *   3. IT DOES ONLY WHAT IT MAY — where its brief says it may act, it stops and does its call; where it
 *      may not, it walks on, and what it would have done is kept; it meets only moments that come to
 *      someone on their way.
 *
 * THE ROOM, headless: the real Colyseus server, real clients, real signed briefs.
 *   4. A BODY STAYS, AND NOBODY CAN TELL — a person who let their echo stand in leaves, and the others see
 *      the same body, under the same handle, walking on; nothing synced says who moves it.
 *   5. COMING BACK — the person gets the same body back where it stands, and what the echo did; a pose
 *      from where the page came in does not pull the body away first.
 *   6. NO BRIEF, NO BODY — without a brief, with one signed for someone else or with another key, or after
 *      a no, the body goes as it always did.
 *   7. A ROOM WITH ONLY AN ECHO IN IT stays until the keeping is over, and then goes.
 *
 * Run:  npm run test:standin -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
 */
import "./env.js";
import { createServer, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { MOMENTS, MOMENT_KINDS, WORLD_EPOCH, verbsOf, type MomentKind } from "@echo/planet";
import { ROOM_VILLAGES, STAND_IN, VILLAGE_C2S, VILLAGE_ROOM, VILLAGE_S2C, type StandInBrief, type StandInLevel, type YouMsg } from "@echo/shared";
import { identitySecretsFor, signIdentity } from "@echo/shared/identity";
import { signBrief } from "@echo/shared/standin";

import { ON, Trail, keepBody, meetable, stepEcho, type BodyPose, type EchoBody } from "./echoBody.js";
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
/** A small seeded generator, so a run is the same run every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}

// ── the walk and the moments ─────────────────────────────────────────────────────

/** The way a person walks in these tests: east 30 m, five seconds still, then north 15 m. */
function walkedTrail(): Trail {
  const t = new Trail();
  const at = (x: number, y: number, speed: number, activity: BodyPose["activity"] = speed > 0 ? "walk" : "stand") => t.take({ x, y, yaw: 0, speed, activity }, 100);
  for (let x = 0; x <= 30; x += 0.16) at(x, 0, 1.6);
  for (let k = 0; k < 50; k++) at(30, 0, 0);
  for (let y = 0.16; y <= 15; y += 0.16) at(30, y, 1.6);
  return t;
}

/** The shortest way from a point to the polyline through the crumbs. */
function offWay(body: EchoBody, p: { x: number; y: number }): number {
  let best = Infinity;
  for (let i = 1; i < body.trail.length; i++) {
    const a = body.trail[i - 1]!, b = body.trail[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)));
  }
  return best;
}

/** A brief where every kind is called its first verb, at the level given. */
function briefAt(may: StandInLevel, sub = "subject-unit"): StandInBrief {
  const calls: StandInBrief["calls"] = {};
  for (const k of MOMENT_KINDS) calls[k] = { call: verbsOf(k)[0]?.id ?? ON, p: 0.8, may };
  return { sub, exp: Date.now() + 3_600_000, calls };
}

/** Run a kept body for `seconds` at ten steps a second from a world noon; every pose it took. */
function run(body: EchoBody, from: BodyPose, start: number, seconds: number): BodyPose[] {
  const rand = seeded(7);
  const out: BodyPose[] = [];
  let pose = from;
  for (let k = 1; k <= seconds * 10; k++) {
    pose = stepEcho(body, pose, start + k * 100, 100, rand);
    out.push(pose);
  }
  return out;
}

function unitTests() {
  // ── 1. a way is kept as it is walked ──
  const t = walkedTrail();
  assert.ok(t.crumbs.length >= 28 && t.crumbs.length <= 32, `45 m walked is about thirty crumbs (got ${t.crumbs.length})`);
  for (let i = 1; i < t.crumbs.length; i++) assert.ok(Math.hypot(t.crumbs[i]!.x - t.crumbs[i - 1]!.x, t.crumbs[i]!.y - t.crumbs[i - 1]!.y) >= STAND_IN.crumbM - 1e-9, "a crumb a stride and a half from the last");
  const corner = t.crumbs.find((c) => c.pauseS > 0)!;
  assert.ok(Math.hypot(corner.x - 30, corner.y) < STAND_IN.crumbM && Math.abs(corner.pauseS - 5) < 0.2, `five seconds still at the corner is a five-second pause there (${corner.pauseS.toFixed(2)} s)`);
  assert.ok(Math.abs(t.pace - 1.6) < 0.05, `the pace walked (${t.pace.toFixed(2)})`);
  const n = t.crumbs.length;
  t.take({ x: 31, y: 15, yaw: 0, speed: 1, activity: "row" }, 100);
  assert.equal(t.crumbs.length, n, "the water is no way to walk");
  t.take({ x: 200, y: 200, yaw: 0, speed: 1, activity: "walk" }, 100);
  assert.equal(t.crumbs.length, 1, "a jump starts the way again: a straight line across the village is not one walked");
  console.log("✓ a way is kept as it is walked: crumbs, a pause, the pace; the water and a jump are no way");

  // ── 2. it walks only where its person walked ──
  const noon = Date.parse(WORLD_EPOCH) + (1000 + 0.45) * 720_000;
  const trail = walkedTrail();
  const end = trail.crumbs.at(-1)!;
  const quiet: StandInBrief = { sub: "subject-unit", exp: noon + 3_600_000, calls: {} };
  const body = keepBody(end, trail, quiet, "echo|unit", noon);
  const poses = run(body, { x: end.x, y: end.y, yaw: 0, speed: 0, activity: "stand" }, noon, 120);
  const worst = Math.max(...poses.map((p) => offWay(body, p)));
  assert.ok(worst < 1e-6, `every step on the person's own way (worst ${worst.toExponential(1)} m off it)`);
  const walking = poses.filter((p) => p.activity === "walk");
  assert.ok(walking.every((p) => Math.abs(p.speed - body.pace) < 1e-9), "at the person's pace");
  assert.ok(poses.some((p) => p.x < 5), "back along the way to where it began");
  // The corner's pause: still, standing, about five seconds, on the corner.
  let run_ = 0, longest = 0, where = { x: 0, y: 0 };
  for (let i = 1; i < poses.length; i++) {
    const still = poses[i]!.speed === 0 && poses[i]!.x === poses[i - 1]!.x && poses[i]!.y === poses[i - 1]!.y;
    run_ = still ? run_ + 1 : 0;
    if (run_ > longest) {
      longest = run_;
      where = poses[i]!;
    }
  }
  assert.ok(Math.abs(longest / 10 - 5) < 0.4 && Math.hypot(where.x - 30, where.y) < STAND_IN.crumbM, `it stood where its person stood, as long (${(longest / 10).toFixed(1)} s at ${where.x.toFixed(1)},${where.y.toFixed(1)})`);
  assert.ok(body.log.every((e) => e.did === ON && e.may === "watch"), "with no calls it holds back at everything it meets");
  console.log(`✓ it walks only its person's way, at their pace, and stands where they stood (${body.log.length} moments met, all held back)`);

  // ── 3. it does only what it may ──
  const actBody = keepBody(end, walkedTrail(), { ...briefAt("act"), exp: noon + 3_600_000 }, "echo|unit", noon);
  const acted = run(actBody, { x: end.x, y: end.y, yaw: 0, speed: 0, activity: "stand" }, noon, 600);
  assert.ok(actBody.log.length >= 10, `ten minutes meet many moments (${actBody.log.length})`);
  assert.ok(actBody.log.every((e) => meetable(e.kind as MomentKind)), "only moments that come on its way: no well, door, field or shore, no errand");
  assert.ok(actBody.log.every((e) => e.did === e.call), "where it may act, it does what it says its person would");
  const kinds = new Set(actBody.log.map((e) => MOMENTS[e.kind as MomentKind].lane));
  assert.ok(kinds.has("people") && kinds.has("passer") && kinds.has("wayside"), `all three streams come to it (${[...kinds].join(", ")})`);
  assert.ok(acted.some((p) => p.activity === "work"), "and the body is seen doing it");
  assert.ok(Math.max(...acted.map((p) => offWay(actBody, p))) < 1e-6, "on its way still, where it does something");

  const askBody = keepBody(end, walkedTrail(), { ...briefAt("ask"), exp: noon + 3_600_000 }, "echo|unit", noon);
  const asked = run(askBody, { x: end.x, y: end.y, yaw: 0, speed: 0, activity: "stand" }, noon, 600);
  assert.ok(askBody.log.length >= 10 && askBody.log.every((e) => e.did === ON && e.call !== ON), "close but not yet: it walks on, and what it would have done is kept");
  assert.ok(!asked.some((p) => p.activity === "work"), "and the body does nothing it has not earned");
  console.log(`✓ it does its call where it may (${actBody.log.length} met), walks on where it may not (${askBody.log.length} held back), and meets only what comes on its way`);
}

// ── the room ────────────────────────────────────────────────────────────────────

const CELL = ROOM_VILLAGES[0]!;
const secret = identitySecretsFor({
  secret: process.env.ECHO_IDENTITY_SECRET,
  previous: process.env.ECHO_IDENTITY_SECRET_OLD,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
})[0]!;
const signed = (subject: string) => ({ userId: subject, token: signIdentity(subject, secret, Math.floor(Date.now() / 1000)) });
const briefFor = (subject: string, key = secret) => signBrief(briefAt("act", subject), key);

type Seen = Record<string, unknown> & { x: number; y: number; here: boolean };
const bodies = (room: Room): Map<string, Seen> => {
  const out = new Map<string, Seen>();
  (room.state as any).walkers?.forEach((w: any, id: string) => out.set(id, { ...w.toJSON() }));
  return out;
};

/** Walk a body east along y = 0 from x0 to x1, as a page would send it. */
async function walk(r: Room, x0: number, x1: number) {
  for (let x = x0; x <= x1 + 1e-9; x += 0.3) {
    r.send(VILLAGE_C2S.POSE, { x, y: 0, yaw: Math.PI / 2, speed: 3, activity: "walk" });
    await sleep(60);
  }
  r.send(VILLAGE_C2S.POSE, { x: x1, y: 0, yaw: Math.PI / 2, speed: 0, activity: "stand" });
  await sleep(80);
}

async function roomTests() {
  const http: HttpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: http }) });
  gameServer.define(VILLAGE_ROOM, VillageRoom).filterBy(["cell", "code"]);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}`;
  const join = (code: string, subject: string) => new Client(url).joinOrCreate(VILLAGE_ROOM, { cell: CELL, code, ...signed(subject) });

  try {
    // ── 4. a body stays, and nobody can tell ──
    const a = await join("STAND", "subject-artun");
    const b = await join("STAND", "subject-deniz");
    const aId = a.sessionId;
    b.send(VILLAGE_C2S.POSE, { x: 0, y: 3, yaw: 0, speed: 0, activity: "stand" });
    await walk(a, 0, 20);
    a.send(VILLAGE_C2S.BRIEF, { token: briefFor("subject-artun") });
    await waitFor(() => bodies(b).get(aId)?.here === true && Math.abs(bodies(b).get(aId)!.x - 20) < 0.01, "A has walked to x=20");

    // B watches for the whole of it: A's handle must never be missing from what B sees.
    let gapSeen = false;
    const watch = setInterval(() => {
      if (!bodies(b).has(aId)) gapSeen = true;
    }, 15);
    await a.leave(true);
    await sleep(1600);
    const kept = bodies(b).get(aId);
    assert.ok(kept, "the body is still there after its person left");
    assert.ok(kept!.x < 19.5 && Math.abs(kept!.y) < 1e-6, `walking back along the person's own way (at ${kept!.x.toFixed(2)}, ${kept!.y.toFixed(2)})`);
    assert.equal(kept!.here, true);
    const keys = Object.keys(kept!).sort().join(",");
    assert.equal(keys, "activity,age,here,id,lookSeed,sex,speed,trade,x,y,yaw", "what is synced of a body its echo keeps is what is synced of any body");
    const wire = JSON.stringify((b.state as any).toJSON());
    for (const s of ["subject-artun", "standin1", "greet-warm", "echo"]) assert.ok(!wire.includes(s), `nothing synced says "${s}"`);
    console.log("✓ the body stays under the same handle, walking its person's way, and nothing synced says who moves it");

    // ── 5. coming back ──
    const a2 = await join("STAND", "subject-artun");
    let you: YouMsg | null = null;
    a2.onMessage(VILLAGE_S2C.YOU, (m: YouMsg) => (you = m));
    a2.send(VILLAGE_C2S.WHO);
    await waitFor(() => you !== null, "the room says which body is A's");
    clearInterval(watch);
    const back = you as unknown as YouMsg;
    assert.equal(back.id, aId, "the same body, under the same handle");
    assert.notEqual(a2.sessionId, aId, "on a new connection");
    assert.ok(back.at && Math.abs(back.at.y) < 1e-6 && back.at.x < 19.5, "where it stands now");
    assert.ok(back.away && back.away.until > back.away.since && Array.isArray(back.away.log), "and what the echo did while A was away");
    assert.equal(gapSeen, false, "B never saw the body go and another come");
    assert.equal(bodies(b).size, 2, "one body for A, not two");
    // A pose from where the page came in waits for the page to take its place at the body.
    const at = bodies(b).get(aId)!;
    await sleep(120);
    a2.send(VILLAGE_C2S.POSE, { x: 300, y: 300, yaw: 0, speed: 0, activity: "stand" });
    await sleep(250);
    assert.ok(Math.hypot(bodies(b).get(aId)!.x - at.x, bodies(b).get(aId)!.y - at.y) < 1e-6, "the body is not pulled toward where the page came in");
    a2.send(VILLAGE_C2S.POSE, { x: at.x + 0.4, y: 0, yaw: 0, speed: 1, activity: "walk" });
    await waitFor(() => Math.abs(bodies(b).get(aId)!.x - (at.x + 0.4)) < 1e-4, "A moves the body again");
    await sleep(400);
    assert.ok(Math.abs(bodies(b).get(aId)!.x - (at.x + 0.4)) < 1e-4, "and nobody else does");
    const again: YouMsg[] = [];
    a2.onMessage(VILLAGE_S2C.YOU, (m: YouMsg) => again.push(m));
    a2.send(VILLAGE_C2S.WHO);
    await waitFor(() => again.length === 1, "asked again");
    assert.deepEqual(again[0], { id: aId }, "what the echo did is told once");
    console.log(`✓ coming back: the same body where it stands, ${back.away!.log.length} moment(s) told once, no pull toward the door`);

    // ── 6. no brief, no body ──
    const gone = async (label: string, subject: string, brief: unknown) => {
      const r = await join("STAND", subject);
      const id = r.sessionId;
      await walk(r, 0, 6);
      if (brief !== undefined) r.send(VILLAGE_C2S.BRIEF, { token: brief });
      await sleep(120);
      await r.leave(true);
      await waitFor(() => !bodies(b).has(id), `${label}'s body goes`);
    };
    await gone("Nobrief", "subject-nobrief", undefined);
    await gone("Borrowed", "subject-borrowed", briefFor("subject-artun"));
    await gone("Forged", "subject-forged", briefFor("subject-forged", "not-the-secret"));
    // Yes, then no: the brief is taken back before leaving.
    const e = await join("STAND", "subject-ece");
    const eId = e.sessionId;
    await walk(e, 0, 6);
    e.send(VILLAGE_C2S.BRIEF, { token: briefFor("subject-ece") });
    e.send(VILLAGE_C2S.BRIEF, { token: null });
    await sleep(150);
    await e.leave(true);
    await waitFor(() => !bodies(b).has(eId), "Ece's body goes after her no");
    console.log("✓ no brief, a brief for someone else, one signed with another key, or a no: the body goes");

    // The brief it was kept by does not outlive the keeping: leaving again without handing one in lets the body go.
    await a2.leave(true);
    await waitFor(() => !bodies(b).has(aId), "A's body goes when A leaves again with no brief handed in");
    console.log("✓ the brief a body was kept by does not outlive the keeping");
    await b.leave(true);

    // ── 7. a room with only an echo in it ──
    process.env.ECHO_STANDIN_MAX_S = "2";
    const f = await join("SHAPE", "subject-fatma");
    await walk(f, 0, 10);
    f.send(VILLAGE_C2S.BRIEF, { token: briefFor("subject-fatma") });
    await sleep(120);
    const roomId = f.roomId;
    await f.leave(true);
    await sleep(1200);
    assert.ok((await matchMaker.query({ roomId })).length === 1, "the room stays while the echo keeps the body, with nobody connected");
    await waitFor(() => false, "", 2500).catch(() => {});
    assert.equal((await matchMaker.query({ roomId })).length, 0, "and goes when the keeping is over");
    delete process.env.ECHO_STANDIN_MAX_S;
    console.log("✓ a room with only an echo in it stays as long as the keeping, then goes");
  } finally {
    // A room an echo still keeps a body in does not go by itself: shutting down must not wait on it.
    await Promise.race([gameServer.gracefullyShutdown(false).catch(() => {}), sleep(1500)]);
    http.close();
  }
}

async function main() {
  unitTests();
  await roomTests();
  console.log("echo standing in: all good");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
