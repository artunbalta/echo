/**
 * Who can know what about a person's next answer: the closed forms of `research/deeds/deeds/theory.py`
 * (DECISIONS C90), for the pages that explain the audit.
 *
 * One kind of situation, standardised. The next answer is y = A + U + e:
 * - A: what a persona can know (its share of the variance is π);
 * - U: the person's own way in this very situation, which no persona carries (ρ − π);
 * - e: the day (1 − ρ).
 *
 * ρ is the retest reliability. SKILL is 1 − MSE / var(y): the share of the variance a guess removes.
 * The crowd scores 0 and nobody can score more than ρ.
 *
 * Pure. Held to the Python by `tests/knowable.test.mts`.
 */

/** Guessing the crowd's mean knows nobody: skill 0. */
export function crowd(): number {
  return 0;
}

/** A persona knows what it carries about this situation and nothing else: at most π, however clever the model. */
export function persona(pi: number): number {
  return pi;
}

/** Copying a person's last answer scores 2ρ − 1: worse than the crowd whenever ρ is under one half. */
export function copying(rho: number): number {
  return 2 * rho - 1;
}

/**
 * The echo after n looks, starting from a persona, scores π + n(ρ − π)² / (n(ρ − π) + 1 − ρ).
 * One look and no persona: ρ². Infinitely many: ρ.
 */
export function echo(rho: number, pi: number, n: number): number {
  if (n <= 0) return pi;
  const s = rho - pi;
  return pi + (n * s * s) / (n * s + 1 - rho);
}

/** Knowing the person exactly, but not the day, scores ρ: the knowable ceiling. */
export function oracle(rho: number): number {
  return rho;
}

/** The share of what is knowable about a person that a witness knows: skill over ρ. */
export function knowing(skill: number, rho: number): number {
  return rho > 0 ? skill / rho : NaN;
}

/**
 * How many looks before an echo knows a share q of the knowable. With no persona it is the odds of q
 * times the day's share over the person's: n = q/(1 − q) · (1 − ρ)/ρ.
 */
export function looksNeeded(q: number, rho: number, pi = 0): number {
  if (!(q > 0 && q < 1)) throw new RangeError("q in (0, 1)");
  const target = q * rho;
  if (pi >= target) return 0;
  const s = rho - pi;
  const e = 1 - rho;
  // π + n s² / (n s + e) = target  ⇔  n (s² − s (target − π)) = e (target − π)
  const need = target - pi;
  const denom = s * s - s * need;
  return denom <= 0 ? Infinity : (e * need) / denom;
}

/**
 * The echo's curve, drawn through forecasts that were made fold by fold. A study forecasts with each
 * fold's own ρ and averages the forecasts. The curve at the average ρ is not that average, because
 * the curve bends: it misses by a hair where ρ is well estimated (under 1% on five of the Moral
 * Machine's six contrasts) and by a good deal where ρ is small and differs between folds (some 40% on
 * the sixth). So the page never draws the curve at the average ρ as if it were the forecast. This is
 * that curve scaled between the forecast points, so that it passes through every one of them.
 */
export function echoThrough(rho: number, forecasts: { n: number; pred: number }[], n: number): number {
  const points = [...forecasts].sort((a, b) => a.n - b.n).map((p) => ({ n: p.n, ratio: p.pred / echo(rho, 0, p.n) }));
  if (!points.length) return echo(rho, 0, n);
  let ratio = points[points.length - 1]!.ratio;
  if (n <= points[0]!.n) ratio = points[0]!.ratio;
  else {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      if (n <= b.n) {
        ratio = a.ratio + ((b.ratio - a.ratio) * (n - a.n)) / (b.n - a.n);
        break;
      }
    }
  }
  return echo(rho, 0, n) * ratio;
}
