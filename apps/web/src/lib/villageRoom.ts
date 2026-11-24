/**
 * Being in a village room from the page (DECISIONS C101): the connection, and what it knows of the others.
 *
 * ONE ROOM AT A TIME, FOR THE WHOLE PAGE. The panel that asks for a code, the layer that draws the
 * others and sends this body's pose, and the bar that says a line all read the same module, so there is
 * one connection and one answer to "who else is here" (the panels' own store works the same way).
 *
 * WHAT IS SENT: this body's pose ten times a second, the lines said to whoever is near, and the lines said
 * to one body (C107). What is kept about the others: their room handle and look, a second of their poses
 * to draw them between (`othersTrack.ts`), and for a minute and a half what each said to this body alone,
 * so a conversation opened on them a moment later begins with it. Nothing is written anywhere; leaving
 * forgets it all.
 *
 * NO NAME AT THE DOOR (C107). A body is named by the page from its look, in the village's own tongue, as a
 * villager is (`villagersLayer` `visitor`); the room carries no name, so nobody's name can say who they are.
 *
 * WHEN YOU LEAVE (C104). With a yes to your echo standing in (C103), the brief the web app signed for it
 * (`setStandInBrief`) is handed to the room, which keeps your body when you go. Coming back, the room says
 * which body is yours (it may be one your echo kept: same handle, somewhere else), this page takes its
 * place there (`takePlace`), and what your echo did meanwhile is kept for the door to show (`away`).
 *
 * BETWEEN PEOPLE AS WITH A VILLAGER (C110). An offer to someone at arm's length (a gift, a trade, an ask)
 * goes through the room to them alone (`offerTo`); an offer made to this body comes in (`onOffered`) and is
 * answered by `answerOffer`; how each ended, with this page's pack as it now is, comes to both (`onSettled`).
 *
 * WHO IS WATCHING is not something this module can tell anyone: it has no such notion.
 */
import { Client, type Room } from "colyseus.js";
import { useSyncExternalStore } from "react";
import {
  ROOM,
  ROOM_VILLAGES,
  STAND_IN,
  VILLAGE_C2S,
  VILLAGE_ROOM,
  VILLAGE_S2C,
  cleanSaid,
  normalizeRoomCode,
  type AnswerMsg,
  type AwayEntry,
  type OfferKind,
  type OfferMsg,
  type OfferedMsg,
  type PoseMsg,
  type SaidMsg,
  type SettledMsg,
  type WalkerActivity,
  type YouMsg,
} from "@echo/shared";

import { OthersTrack } from "@/game/world/othersTrack";

import { config } from "./config";
import { ensureIdentity, identityToken } from "./identity";

/** The address that names a room: `/parcel/<cell>?room=<code>`. */
export const ROOM_PARAM = "room";
/** The rooms this browser has been in, newest first (C102): a copy keeps its world, so it can be gone back to. */
export const ROOM_RECENT_KEY = "echo.room.recent";
const RECENT_MAX = 6;

export type RoomStatus = "solo" | "joining" | "in" | "lost";

export interface RoomView {
  status: RoomStatus;
  code: string | null;
  cell: string | null;
  /** People in the room, this page's own body included. */
  people: number;
  /** Why the last attempt to come in failed, as a key the panel can say: `full`, `refused`, `offline`. */
  error: string | null;
  /** What your echo did with your body while you were away (C104), until it has been read. */
  away: { since: number; until: number; log: AwayEntry[] } | null;
}

/** Someone else in the room, as the layer draws them. */
export interface Other {
  id: string;
  lookSeed: string;
  sex: "f" | "m";
  age: number;
  trade: string;
  here: boolean;
  track: OthersTrack;
}

const SOLO: RoomView = { status: "solo", code: null, cell: null, people: 0, error: null, away: null };

