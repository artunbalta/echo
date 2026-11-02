/**
 * Two echoes meeting while both their people are away (DECISIONS C71). Server-only.
 *
 * WHO. Only two people who have both said yes: one makes a code, the other accepts it (`echo_pairs`).
 * Either can end it. Nobody's echo meets a stranger's this way, only someone its person knows.
 *
 * WHEN. There is no worker, as with the outings (C64): an absence is found when someone comes back. On
 * coming back (`/api/echo/away`, `back`), for each pair whose other person is away right now and has been
 * long enough, the overlap of the two absences is a meeting, PLANNED there and then, before the return is
 * recorded: no model is called, so the return answers as fast as it did. Its id is the pair and the
 * overlap's start, which both compute alike, and it is written only if nobody has written it, so two
 * people coming back in the same moment plan it once. The page then asks
 * (`/api/echo/meet`, `back`), and the meeting is FILLED, by whichever of the two asks first; a fill is taken
 * by exactly one caller, and one that died is taken over.
 *
 * WHERE. In a village one of them was last in, on its green, at a daytime hour inside the overlap.
 *
 * WHAT IS SAID. Each line is its own echo's, from the engine (`/agent/turn`), as in the outings: spoken AS
 * the person, from their posterior and their past, and put to THEIR gate, in the same buckets (a first
 * greeting, then small talk), so trust earned with villagers holds here and the person's answers here
 * train what the echo may say there. Up to six lines, taking turns, about what the village was talking
 * about that day if anything.
 *
 * THE GATE IS KEPT, and that decides what a meeting is. A line its gate lets through is SAID aloud in the
 * village; villagers nearby see the two of them talk (`witnesses`), and may mention it later. A line held
 * back is only what the echo WOULD have said: kept, and shown to ITS OWN person, marked so, and never to the
 * other one. The gate holds a line back so that nobody is misrepresented by it, and the person most likely
 * to be misled by it is the friend it was meant for; so the friend sees that something was held back, and
 * not what. The other echo answers what was drafted either way, so the conversation runs on. Two echoes
 * nobody has trained yet hold back every line: their first meeting is a rehearsal each person sees their
 * own half of, and each person's answers are what lets the next one be said.
 *
 * WHAT EACH ECHO IS TOLD: where, when, who it has run into (the name the other person gave), what the
 * village is talking about, and what has been said so far. Nothing of either person's life with the
 * villagers: no memory, no deed, no conversation. Nothing it says changes anything (L3), and nothing it
 * says is measured: its words are not the person.
 */
import "server-only";

import { randomInt } from "node:crypto";

import { comingOn, timeOfDay, witnessesOf, worldClock, worldDayIndex, WORLD_DAY_S, WORLD_EPOCH, type LifeChange, type SettledParcel } from "@echo/planet";

import type { EchoMeeting, EchoPair, MeetingLine } from "@/lib/echoTypes";
import { sideOf } from "@/lib/meetingWords";
import { OUTING, spokenOnly } from "@/lib/echoOuting";
import { agentTurn } from "@/lib/ml";
import { villageNamed } from "@/lib/moves";
import { loadVillage } from "@/lib/villageTalk";
import type { VillageStore } from "@/lib/villageStore";

export const MEETING = {
  /** Lines in one meeting, at most: three each. */
  lines: 6,
  /** No new engine turn is begun after this long into filling one, inside the route's sixty seconds. */
  deadlineMs: 40_000,
  /** A fill begun this long ago and never finished is taken over. */
  staleMs: 2 * 60 * 1000,
  /** A meeting is told for this long: a week, as an outing is. */
  unreadMs: 7 * 24 * 60 * 60 * 1000,
  /** Each echo stands this far either side of the meeting's middle. */
  apartM: 0.9,
  /** An invite code lasts a day, and is used once. */
  inviteMs: 24 * 60 * 60 * 1000,
  /** What someone may call themselves for the other person. */
  nameChars: 40,
  /** Pairs one person may have. */
  pairs: 12,
  /** Villagers who saw it, at most. */
  witnesses: 12,
} as const;

