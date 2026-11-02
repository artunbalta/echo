/**
 * Five minutes to you (DECISIONS C72): the world shown to someone, start to finish, in one sitting.
 * Server-only.
 *
 * OFF UNLESS SWITCHED ON. `ECHO_DEMO=1`, with `ECHO_DEMO_HOST` (the subject whose echo every visitor's
 * meets: the owner's, as the mirror shows it under "Your id here") and `ECHO_DEMO_HOST_NAME`. Without all
 * three there is no `/you` page and every demo route answers 404, so no ordinary visitor ever reaches it.
 * `ECHO_DEMO_CELL` picks the village (Senstrand by default).
 *
 * WHAT A VISIT IS. A fresh identity, a yes to being watched, five minutes of walking while the director
 * sets out what would teach the echo most at a demo's pace (one every forty seconds, not every twenty
 * minutes), and then the visitor's echo meets the host's, at once, with no absence to wait for. The host
 * said yes by setting `ECHO_DEMO_HOST`. Everything else is the world's own: the same measurement, the
 * same gate, the same meeting (C71). A five-minute echo has earned nothing yet, so its lines are what it
 * would have said, and the visitor hears them in their own voice if they gave it.
 *
 * THEIR VOICE, ONLY WITH A YES, AND FOR A DAY. Three sentences read aloud are cloned at ElevenLabs only
 * when the visitor says yes to exactly that. It speaks only their own echo's lines, for them and the host.
 * It is deleted at ElevenLabs within a day (`DEMO.voiceMs`) by a sweep that runs on every demo request
 * and on the daily cron. It is deleted at once when they erase, and the erasure fails if it could not be.
 *
 * AND THE REST OF THE VISIT, WITHIN A DAY TOO, IF THEY DID NOT ERASE IT THEMSELVES: their echo, their
 * meeting, their records. Through the one erasure there is (`/api/account/delete`), called as the visitor
 * with a token this server signs for them, never a second path (db/migrations/README.md: "two erasure
 * paths is one too many").
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { signIdentity } from "@echo/shared/identity";

import type { DemoVisit, EchoMeeting, EchoPair } from "@/lib/echoTypes";
import { cleanName, fillMeeting } from "@/lib/echoMeeting";
import { villageNamed } from "@/lib/moves";
import { identitySecrets } from "@/lib/subject";
import type { VillageStore } from "@/lib/villageStore";
import { removeVoice, voiceOf, type VoiceChoice } from "@/lib/voices";

export const DEMO = {
  /** How long a visit runs, as the page counts it. */
  visitMs: 5 * 60 * 1000,
  /** The earliest a visitor may ask to meet: long enough for a few encounters to teach the echo something. */
  meetAfterMs: 2 * 60 * 1000,
  /** A visitor counts as one for this long after starting: the director's demo pace, and the demo's routes. */
  liveMs: 60 * 60 * 1000,
  /** Their voice is deleted by then. */
  voiceMs: 24 * 60 * 60 * 1000,
  /** And everything else of the visit, if they did not erase it themselves. */
  keepMs: 24 * 60 * 60 * 1000,
  /** Visits erased in one sweep, at most: a sweep rides other requests. */
  sweepVisits: 3,
  /** The director, for a visitor: this long between encounters, and up to this many. */
  directorGapMs: 40_000,
  directorCap: 6,
  /** What they read aloud: enough to clone, not more than a recording should be. */
  audioMinBytes: 8_000,
  audioMaxBytes: 6 * 1024 * 1024,
  defaultCell: "843f6a1ffffffff",
} as const;

const CELL = /^[0-9a-f]{15}$/;

/** The demo's settings, or null when it is not switched on (or not set up enough to run). */
export function demoConfig(): { host: string; hostName: string; cell: string } | null {
  if (process.env.ECHO_DEMO !== "1") return null;
  const host = (process.env.ECHO_DEMO_HOST ?? "").trim();
  const hostName = cleanName(process.env.ECHO_DEMO_HOST_NAME ?? "");
  if (!host || !hostName) return null;
  const cell = CELL.test(process.env.ECHO_DEMO_CELL ?? "") ? process.env.ECHO_DEMO_CELL! : DEMO.defaultCell;
  return { host, hostName, cell };
}

/** How soon a visitor may ask to meet: `ECHO_DEMO_MEET_AFTER_MS` for trying it out, never in production. */
export function meetAfterMs(): number {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") return DEMO.meetAfterMs;
  const v = Number(process.env.ECHO_DEMO_MEET_AFTER_MS);
  return Number.isFinite(v) && v >= 0 ? v : DEMO.meetAfterMs;
}

/** A visitor inside their visit's hour, while the demo is on: null for everyone else. */
export async function liveVisit(store: VillageStore, subject: string, now = Date.now()): Promise<DemoVisit | null> {
  if (!demoConfig()) return null;
  const v = await store.demoVisitOf(subject);
  if (!v) return null;
  return now - Date.parse(v.startedAt) < DEMO.liveMs ? v : null;
}

/**
 * A person's own voice: bound to them by setting (C62, C71), or a demo visitor's own for its day (C72).
 * Null for everyone else, and for a visitor whose voice is past its day or gone.
 */