let view: RoomView = SOLO;
let room: Room | null = null;
let selfId: string | null = null;
/** Which attempt to come in is the live one: a join that finishes after a newer join or a leave goes again at once. */
let attempt = 0;
/** The brief your echo keeps your body by (C104), as the web app signed it; null without a yes. */
let brief: string | null = null;
/** Where this page's body stands, told by the room on coming back to a body its echo kept: taken once. */
let place: { x: number; y: number; yaw: number } | null = null;
/** How this page's own body looks in the room (C107): the door says who you are here. */
let selfLook: { seed: string; sex: "f" | "m"; age: number; trade: string } | null = null;
const others = new Map<string, Other>();
const saidSubs = new Set<(m: SaidMsg) => void>();
const toldSubs = new Set<(m: SaidMsg) => void>();
/** What each body said to this one alone (C107), for a while: a conversation opened on them begins with it. */
const toldBy = new Map<string, { text: string; at: number }[]>();
/** How long a line said to this body is kept for a conversation to begin with, ms. */
const TOLD_KEPT_MS = 90_000;
const subs = new Set<() => void>();

const set = (next: Partial<RoomView>) => {
  view = { ...view, ...next };
  subs.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};

export const roomView = (): RoomView => view;
export const useRoomView = (): RoomView => useSyncExternalStore(subscribe, roomView, () => SOLO);

/** May this cell be entered as a room at all. */
export const roomable = (cell: string): boolean => ROOM_VILLAGES.includes(cell);

/**
 * The village room whose world this page is in, for `cell` (C102): the code the address names, or null for
 * the open world. The address is the one place it is decided (the door writes it on coming in and clears
 * it on leaving), so a request, the village the page builds and a link sent to a friend all agree.
 */
export function worldRoom(cell: string): string | null {
  if (typeof window === "undefined" || !roomable(cell)) return null;
  return normalizeRoomCode(new URLSearchParams(window.location.search).get(ROOM_PARAM));
}

/** `cell=…` with `&room=…` when the page is in a room's world: the query a village route reads. */
export function worldQuery(cell: string): string {
  const room = worldRoom(cell);
  return `cell=${encodeURIComponent(cell)}${room ? `&room=${room}` : ""}`;
}

/** This page's own handle in the room, or null outside one. */
export const roomSelf = (): string | null => (view.status === "in" ? selfId : null);
/** The cell the room is a copy of, or null outside one. */
export const roomCell = (): string | null => (view.status === "in" ? view.cell : null);
export const roomOthers = (): ReadonlyMap<string, Other> => others;

/** Hear the lines said near this body. Returns the way to stop. */
export function onSaid(fn: (m: SaidMsg) => void): () => void {
  saidSubs.add(fn);
  return () => void saidSubs.delete(fn);
}

const offeredSubs = new Set<(m: OfferedMsg) => void>();
const settledSubs = new Set<(m: SettledMsg) => void>();

/** Hear the offers made to this body (C110). Returns the way to stop. */
export function onOffered(fn: (m: OfferedMsg) => void): () => void {
  offeredSubs.add(fn);
  return () => void offeredSubs.delete(fn);
}

/** Hear how offers made by or to this body ended (C110). Returns the way to stop. */
export function onSettled(fn: (m: SettledMsg) => void): () => void {
  settledSubs.add(fn);
  return () => void settledSubs.delete(fn);
}

/** Offer someone at arm's length what this body carries, or ask them for something (C110). False with no room to do it in. */
export function offerTo(to: string, kind: OfferKind, item: string | null): boolean {
  if (!room || view.status !== "in" || !others.has(to)) return false;
  room.send(VILLAGE_C2S.OFFER, { to, kind, item } satisfies OfferMsg);
  return true;
}

/** Answer an offer made to this body: no, or yes and what goes back (C110). */
export function answerOffer(id: string, yes: boolean, back: string | null): boolean {
  if (!room || view.status !== "in") return false;
  room.send(VILLAGE_C2S.ANSWER, { id, yes, back } satisfies AnswerMsg);
  return true;
}

/** The code of the room this page is in, or null outside one. */
export const roomCodeNow = (): string | null => (view.status === "in" ? view.code : null);

