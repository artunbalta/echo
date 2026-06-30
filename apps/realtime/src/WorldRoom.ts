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
  islandSlot,
  slotDistance,
  OCEAN,
  buildFlow2Event,
  FLOW2_FIRST_CONTACT,
  buildSocialEvent,
  SOCIAL_CUES,
  type MoveIntent,
  type ChatMessage,
  type SocialCueMsg,
  type TravelMsg,
  type WelcomePayload,
  type Facing,
  type TelemetryEvent,
  type CounterpartStatus,
} from "@echo/shared";
import { WorldState, Entity } from "./state.js";
import { loadNpcs, loadNpcsAsync } from "./npcs.js";
import { npcReply, type Turn } from "./dialogue.js";
import { logInteraction, logTelemetry, observeBehavioral } from "./persistence.js";

interface JoinOptions {
  userId: string;
  name?: string;
  spriteUrl?: string;
  sessionId?: string;
  /** The player's archipelago slot (ECHO §1–2). When present, they appear at their island's
   *  ocean coordinate so Step-1-clustered neighbours are spatially adjacent in the shared room. */
  slotIndex?: number;
}

interface ActiveInteraction {
  id: string;
  /** `npc` = a user talking to an NPC (server brokers replies); `user` = two live players
   *  talking to each other (the server relays each turn to the other). */
  kind: "npc" | "user";
  /** The user entity that opened the interaction. */
  initiatorEntityId: string;
  /** The other side: an NPC entity id, or the second user's entity id. */
  partnerEntityId: string;
  history: Turn[];
  startedAt: number;
  /** Per-sender timestamp of the last relayed turn (server-side rate limiting). */
  lastTurnAt: Record<string, number>;
  /** Count of echo-drafted (viaEcho) turns relayed — hard ceiling on auto ping-pong cost. */
  echoTurns: number;
}

const NPC_SPEED = WORLD.MOVE_SPEED * 0.5;

// ── player↔player guardrails (server-authoritative; never trust the client) ──────────
/** Min gap between two relayed turns from the SAME sender — bounds spam/flood. */
const MIN_PEER_TURN_INTERVAL_MS = 600;
/** Hard ceiling on echo-drafted turns per conversation — bounds auto ping-pong model cost
 *  even against a modified client (the browser's own MAX_PEER_ECHO_TURNS is just UX). */
const MAX_ECHO_RELAYS = 12;
/** Trim relayed chat history so a long-lived room can't grow it without bound. */
const PEER_HISTORY_CAP = 60;
/** Beyond this distance the two players have walked apart → the chat closes (and frees both). */
const USER_INTERACTION_RANGE = WORLD.INTERACTION_RADIUS + 2;
/** No turns for this long → auto-close so neither player stays locked "busy". */
const USER_INTERACTION_IDLE_MS = 120_000;

export class WorldRoom extends Room<WorldState> {
  maxClients = WORLD.ROOM_CAPACITY;
  private interactions = new Map<string, ActiveInteraction>();
  private clientSessions = new Map<string, string>(); // entityId -> sessionId

  async onCreate(options: { worldId?: string }) {
    this.setState(new WorldState());
    this.state.worldId = options.worldId ?? "echo-world-1";

    await loadNpcsAsync(); // prefer the persisted spanning set; populates the sync cache
    this.spawnNpcs();
    this.spawnClearingStations(); // Flow 3 — the clearing's status/service/queue/group/marginal/bargain
    this.registerHandlers();

    // Fixed-tick authoritative simulation.
    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
    console.log(`[WorldRoom] created "${this.state.worldId}" with ${this.state.entities.size} entities`);
  }

