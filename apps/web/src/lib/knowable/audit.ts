/**
 * A twin audit (DECISIONS C90): what a digital twin knows about individuals, measured the way the
 * research measured Twin-2K-500's. A port of `research/deeds/audit.py`, which stays the record.
 *
 * A team brings its twins' predictions and a panel that answered the same items twice. For each twin
 * it gets back:
 * - accuracy on the cells it answered, and against THE CROWD: the median answer of the other
 *   people, which knows nobody, scored on the same cells, with the difference's 95% interval;
 * - individual-level r: across people, per item, averaged within groups and then over groups;
 * - THE KNOWABLE CEILING for these items (./ceiling.ts) and the twin's place between the crowd (0)
 *   and that ceiling (1): the share of what is knowable beyond the crowd that it knows;
 * - ONE LOOK: the same twin read through one earlier answer per person. A line ŷ = a + b·twin +
 *   c·earlier is fitted on other people, then rounded to an answer other people gave.
 *
 * NOTHING SEES WHAT IT PREDICTS. People are split into folds. A person's crowd, their stacker and the
 * answers a score may round to all come from the people outside their fold.
 *
 * WHY A PORT. `/audit` runs this in the visitor's browser, so their panel never leaves their page,
 * and `/api/v1/audit` runs the same code on the server. It is held to the Python by a fixture
 * (`tests/knowable.test.mts`): given numpy's folds, every point estimate agrees to 1e-6. The
 * bootstrap intervals use another random stream and agree in width, not digit for digit.
 *
 * WHAT MUST STAY AS PANDAS HAS IT. A missing cell is skipped, not scored: in a person's mean within a
 * group, in their mean over groups, and in the mean over people. A person the twin said nothing about
 * is left out of that twin's scores, and the crowd is scored on the same cells as the twin.
 *
 * Pure. No network, no storage.
 */
import { baseAccuracy, ceilingAccuracy, fitRho } from "./ceiling";
import { quantile, rng } from "./stats";

export interface Item {
  item: string;
  /** Items are averaged within a group first, then groups are averaged: a task with forty items counts once. */
  group: string;
  /** The scale's ends: accuracy is 1 − |guess − answer| / (hi − lo). */
  lo: number;
  hi: number;
}
export type Items = Item[];

/** A wide table: one row per person, one column per item. `null` is a missing answer. */
export interface Table {
  ids: string[];
  columns: string[];
  values: (number | null)[][];
}

export interface Ceiling {
  rho: number;
  base: number;
  ceiling: number;
}

export interface TwinAudit {
  people: number;
  accuracy: number;
  crowd: number;
  retest: number;
  with_one_look: number;
  vs_crowd: number;
  vs_crowd_ci95: [number, number];
  one_look_gain: number;
  one_look_gain_ci95: [number, number];
  r: number;
  r_crowd: number;
  r_retest: number;
  r_with_one_look: number;
  knows: number;
  knows_with_one_look: number;
  knows_retest: number;
}

/** The shape of `research/deeds/runs/twin2k-audit.json`. */
export interface AuditResult {
  people: number;
  items: number;
  groups: number;
  ceiling: { overall: Ceiling; by_group: Record<string, Ceiling> };
  twins: Record<string, TwinAudit>;
}

export interface AuditOptions {
  /** A fold per person, in the panel's order. Default: `foldsOf(people, 10, seed)`. */
  folds?: ArrayLike<number>;
  /** Bootstrap draws behind each 95% interval. Default 2,000. */
  bootDraws?: number;
  seed?: number;
}

export interface AuditProgress {
  done: number;
  total: number;
  /** What is being worked on: "the ceiling", or a twin's name. */
  label: string;
}

/** Something wrong with what was brought, said so that the person who brought it can fix it. */
export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditError";
  }
}

/** The panel as the audit reads it: the people in both waves, the items in both, column by column. */
export interface Panel {
  ids: string[];
  columns: string[];
  /** Sorted. */
  groups: string[];
  /** Per column, its place in `groups`. */
  groupOf: Int32Array;
  span: Float64Array;
  /** Per column, an answer per person; NaN where missing. */
  truth: Float64Array[];
  earlier: Float64Array[];
}

const FOLDS = 10;
const MIN_TRAIN = 20;
const EPS = 2.220446049250313e-16;

