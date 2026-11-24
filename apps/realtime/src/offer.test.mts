/**
 * What passes between two people in a village room, as with a villager (DECISIONS C110).
 *
 *   1. A GIFT — an offer to someone at arm's length reaches them alone; their yes asks the web app, signed, to
 *      move the thing between the two packs, and both are told how it ended with their own pack as it now is.
 *   2. WHAT IS NOT AN OFFER — a thing the planet does not know, an ask that holds something out, someone out of
 *      reach, a second offer while one is open: nothing is handed on.
 *   3. A NO, AND A TRADE — a no ends it for both and asks nothing; a trade is answered with something back, and
 *      a yes with nothing back is no answer; a hand-over the web app refuses ends it as refused.
 *   4. NOT ANSWERED — an offer lapses in its time; one to a body an echo keeps is never handed on and lapses,
 *      as one to a person who did not turn round does; one answered after the offerer walked off is gone.
 *   5. A LINE TO ONE PERSON carries the room's token for having it read in the voice of the body's look.
 *
 * Run:  npm run test:offer -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
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
  VILLAGE_C2S,
  VILLAGE_ROOM,
  VILLAGE_S2C,
  roomLookOf,
  type HandRequest,
  type OfferedMsg,
  type SaidMsg,
  type SettledMsg,
  type StandInBrief,
} from "@echo/shared";
import { identitySecretsFor, signIdentity } from "@echo/shared/identity";
import { signBrief, verifyHand, verifyToldVoice } from "@echo/shared/standin";

import { ON } from "./echoBody.js";
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
const pose = (r: Room, x: number, y = 0) => r.send(VILLAGE_C2S.POSE, { x, y, yaw: 0, speed: 0, activity: "stand" });

/** A stand-in for the web app: the hand-overs the room asks for, and what it answers next. */
function fakeWeb() {
  const asked: { req: HandRequest; signed: boolean }[] = [];
  const next: { status: number; body: unknown }[] = [];
  const http = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/api/village/hand") {
        asked.push({ req: JSON.parse(body) as HandRequest, signed: verifyHand(body, req.headers["x-echo-room"], [secret]) });
        const a = next.shift() ?? { status: 200, body: { ok: false, error: "nothing_queued" } };
        res.writeHead(a.status, { "content-type": "application/json" }).end(JSON.stringify(a.body));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  return { http, asked, next };
}

/** What a page hears of offers. */
function ears(r: Room) {
  const got = { offered: [] as OfferedMsg[], settled: [] as SettledMsg[], told: [] as SaidMsg[] };
  r.onMessage(VILLAGE_S2C.OFFERED, (m: OfferedMsg) => got.offered.push(m));
  r.onMessage(VILLAGE_S2C.SETTLED, (m: SettledMsg) => got.settled.push(m));
  r.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => got.told.push(m));
  return got;
}