const CLOCK = worldClock(WORLD_EPOCH);

function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The outings' own knobs (`ECHO_AWAY_MS`, `ECHO_OUTING_GAP_MS`), never honoured in production. */
const knob = (name: string, fallback: number) => {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return fallback;
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const awayMs = () => knob("ECHO_AWAY_MS", OUTING.awayMs);
const gapMs = () => knob("ECHO_OUTING_GAP_MS", OUTING.gapMs);

// ── invites and pairs ───────────────────────────────────────────────────────────

/** Letters nobody misreads: no 0/O, no 1/I/L. */
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newInviteCode(): string {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
  return c;
}

/** A code as someone typed it, with or without the dash, in any case; null when it cannot be one. */
export function readCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-KM-NP-Z2-9]{6}$/.test(c) ? c : null;
}

/** "K7QA4M" shown as "K7Q-A4M". */
export const showCode = (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`;

/** The name someone gives the other person: one line, printable, 1 to 40 characters; null otherwise. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= MEETING.nameChars ? n : null;
}

/** The other person in a pair, as the caller sees them. */
export function otherIn(p: Pick<EchoPair, "a" | "b" | "aName" | "bName">, subject: string): { subject: string; name: string } {
  return p.a === subject ? { subject: p.b, name: p.bName } : { subject: p.a, name: p.aName };
}

// ── planning ────────────────────────────────────────────────────────────────────

/**
 * On coming back from `away`: a meeting for each pair whose other person is away now, and has been for
 * long enough that the two absences overlap by an absence's length, unless the pair met within the
 * outings' gap. Written only if nobody has written it. No model is called here. Never throws.
 */
export async function planMeetings(store: VillageStore, subject: string, away: { from: number; to: number; cell: string }, now = Date.now()): Promise<EchoMeeting[]> {
  const out: EchoMeeting[] = [];
  try {
    const pairs = (await store.pairsOf(subject)) ?? [];
    if (!pairs.length) return out;
    const mine = (await store.meetingsOf(subject, 50)) ?? null;
    if (mine === null) return out;
    for (const p of pairs) {
      const other = otherIn(p, subject);
      const seen = await store.seenOf(other.subject);
      if (!seen) continue;
      // Both away, together, for an absence's length. This also says the other is away now, or was until
      // this absence ended: someone here a minute ago overlaps by a minute at most.
      const from = Math.max(away.from, Date.parse(seen.at));
      const to = Math.min(away.to, now);
      if (to - from < awayMs()) continue;
      if (mine.some((m) => m.pair === p.id && now - Date.parse(m.madeAt) < gapMs())) continue;
      const cell = [away.cell, seen.cell].find((c) => villageNamed(c) !== null) ?? null;
      const m: EchoMeeting = {
        // The overlap's start, which both people compute alike: whichever plans first, it is one meeting.
        id: `meet_${p.id}_${from.toString(36)}`,
        pair: p.id,
        a: p.a,
        b: p.b,
        aName: p.aName,
        bName: p.bName,
        status: "planned",
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        cell,
        village: cell ? (villageNamed(cell)?.name ?? null) : null,
        day: null,
        hour: null,
        x: null,
        y: null,
        topic: null,
        lines: [],
        witnesses: [],
        madeAt: new Date(now).toISOString(),
        makingAt: null,
        readA: null,
        readB: null,
        feedbackA: {},
        feedbackB: {},
        reason: null,
      };
      if (await store.claimMeeting(m)) out.push(m);
    }
  } catch (e) {
    console.warn(`[meet] planning failed: ${(e as Error).message}`);
  }
  return out;
}

// ── filling ─────────────────────────────────────────────────────────────────────

/**
 * A daytime moment inside the overlap, near its middle: the green is empty at night. A world day is twelve
 * real minutes, so any overlap long enough to be a meeting holds daylight.
 */
export function meetingTime(from: number, to: number, seed: string): { at: number; day: number; hour: number } {
  const step = (WORLD_DAY_S * 1000) / 48;
  const mid = from + (to - from) * (0.35 + 0.3 * unit(`${seed}|when`));
  for (let k = 0; k <= 96; k++) {
    for (const t of [mid + k * step, mid - k * step]) {
      if (t < from || t > to) continue;
      const hour = timeOfDay(CLOCK, t);
      if (hour >= 0.36 && hour <= 0.74) return { at: Math.round(t), day: worldDayIndex(CLOCK, t), hour };
    }
  }
  return { at: Math.round(mid), day: worldDayIndex(CLOCK, mid), hour: timeOfDay(CLOCK, mid) };
}

/** Where on the green: a few metres from its middle, the same every time for one meeting. */
export function meetingSpot(village: SettledParcel, seed: string): { x: number; y: number } {
  const c = village.plan.centre;
  const a = unit(`${seed}|where`) * Math.PI * 2;
  const r = 2 + 3 * unit(`${seed}|far`);
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
}

/** Where each echo stands: a step either side of the spot, facing each other. */
export function standing(m: Pick<EchoMeeting, "id" | "x" | "y">): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  if (m.x === null || m.y === null) return null;
  const a = unit(`${m.id}|facing`) * Math.PI * 2;
  const dx = Math.cos(a) * MEETING.apartM;
  const dy = Math.sin(a) * MEETING.apartM;
  return { a: { x: m.x - dx, y: m.y - dy }, b: { x: m.x + dx, y: m.y + dy } };
}

/** What the village is talking about that day, by what would be on anyone's lips first; null for none. */
export function topicOf(s: SettledParcel["settlement"], plan: SettledParcel["plan"], day: number, changes: readonly LifeChange[]): string | null {
  const order = ["ailing", "omen", "funeral", "wedding", "naming", "expecting"] as const;
  const coming = comingOn(s, plan, day, changes).filter((c) => c.day === day || c.kind === "expecting" || c.kind === "ailing");
  for (const kind of order) {
    const c = coming.find((x) => x.kind === kind);
    if (c) return c.words;
  }
  return null;
}

const hourWords = (h: number) => (h < 0.42 ? "in the morning" : h < 0.58 ? "around midday" : h < 0.7 ? "in the afternoon" : "towards evening");

/** How an echo walks up, the first time it speaks. */
export const MEETING_OPENING = (name: string) => `(You see ${name} across the green, and walk over.)`;

/**
 * What an echo is told before it speaks: where, when, whom it has run into, what the village is talking
 * about, and what has been said so far. Nothing of its person's life with the villagers, and nothing of the
 * other person's.
 */
export function meetingContext(args: { village: string; hour: number; otherName: string; topic: string | null; metBefore: boolean; so: { mine: boolean; text: string }[] }): string {
  const { village, hour, otherName, topic } = args;
  const so = args.so.length ? `\nSo far:\n${args.so.map((l) => `${l.mine ? "You" : otherName}: ${l.text}`).join("\n")}` : "";
  return (
    `You are the stranger, in ${village}, a village by the sea, ${hourWords(hour)}. You have run into ${otherName} on the green: someone you know from before, who is a stranger here too.` +
    (topic ? ` In ${village} today, everyone is talking about this: ${topic}.` : "") +
    (args.metBefore ? ` You have met ${otherName} in this world before.` : "") +
    so +
    `\nAnswer with only the words you would say aloud to ${otherName}, a sentence or two: no actions, no narration, no quotation marks.`
  );
}

/** The village to meet in: the one planned, else either person's house, else where either last talked. */
async function meetingVillage(store: VillageStore, m: EchoMeeting, at: number): Promise<{ cell: string; village: SettledParcel; changes: LifeChange[] } | null> {
  const tried = new Set<string>();
  const homes = [(await store.homeOf(m.a))?.cell ?? null, (await store.homeOf(m.b))?.cell ?? null];
  const talked = [...((await store.metBy(m.a, 3)) ?? []), ...((await store.metBy(m.b, 3)) ?? [])].map((x) => x.cell);
  for (const c of [m.cell, ...homes, ...talked]) {
    if (!c || tried.has(c)) continue;
    tried.add(c);
    const l = await loadVillage(c, at);
    if (l) return { cell: c, village: l.village, changes: l.changes };
  }
  return null;
}

/**
 * Fill a planned meeting, if this caller is the one to take it. Null when someone else has it, or when the
 * engine could not speak for either of them (the meeting goes back to `planned`, to be filled when it can:
 * a stand-in's words are nobody's). Never throws.
 */
export async function fillMeeting(store: VillageStore, planned: EchoMeeting, now = Date.now()): Promise<EchoMeeting | null> {
  const nowIso = new Date(now).toISOString();
  if (!(await store.takeMeeting(planned.id, new Date(now - MEETING.staleMs).toISOString(), nowIso))) return null;
  const m: EchoMeeting = { ...planned, status: "making", makingAt: nowIso };
  const began = Date.now();
  const giveBack = async (reason: string) => {
    await store.saveMeeting({ ...m, status: "planned", makingAt: null, reason });
    return null;
  };
  try {
    const when = meetingTime(Date.parse(m.from), Date.parse(m.to), m.id);
    const where = await meetingVillage(store, m, when.at);
    if (!where) {
      const failed: EchoMeeting = { ...m, status: "failed", reason: "no_village" };
      await store.saveMeeting(failed);
      return failed;
    }
    const s = where.village.settlement;
    const spot = meetingSpot(where.village, m.id);
    const topic = topicOf(s, where.village.plan, when.day, where.changes);
    const before = ((await store.meetingsOf(m.a, 50)) ?? []).filter((x) => x.pair === m.pair && x.id !== m.id && x.status === "made" && x.lines.length > 0);
    const metBefore = before.length > 0;
    const first: "a" | "b" = unit(`${m.id}|first`) < 0.5 ? "a" : "b";
    const lines: MeetingLine[] = [];
    for (let k = 0; k < MEETING.lines; k++) {
      if (Date.now() - began > MEETING.deadlineMs) break;
      const who: "a" | "b" = k % 2 === 0 ? first : first === "a" ? "b" : "a";
      const subject = who === "a" ? m.a : m.b;
      const otherName = who === "a" ? m.bName : m.aName;
      const spoken = lines.filter((l) => l.who === who).length;
      const heard = lines.at(-1)?.text ?? null;
      const context = meetingContext({ village: s.name, hour: when.hour, otherName, topic, metBefore, so: lines.map((l) => ({ mine: l.who === who, text: l.text })) });
      const bucket = spoken === 0 && !metBefore ? "first_greeting" : "smalltalk";
      const t = await agentTurn({ userId: subject, context, userMessage: heard ?? MEETING_OPENING(otherName), bucket, stakes: "low" });
      if (t.mocked) return giveBack("no_engine");
      const words = spokenOnly(t.action).slice(0, 400);
      if (!words) break;
      lines.push({
        who,
        text: words,
        said: t.decision === "auto",
        turn: { line: words, bucket, context, confidence: t.confidence, p_hat: t.p_hat, tau: t.tau, decision: t.decision, explored: t.explored },
      });
    }
    if (lines.length < 2) return giveBack("nothing_said");
    const anySaid = lines.some((l) => l.said);
    const made: EchoMeeting = {
      ...m,
      status: "made",
      cell: where.cell,
      village: s.name,
      day: when.day,
      hour: when.hour,
      x: spot.x,
      y: spot.y,
      topic,
      lines,
      // Seen only when something was said aloud: two people standing silent are two people standing.
      witnesses: anySaid ? witnessesOf(s, where.village.plan, when.day, when.hour, spot, where.changes).slice(0, MEETING.witnesses) : [],
      makingAt: null,
      reason: null,
    };
    if (!(await store.saveMeeting(made))) return giveBack("not_recorded");
    return made;
  } catch (e) {
    console.warn(`[meet] filling ${m.id} failed: ${(e as Error).message}`);
    return giveBack("error");
  }
}

// ── showing ─────────────────────────────────────────────────────────────────────

/** Meetings made and not yet told to this person, newest first. */
export function untoldMeetings(meetings: readonly EchoMeeting[], subject: string, now: number): EchoMeeting[] {
  return meetings.filter((m) => {
    const side = sideOf(m, subject);
    if (!side || m.status !== "made") return false;
    return (side === "a" ? m.readA : m.readB) === null && now - Date.parse(m.madeAt) < MEETING.unreadMs;
  });
}

/**
 * A line as one person's page is shown it: their own with the gate's reading; the other's with none of it,
 * and with no words at all when it was held back (`text` empty), since its own person never let it be said.
 */
export interface ShownLine {
  mine: boolean;
  text: string;
  said: boolean;
  feedback: boolean | null;
  p_hat?: number;
  tau?: number;
  explored?: boolean;
}

export interface ShownMeeting {
  id: string;
  /** The other person, by the name they gave. */
  friend: string;
  /** Which body is whose, where they stood. */
  side: "a" | "b";
  cell: string | null;
  village: string | null;
  day: number | null;
  hour: number | null;
  stand: { me: { x: number; y: number }; friend: { x: number; y: number } } | null;
  topic: string | null;
  lines: ShownLine[];
  /** How many villagers saw them talk. */
  seenBy: number;
  told: string;
  madeAt: string;
}

/** The meeting in the echo's own words, first person, short, and only what happened. */
export function meetingNarration(m: Pick<EchoMeeting, "village" | "topic" | "lines">, friend: string, side: "a" | "b"): string {
  const parts = [`While you were both away, I met ${friend}'s echo${m.village ? ` in ${m.village}` : ""}.`];
  if (m.topic) parts.push(`Everyone there was talking about it: ${m.topic.charAt(0).toLowerCase()}${m.topic.slice(1)}.`);
  const said = m.lines.filter((l) => l.said);
  if (said.length === 0) parts.push(`Neither of us said anything aloud: we are not sure yet what you would say. Here is what I would have said; what ${friend}'s echo would have said is theirs to see.`);
  else if (said.length < m.lines.length) parts.push(`Some of it we said aloud${m.lines.some((l) => l.who === side && !l.said) ? "; what I held back is marked" : ""}.`);
  return parts.join(" ");
}

export function shownMeeting(m: EchoMeeting, subject: string): ShownMeeting | null {
  const side = sideOf(m, subject);
  if (!side) return null;
  const friend = side === "a" ? m.bName : m.aName;
  const st = standing(m);
  return {
    id: m.id,
    friend,
    side,
    cell: m.cell,
    village: m.village,
    day: m.day,
    hour: m.hour,
    stand: st ? { me: side === "a" ? st.a : st.b, friend: side === "a" ? st.b : st.a } : null,
    topic: m.topic,
    lines: m.lines.map((l, i) =>
      l.who === side
        ? { mine: true, text: l.text, said: l.said, feedback: (side === "a" ? m.feedbackA : m.feedbackB)[String(i)] ?? null, p_hat: l.turn.p_hat, tau: l.turn.tau, explored: l.turn.explored }
        : // The other person's gate, confidence and context stay theirs, and so do the words it held back.
          { mine: false, text: l.said ? l.text : "", said: l.said, feedback: null },
    ),
    seenBy: m.witnesses.length,
    told: meetingNarration(m, friend, side),
    madeAt: m.madeAt,
  };
}

export { seenTalkingLine, sideOf } from "@/lib/meetingWords";