/** A table's columns, re-laid on the given people and items; NaN where it has nothing. */
function relaid(table: Table, ids: string[], columns: string[]): Float64Array[] {
  const row = new Map<string, number>();
  table.ids.forEach((id, i) => {
    if (!row.has(id)) row.set(id, i);
  });
  const at = new Map<string, number>();
  table.columns.forEach((c, j) => {
    if (!at.has(c)) at.set(c, j);
  });
  const rows = ids.map((id) => row.get(id));
  return columns.map((c) => {
    const j = at.get(c);
    const out = new Float64Array(ids.length).fill(NaN);
    if (j === undefined) return out;
    for (let i = 0; i < ids.length; i++) {
      const r = rows[i];
      if (r === undefined) continue;
      const v = table.values[r]?.[j];
      if (typeof v === "number" && Number.isFinite(v)) out[i] = v;
    }
    return out;
  });
}

function firstRepeat(names: string[]): string | null {
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) return n;
    seen.add(n);
  }
  return null;
}

/** The later wave is the truth to predict; the earlier wave is the look. People and items in both are kept. */
export function panelOf(truth: Table, earlier: Table, items: Items): Panel {
  const repeatedItem = firstRepeat(items.map((it) => it.item));
  if (repeatedItem !== null) throw new AuditError(`The items list names "${repeatedItem}" twice.`);
  for (const [name, t] of [["truth", truth], ["earlier", earlier]] as const) {
    const repeated = firstRepeat(t.ids);
    if (repeated !== null) throw new AuditError(`The ${name} table has the person "${repeated}" twice.`);
  }
  const inTruth = new Set(truth.columns);
  const inEarlier = new Set(earlier.columns);
  const kept = items.filter((it) => inTruth.has(it.item) && inEarlier.has(it.item));
  if (!kept.length) throw new AuditError("No item in the items list is a column of both the truth and the earlier table.");
  for (const it of kept) {
    if (!(Number.isFinite(it.lo) && Number.isFinite(it.hi) && it.hi > it.lo)) {
      throw new AuditError(`The item "${it.item}" needs a scale with hi above lo (it has lo ${it.lo}, hi ${it.hi}).`);
    }
  }
  const earlierIds = new Set(earlier.ids);
  const ids = truth.ids.filter((id) => earlierIds.has(id));
  if (ids.length < 2) throw new AuditError("Fewer than two people are in both the truth and the earlier table. Check that the first column holds the same ids in each.");
  const columns = kept.map((it) => it.item);
  const groups = [...new Set(kept.map((it) => it.group))].sort();
  const panel: Panel = {
    ids,
    columns,
    groups,
    groupOf: Int32Array.from(kept, (it) => groups.indexOf(it.group)),
    span: Float64Array.from(kept, (it) => it.hi - it.lo),
    truth: relaid(truth, ids, columns),
    earlier: relaid(earlier, ids, columns),
  };
  for (let c = 0; c < columns.length; c++) {
    let pairs = 0;
    for (let i = 0; i < ids.length; i++) if (!Number.isNaN(panel.truth[c]![i]!) && !Number.isNaN(panel.earlier[c]![i]!)) pairs++;
    if (!pairs) throw new AuditError(`Nobody answered the item "${columns[c]}" in both waves, so it has no retest. Remove it from the items list.`);
  }
  return panel;
}

/** A fold per person: 0…k−1 as evenly as they go, shuffled. */
export function foldsOf(n: number, k = FOLDS, seed = 0): Int32Array {
  const f = Int32Array.from({ length: n }, (_, i) => i % k);
  return rng(seed).shuffle(f);
}

/** The nearest answer people actually gave (ties to the lower). NaN stays NaN. */
export function toAdmissible(score: number, admissible: ArrayLike<number>): number {
  const n = admissible.length;
  if (Number.isNaN(score) || !n) return NaN;
  if (n === 1) return admissible[0]!;
  // the first index whose answer is not below the score, kept inside 1…n−1
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (admissible[mid]! < score) lo = mid + 1;
    else hi = mid;
  }
  const idx = Math.min(Math.max(lo, 1), n - 1);
  const below = admissible[idx - 1]!;
  const above = admissible[idx]!;
  return score - below <= above - score ? below : above;
}

interface Blind {
  /** The fold labels, ascending. */
  labels: number[];
  folds: Int32Array;
  /** Per column, per label: the answers the people OUTSIDE that fold gave, ascending, each once. */
  admissible: Float64Array[][];
  /** Per column, per person: the crowd's median answer, from the people outside their fold. */
  crowd: Float64Array[];
}

