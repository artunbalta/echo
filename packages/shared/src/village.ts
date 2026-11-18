/**
 * A village room (DECISIONS C101): one copy of a village that a group of people enter together by a
 * code, the way a group of friends shares one server of a game.
 *
 * ONE VILLAGE, MANY COPIES. The rooms are copies of the reference village, never of any cell: the
 * village's people are a closed form of the seed and the clock (C27, C43), so every copy has the same
 * people at the same well at the same hour without a server moving them, and what a room adds is only
 * the people who came in through its door. Which villages may be copied is this list and nothing else.
 *
 * WHAT CROSSES THE WIRE about a person: a room-scoped handle (Colyseus's session id), how their body
 * looks, where it stands and what it is doing. Never their subject: that is a credential (⚑27), and the
 * room keeps it on the server side of the process. No name either (C107): the page names a body from its
 * look, in the village's own tongue, as it names the villagers.
 *
 * WHAT A ROOM DOES NOT KNOW: who is watching. Nothing here is told about a viewer; the room carries
 * bodies and the lines they say, and that is all.
 *
 * Pure. Both the room (apps/realtime) and the page (apps/web) read these, so a limit is one number.
 */

/** The Colyseus room name. */
export const VILLAGE_ROOM = "village";

/** The villages a room may be a copy of: Drurnscree, the village a newcomer walks into (apps/web `lib/openVillage.ts`). */
export const ROOM_VILLAGES: readonly string[] = ["84dcee5ffffffff"];

export const ROOM = {
  /** A group of people who know each other, not a crowd of strangers. */
  capacity: 16,
  /** Five characters from {@link ROOM_ALPHABET}: 28.6 million codes, easy to read out loud. */
  codeLength: 5,
  /** Poses a body sends a second. The page interpolates between them. */
  poseHz: 10,
  /**
   * The fastest a body may move, metres a second. A sprint is 4.2 (`parcelMovement`), a raft under
   * way less than twice that; a pose further than this from the last one is pulled back along the way.
   */
  maxSpeedMps: 9,
  /** A pose further than this from the cell's centre, metres, is not a pose in this village. */
  boundM: 4000,
  /** A line said reaches those standing within this many metres, as a voice would. */
  hearM: 14,
  /** The longest line, characters. */
  sayMaxChars: 240,
  /** One line per this many milliseconds from one person, at most. */
  sayEveryMs: 700,
  /** Seconds a dropped connection keeps its body in the room before it goes. */
  reconnectS: 20,
} as const;

/** No 0/O, 1/I/L: a code read out over the phone is a code typed right. */
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** What a body is doing, as the crowd draws it. */
export type WalkerActivity = "walk" | "stand" | "sit" | "work" | "row";
export const WALKER_ACTIVITIES: readonly WalkerActivity[] = ["walk", "stand", "sit", "work", "row"];

/** One body's state, sent by its own page. Planet-local metres (east, north) and three's yaw. */
export interface PoseMsg {
  x: number;
  y: number;
  yaw: number;
  /** Metres a second. */
  speed: number;
  activity: WalkerActivity;
}

/** A line someone said, as the room hands it to whoever heard it. */
export interface SaidMsg {
  from: string;
  text: string;
}

/**
 * A line said to one body (DECISIONS C107), as the talk panel says one to a villager: to `to`, a body in
 * the room within {@link ROOM.hearM}. It reaches that body's person and nobody else (`VILLAGE_S2C.TOLD`,
 * a {@link SaidMsg}); a body its echo keeps answers only as far as the echo has earned talking (C109), and
 * nobody is told which kind of body answered or did not.
 */
export interface TalkMsg {
  to: string;
  text: string;
}

/** To someone watching their own echo (C107): a line said to the body it keeps, by `from`, at `at`. Not kept. */
export interface HeardMsg {
  from: string;
  text: string;
  at: number;
}

/**
 * What a page sends: its body's pose, a line said to whoever is near, a line said to one body (C107), that
 * it is away, the brief its echo stands in by (C104), and a question the room answers once on coming in:
 * which body is mine.
 */
