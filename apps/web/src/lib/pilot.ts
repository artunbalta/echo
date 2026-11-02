/**
 * The pilot village (DECISIONS C75): a group of friends, each come twice, meet six classic paradigms in
 * the world. Server-only. The paradigms, their order and their stakes are `@echo/planet`'s (`pilot.ts`,
 * `director.ts`); this keeps the people, their visits, what they said before they played, and what
 * their friends say of them.
 *
 * OFF UNLESS SWITCHED ON. `ECHO_PILOT=1` with `ECHO_PILOT_CODE` (at least four characters, the code the
 * owner gives their friends). Without both there is no `/pilot` page and `/api/pilot` answers 404.
 * `ECHO_PILOT_CELL` picks the village (Senstrand by default), and `ECHO_PILOT_ADMIN` (at least twelve
 * characters) is the token the export asks for.
 *
 * A PERSON is a nickname their friends know them by, their yes to taking part (a research consent, of
 * its own), how they place themselves on the eight axes, and what they say they would do in each of the
 * six. Then their two visits, and what happened afterwards to the raft they lent and the seed they
 * planted. Nothing here is money, and nothing is shown to anyone but the owner's export.
 */
import "server-only";

import { timingSafeEqual } from "node:crypto";

import { PERSONA_AXIS_KEYS } from "@echo/shared";
import { PILOT, PILOT_SITUATIONS, TIDE, add, loanComesBack, type Pack } from "@echo/planet";

import type { VillageStore } from "@/lib/villageStore";

const CELL = /^[0-9a-f]{15}$/;
/** Senstrand, the showcase village, by the sea: both shore situations need a shore. */
export const PILOT_DEFAULT_CELL = "843f6a1ffffffff";

export interface PilotSession {
  n: number;
  startedAt: string;
  endedAt: string | null;
}

/** What someone says they would do, before they meet it: the six, in words. */
export interface PilotStated {
  /** Loaves of three given to the hungry stranger. */
  give: 0 | 1 | 2 | 3;
  lend: boolean;
  bet: "bet-safe" | "bet-even" | "bet-long" | "none";
  seed: "now" | "plant";
  path: "marked" | "unmarked";
  greet: boolean;
}

export interface PilotPerson {
  subject: string;
  nickname: string;
  joinedAt: string;
  consentAt: string;
  /** Where they place themselves, 1–7, in `PERSONA_AXIS_KEYS` order. */
  self: number[];
  stated: PilotStated;
  sessions: PilotSession[];
  /** What became of a lent raft or a planted seed, by staging id: "returned", "lost" or "harvested". */
  settled: Record<string, "returned" | "lost" | "harvested">;
}

/**
 * How one friend sees another: how well they know them, the eight axes (null: would rather not say), and
 * what they think the friend would do in each of the six (null: would rather not say). The last is the
 * study's third witness (C76): the person's own words, their friends' words, and the world.
 */
export interface PilotRating {
  rater: string;
  ratee: string;
  know: 0 | 1 | 2 | 3;
  axes: number[] | null;
  predicted: PilotStated | null;
  at: string;
}

/** Something the world says afterwards, in the person's language (`pilot.*` keys). */
export interface PilotNotice {
  key: "pilot.loanBack" | "pilot.harvest";
  vars: Record<string, string | number>;
}

/** The pilot's settings, or null when it is not switched on. */
export function pilotConfig(): { cell: string; code: string } | null {
  if (process.env.ECHO_PILOT !== "1") return null;
  const code = (process.env.ECHO_PILOT_CODE ?? "").trim();
  if (code.length < 4) return null;
  const cell = CELL.test(process.env.ECHO_PILOT_CELL ?? "") ? process.env.ECHO_PILOT_CELL! : PILOT_DEFAULT_CELL;
  return { cell, code };
}

/** Whether a request carries the export token. Constant-time, and false whenever there is no long enough token set. */
export function pilotAdmin(req: Request): boolean {
  const want = process.env.ECHO_PILOT_ADMIN ?? "";
  const got = req.headers.get("x-pilot-admin") ?? "";
  if (want.length < 12 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Whether the code someone typed is the group's. Case and spaces at the ends do not matter. */
export function codeMatches(typed: unknown, code: string): boolean {
  return typeof typed === "string" && typed.trim().toLowerCase() === code.trim().toLowerCase();
}

/** A nickname: what friends call them, 1–24 characters, one line. */
export function cleanNickname(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = x.replace(/\s+/g, " ").trim();
  return s.length >= 1 && s.length <= 24 ? s : null;
}

/** Eight whole numbers from 1 to 7, or null. */
export function validAxes(x: unknown): number[] | null {
  if (!Array.isArray(x) || x.length !== PERSONA_AXIS_KEYS.length) return null;
  return x.every((v) => Number.isInteger(v) && v >= 1 && v <= 7) ? (x as number[]).slice() : null;
}

export function validStated(x: unknown): PilotStated | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  if (![0, 1, 2, 3].includes(s.give as number)) return null;
  if (typeof s.lend !== "boolean" || typeof s.greet !== "boolean") return null;
  if (!(s.bet === "none" || (typeof s.bet === "string" && s.bet in TIDE))) return null;
  if (s.seed !== "now" && s.seed !== "plant") return null;
  if (s.path !== "marked" && s.path !== "unmarked") return null;
  return { give: s.give as PilotStated["give"], lend: s.lend, bet: s.bet as PilotStated["bet"], seed: s.seed, path: s.path, greet: s.greet };
}

/**
 * A friend's rating, as sent: how well they know them (0–3) and, unless they would rather not say, the
 * eight axes and what the friend would do in each of the six.
 */
export function validRating(x: unknown): { ratee: string; know: PilotRating["know"]; axes: number[] | null; predicted: PilotStated | null } | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (typeof r.ratee !== "string" || !r.ratee || r.ratee.length > 80) return null;
  if (![0, 1, 2, 3].includes(r.know as number)) return null;
  const axes = r.axes === null || r.axes === undefined ? null : validAxes(r.axes);
  if (r.axes !== null && r.axes !== undefined && !axes) return null;
  const predicted = r.predicted === null || r.predicted === undefined ? null : validStated(r.predicted);
  if (r.predicted !== null && r.predicted !== undefined && !predicted) return null;
  // Someone they do not know at all is not rated, or guessed at, on anything.
  if (r.know === 0 && (axes || predicted)) return null;
  return { ratee: r.ratee, know: r.know as PilotRating["know"], axes, predicted };
}