function resolveFolds(panel: Panel, opts: AuditOptions | undefined): Int32Array {
  const n = panel.ids.length;
  if (!opts?.folds) return foldsOf(n, FOLDS, opts?.seed ?? 0);
  if (opts.folds.length !== n) throw new AuditError(`There are ${n} people in the panel and ${opts.folds.length} folds.`);
  return Int32Array.from(opts.folds);
}

function blindColumn(y: Float64Array, folds: Int32Array, labels: number[]): { admissible: Float64Array[]; crowd: Float64Array } {
  const n = y.length;
  const crowd = new Float64Array(n).fill(NaN);
  const admissible: Float64Array[] = [];
  const buf = new Float64Array(n);
  for (const f of labels) {
    let m = 0;
    for (let i = 0; i < n; i++) if (folds[i] !== f && !Number.isNaN(y[i]!)) buf[m++] = y[i]!;
    const sorted = buf.slice(0, m).sort();
    let k = 0;
    const unique = new Float64Array(m);
    for (let i = 0; i < m; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) unique[k++] = sorted[i]!;
    const adm = unique.slice(0, k);
    admissible.push(adm);
    const median = m ? (sorted[(m - 1) >> 1]! + sorted[m >> 1]!) / 2 : NaN;
    const guess = toAdmissible(median, adm);
    for (let i = 0; i < n; i++) if (folds[i] === f) crowd[i] = guess;
  }
  return { admissible, crowd };
}

function toTable(panel: Panel, columns: Float64Array[]): Table {
  return {
    ids: [...panel.ids],
    columns: [...panel.columns],
    values: panel.ids.map((_, i) => columns.map((col) => (Number.isNaN(col[i]!) ? null : col[i]!))),
  };
}

/** The crowd as a table: for each person, the median answer of the people outside their fold. It knows nobody. */
export function crowd(panel: Panel, opts?: Pick<AuditOptions, "folds" | "seed">): Table {
  const folds = resolveFolds(panel, opts);
  const labels = [...new Set(folds)].sort((a, b) => a - b);
  return toTable(panel, panel.truth.map((y) => blindColumn(y, folds, labels).crowd));
}

/** 1 − the person's mean miss: over the masked items within a group, then over their groups. NaN with no cell. */
function personAccuracy(panel: Panel, guess: Float64Array[], mask: Uint8Array[]): Float64Array {
  const n = panel.ids.length;
  const g = panel.groups.length;
  const sum = new Float64Array(n * g);
  const count = new Int32Array(n * g);
  for (let c = 0; c < panel.columns.length; c++) {
    const gc = panel.groupOf[c]!;
    const gu = guess[c]!;
    const tr = panel.truth[c]!;
    const mk = mask[c]!;
    const span = panel.span[c]!;
    for (let i = 0; i < n; i++) {
      if (!mk[i]) continue;
      const miss = Math.abs(gu[i]! - tr[i]!) / span;
      if (Number.isNaN(miss)) continue;
      sum[i * g + gc] += miss;
      count[i * g + gc]++;
    }
  }
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let total = 0;
    let groups = 0;
    for (let k = 0; k < g; k++) {
      if (!count[i * g + k]) continue;
      total += sum[i * g + k]! / count[i * g + k]!;
      groups++;
    }
    if (groups) out[i] = 1 - total / groups;
  }
  return out;
}

/** The mean over the chosen people, skipping NaN. */
function meanOf(a: Float64Array, people: Uint8Array): number {
  let s = 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    if (!people[i] || Number.isNaN(a[i]!)) continue;
    s += a[i]!;
    m++;
  }
  return m ? s / m : NaN;
}

function difference(a: Float64Array, b: Float64Array, people: Uint8Array): Float64Array {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (!people[i]) continue;
    const d = a[i]! - b[i]!;
    if (!Number.isNaN(d)) out.push(d);
  }
  return Float64Array.from(out);
}

/** The 95% interval of a mean, by resampling people. */
export function bootCi(d: Float64Array, draws: number, seed: number): [number, number] {
  const n = d.length;
  if (!n || draws < 1) return [NaN, NaN];
  const r = rng(seed);
  const means = new Float64Array(draws);
  for (let k = 0; k < draws; k++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += d[r.int(n)]!;
    means[k] = s / n;
  }
  return [quantile(means, 0.025), quantile(means, 0.975)];
}