/** Hear the lines said to this body alone (C107). Returns the way to stop. */
export function onTold(fn: (m: SaidMsg) => void): () => void {
  toldSubs.add(fn);
  return () => void toldSubs.delete(fn);
}

/** What `id` has said to this body alone in the last minute and a half, oldest first. */
export function toldFrom(id: string, now = Date.now()): { text: string; at: number }[] {
  const lines = (toldBy.get(id) ?? []).filter((l) => now - l.at < TOLD_KEPT_MS);
  if (lines.length) toldBy.set(id, lines);
  else toldBy.delete(id);
  return lines;
}

/** How this page's own body looks in its room, or null outside one. */
export const roomSelfLook = (): { seed: string; sex: "f" | "m"; age: number; trade: string } | null => (view.status === "in" ? selfLook : null);

function errorOf(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e ?? "");
  if (/full|maxClients|locked/i.test(text)) return "full";
  if (/refused|bad_name|identity_/i.test(text)) return "refused";
  return "offline";
}

/**
 * Read a room's bodies into `into`, leaving out `self`: their handle and look, and the newest pose
 * on each one's track. Returns how many bodies there are, `self` included. The watching page reads a room
 * with this too (`watchEcho.ts`).
 */
export function readBodies(state: any, into: Map<string, Other>, self: string | null): number {
  const now = performance.now();
  const seen = new Set<string>();
  let people = 0;
  state?.walkers?.forEach((w: any, id: string) => {
    people++;
    if (id === self) return;
    seen.add(id);
    let o = into.get(id);
    if (!o) {
      o = { id, lookSeed: w.lookSeed, sex: w.sex === "f" ? "f" : "m", age: w.age, trade: w.trade, here: false, track: new OthersTrack() };
      into.set(id, o);
    }
    o.here = !!w.here;
    if (o.here) o.track.push({ t: now, x: w.x, y: w.y, yaw: w.yaw, speed: w.speed, activity: w.activity as WalkerActivity });
  });
  for (const id of [...into.keys()]) if (!seen.has(id)) into.delete(id);
  return people;
}

/** Read the room's state into `others` and the view. Runs on every patch. */
function absorb(state: any): void {
  const people = readBodies(state, others, selfId);
  const me = selfId ? state?.walkers?.get?.(selfId) : undefined;
  const look = me ? { seed: String(me.lookSeed), sex: me.sex === "f" ? ("f" as const) : ("m" as const), age: Number(me.age), trade: String(me.trade) } : null;
  const changed = (look?.seed ?? null) !== (selfLook?.seed ?? null);
  selfLook = look;
  if (people !== view.people || changed) set({ people });
}

function bind(r: Room, cell: string, code: string): void {
  room = r;
  selfId = r.sessionId;
  others.clear();
  toldBy.clear();
  selfLook = null;
  r.onStateChange((s: any) => absorb(s));
  r.onMessage(VILLAGE_S2C.SAID, (m: SaidMsg) => saidSubs.forEach((fn) => fn(m)));
  r.onMessage(VILLAGE_S2C.TOLD, (m: SaidMsg) => {
    if (room !== r || typeof m?.from !== "string" || typeof m.text !== "string") return;
    toldBy.set(m.from, [...toldFrom(m.from), { text: m.text, at: Date.now() }]);
    toldSubs.forEach((fn) => fn(m));
  });
  r.onMessage(VILLAGE_S2C.OFFERED, (m: OfferedMsg) => {
    if (room !== r || typeof m?.id !== "string" || typeof m.from !== "string") return;
    offeredSubs.forEach((fn) => fn(m));
  });
  r.onMessage(VILLAGE_S2C.SETTLED, (m: SettledMsg) => {
    if (room !== r || typeof m?.id !== "string") return;
    settledSubs.forEach((fn) => fn(m));
  });
  // Which body is this page's: its own connection's, or one its echo kept while it was away.
  r.onMessage(VILLAGE_S2C.YOU, (m: YouMsg) => {
    if (room !== r || typeof m?.id !== "string") return;
    selfId = m.id;
    others.delete(m.id);
    if (m.at) place = m.at;
    if (m.away) set({ away: m.away });
    try {
      if (m.away && keptIn(cell)?.code === code) localStorage.removeItem(ROOM_KEPT_KEY);
    } catch {
      // Offered once more, and answered by the room that there is nothing to watch.
    }
  });
  r.send(VILLAGE_C2S.WHO);
  // This page's brief, or none: a body taken back is kept by nothing until its page says so.
  r.send(VILLAGE_C2S.BRIEF, { token: brief });
  r.onLeave((code_) => {
    if (room !== r) return;
    room = null;
    others.clear();
    // 1000 is a leave this page asked for; anything else is a connection that dropped.
    if (code_ === 1000) set({ ...SOLO });
    else void comeBack(r.reconnectionToken, cell, code);
  });
  set({ status: "in", cell, code, error: null });
}

