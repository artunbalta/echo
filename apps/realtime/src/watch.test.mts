/**
 * Watching your echo from outside without it knowing (DECISIONS C105).
 *
 *   1. IT CANNOT TELL — the room's whole step for kept bodies, run for ten minutes with a watcher hearing
 *      every moment as the room tells it and without one, gives the same poses and the same moments, byte
 *      for byte; and hearing of a moment leaves the body exactly as it was.
 *   2. ONLY YOUR OWN, ONLY WHILE KEPT — nobody comes in to watch a body its echo is not keeping, nor one
 *      that is not theirs.
 *   3. NOBODY ELSE CAN TELL — a watcher has no body: the others see the same bodies they saw before.
 *   4. WHAT IT MEETS, AS IT MEETS IT — the watcher is told what the echo met so far and each moment after.
 *   4b. WHAT IS SAID TO IT (C107) — a line said to a body its echo keeps reaches nobody but the one watching
 *      it: the speaker is told nothing, as by a person who did not answer, and the echo walks on.
 *   5. "THAT WAS NOT ME" — a fresh brief handed in from outside is what the echo acts by from then on.
 *   6. WHEN IT ENDS — its person back, or its time up: the watcher is told, and what the echo did goes to
 *      the web app, signed by the room; a no from outside lets the body go and reports nothing.
 *
 * Run:  npm run test:watch -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
 */
import "./env.js";
import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { MOMENT_KINDS, WORLD_EPOCH, verbsOf } from "@echo/planet";
import {
  ROOM_VILLAGES,
  VILLAGE_C2S,
  VILLAGE_ROOM,
  VILLAGE_S2C,
  type AwayEntry,
  type AwayReport,
  type HeardMsg,
  type MetMsg,
  type SaidMsg,
  type StandInBrief,
  type StandInLevel,
  type WatchEndMsg,
  type WatchMsg,
} from "@echo/shared";
import { identitySecretsFor, signIdentity } from "@echo/shared/identity";
import { signBrief, verifyReport } from "@echo/shared/standin";

import { ON, Trail, advanceKept, keepBody, newsFor, type EchoBody, type KeptBody } from "./echoBody.js";
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
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}
function briefAt(may: StandInLevel, sub: string, exp = Date.now() + 3_600_000): StandInBrief {
  const calls: StandInBrief["calls"] = {};
  for (const k of MOMENT_KINDS) calls[k] = { call: verbsOf(k)[0]?.id ?? ON, p: 0.8, may };
  return { sub, exp, calls };
}
/** Everything about a kept body, Maps included, as one string. */
const bytes = (b: EchoBody) => JSON.stringify(b, (_k, v) => (v instanceof Map ? [...v.entries()] : v));

// ── 1. it cannot tell ────────────────────────────────────────────────────────────

function cannotTell() {
  const noon = Date.parse(WORLD_EPOCH) + (1000 + 0.45) * 720_000;
  const trail = () => {
    const t = new Trail();
    for (let x = 0; x <= 30; x += 0.16) t.take({ x, y: 0, yaw: 0, speed: 1.6, activity: "walk" }, 100);
    for (let k = 0; k < 40; k++) t.take({ x: 30, y: 0, yaw: 0, speed: 0, activity: "stand" }, 100);
    for (let y = 0.16; y <= 20; y += 0.16) t.take({ x: 30, y, yaw: 0, speed: 1.6, activity: "walk" }, 100);
    return t;
  };
  const run = (watched: boolean) => {
    const t = trail();
    const end = t.crumbs.at(-1)!;
    const body: KeptBody = { x: end.x, y: end.y, yaw: 0, speed: 0, activity: "stand", echo: keepBody(end, t, briefAt("act", "s", noon + 3_600_000), "echo|same", noon) };
    const rand = seeded(11);
    const poses: string[] = [];
    let seen = 0;
    let heard = 0;
    let untouched = true;
    for (let k = 1; k <= 6000; k++) {
      advanceKept([body], noon + k * 100, 100, rand);
      poses.push(`${body.x},${body.y},${body.yaw},${body.speed},${body.activity}`);
      if (watched) {
        // Exactly what the room does for a watcher after every step, and what it sends.
        const before = bytes(body.echo!);
        const news = newsFor(body.echo!, seen);
        if (news.entries.length) JSON.stringify({ entries: news.entries } satisfies MetMsg);
        seen = news.seen;
        heard += news.entries.length;
        if (bytes(body.echo!) !== before) untouched = false;
      }
    }
    return { poses: poses.join("\n"), log: JSON.stringify(body.echo!.log), heard, untouched };
  };
  const alone = run(false);
  const watched = run(true);
  assert.ok(watched.heard >= 20, `the watcher heard of every moment (${watched.heard})`);
  assert.equal(watched.untouched, true, "hearing of a moment leaves the body exactly as it was");
  assert.equal(watched.poses, alone.poses, "the same 6000 poses, byte for byte, watched or not");
  assert.equal(watched.log, alone.log, "the same moments met, and the same done at each");
  console.log(`✓ it cannot tell: ten minutes kept with a watcher and without, ${watched.heard} moments heard, poses and moments byte for byte the same`);
}