export async function personVoice(store: VillageStore | null, subject: string, now = Date.now()): Promise<VoiceChoice | null> {
  const bound = voiceOf(subject);
  if (bound) return bound;
  if (!store) return null;
  const v = await store.demoVisitOf(subject);
  if (!v || !v.voiceId || v.voiceDeletedAt || !v.voiceUntil || Date.parse(v.voiceUntil) <= now) return null;
  return { voiceId: v.voiceId, settings: { stability: 0.55, similarity_boost: 0.85, style: 0, use_speaker_boost: true, speed: 1 } };
}

/** Delete every visitor's voice past its day, at ElevenLabs, and say so in the row. Never throws. */
export async function sweepDemoVoices(store: VillageStore, now = Date.now()): Promise<number> {
  let gone = 0;
  try {
    for (const v of (await store.demoVoicesDue(new Date(now).toISOString())) ?? []) {
      if (v.voiceId && (await removeVoice(v.voiceId))) {
        await store.saveDemoVisit({ ...v, voiceDeletedAt: new Date(now).toISOString() });
        gone++;
      }
    }
  } catch (e) {
    console.warn(`[demo] voice sweep failed: ${(e as Error).message}`);
  }
  return gone;
}

/**
 * Erase every visit older than a day, whole, through `/api/account/delete`, as the visitor (a few per
 * sweep). Never throws; returns how many the erasure called complete.
 */
export async function sweepDemoVisits(store: VillageStore, now = Date.now()): Promise<number> {
  let done = 0;
  try {
    const old = (await store.demoVisitsBefore(new Date(now - DEMO.keepMs).toISOString(), DEMO.sweepVisits)) ?? [];
    const key = identitySecrets()[0];
    if (!old.length || !key) return 0;
    const { POST: erase } = await import("@/app/api/account/delete/route");
    for (const v of old) {
      const res = await erase(
        new Request("https://echo.internal/api/account/delete", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${signIdentity(v.subject, key, now)}` },
          body: JSON.stringify({ userId: v.subject }),
        }),
      );
      if (res.ok) done++;
    }
  } catch (e) {
    console.warn(`[demo] visit sweep failed: ${(e as Error).message}`);
  }
  return done;
}

/** Delete one visitor's voice now. False only when there was one and ElevenLabs would not let it go. */
export async function forgetDemoVoice(store: VillageStore, subject: string, now = Date.now()): Promise<boolean> {
  const v = await store.demoVisitOf(subject);
  if (!v || !v.voiceId || v.voiceDeletedAt) return true;
  if (!(await removeVoice(v.voiceId))) return false;
  await store.saveDemoVisit({ ...v, voiceDeletedAt: new Date(now).toISOString() });
  return true;
}

/** The visitor and the host, paired from the start: the host's yes is the setting, the visitor's is the visit. */
export async function demoPair(store: VillageStore, cfg: { host: string; hostName: string }, visit: DemoVisit, now = Date.now()): Promise<EchoPair | null> {
  const find = async () => ((await store.pairsOf(visit.subject)) ?? []).find((p) => p.a === cfg.host || p.b === cfg.host) ?? null;
  const have = await find();
  if (have) return have;
  const pair: EchoPair = { id: `pair_demo_${randomUUID().replace(/-/g, "").slice(0, 12)}`, a: cfg.host, b: visit.subject, aName: cfg.hostName, bName: visit.name, createdAt: new Date(now).toISOString() };
  const added = await store.addPair(pair);
  return added === "added" ? pair : added === "exists" ? find() : null;
}

/**
 * The visitor's echo meets the host's, now: the meeting is the visit itself, from its start until now, in
 * the demo's village, and it is filled at once by the world's own meeting (C71). The same one comes back
 * if asked again. Null when the engine cannot speak for either of them yet.
 */
export async function demoMeeting(store: VillageStore, cfg: { host: string; hostName: string; cell: string }, visit: DemoVisit, now = Date.now()): Promise<EchoMeeting | null> {
  const pair = await demoPair(store, cfg, visit, now);
  if (!pair) return null;
  const mine = (await store.meetingsOf(visit.subject, 20)) ?? [];
  const since = mine.filter((m) => m.pair === pair.id && m.madeAt >= visit.startedAt);
  const made = since.find((m) => m.status === "made");
  if (made) return made;
  let m = since.find((x) => x.status === "planned" || x.status === "making");
  if (!m) {
    m = {
      id: `meet_${pair.id}_${Date.parse(visit.startedAt).toString(36)}`,
      pair: pair.id,
      a: pair.a,
      b: pair.b,
      aName: pair.aName,
      bName: pair.bName,
      status: "planned",
      from: visit.startedAt,
      to: new Date(now).toISOString(),
      cell: cfg.cell,
      village: villageNamed(cfg.cell)?.name ?? null,
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
    if (!(await store.claimMeeting(m))) m = ((await store.meetingsOf(visit.subject, 20)) ?? []).find((x) => x.id === m!.id) ?? m;
    if (m.status === "made") return m;
  }
  return fillMeeting(store, m, now);
}
