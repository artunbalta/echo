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
  oceanLandAt,
  oceanIslandCenter,
  OCEAN_BEACH_W,
  OCEAN,
  buildFlow2Event,
  FLOW2_FIRST_CONTACT,
  buildSocialEvent,
  SOCIAL_CUES,
  buildFlow0Event,
  FLOW0_EGGS,
  PRESENCE,
  OCEAN_ISLAND_R,
  type MoveIntent,
  type ChatMessage,
  type SocialCueMsg,
  type TravelMsg,
  type WelcomePayload,
  type Facing,
  type TelemetryEvent,
  type CounterpartStatus,
  effectiveSeaworthiness,
  reachTiles,
  hullSpeed,
  driftVector,
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
/** Min gap between two travel-stand hops from the same player — a hop is heavyweight and emits a
 *  measured cue, so bound floods from a modified client (mirrors MIN_PEER_TURN_INTERVAL_MS). */
const MIN_TRAVEL_INTERVAL_MS = 2_000;

export class WorldRoom extends Room<WorldState> {
  maxClients = WORLD.ROOM_CAPACITY;
  private interactions = new Map<string, ActiveInteraction>();
  private clientSessions = new Map<string, string>(); // entityId -> sessionId
  // ── P4 Stage-2/3 life-scale reads ──
  // The sighting (egg_horizon_seen): once per (viewer, seen) pair, when a far-but-visible
  // ANONYMOUS figure first appears across the water. Throttled scan; capped per viewer.
  private sightingsSeen = new Set<string>(); // "viewerId|seenId"
  private sightingsByViewer = new Map<string, number>();
  private lastSightingScanAt = 0;
  // crossing_latency (blueprint VIII.11): ms from first being seen by this room to the FIRST
  // ever sail-out — novelty-approach-vs-avoidance at the scale of a life. Keyed by refId so it
  // survives reconnects (process-lifetime; the zero-key bound).
  private firstSeenAt = new Map<string, number>();
  private hasCrossed = new Set<string>();

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
    if (!this.firstSeenAt.has(e.refId)) this.firstSeenAt.set(e.refId, Date.now());

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

    // Board the raft you built / haul it ashore.
    this.onMessage(C2S.SET_SAIL, (client, msg: { on?: boolean; sea?: number }) => {
      const e = this.state.entities.get(client.sessionId);
      if (!e) return;
      const on = !!msg?.on;
      // You can only HAUL ASHORE on land — anchoring mid-sea would strand you (water blocks on foot).
      // Land includes the beach ring (same pad as the movement barrier), so hauling out at the shore works.
      if (!on && !oceanLandAt(e.x, e.y, OCEAN_BEACH_W)) return;
      if (on) {
        // The raft's worth is fixed at the moment it is pushed in. Everything downstream (reach, hull
        // speed, how fast it ages) is derived from it here, on the server, and never raised again.
        // NOTE (client-first slice): the build itself still runs client-side, so `sea` is trusted here.
        // Hardening it — driftwood as room state, server-clocked work time — is the next step; the
        // PHYSICS below is already authoritative, which is what stops the client from simply sailing on.
        const s0 = Math.max(0, Math.min(1, Number(msg?.sea) || 0));
        e.raftS0 = s0;
        e.raftWaterTiles = 0;
        this.beginCrossing(e);
      }
      e.sailing = on;
    });
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
    // Validate a sane slot: a safe non-negative integer within a generous cap. (An astronomic but
    // finite index would overflow theta=dest·GOLDEN_ANGLE in islandSlot → cos(∞)=NaN → a NaN avatar
    // position written to synced state. The cap dwarfs the 100 slots + any lazy expansion.)
    if (!e || !Number.isSafeInteger(dest) || dest < 0 || dest > OCEAN.SIZE * 1000) return;

    // Rate-limit: a hop emits a measured cue; never trust the client's own pacing.
    const now = Date.now();
    if (now - e.lastTravelAt < MIN_TRAVEL_INTERVAL_MS) return;
    e.lastTravelAt = now;

    // Teleporting away must tear down any open conversation (an NPC chat is not distance-gated and
    // would otherwise strand a live interaction with a now-far NPC). Mirrors the onLeave teardown.
    for (const [iid, it] of this.interactions) {
      if (it.initiatorEntityId === e.id || it.partnerEntityId === e.id) this.closeInteraction(iid, "left");
    }

