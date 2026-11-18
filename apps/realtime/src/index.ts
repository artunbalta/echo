/**
 * Realtime server bootstrap (§3, §12). A standalone long-lived Colyseus process —
 * deploy to Fly/Railway/Render, NOT serverless. Exposes the shared WorldRoom
 * (designed to shard by capacity) and the village rooms: copies of the reference village,
 * one per code (DECISIONS C101).
 */
import "./env.js"; // must be first: loads repo-root .env before any env-reading module
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { VILLAGE_ROOM } from "@echo/shared";

import { VillageRoom } from "./VillageRoom.js";
import { WorldRoom } from "./WorldRoom.js";

// The shared-ocean room holds ~110 entities (100 NPCs + users); its full-state encode exceeds
// @colyseus/schema's default 8 KB buffer, which kills every state patch (nobody moves). Size it
// for the real room (the error message itself prescribes this exact fix).
Encoder.BUFFER_SIZE = 64 * 1024;

// Hosts (Railway/Render/Fly/…) inject PORT; fall back to REALTIME_PORT for local dev.
const PORT = Number(process.env.PORT ?? process.env.REALTIME_PORT ?? 2567);
const HOST = process.env.HOST ?? "0.0.0.0";

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "echo-realtime" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// Shutting down is this file's (below), once: Colyseus's own signal handler would run beside it, and the
// second of the two to call `gracefullyShutdown` exits the process at once, before the rooms have closed.
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  gracefullyShutdown: false,
});

gameServer.define("world", WorldRoom);
// Copies of the reference village, one per code (DECISIONS C101): a join with a cell and a code finds
// the room made with them, or makes it.
gameServer.define(VILLAGE_ROOM, VillageRoom).filterBy(["cell", "code"]);

httpServer.listen(PORT, HOST, () => {
  console.log(`[echo-realtime] listening on ${HOST}:${PORT} (ws + /health)`);
  // What a deployment without a setting cannot do, said once where its operator reads.
  if (!process.env.ECHO_IDENTITY_SECRET && process.env.NODE_ENV === "production") {
    console.warn("[echo-realtime] ECHO_IDENTITY_SECRET is not set: every join is refused (identity_unconfigured)");
  }
  if (!process.env.ECHO_WEB_URL) {
    console.warn("[echo-realtime] ECHO_WEB_URL is not set: what an echo did while it kept a place is not kept with its person's record");
  }
});

/**
 * How long stopping may take before the process goes anyway, ms (C106). Rooms end their keepings and send
 * their records first (`VillageRoom.onBeforeShutdown`, five seconds at most); a host waits longer than
 * this before it kills (Render: thirty seconds).
 */
const SHUTDOWN_MS = 12_000;
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    console.log(`[echo-realtime] ${sig} — shutting down`);
    setTimeout(() => {
      console.warn("[echo-realtime] shutdown took too long — exiting");
      process.exit(0);
    }, SHUTDOWN_MS).unref();
    void gameServer.gracefullyShutdown(true);
  });
}
