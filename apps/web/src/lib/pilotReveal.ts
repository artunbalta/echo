/**
 * Who knew you best (DECISIONS C80): the pilot's debrief, after a person's last visit.
 *
 * For each of the six, side by side:
 * - what they said they would do, before they met any of them;
 * - what their friends guessed (the median, and only when at least two friends guessed, so that no one
 *   friend's guess can be read off);
 * - what their echo guessed from the visits before the last;
 * - what they did on the last visit.
 *
 * The echo here is the two-layer echo of the paper in its one-kind form (research/deeds/deeds/theory.py).
 * It starts from the crowd (the others' first visits, or one half until three others have been) and moves
 * towards the person's own mean by κ = nρ / (nρ + 1 − ρ) after n looks. It does not read the person's
 * self-rating: on the public evidence that adds next to nothing (research/deeds, Studies 1–2). Pure, so
 * it is tested without a store. The codes are the research's own (research/pilot/echo_pilot/paradigms.py),
 * so this page and the analysis read a choice the same way.
 */
import type { Staging } from "@echo/planet";

import type { PilotPerson, PilotRating, PilotStated } from "@/lib/pilot";

export const PARADIGMS = ["give", "lend", "bet", "seed", "path", "greet"] as const;
export type Paradigm = (typeof PARADIGMS)[number];

const SITUATION: Record<Paradigm, string> = {
  give: "hungry_stranger",
  lend: "raft_borrower",
  bet: "tide_fisher",
  seed: "seed_offer",
  path: "overgrown_path",
  greet: "lone_traveler",
};
const PARADIGM_OF: Record<string, Paradigm> = Object.fromEntries(PARADIGMS.map((p) => [SITUATION[p], p]));

/** What an answer is worth, 0..1 in the direction of the paradigm's name. Absent: it says nothing. */
const ACTION: Record<Paradigm, Record<string, number>> = {
  give: { "give-one": 1 / 3, "give-two": 2 / 3, "give-all": 1, passed: 0 },
  lend: { lend: 1, keep: 0, passed: 0 },
  bet: { "bet-safe": 0, "bet-even": 0.5, "bet-long": 1, passed: 0 },
  seed: { now: 0, plant: 1 },
  path: { follow: 1, passed: 0 },
  greet: { greet: 1, passed: 0 },
};

/** How steady one choice of a kind is from one visit to the next: the pilot's assumption (.5–.7, C77), taken in the middle. */
export const RHO = 0.6;
/** No friends' column below this many friends' guesses: one friend's guess would be readable. */
export const MIN_FRIENDS = 2;
/** The crowd needs this many others before it is the crowd; below, the echo starts from one half. */
export const MIN_CROWD = 3;

export function codeAction(p: Paradigm, resolved: string | null): number | null {
  if (resolved === null) return null;
  const v = ACTION[p][resolved];
  return v === undefined ? null : v;
}

export function codeStated(stated: PilotStated | null): Record<Paradigm, number | null> {
  if (!stated) return { give: null, lend: null, bet: null, seed: null, path: null, greet: null };
  return {
    give: [0, 1, 2, 3].includes(stated.give) ? stated.give / 3 : null,
    lend: typeof stated.lend === "boolean" ? (stated.lend ? 1 : 0) : null,
    bet: ({ "bet-safe": 0, "bet-even": 0.5, "bet-long": 1, none: 0 } as Record<string, number>)[stated.bet] ?? null,
    seed: ({ now: 0, plant: 1 } as Record<string, number>)[stated.seed] ?? null,
    path: ({ marked: 0, unmarked: 1 } as Record<string, number>)[stated.path] ?? null,
    greet: typeof stated.greet === "boolean" ? (stated.greet ? 1 : 0) : null,
  };
}

/** Which visit a staging was set out in (the research's `visit_of`): from a minute before it began to ten after it ended. */
export function visitOf(createdAt: string, sessions: PilotPerson["sessions"]): number | null {
  const t = Date.parse(createdAt);
  for (const s of sessions) {
    const start = Date.parse(s.startedAt);
    const end = s.endedAt ? Date.parse(s.endedAt) : start + 35 * 60_000;
    if (start - 60_000 <= t && t <= end + 10 * 60_000) return s.n;
  }
  return null;
}

