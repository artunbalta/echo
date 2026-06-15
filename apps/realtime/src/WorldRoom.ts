/**
 * Authoritative world room (§7, §12). Holds canonical positions/presence, validates
 * movement, drives NPC wander AI, detects proximity, and brokers conversation turns.
 *
 * Netcode model: client sends directional MOVE_INTENT with a monotonic `seq`. The
 * server integrates movement at TICK_HZ and echoes `lastSeq` back in entity state so
 * the client can reconcile its prediction (Phase 2). Remote entities are interpolated
 * client-side between state snapshots.
 */
import { Room, type Client } from "@colyseus/core";
import {
  WORLD,
  TICK_MS,
  clampToMap,
  tileDistance,
  C2S,
  S2C,
  type MoveIntent,
  type ChatMessage,
  type WelcomePayload,
  type Facing,
  type TelemetryEvent,
} from "@echo/shared";
import { WorldState, Entity } from "./state.js";
import { loadNpcs, loadNpcsAsync } from "./npcs.js";
import { npcReply, type Turn } from "./dialogue.js";
import { logInteraction, logTelemetry } from "./persistence.js";

interface JoinOptions {
  userId: string;
  name?: string;
  spriteUrl?: string;
  sessionId?: string;
}

interface ActiveInteraction {
  id: string;
  userEntityId: string;
  npcEntityId: string;
  history: Turn[];
  startedAt: number;
}

const NPC_SPEED = WORLD.MOVE_SPEED * 0.5;

export class WorldRoom extends Room<WorldState> {
  maxClients = WORLD.ROOM_CAPACITY;
  private interactions = new Map<string, ActiveInteraction>();
  private clientSessions = new Map<string, string>(); // entityId -> sessionId

  async onCreate(options: { worldId?: string }) {
    this.setState(new WorldState());
    this.state.worldId = options.worldId ?? "echo-world-1";

    await loadNpcsAsync(); // prefer the persisted spanning set; populates the sync cache
    this.spawnNpcs();
    this.registerHandlers();

    // Fixed-tick authoritative simulation.
    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
    console.log(`[WorldRoom] created "${this.state.worldId}" with ${this.state.entities.size} entities`);
  }

  // ── presence ───────────────────────────────────────────────────────────────
  onJoin(client: Client, options: JoinOptions) {
    const spawn = clampToMap(
      Math.floor(WORLD.MAP_WIDTH / 2),
      Math.floor(WORLD.MAP_HEIGHT / 2),
    );
    const e = new Entity();
    e.id = client.sessionId;
    e.kind = "user";
    e.refId = options.userId ?? client.sessionId;
    e.name = options.name ?? "Newcomer";
    e.spriteUrl = options.spriteUrl ?? "";
    e.x = spawn.x;
    e.y = spawn.y;
    e.facing = "down";
    e.lastSeen = Date.now();
    this.state.entities.set(e.id, e);
    if (options.sessionId) this.clientSessions.set(e.id, options.sessionId);

    const welcome: WelcomePayload = {
      entityId: e.id,
      worldId: this.state.worldId,
      spawn,
      serverTickHz: WORLD.TICK_HZ,
    };
    client.send(S2C.WELCOME, welcome);
    console.log(`[WorldRoom] +user ${e.name} (${e.id})`);
  }

  async onLeave(client: Client, consented?: boolean) {
    const e = this.state.entities.get(client.sessionId);
    if (e) e.moving = false; // freeze in place while we wait for a possible reconnect

    // Brief reconnection window so a flaky connection doesn't evict the player (§7).
    if (!consented) {
      try {
        await this.allowReconnection(client, 20); // seconds
        return; // reconnected — entity preserved, nothing to clean up
      } catch {
        /* window elapsed → fall through to cleanup */
      }
    }

    // Close any open interaction for this client, then remove presence.
    for (const [iid, it] of this.interactions) {
      if (it.userEntityId === client.sessionId) this.closeInteraction(iid, "left");
    }
    this.state.entities.delete(client.sessionId);
    this.clientSessions.delete(client.sessionId);
  }

