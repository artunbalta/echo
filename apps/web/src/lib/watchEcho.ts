/**
 * Watching your own echo from outside while it keeps your body in a village room (DECISIONS C105).
 *
 * The page comes into the room with `watch: true` and no body: nothing is synced about it, nobody in the
 * room is told, and the echo is not. It reads every body in the room as the room page does
 * (`readBodies`), is told what the echo has met so far and each moment as it is met, and is told when the
 * watching is over (its person came back to the body, or its time ran out).
 *
 * WHAT IS SAID TO IT (C107). A line someone in the room says to the body is shown here as it is said, and
 * kept nowhere. What the echo says back, where it has earned talking (C109), comes in what it did (`log`,
 * a `talk` entry); where it is close and not yet there, the line it would say comes here (`would`) and is
 * said only if the person presses "Say it" (`sayIt`) in time.
 *
 * WHAT IT SENDS: the question of which body it is watching, a fresh brief when the person says "that was
 * not me" of something (`sendWatchBrief`), and "Say it" of a line the echo would say.
 */
import { Client, type Room } from "colyseus.js";
import { useSyncExternalStore } from "react";
import {
  VILLAGE_C2S,
  VILLAGE_ROOM,
  VILLAGE_S2C,
  normalizeRoomCode,
  type AwayEntry,
  type HeardMsg,
  type MetMsg,
  type PoseMsg,
  type SaidMsg,
  type WatchEndMsg,
  type WatchMsg,
  type WouldMsg,
} from "@echo/shared";

import type { OthersSource } from "@/game/world/othersLayer";

import { config } from "./config";
import { ensureIdentity, identityToken } from "./identity";
import { readBodies, roomable, type Other } from "./villageRoom";

export type WatchStatus = "idle" | "joining" | "watching" | "none" | "ended" | "offline";

export interface WatchView {
  status: WatchStatus;
  /** The body watched, and the seed of its look, which the page names it by (C107). */
  id: string | null;
  seed: string | null;
  since: number;
  until: number;
  /** Every moment it has met, in the order met. */
  log: AwayEntry[];
  /** What was said to the body while it is watched, and by whom (a room handle), in the order said (C107). */
  said: HeardMsg[];
  /** Lines it would say and has not, each until its time runs out or it is said (C109). */
  would: WouldMsg[];
  /** Why the watching ended. */
  ended: WatchEndMsg["reason"] | null;
}

const IDLE: WatchView = { status: "idle", id: null, seed: null, since: 0, until: 0, log: [], said: [], would: [], ended: null };
/** No body of this page's own: a handle that is nobody's, so every body in the room is drawn. */
const NOBODY = "\u0000watching";

let view: WatchView = IDLE;
let room: Room | null = null;
let cellNow: string | null = null;
let attempt = 0;
const bodies = new Map<string, Other>();
const subs = new Set<() => void>();
const set = (next: Partial<WatchView>) => {
  view = { ...view, ...next };
  subs.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};

export const watchView = (): WatchView => view;
export const useWatchView = (): WatchView => useSyncExternalStore(subscribe, watchView, () => IDLE);

/** Come in to watch your echo in room `code` of village `cell`. */
export async function startWatching(cell: string, code: string): Promise<void> {
  const c = normalizeRoomCode(code);
  if (!roomable(cell) || !c) {
    set({ ...IDLE, status: "none" });
    return;
  }
  stopWatching();
  const mine = ++attempt;
  set({ ...IDLE, status: "joining" });
  try {
    const userId = await ensureIdentity();
    const r = await new Client(config.realtimeUrl).join(VILLAGE_ROOM, { cell, code: c, watch: true, userId, token: identityToken() });
    if (mine !== attempt) {
      void r.leave(true);
      return;
    }
    room = r;
    cellNow = cell;
    bodies.clear();
    r.onStateChange((s: any) => {
      readBodies(s, bodies, NOBODY);
      const seed = view.id ? (bodies.get(view.id)?.lookSeed ?? null) : null;
      if (seed !== view.seed) set({ seed });
    });
    r.onMessage(VILLAGE_S2C.WATCH, (m: WatchMsg) => set({ status: "watching", id: m.id, seed: bodies.get(m.id)?.lookSeed ?? null, since: m.since, until: m.until, log: m.log }));
    r.onMessage(VILLAGE_S2C.MET, (m: MetMsg) => set({ log: [...view.log, ...m.entries] }));
    r.onMessage(VILLAGE_S2C.HEARD, (m: HeardMsg) => {
      if (typeof m?.text === "string" && typeof m.from === "string") set({ said: [...view.said, m].slice(-20) });
    });
    r.onMessage(VILLAGE_S2C.WOULD, (m: WouldMsg) => {
      if (typeof m?.id === "string" && typeof m.text === "string") set({ would: [...view.would.filter((w) => w.until > Date.now()), m].slice(-6) });
    });
    r.onMessage(VILLAGE_S2C.WATCH_END, (m: WatchEndMsg) => {
      set({ status: "ended", ended: m.reason });
      if (room === r) {
        room = null;
        void r.leave(true).catch(() => {});
      }
    });
    r.onLeave(() => {
      if (room !== r) return;
      room = null;
      if (view.status === "watching" || view.status === "joining") set({ status: "offline" });
    });
    r.send(VILLAGE_C2S.WHO);
  } catch (e) {
    if (mine !== attempt) return;
    // No room by that code, or nothing of yours being kept in it.
    const text = e instanceof Error ? e.message : String(e ?? "");
    set({ ...IDLE, status: /nothing_to_watch|no rooms found|not found/i.test(text) ? "none" : "offline" });
  }
}

export function stopWatching(): void {
  attempt++;
  const r = room;
  room = null;
  cellNow = null;
  bodies.clear();
  if (r) void r.leave(true).catch(() => {});
  if (view.status !== "idle") set({ ...IDLE });
}

/** The brief the echo acts by from now, handed in from outside (after a "that was not me"). */
export function sendWatchBrief(token: string | null): void {
  if (room && view.status === "watching") room.send(VILLAGE_C2S.BRIEF, { token });
}

/** "Say it" of a line the echo would say (C109): the room says it if it is still in time. */
export function sayIt(id: string): void {
  if (room && view.status === "watching") room.send(VILLAGE_C2S.SAY_IT, { id });
  set({ would: view.would.filter((w) => w.id !== id) });
}

/** The look's seed of someone in the room, by their handle: the page names them by it (C107). */
export const watchedSeedOf = (id: string): string | null => bodies.get(id)?.lookSeed ?? null;

/** Where the watched body is drawn now, planet-local metres; null before it is known. */
export function watchedAt(now: number): { x: number; y: number; yaw: number } | null {
  const o = view.id ? bodies.get(view.id) : undefined;
  const s = o?.here ? o.track.at(now) : null;
  return s ? { x: s.x, y: s.y, yaw: s.yaw } : null;
}

/** The room's bodies, as the others layer draws them: every one, since this page has none of its own. */
export const WATCH_SOURCE: OthersSource = {
  cell: () => (view.status === "watching" ? cellNow : null),
  self: () => (view.status === "watching" ? NOBODY : null),
  others: () => bodies,
  sendPose: (_p: PoseMsg) => undefined,
  away: () => undefined,
  onSaid: (_fn: (m: SaidMsg) => void) => () => undefined,
};
