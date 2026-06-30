/**
 * Authoritative room state, synced to every client by Colyseus. The server mutates
 * these objects on each tick; the client receives deltas and interpolates.
 */
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Entity extends Schema {
  @type("string") id = "";
  @type("string") kind: "user" | "npc" = "user";
  @type("string") refId = "";
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