  // ── message handlers ────────────────────────────────────────────────────────
  private registerHandlers() {
    this.onMessage(C2S.MOVE_INTENT, (client, msg: MoveIntent) => {
      const e = this.state.entities.get(client.sessionId);
      if (!e) return;
      const dx = Math.sign(msg.dir?.x ?? 0);
      const dy = Math.sign(msg.dir?.y ?? 0);
      e.dir = { x: dx, y: dy };
      e.moving = dx !== 0 || dy !== 0;
      if (msg.facing) e.facing = msg.facing as Facing;
      if (typeof msg.seq === "number") e.lastSeq = msg.seq;
    });

    this.onMessage(C2S.STOP, (client, msg: { seq?: number }) => {
      const e = this.state.entities.get(client.sessionId);
      if (!e) return;
      e.dir = { x: 0, y: 0 };
      e.moving = false;
      if (typeof msg?.seq === "number") e.lastSeq = msg.seq;
    });

    this.onMessage(C2S.PING, (client, t: number) => client.send(S2C.PONG, t));

    this.onMessage(C2S.TELEMETRY, (client, batch: { events: TelemetryEvent[] }) => {
      const sessionId = this.clientSessions.get(client.sessionId);
      const userId = this.state.entities.get(client.sessionId)?.refId;
      if (!userId) return;
      for (const ev of batch?.events ?? []) {
        logTelemetry(userId, sessionId, ev).catch(() => {});
      }
    });

    this.onMessage(C2S.INTERACT_START, (client, msg: { targetId: string }) => {
      this.openInteraction(client, msg.targetId);
    });

    this.onMessage(C2S.INTERACT_END, (client, msg: { interactionId: string }) => {
      this.closeInteraction(msg.interactionId, "ended");
    });

    this.onMessage(C2S.CHAT, (client, msg: ChatMessage) => {
      this.handleChat(client, msg).catch((err) => {
        console.error("[WorldRoom] chat error", err);
        client.send(S2C.ERROR, { code: "chat_failed", message: "NPC did not respond." });
      });
    });
  }

  // ── interactions ─────────────────────────────────────────────────────────────
  private openInteraction(client: Client, targetId: string) {
    const user = this.state.entities.get(client.sessionId);
    const target = this.state.entities.get(targetId);
    if (!user || !target) return;
    if (tileDistance(user.x, user.y, target.x, target.y) > WORLD.INTERACTION_RADIUS + 0.5) {
      client.send(S2C.ERROR, { code: "too_far", message: "Move closer to talk." });
      return;
    }
    const id = `it_${client.sessionId}_${target.id}_${this.state.tick}`;
    const it: ActiveInteraction = {
      id,
      userEntityId: user.id,
      npcEntityId: target.id,
      history: [],
      startedAt: Date.now(),
    };
    this.interactions.set(id, it);
    // Face each other; NPC pauses wandering while talking.
    target.moving = false;
    target.dir = { x: 0, y: 0 };
    client.send(S2C.INTERACT_OPENED, {
      interactionId: id,
      target: { id: target.id, name: target.name, kind: target.kind },
    });
  }

  private async handleChat(client: Client, msg: ChatMessage) {
    const it = this.interactions.get(msg.interactionId);
    if (!it) {
      client.send(S2C.ERROR, { code: "no_interaction", message: "Conversation not open." });
      return;
    }
    it.history.push({ role: "user", text: msg.text });

    const npcEntity = this.state.entities.get(it.npcEntityId);
    const npc = loadNpcs().find((n) => n.id === npcEntity?.refId);
    if (!npc || !npcEntity) {
      this.closeInteraction(it.id, "ended");
      return;
    }

    const userId = this.state.entities.get(it.userEntityId)?.refId;
    const sustained = it.history.length > 4;
    const reply = await npcReply(npc, it.history, sustained);
    it.history.push({ role: "assistant", text: reply.text });

    client.send(S2C.INTERACT_TURN, {
      interactionId: it.id,
      speaker: "npc",
      speakerName: npc.name,
      text: reply.text,
    });

    // Persist the exchange (fire-and-forget; never blocks the turn).
    if (userId) {
      logInteraction({
        worldId: this.state.worldId,
        actorId: userId,
        targetId: npc.id,
        userText: msg.text,
        npcText: reply.text,
        latencyMs: msg.latencyMs,
        editsCount: msg.editsCount,
      }).catch(() => {});
    }
  }