    const sessionId = this.clientSessions.get(e.id) ?? e.id;
    // far-vs-near from slot geometry: a long ocean hop from home reads as novelty/risk. With NO known
    // home (offline assign-fetch failed → homeSlot=-1, the zero-key fallback) we cannot measure the
    // hop, so we must NOT fabricate a novelty-seeking read: default to the conventional `travel_near`
    // (hop 0) rather than Infinity, which would mislabel even the player's "near shore" pick as far.
    const knownHome = e.homeSlot >= 0;
    const hop = knownHome ? slotDistance(e.homeSlot, dest) : 0;
    const far = knownHome && hop > OCEAN.SPACING * 4; // ≈ 4+ slot-spacings out = a distant, non-adjacent shore
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

    // Arrive at the destination island's ocean coordinate in the shared room.
    const arrive = this.spawnForSlot(dest);

    // P4: the empty-vs-peopled contrast (blueprint VIII.2 — the cleanest openness-vs-warmth
    // disambiguator). The server counts, authoritatively, who is already at the destination:
    // sailing to a BARE island reads novelty; sailing to a peopled one reads sociality. The
    // count rides raw_signals; the P5 re-anchor separates the two loadings.
    const destOccupants = [...this.state.entities.values()].filter(
      (o) => o.id !== e.id && tileDistance(o.x, o.y, arrive.x, arrive.y) <= OCEAN_ISLAND_R + 2,
    ).length;

    const travelRaw: Record<string, number> = {
      distance: Number.isFinite(hop) ? Number(hop.toFixed(2)) : 0,
      amount: dest,
      dest_occupants: destOccupants,
    };
    // crossing_latency (VIII.11): the FIRST ever sail-out, measured from first being seen —
    // one scalar capturing novelty-approach-vs-avoidance at the scale of a life.
    if (!this.hasCrossed.has(e.refId)) {
      this.hasCrossed.add(e.refId);
      const t0 = this.firstSeenAt.get(e.refId);
      if (t0) travelRaw.crossing_latency_ms = now - t0;
    }

    if (msg.prepared) emit("prepare_before_travel");
    emit(far ? "travel_far" : "travel_near", travelRaw);
    e.x = arrive.x;
    e.y = arrive.y;
    e.dir = { x: 0, y: 0 };
    e.moving = false;
    e.lastSeen = Date.now();
    // The stand carried you AND your raft to a new shore. Re-anchor the crossing here, or the current
    // would still be measuring you against the beach you shoved off from — hundreds of tiles away — and
    // would sweep you straight back out across the ocean the moment you touched the water.
    if (e.sailing) this.beginCrossing(e);
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

