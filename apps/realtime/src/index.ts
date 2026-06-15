/**
 * Realtime server bootstrap (§3, §12). A standalone long-lived Colyseus process —
 * deploy to Fly/Railway/Render, NOT serverless. Exposes a single shared WorldRoom
 * (designed to shard by capacity).
 */
import "./env.js"; // must be first: loads repo-root .env before any env-reading module
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./WorldRoom.js";

const PORT = Number(process.env.REALTIME_PORT ?? 2567);

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

httpServer.listen(PORT, () => {
  console.log(`[echo-realtime] listening on :${PORT} (ws + /health)`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[echo-realtime] ${sig} — shutting down`);
    await gameServer.gracefullyShutdown();
    process.exit(0);
  });
}