/** Across people, per item; 0 where an item cannot say (under three people, or one side constant). */
function individualR(panel: Panel, guess: Float64Array[], mask: Uint8Array[]): number {
  const n = panel.ids.length;
  const g = panel.groups.length;
  const sum = new Float64Array(g);
  const count = new Int32Array(g);
  for (let c = 0; c < panel.columns.length; c++) {
    const gu = guess[c]!;
    const tr = panel.truth[c]!;
    const mk = mask[c]!;
    let m = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
      if (!mk[i] || Number.isNaN(gu[i]!)) continue;
      m++;
      sa += gu[i]!;
      sb += tr[i]!;
    }
    let r = 0;
    if (m >= 3) {
      const ma = sa / m;
      const mb = sb / m;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let i = 0; i < n; i++) {
        if (!mk[i] || Number.isNaN(gu[i]!)) continue;
        const da = gu[i]! - ma;
        const db = tr[i]! - mb;
        saa += da * da;
        sbb += db * db;
        sab += da * db;
      }
      // a guess that does not vary correlates with nothing; the tolerance is for a constant that is not a round number
      const flat = (ss: number, mu: number) => ss <= m * (1e-12 * (Math.abs(mu) + 1)) ** 2;
      if (!flat(saa, ma) && !flat(sbb, mb)) r = sab / Math.sqrt(saa * sbb);
    }
    sum[panel.groupOf[c]!] += r;
    count[panel.groupOf[c]!]++;
  }
  let total = 0;
  for (let k = 0; k < g; k++) total += sum[k]! / count[k]!;
  return total / g;
}

/**
 * Least squares for y ≈ a + b·m + c·x, and the minimum-norm answer when the three columns lose rank
 * (a constant twin, or a twin that IS the earlier answer): numpy's `lstsq(rcond=None)`. Householder QR,
 * then the singular values of the 3 × 3 triangle by one-sided Jacobi. The inputs are overwritten.
 */
function lstsq3(z: [Float64Array, Float64Array, Float64Array], y: Float64Array, m: number): [number, number, number] {
  const R = new Float64Array(9);
  for (let k = 0; k < 3; k++) {
    const col = z[k]!;
    let s = 0;
    for (let i = k; i < m; i++) s += col[i]! * col[i]!;
    const norm = Math.sqrt(s);
    if (norm === 0) {
      for (let j = k + 1; j < 3; j++) R[k * 3 + j] = z[j]![k]!;
      continue;
    }
    const x0 = col[k]!;
    const alpha = x0 > 0 ? -norm : norm;
    const v0 = x0 - alpha;
    const vtv = s - x0 * x0 + v0 * v0;
    col[k] = v0;
    for (let j = k + 1; j <= 3; j++) {
      const w = j < 3 ? z[j]! : y;
      let dot = 0;
      for (let i = k; i < m; i++) dot += col[i]! * w[i]!;
      const f = (2 * dot) / vtv;
      for (let i = k; i < m; i++) w[i] -= f * col[i]!;
    }
    R[k * 3 + k] = alpha;
    for (let j = k + 1; j < 3; j++) R[k * 3 + j] = z[j]![k]!;
  }
  // R·V = G with orthogonal columns: σⱼ = ‖Gⱼ‖, and β = Σⱼ Vⱼ (Gⱼ·Qᵀy) / σⱼ² over the σ that count
  const G = [0, 1, 2].map((j) => [R[j]!, R[3 + j]!, R[6 + j]!]);
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let turned = false;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const gp = G[p]!;
      const gq = G[q]!;
      const a = gp[0]! * gp[0]! + gp[1]! * gp[1]! + gp[2]! * gp[2]!;
      const b = gq[0]! * gq[0]! + gq[1]! * gq[1]! + gq[2]! * gq[2]!;
      const g = gp[0]! * gq[0]! + gp[1]! * gq[1]! + gp[2]! * gq[2]!;
      if (g === 0 || Math.abs(g) <= 1e-15 * Math.sqrt(a * b)) continue;
      turned = true;
      const zeta = (b - a) / (2 * g);
      const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
      const cs = 1 / Math.sqrt(1 + t * t);
      const sn = cs * t;
      for (const M of [G, V]) {
        const mp = M[p]!;
        const mq = M[q]!;
        for (let i = 0; i < 3; i++) {
          const u = mp[i]!;
          const v = mq[i]!;
          mp[i] = cs * u - sn * v;
          mq[i] = sn * u + cs * v;
        }
      }
    }
    if (!turned) break;
  }
  const sigma = G.map((gj) => Math.hypot(gj[0]!, gj[1]!, gj[2]!));
  const cutoff = EPS * Math.max(m, 3) * Math.max(...sigma);
  const beta: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    if (!(sigma[j]! > cutoff)) continue;
    const gj = G[j]!;
    const w = (gj[0]! * y[0]! + gj[1]! * y[1]! + gj[2]! * y[2]!) / (sigma[j]! * sigma[j]!);
    for (let i = 0; i < 3; i++) beta[i] += w * V[j]![i]!;
  }
  return beta;
}