/**
 * A dropped connection: back within the room's window if it can be (`ROOM.reconnectS`); and when the room
 * is not there to come back to, because the server was restarted for a deploy (C106), into the same code
 * again, which makes the room anew on the server that is up. The copy's village was kept by the web app;
 * the body is this page's to bring back, and it does, where it stands.
 */
async function comeBack(token: string, cell: string, code: string): Promise<void> {
  set({ status: "lost" });
  const mine = attempt;
  for (let tries = 0; tries < 6; tries++) {
    // 1, 2, 4, 8, 8, 8 seconds: half a minute, longer than a host takes to put the new server in.
    await new Promise((r) => setTimeout(r, 1000 * 2 ** Math.min(tries, 3)));
    if (view.status !== "lost" || mine !== attempt) return;
    let r: Room | null = null;
    try {
      r = await new Client(config.realtimeUrl).reconnect(token);
    } catch {
      try {
        r = await new Client(config.realtimeUrl).joinOrCreate(VILLAGE_ROOM, { cell, code, userId: await ensureIdentity(), token: identityToken() });
      } catch (e) {
        // A server that is up and says no (a full room, an identity it will not take) is an answer.
        if (errorOf(e) !== "offline") {
          if (mine === attempt) set({ ...SOLO, error: errorOf(e) });
          return;
        }
      }
    }
    if (!r) continue;
    // Left, or gone into another room, while this was on its way back: this connection is not the live one.
    if (view.status !== "lost" || mine !== attempt) {
      void r.leave(true).catch(() => {});
      return;
    }
    bind(r, cell, code);
    return;
  }
  if (view.status === "lost" && mine === attempt) set({ ...SOLO, error: "offline" });
}

/** Come into the room `code` of village `cell`. Resolves to whether it worked. */
export async function joinRoom(cell: string, code: string): Promise<boolean> {
  const c = normalizeRoomCode(code);
  if (!roomable(cell) || !c) {
    set({ error: "refused" });
    return false;
  }
  if (room && view.code === c && view.cell === cell) return true;
  leaveRoom();
  const mine = ++attempt;
  set({ status: "joining", cell, code: c, people: 0, error: null });
  try {
    const userId = await ensureIdentity();
    const r = await new Client(config.realtimeUrl).joinOrCreate(VILLAGE_ROOM, { cell, code: c, userId, token: identityToken() });
    // Asked to leave, or to come in somewhere else, while the door was still opening (React's
    // StrictMode does both on every mount in development): this connection is not the live one.
    if (mine !== attempt) {
      void r.leave(true);
      return false;
    }
    bind(r, cell, c);
    try {
      const recent = recentRooms(cell).filter((r) => r.code !== c);
      localStorage.setItem(ROOM_RECENT_KEY, JSON.stringify([{ cell, code: c, at: Date.now() }, ...recent].slice(0, RECENT_MAX)));
    } catch {
      // A room not remembered is typed in again next time.
    }
    return true;
  } catch (e) {
    if (mine === attempt) set({ ...SOLO, error: errorOf(e) });
    return false;
  }
}