  // ── presence ───────────────────────────────────────────────────────────────
  onJoin(client: Client, options: JoinOptions) {
    // Crossing in from your own island (F2): appear at your archipelago slot's ocean coordinate so
    // Step-1-clustered neighbours land adjacent and mutually visible. Fall back to the cluster-spawn
    // (near the most-recently-seen live player) when no slot is carried.
    const spawn =
      typeof options.slotIndex === "number" ? this.spawnForSlot(options.slotIndex) : this.pickSpawn();
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
    e.homeSlot = typeof options.slotIndex === "number" ? options.slotIndex : -1;
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

    // A live chat must not freeze the OTHER human for the whole reconnection window — end any
    // player↔player conversation this client was in right away (NPC chats can survive a blip).
    for (const [iid, it] of this.interactions) {
      if (it.kind === "user" && (it.initiatorEntityId === client.sessionId || it.partnerEntityId === client.sessionId)) {
        this.closeInteraction(iid, "left");
      }
    }

    // Brief reconnection window so a flaky connection doesn't evict the player (§7).
    if (!consented) {
      try {
        await this.allowReconnection(client, 20); // seconds
        return; // reconnected — entity preserved, nothing to clean up
      } catch {
        /* window elapsed → fall through to cleanup */
      }
    }

    // Close any open interaction this client was part of (as initiator OR partner, so a
    // live player leaving mid-chat cleanly closes the conversation on the other side too).
    for (const [iid, it] of this.interactions) {
      if (it.initiatorEntityId === client.sessionId || it.partnerEntityId === client.sessionId) {
        this.closeInteraction(iid, "left");
      }
    }
    this.state.entities.delete(client.sessionId);
    this.clientSessions.delete(client.sessionId);
  }

  /** Map an archipelago slot's ocean coordinate (0..OCEAN.EXTENT) into the shared room's tile
   *  grid (0..MAP_WIDTH). Adjacent slots (the Step-1 cluster) map to adjacent room tiles, so two
   *  neighbours who both cross land within sight of each other. */
  private spawnForSlot(slotIndex: number): { x: number; y: number } {
    const s = islandSlot(slotIndex);
    const sx = WORLD.MAP_WIDTH / OCEAN.EXTENT;
    const sy = WORLD.MAP_HEIGHT / OCEAN.EXTENT;
    return clampToMap(s.x * sx, s.y * sy);
  }

  /** Spawn point for a newcomer: near an existing live player if any, else map centre. */
  private pickSpawn(): { x: number; y: number } {
    const centre = clampToMap(Math.floor(WORLD.MAP_WIDTH / 2), Math.floor(WORLD.MAP_HEIGHT / 2));
    const others = [...this.state.entities.values()].filter((e) => e.kind === "user");
    if (others.length === 0) return centre;
    // Anchor on the most-recently-seen live player and offset by a couple of tiles.
    const anchor = others.reduce((a, b) => (b.lastSeen > a.lastSeen ? b : a));
    const angle = (this.state.tick % 360) * (Math.PI / 180);
    return clampToMap(anchor.x + Math.cos(angle) * 2, anchor.y + Math.sin(angle) * 2);
  }

  /** The interaction (if any) this entity is currently part of — used to gate double-opens. */
  private interactionFor(entityId: string): ActiveInteraction | undefined {
    for (const it of this.interactions.values()) {
      if (it.initiatorEntityId === entityId || it.partnerEntityId === entityId) return it;
    }
    return undefined;
  }

