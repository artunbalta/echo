/**
 * The numerics under the twin audit (DECISIONS C90): the normal curve both ways, Gauss–Hermite
 * quadrature, a seeded random stream, and the few summaries the audit takes.
 *
 * WHY HERE AND NOT A LIBRARY. `/audit` runs in the visitor's browser so that nothing they bring
 * leaves their page, and the route at `/api/v1/audit` must give the same answer. So the arithmetic of
 * `research/deeds` (numpy, scipy) is written out once, with no dependency, and held to the Python by
 * a fixture (`tests/knowable.test.mts`): Φ and Φ⁻¹ agree with scipy to 1e-12, the 80 nodes and
 * weights with `hermegauss(80)`.
 *
 * The random stream is NOT numpy's. Folds and bootstrap draws therefore differ from the Python's,
 * which is why `audit()` takes explicit folds, and why its intervals are compared for width only.
 *
 * Pure.
 */

const SQRT_PI = 1.7724538509055160273;
const EPS = 2.220446049250313e-16;

/** erf(x) for small |x|, by the series with no cancellation: (2/√π) e^(−x²) Σ 2ⁿ x^(2n+1) / (2n+1)!!. */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

/** erfc(x) for x ≥ 2.5, by its continued fraction (modified Lentz). */
function erfcFraction(x: number): number {
  const tiny = 1e-300;
  let f = x;
  let c = x;
  let d = 0;
  for (let k = 1; k < 500; k++) {
    const a = k / 2;
    d = x + a * d;
    if (d === 0) d = tiny;
    c = x + a / c;
    if (c === 0) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** The complementary error function, to about 1e-15 in absolute terms. */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) return 1 - erfSeries(x);
  if (x > 27) return 0;
  return erfcFraction(x);
}

/** Φ: the standard normal's distribution function (scipy's `ndtr`). */
export function normCdf(z: number): number {
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z * Math.SQRT1_2);
}

// Wichura's AS241 (PPND16): Φ⁻¹ to about 1e-16.
const A = [3.387132872796366608, 133.14166789178437745, 1971.5909503065514427, 13731.693765509461125, 45921.953931549871457, 67265.770927008700853, 33430.575583588128105, 2509.0809287301226727];
const B = [1, 42.313330701600911252, 687.1870074920579083, 5394.1960214247511077, 21213.794301586595867, 39307.89580009271061, 28729.085735721942674, 5226.495278852854561];
const C = [1.42343711074968357734, 4.6303378461565452959, 5.7694972214606914055, 3.64784832476320460504, 1.27045825245236838258, 0.24178072517745061177, 0.0227238449892691845833, 7.7454501427834140764e-4];
const D = [1, 2.05319162663775882187, 1.6763848301838038494, 0.68976733498510000455, 0.14810397642748007459, 0.0151986665636164571966, 5.475938084995344946e-4, 1.05075007164441684324e-9];
const E = [6.6579046435011037772, 5.4637849111641143699, 1.7848265399172913358, 0.29656057182850489123, 0.026532189526576123093, 0.0012426609473880784386, 2.71155556874348757815e-5, 2.01033439929228813265e-7];
const F = [1, 0.59983220655588793769, 0.13692988092273580531, 0.0148753612908506148525, 7.868691311456132591e-4, 1.8463183175100546818e-5, 1.4215117583164458887e-7, 2.04426310338993978564e-15];

function poly(c: number[], x: number): number {
  let s = 0;
  for (let i = c.length - 1; i >= 0; i--) s = s * x + c[i]!;
  return s;
}

/** Φ⁻¹: the standard normal's quantile function (scipy's `ndtri`). */
export function normInv(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * poly(A, r)) / poly(B, r);
  }
  let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
  let x: number;
  if (r <= 5) {
    r -= 1.6;
    x = poly(C, r) / poly(D, r);
  } else {
    r -= 5;
    x = poly(E, r) / poly(F, r);
  }
  return q < 0 ? -x : x;
}

