/**
 * A village room's state (DECISIONS C101), synced to everyone in the room by Colyseus.
 *
 * Only the people who came in through the door are here, and the bodies their echoes keep while they
 * are away (C104), which are the same bodies and look the same. The villagers are not: they are a
 * closed form of the seed and the clock, which every page computes for itself (C27), so a room never
 * moves one and never sends one.
 */
import { MapSchema, Schema, type } from "@colyseus/schema";
import type { StandInBrief } from "@echo/shared";

import { Trail, type EchoBody } from "./echoBody.js";

/** A body in the room. */
export class Walker extends Schema {
  /**
   * A room-scoped handle, opaque: the session id of the connection that first brought the body in. It
   * stays the body's while an echo keeps it and when its person comes back on a new connection, so nobody
   * sees a body go and another come where it stood.
   */
  @type("string") id = "";
  /**
   * How the body looks (`roomLookOf`): a digest, a sex, an age and a trade, as a villager's look is drawn.
   * It has no name here (C107): each page names it from the digest, in the village's tongue.
   */
  @type("string") lookSeed = "";
  @type("string") sex = "m";
  @type("number") age = 30;
  @type("string") trade = "labourer";
  /** Planet-local metres (east, north), and three's yaw. */
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") yaw = 0;
  /** Metres a second. */
  @type("number") speed = 0;
  @type("string") activity = "stand";
  /** In the village now: false until the first pose, and while their page is on another shore or out of the world. */
  @type("boolean") here = false;

  // ── server-only (no decorator, never synced) ──
  /** The subject `onAuth` derived. A credential (⚑27): it never leaves the process. */
  refId = "";
  /** When the last pose was taken, ms; 0 before the first. */
  poseAt = 0;
  sayAt = 0;
  /** Back at a body its echo kept: until when the page has to take its place at it, ms; 0 otherwise. */
  placeBy = 0;
  /** The person's own way, kept from their poses for their echo to walk (C104). */
  trail = new Trail();
  /** What their echo may keep the body by, as the web app signed it; null until their page sends one, and after a no. */
  brief: StandInBrief | null = null;
  /**
   * Who moves the body: null while its person does, their echo's keeping while they are away. Never
   * synced and never said: from outside, a body is a body.
   */
  echo: EchoBody | null = null;
}

export class VillageState extends Schema {
  /** Which village this is a copy of. */
  @type("string") cell = "";
  /** The code at the door. Everyone inside knows it already; it is how they asked the others in. */
  @type("string") code = "";
  @type({ map: Walker }) walkers = new MapSchema<Walker>();
}