export const VILLAGE_C2S = { POSE: "pose", SAY: "say", TALK: "talk", AWAY: "away", BRIEF: "brief", WHO: "who", SAY_IT: "sayIt" } as const;
/**
 * What the room sends: a line heard; a line said to this page's body alone (C107); which body is a page's
 * own; and, to someone watching their own echo from outside (C105), what it has met so far, each moment as
 * it meets it, what was said to it (C107), a line it would say and may not yet without them (C109), and that
 * the watching is over.
 */
export const VILLAGE_S2C = { SAID: "said", TOLD: "told", YOU: "you", WATCH: "watch", MET: "met", HEARD: "heard", WOULD: "would", WATCH_END: "watchEnd" } as const;

/**
 * To someone watching their own echo (C109): a line it would say to `to` and has not, because talking is
 * close for it and not yet earned (`ask`). Said only if they press "Say it" (`VILLAGE_C2S.SAY_IT` with this
 * `id`) before `until`; otherwise never.
 */
export interface WouldMsg {
  id: string;
  to: string;
  text: string;
  until: number;
}

/** What the talk log of an echo is filed under in its log (C109): one line it said for its person. */
export const TALK_KIND = "talk";

// ── your echo, keeping your body while you are away (DECISIONS C104) ────────────────

/**
 * How an echo keeps a body in a room once its person has gone (C104). Each number is set here and
 * nowhere else; the room and the page read the same ones.
 */
export const STAND_IN = {
  /** The longest an echo keeps a body after its person has gone, seconds. Then the body goes, as a person's does. */
  maxS: 45 * 60,
  /** How often the room moves a body its echo keeps: as often as a page sends its own pose, so the two move alike. */
  tickHz: ROOM.poseHz,
  /** A breadcrumb of the person's own way every this many metres walked... */
  crumbM: 1.5,
  /** ...and the last this many of them, about nine hundred metres of it. */
  crumbs: 600,
  /** Two poses further apart than this are not a walk (back from another shore, a page asleep): the way starts again. */
  jumpM: 6,
  /** Fewer crumbs than this is no way to walk: the echo keeps the body where it stood. */
  minCrumbs: 4,
  /** Standing still this long in one place is a pause the echo keeps there too, seconds; never longer than the second. */
  pauseMinS: 2,
  pauseMaxS: 20,
  /** The person's pace as the echo walks it, metres a second: within these. */
  paceMps: [0.8, 3] as const,
  /** A moment the echo does something at is met this far ahead on its way, metres. */
  aheadM: 8,
  /** What it did while its person was away: at most this many lines are kept. */
  logMax: 60,
  /** Lines an echo says for its person in one keeping, at most (C109): a bound on what it says, and on what it spends. */
  talkMax: 30,
  /** Lines of one conversation it is shown when it answers, its own and theirs. */
  talkContext: 8,
  /** How long a line it would say waits for its person's "Say it", ms. */
  wouldMs: 40_000,
  /** How long the room waits for the web app's answer, ms: inside the 25 s a speaker's panel waits. */
  answerWaitMs: 15_000,
  /** A brief is good for this long after it is made, ms; the page asks for a fresh one well before. */
  briefMs: 2 * 60 * 60 * 1000,
  /** The longest brief the room reads, characters. */
  briefMaxChars: 16000,
} as const;

/** Where an echo stands in a kind of situation (`apps/web` `lib/knowable/standing.ts`): it may act, it is close, or it is still learning. */
export type StandInLevel = "act" | "ask" | "watch";
export const STAND_IN_LEVELS: readonly StandInLevel[] = ["act", "ask", "watch"];

/** What the echo says its person would do at one kind of moment, how sure it is, and whether it may do it for them. */
export interface StandInCall {
  call: string;
  p: number;
  may: StandInLevel;
}

/**
 * Everything an echo needs to keep its person's body (C104), made and signed by the web app from what
 * the server keeps of the person's record (C103), carried by their own page to the room, and read by
 * the room only. `sub` is checked against the body's own subject and never leaves the room's process.
 */
export interface StandInBrief {
  sub: string;
  /** Until when it may be acted on, ms. */
  exp: number;
  /** By kind of moment. A kind not here is one the echo holds back at. */
  calls: Record<string, StandInCall>;
  /** Where it stands in talking (C109): `act` it answers for them, `ask` it may with them watching, else silent. */
  talk?: StandInLevel;
}

