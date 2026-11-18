/**
 * An echo that talks for its person in a village room (DECISIONS C109).
 *
 *   1. AS LONG AS TYPING IT TAKES — an answer waits about as long as a person typing it would.
 *   2. AT "ACT" IT ANSWERS — a line said to a body its echo keeps is put to the web app, signed, with the
 *      conversation so far; the answer reaches the speaker as a person's does, the one watching sees it in
 *      what the echo did, and the next request carries what was said both ways. One line at a time: what is
 *      said while it answers is in the next request. Nothing to say, or no answer, is silence.
 *   3. WHAT IT REPORTS — the lines it said, and nothing anyone said to it.
 *   4. AT "ASK" IT ASKS — only with its person watching: the line it would say is put to them, and said only
 *      when they press "Say it"; unwatched, the web app is not even asked.
 *   5. BELOW THAT, SILENCE — at "watch", or with a brief from before talking, nothing is asked or said.
 *
 * Run:  npm run test:talk -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
 */
import "./env.js";
import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { strict as assert } from "node:assert";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { MOMENT_KINDS, verbsOf } from "@echo/planet";
import {
  ROOM_VILLAGES,
  TALK_KIND,
  VILLAGE_C2S,
  VILLAGE_ROOM,
  VILLAGE_S2C,
  type AwayEntry,
  type AwayReport,
  type HeardMsg,
  type MetMsg,
  type SaidMsg,
  type SpeakRequest,
  type StandInBrief,
  type StandInLevel,
  type WouldMsg,
} from "@echo/shared";
import { identitySecretsFor, signIdentity } from "@echo/shared/identity";
import { signBrief, verifySpeak } from "@echo/shared/standin";

import { ON } from "./echoBody.js";
import { VillageRoom, typingMs } from "./VillageRoom.js";

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
const brief = (sub: string, talk?: StandInLevel): StandInBrief => {
  const calls: StandInBrief["calls"] = {};
  // Held back at every moment, so the log is only what it says.
  for (const k of MOMENT_KINDS) calls[k] = { call: verbsOf(k)[0]?.id ?? ON, p: 0.8, may: "watch" };
  return { sub, exp: Date.now() + 3_600_000, calls, ...(talk ? { talk } : {}) };
};
async function walk(r: Room, x0: number, x1: number) {
  for (let x = x0; x <= x1 + 1e-9; x += 0.3) {
    r.send(VILLAGE_C2S.POSE, { x, y: 0, yaw: Math.PI / 2, speed: 3, activity: "walk" });
    await sleep(60);
  }
  r.send(VILLAGE_C2S.POSE, { x: x1, y: 0, yaw: Math.PI / 2, speed: 0, activity: "stand" });
  await sleep(80);
}

/** A stand-in for the web app: what the room asks and reports, and what it answers next. */
function fakeWeb() {
  const asked: { req: SpeakRequest; signed: boolean }[] = [];
  const reports: string[] = [];
  const next: { status: number; body: unknown; delayMs?: number }[] = [];
  const http = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      if (req.url === "/api/echo/speak") {
        asked.push({ req: JSON.parse(body) as SpeakRequest, signed: verifySpeak(body, req.headers["x-echo-room"], [secret]) });
        const a = next.shift() ?? { status: 200, body: { say: null } };
        if (a.delayMs) await sleep(a.delayMs);
        res.writeHead(a.status, { "content-type": "application/json" }).end(JSON.stringify(a.body));
        return;
      }
      if (req.url === "/api/echo/keeping") reports.push(body);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  return { http, asked, reports, next };
}

function typing() {
  const saved = process.env.ECHO_TALK_PACE;
  delete process.env.ECHO_TALK_PACE;
  const short = typingMs("ok", () => 0);
  const long = typingMs("x".repeat(240), () => 1);
  assert.equal(short, 1400 + 55 * 2, "a short line: a moment to read and a moment to type");
  assert.equal(long, 12_000, "never longer than twelve seconds");
  assert.ok(typingMs("a line of some length", () => 0.5) > short);
  process.env.ECHO_TALK_PACE = "0";
  assert.equal(typingMs("anything"), 0, "a test can say no waiting");
  if (saved === undefined) delete process.env.ECHO_TALK_PACE;
  else process.env.ECHO_TALK_PACE = saved;
  console.log("✓ an answer waits about as long as typing it would take");
}

