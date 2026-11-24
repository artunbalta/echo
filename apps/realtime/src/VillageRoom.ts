/**
 * A village room (DECISIONS C101): one copy of the reference village, entered by a code.
 *
 * WHICH ROOM. Colyseus matches a join to a room by the options `cell` and `code` (`filterBy` in
 * index.ts), so "join or create" with a code is the whole of entering one: the first person with a code
 * makes the room and everyone after them with the same code comes into it. A room goes when the last
 * body in it goes: the last person's, or the last one an echo was keeping (C104). What happens in a
 * village that people remember is the village's, not the room's.
 *
 * WHAT IT HOLDS: the bodies of the people who came in, and nothing else. Each page computes the
 * villagers for itself from the seed and the clock (C27), so every copy has the same people at the
 * same hour without the room moving anyone.
 *
 * WHAT IT TRUSTS. A page says where its body is, ten times a second (`ROOM.poseHz`); the room does not
 * have the ground, so it does not walk the body for it. What it does is refuse what no body could do: a
 * pose that is not numbers, outside the village, or further from the last than the fastest walk allows
 * is pulled back to where a walk would have got (`stepToward`). Server-authoritative movement on the
 * planet's own ground is a later step.
 *
 * WHAT IT SAYS. A line said reaches those standing within earshot (`ROOM.hearM`), as a voice does, and
 * is not kept: no line is written anywhere, and none is measured.
 *
 * A LINE SAID TO ONE BODY (C107), as the talk panel says one to a villager, reaches that body's person and
 * nobody else. The person whose body an echo keeps, watching from outside, is shown what was said to it.
 *
 * AN ECHO THAT TALKS (C109). A body its echo keeps answers only as far as the echo has earned talking (C103's
 * 30 looks and 0.85, earned from its sealed guesses, C108), as its brief says. Where it stands at `act`, the
 * room asks the web app, signed, what the person would say (`/api/echo/speak`, which checks the standing
 * again), waits about as long as typing it would take, and the line reaches the speaker as a person's answer
 * does (`VILLAGE_S2C.TOLD`); its person, watching, sees it, and it is in what the echo did (the log, then the
 * report) for them to say "not me" of. Where it stands at `ask`, and only while its person watches, the line
 * it would say is put to them (`VILLAGE_S2C.WOULD`) and said only if they press "Say it" in time. Below that it
 * is silent, as before. One line at a time, `STAND_IN.talkMax` in a keeping; what was said to it is sent to
 * the web app to be answered and kept nowhere, here or there. Whether a body answers never depends on who
 * else is watching: an answer at `act` goes out watched or not.
 *
 * NOBODY TOLD APART BY HOW THEY ANSWER (C110). A body an echo keeps stands and turns to whoever it answers
 * while it types, as a person does. A line handed to one person carries the room's token for it
 * (`signToldVoice`), so their page can have it read in a voice picked for the body's look, as a villager's
 * line is read in one picked for theirs. And one person can give another what they carry, offer it in
 * trade, or ask for something for their help, as they can a villager (`OFFER`, `ANSWER`): the room hands the
 * offer to the person it is made to, and on their yes asks the web app, signed, to move the things between
 * their packs (`/api/village/hand`). An offer to a body an echo keeps is not taken, as one to a person who did
 * not turn round is not. Nothing of it is measured.
 *
 * NO NAMES (C107). A body is a handle, a look and a pose; each page names it from its look in the
 * village's own tongue, as it names the villagers, so no name typed at a door can say who someone is.
 *
 * WHEN SOMEONE LEAVES (C104). A person who let their echo stand in for them (C103), and whose page gave
 * the room the brief the web app signed for it, leaves their body behind: their echo keeps it, walking
 * their own way and doing at what it meets only what it has earned the right to (`echoBody.ts`), for
 * `STAND_IN.maxS` at most. Without that, the body goes, as before. Coming back, the person takes the same
 * body back where it stands, under the same handle, and is told what their echo did. Who moves a body is
 * never synced and never said: nobody else can tell a body its echo keeps from one its person moves.
 *
 * WATCHING YOUR ECHO (C105). A person whose echo keeps their body may come in to watch it, with
 * `watch: true`: no body of their own, nothing synced about them, nobody told. They are sent what the
 * echo has met and each moment as it meets it (`newsFor`, which only reads), and may hand it a fresh
 * brief (after a "that was not me", say), as they could from inside. The echo is not told: its step
 * (`advanceKept`) is given the bodies, the time and the dice, and no watcher. When the keeping ends (its
 * person back, or its time up), what it did is sent to the web app, signed, to be kept with their record.
 *
 * WHO ELSE IS WATCHING is not a question this room answers to anyone: nothing a body is told, or does,
 * depends on whether its person, or anyone, is looking.
 *
 * WHEN THE SERVER GOES (a deploy, a restart; C106). Every keeping ends there, as its time running out
 * would: what each echo did is sent to its person's record and waited for (a little), whoever watches is
 * told, and then the room closes. The people in it are let go, and their pages come into the same code
 * again on the server that comes up (`villageRoom.ts`); what the village remembers is the village's, so
 * nothing of the copy is lost but the bodies, which their people bring back.
 */
