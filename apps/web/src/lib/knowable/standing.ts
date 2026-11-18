/**
 * Where an echo may stand in for its person, and where not yet (DECISIONS C103).
 *
 * WHAT IT IS FOR. When a person leaves a village room, their echo can keep their body there (C103's
 * second half). It may only do there what it has earned the right to do, one kind of situation at a time,
 * and the right is earned the one way the paper allows: its calls about the person, sealed before each
 * moment (`calls.ts`, `seal.ts`), were right often enough, and it knew how sure to be. Nothing is granted
 * by a profile, by a questionnaire, or by time spent: only by sealed calls that came true.
 *
 * THE KINDS OF SITUATION are the families the calls already read (help, honesty, courtesy, conformity,
 * order, curiosity) and talking, which is held to the most. Talking is earned the same way from a different
 * call (C108): before the person answers a villager, the echo seals what it thinks they will say, and once
 * they have, a model says whether the two meant the same and sounded the same (`talkGuess.ts`). Each kind
 * has its stakes, and the stakes set what the echo must show there:
 *
 *   stakes    looks at least    sure at least (the lower bound of how often it was right)
 *   low            6                 0.60
 *   medium        10                 0.70
 *   high          16                 0.80
 *   talk          30                 0.85
 *
 * Six looks is the theory's for a choice of stability 0.6 to be 90% known (n = 9(1 − ρ)/ρ); higher stakes
 * ask for more than knowing. The numbers are a starting point, set here and nowhere else.
 *
 * WHY THE THRESHOLD MOVES. It is not a count to reach and keep. It is a bound on the evidence, recomputed
 * with every look, so it moves as the record does:
 * - "sure at least" is a lower bound (Wilson, one-sided 90%) on the share of calls that came true, so few
 *   looks are worth little and a person who is inconsistent in a kind of situation never gives their echo
 *   the right there, however many looks there are;
 * - the echo may not claim to be surer than it turned out to be: its calls' average confidence may exceed
 *   how often they came true by 0.15 at most (an echo that is right more often than it says is only
 *   careful, and careful is allowed); judged once there are enough looks to judge it by, half of what
 *   the kind asks for and never fewer than five, since one miss says nothing about how sure to be;
 * - the last looks count most: when recent calls start missing (the person has changed, or the echo was
 *   lucky), the right is lost again, before the overall share has fallen far;
 * - every time the person says "that was not me" of something their echo did (`vetoes`), it must show more
 *   there: half as many looks again, and 0.05 surer, for each.
 *
 * THREE STANDINGS. `act`: it may do it for them. `ask`: close (its record would pass but for a few looks,
 * or it has just lost the right); it holds back, and what it would have done can be put to the person.
 * `watch`: it is still learning them here.
 *
 * Pure: the record is passed in.
 */
import type { MomentKind } from "@echo/planet";

import { FAMILY_NAMES, familyOf, known, type Family } from "./calls";

/** A kind of situation an echo may stand in for: a family of moments, or talking. */
export type Bucket = Family | "talk";
export const BUCKETS: readonly Bucket[] = [...FAMILY_NAMES, "talk"];

export type Stakes = "low" | "medium" | "high" | "talk";

/** What is at stake in each: a greeting misjudged costs less than a purse misjudged. */
export const STAKES: Record<Bucket, Stakes> = {
  courtesy: "low",
  order: "low",
  curiosity: "low",
  help: "medium",
  conformity: "medium",
  honesty: "high",
  talk: "talk",
};

/** What each stakes asks for, before any veto. */
export const THRESHOLD: Record<Stakes, { looks: number; sure: number }> = {
  low: { looks: 6, sure: 0.6 },
  medium: { looks: 10, sure: 0.7 },
  high: { looks: 16, sure: 0.8 },
  talk: { looks: 30, sure: 0.85 },
};

/** The most the calls' average confidence may exceed how often they came true. */
export const CALIBRATION_GAP = 0.15;
/** How fast the recent record forgets the old: each look is worth this much of the running share. */
const RECENT = 0.3;
/** One-sided 90%. */
const Z = 1.2816;

/** One settled guess at what the person would say (C108): how sure it was, and whether it was what they said. */
export interface TalkCall {
  p: number;
  hit: boolean;
}

/** One settled call: what was sealed, how sure, and what the person did. */
export interface SettledCall {
  kind: MomentKind;
  /** The call that was sealed. */
  call: string;
  p: number;
  /** What the person did. */
  did: string;
}

export type Level = "act" | "ask" | "watch";