interface Scratch {
  z: [Float64Array, Float64Array, Float64Array];
  y: Float64Array;
}

/**
 * The echo on an outside prior, for one item: per fold, ŷ = a + b·prior + c·earlier fitted on the
 * other folds, falling back to the prior when fewer than twenty of them are complete. Where a person
 * has no earlier answer, the prior stands in for it. Returns the score and the answer it rounds to.
 */
function echoColumn(y: Float64Array, x: Float64Array, prior: Float64Array, blind: Blind, admissible: Float64Array[], s: Scratch): { score: Float64Array; point: Float64Array } {
  const n = y.length;
  const score = new Float64Array(n).fill(NaN);
  const point = new Float64Array(n).fill(NaN);
  const { folds, labels } = blind;
  for (let fi = 0; fi < labels.length; fi++) {
    const f = labels[fi]!;
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (folds[i] === f || Number.isNaN(prior[i]!) || Number.isNaN(x[i]!) || Number.isNaN(y[i]!)) continue;
      s.z[0][m] = 1;
      s.z[1][m] = prior[i]!;
      s.z[2][m] = x[i]!;
      s.y[m] = y[i]!;
      m++;
    }
    const fit = m < MIN_TRAIN ? null : lstsq3(s.z, s.y, m);
    for (let i = 0; i < n; i++) {
      if (folds[i] !== f) continue;
      const p = prior[i]!;
      score[i] = fit ? fit[0] + fit[1] * p + fit[2] * (Number.isNaN(x[i]!) ? p : x[i]!) : p;
      point[i] = toAdmissible(score[i]!, admissible[fi]!);
    }
  }
  return { score, point };
}

function ceilingColumn(earlier: Float64Array, truth: Float64Array, both: Uint8Array, span: number): Ceiling {
  const vals: number[] = [];
  let agree = 0;
  let m = 0;
  for (let i = 0; i < truth.length; i++) {
    if (!both[i]) continue;
    agree += 1 - Math.abs(earlier[i]! - truth[i]!) / span;
    m++;
    vals.push(earlier[i]!, truth[i]!);
  }
  vals.sort((a, b) => a - b);
  const levels: number[] = [];
  const counts: number[] = [];
  for (const v of vals) {
    if (levels.length && levels[levels.length - 1] === v) counts[counts.length - 1]++;
    else {
      levels.push(v);
      counts.push(1);
    }
  }
  const col = fitRho({ levels, shares: counts.map((k) => k / vals.length), span, rho: 0.5 }, agree / m);
  return { rho: col.rho, base: baseAccuracy(col), ceiling: ceilingAccuracy(col) };
}