/** What a person did, by paradigm and visit: the first answered staging of each kind in each visit. */
export function choices(stagings: readonly Staging[], sessions: PilotPerson["sessions"]): Record<Paradigm, Map<number, number>> {
  const out = Object.fromEntries(PARADIGMS.map((p) => [p, new Map<number, number>()])) as Record<Paradigm, Map<number, number>>;
  for (const s of [...stagings].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    const p = PARADIGM_OF[s.situation];
    if (!p) continue;
    const v = visitOf(s.createdAt, sessions);
    const code = codeAction(p, s.resolved);
    if (v !== null && code !== null && !out[p].has(v)) out[p].set(v, code);
  }
  return out;
}

/** The echo's guess after n looks with mean x̄, from the crowd's c: c + κ(x̄ − c), κ = nρ / (nρ + 1 − ρ). */
export function echoGuess(looks: readonly number[], crowd: number, rho: number = RHO): number {
  const n = looks.length;
  if (n === 0) return crowd;
  const mean = looks.reduce((a, b) => a + b, 0) / n;
  const k = (n * rho) / (n * rho + 1 - rho);
  return crowd + k * (mean - crowd);
}

/** How much of what is knowable about one kind of choice the echo knows after n looks: nρ / (nρ + 1 − ρ). */
export function knowing(n: number, rho: number = RHO): number {
  return n <= 0 ? 0 : (n * rho) / (n * rho + 1 - rho);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export type Witness = "said" | "friends" | "echo";

export interface RevealRow {
  paradigm: Paradigm;
  said: number | null;
  friends: number | null;
  /** How many friends guessed (shown when fewer than MIN_FRIENDS, without their guess). */
  friendsCount: number;
  echo: number | null;
  did: number | null;
  /** The visit `did` is from, and how many earlier visits the echo had. */
  visit: number | null;
  looks: number;
  /** Who was closest to what they did (ties: all of them). Empty when they did nothing on the last visit. */
  closest: Witness[];
}

export interface Reveal {
  rows: RevealRow[];
  /** How many of the six each witness was closest on. */
  tally: Record<Witness, number>;
  /** What the echo now knows of each kind, after every visit (the share of the knowable). */
  knows: Record<Paradigm, { looks: number; share: number }>;
}

/**
 * The debrief for `person`. `ratings` are every rating in the pilot (only those of this person count);
 * `others` are the other people's choices by paradigm and visit, for the crowd.
 */
export function reveal(
  person: Pick<PilotPerson, "subject" | "stated" | "sessions">,
  stagings: readonly Staging[],
  ratings: readonly PilotRating[],
  others: readonly Record<Paradigm, Map<number, number>>[],
): Reveal {
  const mine = choices(stagings, person.sessions);
  const said = codeStated(person.stated);
  const guesses = ratings.filter((r) => r.ratee === person.subject && r.rater !== person.subject && r.predicted).map((r) => codeStated(r.predicted));
  const rows: RevealRow[] = [];
  const tally: Record<Witness, number> = { said: 0, friends: 0, echo: 0 };
  const knows = {} as Reveal["knows"];
  for (const p of PARADIGMS) {
    const visits = [...mine[p].keys()].sort((a, b) => a - b);
    const last = visits.length ? visits[visits.length - 1]! : null;
    const did = last === null ? null : mine[p].get(last)!;
    const earlier = visits.filter((v) => v !== last).map((v) => mine[p].get(v)!);
    const firsts = others.map((o) => o[p].get(Math.min(...o[p].keys()))).filter((v): v is number => v !== undefined && Number.isFinite(v));
    const crowd = firsts.length >= MIN_CROWD ? firsts.reduce((a, b) => a + b, 0) / firsts.length : 0.5;
    const fg = guesses.map((g) => g[p]).filter((v): v is number => v !== null);
    const row: RevealRow = {
      paradigm: p,
      said: said[p],
      friends: fg.length >= MIN_FRIENDS ? median(fg) : null,
      friendsCount: fg.length,
      echo: did === null ? null : echoGuess(earlier, crowd),
      did,
      visit: last,
      looks: earlier.length,
      closest: [],
    };
    if (did !== null) {
      const dist = (["said", "friends", "echo"] as const).filter((w) => row[w] !== null).map((w) => [w, Math.abs(row[w]! - did)] as const);
      const best = Math.min(...dist.map(([, d]) => d));
      row.closest = dist.filter(([, d]) => d - best < 1e-9).map(([w]) => w);
      for (const w of row.closest) tally[w] += 1;
    }
    rows.push(row);
    knows[p] = { looks: visits.length, share: knowing(visits.length) };
  }
  return { rows, tally, knows };
}