/** One moment the echo met while its person was away, as it is told to them when they come back. */
export interface AwayEntry {
  /** When, ms. */
  at: number;
  kind: string;
  /** What the echo said they would do, and how sure it was. */
  call: string;
  p: number;
  /** Where the echo stood in this kind of situation. */
  may: StandInLevel;
  /** What the body did: the call where the echo may act, walking on where it may not. */
  did: string;
  /**
   * A line it said for them (C109), when `kind` is {@link TALK_KIND} (`call` and `did` are then "answer").
   * Only its own line: what was said to it is someone else's and is never in the log.
   */
  said?: string;
}

/**
 * What a room asks the web app when someone talks to a body an echo keeps (C109): the person's subject, the
 * copy, whether the echo would answer itself (`act`) or put the line to its watching person (`ask`), and the
 * last lines of this conversation, the speaker's (`them`) and its own (`me`), ending on the speaker's. Signed
 * (`@echo/shared/standin` `signSpeak`). The speaker's words go to the model to be answered and are not kept.
 */
export interface SpeakRequest {
  sub: string;
  cell: string;
  room: string;
  mode: "act" | "ask";
  turns: { from: "them" | "me"; text: string }[];
  at: number;
}

/** The web app's answer: the line, how sure, or null when the person would say nothing. */
export interface SpeakAnswer {
  say: string | null;
  sure?: number;
}

/** Which body is this page's, told once on coming in; and, for a body its echo kept, where it is and what the echo did. */
export interface YouMsg {
  id: string;
  /** Where the body stands now: the page takes its place there rather than the body jumping to the page. */
  at?: { x: number; y: number; yaw: number };
  away?: { since: number; until: number; log: AwayEntry[] };
}

// ── watching your echo from outside (DECISIONS C105) ───────────────────────────────

/**
 * What someone watching their own echo is told on coming in: which body it is, since when it has kept it,
 * and what it has met so far. They come in with `watch: true` and no body of their own; nobody in the room
 * is told, and the echo is not.
 */
export interface WatchMsg {
  id: string;
  since: number;
  until: number;
  log: AwayEntry[];
}

/** Moments the echo has met since the last word, for whoever watches it. */
export interface MetMsg {
  entries: AwayEntry[];
}

/** The watching is over: its person came back to the body, or the keeping ran out. */
export interface WatchEndMsg {
  reason: "back" | "over";
}

/**
 * What a room tells the web app when an echo's keeping ends (C105), so that what it did is kept with the
 * person's record: signed with the identity secret both hold (`@echo/shared/standin` `signReport`).
 */
export interface AwayReport {
  sub: string;
  cell: string;
  room: string;
  since: number;
  until: number;
  log: AwayEntry[];
}

/** three's yaw for a planet-local heading (radians, from east toward north), as the page's player layer turns its body. */
export const yawOfHeading = (heading: number): number => Math.PI / 2 - heading;
/** The planet-local heading a yaw faces. */
export const headingOfYaw = (yaw: number): number => Math.PI / 2 - yaw;

/** A code as typed, or null when it is not one: case, spaces and dashes forgiven, nothing else. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== ROOM.codeLength) return null;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return null;
  return code;
}

/** A fresh code. `rand` is injectable so a test can name the room it makes. */
export function newRoomCode(rand: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM.codeLength; i++) code += ROOM_ALPHABET[Math.floor(rand() * ROOM_ALPHABET.length) % ROOM_ALPHABET.length];
  return code;
}

/** A line as said, or null: trimmed, one line, not empty, not longer than {@link ROOM.sayMaxChars}. */
export function cleanSaid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > ROOM.sayMaxChars ? text.slice(0, ROOM.sayMaxChars) : text;
}

/** A pose as sent, or null when any part of it is not one. Speed is held to the room's limit. */
export function readPose(raw: unknown): PoseMsg | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const x = num(p.x), y = num(p.y), yaw = num(p.yaw), speed = num(p.speed);
  if (x === null || y === null || yaw === null || speed === null) return null;
  if (Math.hypot(x, y) > ROOM.boundM) return null;
  const activity = WALKER_ACTIVITIES.includes(p.activity as WalkerActivity) ? (p.activity as WalkerActivity) : null;
  if (!activity) return null;
  return { x, y, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), speed: Math.min(Math.max(0, speed), ROOM.maxSpeedMps), activity };
}

