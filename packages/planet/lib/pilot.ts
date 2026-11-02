/**
 * The pilot village (web DECISIONS C75): six classic paradigms set in the world, for a group of friends
 * who each come twice. Pure: the order a person meets them in, the tide's turn, whether a lent raft
 * comes back, and the clock of it all. The web's `lib/pilot.ts` keeps the people; the director route
 * sets the six out one at a time and `director.ts` says what they are. Nothing here is money: every
 * stake is the world's own, bread you will want on the water, a raft, a catch, a crop.
 */
import { PILOT_SITUATIONS, seededUnit, type SituationId } from "./director.js";

export const PILOT = {
  /** How long one visit runs. */
  sessionMs: 25 * 60 * 1000,
  /** Visits per person: the second is the first's retest. */
  sessions: 2,
  /** The second visit, at least this long after the first began: tomorrow, when the seed is up. */
  betweenMs: 20 * 60 * 60 * 1000,
  /** After arriving, a little time to look around before the first. */
  firstMs: 20_000,
  /** Between one answered (or gone) situation and the next. */
  gapMs: 30_000,
  /** One left unmet this long is gone, and the next comes. */
  lifeMs: 4 * 60 * 1000,
  /** Set this near: nearer than the world's 22–48 m, so that one visit meets all six. */
  landRing: [10, 22] as const,
  shoreRing: [14, 40] as const,
  /** What each visit starts with, topped up to: three loaves and a raft. */
  grant: { bread: 3, raft: 1 } as Readonly<Record<string, number>>,
  /** A planted seed is up after this long, and gives this many handfuls. */
  growMs: 20 * 60 * 60 * 1000,
  harvest: 3,
  /** A lent raft comes back after this long, three times in four, with two fish. */
  loanBackMs: 5 * 60 * 1000,
  loanBackChance: 0.75,
  loanFish: 2,
} as const;

/**
 * The six, in the order this person meets them on this visit: shuffled once per person and visit, the
 * same on every reload, so that across a group each comes first about as often as any other.
 */
export function pilotOrder(subject: string, session: number): SituationId[] {
  const order = [...PILOT_SITUATIONS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(seededUnit(`pilot|${subject}|${session}|${i}`) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * The fisher's offer: each bet's two outcomes, equally likely, every bet two fish on average. The
 * spread is all that differs (a mean-preserving spread), so the choice reads risk and nothing else.
 */
export const TIDE: Readonly<Record<string, readonly [number, number]>> = {
  "bet-safe": [2, 2],
  "bet-even": [3, 1],
  "bet-long": [4, 0],
};

/** What the tide gave for this bet on this staging. The coin is the staging's, so asking twice is the same answer. */
export function tideCatch(stagingId: string, verb: string): number | null {
  const outcomes = TIDE[verb];
  if (!outcomes) return null;
  return seededUnit(`tide|${stagingId}`) < 0.5 ? outcomes[0] : outcomes[1];
}

/** Whether this lent raft comes back. */
export function loanComesBack(stagingId: string): boolean {
  return seededUnit(`loan|${stagingId}`) < PILOT.loanBackChance;
}

const NAMES = ["Mira", "Tobin", "Esk", "Lio", "Hanne", "Oren", "Sela", "Brann", "Ivo", "Runa", "Teo", "Asta"];

/** What the pilot's stranger on this staging is called. */
export function strangerName(stagingId: string): string {
  return NAMES[Math.floor(seededUnit(`name|${stagingId}`) * NAMES.length)]!;
}
