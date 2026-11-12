/**
 * The village's count (DECISIONS C91): what people who walked here did at each moment, with no names,
 * so that the echo can start from "what most people do" and be held against it.
 *
 * WHY. The paper's first finding is that a guess which knows nobody, the crowd's typical answer, beats
 * every twin built from words. So the crowd is the bar a watching echo has to clear, and until now the
 * open world had none: a first call was a coin's. This is the bar. It is also the prior: a call about
 * a person starts at what people do at that moment, and moves by how this person has differed from
 * people so far (`callFor`).
 *
 * WHAT A ROW IS. One settled envelope: the moment, the arm met, the echo's call and what was done,
 * under a random id made in the browser for this count alone (never the echo's subject). It is added
 * only by someone who said yes to it in words that named it, and is theirs to remove.
 *
 * OFF UNTIL SWITCHED ON. `ECHO_OPEN_CROWD=1` and migration 0040; without both the route answers
 * `on: false`, nothing is sent, and every call is made as before.
 *
 * Pure: the shapes, the checks, and the arithmetic. The storing is `lib/openCount.ts`.
 */
import { MOMENTS, type MomentKind } from "@echo/planet";

import { ON, outcomesOf, type CrowdPrior } from "./calls";

/** One settled envelope, as it goes into the count. */
export interface CountRow {
  /** The envelope's seal: a row is written once. */
  seal: string;
  cell: string;
  kind: MomentKind;
  arm: string | null;
  call: string;
  did: string;
  /** How many times the echo had seen them at this moment, and at its family's others, when it called. */
  same: number;
  family: number;
  /** When it was sealed, ISO. */
  at: string;
}

/** The id a browser adds its rows under: random, for this alone. */
export const VISITOR = /^[a-z0-9]{20,40}$/;
export const ROWS_MAX = 80;
/** People who must have met a moment before the count says anything about it. */
export const CROWD_MIN = 10;

const HEX64 = /^[0-9a-f]{64}$/;
const CELL = /^[0-9a-f]{15}$/;

/** A row the count will take, or null: a real moment, an arm it has, endings it can have, a seal, a time. */
export function validRow(x: unknown): CountRow | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const kind = r.kind as MomentKind;
  // `hasOwn`, not a lookup: "constructor" is on every object, and is no moment.
  if (typeof r.kind !== "string" || !Object.hasOwn(MOMENTS, r.kind) || MOMENTS[kind].followUp) return null;
  if (typeof r.seal !== "string" || !HEX64.test(r.seal)) return null;
  if (typeof r.cell !== "string" || !CELL.test(r.cell)) return null;
  const arm = r.arm ?? null;
  if (arm !== null && (typeof arm !== "string" || !(MOMENTS[kind].arms ?? []).some((a) => a.id === arm))) return null;
  const outs = outcomesOf(kind);
  if (typeof r.call !== "string" || typeof r.did !== "string" || !outs.includes(r.call) || !outs.includes(r.did)) return null;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 10_000;
  if (!whole(r.same) || !whole(r.family)) return null;
  if (typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) return null;
  return { seal: r.seal, cell: r.cell, kind, arm: arm as string | null, call: r.call, did: r.did, same: r.same, family: r.family, at: new Date(r.at).toISOString() };
}

/** What the store counts: for a moment and an arm of it, how often it ended each way, and among how many people. */
export interface Counted {
  kind: string;
  /** The arm, or "-" for a moment with none. */
  arm: string;
  did: string;
  n: number;
  people: number;
}

/** A moment's count: how it ended, over how many people (for the arms pooled, the most any one arm had). */
export interface CrowdCell {
  people: number;
  did: Record<string, number>;
}

/** The count as the page gets it: per moment, pooled over its arms and for each arm, only where enough people met it. */
export type Crowd = Partial<Record<MomentKind, { all: CrowdCell | null; arms: Record<string, CrowdCell> }>>;

/** The count, from the store's rows: a cell fewer than `min` people met says nothing. */
export function crowdFrom(counted: readonly Counted[], min: number = CROWD_MIN): Crowd {
  const out: Crowd = {};
  const raw = new Map<string, { kind: MomentKind; arm: string; cell: CrowdCell }>();
  for (const c of counted) {
    const kind = c.kind as MomentKind;
    if (typeof c.kind !== "string" || !Object.hasOwn(MOMENTS, c.kind) || !outcomesOf(kind).includes(c.did) || !(c.n > 0)) continue;
    const key = `${kind}|${c.arm}`;
    const at = raw.get(key) ?? { kind, arm: c.arm, cell: { people: 0, did: {} } };
    at.cell.people = Math.max(at.cell.people, c.people);
    at.cell.did[c.did] = (at.cell.did[c.did] ?? 0) + c.n;
    raw.set(key, at);
  }
  for (const { kind, arm, cell } of raw.values()) {
    const k = (out[kind] ??= { all: { people: 0, did: {} }, arms: {} });
    // Pooled over arms, the people are at least the most any one arm had: someone may have met several.
    k.all!.people = Math.max(k.all!.people, cell.people);
    for (const [did, n] of Object.entries(cell.did)) k.all!.did[did] = (k.all!.did[did] ?? 0) + n;
    if (arm !== "-" && cell.people >= min) k.arms[arm] = cell;
  }
  for (const kind of Object.keys(out) as MomentKind[]) {
    const k = out[kind]!;
    if (k.all!.people < min) k.all = null;
    if (!k.all && Object.keys(k.arms).length === 0) delete out[kind];
  }
  return out;
}

/** The count for a moment as it was met: its arm's where there is one, otherwise the moment's. */
export function cellOf(crowd: Crowd | null, kind: MomentKind, arm: string | null): CrowdCell | null {
  const k = crowd?.[kind];
  return (arm ? k?.arms[arm] : null) ?? k?.all ?? null;
}

/** What most people did there: the crowd's call, or null where the count says nothing. A tie goes to the first listed. */
export function crowdCall(crowd: Crowd | null, kind: MomentKind, arm: string | null): string | null {
  const cell = cellOf(crowd, kind, arm);
  if (!cell) return null;
  let best: string | null = null;
  for (const o of outcomesOf(kind)) if ((cell.did[o] ?? 0) > (best === null ? 0 : cell.did[best]!)) best = o;
  return best;
}

/** The count as a prior for `callFor`: how often people do anything there, and which thing, lightly smoothed. */
export function priorOf(crowd: Crowd | null, kind: MomentKind, arm: string | null): CrowdPrior | null {
  const cell = cellOf(crowd, kind, arm);
  if (!cell) return null;
  const verbs = outcomesOf(kind).filter((o) => o !== ON);
  const total = outcomesOf(kind).reduce((s, o) => s + (cell.did[o] ?? 0), 0);
  if (total <= 0) return null;
  const acted = total - (cell.did[ON] ?? 0);
  // One imagined look spread evenly, so that nothing people have not yet done is called impossible.
  return {
    engage: (acted + 0.5) / (total + 1),
    verbs: Object.fromEntries(verbs.map((v) => [v, ((cell.did[v] ?? 0) + 1 / verbs.length) / (acted + 1)])),
  };
}
