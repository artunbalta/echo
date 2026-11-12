/**
 * How the twin audit writes its numbers (DECISIONS C90): one way, on the page, in the downloaded
 * report and in print, so a figure reads the same wherever it is met. A real minus sign, and a dash
 * where a value cannot be said.
 *
 * Also the one scale every "share of the knowable" bar is drawn on: the crowd at 0, the ceiling at 1.
 *
 * Pure.
 */
import type { AuditResult, TwinAudit } from "./audit";

const MINUS = "−";
export const NONE = "—";

const said = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

/** 0.5622 → "56%"; −0.33 → "−33%". */
export function pct(x: number | null | undefined): string {
  if (!said(x)) return NONE;
  const r = Math.round(100 * x);
  return `${r < 0 ? MINUS : ""}${Math.abs(r)}%`;
}

/** 0.72555 → "0.726". */
export function fixed(x: number | null | undefined, digits = 3): string {
  if (!said(x)) return NONE;
  return x.toFixed(digits).replace("-", MINUS);
}

/** −0.0355 → "−0.036"; 0.097 → "+0.097". */
export function signed(x: number | null | undefined, digits = 3): string {
  if (!said(x)) return NONE;
  const text = Math.abs(x).toFixed(digits);
  return `${x < 0 && Number(text) !== 0 ? MINUS : "+"}${text}`;
}

/** 2058 → "2,058". */
export function count(n: number | null | undefined): string {
  return said(n) ? Math.round(n).toLocaleString("en-US") : NONE;
}

/** The twins, the one that knows most first. A twin whose share cannot be said goes last. */
export function ranked(result: AuditResult): [string, TwinAudit][] {
  const key = (v: TwinAudit) => (said(v.knows) ? v.knows : -Infinity);
  return Object.entries(result.twins).sort((a, b) => key(b[1]) - key(a[1]));
}

export interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
  /** Where a share sits along the axis, 0–100, held inside it. */
  at(share: number): number;
}

/**
 * The axis for a set of shares: always from below the crowd to the ceiling, widened in quarters to
 * hold what it must, and never past ±2 (a bar that long is cut at the edge; its number still says it).
 */
export function scaleFor(shares: (number | null | undefined)[]): Scale {
  const seen = shares.filter(said);
  const lo = Math.max(-2, Math.min(-0.25, Math.floor(Math.min(0, ...seen) * 4) / 4));
  const hi = Math.min(2, Math.max(1, Math.ceil(Math.max(0, ...seen) * 4) / 4));
  const step = hi - lo > 2 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return { lo, hi, ticks, at: (share) => (100 * (Math.min(hi, Math.max(lo, share)) - lo)) / (hi - lo) };
}