// ── the room ────────────────────────────────────────────────────────────────────

const CELL = ROOM_VILLAGES[0]!;
const secrets = identitySecretsFor({
  secret: process.env.ECHO_IDENTITY_SECRET,
  previous: process.env.ECHO_IDENTITY_SECRET_OLD,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
});
const secret = secrets[0]!;
const signed = (subject: string) => ({ userId: subject, token: signIdentity(subject, secret, Math.floor(Date.now() / 1000)) });
const bodies = (room: Room) => {
  const out = new Map<string, Record<string, unknown>>();
  (room.state as any).walkers?.forEach((w: any, id: string) => out.set(id, { ...w.toJSON() }));
  return out;
};
async function walk(r: Room, x0: number, x1: number) {
  for (let x = x0; x <= x1 + 1e-9; x += 0.3) {
    r.send(VILLAGE_C2S.POSE, { x, y: 0, yaw: Math.PI / 2, speed: 3, activity: "walk" });
    await sleep(60);
  }
  r.send(VILLAGE_C2S.POSE, { x: x1, y: 0, yaw: Math.PI / 2, speed: 0, activity: "stand" });
  await sleep(80);
}

/** A stand-in for the web app: what the room reports, as it arrives. */
function fakeWeb() {
  const got: { body: string; sig: string | undefined }[] = [];
  const http = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/api/echo/keeping") got.push({ body, sig: req.headers["x-echo-room"] as string | undefined });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  return { http, got };
}