  private clientFor(entityId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === entityId);
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
      const it = this.interactions.get(msg.interactionId);
      if (!it) return;
      // Only a participant can end it (either live player, or the NPC chat's owner).
      if (it.initiatorEntityId !== client.sessionId && it.partnerEntityId !== client.sessionId) return;
      this.closeInteraction(msg.interactionId, "ended");
    });

    this.onMessage(C2S.CHAT, (client, msg: ChatMessage) => {
      this.handleChat(client, msg).catch((err) => {
        console.error("[WorldRoom] chat error", err);
        client.send(S2C.ERROR, { code: "chat_failed", message: "NPC did not respond." });
      });
    });

    this.onMessage(C2S.SOCIAL_CUE, (client, msg: SocialCueMsg) => this.handleSocialCue(client, msg));

    this.onMessage(C2S.TRAVEL, (client, msg: TravelMsg) => this.handleTravel(client, msg));
  }

  /**
   * Travel stand (the co-presence amplifier). Carry the player to a destination archipelago slot —
   * including FAR, non-adjacent clusters and other players' regions — by moving their avatar to that
   * island's ocean coordinate in the shared room (reuses spawnForSlot; NO new transport). The server
   * reads far-vs-near AUTHORITATIVELY from slot geometry (vs the player's home slot) and emits the
   * per-actor travel cue (travel_far = novelty/risk, travel_near = the known) into the actor's own
   * posterior via the proven ingress. A `prepared` flag emits the planning cue first.
   */
  private handleTravel(client: Client, msg: TravelMsg) {
    const e = this.state.entities.get(client.sessionId);
    const dest = Math.trunc(Number(msg?.destinationSlot));
    if (!e || !Number.isFinite(dest) || dest < 0) return;

    const sessionId = this.clientSessions.get(e.id) ?? e.id;
    // far-vs-near from slot geometry: a long ocean hop from home reads as novelty/risk.
    const hop = e.homeSlot >= 0 ? slotDistance(e.homeSlot, dest) : Infinity;
    const far = hop > OCEAN.SPACING * 4; // ≈ 4+ slot-spacings out = a distant, non-adjacent shore
    const audience = [...this.state.entities.values()].filter((o) => o.kind === "user" && o.id !== e.id).length;

    const emit = (action: string, raw: Record<string, number> = {}) =>
      void observeBehavioral(
        buildSocialEvent({
          actorId: e.refId,
          sessionId,
          action,
          counterpartId: `island_${dest}`,
          counterpartStatus: "none",
          targetKind: "place",
          audienceSize: audience,
          raw,
        }),
      );

    if (msg.prepared) emit("prepare_before_travel");
    emit(far ? "travel_far" : "travel_near", { distance: Number.isFinite(hop) ? Number(hop.toFixed(2)) : 0, amount: dest });

    // Arrive at the destination island's ocean coordinate in the shared room.
    const arrive = this.spawnForSlot(dest);
    e.x = arrive.x;
    e.y = arrive.y;
    e.dir = { x: 0, y: 0 };
    e.moving = false;
    e.lastSeen = Date.now();
    const welcome: WelcomePayload = {
      entityId: e.id,
      worldId: this.state.worldId,
      spawn: arrive,
      serverTickHz: WORLD.TICK_HZ,
    };
    client.send(S2C.WELCOME, welcome);
    console.log(`[WorldRoom] ${e.name} travelled → slot ${dest} (${far ? "far" : "near"}) @ (${arrive.x.toFixed(1)},${arrive.y.toFixed(1)})`);
  }

  /**
   * A Flow 2/3 social choice (opener register, turn dynamic, cold-response reaction, or a clearing
   * station action). The client reports WHICH choice the player made; the authoritative server
   * stamps the mandatory context from what it knows — counterpart_status (peer for a live player,
   * the station NPC's status otherwise), audience_size (other live players present), and the
   * proxemic distance — and emits ONE per-actor BehavioralEvent into THIS actor's own posterior via
   * the proven /observe/behavioral ingress. Each player reports their own turns, so the dyad's two
   * posteriors stay siloed; the conditional bucket keys on counterpart_status (the F3 gradient).
   */
  private handleSocialCue(client: Client, msg: SocialCueMsg) {
    const actor = this.state.entities.get(client.sessionId);
    const target = this.state.entities.get(msg?.targetId ?? "");
    if (!actor || !target || !msg?.action || !(msg.action in SOCIAL_CUES)) return;
    // Strict per-actor siloing: a user can never socially measure themselves (two tabs of one
    // browser share a userId → same refId). Mirrors emitFirstContact's guard.
    if (actor.refId === target.refId) return;
    // Proximity guard: you can only socially measure someone you're actually near (also stops a
    // modified client from emitting cues about a player across the map).
    if (tileDistance(actor.x, actor.y, target.x, target.y) > WORLD.INTERACTION_RADIUS + 2) return;

    const counterpartStatus: CounterpartStatus =
      target.kind === "user"
        ? "peer"
        : target.status === "low" || target.status === "high" || target.status === "peer"
          ? (target.status as CounterpartStatus)
          : "stranger";
    const audience = [...this.state.entities.values()].filter(
      (e) => e.kind === "user" && e.id !== actor.id && e.id !== target.id,
    ).length;
    const raw: Record<string, number> = { distance: tileDistance(actor.x, actor.y, target.x, target.y) };
    if (typeof msg.latencyMs === "number") raw.latency_ms = msg.latencyMs;
    if (typeof msg.editsCount === "number") raw.edits = msg.editsCount;

    void observeBehavioral(
      buildSocialEvent({
        actorId: actor.refId,
        sessionId: this.clientSessions.get(actor.id) ?? actor.id,
        action: msg.action,
        counterpartId: target.refId,
        counterpartStatus,
        targetKind: target.kind === "user" ? "player" : "npc",
        audienceSize: audience,
        raw,
      }),
    );
  }

  // ── interactions ─────────────────────────────────────────────────────────────
  private openInteraction(client: Client, targetId: string) {
    const user = this.state.entities.get(client.sessionId);
    const target = this.state.entities.get(targetId);
    if (!user || !target) return;
    // Flow 3 station NPCs are not chat partners — they're acted on via SOCIAL_CUE (the action
    // menu). Opening a chat with one would dead-end (no NPC dialogue spec), so refuse it here too
    // (belt-and-suspenders for the no-key / modified-client path; the client also guards this).
    if (target.role) return;
    if (tileDistance(user.x, user.y, target.x, target.y) > WORLD.INTERACTION_RADIUS + 0.5) {
      client.send(S2C.ERROR, { code: "too_far", message: "Move closer to talk." });
      return;
    }
    // Don't open a second conversation for someone already in one.
    if (this.interactionFor(user.id)) return;

    const id = `it_${client.sessionId}_${target.id}_${this.state.tick}`;

    if (target.kind === "user") {
      // Two live players. Refuse if the other person is already talking to someone.
      if (this.interactionFor(target.id)) {
        client.send(S2C.ERROR, { code: "busy", message: `${target.name} is already talking with someone.` });
        return;
      }
      const it: ActiveInteraction = {
        id,
        kind: "user",
        initiatorEntityId: user.id,
        partnerEntityId: target.id,
        history: [],
        startedAt: Date.now(),
        lastTurnAt: {},
        echoTurns: 0,
      };
      this.interactions.set(id, it);
      // Open the conversation on BOTH sides — each describing the other participant.
      client.send(S2C.INTERACT_OPENED, {
        interactionId: id,
        target: { id: target.id, name: target.name, kind: "user" },
      });
      this.clientFor(target.id)?.send(S2C.INTERACT_OPENED, {
        interactionId: id,
        target: { id: user.id, name: user.name, kind: "user" },
      });
      this.emitFirstContact(user, target);
      console.log(`[WorldRoom] user↔user ${user.name} ↔ ${target.name}`);
      return;
    }

    // User ↔ NPC: the server brokers the NPC's replies.
    const it: ActiveInteraction = {
      id,
      kind: "npc",
      initiatorEntityId: user.id,
      partnerEntityId: target.id,
      history: [],
      startedAt: Date.now(),
      lastTurnAt: {},
      echoTurns: 0,
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

  /**
   * First contact between two LIVE players (F2). The server is authoritative — it knows both
   * actors, their proxemic distance, and the audience — so it emits a SEPARATE per-actor
   * BehavioralEvent for EACH participant, each from that actor's own vantage (counterpart = the
   * other player, status peer), routed strictly into that actor's own posterior via the proven
   * /observe/behavioral ingress. Two real users, two independent reads — never co-mingled.
   */
  private emitFirstContact(a: Entity, b: Entity) {
    // Never let a user first-contact themselves: two tabs of ONE browser (shared localStorage →
    // same userId → same refId) would otherwise fold both reads into a single posterior, breaking
    // strict per-actor siloing. The authoritative server is the right chokepoint to enforce this.
    if (a.refId === b.refId) return;
    // Audience = other live players who could observe this dyad (excludes the two participants).
    const audience = [...this.state.entities.values()].filter(
      (e) => e.kind === "user" && e.id !== a.id && e.id !== b.id,
    ).length;
    const distance = tileDistance(a.x, a.y, b.x, b.y); // proxemics: the gap at first contact
    // Proxemics (the doc's distance cue) derived authoritatively from positions: the distance the
    // player settled at when they opened contact — intimate (≤1 tile) reads warmth, a kept gap
    // (1–2 tiles, the rest of the open window) reads reserve/avoidance. Both branches are live
    // within the interaction-open window (≤ INTERACTION_RADIUS+0.5 = 2.0). NOTE: this is sampled at
    // contact, a coarse read of the doc's *continuous* settle-distance — see known-gaps #4.
    const proxemics = distance <= 1 ? "proxemics_close" : "proxemics_far";
    for (const [actor, counterpart] of [[a, b], [b, a]] as const) {
      const sessionId = this.clientSessions.get(actor.id) ?? actor.id;
      void observeBehavioral(
        buildFlow2Event({
          actorId: actor.refId,
          sessionId,
          channel: FLOW2_FIRST_CONTACT.channel,
          cue: FLOW2_FIRST_CONTACT.cue,
          action: FLOW2_FIRST_CONTACT.action,
          targetId: counterpart.refId,
          targetKind: "player",
          counterpartStatus: "peer",
          audienceSize: audience,
          raw: { distance },
        }),
      );
      void observeBehavioral(
        buildSocialEvent({
          actorId: actor.refId,
          sessionId,
          action: proxemics,
          counterpartId: counterpart.refId,
          counterpartStatus: "peer",
          targetKind: "player",
          audienceSize: audience,
          raw: { distance },
        }),
      );
    }
  }

  private async handleChat(client: Client, msg: ChatMessage) {
    const it = this.interactions.get(msg.interactionId);
    if (!it) {
      client.send(S2C.ERROR, { code: "no_interaction", message: "Conversation not open." });
      return;
    }
    // Only a participant may speak into an interaction (prevents injecting a turn into a
    // conversation between two other players by guessing its id).
    if (it.initiatorEntityId !== client.sessionId && it.partnerEntityId !== client.sessionId) {
      client.send(S2C.ERROR, { code: "not_participant", message: "Not your conversation." });
      return;
    }

    // Two live players: relay this turn straight to the other person (no NPC model).
    if (it.kind === "user") {
      this.relayPeerChat(client, it, msg);
      return;
    }

    it.history.push({ role: "user", text: msg.text });

    const npcEntity = this.state.entities.get(it.partnerEntityId);
    const npc = loadNpcs().find((n) => n.id === npcEntity?.refId);
    if (!npc || !npcEntity) {
      this.closeInteraction(it.id, "ended");
      return;
    }

    const userId = this.state.entities.get(it.initiatorEntityId)?.refId;
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

  /** Relay one live-player turn to the other participant (no NPC model involved). The
   *  client constants are UX only; these server caps are the real ceiling on flood/cost. */
  private relayPeerChat(client: Client, it: ActiveInteraction, msg: ChatMessage) {
    const sender = this.state.entities.get(client.sessionId);
    if (!sender) return;
    const partnerId = it.initiatorEntityId === client.sessionId ? it.partnerEntityId : it.initiatorEntityId;
    const partner = this.state.entities.get(partnerId);
    const partnerClient = this.clientFor(partnerId);
    if (!partner || !partnerClient) {
      // The other player is gone — close cleanly so the sender isn't stuck.
      this.closeInteraction(it.id, "left");
      return;
    }
    const now = Date.now();
    // Rate-limit per sender: silently drop turns that arrive faster than a human could type
    // (and that a flooding/looping client would emit). Never trust the browser's own cap.
    if (now - (it.lastTurnAt[sender.id] ?? 0) < MIN_PEER_TURN_INTERVAL_MS) return;
    it.lastTurnAt[sender.id] = now;
    // Hard ceiling on echo-drafted turns: bounds autonomous echo-to-echo cost. Human-typed
    // turns are never blocked — only the auto (viaEcho) ones are capped.
    if (msg.viaEcho) {
      if (it.echoTurns >= MAX_ECHO_RELAYS) return;
      it.echoTurns++;
    }
    it.history.push({ role: "user", text: msg.text });
    if (it.history.length > PEER_HISTORY_CAP) it.history.splice(0, it.history.length - PEER_HISTORY_CAP);
    partnerClient.send(S2C.INTERACT_TURN, {
      interactionId: it.id,
      speaker: msg.viaEcho ? "peer_echo" : "peer",
      speakerName: sender.name,
      text: msg.text,
    });
    // Persist the exchange for the end-of-day connection read (fire-and-forget).
    logInteraction({
      worldId: this.state.worldId,
      actorId: sender.refId,
      targetId: partner.refId,
      userText: msg.text,
      npcText: "",
      latencyMs: msg.latencyMs,
      editsCount: msg.editsCount,
    }).catch(() => {});
  }

  private closeInteraction(id: string, reason: string) {
    const it = this.interactions.get(id);
    if (!it) return;
    this.interactions.delete(id);
    // Notify everyone in the conversation. For an NPC chat that's just the initiator;
    // for a live pair it's both players.
    this.clientFor(it.initiatorEntityId)?.send(S2C.INTERACT_CLOSED, { interactionId: id, reason });
    if (it.kind === "user") {
      this.clientFor(it.partnerEntityId)?.send(S2C.INTERACT_CLOSED, { interactionId: id, reason });
    }
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
    this.enforceUserInteractions(now);
  }

  /** Keep live-player conversations honest: end them when the two walk apart (so neither is
   *  locked "busy"), and as an idle backstop. A victim of an open-and-idle grief just steps
   *  away to free themselves; the opener can't hold them from across the map. */
  private enforceUserInteractions(now: number) {
    for (const [iid, it] of this.interactions) {
      if (it.kind !== "user") continue;
      const a = this.state.entities.get(it.initiatorEntityId);
      const b = this.state.entities.get(it.partnerEntityId);
      if (!a || !b) {
        this.closeInteraction(iid, "left");
        continue;
      }
      if (tileDistance(a.x, a.y, b.x, b.y) > USER_INTERACTION_RANGE) {
        this.closeInteraction(iid, "walked_away");
        continue;
      }
      const lastActivity = Math.max(it.startedAt, ...Object.values(it.lastTurnAt));
      if (now - lastActivity > USER_INTERACTION_IDLE_MS) this.closeInteraction(iid, "idle");
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
    // Flow 3 station NPCs (a server, an elder, a queue, a group, a marginal figure, a trader) stay
    // put so the clearing is a stable place the player can navigate and treat by status.
    if (e.role) {
      e.moving = false;
      e.dir = { x: 0, y: 0 };
      return;
    }
    // Don't wander while in a conversation.
    const inConvo = [...this.interactions.values()].some((it) => it.kind === "npc" && it.partnerEntityId === e.id);
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

  /**
   * Flow 3 — the clearing. A small, stable cluster of station NPCs the dyad seeps into after F2
   * (the seep is geographic: the player walks over; no scene wall). Each carries a `role` (which
   * action menu the client shows) and a `status` (which counterpart_status the server stamps on the
   * social event), so the courtesy gradient — warmth to the low-status server vs the high-status
   * elder — is recoverable as a conditional. Placed just north of the slot-spawn cluster.
   */
  private spawnClearingStations() {
    const cx = Math.floor(WORLD.MAP_WIDTH / 2);
    const cy = 20;
    const stations: { id: string; name: string; role: string; status: string; dx: number; dy: number }[] = [
      { id: "stn_server", name: "the keeper of the stall", role: "service", status: "low", dx: -3, dy: 1 },
      { id: "stn_elder", name: "the elder", role: "elder", status: "high", dx: 3, dy: 1 },
      { id: "stn_queue", name: "the line at the well", role: "queue", status: "peer", dx: 0, dy: 3 },
      { id: "stn_group", name: "a knot of talkers", role: "group", status: "peer", dx: -2, dy: -3 },
      { id: "stn_marginal", name: "the one apart", role: "marginal", status: "low", dx: 5, dy: -2 },
      { id: "stn_trader", name: "the trader", role: "trader", status: "peer", dx: 1, dy: -1 },
      // the travel stand — a ferry/harbour at the water's edge; the co-presence amplifier that
      // carries a player to far, non-adjacent islands (and other players' regions).
      { id: "stn_travel", name: "the ferry stand", role: "travel", status: "none", dx: 0, dy: 8 },
    ];
    for (const s of stations) {
      const e = new Entity();
      e.id = s.id;
      e.kind = "npc";
      e.refId = s.id;
      e.name = s.name;
      e.spriteUrl = "";
      const p = clampToMap(cx + s.dx, cy + s.dy);
      e.x = p.x;
      e.y = p.y;
      e.homeX = p.x;
      e.homeY = p.y;
      e.wanderTargetX = p.x;
      e.wanderTargetY = p.y;
      e.facing = "down";
      e.role = s.role;
      e.status = s.status;
      this.state.entities.set(e.id, e);
    }
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
