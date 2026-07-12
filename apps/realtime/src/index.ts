/**
 * Realtime server bootstrap (§3, §12). A standalone long-lived Colyseus process —
 * deploy to Fly/Railway/Render, NOT serverless. Exposes a single shared WorldRoom
 * (designed to shard by capacity).
 */
import "./env.js"; // must be first: loads repo-root .env before any env-reading module
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
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

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("world", WorldRoom);

httpServer.listen(PORT, HOST, () => {
  console.log(`[echo-realtime] listening on ${HOST}:${PORT} (ws + /health)`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[echo-realtime] ${sig} — shutting down`);
    await gameServer.gracefullyShutdown();
    process.exit(0);
  });
}