import { Room, type Client } from "@colyseus/core";
import { ITEMS } from "@echo/planet";
import {
  OFFER,
  OFFER_KINDS,
  ROOM,
  ROOM_VILLAGES,
  STAND_IN,
  VILLAGE_C2S,
  VILLAGE_S2C,
  cleanSaid,
  hearersOf,
  normalizeRoomCode,
  readPose,
  roomLookOf,
  stepToward,
  TALK_KIND,
  typingMs as typingFor,
  yawToward,
  type AnswerMsg,
  type AwayReport,
  type HandAnswer,
  type HandRequest,
  type OfferKind,
  type OfferedMsg,
  type SettledMsg,
  type HeardMsg,
  type SpeakAnswer,
  type SpeakRequest,
  type WouldMsg,
  type MetMsg,
  type SaidMsg,
  type WatchEndMsg,
  type WatchMsg,
  type YouMsg,
} from "@echo/shared";
import { identitySecretsFor } from "@echo/shared/identity";
import { signHand, signReport, signSpeak, signToldVoice, verifyBrief } from "@echo/shared/standin";

import { authSubject } from "./auth.js";
import { advanceKept, keepBody, newsFor, type EchoBody } from "./echoBody.js";
import { VillageState, Walker } from "./villageState.js";

interface VillageCreateOptions {
  cell?: unknown;
  code?: unknown;
}

interface VillageJoinOptions extends VillageCreateOptions {
  /** Coming in to watch one's own echo, with no body (C105). */
  watch?: unknown;
  /** The signature that makes `userId` believable. */
  token?: string;
  userId?: string;
}

/** Poses closer together than this are dropped: a page may send ten a second, not a hundred. */
const MIN_POSE_GAP_MS = 1000 / (ROOM.poseHz * 3);

/** How long a page coming back to a body its echo kept has to take its place there, ms. */
const PLACE_MS = 5000;

/** How long a record of what an echo did is given to reach the web app, ms. */
const REPORT_MS = 5000;

/** What an echo's talking holds while it keeps a body (C109): kept only as long as the keeping is. */
interface TalkState {
  /** Lines said for its person in this keeping. */
  said: number;
  /** A line is being answered: the next one waits for it, as a person typing does. */
  busy: boolean;
  /** The last lines of each conversation, by the speaker's handle: theirs and its own. */
  with: Map<string, { from: "them" | "me"; text: string }[]>;
  /** Lines it would say, put to its watching person, by id. */
  would: Map<string, { to: string; text: string; sure: number; until: number }>;
}

/**
 * How long typing a line takes, ms: a person reads, thinks a moment, and types. An answer that came at once
 * would tell an echo from a person. `ECHO_TALK_PACE` scales it (0 in tests).
 */
export function typingMs(text: string, dice: () => number = Math.random): number {
  return typingFor(text, dice, Number(process.env.ECHO_TALK_PACE ?? "1"));
}

/** How long a body an echo keeps stays turned to someone after its answer is said, ms: a person does not walk off mid-sentence. */
const FACE_AFTER_MS = 2500;

/** An offer one person made another (C110), until it is answered or lapses. */
interface Open {
  from: string;
  to: string;
  kind: OfferKind;
  item: string | null;
  until: number;
  lapse: { clear(): void };
}

/** How long an offer waits for an answer, ms: `OFFER.waitMs`, shorter where a test says so. */
const offerWaitMs = () => {
  const v = Number(process.env.ECHO_OFFER_WAIT_MS);
  return Number.isFinite(v) && v > 0 ? Math.min(v, OFFER.waitMs) : OFFER.waitMs;
};