/** The audit as steps, one per item: the caller decides whether to breathe between them. */
function* steps(panel: Panel, twins: Record<string, Table>, opts: AuditOptions = {}): Generator<AuditProgress, AuditResult> {
  const n = panel.ids.length;
  const C = panel.columns.length;
  const names = Object.keys(twins);
  const draws = opts.bootDraws ?? 2000;
  const seed = opts.seed ?? 0;
  const folds = resolveFolds(panel, opts);
  const blind: Blind = { folds, labels: [...new Set(folds)].sort((a, b) => a - b), admissible: [], crowd: [] };
  const total = C * (1 + names.length);
  let done = 0;

  const both = panel.truth.map((t, c) => Uint8Array.from(t, (v, i) => (!Number.isNaN(v) && !Number.isNaN(panel.earlier[c]![i]!) ? 1 : 0)));
  const per: Ceiling[] = [];
  for (let c = 0; c < C; c++) {
    const b = blindColumn(panel.truth[c]!, folds, blind.labels);
    blind.admissible.push(b.admissible);
    blind.crowd.push(b.crowd);
    per.push(ceilingColumn(panel.earlier[c]!, panel.truth[c]!, both[c]!, panel.span[c]!));
    yield { done: ++done, total, label: "the ceiling" };
  }
  const keys = ["rho", "base", "ceiling"] as const;
  const average = (list: Ceiling[]): Ceiling => {
    const out = { rho: 0, base: 0, ceiling: 0 };
    for (const k of keys) out[k] = list.reduce((s, v) => s + v[k], 0) / list.length;
    return out;
  };
  const byGroup = panel.groups.map((_, g) => average(per.filter((_c, c) => panel.groupOf[c] === g)));
  const overall = average(byGroup);

  const scratch: Scratch = { z: [new Float64Array(n), new Float64Array(n), new Float64Array(n)], y: new Float64Array(n) };
  const results: [string, TwinAudit][] = [];
  for (const name of names) {
    const guess = relaid(twins[name]!, panel.ids, panel.columns);
    const mask = guess.map((gu, c) => Uint8Array.from(gu, (v, i) => (both[c]![i] && !Number.isNaN(v) ? 1 : 0)));
    const people = new Uint8Array(n);
    for (const mk of mask) for (let i = 0; i < n; i++) if (mk[i]) people[i] = 1;
    const answered = people.reduce((s, v) => s + v, 0);
    if (!answered) {
      throw new AuditError(`The twin "${name}" has no prediction for any person and item of the panel. Check its ids and its column names against the truth table's.`);
    }
    const accT = personAccuracy(panel, guess, mask);
    const accC = personAccuracy(panel, blind.crowd, mask);
    const accA = personAccuracy(panel, panel.earlier, mask);
    const score: Float64Array[] = [];
    const point: Float64Array[] = [];
    for (let c = 0; c < C; c++) {
      const prior = Float64Array.from(guess[c]!, (v, i) => (Number.isNaN(v) ? blind.crowd[c]![i]! : v));
      const e = echoColumn(panel.truth[c]!, panel.earlier[c]!, prior, blind, blind.admissible[c]!, scratch);
      score.push(e.score);
      point.push(e.point);
      yield { done: ++done, total, label: name };
    }
    const accE = personAccuracy(panel, point, mask);
    const base = meanOf(accC, people);
    const accuracy = meanOf(accT, people);
    const retest = meanOf(accA, people);
    const withOneLook = meanOf(accE, people);
    const know = (a: number) => (overall.ceiling > base ? (a - base) / (overall.ceiling - base) : NaN);
    const vsCrowd = difference(accT, accC, people);
    const gain = difference(accE, accT, people);
    results.push([name, {
      people: answered,
      accuracy,
      crowd: base,
      retest,
      with_one_look: withOneLook,
      vs_crowd: vsCrowd.length ? vsCrowd.reduce((s, v) => s + v, 0) / vsCrowd.length : NaN,
      vs_crowd_ci95: bootCi(vsCrowd, draws, seed),
      one_look_gain: gain.length ? gain.reduce((s, v) => s + v, 0) / gain.length : NaN,
      one_look_gain_ci95: bootCi(gain, draws, seed + 1),
      r: individualR(panel, guess, mask),
      r_crowd: 0,
      r_retest: individualR(panel, panel.earlier, mask),
      r_with_one_look: individualR(panel, score, mask),
      knows: know(accuracy),
      knows_with_one_look: know(withOneLook),
      knows_retest: know(retest),
    }]);
  }
  return {
    people: n,
    items: C,
    groups: panel.groups.length,
    ceiling: { overall, by_group: Object.fromEntries(panel.groups.map((g, i) => [g, byGroup[i]!])) },
    twins: Object.fromEntries(results),
  };
}

/** The audit, in one go. On the server, or wherever a pause does not matter. */
export function audit(panel: Panel, twins: Record<string, Table>, opts?: AuditOptions): AuditResult {
  const it = steps(panel, twins, opts);
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
  }
}

/** Hands the thread back for a moment. A message, not a timer: a timer is slowed in a tab nobody is looking at. */
function breathe(): Promise<void> {
  if (typeof MessageChannel === "undefined") return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/**
 * The same audit, giving the page its thread back every few milliseconds, so that a panel of two
 * thousand people and a hundred items does not freeze it. `onProgress` is called at each pause.
 */
export async function auditAsync(
  panel: Panel,
  twins: Record<string, Table>,
  opts: AuditOptions & { onProgress?: (p: AuditProgress) => void; signal?: AbortSignal; sliceMs?: number } = {},
): Promise<AuditResult> {
  const it = steps(panel, twins, opts);
  const slice = opts.sliceMs ?? 12;
  let since = Date.now();
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
    if (Date.now() - since < slice) continue;
    opts.onProgress?.(step.value);
    await breathe();
    if (opts.signal?.aborted) throw new DOMException("The audit was stopped.", "AbortError");
    since = Date.now();
  }
}
