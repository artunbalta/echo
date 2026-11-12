/**
 * The twin audit (DECISIONS C90): the TypeScript port held to `research/deeds`, and the product
 * around it held to itself.
 *
 * - the numerics agree with scipy and numpy (Φ, Φ⁻¹, Gauss–Hermite);
 * - the theory's closed forms pass the landmarks of `research/deeds/tests/test_theory.py`;
 * - given numpy's folds, the audit agrees with `research/deeds/audit.py` on a panel built to be
 *   awkward (`fixtures/knowable_fixture.py` writes it), and passes `test_audit.py`'s own assertions;
 * - nothing sees what it predicts: the crowd for a fold is the other folds' and no one else's, and
 *   changing a person's answers moves none of their own guesses;
 * - the page's two data files are the research record's, to the byte and to the key;
 * - the CSV reader, the synthetic panel, the report and the route.
 *
 * Run:  node --import tsx --test apps/web/tests/knowable.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GH80, gaussHermite, median, normCdf, normInv, pearson, quantile, rng } from "../src/lib/knowable/stats";
import * as T from "../src/lib/knowable/theory";
import { baseAccuracy, ceilingAccuracy, fitRho, knowledgeIndex, retestAccuracy } from "../src/lib/knowable/ceiling";
import { AuditError, audit, auditAsync, bootCi, crowd, foldsOf, panelOf, toAdmissible, type AuditResult, type Items, type Table, type TwinAudit } from "../src/lib/knowable/audit";
import { CsvError, itemsFromCsv, itemsToCsv, parseCsv, tableFromCsv, tableToCsv } from "../src/lib/knowable/csv";
import { SYNTH_TWINS, isSynthetic, synthPanel } from "../src/lib/knowable/synth";
import { AUDIT_LIMITS, auditReply } from "../src/lib/knowable/api";
import { reportHtml } from "../src/lib/knowable/report";
import { fixed, pct, ranked, scaleFor, signed } from "../src/lib/knowable/format";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(HERE, path));

interface Fixture {
  items: Items;
  truth: Table;
  earlier: Table;
  twins: Record<string, Table>;
  panel: { ids: string[]; columns: string[]; groups: string[]; folds: number[]; crowd: Table };
  audit: AuditResult;
  numerics: {
    ndtr: [number, number][];
    ndtri: [number, number][];
    nodes: number[];
    weights: number[];
    columns: { levels: number[]; shares: number[]; span: number; rho: number; retest: number; base: number; ceiling: number; fit_to: number; fitted_rho: number }[];
    theory: { echo: [number, number, number, number][]; looks_needed: [number, number, number, number][] };
  };
}
const fx = JSON.parse(read("fixtures/knowable_fixture.json").toString("utf8")) as Fixture;

const near = (a: number, b: number, eps: number, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b} (off by ${Math.abs(a - b)})`);

// ── the numerics ────────────────────────────────────────────────────────────────────────────────

test("Φ and Φ⁻¹ are scipy's, and each undoes the other", () => {
  for (const [z, want] of fx.numerics.ndtr) near(normCdf(z), want, 1e-12, `Φ(${z})`);
  for (const [p, want] of fx.numerics.ndtri) near(normInv(p), want, 1e-12 * Math.max(1, Math.abs(want)), `Φ⁻¹(${p})`);
  for (let p = 0.0005; p < 1; p += 0.0005) near(normCdf(normInv(p)), p, 1e-12, `Φ(Φ⁻¹(${p}))`);
  for (let z = -6; z <= 6; z += 0.37) near(normInv(normCdf(z)), z, 1e-7, `Φ⁻¹(Φ(${z}))`);
  assert.equal(normCdf(-Infinity), 0);
  assert.equal(normCdf(Infinity), 1);
  assert.equal(normInv(0), -Infinity);
  assert.equal(normInv(1), Infinity);
  assert.ok(Number.isNaN(normInv(1.2)));
});

test("Gauss–Hermite: the weights sum to 1, integrate x², x⁴ and x⁶ exactly, and are numpy's", () => {
  const { nodes, weights } = GH80;
  const moment = (k: number) => nodes.reduce((s, x, i) => s + weights[i]! * x ** k, 0);
  near(moment(0), 1, 1e-13, "Σw");
  near(moment(1), 0, 1e-13, "E[x]");
  near(moment(2), 1, 1e-12, "E[x²]");
  near(moment(4), 3, 1e-11, "E[x⁴]");
  near(moment(6), 15, 1e-10, "E[x⁶]");
  for (let i = 0; i < 80; i++) {
    near(nodes[i]!, fx.numerics.nodes[i]!, 1e-11, `node ${i}`);
    near(weights[i]!, fx.numerics.weights[i]!, 1e-13, `weight ${i}`);
  }
  const five = gaussHermite(5); // an odd rule has a node at zero
  assert.equal(five.nodes[2], 0);
  near(five.nodes.reduce((s, x, i) => s + five.weights[i]! * x ** 4, 0), 3, 1e-12, "5-point E[x⁴]");
});

test("the seeded stream, the quantile and r", () => {
  const a = rng(7);
  const b = rng(7);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  assert.notEqual(rng(8).next(), rng(7).next());
  const r = rng(1);
  for (let i = 0; i < 5000; i++) {
    const k = r.int(7);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
  }
  const shuffled = rng(3).shuffle(Array.from({ length: 50 }, (_, i) => i));
  assert.deepEqual([...shuffled].sort((x, y) => x - y), Array.from({ length: 50 }, (_, i) => i));
  assert.notDeepEqual(shuffled, Array.from({ length: 50 }, (_, i) => i));
  const z = Array.from({ length: 40000 }, () => r.normal());
  near(z.reduce((s, v) => s + v, 0) / z.length, 0, 0.02, "mean of normals");
  near(z.reduce((s, v) => s + v * v, 0) / z.length, 1, 0.03, "variance of normals");
  // numpy: np.quantile([1, 2, 3, 4], .25) == 1.75
  near(quantile([4, 1, 3, 2], 0.25), 1.75, 1e-15);
  near(quantile([4, 1, 3, 2], 0.975), 3.925, 1e-12);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  near(pearson([1, 2, 3, 4], [2, 4, 6, 8.5]), 10.75 / Math.sqrt(5 * 23.1875), 1e-12);
  assert.ok(Number.isNaN(pearson([1, 1, 1], [1, 2, 3])));
});

// ── the theory (research/deeds/tests/test_theory.py) ───────────────────────────────────────────

test("the landmarks: ρ², ρ, and copying crossing the crowd at one half", () => {
  near(T.echo(0.6, 0, 1), 0.36, 1e-12, "one look, no persona: ρ²");
  near(T.echo(0.6, 0.05, 10_000), 0.6, 1e-3, "many looks: ρ");
  assert.ok(T.copying(0.49) < T.crowd() && T.crowd() < T.copying(0.51));
  assert.equal(T.copying(0.5), 0);
  assert.ok(T.echo(0.7, 0.05, 1) > T.copying(0.7), "the echo always beats copying");
  assert.equal(T.echo(0.7, 0.05, 0), T.persona(0.05));
  assert.equal(T.oracle(0.7), 0.7);
  near(T.knowing(0.36, 0.6), 0.6, 1e-12);
  for (const [rho, pi, n, want] of fx.numerics.theory.echo) near(T.echo(rho, pi, n), want, 1e-12, `echo(${rho}, ${pi}, ${n})`);
});

test("looksNeeded is the inverse of echo", () => {
  for (const [rho, pi, q] of [[0.6, 0, 0.8], [0.5, 0, 0.8], [0.87, 0, 0.8], [0.6, 0.05, 0.9]] as const) {
    const n = T.looksNeeded(q, rho, pi);
    assert.ok(T.echo(rho, pi, 1) <= q * rho + 1e-12 || n <= 1);
    const s = rho - pi;
    near(pi + (n * s * s) / (n * s + 1 - rho), q * rho, 1e-12, "at the real-valued n the echo knows exactly q of the knowable");
  }
  near(T.looksNeeded(0.8, 0.6), ((0.8 / 0.2) * 0.4) / 0.6, 1e-12, "q/(1−q) · (1−ρ)/ρ");
  for (const [q, rho, pi, want] of fx.numerics.theory.looks_needed) near(T.looksNeeded(q, rho, pi), want, 1e-12);
  assert.equal(T.looksNeeded(0.5, 0.6, 0.4), 0, "a persona that already knows that much needs no look");
  assert.throws(() => T.looksNeeded(1, 0.6), RangeError);
});

test("the echo's closed form matches a simulation of its own model", () => {
  const r = rng(0);
  for (const [rho, pi, n] of [[0.6, 0, 1], [0.6, 0.05, 1], [0.8, 0.1, 3], [0.45, 0.02, 5]] as const) {
    const people = 300_000;
    const w = (rho - pi) / (rho - pi + (1 - rho) / n);
    let se = 0;
    let sy = 0;
    let syy = 0;
    for (let i = 0; i < people; i++) {
      const A = Math.sqrt(pi) * r.normal();
      const U = Math.sqrt(rho - pi) * r.normal();
      let xbar = 0;
      for (let k = 0; k < n; k++) xbar += A + U + Math.sqrt(1 - rho) * r.normal();
      xbar /= n;
      const y = A + U + Math.sqrt(1 - rho) * r.normal();
      const guess = A + w * (xbar - A);
      se += (y - guess) ** 2;
      sy += y;
      syy += y * y;
    }
    const variance = syy / people - (sy / people) ** 2;
    near(T.echo(rho, pi, n), 1 - se / people / variance, 0.007, `echo(${rho}, ${pi}, ${n})`);
  }
});

// ── the ceiling ─────────────────────────────────────────────────────────────────────────────────

test("the ordinal ceiling is the Python's: retest, base, ceiling and the fitted ρ", () => {
  for (const c of fx.numerics.columns) {
    const col = { levels: c.levels, shares: c.shares, span: c.span, rho: c.rho };
    near(retestAccuracy(col), c.retest, 1e-12, "retest");
    near(baseAccuracy(col), c.base, 1e-12, "base");
    near(ceilingAccuracy(col), c.ceiling, 1e-12, "ceiling");
    near(fitRho(col, c.fit_to).rho, c.fitted_rho, 1e-10, "fitted ρ");
    assert.ok(ceilingAccuracy(col) > retestAccuracy(col), "knowing the person beats one answer guessing the next");
    assert.ok(ceilingAccuracy(col) >= baseAccuracy(col));
  }
  near(knowledgeIndex(0.8, 0.75, 0.85), 0.5, 1e-12);
  assert.ok(Number.isNaN(knowledgeIndex(0.8, 0.9, 0.9)));
});

// ── the audit against research/deeds/audit.py ───────────────────────────────────────────────────

const POINTS = ["accuracy", "crowd", "retest", "with_one_look", "vs_crowd", "one_look_gain", "r", "r_retest", "r_with_one_look", "knows", "knows_with_one_look", "knows_retest"] as const;

test("the panel is laid out as pandas lays it out", () => {
  const panel = panelOf(fx.truth, fx.earlier, fx.items);
  assert.deepEqual(panel.ids, fx.panel.ids, "the people in both waves, in the truth table's order");
  assert.deepEqual(panel.columns, fx.panel.columns, "the listed items that are columns of both");
  assert.deepEqual(panel.groups, fx.panel.groups);
  assert.ok(fx.truth.ids.length > panel.ids.length && fx.items.length > panel.columns.length, "the fixture does drop people and an item");
});

test("the crowd is the Python's, cell for cell", () => {
  const panel = panelOf(fx.truth, fx.earlier, fx.items);
  const mine = crowd(panel, { folds: fx.panel.folds });
  assert.deepEqual(mine, fx.panel.crowd);
  // the knife-edge item: half the folds answer 2 and half 4, so a blind crowd tells each side the other's answer
  const knife = panel.columns.indexOf("knife");
  assert.ok(knife >= 0 && mine.values.every((row, i) => row[knife] === (fx.panel.folds[i]! < 5 ? 4 : 2)), "a crowd that read a person's own fold would say one thing to everyone");
});

test("given numpy's folds, the audit agrees with audit.py to 1e-6", () => {
  const panel = panelOf(fx.truth, fx.earlier, fx.items);
  const res = audit(panel, fx.twins, { folds: fx.panel.folds });
  assert.equal(res.people, fx.audit.people);
  assert.equal(res.items, fx.audit.items);
  assert.equal(res.groups, fx.audit.groups);
  for (const k of ["rho", "base", "ceiling"] as const) {
    near(res.ceiling.overall[k], fx.audit.ceiling.overall[k], 1e-6, `ceiling.overall.${k}`);
    for (const g of Object.keys(fx.audit.ceiling.by_group)) near(res.ceiling.by_group[g]![k], fx.audit.ceiling.by_group[g]![k], 1e-6, `ceiling.${g}.${k}`);
  }
  assert.deepEqual(Object.keys(res.twins), Object.keys(fx.audit.twins));
  for (const [name, want] of Object.entries(fx.audit.twins)) {
    const got = res.twins[name]!;
    assert.equal(got.people, want.people, `${name}: people`);
    assert.equal(got.r_crowd, 0);
    for (const k of POINTS) near(got[k], want[k], 1e-6, `${name}.${k}`);
    // the intervals come from another random stream: they must hold their estimate and be as wide
    for (const [ci, point] of [["vs_crowd_ci95", "vs_crowd"], ["one_look_gain_ci95", "one_look_gain"]] as const) {
      const [lo, hi] = got[ci];
      assert.ok(lo <= got[point] + 1e-12 && got[point] <= hi + 1e-12, `${name}.${ci} holds its estimate`);
      const width = want[ci][1] - want[ci][0];
      if (width > 1e-9) assert.ok(Math.abs((hi - lo) / width - 1) < 0.2, `${name}.${ci} is ${hi - lo} wide, the Python's ${width}`);
      else near(hi - lo, 0, 1e-9, `${name}.${ci} width`);
    }
  }
  // the fixture is awkward where it claims to be
  assert.ok(res.twins.persona!.people < res.people, "a twin silent for some people is scored on the rest");
  assert.ok(res.twins.persona!.knows < 0 && res.twins.truth!.knows > 1);
});

// ── research/deeds/tests/test_audit.py, on a panel built to known answers ───────────────────────

function knownPanel(n = 400, items = 6, seed = 0) {
  const r = rng(seed);
  const steady = Array.from({ length: n }, () => Array.from({ length: items }, () => r.normal()));
  const wave = () => steady.map((row) => row.map((t) => Math.min(5, Math.max(1, Math.round(3 + t + 0.8 * r.normal())))));
  const columns = Array.from({ length: items }, (_, j) => `q${j}`);
  const ids = Array.from({ length: n }, (_, i) => String(i));
  const truth: Table = { ids, columns, values: wave() };
  const earlier: Table = { ids, columns, values: wave() };
  const meta: Items = columns.map((item, j) => ({ item, group: ["a", "a", "b", "b", "c", "c"][j]!, lo: 1, hi: 5 }));
  return { truth, earlier, meta, panel: panelOf(truth, earlier, meta) };
}

test("the crowd knows nothing and the truth everything", () => {
  const { truth, earlier, panel } = knownPanel();
  const res = audit(panel, { crowd: crowd(panel), truth, earlier });
  const tw = res.twins as Record<"crowd" | "truth" | "earlier", TwinAudit>;
  assert.ok(Math.abs(tw.crowd.knows) < 1e-12 && Math.abs(tw.crowd.vs_crowd) < 1e-12, "the crowd as a twin knows 0% of the knowable");
  assert.ok(tw.truth.accuracy === 1 && tw.truth.knows > 1, "the truth as a twin scores 1 and knows more than all of it");
  // the retest as a twin is the retest; one look through it beats it, as the theory says
  assert.ok(Math.abs(tw.earlier.accuracy - tw.earlier.retest) < 1e-12);
  assert.ok(tw.earlier.with_one_look > tw.earlier.accuracy);
  assert.ok(res.ceiling.overall.ceiling > res.ceiling.overall.base);
});

test("nothing sees what it predicts: the crowd for a fold is the other folds' median", () => {
  // forty people, ten folds of four, each fold of one mind: no fold's answer may reach its own crowd
  const folds = Array.from({ length: 40 }, (_, i) => i % 10);
  const answers = folds.map((f) => [f < 5 ? 1 : 5, 1 + (f % 5)]);
  const ids = folds.map((_, i) => `p${i}`);
  const truth: Table = { ids, columns: ["split", "ladder"], values: answers };
  const panel = panelOf(truth, truth, [{ item: "split", group: "g", lo: 1, hi: 5 }, { item: "ladder", group: "g", lo: 1, hi: 5 }]);
  const got = crowd(panel, { folds });
  for (let i = 0; i < 40; i++) {
    for (const j of [0, 1]) {
      const others = answers.filter((_, k) => folds[k] !== folds[i]).map((row) => row[j]!).sort((a, b) => a - b);
      const mid = (others[(others.length - 1) >> 1]! + others[others.length >> 1]!) / 2;
      assert.equal(got.values[i]![j], toAdmissible(mid, [...new Set(others)]), `person ${i}, item ${j}`);
    }
    assert.equal(got.values[i]![0], folds[i]! < 5 ? 5 : 1, "on the split item the blind crowd is always the other side");
  }
  // so the crowd as a twin scores nothing there, and everyone's own answer everything
  const res = audit(panelOf(truth, truth, [{ item: "split", group: "g", lo: 1, hi: 5 }]), { self: truth }, { folds });
  assert.equal(res.twins.self!.crowd, 0);
  assert.equal(res.twins.self!.accuracy, 1);
});

test("nothing sees what it predicts: a person's own answers move none of their guesses", () => {
  const { truth, earlier, meta } = knownPanel(240, 6, 5);
  const twins = { earlier };
  const who = 17;
  const moved: Table = { ...truth, values: truth.values.map((row, i) => (i === who ? row.map((v) => (v === 5 ? 1 : 5)) : row)) };
  const [before, after] = [truth, moved].map((t) => {
    const panel = panelOf(t, earlier, meta);
    return { crowd: crowd(panel), res: audit(panel, twins) };
  });
  assert.deepEqual(after!.crowd.values[who], before!.crowd.values[who], "their crowd did not read their answers");
  const other = before!.crowd.values.findIndex((row, i) => i !== who && row.some((v, j) => v !== after!.crowd.values[i]![j]));
  assert.ok(other >= 0 || after!.res.ceiling.overall.rho !== before!.res.ceiling.overall.rho, "while the change did reach the rest of the audit");
  // rounding: an answer nobody else gave is not an answer a score may round to
  assert.equal(toAdmissible(4.6, [1, 2, 3, 4]), 4);
  assert.equal(toAdmissible(2.5, [1, 2, 3, 4]), 2, "ties go to the lower");
  assert.equal(toAdmissible(9, [3]), 3);
  assert.ok(Number.isNaN(toAdmissible(NaN, [1, 2])) && Number.isNaN(toAdmissible(2, [])));
});

test("the audit says what is wrong with a panel, in words", () => {
  const { truth, earlier, meta, panel } = knownPanel(60, 6, 2);
  assert.throws(() => panelOf(truth, { ...earlier, ids: earlier.ids.map((id) => `x${id}`) }, meta), /Fewer than two people are in both/);
  assert.throws(() => panelOf(truth, earlier, [{ item: "nope", group: "a", lo: 1, hi: 5 }]), /No item in the items list/);
  assert.throws(() => panelOf(truth, earlier, meta.map((it) => ({ ...it, hi: 1 }))), /needs a scale with hi above lo/);
  assert.throws(() => panelOf(truth, { ...earlier, values: earlier.values.map((row) => [null, ...row.slice(1)]) }, meta), /Nobody answered the item "q0" in both waves/);
  assert.throws(() => audit(panel, { ghost: { ids: ["nobody"], columns: ["q0"], values: [[3]] } }), (err) => err instanceof AuditError && /The twin "ghost" has no prediction/.test(err.message));
  assert.throws(() => audit(panel, { earlier }, { folds: [0, 1, 2] }), /60 people in the panel and 3 folds/);
  assert.equal(foldsOf(25).length, 25);
  assert.deepEqual([...new Set(foldsOf(25))].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("auditAsync gives the page its thread back and the same answer", async () => {
  const { truth, earlier, panel } = knownPanel(200, 6, 3);
  const twins = { truth, earlier };
  const seen: number[] = [];
  const res = await auditAsync(panel, twins, { sliceMs: 0, onProgress: (p) => seen.push(p.done / p.total) });
  assert.deepEqual(res, audit(panel, twins));
  assert.ok(seen.length >= 6, `paused ${seen.length} times`);
  assert.ok(seen.every((v, i) => v > 0 && v <= 1 && (i === 0 || v >= seen[i - 1]!)), "progress only goes forward");
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(auditAsync(panel, twins, { sliceMs: 0, signal: stop.signal }), /stopped/);
});

// ── the page's numbers are the research record's ────────────────────────────────────────────────

test("twin2k-audit.json is research/deeds/runs/twin2k-audit.json, byte for byte", () => {
  assert.ok(read("../src/lib/knowable/data/twin2k-audit.json").equals(read("../../../research/deeds/runs/twin2k-audit.json")), "run: node apps/web/scripts/knowable-facts.mjs");
});

test("headline.json is what the script derives from facts.json today", async () => {
  const { headlineOf, CONTRASTS } = (await import("../scripts/knowable-facts.mjs" as string)) as { headlineOf(f: unknown): { facts: Record<string, number>; tasks: { task: string; crowd: number }[] }; CONTRASTS: string[] };
  const derived = headlineOf(JSON.parse(read("../../../research/deeds/runs/facts.json").toString("utf8")));
  assert.deepEqual(JSON.parse(read("../src/lib/knowable/data/headline.json").toString("utf8")), derived, "run: node apps/web/scripts/knowable-facts.mjs");
  assert.equal(derived.tasks.length, derived.facts["t1.tasks"]);
  assert.equal(CONTRASTS.length * 3, derived.facts["t4.x3.points"]);
  assert.ok(derived.tasks.every((t) => t.task && Number.isFinite(t.crowd)));
  assert.throws(() => headlineOf({}), /facts.json has no/);
  // the looks curve the page draws passes through the record's forecasts. It is not the curve at the
  // record's ρ: the record forecasts fold by fold and averages, which sits above that curve (the curve
  // bends), by a hair on most contrasts and by a good deal on the weakest
  for (const c of CONTRASTS) {
    const rho = derived.facts[`t4.x3.${c}.rho`]!;
    const forecasts = [1, 2, 3].map((n) => ({ n, pred: derived.facts[`t4.x3.${c}.pred${n}`]! }));
    for (const { n, pred } of forecasts) {
      near(T.echoThrough(rho, forecasts, n), pred, 1e-15, `${c}, ${n} looks`);
      assert.ok(T.echo(rho, 0, n) <= pred && T.echo(rho, 0, n) > pred / 2, `${c}, ${n} looks: the curve at ρ is ${T.echo(rho, 0, n)}, the record's forecast ${pred}`);
    }
    assert.equal(T.echoThrough(rho, forecasts, 0), 0);
    assert.ok(T.echoThrough(rho, forecasts, 2.5) > forecasts[1]!.pred && T.echoThrough(rho, forecasts, 2.5) < forecasts[2]!.pred);
  }
  assert.equal(T.echoThrough(0.6, [], 1), T.echo(0.6, 0, 1));
});

test("the pages type no number of the record's, and keep to their words", () => {
  const pages = ["../src/app/bench/page.tsx", "../src/app/audit/page.tsx", ...readdirSync(resolve(HERE, "../src/components/bench")).map((f) => `../src/components/bench/${f}`)];
  const record = JSON.parse(read("../src/lib/knowable/data/twin2k-audit.json").toString("utf8")) as AuditResult;
  // what the record says, as a hand would have typed it: 2,058 people, 0.869, −77%, 0.726…
  const typed = new Set<string>([record.people.toLocaleString("en-US"), String(record.people), record.ceiling.overall.ceiling.toFixed(3)]);
  for (const v of Object.values(record.twins)) {
    for (const x of [v.accuracy, v.with_one_look, v.r]) typed.add(x.toFixed(3));
    for (const x of [v.knows, v.knows_with_one_look, v.knows_retest]) typed.add(`${Math.abs(Math.round(100 * x))}%`);
  }
  for (const page of pages) {
    const source = read(page).toString("utf8");
    for (const number of typed) assert.ok(!source.includes(number), `${page} types ${number}: read it from the data files`);
    // DECISIONS C90: plans were committed, not registered; and this is an audit, not a standard or a benchmark
    for (const word of [/pre-?regist/i, /independently/i, /\bstandard\b/i, /certif/i, /benchmark/i, /echo index/i, /echo bench/i, /first to (show|find)/i, /revolution/i]) {
      assert.ok(!word.test(source), `${page} says ${word}`);
    }
  }
  const bench = read("../src/app/bench/page.tsx").toString("utf8");
  for (const must of ["We found none.", "we have a stake in this result", "manuscript under review", "Analysis plans were committed before each analysis", "arXiv:2609.13995", "says nothing against population-level accuracy"]) {
    assert.ok(bench.includes(must), `the results page no longer says: ${must}`);
  }
});

// ── the CSV reader ──────────────────────────────────────────────────────────────────────────────

test("a CSV as a spreadsheet writes it: BOM, CRLF, quotes, blanks", () => {
  const text = '\ufeffid,q1,"q, two",q3\r\n"p ""one""",1,2.5,\r\n\r\np2, 4 ,NA,"7"\r\n,,,\r\n"p\n3",-1,1e1,nan\r\n';
  const t = tableFromCsv(text, "truth.csv");
  assert.deepEqual(t.columns, ["q1", "q, two", "q3"]);
  assert.deepEqual(t.ids, ['p "one"', "p2", "p\n3"]);
  assert.deepEqual(t.values, [[1, 2.5, null], [4, null, 7], [-1, 10, null]]);
  assert.deepEqual(tableFromCsv(tableToCsv(t), "again"), t, "what it writes, it reads back");
  assert.deepEqual(parseCsv("a,b\n1,2").rows, [["a", "b"], ["1", "2"]], "no newline at the end");
  // the semicolon files Excel writes where the comma is the decimal mark
  assert.deepEqual(tableFromCsv("id;q1;q2\r\na;3,5;4\r\nb;;-0,25\r\n").values, [[3.5, 4], [null, -0.25]]);
  assert.deepEqual(tableFromCsv("id\tq1\na\t2\n").values, [[2]]);
});

test("a bad cell is named: the file, the row, the person, the column", () => {
  assert.throws(
    () => tableFromCsv("id,q1,q2\np1,1,2\n\np2,3,four\np3,x,1\n", "twin.csv"),
    (err) => err instanceof CsvError && err.message === 'twin.csv: row 4 (person "p2"), column "q2": "four" is not a number. Leave a cell empty for a missing answer.',
  );
  assert.throws(() => tableFromCsv("id,q1\np1,0x10\n", "t.csv"), /"0x10" is not a number/);
  assert.throws(() => tableFromCsv("id,q1,q2\np1,1\n", "t.csv"), /t\.csv: row 2 \(person "p1"\) has 2 cells where the header has 3/);
  assert.throws(() => tableFromCsv("id,q1\np1,1\np1,2\n", "t.csv"), /the person "p1" appears twice \(the second time on row 3\)/);
  assert.throws(() => tableFromCsv("id,q1,q1\np1,1,2\n", "t.csv"), /the column "q1" appears twice/);
  assert.throws(() => tableFromCsv("id,q1\n,1\n", "t.csv"), /row 2 has no person id/);
  assert.throws(() => tableFromCsv('id,q1\np1,"1\n', "t.csv"), /a quoted field opened on line 2 is never closed/);
  assert.throws(() => tableFromCsv("id,q1\n", "t.csv"), /no rows under the header/);
  assert.throws(() => tableFromCsv("just one column\n1\n", "t.csv"), /needs a header row/);
});

test("a long run of digits is read once: a cell that is not a number is refused at once, not after half a minute", () => {
  // The defect: `\\d+\\.?\\d*` let two runs trade digits, and 160 KB of digits with a letter at the end
  // took 26 s to refuse. That is a request anyone could send to the audit's endpoint.
  const digits = "7".repeat(160_000);
  const began = performance.now();
  assert.throws(() => tableFromCsv(`id,q1\np1,${digits}x\n`, "truth.csv"), CsvError);
  const took = performance.now() - began;
  assert.ok(took < 500, `refusing a 160 KB cell took ${took.toFixed(0)} ms`);
  // And what is a number still is one, in every shape a spreadsheet writes.
  const t = tableFromCsv("id,a,b,c,d,e,f\np1,3,-2.5,.5,4.,1e3,+7E-2\n");
  assert.deepEqual(Array.from(t.values[0]!), [3, -2.5, 0.5, 4, 1000, 0.07]);
  for (const bad of ["1.2.3", "--1", "1e", "e5", ".", "1,5x", "0x10"]) assert.throws(() => tableFromCsv(`id,a,b\np1,${bad},1\n`), CsvError, bad);
});

test("the interval is the middle 95 of 100 resamples of people, and no narrower", () => {
  // A known spread: 400 differences with standard deviation 1, so the mean's 95% interval is about
  // ±1.96/20 = ±0.098. A 90% interval (±0.082) or an 80% one must not pass for it.
  const stream = rng(5);
  const d = new Float64Array(400);
  for (let i = 0; i < d.length; i++) d[i] = stream.normal();
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (d.length - 1));
  const [lo, hi] = bootCi(d, 4000, 0);
  assert.ok(lo < mean && mean < hi);
  const half = (hi - lo) / 2;
  const want = (1.96 * sd) / Math.sqrt(d.length);
  near(half, want, want * 0.08, "half-width");
  assert.ok(half > (1.645 * sd) / Math.sqrt(d.length) * 1.06, "the interval is no wider than a 90% one");
  // Nobody differs: the interval is a point. Nobody at all: there is none.
  assert.deepEqual(bootCi(new Float64Array([0.25, 0.25, 0.25]), 200, 1), [0.25, 0.25]);
  assert.deepEqual(bootCi(new Float64Array(0), 200, 1), [NaN, NaN]);
});

test("with too few people to fit one look, the twin is left as it was: nothing is made of eighteen", () => {
  // Yes-or-no items, so both answers are in every fold and rounding to an answer people gave changes
  // nothing: what is left is the fit itself. People answer the second time as they did the first; the
  // twin says the opposite of what every third person said.
  const panelFor = (n: number) => {
    const ids = Array.from({ length: n }, (_, i) => `p${String(i).padStart(3, "0")}`);
    const columns = ["a", "b", "c"];
    const earlier = ids.map((_, i) => columns.map((_, j) => 1 + ((i + j) % 2)));
    const truth = earlier.map((row) => [...row]);
    const twin = earlier.map((row, i) => row.map((v) => (i % 3 === 0 ? 3 - v : v)));
    const items: Items = columns.map((item) => ({ item, group: "g", lo: 1, hi: 2 }));
    const table = (values: number[][]): Table => ({ ids, columns, values });
    return audit(panelOf(table(truth), table(earlier), items), { twin: table(twin) }, { bootDraws: 20 }).twins.twin!;
  };
  // Eighteen people: sixteen or seventeen to learn from in a fold, under the twenty a fit needs
  // (witnesses.py `_stack`). The echo falls back to the twin's own guess: one look adds exactly nothing.
  const few = panelFor(18);
  near(few.accuracy, 2 / 3, 1e-12, "the twin");
  assert.equal(few.one_look_gain, 0, "something was fitted to eighteen people");
  assert.equal(few.with_one_look, few.accuracy);
  // Sixty people: the fit sees that the earlier answer is the later one, and one look puts the twin right.
  const many = panelFor(60);
  near(many.accuracy, 2 / 3, 1e-12, "the twin");
  near(many.with_one_look, 1, 1e-9, "with one look");
});

test("the items file: item, group, lo, hi", () => {
  const items = itemsFromCsv("Group,item,lo,hi,note\r\nrisk,q1,1,5,first\r\n\"risk, again\",q2,0,1,\r\n", "items.csv");
  assert.deepEqual(items, [{ item: "q1", group: "risk", lo: 1, hi: 5 }, { item: "q2", group: "risk, again", lo: 0, hi: 1 }]);
  assert.deepEqual(itemsFromCsv(itemsToCsv(items)), items);
  assert.throws(() => itemsFromCsv("item,lo,hi\nq1,1,5\n", "items.csv"), /items\.csv: it needs the columns item, group, lo and hi\. Missing: group\./);
  assert.throws(() => itemsFromCsv("item,group,lo,hi\nq1,a,5,5\n", "items.csv"), /row 2 \(item "q1"\) has hi 5 not above lo 5/);
  assert.throws(() => itemsFromCsv("item,group,lo,hi\nq1,a,low,5\n", "items.csv"), /needs numbers for lo and hi/);
  assert.throws(() => itemsFromCsv("item,group,lo,hi\nq1,,1,5\n", "items.csv"), /has no group/);
  assert.throws(() => itemsFromCsv("item,group,lo,hi\nq1,a,1,5\nq1,a,1,5\n", "items.csv"), /the item "q1" appears twice/);
});

// ── the synthetic panel ─────────────────────────────────────────────────────────────────────────

test("the synthetic panel says it is synthetic, and behaves as the measured twins did", () => {
  const s = synthPanel();
  assert.equal(s.synthetic, true);
  assert.ok(Object.keys(s.twins).length === 3 && Object.keys(s.twins).every((name) => name.includes("(synthetic)")));
  assert.ok(s.truth.ids.every((id) => id.startsWith("syn-")));
  assert.ok(isSynthetic(s.truth.ids) && isSynthetic(s.twins[SYNTH_TWINS.persona]!.ids), "a template dropped back in is still known as synthetic");
  assert.ok(!isSynthetic(["syn-0001", "p2"]) && !isSynthetic([]));
  assert.deepEqual(synthPanel(), s, "the same seed, the same files");
  assert.notDeepEqual(synthPanel({ seed: 1 }).truth.values, s.truth.values);
  const res = audit(panelOf(s.truth, s.earlier, s.items), s.twins);
  const persona = res.twins[SYNTH_TWINS.persona]!;
  const copier = res.twins[SYNTH_TWINS.crowd]!;
  const retest = res.twins[SYNTH_TWINS.retest]!;
  assert.ok(persona.r > 0.05 && persona.r < 0.2, `the persona twin carries a little of the person (r ${persona.r})`);
  assert.ok(persona.vs_crowd_ci95[1] < 0 && persona.knows < -0.2, "and still scores under the crowd");
  assert.ok(persona.people < res.people, "it is silent for some people");
  assert.ok(Math.abs(copier.knows) < 0.1 && copier.r === 0, `a crowd copier knows nobody (${copier.knows})`);
  assert.ok(retest.knows > 0.2 && retest.knows < 0.8, `the retest sits between the crowd and the ceiling (${retest.knows})`);
  assert.ok(persona.knows_with_one_look > persona.knows_retest, "one look through the twin beats the retest");
  // the CSVs offered as templates are read back as the same panel
  assert.deepEqual(tableFromCsv(tableToCsv(s.truth)), s.truth);
  assert.deepEqual(itemsFromCsv(itemsToCsv(s.items)), s.items);
  const big = synthPanel({ people: 90, items: 30, groups: 14 });
  assert.equal(new Set(big.items.map((it) => it.item)).size, 30);
  assert.equal(new Set(big.items.map((it) => it.group)).size, 14);
});

// ── the report and the numbers' one way of being written ────────────────────────────────────────

test("numbers are written one way, and a twin's name cannot write HTML", () => {
  assert.equal(pct(-0.331), "−33%");
  assert.equal(pct(0.5622), "56%");
  assert.equal(pct(-0.001), "0%");
  assert.equal(pct(NaN), "—");
  assert.equal(pct(null), "—");
  assert.equal(fixed(0.72555), "0.726");
  assert.equal(signed(-0.0356),"−0.036");
  assert.equal(signed(0.097), "+0.097");
  assert.equal(signed(-0.0001), "+0.000");
  const scale = scaleFor([-0.766, 0.585, 1]);
  assert.deepEqual([scale.lo, scale.hi, scale.ticks], [-1, 1, [-1, -0.5, 0, 0.5, 1]]);
  assert.equal(scale.at(0), 50);
  assert.equal(scale.at(-9), 0, "a bar is held inside its axis");
  assert.deepEqual([scaleFor([]).lo, scaleFor([]).hi], [-0.25, 1]);

  const { truth, earlier, panel } = knownPanel(120, 6, 4);
  const res = audit(panel, { '<script>alert("x")</script>': truth, earlier });
  assert.deepEqual(ranked(res).map(([name]) => name), ['<script>alert("x")</script>', "earlier"], "the twin that knows most comes first");
  const html = reportHtml(res, { title: "A & B", synthetic: true, when: "today" });
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(html.includes("<title>A &amp; B</title>") && html.includes("Synthetic panel."));
  assert.ok(!reportHtml(res).includes("Synthetic panel."));
  assert.ok(!/https?:\/\//.test(html.replace(/echovirtualworld\.com|github\.com/g, "")) && !/<link|<img|src=/.test(html), "the file fetches nothing");
});

// ── the route ───────────────────────────────────────────────────────────────────────────────────

const { POST, GET } = await import("../src/app/api/v1/audit/route");
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/v1/audit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

test("POST /api/v1/audit: a panel in, its audit out, nothing kept", async () => {
  const s = synthPanel({ people: 120, items: 8, groups: 4, seed: 11 });
  const body = { items: s.items, truth: s.truth, earlier: s.earlier, twins: s.twins };
  const res = await post(body);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const out = (await res.json()) as AuditResult;
  assert.deepEqual(out, JSON.parse(JSON.stringify(audit(panelOf(s.truth, s.earlier, s.items), s.twins))), "the route runs the same audit as the page");
  assert.deepEqual(Object.keys(out.twins), Object.values(SYNTH_TWINS));
  assert.ok(out.people === 120 && out.items === 8 && out.groups === 4);

  // the same panel as the text of its CSVs
  const asCsv = { items: itemsToCsv(s.items), truth: tableToCsv(s.truth), earlier: tableToCsv(s.earlier), twins: Object.fromEntries(Object.entries(s.twins).map(([k, t]) => [k, tableToCsv(t)])) };
  assert.deepEqual(await (await post(asCsv)).json(), out);

  const seeded = (await (await post({ ...body, seed: 5, bootDraws: 200 })).json()) as AuditResult;
  assert.notDeepEqual(seeded.twins[SYNTH_TWINS.persona]!.vs_crowd_ci95, out.twins[SYNTH_TWINS.persona]!.vs_crowd_ci95);

  const about = (await (await GET()).json()) as { method: string; limits: { people: number }; kept: string };
  assert.equal(about.method, "POST");
  assert.equal(about.limits.people, AUDIT_LIMITS.people);
  assert.match(about.kept, /^Nothing/);
});

test("POST /api/v1/audit: a form on another site cannot make its visitors ask for an audit", async () => {
  const s = synthPanel({ people: 40, items: 4, groups: 2, seed: 2 });
  const body = { items: s.items, truth: s.truth, earlier: s.earlier, twins: { a: s.twins[SYNTH_TWINS.persona] } };
  const elsewhere: Record<string, string>[] = [{ "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded" }, { "content-type": "application/json", "sec-fetch-site": "cross-site" }];
  for (const headers of elsewhere) {
    const res = await POST(new Request("http://localhost/api/v1/audit", { method: "POST", headers, body: JSON.stringify(body) }));
    assert.equal(res.status, 415, JSON.stringify(headers));
    assert.match(((await res.json()) as { error: string }).error, /application\/json/);
  }
  // A script, which says only what it sends, is served.
  assert.equal((await post(body)).status, 200);
});

test("POST /api/v1/audit: what it will not serve, and why", async () => {
  const s = synthPanel({ people: 60, items: 4, groups: 2, seed: 3 });
  const body = { items: s.items, truth: s.truth, earlier: s.earlier, twins: { one: s.twins[SYNTH_TWINS.retest]! } };
  const refused = async (b: unknown, status: number, why: RegExp, headers?: Record<string, string>) => {
    const res = await post(b, headers);
    assert.equal(res.status, status, `expected ${status} for ${why}`);
    assert.match(((await res.json()) as { error: string }).error, why);
  };
  await refused("{not json", 400, /not JSON/);
  await refused([], 400, /must be a JSON object/);
  await refused({ ...body, earlier: undefined }, 400, /has no "earlier"/);
  await refused({ ...body, twins: {} }, 400, /twins is empty/);
  await refused({ ...body, truth: { ...s.truth, values: s.truth.values.map((row, i) => (i === 2 ? ["abc", ...row.slice(1)] : row)) } }, 400, /truth\.values\[2\]\[0\] \(person "syn-0003", column "sharing_1"\) is "abc"/);
  await refused({ ...body, truth: { ...s.truth, values: s.truth.values.slice(1) } }, 400, /truth has 60 ids and 59 rows/);
  await refused({ ...body, items: [{ item: "q", group: "g", lo: 5, hi: 1 }] }, 400, /hi above lo/);
  await refused({ ...body, truth: "id,sharing_1\nsyn-0001,x\n" }, 400, /truth: row 2 \(person "syn-0001"\), column "sharing_1": "x" is not a number/);
  await refused({ ...body, twins: { one: { ids: ["a"], columns: ["b"], values: [[1]] } } }, 400, /The twin "one" has no prediction/);
  await refused({ ...body, bootDraws: 1e9 }, 400, /bootDraws must be/);

  // the limits: 20 twins, 400 items, 5,000 people, 4 MB
  await refused({ ...body, twins: Object.fromEntries(Array.from({ length: AUDIT_LIMITS.twins + 1 }, (_, i) => [`t${i}`, body.twins.one])) }, 413, /21 twins, and the limit is 20/);
  await refused({ ...body, items: Array.from({ length: AUDIT_LIMITS.items + 1 }, (_, i) => ({ item: `i${i}`, group: "g", lo: 1, hi: 5 })) }, 413, /401 items, and the limit is 400/);
  const many = Array.from({ length: AUDIT_LIMITS.people + 1 }, (_, i) => `p${i}`);
  await refused({ ...body, truth: { ids: many, columns: ["sharing_1"], values: many.map(() => [1]) } }, 413, /5,001 people in truth, and the limit is 5,000/);
  await refused(JSON.stringify({ ...body, pad: "x".repeat(AUDIT_LIMITS.bytes) }), 413, /over 4 MB/);
  await refused("{}", 413, /over 4 MB/, { "content-length": String(AUDIT_LIMITS.bytes + 1) });
  assert.equal(auditReply(null).status, 400);
});