/** An item the planet knows, or null: the only things that pass between people. */
const itemOf = (v: unknown): string | null => (typeof v === "string" && ITEMS[v] ? v : null);

/** How long an echo keeps a body, seconds: `STAND_IN.maxS`, shorter where a test says so. */
const keepS = () => {
  const s = Number(process.env.ECHO_STANDIN_MAX_S);
  return Number.isFinite(s) && s > 0 ? Math.min(s, STAND_IN.maxS) : STAND_IN.maxS;
};

const secrets = () =>
  identitySecretsFor({
    secret: process.env.ECHO_IDENTITY_SECRET,
    previous: process.env.ECHO_IDENTITY_SECRET_OLD,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  });

export class VillageRoom extends Room<VillageState> {
  maxClients = ROOM.capacity;
  /** Which body each connection moves: a session id to a body's handle. */
  private seats = new Map<string, string>();
  /** What a connection is told when it asks which body is its own (`VILLAGE_C2S.WHO`). */
  private yours = new Map<string, YouMsg>();
  /** Who is watching their own echo (C105): a session id to the body it keeps, and how many moments they have heard of. */
  private watchers = new Map<string, { body: string; seen: number }>();
  /** Each keeping's talking (C109), gone with the keeping. */
  private talks = new WeakMap<EchoBody, TalkState>();
  /** Offers made and not yet answered (C110), by id. */
  private offers = new Map<string, Open>();