/**
 * Gauss–Hermite nodes and weights for the standard normal: Σ w f(z) ≈ E[f(Z)], Z ~ N(0, 1). The weights
 * sum to 1 (numpy's `hermegauss` weights over √(2π)).
 *
 * Golub–Welsch: the nodes are the eigenvalues of the Jacobi matrix (zero diagonal, off-diagonal
 * √k). Each is bracketed by a Sturm count and bisected, then polished by Newton on the orthonormal
 * recurrence, which neither overflows nor underflows at n = 80 where He₈₀ itself would.
 */
export function gaussHermite(n: number): { nodes: Float64Array; weights: Float64Array } {
  const below = (x: number) => {
    // how many eigenvalues lie below x: the negatives in the Sturm sequence
    let count = 0;
    let q = -x;
    if (q < 0) count++;
    for (let k = 1; k < n; k++) {
      q = -x - k / (q === 0 ? 1e-300 : q);
      if (q < 0) count++;
    }
    return count;
  };
  /** The orthonormal p̃ₙ(x) and p̃ₙ₋₁(x), without the weight's (2π)^(−¼), which cancels below. */
  const pair = (x: number): [number, number] => {
    let prev = 0;
    let cur = 1;
    for (let k = 0; k < n; k++) {
      const next = (x * cur - Math.sqrt(k) * prev) / Math.sqrt(k + 1);
      prev = cur;
      cur = next;
    }
    return [cur, prev];
  };
  const nodes = new Float64Array(n);
  const weights = new Float64Array(n);
  const reach = 2 * Math.sqrt(n) + 2;
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    // the i-th largest; its mirror is the i-th smallest, exactly
    const index = n - 1 - i;
    let lo = 0;
    let hi = reach;
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2;
      if (below(mid) > index) hi = mid;
      else lo = mid;
    }
    let x = (lo + hi) / 2;
    for (let it = 0; it < 4; it++) {
      const [p, p1] = pair(x);
      x -= p / (Math.sqrt(n) * p1);
    }
    const p1 = pair(x)[1];
    const w = 1 / (n * p1 * p1);
    nodes[index] = x;
    nodes[i] = -x;
    weights[index] = w;
    weights[i] = w;
  }
  if (n % 2 === 1) {
    const p1 = pair(0)[1];
    nodes[half] = 0;
    weights[half] = 1 / (n * p1 * p1);
  }
  let total = 0;
  for (let i = 0; i < n; i++) total += weights[i]!;
  for (let i = 0; i < n; i++) weights[i] /= total;
  return { nodes, weights };
}

/** The 80-point rule `research/deeds/deeds/ceiling.py` integrates with. */
export const GH80 = gaussHermite(80);

export interface Rng {
  /** A uniform draw in [0, 1). */
  next(): number;
  /** A uniform integer in [0, n). */
  int(n: number): number;
  /** A standard normal draw. */
  normal(): number;
  /** Fisher–Yates, in place. */
  shuffle<T extends unknown[] | Int32Array | Float64Array>(a: T): T;
}

/** mulberry32: a small, fast, seeded stream. Good enough for folds, bootstraps and a demo panel. */
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    // (u + ½·2⁻³²) keeps the argument off 0, where Φ⁻¹ is −∞
    normal: () => normInv(next() + 1 / 8589934592),
    shuffle(a) {
      const arr = a as unknown as unknown[];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return a;
    },
  };
}

export function mean(a: ArrayLike<number>): number {
  if (!a.length) return NaN;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s / a.length;
}

/** The q-quantile by linear interpolation between order statistics (numpy's default, R's type 7). */
export function quantile(a: ArrayLike<number>, q: number): number {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo]! + (at - lo) * (s[hi]! - s[lo]!);
}

export function median(a: ArrayLike<number>): number {
  return quantile(a, 0.5);
}

/** Pearson's r. NaN when either side does not vary. */
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb);
}