export interface Standing {
  bucket: Bucket;
  stakes: Stakes;
  level: Level;
  /** Settled calls in it. */
  looks: number;
  /** How many came true. */
  right: number;
  /** The lower bound on how often it is right. */
  sure: number;
  /** What it must show here, vetoes counted. */
  needs: { looks: number; sure: number };
  /** Calls in a row it would have to get right from here to pass on count and bound; 0 when it does. Null past 400. */
  toGo: number | null;
  /** The running share of the last looks. */
  recent: number;
  /** Its average confidence less how often it was right: above zero, it claimed more than it had. */
  gap: number;
  /** It claims to be surer than it turned out to be, by more than {@link CALIBRATION_GAP}: no right until that mends. */
  overconfident: boolean;
}

/** The Wilson lower bound on a share, from `right` of `n`. */
export function lowerBound(right: number, n: number): number {
  if (n === 0) return 0;
  const p = right / n;
  const z2 = Z * Z;
  return (p + z2 / (2 * n) - Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** What a bucket asks for after `vetoes` "that was not me"s. */
export function needsOf(bucket: Bucket, vetoes = 0): { looks: number; sure: number } {
  const t = THRESHOLD[STAKES[bucket]];
  return { looks: Math.ceil(t.looks * (1 + 0.5 * vetoes)), sure: Math.min(0.97, t.sure + 0.05 * vetoes) };
}

/** Whether a record of `right` of `n` passes what is needed on count and on its bound. */
const passes = (right: number, n: number, needs: { looks: number; sure: number }) => n >= needs.looks && lowerBound(right, n) >= needs.sure;

/** Where the echo stands in one kind of situation. */
export function standingIn(bucket: Bucket, record: readonly SettledCall[], vetoes = 0): Standing {
  return standingFrom(bucket, record.map((r) => ({ p: r.p, hit: r.call === r.did })), vetoes);
}

/** Where the echo stands from settled calls of any kind: how sure each was, and whether it came true. */
function standingFrom(bucket: Bucket, record: readonly TalkCall[], vetoes: number): Standing {
  const needs = needsOf(bucket, vetoes);
  const looks = record.length;
  const hits = record.map((r) => (r.hit ? 1 : 0));
  const right = hits.reduce<number>((s, h) => s + h, 0);
  const sure = lowerBound(right, looks);
  const meanP = looks ? record.reduce((s, r) => s + r.p, 0) / looks : 0;
  const gap = looks ? meanP - right / looks : 0;
  // The running share, started from what is needed so that a first miss does not read as a fall.
  let recent = needs.sure;
  for (const h of hits) recent = (1 - RECENT) * recent + RECENT * h;

  const overconfident = looks >= Math.max(5, Math.ceil(needs.looks / 2)) && gap > CALIBRATION_GAP;
  const calibrated = !overconfident;
  const holding = recent >= needs.sure - 0.1;
  let level: Level = "watch";
  if (passes(right, looks, needs) && calibrated && holding) level = "act";
  else if ((passes(right, looks, needs) || (looks >= Math.ceil(needs.looks * 0.75) && sure >= needs.sure - 0.1)) && calibrated) level = "ask";

  // How many right calls in a row from here would pass on count and bound (the running share only rises with
  // them, and so does how often it was right, which is what mends a claim of more than it had).
  let toGo: number | null = 0;
  if (!passes(right, looks, needs)) {
    toGo = null;
    for (let k = 1; k <= 400; k++) {
      if (passes(right + k, looks + k, needs)) {
        toGo = k;
        break;
      }
    }
  }
  return { bucket, stakes: STAKES[bucket], level, looks, right, sure, needs, toGo, recent, gap, overconfident };
}

/** Where the echo stands in every kind of situation, from every settled call and guess. `vetoes` by bucket. */
export function standingOf(records: readonly SettledCall[], vetoes: Partial<Record<Bucket, number>> = {}, talk: readonly TalkCall[] = []): Standing[] {
  return BUCKETS.map((b) =>
    b === "talk" ? standingFrom("talk", talk, vetoes.talk ?? 0) : standingIn(b, records.filter((r) => familyOf(r.kind) === b), vetoes[b] ?? 0),
  );
}

/** "That was not me"s by the kind of situation they were said in (C105): what `standingOf` takes as `vetoes`. */
export function vetoesByBucket(vetoes: readonly { kind: string }[]): Partial<Record<Bucket, number>> {
  const out: Partial<Record<Bucket, number>> = {};
  for (const v of vetoes) {
    // A line the echo said for them that was not theirs (C108's second half) asks more of its talking.
    const f: Bucket | null = v.kind === "talk" ? "talk" : known(v.kind) ? familyOf(v.kind) : null;
    if (f) out[f] = (out[f] ?? 0) + 1;
  }
  return out;
}