  private closeInteraction(id: string, reason: string) {
    const it = this.interactions.get(id);
    if (!it) return;
    this.interactions.delete(id);
    const client = this.clients.find((c) => c.sessionId === it.userEntityId);
    client?.send(S2C.INTERACT_CLOSED, { interactionId: id, reason });
  }

  // ── simulation ────────────────────────────────────────────────────────────────
  private tick(dtMs: number) {
    const dt = dtMs / 1000;
    this.state.tick++;
    const now = Date.now();

    for (const e of this.state.entities.values()) {
      if (e.kind === "user") {
        this.integrate(e, dt, WORLD.MOVE_SPEED);
      } else {
        this.stepNpc(e, now, dt);
      }
    }
  }

  private integrate(e: Entity, dt: number, speed: number) {
    if (e.dir.x === 0 && e.dir.y === 0) {
      e.moving = false;
      return;
    }
    // Normalize diagonal so movement speed is constant in all directions.
    const len = Math.hypot(e.dir.x, e.dir.y) || 1;
    const nx = e.x + (e.dir.x / len) * speed * dt;
    const ny = e.y + (e.dir.y / len) * speed * dt;
    const c = clampToMap(nx, ny);
    e.x = c.x;
    e.y = c.y;
    e.moving = true;
    e.lastSeen = Date.now();
  }

  /** Lightweight wander FSM (§8): idle at home, occasionally drift to a new point. */
  private stepNpc(e: Entity, now: number, dt: number) {
    // Don't wander while in a conversation.
    const inConvo = [...this.interactions.values()].some((it) => it.npcEntityId === e.id);
    if (inConvo) {
      e.moving = false;
      e.dir = { x: 0, y: 0 };
      return;
    }
    // Stable per-NPC pseudo-random bytes. Derived from a hash of the id rather than
    // positional charCodeAt() — ids like "npc_000" are only 7 chars, so charCodeAt(7+)
    // returned NaN and poisoned the wander target (every NPC drifted to the 0,0 corner).
    const h = hashId(e.id);
    const b0 = h & 0xff;
    const b1 = (h >> 8) & 0xff;
    const b2 = (h >> 16) & 0xff;
    const b3 = (h >> 24) & 0xff;
    if (now >= e.nextWanderAt) {
      // Pick a new nearby target around home, or idle.
      const idle = (b0 + this.state.tick) % 3 === 0;
      if (idle) {
        // Hold position while idling. Without a target the move step below would steer
        // the NPC toward a stale/origin target.
        e.wanderTargetX = e.x;
        e.wanderTargetY = e.y;
        e.dir = { x: 0, y: 0 };
        e.moving = false;
        e.nextWanderAt = now + 2000 + (b1 % 4) * 1000;
        return;
      }
      const a = ((b2 + this.state.tick) % 360) * (Math.PI / 180);
      const r = 3 + (b3 % 4);
      const t = clampToMap(e.homeX + Math.cos(a) * r, e.homeY + Math.sin(a) * r);
      e.wanderTargetX = t.x;
      e.wanderTargetY = t.y;
      e.nextWanderAt = now + 3000 + (b1 % 5) * 1000;
    }
    // Move toward wander target.
    const ddx = e.wanderTargetX - e.x;
    const ddy = e.wanderTargetY - e.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 0.15) {
      e.moving = false;
      e.dir = { x: 0, y: 0 };
      return;
    }
    e.dir = { x: Math.sign(ddx), y: Math.sign(ddy) };
    e.facing = pickFacing(ddx, ddy);
    this.integrate(e, dt, NPC_SPEED);
  }

  private spawnNpcs() {
    for (const spec of loadNpcs()) {
      const e = new Entity();
      e.id = spec.id;
      e.kind = "npc";
      e.refId = spec.id;
      e.name = spec.name;
      e.spriteUrl = spec.spriteUrl ?? "";
      e.x = spec.homeX;
      e.y = spec.homeY;
      e.homeX = spec.homeX;
      e.homeY = spec.homeY;
      // Seed the wander target at home so the first ticks (before the first wander
      // pick) don't steer toward the default 0,0.
      e.wanderTargetX = spec.homeX;
      e.wanderTargetY = spec.homeY;
      e.facing = "down";
      e.nextWanderAt = 0;
      this.state.entities.set(e.id, e);
    }
  }
}

function pickFacing(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Stable 32-bit FNV-1a hash of a string — length-independent NPC pseudo-randomness. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
