/**
 * Outcome aggregation (§9) — pure. Turns the raw Outcome list into the numbers the
 * dashboard renders: conversion, requested destinations, budget mix, the top reasons for
 * NO purchase (the core THY insight), and defections to other "islands."
 */
import type { Outcome } from "../types";

export interface Aggregates {
  total: number;
  booked: number;
  conversionRate: number; // 0..1
  humans: number;
  byDestination: { key: string; count: number }[];
  byBudget: { low: number; mid: number; high: number };
  bySegment: { key: string; count: number }[];
  noPurchaseReasons: { key: string; count: number }[];
  defections: { total: number; byTarget: { key: string; count: number }[] };
  sentiment: { positive: number; neutral: number; negative: number };
  avgDwellSeconds: number;
}

function tally<T extends string>(items: (T | undefined)[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) if (it) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function aggregate(outcomes: Outcome[]): Aggregates {
  const total = outcomes.length;
  const booked = outcomes.filter((o) => o.booked).length;
  const defected = outcomes.filter((o) => o.defectedTo);
  const dwell = outcomes.reduce((s, o) => s + (o.dwellSeconds || 0), 0);

  return {
    total,
    booked,
    conversionRate: total ? booked / total : 0,
    humans: outcomes.filter((o) => o.isHuman).length,
    byDestination: tally(outcomes.map((o) => o.destinationRequested)).slice(0, 8),
    byBudget: {
      low: outcomes.filter((o) => o.budgetBand === "low").length,
      mid: outcomes.filter((o) => o.budgetBand === "mid").length,
      high: outcomes.filter((o) => o.budgetBand === "high").length,
    },
    bySegment: tally(outcomes.map((o) => o.segment)),
    noPurchaseReasons: tally(outcomes.filter((o) => !o.booked).map((o) => o.noPurchaseReason)),
    defections: { total: defected.length, byTarget: tally(defected.map((o) => o.defectedTo)) },
    sentiment: {
      positive: outcomes.filter((o) => o.sentiment === "positive").length,
      neutral: outcomes.filter((o) => o.sentiment === "neutral").length,
      negative: outcomes.filter((o) => o.sentiment === "negative").length,
    },
    avgDwellSeconds: total ? Math.round(dwell / total) : 0,
  };
}
