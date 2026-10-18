/**
 * Villages trading with each other (DECISIONS C58): a market every sixth day, and the road to it.
 *
 * WHAT A VILLAGE HAS, AND WHAT IT LACKS. A trade that two or more grown people work at leaves goods
 * to spare: fish where there are fishers, grain where there are farmers, a knife where there is a
 * smith. A trade nobody works at is something the village goes without, unless somebody fetches it.
 *
 * WHO FETCHES IT. A village with traders or carters in it has a market, and a partner: the
 * neighbour within three rings that has the most of what this village lacks, the nearest of those
 * if it is a tie. The day before market day the traders and carters set off toward it and are gone
 * overnight. On market day they come back with its goods and stand at a stall on the green, and
 * for two days after they have them to trade.
 *
 * NOTHING HERE HAS A PRICE (Design Law 1, C58). No good is worth more than another, no village is
 * richer for it in any number, and nothing a stranger does moves any of it: the partner, the days and
 * the goods are the seed's and the day's. A stranger can trade with a trader as with anyone
 * (`trade.ts`), and there is nothing to buy cheap here and sell dear there, because there is no here
 * and no there in any number (SOC-7.A: player-inert).
 *
 * Pure. The neighbours are found by `villageAt.ts` `marketNeighbours`, which has the planet to ask.
 */

import { present } from "./life.js";
import { ageYears, hash01, occupationOn, type Occupation, type Settlement } from "./society.js";
import type { Point, VillagePlan } from "./village.js";

export const MARKETS = {
  /** A market every this many world days. */
  everyDays: 6,
  /** How far a village's traders go for what it lacks, in rings of cells. */
  rings: 3,
  /** A trade is a village's to spare when at least this many grown people work at it. */
  surplusWorkers: 2,
  /** What the traders brought, they have to trade on market day and this many days after. */
  stockDays: 2,
  /** At most this many goods come back from a market. */
  brings: 3,
} as const;

/** What a day at each trade leaves to spare. Every value is an item; trades that make nothing to carry have none. */
export const TRADE_GOODS: Partial<Record<Occupation, string>> = {
  fisher: "fish",
  farmer: "a handful of grain",
  herder: "cheese",
  forester: "dry branch",
  miner: "ore",
  stonecutter: "stone",
  smith: "knife",
  potter: "pot",
  weaver: "cloth",
  carpenter: "bowl",
  healer: "herbs",
  innkeeper: "bread",
};

/** Those who go to market: the trade that is trading, and the trade that carries. */
const GOERS: ReadonlySet<Occupation> = new Set(["trader", "carter"]);

/** How many grown people work at each trade on a day. */
export function workersOf(s: Settlement, day: number): Map<Occupation, number> {
  const out = new Map<Occupation, number>();
  for (const p of s.people) {
    if (!present(s, p, day) || ageYears(p, day) < 16) continue;
    const t = occupationOn(p, day);
    out.set(t, (out.get(t) ?? 0) + 1);
  }
  return out;
}

/** What a village has to spare: the goods of the trades enough of its people work at. */
export function goodsOf(s: Settlement, day: number): string[] {
  const w = workersOf(s, day);
  const out: string[] = [];
  for (const [trade, good] of Object.entries(TRADE_GOODS) as [Occupation, string][]) if ((w.get(trade) ?? 0) >= MARKETS.surplusWorkers) out.push(good);
  return out;
}

/** What a village goes without: the goods of the trades nobody here works at. */
export function lacksOf(s: Settlement, day: number): string[] {
  const w = workersOf(s, day);
  const out: string[] = [];
  for (const [trade, good] of Object.entries(TRADE_GOODS) as [Occupation, string][]) if ((w.get(trade) ?? 0) === 0) out.push(good);
  return out;
}

/** A neighbour a village might trade with, as the planet has it: in the village's own frame. */
export interface MarketCandidate {
  cell: string;
  name: string;
  goods: readonly string[];
  /** Its centre, in this village's local metres. */
  x: number;
  y: number;
  km: number;
}

export interface Market {
  partner: { cell: string; name: string; bearing: number; km: number };
  /** What the traders bring back from it: what it has and this village lacks. */
  brings: string[];
  /** `Person.id`s of the traders and carters who go. */
  goers: string[];
  /** Which day of the cycle is market day. */
  phase: number;
}

/** A village's market on a day, or null if nobody here trades, or no neighbour has what it lacks. */
export function marketOf(s: Settlement, candidates: readonly MarketCandidate[], day: number): Market | null {
  const goers = s.people.filter((p) => present(s, p, day) && ageYears(p, day) >= 16 && ageYears(p, day) < 68 && GOERS.has(occupationOn(p, day))).map((p) => p.id);
  if (goers.length === 0) return null;
  const lacks = new Set(lacksOf(s, day));
  let best: { c: MarketCandidate; brings: string[] } | null = null;
  for (const c of candidates) {
    if (c.cell === s.cell) continue;
    const brings = c.goods.filter((g) => lacks.has(g));
    if (brings.length === 0) continue;
    if (!best || brings.length > best.brings.length || (brings.length === best.brings.length && c.km < best.c.km)) best = { c, brings };
  }
  if (!best) return null;
  return {
    partner: { cell: best.c.cell, name: best.c.name, bearing: Math.atan2(best.c.y, best.c.x), km: best.c.km },
    brings: best.brings.slice(0, MARKETS.brings),
    goers,
    phase: Math.floor(hash01(`${s.seed}/${s.cell}/market`) * MARKETS.everyDays),
  };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Market day: the traders are back, at the stall. */
export const isMarketDay = (m: Market, day: number): boolean => mod(day - m.phase, MARKETS.everyDays) === 0;

/** The day before: the traders are on the road to the partner, and away overnight. */
export const isTravelDay = (m: Market, day: number): boolean => mod(day + 1 - m.phase, MARKETS.everyDays) === 0;

/** Days until the next market day: 0 on market day itself. */
export const daysToMarket = (m: Market, day: number): number => mod(m.phase - day, MARKETS.everyDays);

/** What the traders have from the market on a day: from market day for `stockDays` more. */
export function stockOn(m: Market, day: number): string[] {
  const since = mod(day - m.phase, MARKETS.everyDays);
  return since <= MARKETS.stockDays ? [...m.brings] : [];
}

/** Where the stall stands: at the edge of the green, facing in. The place's, not the day's. */
export function stallOf(plan: VillagePlan): { x: number; y: number; heading: number } {
  const a = hash01(`${plan.name}/stall`) * Math.PI * 2;
  const r = plan.greenRadiusM * 0.8;
  const at: Point = { x: plan.centre.x + Math.cos(a) * r, y: plan.centre.y + Math.sin(a) * r };
  return { ...at, heading: a + Math.PI };
}