  onCreate(options: VillageCreateOptions) {
    const cell = typeof options.cell === "string" ? options.cell : "";
    const code = normalizeRoomCode(options.code);
    // A room is a copy of the reference village and has a code, or it is not made at all. The code must
    // come as the page writes it: rooms are matched on the options as sent, so a room made for "abcde"
    // would be a second copy beside "ABCDE", with half of a group in each.
    if (!ROOM_VILLAGES.includes(cell) || !code || code !== options.code) throw new Error("village_room_refused");
    this.setState(new VillageState());
    this.state.cell = cell;
    this.state.code = code;

    this.onMessage(VILLAGE_C2S.POSE, (client, raw) => this.pose(client, raw));
    this.onMessage(VILLAGE_C2S.SAY, (client, raw) => this.say(client, raw));
    this.onMessage(VILLAGE_C2S.TALK, (client, raw) => this.talk(client, raw));
    this.onMessage(VILLAGE_C2S.AWAY, (client) => {
      const w = this.bodyOf(client);
      if (w) {
        w.here = false;
        w.speed = 0;
      }
    });
    this.onMessage(VILLAGE_C2S.BRIEF, (client, raw) => this.brief(client, raw));
    this.onMessage(VILLAGE_C2S.SAY_IT, (client, raw) => this.sayIt(client, raw));
    this.onMessage(VILLAGE_C2S.OFFER, (client, raw) => this.offer(client, raw));
    this.onMessage(VILLAGE_C2S.ANSWER, (client, raw) => void this.answerOffer(client, raw));
    this.onMessage(VILLAGE_C2S.WHO, (client) => {
      const watch = this.watchers.get(client.sessionId);
      if (watch) {
        const w = this.state.walkers.get(watch.body);
        if (!w?.echo) return;
        const msg: WatchMsg = { id: w.id, since: w.echo.since, until: w.echo.until, log: w.echo.log.map((e) => ({ ...e })) };
        watch.seen = w.echo.met;
        client.send(VILLAGE_S2C.WATCH, msg);
        return;
      }
      const you = this.yours.get(client.sessionId);
      if (!you) return;
      client.send(VILLAGE_S2C.YOU, you);
      // Where the body stood and what the echo did are told once; which body it is, as often as asked.
      if (you.at || you.away) this.yours.set(client.sessionId, { id: you.id });
    });
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / STAND_IN.tickHz);
  }

  onAuth(_client: Client, options: VillageJoinOptions, context?: { token?: string }) {
    return authSubject(context?.token || options.token, options.userId);
  }

  onJoin(client: Client, options: VillageJoinOptions, auth?: { uid: string }) {
    const subject = auth?.uid ?? client.sessionId;
    if (options.watch === true) {
      // Only one's own echo, and only while it keeps the body: there is nothing else here to watch.
      const kept = [...this.state.walkers.values()].find((w) => w.echo && w.refId === subject);
      if (!kept) throw new Error("village_nothing_to_watch");
      this.watchers.set(client.sessionId, { body: kept.id, seen: kept.echo!.met });
      return;
    }
    // Back to a body their echo was keeping: the same body, where it stands, under the same handle.
    const kept = [...this.state.walkers.values()].find((w) => w.echo && w.refId === subject);
    if (kept) {
      const echo = kept.echo!;
      kept.echo = null;
      // The brief it was kept by was the last page's: this one hands in its own, or none (a no said since).
      kept.brief = null;
      void this.report(kept, echo, Date.now());
      this.endWatching(kept.id, "back");
      kept.speed = 0;
      kept.activity = "stand";
      // The page takes its place at the body (it is told where, below); until it has, a pose from where
      // the page came in is not a step the body takes, so it does not walk off toward it.
      kept.poseAt = Date.now();
      kept.placeBy = Date.now() + PLACE_MS;
      this.seats.set(client.sessionId, kept.id);
      this.yours.set(client.sessionId, { id: kept.id, at: { x: kept.x, y: kept.y, yaw: kept.yaw }, away: { since: echo.since, until: Date.now(), log: echo.log } });
      this.settleDispose();
      return;
    }

    // Bodies its echoes keep take room too: a room is for a group, whoever moves them.
    if (this.state.walkers.size >= ROOM.capacity) throw new Error("village_full");
    const w = new Walker();
    w.id = client.sessionId;
    w.refId = subject;
    const look = roomLookOf(w.refId, this.state.code);
    w.lookSeed = look.seed;
    w.sex = look.sex;
    w.age = look.age;
    w.trade = look.trade;
    this.state.walkers.set(w.id, w);
    this.seats.set(client.sessionId, w.id);
    this.yours.set(client.sessionId, { id: w.id });
  }

  async onLeave(client: Client, consented?: boolean) {
    // A watcher has no body to keep or let go; a page that dropped comes back by coming in again.
    if (this.watchers.delete(client.sessionId)) return;
    const w = this.bodyOf(client);
    if (w) w.speed = 0;
    if (!consented) {
      try {
        await this.allowReconnection(client, ROOM.reconnectS);
        return;
      } catch {
        // The window passed: the body goes, or its echo keeps it.
      }
    }
    this.seats.delete(client.sessionId);
    this.yours.delete(client.sessionId);
    if (!w || [...this.seats.values()].includes(w.id)) return;
    if (this.keep(w)) return;
    this.state.walkers.delete(w.id);
  }

  /** The body a connection moves. */
  private bodyOf(client: Client): Walker | undefined {
    const id = this.seats.get(client.sessionId);
    return id ? this.state.walkers.get(id) : undefined;
  }

  /**
   * Whether the person's echo keeps their body: they let it (a brief, signed for them, still good), the
   * body is in the village, and it is not on the water.
   */
  private keep(w: Walker): boolean {
    const now = Date.now();
    if (!w.brief || w.brief.sub !== w.refId || w.brief.exp <= now || !w.here || w.activity === "row") return false;
    w.echo = keepBody({ x: w.x, y: w.y }, w.trail, w.brief, `echo|${w.lookSeed}`, now, keepS());
    w.speed = 0;
    w.activity = "stand";
    // The room stays while a body is kept in it, with nobody connected or not.
    this.autoDispose = false;
    return true;
  }

  /** The room goes by itself again once no echo keeps a body in it. */
  private settleDispose(): void {
    const kept = [...this.state.walkers.values()].some((w) => w.echo);
    if (!kept) this.autoDispose = true;
  }

  private tick(dtMs: number) {
    const now = Date.now();
    // The step is the bodies, the time and the dice: no watcher is in it (C105).
    const over = advanceKept(this.state.walkers.values(), now, dtMs);
    for (const w of over) {
      // Its keeping is over: what it did goes to its person's record, and the body goes, as a person's does.
      void this.report(w, w.echo!, now);
      this.endWatching(w.id, "over");
      this.state.walkers.delete(w.id);
    }
    if (over.length) this.settleDispose();
    // Then, and only reading, what each watcher has not heard yet.
    for (const [sessionId, watch] of this.watchers) {
      const echo = this.state.walkers.get(watch.body)?.echo;
      if (!echo) continue;
      const news = newsFor(echo, watch.seen);
      if (!news.entries.length) continue;
      watch.seen = news.seen;
      const msg: MetMsg = { entries: news.entries };
      this.clients.find((c) => c.sessionId === sessionId)?.send(VILLAGE_S2C.MET, msg);
    }
  }

  /** Tell whoever watches a body that the watching is over. */
  private endWatching(body: string, reason: WatchEndMsg["reason"]): void {
    for (const [sessionId, watch] of [...this.watchers]) {
      if (watch.body !== body) continue;
      this.watchers.delete(sessionId);
      this.clients.find((c) => c.sessionId === sessionId)?.send(VILLAGE_S2C.WATCH_END, { reason } satisfies WatchEndMsg);
    }
  }

  /**
   * What the echo did, to the web app, signed, to be kept with its person's record (C105): only where the
   * web app's address is known. Sent and not waited for; one that does not arrive is told to the person
   * all the same when they come back to the body.
   */
  private report(w: Walker, echo: EchoBody, until: number): Promise<void> {
    const url = process.env.ECHO_WEB_URL;
    const secret = secrets()[0];
    if (!url || !secret) return Promise.resolve();
    const report: AwayReport = { sub: w.refId, cell: this.state.cell, room: this.state.code, since: echo.since, until, log: echo.log };
    const body = JSON.stringify(report);
    return fetch(`${url.replace(/\/$/, "")}/api/echo/keeping`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-echo-room": signReport(body, secret) },
      body,
      signal: AbortSignal.timeout(REPORT_MS),
    }).then(
      () => {},
      () => {},
    );
  }

  /**
   * The server is going (C106): every keeping ends now, its record sent and waited for (`REPORT_MS` at
   * most), whoever watches is told it is over, and the room closes. Colyseus calls this on every room
   * when the process is asked to stop and waits for the rooms to be gone; without it a room an echo keeps
   * a body in (`autoDispose` off) would be waited on until the host killed the process, and its record
   * with it.
   */
  async onBeforeShutdown() {
    const now = Date.now();
    const sent: Promise<void>[] = [];
    for (const w of [...this.state.walkers.values()]) {
      if (!w.echo) continue;
      sent.push(this.report(w, w.echo, now));
      this.endWatching(w.id, "over");
      this.state.walkers.delete(w.id);
    }
    await Promise.all(sent);
    await this.disconnect();
  }

  private brief(client: Client, raw: unknown) {
    const watch = this.watchers.get(client.sessionId);
    const w = watch ? this.state.walkers.get(watch.body) : this.bodyOf(client);
    if (!w) return;
    const token = raw && typeof raw === "object" ? (raw as { token?: unknown }).token : raw;
    // Nothing, or null: the person said no, or it is not theirs to give any more.
    if (token === null || token === undefined || token === "") {
      w.brief = null;
      // A no while the echo keeps the body (said from outside): it lets go at once, and nothing is reported.
      if (w.echo) {
        this.endWatching(w.id, "over");
        this.state.walkers.delete(w.id);
        this.settleDispose();
      }
      return;
    }
    const brief = verifyBrief(token, secrets(), Date.now());
    // Only the person's own: a brief signed for anyone else is not one this body can be kept by.
    if (!brief || brief.sub !== w.refId) return;
    w.brief = brief;
    // Given while the echo keeps the body (from outside, after a "that was not me"): it acts by it from now.
    if (w.echo) {
      w.echo.brief = brief;
      w.echo.until = Math.min(w.echo.since + keepS() * 1000, brief.exp);
    }
  }

  private pose(client: Client, raw: unknown) {
    const w = this.bodyOf(client);
    const p = readPose(raw);
    if (!w || !p) return;
    const now = Date.now();
    if (w.poseAt && now - w.poseAt < MIN_POSE_GAP_MS) return;
    if (w.placeBy) {
      // Back at a body its echo kept: poses from anywhere else wait for the page to take its place there,
      // and a page that never does (one from before C104) is held to a walk from it after a while.
      if (now < w.placeBy && Math.hypot(p.x - w.x, p.y - w.y) > STAND_IN.jumpM) return;
      w.placeBy = 0;
      w.poseAt = Math.min(w.poseAt, now - 1000 / ROOM.poseHz);
    }
    // Coming back into the village (a first pose, or back from another shore) is a place to come in
    // at, not a step to be held to a walk.
    const at = stepToward(w.here && w.poseAt ? { x: w.x, y: w.y } : null, p, now - w.poseAt);
    const dt = w.poseAt ? now - w.poseAt : 0;
    w.x = at.x;
    w.y = at.y;
    w.yaw = p.yaw;
    w.speed = p.speed;
    w.activity = p.activity;
    w.here = true;
    w.poseAt = now;
    w.trail.take({ x: w.x, y: w.y, yaw: w.yaw, speed: w.speed, activity: p.activity }, dt);
  }

  private say(client: Client, raw: unknown) {
    const w = this.bodyOf(client);
    if (!w || !w.here) return;
    const text = cleanSaid(typeof raw === "object" && raw ? (raw as { text?: unknown }).text : raw);
    if (!text) return;
    const now = Date.now();
    if (now - w.sayAt < ROOM.sayEveryMs) return;
    w.sayAt = now;
    const msg: SaidMsg = { from: w.id, text };
    const hearers = new Set(hearersOf(w.id, w, this.state.walkers.values()).map((h) => h.id));
    for (const c of this.clients) {
      const body = this.seats.get(c.sessionId);
      if (body && hearers.has(body)) c.send(VILLAGE_S2C.SAID, msg);
    }
  }

  /**
   * A line said to one body (C107): to its person alone, when it stands within earshot. To a body its echo
   * keeps, to nobody but whoever watches it from outside, and the echo is not told. The speaker hears
   * nothing back from the room in any case: an answer is the person's to give.
   */
  private talk(client: Client, raw: unknown) {
    const w = this.bodyOf(client);
    if (!w || !w.here || !raw || typeof raw !== "object") return;
    const { to, text: said } = raw as { to?: unknown; text?: unknown };
    const text = cleanSaid(said);
    const them = typeof to === "string" && to !== w.id ? this.state.walkers.get(to) : undefined;
    if (!text || !them || hearersOf(w.id, w, [them]).length === 0) return;
    const now = Date.now();
    if (now - w.sayAt < ROOM.sayEveryMs) return;
    w.sayAt = now;
    if (them.echo) {
      const heard: HeardMsg = { from: w.id, text, at: now };
      this.toWatchers(them.id, VILLAGE_S2C.HEARD, heard);
      void this.answer(them, w.id, text, now);
      return;
    }
    this.told(them, w, text);
  }

  /**
   * A line to one person, from one body (C107), with the room's token for having it read aloud (C110): bound to
   * whom it was said to, the look of the body that said it, the line and the moment, so it voices nothing else.
   */
  private told(to: Walker, from: Walker, text: string): void {
    const msg: SaidMsg = { from: from.id, text };
    const secret = secrets()[0];
    if (secret) {
      const at = Date.now();
      const token = signToldVoice({ sub: to.refId, cell: this.state.cell, room: this.state.code, seed: from.lookSeed, sex: from.sex === "f" ? "f" : "m", age: from.age, text, at }, secret);
      msg.voice = { at, token };
    }
    for (const c of this.clients) if (this.seats.get(c.sessionId) === to.id) c.send(VILLAGE_S2C.TOLD, msg);
  }

  /** Send to whoever watches one body. */
  private toWatchers(body: string, type: string, msg: unknown): void {
    for (const [sessionId, watch] of this.watchers) if (watch.body === body) this.clients.find((c) => c.sessionId === sessionId)?.send(type, msg);
  }

  private talkOf(echo: EchoBody): TalkState {
    let t = this.talks.get(echo);
    if (!t) this.talks.set(echo, (t = { said: 0, busy: false, with: new Map(), would: new Map() }));
    return t;
  }

  /**
   * Someone talked to a body an echo keeps (C109): it answers as far as it has earned talking. At `act` the
   * line goes to the speaker after a typing pause; at `ask`, only with its person watching, it is put to
   * them; below that, nothing. The web app is asked what the person would say and checks the standing too.
   */
  private async answer(body: Walker, speaker: string, text: string, now: number): Promise<void> {
    const echo = body.echo!;
    const level = echo.brief.talk ?? "watch";
    if (level === "watch") return;
    const watched = [...this.watchers.values()].some((w) => w.body === body.id);
    if (level === "ask" && !watched) return;
    const t = this.talkOf(echo);
    const turns = [...(t.with.get(speaker) ?? []), { from: "them" as const, text }].slice(-STAND_IN.talkContext);
    t.with.set(speaker, turns);
    if (t.busy || t.said >= STAND_IN.talkMax) return;
    t.busy = true;
    try {
      const got = await this.askWeb(body.refId, level, turns);
      const line = got ? cleanSaid(got.say ?? "") : null;
      if (!got || !line) return;
      const wait = typingMs(line) - (Date.now() - now);
      // Typing it, as a person would: standing, turned to whoever it is answering (C110).
      const them = level === "act" ? this.state.walkers.get(speaker) : undefined;
      if (them) echo.facing = { yaw: yawToward(body, them), until: Date.now() + Math.max(0, wait) + FACE_AFTER_MS };
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (body.echo !== echo) return;
      if (level === "act") {
        this.sayFor(body, echo, speaker, line, got.sure ?? 0.5, "act");
        return;
      }
      const id = `${body.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      const until = Date.now() + STAND_IN.wouldMs;
      t.would.set(id, { to: speaker, text: line, sure: got.sure ?? 0.5, until });
      this.toWatchers(body.id, VILLAGE_S2C.WOULD, { id, to: speaker, text: line, until } satisfies WouldMsg);
    } finally {
      t.busy = false;
    }
  }

  /** The line said for its person: to the speaker, still within earshot, and into what the echo did. */
  private sayFor(body: Walker, echo: EchoBody, to: string, text: string, sure: number, may: "act" | "ask"): boolean {
    const speaker = this.state.walkers.get(to);
    if (!speaker || hearersOf(body.id, body, [speaker]).length === 0) return false;
    this.told(speaker, body, text);
    // Said, it stays turned to them a moment (C110), as a person does who has just answered.
    echo.facing = { yaw: yawToward(body, speaker), until: Math.max(echo.facing?.until ?? 0, Date.now() + FACE_AFTER_MS) };
    const t = this.talkOf(echo);
    t.said++;
    t.with.set(to, [...(t.with.get(to) ?? []), { from: "me" as const, text }].slice(-STAND_IN.talkContext));
    echo.log.push({ at: Date.now(), kind: TALK_KIND, call: "answer", p: Math.min(1, Math.max(0, sure)), may, did: "answer", said: text });
    echo.met++;
    if (echo.log.length > STAND_IN.logMax) echo.log.shift();
    return true;
  }

  /** Its watching person said "Say it" of a line it would say (C109): said, if it is still in time. */
  private sayIt(client: Client, raw: unknown): void {
    const watch = this.watchers.get(client.sessionId);
    const body = watch ? this.state.walkers.get(watch.body) : undefined;
    const id = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : raw;
    if (!body?.echo || typeof id !== "string") return;
    const t = this.talkOf(body.echo);
    const w = t.would.get(id);
    t.would.delete(id);
    if (!w || w.until < Date.now() || t.said >= STAND_IN.talkMax) return;
    this.sayFor(body, body.echo, w.to, w.text, w.sure, "ask");
  }

  /** What the person would say, from the web app, signed; null when there is nothing to say or no answer. */
  private async askWeb(sub: string, mode: "act" | "ask", turns: SpeakRequest["turns"]): Promise<SpeakAnswer | null> {
    const url = process.env.ECHO_WEB_URL;
    const secret = secrets()[0];
    if (!url || !secret) return null;
    const req: SpeakRequest = { sub, cell: this.state.cell, room: this.state.code, mode, turns, at: Date.now() };
    const body = JSON.stringify(req);
    try {
      const r = await fetch(`${url.replace(/\/$/, "")}/api/echo/speak`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-echo-room": signSpeak(body, secret) },
        body,
        signal: AbortSignal.timeout(STAND_IN.answerWaitMs),
      });
      if (!r.ok) return null;
      const d = (await r.json()) as SpeakAnswer;
      return typeof d?.say === "string" ? { say: d.say, sure: typeof d.sure === "number" ? d.sure : undefined } : null;
    } catch {
      return null;
    }
  }

  // ── one person to another, as to a villager (C110) ─────────────────────────────

  /** Send to every page that moves one body. */
  private toBody(body: string, type: string, msg: unknown): void {
    for (const c of this.clients) if (this.seats.get(c.sessionId) === body) c.send(type, msg);
  }

  /** Whether two bodies are within arm's length, both in the village. */
  private within(a: Walker, b: Walker): boolean {
    return a.here && b.here && Math.hypot(a.x - b.x, a.y - b.y) <= OFFER.reachM;
  }

  /**
   * An offer to someone at arm's length: to give what one carries, offer it in trade, or ask for something for
   * one's help. One open offer from a body at a time. To a body its echo keeps it is not handed on, and lapses.
   */
  private offer(client: Client, raw: unknown): void {
    const w = this.bodyOf(client);
    if (!w || !w.here || !raw || typeof raw !== "object") return;
    const { to, kind, item: rawItem } = raw as { to?: unknown; kind?: unknown; item?: unknown };
    if (!OFFER_KINDS.includes(kind as OfferKind)) return;
    const k = kind as OfferKind;
    const item = itemOf(rawItem);
    if ((k === "ask") !== (item === null)) return;
    const them = typeof to === "string" && to !== w.id ? this.state.walkers.get(to) : undefined;
    if (!them || !this.within(w, them)) return;
    if ([...this.offers.values()].some((o) => o.from === w.id)) return;
    const id = `${w.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const wait = offerWaitMs();
    const until = Date.now() + wait;
    const lapse = this.clock.setTimeout(() => this.settle(id, { ok: false, why: "lapsed" }), wait);
    this.offers.set(id, { from: w.id, to: them.id, kind: k, item, until, lapse });
    if (them.echo) return;
    this.toBody(them.id, VILLAGE_S2C.OFFERED, { id, from: w.id, kind: k, item, until } satisfies OfferedMsg);
  }

  /** An offer ends: both are told, the one who made it with their pack as it now is when it changed. */
  private settle(id: string, end: { ok: boolean; why?: SettledMsg["why"]; back?: string | null; packs?: HandAnswer["packs"] }): void {
    const o = this.offers.get(id);
    if (!o) return;
    this.offers.delete(id);
    o.lapse.clear();
    const base = { id, kind: o.kind, ok: end.ok, ...(end.why ? { why: end.why } : {}), item: o.item, back: end.back ?? null };
    this.toBody(o.from, VILLAGE_S2C.SETTLED, { ...base, side: "from", ...(end.packs ? { pack: end.packs.from } : {}) } satisfies SettledMsg);
    this.toBody(o.to, VILLAGE_S2C.SETTLED, { ...base, side: "to", ...(end.packs ? { pack: end.packs.to } : {}) } satisfies SettledMsg);
  }

  /** The answer to an offer, from the one it was made to: no, or yes and what goes back, made by the web app. */
  private async answerOffer(client: Client, raw: unknown): Promise<void> {
    const w = this.bodyOf(client);
    if (!w || !raw || typeof raw !== "object") return;
    const { id, yes, back: rawBack } = raw as Partial<AnswerMsg>;
    const o = typeof id === "string" ? this.offers.get(id) : undefined;
    if (!o || o.to !== w.id || o.until < Date.now()) return;
    if (yes !== true) return this.settle(id!, { ok: false, why: "no" });
    const back = itemOf(rawBack);
    // A gift is taken as it is; a trade and an ask are answered with something.
    if ((o.kind === "give") !== (back === null)) return;
    const from = this.state.walkers.get(o.from);
    if (!from || from.echo || !this.within(from, w)) return this.settle(id!, { ok: false, why: "gone" });
    // Answered: it cannot lapse while the web app makes it.
    o.lapse.clear();
    o.until = Number.POSITIVE_INFINITY;
    const made = await this.hand({ id: id!, cell: this.state.cell, room: this.state.code, kind: o.kind, from: from.refId, to: w.refId, item: o.item, back, at: Date.now() });
    this.settle(id!, made?.ok ? { ok: true, back, packs: made.packs } : { ok: false, why: "refused", back });
  }

  /** The hand-over, made by the web app between the two packs; null when it could not be asked. */
  private async hand(req: HandRequest): Promise<HandAnswer | null> {
    const url = process.env.ECHO_WEB_URL;
    const secret = secrets()[0];
    if (!url || !secret) return null;
    const body = JSON.stringify(req);
    try {
      const r = await fetch(`${url.replace(/\/$/, "")}/api/village/hand`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-echo-room": signHand(body, secret) },
        body,
        signal: AbortSignal.timeout(OFFER.handMs),
      });
      const d = (await r.json().catch(() => null)) as HandAnswer | null;
      return d && typeof d.ok === "boolean" ? d : null;
    } catch {
      return null;
    }
  }
}
