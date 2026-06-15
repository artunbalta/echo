/**
 * Colyseus network client. Owns the room connection and exposes a small typed API to
 * the renderer. Tracks the authoritative entity snapshots; the renderer applies
 * client-side prediction for the local player and interpolation for remote entities.
 */
import { Client, type Room } from "colyseus.js";
import {
  C2S,
  S2C,
  type EntitySnapshot,
  type MoveIntent,
  type WelcomePayload,
  type InteractTurnPayload,
  type Facing,
  type TelemetryEvent,
} from "@echo/shared";

export interface NetCallbacks {
  onWelcome?: (w: WelcomePayload) => void;
  onSnapshot?: (entities: Map<string, EntitySnapshot>, serverTick: number) => void;
  onInteractOpened?: (p: { interactionId: string; target: { id: string; name: string; kind: string } }) => void;
  onInteractTurn?: (p: InteractTurnPayload) => void;
  onInteractClosed?: (p: { interactionId: string; reason: string }) => void;
  onError?: (p: { code: string; message: string }) => void;
}

export class NetClient {
  private client: Client;
  private room: Room | null = null;
  selfId = "";
  private cbs: NetCallbacks = {};

  constructor(url: string) {
    this.client = new Client(url);
  }

  on(cbs: NetCallbacks) {
    this.cbs = cbs;
  }

  private reconnecting = false;
  private left = false;

  async connect(opts: { userId: string; name: string; spriteUrl: string; sessionId: string }) {
    this.room = await this.client.joinOrCreate("world", opts);
    this.selfId = this.room.sessionId;
    this.bindRoom();
    return this.room;
  }

  private bindRoom() {
    const room = this.room!;
    this.selfId = room.sessionId;

    room.onMessage(S2C.WELCOME, (w: WelcomePayload) => this.cbs.onWelcome?.(w));
    room.onMessage(S2C.INTERACT_OPENED, (p: any) => this.cbs.onInteractOpened?.(p));
    room.onMessage(S2C.INTERACT_TURN, (p: InteractTurnPayload) => this.cbs.onInteractTurn?.(p));
    room.onMessage(S2C.INTERACT_CLOSED, (p: any) => this.cbs.onInteractClosed?.(p));
    room.onMessage(S2C.ERROR, (p: any) => this.cbs.onError?.(p));
    room.onMessage(S2C.PONG, () => {});

    // Colyseus state → plain snapshots each patch.
    room.onStateChange((state: any) => {
      const map = new Map<string, EntitySnapshot>();
      state.entities.forEach((e: any, id: string) => {
        map.set(id, {
          id,
          kind: e.kind,
          refId: e.refId,
          name: e.name,
          spriteUrl: e.spriteUrl,
          x: e.x,
          y: e.y,
          facing: e.facing as Facing,
          moving: e.moving,
        });
      });
      this.cbs.onSnapshot?.(map, state.tick);
    });

    // Reconnect on unexpected disconnect (code >= 1001), using the reconnection token
    // the server holds open for ~20s (WorldRoom.allowReconnection).
    room.onLeave((code: number) => {
      if (this.left || code === 1000) return; // intentional leave
      this.attemptReconnect();
    });
  }

  private async attemptReconnect(tries = 0) {
    if (this.left || this.reconnecting || tries >= 5) return;
    this.reconnecting = true;
    const token = (this.room as any)?.reconnectionToken;
    try {
      if (!token) throw new Error("no reconnection token");
      this.room = await this.client.reconnect(token);
      this.bindRoom();
      this.reconnecting = false;
      this.cbs.onError?.({ code: "reconnected", message: "Reconnected to the world." });
    } catch {
      this.reconnecting = false;
      setTimeout(() => this.attemptReconnect(tries + 1), 1500 * (tries + 1));
    }
  }

  /** Last processed input seq for the local player (for reconciliation). */
  lastAckSeq(): number {
    const e: any = this.room?.state?.entities?.get(this.selfId);
    return e?.lastSeq ?? 0;
  }

  sendMove(intent: MoveIntent) {
    this.room?.send(C2S.MOVE_INTENT, intent);
  }
  sendStop(seq: number) {
    this.room?.send(C2S.STOP, { seq });
  }
  sendTelemetry(events: TelemetryEvent[]) {
    this.room?.send(C2S.TELEMETRY, { events });
  }
  interactStart(targetId: string) {
    this.room?.send(C2S.INTERACT_START, { targetId });
  }
  interactEnd(interactionId: string) {
    this.room?.send(C2S.INTERACT_END, { interactionId });
  }
  chat(interactionId: string, text: string, latencyMs?: number, editsCount?: number) {
    this.room?.send(C2S.CHAT, { interactionId, text, latencyMs, editsCount });
  }

  leave() {
    this.left = true;
    this.room?.leave();
    this.room = null;
  }
}