    // Persist the exchange (fire-and-forget; never blocks the turn). Echo-drafted turns
    // (viaEcho) are the AGENT's acts, not the person's — never written into the human's
    // posterior via the /observe path (P6 measurement hygiene; the veto is their signal).
    if (userId && !msg.viaEcho) {
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
    // Echo-drafted turns are the AGENT's acts — skip logInteraction so the echo's words
    // are never attributed to the human sender (matches the NPC path at :592).
    if (!msg.viaEcho) {
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
    // P3 (event-schema Rule 3): every dyadic turn produces a PER-ACTOR row from BOTH vantages —
    // the sender's dialogue_turn carries the implicit micro-timing (C1 latency, B3 edits); the
    // recipient's receives_turn records being addressed, the substrate for the K1 refusal twin
    // at close. Human-typed turns only: an echo-drafted turn is the AGENT's act, never written
    // into a human's posterior. Same self-contact guard as emitFirstContact (two tabs, one user).
    if (sender.refId !== partner.refId && !msg.viaEcho) {
      const audience = this.audienceAround(sender.id, partner.id);
      void observeBehavioral(
        buildSocialEvent({
          actorId: sender.refId,
          sessionId: this.clientSessions.get(sender.id) ?? sender.id,
          action: "dialogue_turn",
          counterpartId: partner.refId,
          counterpartStatus: "peer",
          targetKind: "player",
          audienceSize: audience,
          raw: { latency_ms: msg.latencyMs, edits: msg.editsCount, amount: msg.text.length },
        }),
      );
      void observeBehavioral(
        buildSocialEvent({
          actorId: partner.refId,
          sessionId: this.clientSessions.get(partner.id) ?? partner.id,
          action: "receives_turn",
          counterpartId: sender.refId,
          counterpartStatus: "peer",
          targetKind: "player",
          audienceSize: audience,
          raw: { amount: msg.text.length },
        }),
      );
    }
  }

  /** Other live players who could observe this dyad (excludes the two participants). */
  private audienceAround(aId: string, bId: string): number {
    return [...this.state.entities.values()].filter(
      (e) => e.kind === "user" && e.id !== aId && e.id !== bId,
    ).length;
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
      // P3: the K1 refusal twin (cue-catalog K1 — "declines social bid"). If one side spoke and
      // the other never answered across the whole interaction, the silent side's non-action is
      // first-class data from THEIR vantage (Law 2: read, never penalized).
      const a = this.state.entities.get(it.initiatorEntityId);
      const b = this.state.entities.get(it.partnerEntityId);
      if (a && b && a.refId !== b.refId && it.history.length > 0) {
        for (const [silent, speaker] of [[a, b], [b, a]] as const) {
          const spoke = (it.lastTurnAt[silent.id] ?? 0) > 0;
          const otherSpoke = (it.lastTurnAt[speaker.id] ?? 0) > 0;
          if (!spoke && otherSpoke) {
            void observeBehavioral(
              buildSocialEvent({
                actorId: silent.refId,
                sessionId: this.clientSessions.get(silent.id) ?? silent.id,
                action: "declines_to_engage",
                counterpartId: speaker.refId,
                counterpartStatus: "peer",
                targetKind: "player",
                audienceSize: this.audienceAround(silent.id, speaker.id),
                raw: { dwell_ms: Date.now() - it.startedAt },
              }),
            );
          }
        }
      }
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
    this.scanSightings(now);
  }

  /**
   * The Stage-2 SIGHTING (P4 / storyboard VI.A 6:00): a far, sharp, ANONYMOUS figure first
   * becomes visible across the water. Fires ONCE per (viewer, seen) pair, for BOTH viewers,
   * as a SOLITARY cue (audience 0, no counterpart — the figure is anonymous at that tier, so
   * there is nothing social about it yet; naming/social begin only at CLOSE). Throttled scan,
   * capped per viewer so a crowded ocean can't flood the channel.
   */
  private scanSightings(now: number) {
    if (now - this.lastSightingScanAt < 2000) return;
    this.lastSightingScanAt = now;
    const egg = FLOW0_EGGS.find((g) => g.id === "egg_horizon")!;
    const users = [...this.state.entities.values()].filter((e) => e.kind === "user");
    for (const viewer of users) {
      if ((this.sightingsByViewer.get(viewer.id) ?? 0) >= 6) continue;
      for (const seen of users) {
        if (seen.id === viewer.id || seen.refId === viewer.refId) continue;
        const key = `${viewer.id}|${seen.id}`;
        if (this.sightingsSeen.has(key)) continue;
        const d = tileDistance(viewer.x, viewer.y, seen.x, seen.y);
        if (d > PRESENCE.APPROACH && d <= PRESENCE.HORIZON) {
          this.sightingsSeen.add(key);
          this.sightingsByViewer.set(viewer.id, (this.sightingsByViewer.get(viewer.id) ?? 0) + 1);
          void observeBehavioral(
            buildFlow0Event({
              actorId: viewer.refId,
              sessionId: this.clientSessions.get(viewer.id) ?? viewer.id,
              channel: egg.channel,
              cue: egg.cue,
              action: egg.action, // egg_horizon_seen — I3 novelty / openness (⚑ until P5)
              targetId: "horizon_figure",
              targetKind: "place",
              raw: { distance: Number(d.toFixed(1)) },
            }),
          );
        }
      }
    }
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

  /** Begin (or restart) a crossing: the shore you shove off from is the shore the current will carry you
   *  back to, and your reach is recomputed from how worn the raft is by now. Called on launch and on every
   *  landfall — so reach is a budget PER CROSSING. A scrap raft island-hops the archipelago one neighbour
   *  at a time; a true raft goes straight out to a far shore. Both arrive. One takes an afternoon. */
  private beginCrossing(e: Entity) {
    e.raftSea = effectiveSeaworthiness(e.raftS0, e.raftWaterTiles);
    e.raftReach = reachTiles(e.raftSea);
    e.raftSpent = 0;
    e.raftDepartX = e.x;
    e.raftDepartY = e.y;
  }

  private integrate(e: Entity, dt: number, speed: number) {
    const px = e.x;
    const py = e.y;
    // ── the sea acts on you whether or not you are paddling, so this runs BEFORE the idle early-out:
    //    stop rowing past your reach and the current simply takes you home. ──
    const sailing = e.kind === "user" && e.sailing;
    const afloat = sailing && !oceanLandAt(e.x, e.y, OCEAN_BEACH_W);
    if (sailing) {
      if (!afloat) {
        // Landfall — the crossing is over. Everything the raft has carried you AGES it (this is the
        // "durability lasts longer" the better build buys), and the next crossing is measured afresh
        // from this new shore. So reach is a budget PER CROSSING, not a fuel tank that empties forever:
        // a scrap raft island-hops one neighbour at a time and still gets everywhere.
        if (e.raftSpent > 0 || e.raftDepartX !== e.x || e.raftDepartY !== e.y) this.beginCrossing(e);
      } else {
        const drift = driftVector(e.x, e.y, e.raftDepartX, e.raftDepartY, e.raftSpent, e.raftReach);
        if (drift.x || drift.y) {
          // While sailing every tile is passable, so the current can only ever carry you back onto a
          // beach — which IS the recovery. It never sinks you, never seizes the keys, and never clears
          // `sailing` out from under you mid-ocean (that would brick you: water blocks on foot).
          const c = clampToMap(e.x + drift.x * dt, e.y + drift.y * dt);
          e.x = c.x;
          e.y = c.y;
        }
        // A raft is not a pair of legs: a true raft is quick, a scrap raft wallows. This is a property of
        // being AFLOAT, not of owning a raft — applying it ashore too would have every player who beached
        // a raft walking the island at the wrong speed until they thought to haul it out.
        speed = hullSpeed(e.raftSea);
      }
    }

    if (e.dir.x !== 0 || e.dir.y !== 0) {
      // Normalize diagonal so movement speed is constant in all directions.
      const len = Math.hypot(e.dir.x, e.dir.y) || 1;
      const nx = e.x + (e.dir.x / len) * speed * dt;
      const ny = e.y + (e.dir.y / len) * speed * dt;
      // AUTHORITATIVE water barrier: the open sea blocks movement unless this entity is sailing.
      // Per-axis so you slide along a coastline instead of sticking. This is what makes each island a
      // real bounded space and confines NPCs to their own island — the server, not just the client.
      // Walkable land includes the SAND RING (pad = OCEAN_BEACH_W): the beach is land you can stand on,
      // and — critically — this matches EXACTLY the land the client renders + predicts against (the
      // collision array / oceanLandAt with the same pad), so the authority and the prediction agree at
      // the shoreline and there is no reconcile snap-back / rebound when you walk into the sea edge.
      const c = clampToMap(nx, ny);
      const passable = (x: number, y: number) => e.sailing || oceanLandAt(x, y, OCEAN_BEACH_W);
      if (passable(c.x, e.y)) e.x = c.x;
      if (passable(e.x, c.y)) e.y = c.y;
      e.moving = true;
      e.lastSeen = Date.now();
    } else {
      // The current may still have displaced us while we sat idle — that is movement, and remote clients
      // key the walk cycle off this flag, so a drifting player must not read as standing perfectly still.
      const drifted = Math.hypot(e.x - px, e.y - py) > 1e-4;
      e.moving = drifted;
      if (drifted) e.lastSeen = Date.now();
    }

    // ── raft accounting, after everything that could have moved this entity ──
    if (sailing && !oceanLandAt(e.x, e.y, OCEAN_BEACH_W)) {
      // WEAR is the real path travelled over open water: it is what ages the raft, lifetime.
      e.raftWaterTiles += Math.hypot(e.x - px, e.y - py);
      // REACH is spent RADIALLY — how far from the shore you shoved off from you have got. Deliberately
      // not path length: with path length, a player who sailed 50 tiles out and turned for home would hit
      // their limit halfway BACK and be fought by the current all the way in, which is exactly backwards.
      // Radial means the sea holds you at arm's length from your departure and always lets you return.
      e.raftSpent = Math.hypot(e.x - e.raftDepartX, e.y - e.raftDepartY);
    }
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
    // The shared commons (F3 clearing + the stands) lives on the "far gathering" island (slot 60) —
    // a real landmass players SAIL to (the travel stand's far-gathering destination + manual sail),
    // away from the low-slot cluster where new players wake solitary. Centre the stations on it.
    const commons = oceanIslandCenter(60);
    const cx = Math.round(commons.x);
    const cy = Math.round(commons.y);
    // Each Stand = a role'd station NPC you walk up to (no separate screen), skinned by a bible PNG
    // (`sprite`), emitting per-actor cues for its role. The market is FOLDED into this same primitive
    // (the trader = bargain, the keeper = courtesy-to-low-status); food + workplace are the new Stands.
    const stations: { id: string; name: string; role: string; status: string; sprite: string; dx: number; dy: number }[] = [
      { id: "stn_server", name: "the keeper of the stall", role: "service", status: "low", sprite: "proc:stall_keeper", dx: -3, dy: 1 },
      { id: "stn_elder", name: "the elder", role: "elder", status: "high", sprite: "proc:elder", dx: 3, dy: 1 },
      { id: "stn_queue", name: "the line at the well", role: "queue", status: "peer", sprite: "", dx: 0, dy: 3 },
      { id: "stn_group", name: "a knot of talkers", role: "group", status: "peer", sprite: "proc:group_npcs", dx: -2, dy: -3 },
      { id: "stn_marginal", name: "the one apart", role: "marginal", status: "low", sprite: "proc:marginal_npc", dx: 5, dy: -2 },
      // market (folded): the trader is the bargain/trade Stand — same primitive as the others.
      { id: "stn_trader", name: "the trader", role: "trader", status: "peer", sprite: "proc:trader", dx: 1, dy: -1 },
      // the travel stand — a ferry/harbour at the water's edge; the co-presence amplifier that
      // carries a player to far, non-adjacent islands (and other players' regions).
      { id: "stn_travel", name: "the ferry stand", role: "travel", status: "none", sprite: "proc:travel_stand", dx: 0, dy: 8 },
      // ── Part 2 stands ── food (F3/F4/F6 — eat / treat / host) and workplace (F1/F5 — work /
      //    vocation; placed here in the shared clearing until the F1/F5 vocation zone is built).
      { id: "stn_food", name: "the cookfire stall", role: "food", status: "peer", sprite: "proc:food_stand", dx: -5, dy: 4 },
      { id: "stn_workplace", name: "the workshop", role: "workplace", status: "none", sprite: "proc:workplace_stand", dx: 5, dy: 5 },
    ];
    for (const s of stations) {
      const e = new Entity();
      e.id = s.id;
      e.kind = "npc";
      e.refId = s.id;
      e.name = s.name;
      e.spriteUrl = s.sprite;
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
    const npcs = loadNpcs();
    npcs.forEach((spec, i) => {
      const e = new Entity();
      e.id = spec.id;
      e.kind = "npc";
      e.refId = spec.id;
      e.name = spec.name;
      e.spriteUrl = spec.spriteUrl ?? "";
      // Place each NPC ON an island (their old seed coords were for the 64-tile map = now open sea).
      // Use the OUTER slots (30..99) so the low-slot cluster where new players wake stays solitary;
      // the population lives on the further islands (distant silhouettes you can sail out to meet).
      const c = oceanIslandCenter(30 + (i % 70));
      const a = (i * 2.39996) % (Math.PI * 2);
      const r = 2 + (i % 4); // a little spread within the island (radius 10), well clear of water
      const hx = c.x + Math.cos(a) * r;
      const hy = c.y + Math.sin(a) * r;
      e.x = hx;
      e.y = hy;
      e.homeX = hx;
      e.homeY = hy;
      e.wanderTargetX = hx;
      e.wanderTargetY = hy;
      e.facing = "down";
      e.nextWanderAt = 0;
      this.state.entities.set(e.id, e);
    });
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