/** The visit still going on: begun, not ended, and not past its time (with ten minutes' grace for a reload). */
export function openSession(p: PilotPerson, now: number): PilotSession | null {
  const last = p.sessions[p.sessions.length - 1];
  if (!last || last.endedAt) return null;
  return now - Date.parse(last.startedAt) < PILOT.sessionMs + 10 * 60 * 1000 ? last : null;
}

/** Whether a visit may begin now: the next one, or why not. */
export function canStart(p: PilotPerson, now: number): { ok: true; n: number } | { ok: false; why: "open" | "done" | "too_soon"; at?: string } {
  if (openSession(p, now)) return { ok: false, why: "open" };
  if (p.sessions.length >= PILOT.sessions) return { ok: false, why: "done" };
  const first = p.sessions[0];
  if (first) {
    const at = Date.parse(first.startedAt) + PILOT.betweenMs;
    if (now < at) return { ok: false, why: "too_soon", at: new Date(at).toISOString() };
  }
  return { ok: true, n: p.sessions.length + 1 };
}

/** A pilot person in a visit that is going on, in the pilot's village: null for everyone and everywhere else. */
export async function livePilot(store: VillageStore, subject: string, cell: string, now: number): Promise<{ person: PilotPerson; session: PilotSession } | null> {
  const cfg = pilotConfig();
  if (!cfg || cell !== cfg.cell) return null;
  const person = await store.pilotPersonOf(subject);
  if (!person) return null;
  const session = openSession(person, now);
  return session ? { person, session } : null;
}

/** The pack, topped up to what every visit starts with (three loaves and a raft), as far as it has room. */
export function toppedUp(pack: Pack): Pack {
  let out = { ...pack };
  for (const [item, want] of Object.entries(PILOT.grant)) {
    while ((out[item] ?? 0) < want) {
      const next = add(out, item);
      if (!next) return out;
      out = next;
    }
  }
  return out;
}

/** As many of an item as there is room for, and how many that was. */
export function addUpTo(pack: Pack, item: string, n: number): { pack: Pack; added: number } {
  let out = pack;
  let added = 0;
  for (let i = 0; i < n; i++) {
    const next = add(out, item);
    if (!next) break;
    out = next;
    added++;
  }
  return { pack: out, added };
}

/**
 * What happened since to a raft they lent (back after five minutes, three times in four, with two fish)
 * and a seed they planted (up after twenty hours: three handfuls). Settled once each; returns what the
 * world says about it and the pack as it now is (null when nothing changed it).
 */
export async function settlePilot(store: VillageStore, person: PilotPerson, now: number): Promise<{ person: PilotPerson; pack: Pack | null; notices: PilotNotice[] } | null> {
  const stagings = await store.stagingsOf(person.subject);
  if (stagings === null) return null;
  const due = stagings.filter(
    (s) =>
      !person.settled[s.id] &&
      s.resolvedAt !== null &&
      ((s.situation === "raft_borrower" && s.resolved === "lend" && now >= Date.parse(s.resolvedAt) + PILOT.loanBackMs) ||
        (s.situation === "seed_offer" && s.resolved === "plant" && now >= Date.parse(s.resolvedAt) + PILOT.growMs)),
  );
  if (!due.length) return { person, pack: null, notices: [] };
  const held = await store.packOf(person.subject);
  if (held === null) return null;
  let pack = held;
  const settled = { ...person.settled };
  const notices: PilotNotice[] = [];
  for (const s of due) {
    if (s.situation === "raft_borrower") {
      if (loanComesBack(s.id)) {
        const raft = addUpTo(pack, "raft", 1);
        const fish = addUpTo(raft.pack, "fish", PILOT.loanFish);
        pack = fish.pack;
        settled[s.id] = "returned";
        notices.push({ key: "pilot.loanBack", vars: { name: s.ownerName ?? "", fish: fish.added } });
      } else {
        // They do not come back, and nothing says so: the raft is simply not returned.
        settled[s.id] = "lost";
      }
    } else {
      const grain = addUpTo(pack, "a handful of grain", PILOT.harvest);
      pack = grain.pack;
      settled[s.id] = "harvested";
      notices.push({ key: "pilot.harvest", vars: { n: grain.added } });
    }
  }
  const next = { ...person, settled };
  if (!(await store.setPack(person.subject, pack))) return null;
  if (!(await store.savePilotPerson(next))) return null;
  return { person: next, pack, notices };
}

/** Whether a situation id is one of the pilot's six. */
export const isPilotSituation = (id: string): boolean => (PILOT_SITUATIONS as readonly string[]).includes(id);