/** Where your echo is keeping your place (C105): the room you left with a brief handed in, for the door to offer watching. */
export const ROOM_KEPT_KEY = "echo.room.kept";

/** The room your echo keeps your place in, if it may still be: left with a brief, within the keeping's time. */
export function keptIn(cell: string): { cell: string; code: string; at: number } | null {
  try {
    const k = JSON.parse(localStorage.getItem(ROOM_KEPT_KEY) ?? "null") as { cell?: unknown; code?: unknown; at?: unknown } | null;
    if (!k || k.cell !== cell || typeof k.code !== "string" || normalizeRoomCode(k.code) !== k.code || typeof k.at !== "number") return null;
    return Date.now() - k.at < STAND_IN.maxS * 1000 ? { cell: k.cell, code: k.code, at: k.at } : null;
  } catch {
    return null;
  }
}

export function leaveRoom(): void {
  attempt++;
  const r = room;
  try {
    // Left with a brief handed in: the echo keeps the place, and the door can offer to watch it.
    if (r && brief && view.status === "in" && view.cell && view.code) localStorage.setItem(ROOM_KEPT_KEY, JSON.stringify({ cell: view.cell, code: view.code, at: Date.now() }));
  } catch {
    // Not offered, then; the room keeps the body all the same.
  }
  room = null;
  selfId = null;
  selfLook = null;
  place = null;
  others.clear();
  toldBy.clear();
  if (r) void r.leave(true).catch(() => {});
  set({ ...SOLO });
}

/**
 * The brief your echo keeps your body by (C104), or null after a no. Handed to the room now if this page is
 * in one, and on coming into one.
 */
export function setStandInBrief(token: string | null): void {
  if (token === brief) return;
  brief = token;
  if (room && view.status === "in") room.send(VILLAGE_C2S.BRIEF, { token });
}

/** Where this page's body stands, once, after coming back to a body its echo kept; else null. */
export function takePlace(): { x: number; y: number; yaw: number } | null {
  const p = place;
  place = null;
  return p;
}

/** What your echo did has been read. */
export function dismissAway(): void {
  if (view.away) set({ away: null });
}

/** This body's pose. The layer calls it at `ROOM.poseHz`. */
export function sendPose(p: PoseMsg): void {
  if (room && view.status === "in") room.send(VILLAGE_C2S.POSE, p);
}

/** This body is not in the village (another shore, or the world is gone). */
export function sendAway(): void {
  if (room && view.status === "in") room.send(VILLAGE_C2S.AWAY);
}

/** How long someone who came into a room is waited for after a line, ms (C107): then they have not answered. */
export const ANSWER_WAIT_MS = 25_000;

/** Say a line to whoever is near. Returns the line as it was said, for this page's own bubble, or null. */
export function sayInRoom(text: string): string | null {
  const line = cleanSaid(text);
  if (!line || !room || view.status !== "in") return null;
  room.send(VILLAGE_C2S.SAY, { text: line });
  // The room does not send a line back to whoever said it; this page shows its own, over its own head.
  const me = selfId;
  if (me) saidSubs.forEach((fn) => fn({ from: me, text: line }));
  return line;
}

/**
 * Say a line to one body in the room (C107), as the talk panel says one to a villager. Returns the line as
 * it was said, or null when there is no room to say it in. Whether anyone answers is theirs: the room
 * tells this page nothing either way.
 */
export function talkInRoom(to: string, text: string): string | null {
  const line = cleanSaid(text);
  if (!line || !room || view.status !== "in" || !others.has(to)) return null;
  room.send(VILLAGE_C2S.TALK, { to, text: line });
  return line;
}

/** The rooms of `cell` this browser has been in, newest first. */
export function recentRooms(cell: string): { cell: string; code: string; at: number }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ROOM_RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is { cell: string; code: string; at: number } => !!r && r.cell === cell && normalizeRoomCode(r.code) === r.code && typeof r.at === "number");
  } catch {
    return [];
  }
}

export { ROOM };
