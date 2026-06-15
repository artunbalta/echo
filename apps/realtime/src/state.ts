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

  // ── server-only fields (not synced) ──
  dir = { x: 0, y: 0 };
  lastSeen = 0;
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
