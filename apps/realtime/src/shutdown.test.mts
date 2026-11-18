/**
 * When the server goes (DECISIONS C106): a deploy or a restart stops the process with SIGTERM. The real
 * entry point is run as its own process, as a host runs it, and stopped while an echo keeps a body and its
 * person watches:
 *
 *   1. what the echo did reaches the web app, signed, before the process is gone;
 *   2. whoever watches is told the keeping is over, and the people in the room are let go;
 *   3. the process exits by itself, well inside a host's grace (Render waits thirty seconds);
 *   4. the same code makes the room again on the server that comes up.
 *
 * Run:  npm run test:shutdown -w @echo/realtime   (cwd=apps/realtime so tsx honours the decorators)
 */
import "./env.js";
import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createServer as createHttp, type IncomingMessage } from "node:http";
import { strict as assert } from "node:assert";
import { Client, type Room } from "colyseus.js";
import { MOMENT_KINDS, verbsOf } from "@echo/planet";
import { ROOM_VILLAGES, VILLAGE_C2S, VILLAGE_ROOM, VILLAGE_S2C, type AwayReport, type StandInBrief, type WatchEndMsg } from "@echo/shared";
import { identitySecretsFor, signIdentity } from "@echo/shared/identity";
import { signBrief, verifyReport } from "@echo/shared/standin";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function waitFor(pred: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    (function loop() {
      if (pred()) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error(`timeout waiting for ${label}`));
      setTimeout(loop, 20);
    })();
  });
}
const freePort = () =>
  new Promise<number>((res) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => res(port));
    });
  });

const CELL = ROOM_VILLAGES[0]!;
const secrets = identitySecretsFor({
  secret: process.env.ECHO_IDENTITY_SECRET,
  previous: process.env.ECHO_IDENTITY_SECRET_OLD,
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
});
const secret = secrets[0]!;
const signed = (subject: string) => ({ userId: subject, token: signIdentity(subject, secret, Math.floor(Date.now() / 1000)) });
function briefFor(sub: string): StandInBrief {
  const calls: StandInBrief["calls"] = {};
  for (const k of MOMENT_KINDS) calls[k] = { call: verbsOf(k)[0]?.id ?? "on", p: 0.8, may: "act" };
  return { sub, exp: Date.now() + 3_600_000, calls };
}

/**
 * The real entry point, as its own process, on `port`. Resolves once it listens. `ECHO_REALTIME_ENTRY`
 * names a built one instead (`dist/index.js` as the image runs it), so the same test can be run on a build.
 */
function serve(port: number, webUrl: string) {
  const entry = process.env.ECHO_REALTIME_ENTRY;
  const child = spawn(process.execPath, entry ? [entry] : ["--import", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ECHO_WEB_URL: webUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  const exited = new Promise<number | null>((res) => child.on("exit", (code) => res(code)));
  const ready = waitFor(() => out.includes("listening on"), "the server to listen", 30000);
  return { child, ready, exited, log: () => out };
}

async function main() {
  const got: { body: string; sig: string | undefined; at: number }[] = [];
  const web = createHttp((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/api/echo/keeping") got.push({ body, sig: req.headers["x-echo-room"] as string | undefined, at: Date.now() });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((r) => web.listen(0, "127.0.0.1", () => r()));
  const webUrl = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
  const port = await freePort();
  const url = `ws://127.0.0.1:${port}`;
  const join = (subject: string) => new Client(url).joinOrCreate(VILLAGE_ROOM, { cell: CELL, code: "STAND", ...signed(subject) });

  const first = serve(port, webUrl);
  let second: ReturnType<typeof serve> | null = null;
  try {
    await first.ready;
    const a = await join("subject-artun");
    const b = await join("subject-deniz");
    for (let x = 0; x <= 12; x += 0.3) {
      a.send(VILLAGE_C2S.POSE, { x, y: 0, yaw: Math.PI / 2, speed: 3, activity: "walk" });
      await sleep(60);
    }
    a.send(VILLAGE_C2S.BRIEF, { token: signBrief(briefFor("subject-artun"), secret) });
    await sleep(150);
    await a.leave(true);
    await sleep(300);
    const watcher: Room = await new Client(url).join(VILLAGE_ROOM, { cell: CELL, code: "STAND", watch: true, ...signed("subject-artun") });
    let end: WatchEndMsg | null = null;
    watcher.onMessage(VILLAGE_S2C.WATCH_END, (m: WatchEndMsg) => (end = m));
    watcher.onMessage(VILLAGE_S2C.WATCH, () => {});
    watcher.onMessage(VILLAGE_S2C.MET, () => {});
    let bLeft: number | null = null;
    b.onLeave((code) => (bLeft = code));
    await sleep(1200);

    // ── the host stops the process ──
    const t0 = Date.now();
    first.child.kill("SIGTERM");
    const code = await Promise.race([first.exited, sleep(20000).then(() => "hung" as const)]);
    const tookMs = Date.now() - t0;
    assert.notEqual(code, "hung", `the process exits by itself\n${first.log()}`);
    assert.equal(code, 0, "and cleanly");
    assert.ok(tookMs < 8000, `well inside a host's grace (${tookMs} ms)`);

    assert.equal(got.length, 1, "what the echo did was sent before the process went");
    assert.ok(got[0]!.at < t0 + tookMs, "while it was still there");
    assert.equal(verifyReport(got[0]!.body, got[0]!.sig, secrets), true, "signed by the room");
    const report = JSON.parse(got[0]!.body) as AwayReport;
    assert.equal(report.sub, "subject-artun");
    assert.equal(report.room, "STAND");
    assert.ok(report.until >= t0 - 50 && report.until <= t0 + tookMs, "ending when the server did");
    await waitFor(() => end !== null, "the watcher told");
    assert.equal(end!.reason, "over", "the keeping is over");
    await waitFor(() => bLeft !== null, "the person in the room let go");
    console.log(`✓ stopped with an echo keeping a body: its record sent and signed, the watcher told, the people let go, the process gone in ${tookMs} ms`);

    // ── the server that comes up ──
    second = serve(port, webUrl);
    await second.ready;
    const back = await join("subject-deniz");
    await waitFor(() => (back.state as any)?.code === "STAND", "the same code makes the room again");
    let n = 0;
    (back.state as any).walkers.forEach(() => n++);
    assert.equal(n, 1, "with the bodies of whoever comes back, and no echo of anyone's from before");
    await back.leave(true);
    console.log("✓ the same code makes the room again on the server that comes up");
  } finally {
    first.child.kill("SIGKILL");
    second?.child.kill("SIGTERM");
    if (second) await Promise.race([second.exited, sleep(10000)]);
    web.close();
  }
  console.log("when the server goes: all good");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
