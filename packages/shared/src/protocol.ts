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
}
