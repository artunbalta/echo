/**
 * What is knowable about a person's answer, and why the retest is not the ceiling: the ordered latent
 * model of `research/deeds/deeds/ceiling.py` (DECISIONS C90).
 *
 * The field scores a twin against the person's own retest. But a retest is one noisy answer guessing
 * another. Someone who knew the person exactly, but not the day, would guess better.
 *
 * THE MODEL. Each item gets its own. A person's steady level is T ~ N(0, ρ); each occasion adds
 * e ~ N(0, 1 − ρ); the answer is where T + e falls among cut-points set by the item's answer shares.
 * ρ is fitted so that the model's retest accuracy equals the observed one. The model then says what
 * three guessers would score:
 * - base: the crowd's best single answer;
 * - retest: one answer guessing the next;
 * - ceiling: the best answer given T, which is the most anyone can know without knowing the day.
 *
 * Accuracy is 1 − |guess − answer| / span, the metric of Twin-2K-500's authors.
 *
 * The Python builds a levels × levels loss matrix. Here the same sums run over sorted levels with
 * running totals, so a slider with a hundred levels costs a hundred steps, not ten thousand. The
 * results agree to rounding (`tests/knowable.test.mts`).
 *
 * Pure.
 */
import { GH80, normCdf, normInv } from "./stats";

export interface Column {
  /** The answers, ascending. */
  levels: number[];
  /** How often each was given; sums to 1. */
  shares: number[];
  /** The scale's range: the metric's denominator. */
  span: number;
  /** The steady share of the latent variance. */
  rho: number;
}

/** The cut-points between neighbouring answers on the latent scale, from the answer shares. */
export function cuts(col: Pick<Column, "shares">): Float64Array {
  const k = col.shares.length;
  const out = new Float64Array(Math.max(0, k - 1));
  let c = 0;
  for (let i = 0; i < k - 1; i++) {
    c += col.shares[i]!;
    out[i] = normInv(Math.min(Math.max(c, 1e-9), 1 - 1e-9));
  }
  return out;
}

/** P(answer = level k | steady level t), into `out`. */
function answerProbs(cut: Float64Array, rho: number, t: number, out: Float64Array): void {
  const s = Math.sqrt(Math.max(1 - rho, 1e-9));
  let below = 0;
  for (let k = 0; k < out.length; k++) {
    const upto = k < cut.length ? normCdf((cut[k]! - t) / s) : 1;
    out[k] = Math.min(1, Math.max(0, upto - below));
    below = upto;
  }
}

/** Σⱼₖ pⱼ pₖ |lⱼ − lₖ|: the expected gap between two independent answers. */
function selfGap(p: Float64Array, levels: number[]): number {
  let mass = 0;
  let moment = 0;
  let gap = 0;
  for (let k = 0; k < p.length; k++) {
    gap += p[k]! * (levels[k]! * mass - moment);
    mass += p[k]!;
    moment += p[k]! * levels[k]!;
  }
  return 2 * gap;
}

/** minₖ Σⱼ pⱼ |lⱼ − lₖ|: the expected miss of the best single guess (the distribution's median). */
function bestGap(p: ArrayLike<number>, levels: number[]): number {
  let total = 0;
  let totalMoment = 0;
  for (let k = 0; k < p.length; k++) {
    total += p[k]!;
    totalMoment += p[k]! * levels[k]!;
  }
  let mass = 0;
  let moment = 0;
  let best = Infinity;
  for (let k = 0; k < p.length; k++) {
    const l = levels[k]!;
    // below k: l·mass − moment; above (and at) k: (totalMoment − moment) − l·(total − mass)
    const miss = l * mass - moment + (totalMoment - moment) - l * (total - mass);
    if (miss < best) best = miss;
    mass += p[k]!;
    moment += p[k]! * l;
  }
  return best;
}

function retestWith(col: Column, cut: Float64Array, rho: number): number {
  const { nodes, weights } = GH80;
  const p = new Float64Array(col.levels.length);
  const root = Math.sqrt(rho);
  let loss = 0;
  for (let i = 0; i < nodes.length; i++) {
    answerProbs(cut, rho, nodes[i]! * root, p);
    loss += weights[i]! * selfGap(p, col.levels);
  }
  return 1 - loss / col.span;
}

/** One answer guessing the next. */
export function retestAccuracy(col: Column): number {
  return retestWith(col, cuts(col), col.rho);
}

/** The crowd's best single answer guessing everyone. */
export function baseAccuracy(col: Column): number {
  return 1 - bestGap(col.shares, col.levels) / col.span;
}

/** The oracle knows t, and guesses the answer with the least expected miss given t. */
export function ceilingAccuracy(col: Column): number {
  const { nodes, weights } = GH80;
  const cut = cuts(col);
  const p = new Float64Array(col.levels.length);
  const root = Math.sqrt(col.rho);
  let loss = 0;
  for (let i = 0; i < nodes.length; i++) {
    answerProbs(cut, col.rho, nodes[i]! * root, p);
    loss += weights[i]! * bestGap(p, col.levels);
  }
  return 1 - loss / col.span;
}

/** The ρ at which the model's retest accuracy is the observed one (monotone in ρ; bisection). */
export function fitRho(col: Column, observedRetest: number): Column {
  const cut = cuts(col);
  let lo = 1e-4;
  let hi = 0.9999;
  if (retestWith(col, cut, hi) <= observedRetest) return { ...col, rho: hi };
  if (retestWith(col, cut, lo) >= observedRetest) return { ...col, rho: lo };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (retestWith(col, cut, mid) < observedRetest) lo = mid;
    else hi = mid;
  }
  return { ...col, rho: (lo + hi) / 2 };
}

/** The share of what is knowable about the person, beyond the crowd, that a witness knows. */
export function knowledgeIndex(acc: number, base: number, ceiling: number): number {
  return ceiling > base ? (acc - base) / (ceiling - base) : NaN;
}