/**
 * Where a body may be now, given where it was `dtMs` ago and where its page says it is: the page's
 * word, unless that is further than the room's fastest walk allows, in which case as far as that walk
 * gets along the way. The first pose (`from` null) is taken as it is: that is where the body came in.
 */
export function stepToward(from: { x: number; y: number } | null, to: { x: number; y: number }, dtMs: number): { x: number; y: number } {
  if (!from) return { x: to.x, y: to.y };
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  // A little slack over the limit: poses are stamped when they arrive, and arrivals bunch.
  const allowed = ROOM.maxSpeedMps * Math.max(dtMs, 1) / 1000 * 1.5 + 0.5;
  if (d <= allowed) return { x: to.x, y: to.y };
  return { x: from.x + (dx / d) * allowed, y: from.y + (dy / d) * allowed };
}

/** The trades a body in a room may wear, as villagers wear theirs (apps/web `crowd.ts` dyes by these). */
const ROOM_TRADES = ["fisher", "farmer", "weaver", "potter", "labourer", "carter", "trader", "herder"] as const;

/** A small deterministic number from a string, in [0, 1): FNV-1a, as the crowd's own `hashUnit`. */
function unit(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return (h >>> 0) / 4294967296;
}

/**
 * How a person's body looks in a room: drawn from the same trades, ages and dress as the villagers', so
 * nothing about a body says whether someone came in through the door. The same in one copy every time
 * (`code`), and another in the next (C107): a group that met in one copy has to find each other again in
 * the next, as the owner's "you will not quite know who is what" asks. The page names the body from the
 * seed too (`@echo/planet` `visitorName`). `seed` is a digest, never the subject: it names a look, not a
 * person.
 */
export function roomLookOf(subject: string, code: string): { seed: string; sex: "f" | "m"; age: number; trade: string } {
  const seed = Math.floor(unit(`room-look:${code}:${subject}`) * 0xffffffff).toString(16).padStart(8, "0");
  return {
    seed,
    sex: unit(`${seed}/sex`) < 0.5 ? "f" : "m",
    age: 19 + Math.floor(unit(`${seed}/age`) * 42),
    trade: ROOM_TRADES[Math.floor(unit(`${seed}/trade`) * ROOM_TRADES.length) % ROOM_TRADES.length]!,
  };
}

/** Who among `listeners` hears a line said at `at`: within {@link ROOM.hearM}, the speaker left out. */
export function hearersOf<T extends { id: string; x: number; y: number; here: boolean }>(speaker: string, at: { x: number; y: number }, listeners: Iterable<T>): T[] {
  const out: T[] = [];
  for (const l of listeners) if (l.id !== speaker && l.here && Math.hypot(l.x - at.x, l.y - at.y) <= ROOM.hearM) out.push(l);
  return out;
}

// ── a copy's own world (DECISIONS C102) ─────────────────────────────────────────

/**
 * What separates a cell from the room in the key a copy's world is kept under: `84dcee5ffffffff~ABCDE`.
 * An H3 cell is hexadecimal and a code is from {@link ROOM_ALPHABET}, so neither can hold it.
 */
export const ROOM_WORLD_SEP = "~";

/**
 * The key a world's memory is kept under: the cell itself for the open world everyone walks, and the cell
 * with the room's code for a copy. Every row a village writes (what conversations changed, what villagers
 * remember, the marks acts left, the deeds they know) is filed under one of these, so a copy remembers
 * only what was done in it.
 */
export function worldKey(cell: string, room: string | null): string {
  return room ? `${cell}${ROOM_WORLD_SEP}${room}` : cell;
}

/** The cell and the room a key names; `room` is null for the open world. */
export function worldOf(key: string): { cell: string; room: string | null } {
  const at = key.indexOf(ROOM_WORLD_SEP);
  return at < 0 ? { cell: key, room: null } : { cell: key.slice(0, at), room: key.slice(at + 1) };
}

/**
 * The room a request to a village route asks for, given its cell: none (the open world) when it names
 * none, else a code exactly as the page writes it for a village that can be copied. Anything else is
 * not a room, and the route refuses it rather than quietly answering for the open world.
 */
export function roomOfRequest(cell: string, raw: unknown): { ok: true; room: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, room: null };
  const code = normalizeRoomCode(raw);
  if (!code || code !== raw || !ROOM_VILLAGES.includes(cell)) return { ok: false };
  return { ok: true, room: code };
}
