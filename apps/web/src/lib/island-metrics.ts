/**
 * Phase 0 validation metric (BUILD-PLAN §0.F/§0.G) — pure, shared by the server metrics route
 * and the dashboard page so both compute the go/no-go number identically. The pre-registered
 * thresholds are set before testing and never moved post-hoc (§5.F).
 */
export const THRESHOLDS = { minN: 20, meanOverall: 4.0, specificMeRate: 0.7 };

export interface ValidationRow {
  overall: number;
  specific_total: number;
  specific_me: number;
  control_total: number;
  control_me: number;
  mocked: boolean;
}

export interface MetricsSummary {
  n: number;
  mockedExcluded: number;
  meanOverall: number;
  specificMeRate: number;
  controlMeRate: number;
  barnumMargin: number;
  thresholds: typeof THRESHOLDS;
  passes: boolean;
}

export function aggregate(rows: ValidationRow[]): MetricsSummary {
  const real = rows.filter((r) => !r.mocked);
  const n = real.length;
  const sum = (f: (r: ValidationRow) => number) => real.reduce((s, r) => s + (f(r) || 0), 0);
  const meanOverall = n ? sum((r) => r.overall) / n : 0;
  const specTotal = sum((r) => r.specific_total);
  const ctrlTotal = sum((r) => r.control_total);
  const specificMeRate = specTotal ? sum((r) => r.specific_me) / specTotal : 0;
  const controlMeRate = ctrlTotal ? sum((r) => r.control_me) / ctrlTotal : 0;
  const passes =
    n >= THRESHOLDS.minN &&
    meanOverall >= THRESHOLDS.meanOverall &&
    specificMeRate >= THRESHOLDS.specificMeRate &&
    specificMeRate > controlMeRate;
  return {
    n,
    mockedExcluded: rows.length - n,
    meanOverall: Number(meanOverall.toFixed(3)),
    specificMeRate: Number(specificMeRate.toFixed(3)),
    controlMeRate: Number(controlMeRate.toFixed(3)),
    barnumMargin: Number((specificMeRate - controlMeRate).toFixed(3)),
    thresholds: THRESHOLDS,
    passes,
  };
}

/** A raw localStorage validation record (written by IslandClient) → an aggregation row. */
interface RatedLine {
  control: boolean;
  isMe?: boolean;
}
export function rowFromLocalRecord(rec: {
  overall?: number;
  specific?: RatedLine[];
  controls?: RatedLine[];
  mocked?: boolean;
}): ValidationRow {
  const count = (ls?: RatedLine[]) => ({
    total: Array.isArray(ls) ? ls.length : 0,
    me: Array.isArray(ls) ? ls.filter((l) => l.isMe === true).length : 0,
  });
  const s = count(rec.specific);
  const c = count(rec.controls);
  return {
    overall: Number(rec.overall) || 0,
    specific_total: s.total,
    specific_me: s.me,
    control_total: c.total,
    control_me: c.me,
    mocked: rec.mocked === true,
  };
}