async function roomTests() {
  const web = fakeWeb();
  await new Promise<void>((r) => web.http.listen(0, "127.0.0.1", () => r()));
  process.env.ECHO_WEB_URL = `http://127.0.0.1:${(web.http.address() as { port: number }).port}`;
  process.env.ECHO_TALK_PACE = "0";

  const http: HttpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: http }) });
  gameServer.define(VILLAGE_ROOM, VillageRoom).filterBy(["cell", "code"]);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}`;
  const join = (code: string, subject: string) => new Client(url).joinOrCreate(VILLAGE_ROOM, { cell: CELL, code, ...signed(subject) });
  const watcher = async (code: string, subject: string) => {
    const r = await new Client(url).join(VILLAGE_ROOM, { cell: CELL, code, watch: true, ...signed(subject) });
    const heard = { met: [] as AwayEntry[], said: [] as HeardMsg[], would: [] as WouldMsg[] };
    r.onMessage(VILLAGE_S2C.WATCH, () => undefined);
    r.onMessage(VILLAGE_S2C.WATCH_END, () => undefined);
    r.onMessage(VILLAGE_S2C.HEARD, (m: HeardMsg) => heard.said.push(m));
    r.onMessage(VILLAGE_S2C.MET, (m: MetMsg) => heard.met.push(...m.entries));
    r.onMessage(VILLAGE_S2C.WOULD, (m: WouldMsg) => heard.would.push(m));
    r.send(VILLAGE_C2S.WHO);
    return { r, heard };
  };
  /** A keeps a body in `code` by a brief at `talk`; B stands within earshot of all of its way. */
  const keptWith = async (code: string, talk?: StandInLevel) => {
    const a = await join(code, `artun-${code}`);
    const b = await join(code, `deniz-${code}`);
    const aId = a.sessionId;
    b.send(VILLAGE_C2S.POSE, { x: 12, y: 3, yaw: 0, speed: 0, activity: "stand" });
    await walk(a, 0, 24);
    a.send(VILLAGE_C2S.BRIEF, { token: signBrief(brief(`artun-${code}`, talk), secret) });
    await sleep(150);
    await a.leave(true);
    await sleep(300);
    const told: SaidMsg[] = [];
    b.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => told.push(m));
    return { aId, b, told };
  };

  try {
    // ── 2. at "act" it answers ──
    const k = await keptWith("TAKES", "act");
    const w = await watcher("TAKES", "artun-TAKES");
    await sleep(200);
    web.next.push({ status: 200, body: { say: "just walking, you?", sure: 0.6 } });
    k.b.send(VILLAGE_C2S.TALK, { to: k.aId, text: "hello, where to?" });
    await waitFor(() => k.told.length === 1, "the answer reaches the speaker");
    assert.deepEqual(k.told[0], { from: k.aId, text: "just walking, you?" }, "from the body, as a person's answer comes");
    assert.equal(web.asked.length, 1);
    const first = web.asked[0]!;
    assert.equal(first.signed, true, "the room's request is signed");
    assert.deepEqual([first.req.sub, first.req.mode, first.req.room, first.req.cell], ["artun-TAKES", "act", "TAKES", CELL]);
    assert.deepEqual(first.req.turns, [{ from: "them", text: "hello, where to?" }]);
    await waitFor(() => w.heard.met.some((e) => e.kind === TALK_KIND), "the one watching sees it in what the echo did");
    const said = w.heard.met.find((e) => e.kind === TALK_KIND)!;
    assert.deepEqual([said.said, said.may, said.call, said.did], ["just walking, you?", "act", "answer", "answer"]);
    assert.equal(w.heard.said[0]?.text, "hello, where to?", "and what was said to it, as before");

    // One line at a time: what is said while it answers goes into the next request.
    web.next.push({ status: 200, body: { say: "the well", sure: 0.5 }, delayMs: 900 });
    await sleep(750);
    k.b.send(VILLAGE_C2S.TALK, { to: k.aId, text: "same, to the well?" });
    await sleep(750);
    k.b.send(VILLAGE_C2S.TALK, { to: k.aId, text: "or the market" });
    await waitFor(() => k.told.length === 2, "the second answer");
    assert.equal(web.asked.length, 2, "no second request while the first is being answered");
    web.next.push({ status: 200, body: { say: "see you there", sure: 0.5 } });
    await sleep(750);
    k.b.send(VILLAGE_C2S.TALK, { to: k.aId, text: "ok bye" });
    await waitFor(() => k.told.length === 3, "the third answer");
    assert.deepEqual(
      web.asked[2]!.req.turns.map((t) => `${t.from}:${t.text}`),
      ["them:hello, where to?", "me:just walking, you?", "them:same, to the well?", "them:or the market", "me:the well", "them:ok bye"],
      "the conversation both ways, and the line said while it answered",
    );

    // Nothing to say, or no answer: silence.
    web.next.push({ status: 200, body: { say: null } });
    await sleep(750);
    k.b.send(VILLAGE_C2S.TALK, { to: k.aId, text: "hm?" });
    await waitFor(() => web.asked.length === 4, "asked");
    web.next.push({ status: 409, body: { error: "not_earned" } });
    await sleep(750);
    k.b.send(VILLAGE_C2S.TALK, { to: k.aId, text: "hello?" });
    await waitFor(() => web.asked.length === 5, "asked");
    await sleep(300);
    assert.equal(k.told.length, 3, "nothing said when there is nothing to say, or no right to");
    console.log("✓ at act it answers through the web app, signed, after typing, one line at a time; nothing to say is silence");

    // ── 3. what it reports ──
    await join("TAKES", "artun-TAKES");
    await waitFor(() => web.reports.length === 1, "the keeping is reported");
    const report = JSON.parse(web.reports[0]!) as AwayReport;
    assert.deepEqual(
      report.log.filter((e) => e.kind === TALK_KIND).map((e) => e.said),
      ["just walking, you?", "the well", "see you there"],
      "the lines it said",
    );
    for (const theirs of ["where to", "to the well?", "market", "ok bye", "hello?"]) assert.ok(!web.reports[0]!.includes(theirs), `nothing said to it is reported ("${theirs}")`);
    console.log("✓ what it said is in its report, and nothing said to it");

    // ── 4. at "ask" it asks ──
    const q = await keptWith("ASKME", "ask");
    const before = web.asked.length;
    q.b.send(VILLAGE_C2S.TALK, { to: q.aId, text: "anyone home?" });
    await sleep(500);
    assert.equal(web.asked.length, before, "unwatched, the web app is not asked at all");
    const qw = await watcher("ASKME", "artun-ASKME");
    await sleep(200);
    web.next.push({ status: 200, body: { say: "yeah, hi", sure: 0.4 } });
    await sleep(500);
    q.b.send(VILLAGE_C2S.TALK, { to: q.aId, text: "hey!" });
    await waitFor(() => qw.heard.would.length === 1, "the line it would say is put to its person");
    assert.equal(web.asked.at(-1)!.req.mode, "ask");
    const would = qw.heard.would[0]!;
    assert.deepEqual([would.text, would.to], ["yeah, hi", q.b.sessionId]);
    await sleep(300);
    assert.equal(q.told.length, 0, "and not said");
    qw.r.send(VILLAGE_C2S.SAY_IT, { id: "nonsense" });
    await sleep(200);
    assert.equal(q.told.length, 0, "a line it never offered is not said");
    qw.r.send(VILLAGE_C2S.SAY_IT, { id: would.id });
    await waitFor(() => q.told.length === 1, "said, on 'Say it'");
    assert.deepEqual(q.told[0], { from: q.aId, text: "yeah, hi" });
    qw.r.send(VILLAGE_C2S.SAY_IT, { id: would.id });
    await sleep(250);
    assert.equal(q.told.length, 1, "once");
    await waitFor(() => qw.heard.met.some((e) => e.kind === TALK_KIND && e.may === "ask"), "in what it did, as said with its person");
    console.log("✓ at ask, only watched: the line it would say is put to its person, and said on 'Say it', once");

    // ── 5. below that, silence ──
    for (const [code, talk] of [["HUSH2", "watch"], ["PAST2", undefined]] as const) {
      const s = await keptWith(code, talk);
      await watcher(code, `artun-${code}`);
      const n: number = web.asked.length;
      await sleep(200);
      s.b.send(VILLAGE_C2S.TALK, { to: s.aId, text: "hello there" });
      await sleep(600);
      assert.equal(web.asked.length, n, `${talk ?? "a brief from before talking"}: nothing asked`);
      assert.equal(s.told.length, 0, `${talk ?? "a brief from before talking"}: nothing said`);
    }
    console.log("✓ at watch, or by a brief from before talking, it says nothing and asks nothing");
  } finally {
    await gameServer.gracefullyShutdown(false).catch(() => {});
    web.http.close();
  }
}

typing();
await roomTests();
console.log("talk: all passed");
process.exit(0);
