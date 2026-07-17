/**
 * Wire protocol between the PixiJS client and the Colyseus WorldRoom.
 *
 * Colyseus syncs room *state* automatically (see EntitySchema mirror in the realtime
 * app); these message types cover the imperative client→server intents and the
 * server→client events that aren't part of continuous state.
 */
import type { Facing } from "./world.js";
import type { TelemetryEvent } from "./telemetry.js";

/** Client → server message names. */
export const C2S = {
  MOVE_INTENT: "move_intent",
  STOP: "stop",
  TELEMETRY: "telemetry",
  INTERACT_START: "interact_start",
  INTERACT_END: "interact_end",
  CHAT: "chat",
  PING: "ping",
  /** A Flow 2/3 social choice (opener register, turn dynamic, cold-response reaction, or a clearing
   *  station action). The client reports WHICH choice the player made on/near a target; the
   *  authoritative server stamps the mandatory context (counterpart_status, audience, distance,
   *  stage) and emits ONE per-actor BehavioralEvent to /observe/behavioral (social.ts). */
  SOCIAL_CUE: "social_cue",
  /** Use the travel stand: sail/fly to a destination archipelago slot (incl. NON-adjacent / far
   *  clusters). The server moves the actor to that island's ocean coordinate in the shared room
   *  (co-presence amplifier — reach far communities) and emits the per-actor travel cue. */
  TRAVEL: "travel",
  /** Board the raft you built / haul it ashore: toggle whether the open sea is traversable. Off (default)
   *  = the sea is a wall and you're confined to your island on foot. Boarding carries `sea` (0..1) — what
   *  the build was worth — which sets how far the raft will take you before the current turns you back.
   *  There is no message that RAISES a raft's reach: it is fixed at the moment you push it in. */
  SET_SAIL: "set_sail",
} as const;

/** Server → client message names. */
export const S2C = {
  WELCOME: "welcome",
  INTERACT_OPENED: "interact_opened",
  INTERACT_TURN: "interact_turn", // an NPC/agent reply OR a relayed turn from another live player
  INTERACT_CLOSED: "interact_closed",
  PONG: "pong",
  ERROR: "error",
} as const;

/** A directional movement intent. Server is authoritative; client predicts. */
export interface MoveIntent {
  dir: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
  facing: Facing;
  /** Monotonic client sequence number for reconciliation. */
  seq: number;
}

export interface ChatMessage {
  interactionId: string;
  text: string;
  /** ms from when the input was focused to send — a latency telemetry signal. */
  latencyMs?: number;
  editsCount?: number;
  /** Player↔player only: this turn was drafted by the sender's echo, not typed by hand.
   *  Lets the recipient render it as "their echo" and lets two earned echoes converse. */
  viaEcho?: boolean;
}

/** A Flow 2/3 social choice. `action` is a key in social.ts SOCIAL_CUES; `targetId` is the
 *  counterpart entity (a live player, or a clearing station NPC). Reply-composition meta-cues ride
 *  along as implicit signals where the client captured them. */
export interface SocialCueMsg {
  targetId: string;
  action: string;
  latencyMs?: number;
  editsCount?: number;
}

/** Travel-stand request: go to `destinationSlot` (an archipelago slot index). `prepared` = the
 *  player gathered/planned before leaving (a conscientiousness cue). The server decides far-vs-near
 *  authoritatively from the slot geometry and emits the travel cue. */
export interface TravelMsg {
  destinationSlot: number;
  prepared?: boolean;
}

export interface WelcomePayload {
  entityId: string; // your session entity id in this room
  worldId: string;
  spawn: { x: number; y: number };
  serverTickHz: number;
}

export interface InteractTurnPayload {
  interactionId: string;
  /** `npc`/`agent` are server-authored; `peer`/`peer_echo` are relayed from another live
   *  player (peer_echo = their reply was drafted by their echo). */
  speaker: "npc" | "agent" | "peer" | "peer_echo";
  speakerName: string;
  text: string;
  audioUrl?: string;
  /** Optional "why it said that" transparency trace for agent turns (§10). */
  rationale?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export type TelemetryBatch = { events: TelemetryEvent[] };

/** The kind of an entity living in the room. */
export type EntityKind = "user" | "npc";

/** Plain (non-Colyseus) snapshot of an entity for client-side use. */
export interface EntitySnapshot {
  id: string;
  kind: EntityKind;
  refId: string; // user id or npc id
  name: string;
  spriteUrl: string;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** Flow 3 clearing station NPCs: their social station role (service/elder/queue/group/marginal/
   *  trader) and status (low/high/peer) so the client shows the right action menu. "" for ordinary
   *  entities. */
  role?: string;
  status?: string;
  /** Whether this entity is sailing (the open sea is traversable for them) — drives the client's
   *  movement prediction + a boat render. Authoritative: the server only lets you anchor on land. */
  sailing?: boolean;
  /** The raft under them (see raft.ts). `raftSea` = aged seaworthiness 0..1, `raftReach` = how far this
   *  raft goes before the sea pushes back, `raftDepart*` = the shore it shoved off from (where the current
   *  carries it home to). The client predicts the current from these so it never fights the server's
   *  correction. How far you have GOT from the departure is not carried: the client derives it from its
   *  own predicted position, so syncing it would be a 20 Hz delta nobody reads. */
  raftSea?: number;
  raftReach?: number;
  raftDepartX?: number;
  raftDepartY?: number;
}