async function main() {
  const web = fakeWeb();
  await new Promise<void>((r) => web.http.listen(0, "127.0.0.1", () => r()));
  process.env.ECHO_WEB_URL = `http://127.0.0.1:${(web.http.address() as { port: number }).port}`;
  process.env.ECHO_OFFER_WAIT_MS = "900";

  const http: HttpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: http }) });
  gameServer.define(VILLAGE_ROOM, VillageRoom).filterBy(["cell", "code"]);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}`;
  const join = (code: string, subject: string) => new Client(url).joinOrCreate(VILLAGE_ROOM, { cell: CELL, code, ...signed(subject) });

  try {
    // ── 1. a gift ──
    const a = await join("GAVE5", "artun");
    const b = await join("GAVE5", "deniz");
    const c = await join("GAVE5", "ceren");
    const [ha, hb, hc] = [ears(a), ears(b), ears(c)];
    pose(a, 0);
    pose(b, 1.5);
    pose(c, 2);
    await sleep(250);
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "give", item: "shell" });
    await waitFor(() => hb.offered.length === 1, "the offer reaches them");
    const gift = hb.offered[0]!;
    assert.deepEqual([gift.from, gift.kind, gift.item], [a.sessionId, "give", "shell"]);
    assert.ok(gift.until > Date.now(), "with the time it can be answered in");
    await sleep(150);
    assert.equal(hc.offered.length + ha.offered.length, 0, "and nobody else");
    web.next.push({ status: 200, body: { ok: true, packs: { from: {}, to: { shell: 1 } } } });
    b.send(VILLAGE_C2S.ANSWER, { id: gift.id, yes: true, back: null });
    await waitFor(() => ha.settled.length === 1 && hb.settled.length === 1, "both are told");
    assert.equal(web.asked.length, 1);
    assert.equal(web.asked[0]!.signed, true, "the room's request is signed");
    const req = web.asked[0]!.req;
    assert.deepEqual([req.kind, req.from, req.to, req.item, req.back, req.room, req.cell], ["give", "artun", "deniz", "shell", null, "GAVE5", CELL], "who gave what to whom, server to server");
    assert.deepEqual([ha.settled[0]!.side, ha.settled[0]!.ok, ha.settled[0]!.pack], ["from", true, {}], "the giver, with their pack");
    assert.deepEqual([hb.settled[0]!.side, hb.settled[0]!.ok, hb.settled[0]!.pack], ["to", true, { shell: 1 }], "the one who took it, with theirs");
    assert.equal(hc.settled.length, 0, "and nobody else");
    console.log("✓ a gift reaches the one it is held out to; their yes moves it, by the web app, signed; both are told");

    // ── 2. what is not an offer ──
    const was = hb.offered.length;
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "give", item: "gold-bar" });
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "ask", item: "shell" });
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "give", item: null });
    a.send(VILLAGE_C2S.OFFER, { to: a.sessionId, kind: "give", item: "shell" });
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "steal", item: "shell" });
    pose(c, 9);
    await sleep(200);
    a.send(VILLAGE_C2S.OFFER, { to: c.sessionId, kind: "give", item: "shell" });
    await sleep(250);
    assert.equal(hb.offered.length, was, "no unknown thing, no ask holding something out, no gift of nothing, nothing to oneself, no other kind");
    assert.equal(hc.offered.length, 0, "nobody out of reach");
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "ask", item: null });
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "give", item: "stone" });
    await waitFor(() => hb.offered.length === was + 1, "an ask");
    await sleep(200);
    assert.equal(hb.offered.length, was + 1, "one open offer from a body at a time");
    console.log("✓ nothing the planet does not know, nothing out of reach, one offer at a time");

    // ── 3. a no, and a trade ──
    const ask = hb.offered.at(-1)!;
    b.send(VILLAGE_C2S.ANSWER, { id: ask.id, yes: false, back: null });
    await waitFor(() => ha.settled.length === 2, "the no");
    assert.deepEqual([ha.settled[1]!.ok, ha.settled[1]!.why, hb.settled[1]!.why], [false, "no", "no"], "a no ends it for both");
    assert.equal(web.asked.length, 1, "and asks nothing");
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "trade", item: "reed" });
    await waitFor(() => hb.offered.length === was + 2, "a trade");
    const trade = hb.offered.at(-1)!;
    b.send(VILLAGE_C2S.ANSWER, { id: trade.id, yes: true, back: null });
    await sleep(200);
    assert.equal(web.asked.length, 1, "a yes to a trade with nothing back is no answer");
    web.next.push({ status: 409, body: { ok: false, error: "pack_full" } });
    b.send(VILLAGE_C2S.ANSWER, { id: trade.id, yes: true, back: "shell" });
    await waitFor(() => ha.settled.length === 3, "the trade ended");
    assert.deepEqual([web.asked[1]!.req.kind, web.asked[1]!.req.item, web.asked[1]!.req.back], ["trade", "reed", "shell"]);
    assert.deepEqual([ha.settled[2]!.ok, ha.settled[2]!.why, ha.settled[2]!.back], [false, "refused", "shell"], "a hand-over refused is refused");
    assert.equal(ha.settled[2]!.pack, undefined, "and no pack changed");
    console.log("✓ a no asks nothing; a trade is answered with something back; a refused hand-over is refused");

    // ── 4. not answered ──
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "give", item: "stone" });
    await waitFor(() => ha.settled.length === 4, "it lapses", 3000);
    assert.equal(ha.settled[3]!.why, "lapsed");
    const late = hb.offered.at(-1)!;
    b.send(VILLAGE_C2S.ANSWER, { id: late.id, yes: true, back: null });
    await sleep(200);
    assert.equal(web.asked.length, 2, "an answer after its time is no answer");

    // Walked off before the answer.
    a.send(VILLAGE_C2S.OFFER, { to: b.sessionId, kind: "give", item: "stone" });
    await waitFor(() => hb.offered.length === was + 4, "offered");
    pose(a, 6);
    await sleep(200);
    b.send(VILLAGE_C2S.ANSWER, { id: hb.offered.at(-1)!.id, yes: true, back: null });
    await waitFor(() => ha.settled.length === 5, "gone");
    assert.equal(ha.settled[4]!.why, "gone", "the one who offered walked off");
    assert.equal(web.asked.length, 2);

    // To a body an echo keeps: never handed on, and it lapses.
    const brief: StandInBrief = { sub: "deniz", exp: Date.now() + 3_600_000, calls: Object.fromEntries(MOMENT_KINDS.map((k) => [k, { call: verbsOf(k)[0]?.id ?? ON, p: 0.8, may: "watch" as const }])) };
    b.send(VILLAGE_C2S.BRIEF, { token: signBrief(brief, secret) });
    for (let x = 1.5; x <= 3; x += 0.3) {
      b.send(VILLAGE_C2S.POSE, { x, y: 0, yaw: 0, speed: 1, activity: "walk" });
      await sleep(60);
    }
    pose(a, 2.5);
    await sleep(150);
    const bId = b.sessionId;
    await b.leave(true);
    await sleep(300);
    a.send(VILLAGE_C2S.OFFER, { to: bId, kind: "give", item: "stone" });
    await waitFor(() => ha.settled.length === 6, "it lapses", 3000);
    assert.equal(ha.settled[5]!.why, "lapsed", "as one to a person who did not turn round");
    console.log("✓ an offer not answered lapses; one to a body an echo keeps is never handed on; one to someone gone is gone");

    // ── 5. a line to one person ──
    pose(c, 2.4);
    await sleep(200);
    const ch = ears(c);
    await sleep(800);
    a.send(VILLAGE_C2S.TALK, { to: c.sessionId, text: "nice shell" });
    await waitFor(() => ch.told.length === 1, "told");
    const look = roomLookOf("artun", "GAVE5");
    const m = ch.told[0]!;
    assert.equal(verifyToldVoice({ sub: "ceren", cell: CELL, room: "GAVE5", seed: look.seed, sex: look.sex, age: look.age, text: "nice shell", at: m.voice!.at }, m.voice!.token, [secret]), true, "the room vouches for it, to the one it was said to, in the speaker's look");
    console.log("✓ a line to one person carries the room's token for its voice");
  } finally {
    await gameServer.gracefullyShutdown(false).catch(() => {});
    web.http.close();
  }
}

await main();
console.log("offer: all passed");
process.exit(0);
