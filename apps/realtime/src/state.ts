/**
 * Authoritative room state, synced to every client by Colyseus. The server mutates
 * these objects on each tick; the client receives deltas and interpolates.
 */
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Entity extends Schema {
  @type("string") id = "";
  @type("string") kind: "user" | "npc" = "user";
  /**
   * The canonical subject this entity acts as — a user's id, or an NPC's spec id.
   *
   * **NOT SYNCED, DELIBERATELY, AND THE MISSING DECORATOR IS THE POINT (⚑27, SOC-2.E).** This field
   * used to carry `@type("string")`, so every connected client received every other player's
   * canonical user id — and that id is the whole credential for reading their posterior, reading
   * their raw behavioural rows, and erasing them. Nobody had to guess or spoof anything; standing
   * near someone handed it to you. Authenticating those routes while broadcasting their key would
   * have been half a fix.
   *
   * The server still needs it, and keeps it: every behavioural emission in `WorldRoom` is attributed
   * to `refId`, and it stays exactly what it was. It simply stops leaving the process.
   */
  refId = "";
  /**
   * What a client is allowed to know about who this is: an NPC's id, or "" for a person.
   *
   * A person is identified across the wire by `id` — Colyseus's own `sessionId`, which is
   * server-minted, opaque, and scoped to this room. That is the handle the client uses for approach
   * and dwell targets, and it says "the same someone" without saying who.
   */
  @type("string") publicRef = "";
  @type("string") name = "";
  @type("string") spriteUrl = "";
  /** Position in tile units (fractional while moving). */
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") facing = "down";
  @type("boolean") moving = false;
  /** Last processed client input seq — clients use this to reconcile prediction. */
  @type("number") lastSeq = 0;
  /** Sailing: when true the open sea is traversable (you've boarded a raft). Synced so remote
   *  clients can render a boat under a sailing player. Off = the sea is a wall (you're on foot). */
  @type("boolean") sailing = false;
  /** ── the raft you built (§FLOW 1). Effort → reach: how much open water this raft can put behind it
   *  before the sea starts pushing back. Synced so a remote client can render the right raft under you. ──
   *  `raftSea` is the AGED seaworthiness (0..1) — what the build was worth, worn down by every tile it has
   *  already carried you. `raftSpent` is open water crossed since you last made landfall; when it passes
   *  the reach, the current starts walking you back toward `raftDepart`. Nothing here is ever shown to the
   *  player as a number: they see a raft, an ocean, and whether they are making headway. */
  @type("number") raftSea = 0;
  @type("number") raftReach = 0;
  @type("number") raftDepartX = 0;
  @type("number") raftDepartY = 0;
  /** Flow 3 clearing station role (service/elder/queue/group/marginal/trader) — "" for ordinary
   *  wander NPCs and users. The client reads it to surface the right station action menu. */
  @type("string") role = "";
  /** Counterpart status FROM a player's vantage (low/high/peer) — set on station NPCs so the
   *  server can stamp counterpart_status authoritatively on social events. */
  @type("string") status = "none";

  // ── server-only fields (not synced) ──
  dir = { x: 0, y: 0 };
  lastSeen = 0;
  /** The archipelago slot this user owns (their home island), carried at join. −1 = unknown.
   *  Used by the travel stand to read far-vs-near (the novelty/risk cue) from slot geometry. */
  homeSlot = -1;
  /** Server-side rate-limit clock for the travel stand (a heavyweight hop emits a measured cue;
   *  bound floods from a modified client, mirroring the peer-chat MIN_PEER_TURN_INTERVAL_MS). */
  lastTravelAt = 0;
  /** Server-only raft accounting. `raftS0` is the raft's ORIGINAL seaworthiness as built (raftSea is that
   *  value aged); `raftWaterTiles` is the lifetime open water it has crossed, which is what ages it.
   *  `raftSpent` is how far you have got from `raftDepart` — deliberately NOT synced: it is rewritten on
   *  every tick of every voyage, and the client already derives the identical value from its own predicted
   *  position (PixiWorld.stepLocal), so syncing it would broadcast a 20 Hz delta to a 150-player room for
   *  a number nobody reads. */
  raftS0 = 0;
  raftWaterTiles = 0;
  raftSpent = 0;
  // NPC movement scratch
  wanderTargetX = 0;
  wanderTargetY = 0;
  nextWanderAt = 0;
  homeX = 0;
  homeY = 0;
}

export class WorldState extends Schema {
  @type("string") worldId = "";
  @type({ map: Entity }) entities = new MapSchema<Entity>();
  @type("number") tick = 0;
}