async function roomTests() {
  const web = fakeWeb();
  await new Promise<void>((r) => web.http.listen(0, "127.0.0.1", () => r()));
  process.env.ECHO_WEB_URL = `http://127.0.0.1:${(web.http.address() as { port: number }).port}`;

  const http: HttpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: http }) });
  gameServer.define(VILLAGE_ROOM, VillageRoom).filterBy(["cell", "code"]);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}`;
  const join = (code: string, subject: string) => new Client(url).joinOrCreate(VILLAGE_ROOM, { cell: CELL, code, ...signed(subject) });
  const watch = (code: string, subject: string) => new Client(url).join(VILLAGE_ROOM, { cell: CELL, code, watch: true, ...signed(subject) });
  /** Come in to watch, and hear everything the room says to a watcher. */
  const watcher = async (code: string, subject: string) => {
    const r = await watch(code, subject);
    const heard = { first: null as WatchMsg | null, met: [] as AwayEntry[], end: null as WatchEndMsg | null, said: [] as HeardMsg[] };
    r.onMessage(VILLAGE_S2C.WATCH, (m: WatchMsg) => (heard.first = m));
    r.onMessage(VILLAGE_S2C.HEARD, (m: HeardMsg) => heard.said.push(m));
    r.onMessage(VILLAGE_S2C.MET, (m: MetMsg) => heard.met.push(...m.entries));
    r.onMessage(VILLAGE_S2C.WATCH_END, (m: WatchEndMsg) => (heard.end = m));
    r.send(VILLAGE_C2S.WHO);
    return { r, heard };
  };

  try {
    // ── 2. only your own, only while kept ──
    const a = await join("WATCH", "subject-artun");
    const b = await join("WATCH", "subject-deniz");
    const aId = a.sessionId;
    b.send(VILLAGE_C2S.POSE, { x: 0, y: 3, yaw: 0, speed: 0, activity: "stand" });
    await walk(a, 0, 24);
    await assert.rejects(watch("WATCH", "subject-artun"), Error, "nothing to watch while A moves the body");
    a.send(VILLAGE_C2S.BRIEF, { token: signBrief(briefAt("act", "subject-artun"), secret) });
    await sleep(120);
    await a.leave(true);
    await waitFor(() => bodies(b).get(aId) !== undefined, "A's body kept");
    await assert.rejects(watch("WATCH", "subject-deniz"), Error, "Deniz cannot watch Artun's echo");
    console.log("✓ only your own echo, and only while it keeps the body");

    // ── 3, 4. nobody else can tell; what it meets, as it meets it ──
    const before = [...bodies(b).keys()].sort().join(",");
    const w = await watcher("WATCH", "subject-artun");
    await waitFor(() => w.heard.first !== null, "the watcher is told what it watches");
    assert.equal(w.heard.first!.id, aId, "A's own body");
    assert.ok(!("name" in w.heard.first!), "no name is sent (C107)");
    await sleep(300);
    assert.equal([...bodies(b).keys()].sort().join(","), before, "the others see the same bodies: a watcher has none");
    assert.ok(!JSON.stringify((b.state as any).toJSON()).includes("watch"), "nothing synced says anyone is watching");
    await waitFor(() => w.heard.met.length >= 2, "two moments heard as they are met", 40000);
    assert.ok(w.heard.met.every((e) => e.did === e.call), "where it may act, it did its call");
    console.log(`✓ a watcher has no body, nobody is told, and hears each moment as it is met (${w.heard.met.length} so far)`);

    // ── 4b. what is said to it ──
    // B walks to the middle of A's way, from where every point of it is within earshot.
    for (let x = 0.5; x <= 12; x += 0.5) {
      b.send(VILLAGE_C2S.POSE, { x, y: 3, yaw: 0, speed: 2.5, activity: "walk" });
      await sleep(110);
    }
    const toldB: SaidMsg[] = [];
    b.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => toldB.push(m));
    const metBefore = w.heard.met.length;
    b.send(VILLAGE_C2S.TALK, { to: aId, text: "Artun? is that you?" });
    await waitFor(() => w.heard.said.length === 1, "the one watching is shown what was said to the body");
    assert.equal(w.heard.said[0]!.from, b.sessionId);
    assert.equal(w.heard.said[0]!.text, "Artun? is that you?");
    await sleep(400);
    assert.equal(toldB.length, 0, "the speaker is told nothing back");
    assert.ok(bodies(b).has(aId), "the body is still kept");
    await waitFor(() => w.heard.met.length > metBefore, "and the echo walks on, meeting what it meets", 40000);
    console.log("✓ a line said to a body its echo keeps reaches only the one watching it; nobody answers");

    // ── 5. "that was not me" ──
    w.r.send(VILLAGE_C2S.BRIEF, { token: signBrief(briefAt("watch", "subject-artun"), secret) });
    const from = w.heard.met.length;
    await waitFor(() => w.heard.met.length >= from + 2, "two more moments", 40000);
    const after = w.heard.met.slice(from);
    assert.ok(after.every((e) => e.may === "watch" && e.did === ON), "after the fresh brief it holds back where it no longer may act");
    console.log(`✓ a fresh brief from outside is what it acts by from then on (${after.length} held back since)`);

    // ── 6. when it ends ──
    const a2 = await join("WATCH", "subject-artun");
    await waitFor(() => w.heard.end !== null, "the watcher is told the person is back");
    assert.equal(w.heard.end!.reason, "back");
    await waitFor(() => web.got.length === 1, "what the echo did is reported");
    const report = JSON.parse(web.got[0]!.body) as AwayReport;
    assert.equal(verifyReport(web.got[0]!.body, web.got[0]!.sig, secrets), true, "signed by the room");
    assert.equal(verifyReport(web.got[0]!.body.replace("WATCH", "OTHER") + " ", web.got[0]!.sig, secrets), false, "and only over what it sent");
    assert.equal(report.sub, "subject-artun");
    assert.equal(report.room, "WATCH");
    assert.ok(report.log.length >= 4 && report.until > report.since, `the whole keeping (${report.log.length} moments)`);
    await w.r.leave(true).catch(() => {});

    // Its time up, while watched.
    process.env.ECHO_STANDIN_MAX_S = "3";
    const f = await join("WATCH", "subject-fatma");
    const fId = f.sessionId;
    await walk(f, 0, 8);
    f.send(VILLAGE_C2S.BRIEF, { token: signBrief(briefAt("act", "subject-fatma"), secret) });
    await sleep(120);
    await f.leave(true);
    const fw = await watcher("WATCH", "subject-fatma");
    await waitFor(() => fw.heard.end !== null, "the watcher is told the keeping is over", 6000);
    assert.equal(fw.heard.end!.reason, "over");
    await waitFor(() => !bodies(b).has(fId), "and the body goes");
    await waitFor(() => web.got.length === 2, "reported too");
    delete process.env.ECHO_STANDIN_MAX_S;

    // A no from outside: the body goes at once, and nothing is reported.
    const e = await join("WATCH", "subject-ece");
    const eId = e.sessionId;
    await walk(e, 0, 8);
    e.send(VILLAGE_C2S.BRIEF, { token: signBrief(briefAt("act", "subject-ece"), secret) });
    await sleep(120);
    await e.leave(true);
    const ew = await watcher("WATCH", "subject-ece");
    await waitFor(() => ew.heard.first !== null, "watching Ece's echo");
    ew.r.send(VILLAGE_C2S.BRIEF, { token: null });
    await waitFor(() => !bodies(b).has(eId), "a no from outside lets the body go");
    await sleep(400);
    assert.equal(web.got.length, 2, "and nothing of it is reported");
    console.log("✓ when it ends: the watcher is told, what it did is reported signed; a no from outside reports nothing");

    await Promise.all([a2.leave(true), b.leave(true)]);
  } finally {
    // A room an echo still keeps a body in does not go by itself: shutting down must not wait on it.
    await Promise.race([gameServer.gracefullyShutdown(false).catch(() => {}), sleep(1500)]);
    http.close();
    web.http.close();
  }
}

async function main() {
  cannotTell();
  await roomTests();
  console.log("watching your echo: all good");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
