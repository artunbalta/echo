/**
 * The society substrate (SOCIETY-PLAN SOC-6.A): who lives on a cell, who they are to each other,
 * and who is alive right now — as a pure function of `(seed, cell, geography, day)` and nothing
 * else.
 *
 * THE ONE IDEA. Lifespan is drawn from the seed AT BIRTH and children are pre-drawn at pairing with
 * their birth days, so "is this person alive at time N" is
 *
 *     alive(p, day)  =  p.birthDay <= day  &&  p.birthDay + p.lifespanDays > day
 *
 * which is arithmetic. The entire lineage of a village — three hundred years of it, every marriage,
 * every child, every death — is therefore COMPUTABLE AT ANY INSTANT WITHOUT EVER HAVING BEEN
 * SIMULATED. That is what lets a planet hold 1.4 M people without 1.4 M rows (L1), without a
 * simulation tick that has nowhere to run (SOC-3.E), and without any of it having quietly happened
 * while nobody was looking. DECISIONS C26 makes it a rule rather than an implementation detail: the
 * demographic layer is READ-ONLY to players, because the moment one life can be saved or ended, that
 * person leaves the closed form and so does every descendant.
 *
 * WHAT IS MUTABLE AND WHAT IS NOT, restated here because this file is where it is enforced:
 *   IMMUTABLE, and computed here — birth, lifespan, death, parentage, pairing, household.
 *   MUTABLE, and NOT in this file — relationships with players, regard, reputation, wealth,
 *     employment changes, where someone is standing this afternoon. Those are the sparse delta
 *     (SOC-6.C) and they never come back here.
 *
 * L2, WHICH IS THE INVARIANT WORTH THE MOST. Nothing is a function of visit history. No roll happens
 * "when a player first arrives". Two players arriving in a different order see the same village, and
 * `society.test.ts` pins the stronger form: a lineage generated to day N is a PREFIX of the lineage
 * generated to any later day, person for person, birth for birth. Without that the shared world
 * forks silently and nobody finds out for a month.
 *
 * BOUNDED HISTORY, DELIBERATELY. A settlement has a founding date, not an infinite past — at most
 * {@link FOUNDING}`.maxYearsAgo`. Dwarf Fortress generates a few hundred years and stops, and that is
 * enough for everything to feel deep: what a person needs is a grandmother who is remembered and a
 * ruin nobody can date, not a continuous record back to the first fire.
 *
 * GEOGRAPHY IS INJECTED, NEVER MEASURED HERE. {@link SettlementGeography} arrives as six numbers in
 * `0..1`. Deriving them from an H3 cell is SOC-6.B and it carries a cost warning this file must not
 * inherit: `lib/planet.ts` records that measuring land across 284,004 cells takes ~10 s warm and
 * ~33 s cold, and a per-cell arability pass is a second scan of that size. `chooseCommons` already
 * took this shape — it takes `landFraction: (cell) => number` rather than sampling terrain itself —
 * and it is why that module is testable on a synthetic planet in a millisecond.
 *
 * DIFFERENTIATION COMES FROM CIRCUMSTANCE, NOT FROM A PROMPT (plan §5). Nothing here writes a
 * personality. Two people differ because one was born on a coast to a fisher who died young and the
 * other inherited a smithy in a mining valley with four living siblings. A thousand personalities
 * written by one model is one personality in a thousand hats; a thousand different lives are a
 * thousand different people, and the LLM at the point of contact is then reporting a life rather
 * than inventing one.
 *
 * NO LADDER (Blueprint Design Law 1). There is no score here, no level, no wealth, no number that
 * goes up. Occupation is what someone does, not a rank. The economy is SOC-7 and needs its own
 * written exemption; it does not get to arrive early through this file.
 *
 * COST, AND WHO PAYS IT. Generating a 300-year village is O(n^2) in people-ever-born with a small
 * constant, a few milliseconds at the sizes {@link CAPACITY_MAX} allows, and the result is monotone
 * in `throughDay`. So the caller MEMOISES per `(seed, cell)` and advances the horizon; this module
 * deliberately holds no cache of its own, because a cache in a pure module is the shortest path to a
 * function that is no longer pure.
 *
 * Everything here is pure. No clock, no randomness, no I/O, no DOM, no renderer, no h3-js. It runs
 * under `node --test` with nothing mocked.
 */

import { hashString } from "./terrain.js";
import { DAYS_PER_YEAR, daysToYears, yearsToDays } from "./worldclock.js";

// ── the dials ───────────────────────────────────────────────────────────────────

/**
 * How long people live.
 *
 * STATED PLAINLY: these are a DESIGN DIAL, not a simulation of any real society, historical or
 * present. They were chosen so that a village has grandparents, has graves, and has enough child
 * loss for a bereavement cue to have something to be about (SOC-6.G) — and no more than that. A
 * world that kills a quarter of its children is making a claim about the world it is set in, and
 * this one is not making that claim.
 *
 * `childMortality` resolves before adulthood, inside `childCeilingYears`. The adult draw is
 * approximately normal about `medianYears` with a standard deviation near a sixth of
 * `2 * spreadYears`, clamped into `[minAdultYears, maxYears]` — so a life of 96 exists and is rare,
 * which is what makes an elder worth having met.
 */
export const VITALS = {
  childMortality: 0.1,
  childCeilingYears: 6,
  medianYears: 68,
  spreadYears: 30,
  minAdultYears: 16,
  maxYears: 96,
} as const;

/**
 * When people pair, and with whom.
 *
 * `incomerChance` is what keeps a village from being one family. Somebody arrives from somewhere
 * else, brings a name nobody here has, and their grandchildren are locals — which is also where
 * surnames stop agreeing with geography, which is the correct and interesting outcome.
 */
export const PAIRING = {
  minAgeYears: 19,
  ageSpanYears: 8,
  maxAgeGapYears: 12,
  incomerChance: 0.45,
  /** Below this the pairing search gives up on a generation and people stay single. */
  remarryAfterYears: 4,
} as const;

/**
 * How many children a pair has, and when.
 *
 * The count is binomial over `maxChildren` with a per-trial probability damped by how full the
 * settlement already is, which is logistic growth written the short way: a village on good ground
 * with room grows, a full one holds, and neither needed a rule that says so. SOC-7.C's "developed
 * versus undeveloped, derived" falls out of the same damping rather than out of an authored tier.
 */
export const FERTILITY = {
  maxChildren: 6,
  /** Per-trial probability at an empty settlement. */
  baseRate: 0.62,
  /** The damping floor: even a full settlement replaces itself slowly rather than stopping dead. */
  pressureFloor: 0.18,
  firstBirthMinYears: 0.8,
  firstBirthSpanYears: 2,
  spacingMinYears: 1.5,
  spacingSpanYears: 2.5,
  maxMotherAgeYears: 42,
} as const;

/** When a settlement was founded, and how big it is allowed to get. */
export const FOUNDING = {
  minYearsAgo: 60,
  maxYearsAgo: 300,
  /** Founding pairs, as a fraction of carrying capacity. A hamlet starts as a handful of families. */
  founderFraction: 0.14,
  minFounderPairs: 2,
  maxFounderPairs: 6,
} as const;

/** Below this habitability nobody has ever settled the cell, and `settlementAt` returns null. */
export const MIN_HABITABILITY = 0.2;

/**
 * How much of the liveable ground anyone actually got round to settling (DECISIONS C33).
 *
 * NOT a fact about the ground — {@link MIN_HABITABILITY} and `geo.habitability` are that. This is a
 * fact about the world's HISTORY: people are not spread as thinly as the land allows, they are
 * spread as thinly as three hundred years of them managed. It multiplies the acceptance draw, so it
 * thins the planet uniformly and leaves the shape intact: better ground is still likelier to hold a
 * village, there are just fewer villages.
 *
 * MEASURED, and this constant exists because the first measurement was wrong for the design.
 * At 1.0 the planet came out at 33.8% of cells settled — 96,088 settlements, 2,548,273 people, a
 * village every ~2.2 km, about a 22-minute walk. SOCIETY-PLAN §5 says this direction "does not go
 * breadth-first" and that "a planet of shallow people reads as fake faster than an empty one", and
 * one cell in three is not that world. At 0.3 it is roughly one in ten: a village every ~4.1 km,
 * about a 41-minute walk at the parcel's 1.65 m/s, with real ground in between.
 *
 * Re-measure with `npm run census:planet -w @echo/planet` after touching it, and put the number in
 * C33 rather than in a commit message. Free to move: C25 means zero rows, so the whole planet
 * re-derives from the seed the moment it changes.
 */
export const SETTLEMENT_RATE = 0.3;

/** The largest a settlement gets on the best ground on the planet. */
export const CAPACITY_MAX = 140;

/** The smallest a settlement that exists at all can be. Below this it is not a place, it is a farm. */
export const CAPACITY_MIN = 8;

/**
 * A hard stop on people-ever-born, so a bad dial cannot make a settlement cost a second of CPU.
 *
 * NOT A SILENT CAP. When it fires, {@link Settlement}`.truncated` is true and the caller can say so.
 * A cap nobody is told about reads as "we generated everything" when it did not.
 */
export const MAX_PEOPLE = 4000;

/** A death within this many years is still talked about. What an NPC brings up unprompted. */
export const LIVING_MEMORY_YEARS = 25;

// ── what a settlement is made of ────────────────────────────────────────────────

/**
 * The six numbers a cell's geography reduces to, each in `0..1`.
 *
 * SOC-6.B derives these from what `packages/planet` already knows about an H3 cell — biome, land
 * fraction, elevation, coastline, and distance along the referral adjacency that already exists in
 * `referral.ts`. This module only consumes them, which is what makes it testable today against a
 * geography written by hand.
 */
export interface SettlementGeography {
  /** Can people live here at all, and how well. Drives whether a settlement exists and how big. */
  habitability: number;
  /** Ground that grows food. Farmers, and the size a settlement can reach. */
  arable: number;
  /** Reachable open water. Fishers, and boats. */
  coastal: number;
  /** Standing timber. Foresters, carpenters, charcoal. */
  wooded: number;
  /** Rock and metal. Miners, smiths, stonecutters. */
  mountain: number;
  /** How well the rest of the planet can get here. Traders, carters, inns — and wealth, later. */
  tradeAccess: number;
}

/** What a person does. A description, never a rank — Design Law 1 holds in this file too. */
export type Occupation =
  | "farmer" | "fisher" | "herder" | "forester" | "miner" | "stonecutter"
  | "smith" | "potter" | "weaver" | "carpenter" | "healer" | "teacher"
  | "trader" | "carter" | "innkeeper" | "labourer";

export const OCCUPATIONS: readonly Occupation[] = [
  "farmer", "fisher", "herder", "forester", "miner", "stonecutter",
  "smith", "potter", "weaver", "carpenter", "healer", "teacher",
  "trader", "carter", "innkeeper", "labourer",
] as const;

/**
 * One person. Every field here is IMMUTABLE (C26) and is a function of the seed.
 *
 * `index` is the person's identity inside the settlement and is stable for a given `(seed, cell)`
 * because generation order is deterministic; `id` is the identity across the planet and is what a
 * delta row keys on. Neither is a display name: two people in a village are called Mira.
 */
export interface Person {
  id: string;
  index: number;
  given: string;
  family: string;
  /** Used for pairing and childbearing, and for nothing else in this module. */
  sex: "f" | "m";
  /** World day of birth. Negative before the world's epoch, which most of a lineage is. */
  birthDay: number;
  lifespanDays: number;
  /** `birthDay + lifespanDays`. Stored so no caller has to remember which way the arithmetic goes. */
  deathDay: number;
  /** `[mother, father]` as indices, or null for a founder or an incomer. */
  parents: readonly [number, number] | null;
  children: number[];
  partner: number | null;
  /** The day the pairing was made. Null while unpaired. */
  partnerDay: number | null;
  household: number;
  occupation: Occupation;
  /** True for someone born elsewhere who married in. Their family name is new to this settlement. */
  incomer: boolean;
  /** True for the pairs the settlement was founded by. Their parents are outside the bounded history. */
  founder: boolean;
  /**
   * The household this person grew up in, or -1 for a founder and an incomer, who grew up elsewhere.
   *
   * Distinct from {@link household}, which is where they ended: a child who pairs moves out, and a
   * house stands as long as someone is still in it.
   */
  bornInto: number;
  /** Years to pairing age, drawn AT BIRTH like the lifespan, so nothing about it moves later. */
  pairAgeDays: number;
  /**
   * The stream this person was drawn from.
   *
   * Carried so that everything downstream of a person — their pairing, the stranger who married
   * them — keys on WHO THEY ARE rather than on where they landed in an array. See {@link stream}.
   */
  seedKey: string;
}

/** A household is a pairing and the children it raises, from the day it forms until it empties. */
export interface Household {
  index: number;
  /** The two who founded it. A household outlives them only while their children are still in it. */
  partners: readonly [number, number];
  family: string;
  foundedDay: number;
  /** The day the last member died or left. `Infinity` while it still stands. */
  dissolvedDay: number;
}

export interface Settlement {
  seed: string;
  cell: string;
  name: string;
  /** Which naming culture the place and its people are named in. Two valleys do not sound alike. */
  culture: string;
  geography: SettlementGeography;
  /** World day the first households were raised. Always negative: history is bounded and past. */
  foundedDay: number;
  capacity: number;
  /**
   * Everyone ever born or married in, in generation order. Includes the long dead — they are the
   * graves — AND people not yet born on the day you asked about.
   *
   * The unborn are here on purpose. A pair's children are all drawn on the day the pair forms, so
   * some of them have birth days in the future; truncating the list at the horizon would make
   * {@link Person.index} and {@link Person.id} depend on WHEN you asked, which is the one thing a
   * shared world cannot survive. Use {@link census} to get who is actually alive, or {@link alive}
   * per person. Never treat `people.length` as a population.
   */
  people: Person[];
  households: Household[];
  /** The horizon this was generated to. Facts about days after it are not in here. */
  throughDay: number;
  /** True if {@link MAX_PEOPLE} stopped the expansion early. Say so out loud when it is set. */
  truncated: boolean;
}

// ── a deterministic stream ──────────────────────────────────────────────────────

/**
 * A reproducible sequence of numbers in `[0, 1)` from a string key.
 *
 * Built on {@link hashString}, which is the generator the rest of the package already orders its
 * draws with. The KEY IS SEMANTIC, never an array position: a child's stream is keyed on its
 * parents and its birth order, a founder's on which founder it is. That is deliberate. An
 * index-keyed stream means inserting one person early in the generation re-rolls every person after
 * them, and the day someone adds a rule that creates one extra incomer, every lifespan on the
 * planet changes and every NPC anybody met becomes a different person.
 */
function stream(key: string): () => number {
  let n = 0;
  return () => hashString(key, n++);
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Approximately normal in `[0, 1)`, mean 0.5, sd ~= 1/6. Three uniforms, the cheap old way. */
const bell = (r: () => number) => (r() + r() + r()) / 3;

/** Pick from a weighted table. Weights need not sum to one; a table that sums to zero picks the last. */
function pick<T>(r: number, table: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of table) total += w;
  let x = r * total;
  for (const [value, w] of table) {
    x -= w;
    if (x < 0) return value;
  }
  return table[table.length - 1][0];
}

// ── names ───────────────────────────────────────────────────────────────────────

/**
 * Four naming cultures, so that two settlements a continent apart do not sound like each other.
 *
 * This is the cheapest differentiation there is and it does more work than any other hundred lines
 * here: a stranger whose name does not sound local is legible as a stranger before they say
 * anything, and a family name that belongs to the next valley is a piece of history nobody had to
 * write down.
 */
const CULTURES = [
  {
    name: "vale",
    onsets: ["b", "br", "d", "f", "g", "h", "k", "l", "m", "n", "r", "s", "t", "th", "v", "w"],
    nuclei: ["a", "e", "i", "o", "u", "ae", "ea", "ei", "ou"],
    codas: ["", "", "l", "n", "r", "s", "th", "ld", "rn", "st"],
    surnames: ["field", "brook", "hollow", "barrow", "ford", "hill", "mere", "wick", "combe", "stead"],
  },
  {
    name: "coast",
    onsets: ["j", "k", "l", "m", "n", "p", "s", "sk", "st", "t", "v", "h", "r"],
    nuclei: ["a", "aa", "e", "i", "o", "oo", "u", "ai", "ei"],
    codas: ["", "", "k", "l", "m", "n", "r", "s", "st", "nd"],
    surnames: ["strand", "haven", "skerry", "salt", "net", "keel", "tide", "gull", "reef", "spar"],
  },
  {
    name: "upland",
    onsets: ["c", "cr", "d", "dr", "g", "gr", "k", "m", "n", "r", "t", "tr", "b", "bl"],
    nuclei: ["a", "e", "i", "o", "u", "ua", "ui", "au"],
    codas: ["", "", "ch", "g", "k", "m", "n", "rn", "rk", "gh"],
    surnames: ["crag", "scree", "tarn", "pike", "fell", "seam", "adit", "slate", "ridge", "cairn"],
  },
  {
    name: "road",
    onsets: ["a", "b", "d", "f", "h", "j", "l", "m", "n", "s", "sh", "t", "y", "z"],
    nuclei: ["a", "e", "i", "o", "u", "ia", "io", "ay"],
    codas: ["", "", "l", "m", "n", "r", "s", "z", "sh", "nt"],
    surnames: ["market", "toll", "waggon", "league", "post", "scale", "tally", "ledger", "gate", "mile"],
  },
] as const;

type Culture = (typeof CULTURES)[number];

function syllable(r: () => number, c: Culture): string {
  const onset = c.onsets[Math.floor(r() * c.onsets.length)];
  const nucleus = c.nuclei[Math.floor(r() * c.nuclei.length)];
  const coda = c.codas[Math.floor(r() * c.codas.length)];
  return onset + nucleus + coda;
}

const capitalise = (s: string) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));

/** A given name: one syllable or two, in the settlement's culture. */
function givenName(r: () => number, c: Culture): string {
  const parts = r() < 0.55 ? 1 : 2;
  let s = "";
  for (let i = 0; i < parts; i++) s += syllable(r, c);
  return capitalise(s);
}

/** A family name: a syllable joined to one of the culture's landscape words. */
function familyName(r: () => number, c: Culture): string {
  const stem = syllable(r, c);
  const tail = c.surnames[Math.floor(r() * c.surnames.length)];
  return capitalise(stem + tail);
}

/** The settlement's own name, in its own culture. */
function placeName(r: () => number, c: Culture): string {
  const stem = syllable(r, c) + (r() < 0.4 ? syllable(r, c) : "");
  const tail = c.surnames[Math.floor(r() * c.surnames.length)];
  return capitalise(stem + tail);
}

// ── occupation ──────────────────────────────────────────────────────────────────

/**
 * The trades a place supports, from its ground.
 *
 * `1e-3` floors exist so that no trade is impossible anywhere: an inland village has one person who
 * fishes the river, and the day the model says otherwise is the day the world reads as a table.
 */
export function occupationWeights(g: SettlementGeography): readonly (readonly [Occupation, number])[] {
  return [
    ["farmer", 0.05 + 1.6 * g.arable],
    ["fisher", 1e-3 + 1.5 * g.coastal],
    ["herder", 0.12 + 0.5 * (1 - g.arable) + 0.3 * g.mountain],
    ["forester", 1e-3 + 0.9 * g.wooded],
    ["miner", 1e-3 + 1.2 * g.mountain],
    ["stonecutter", 0.02 + 0.5 * g.mountain],
    ["smith", 0.1 + 0.3 * g.mountain + 0.2 * g.tradeAccess],
    ["potter", 0.12],
    ["weaver", 0.16],
    ["carpenter", 0.08 + 0.4 * g.wooded],
    ["healer", 0.07],
    ["teacher", 0.04 + 0.2 * g.tradeAccess],
    ["trader", 1e-3 + 1.0 * g.tradeAccess],
    ["carter", 1e-3 + 0.6 * g.tradeAccess],
    ["innkeeper", 1e-3 + 0.4 * g.tradeAccess],
    ["labourer", 0.3],
  ];
}

/** How often a trade passes down a household. Not a rule — a tendency, and the rest is the ground. */
const OCCUPATION_INHERITANCE = 0.42;

// ── generation ──────────────────────────────────────────────────────────────────

interface Ctx {
  key: string;
  culture: Culture;
  geo: SettlementGeography;
  capacity: number;
  people: Person[];
  households: Household[];
  truncated: boolean;
}

function drawLifespanDays(r: () => number): number {
  if (r() < VITALS.childMortality) {
    return Math.max(1, Math.round(yearsToDays(r() * VITALS.childCeilingYears)));
  }
  const years = VITALS.medianYears + (bell(r) - 0.5) * 2 * VITALS.spreadYears;
  return Math.round(yearsToDays(clamp(years, VITALS.minAdultYears, VITALS.maxYears)));
}

const isAlive = (p: Person, day: number): boolean => p.birthDay <= day && p.deathDay > day;

function occupationFor(ctx: Ctx, r: () => number, parents: readonly [number, number] | null): Occupation {
  if (parents !== null && r() < OCCUPATION_INHERITANCE) {
    const from = ctx.people[r() < 0.5 ? parents[0] : parents[1]];
    if (from !== undefined) return from.occupation;
  }
  return pick(r(), occupationWeights(ctx.geo));
}

interface NewPerson {
  key: string;
  birthDay: number;
  parents: readonly [number, number] | null;
  family: string | null;
  sex?: "f" | "m";
  incomer?: boolean;
  founder?: boolean;
  household: number;
  bornInto: number;
}

function addPerson(ctx: Ctx, spec: NewPerson): Person | null {
  if (ctx.people.length >= MAX_PEOPLE) {
    ctx.truncated = true;
    return null;
  }
  const r = stream(spec.key);
  const index = ctx.people.length;
  const person: Person = {
    id: `${ctx.key}#${index}`,
    index,
    given: givenName(r, ctx.culture),
    family: spec.family ?? familyName(r, ctx.culture),
    sex: spec.sex ?? (r() < 0.5 ? "f" : "m"),
    birthDay: spec.birthDay,
    lifespanDays: 0,
    deathDay: 0,
    parents: spec.parents,
    children: [],
    partner: null,
    partnerDay: null,
    household: spec.household,
    occupation: "labourer",
    incomer: spec.incomer ?? false,
    founder: spec.founder ?? false,
    bornInto: spec.bornInto,
    pairAgeDays: 0,
    seedKey: spec.key,
  };
  person.lifespanDays = drawLifespanDays(r);
  person.deathDay = person.birthDay + person.lifespanDays;
  person.pairAgeDays = Math.round(yearsToDays(PAIRING.minAgeYears + r() * PAIRING.ageSpanYears));
  person.occupation = occupationFor(ctx, r, spec.parents);
  ctx.people.push(person);
  return person;
}

/** Everyone alive on a day. O(n), and called once per pairing, which is where the n^2 comes from. */
function populationAt(ctx: Ctx, day: number): number {
  let n = 0;
  for (const p of ctx.people) if (isAlive(p, day)) n++;
  return n;
}

/** Are these two too closely related to pair? Parent, child, sibling and half-sibling all count. */
function tooClose(a: Person, b: Person): boolean {
  if (a.parents !== null && (a.parents[0] === b.index || a.parents[1] === b.index)) return true;
  if (b.parents !== null && (b.parents[0] === a.index || b.parents[1] === a.index)) return true;
  if (a.parents !== null && b.parents !== null) {
    if (a.parents[0] === b.parents[0] || a.parents[1] === b.parents[1]) return true;
    if (a.parents[0] === b.parents[1] || a.parents[1] === b.parents[0]) return true;
  }
  return false;
}

/** The day a person is ready to pair. Drawn at birth (see {@link addPerson}), so it never moves. */
const readyDay = (p: Person): number => p.birthDay + p.pairAgeDays;

function makeHousehold(ctx: Ctx, partners: readonly [number, number], family: string, day: number): number {
  const index = ctx.households.length;
  ctx.households.push({ index, partners, family, foundedDay: day, dissolvedDay: Infinity });
  return index;
}

/**
 * Draw a pair's children, all of them, on the day they pair (C26: pre-drawn, never rolled later).
 *
 * The count is damped by how full the settlement already was ON THE PAIRING DAY, and that day's
 * population depends only on events strictly earlier than it — which is exactly why running the
 * generator to a later horizon cannot change an earlier pairing's children. That is the L2 prefix
 * property, and it is a property of this function rather than of the loop that calls it.
 *
 * THIS FUNCTION DOES NOT KNOW THE HORIZON, AND MUST NOT. It bears every child the pair will ever
 * have, including ones born after the day the caller asked about, and `alive()` filters them out.
 * The first version truncated here and it was wrong in the worst available way: a pair whose last
 * child fell past the horizon emitted fewer people, so every person generated AFTER them shifted
 * down an index, `Person.index` and `Person.id` became functions of when you asked, and a delta row
 * keyed on an id would have attached itself to a different human being. Nobody would have seen it
 * until two players compared notes. The horizon belongs to {@link pairEveryone}, where advancing it
 * only ever APPENDS, and nowhere else.
 */
function bearChildren(
  ctx: Ctx,
  mother: Person,
  father: Person,
  household: number,
  family: string,
  pairDay: number,
): void {
  const r = stream(`${mother.seedKey}+${father.seedKey}/kids`);
  const pressure = clamp(populationAt(ctx, pairDay) / ctx.capacity, 0, 1);
  const rate = FERTILITY.baseRate * clamp(1 - pressure, FERTILITY.pressureFloor, 1);

  let day = pairDay + Math.round(yearsToDays(FERTILITY.firstBirthMinYears + r() * FERTILITY.firstBirthSpanYears));
  for (let i = 0; i < FERTILITY.maxChildren; i++) {
    if (r() >= rate) {
      day += Math.round(yearsToDays(FERTILITY.spacingMinYears + r() * FERTILITY.spacingSpanYears));
      continue;
    }
    if (!isAlive(mother, day) || !isAlive(father, day)) break;
    if (daysToYears(day - mother.birthDay) > FERTILITY.maxMotherAgeYears) break;

    const child = addPerson(ctx, {
      key: `${mother.seedKey}+${father.seedKey}/kid/${i}`,
      birthDay: day,
      parents: [mother.index, father.index] as const,
      family,
      household,
      bornInto: household,
    });
    if (child === null) return;
    mother.children.push(child.index);
    father.children.push(child.index);

    day += Math.round(yearsToDays(FERTILITY.spacingMinYears + r() * FERTILITY.spacingSpanYears));
  }
}

/**
 * Pair everyone who reaches pairing age before the horizon, in chronological order.
 *
 * Chronological order is what makes this deterministic AND resumable: a pairing only ever reads the
 * settlement as it stood strictly before its own day, so the same pairing on the same day sees the
 * same village whether the horizon is next year or next century.
 */
function pairEveryone(ctx: Ctx, throughDay: number): void {
  const settled = new Set<number>();

  for (;;) {
    // The earliest unsettled person whose day has come. A linear scan, because the people list
    // grows while we walk it and a heap that is rebuilt on every insert is not faster at this size.
    let next: Person | null = null;
    let nextDay = Infinity;
    for (const p of ctx.people) {
      if (settled.has(p.index) || p.partner !== null) continue;
      const day = readyDay(p);
      if (day > throughDay) continue;
      if (day < nextDay) {
        next = p;
        nextDay = day;
      }
    }
    if (next === null) break;
    settled.add(next.index);

    // Died before ever pairing. Common, and it is where the child graves come from.
    if (!isAlive(next, nextDay)) continue;

    const r = stream(`${next.seedKey}/pair`);
    let match: Person | null = null;
    for (const other of ctx.people) {
      if (other.index === next.index) continue;
      if (other.partner !== null || other.sex === next.sex) continue;
      if (!isAlive(other, nextDay)) continue;
      if (readyDay(other) > nextDay) continue;
      if (tooClose(next, other)) continue;
      if (Math.abs(daysToYears(other.birthDay - next.birthDay)) > PAIRING.maxAgeGapYears) continue;
      // The closest in age wins, so a village pairs within a generation rather than across four.
      if (match === null || Math.abs(other.birthDay - next.birthDay) < Math.abs(match.birthDay - next.birthDay)) {
        match = other;
      }
    }

    let partner = match;
    if (partner === null) {
      if (r() >= PAIRING.incomerChance) continue; // Stays single. Some people do.
      // THE AGE DRAWN IS THE AGE ON THE DAY THEY ARRIVE, not an offset from their partner's birth.
      // The offset form put a stranger's birthday within +-7 years of a 19-year-old's, which is a
      // twelve-year-old at their own wedding, and then the "already dead on arrival" repair below
      // gave them a thirteen-year lifespan and a grave in the wrong half of the mortality model.
      const arrivesAt = PAIRING.minAgeYears + r() * PAIRING.ageSpanYears;
      const born = nextDay - Math.round(yearsToDays(arrivesAt));
      partner = addPerson(ctx, {
        key: `${next.seedKey}/incomer`,
        birthDay: born,
        parents: null,
        family: null,
        sex: next.sex === "f" ? "m" : "f",
        incomer: true,
        household: -1,
        bornInto: -1,
      });
      if (partner === null) return;
      settled.add(partner.index);
      // An incomer whose lifespan was drawn short enough to have ended before they got here is
      // redrawn as someone who lives to arrive — the alternative is a wedding attended by a corpse.
      // They are given a life AFTER arriving rather than one more year, so the repair cannot smuggle
      // a fourteen-year-old adult into a mortality model that has exactly two draws in it.
      if (!isAlive(partner, nextDay)) {
        const arrived = nextDay - partner.birthDay;
        const rest = Math.round(yearsToDays(2 + r() * 45));
        partner.lifespanDays = Math.min(arrived + rest, Math.round(yearsToDays(VITALS.maxYears)));
        partner.deathDay = partner.birthDay + partner.lifespanDays;
      }
    }

    const family = next.incomer && !partner.incomer ? partner.family : next.family;
    const household = makeHousehold(ctx, [next.index, partner.index] as const, family, nextDay);
    next.partner = partner.index;
    next.partnerDay = nextDay;
    partner.partner = next.index;
    partner.partnerDay = nextDay;
    next.household = household;
    partner.household = household;

    const mother = next.sex === "f" ? next : partner;
    const father = next.sex === "f" ? partner : next;
    bearChildren(ctx, mother, father, household, family, nextDay);
  }
}

/**
 * A household stands until the last person in it is gone.
 *
 * Two ways to leave and they are not the same day: the partners leave by dying, and a child leaves
 * by pairing and founding their own — or, if they never pair, also by dying. So the house a person
 * grew up in can outlast both their parents, which is exactly the unmarried daughter still living in
 * the family house, and it is the shape a schedule and a dwelling want later.
 */
function closeHouseholds(ctx: Ctx): void {
  const lastOut = new Map<number, number>();
  const bump = (house: number, day: number) => {
    if (house < 0) return;
    const prev = lastOut.get(house);
    if (prev === undefined || day > prev) lastOut.set(house, day);
  };

  for (const h of ctx.households) {
    bump(h.index, ctx.people[h.partners[0]].deathDay);
    bump(h.index, ctx.people[h.partners[1]].deathDay);
  }
  for (const p of ctx.people) {
    if (p.bornInto < 0) continue;
    bump(p.bornInto, p.partnerDay ?? p.deathDay);
  }

  for (const h of ctx.households) {
    const end = lastOut.get(h.index);
    h.dissolvedDay = end === undefined ? h.foundedDay : end;
  }
}

// ── the entry point ─────────────────────────────────────────────────────────────

/**
 * The settlement on `cell`, generated to `throughDay`, or null if nobody ever settled there.
 *
 * `throughDay` is a WORLD DAY from {@link worldDayIndex}, and the result is monotone in it: calling
 * with a later day returns the same people with the same births, plus the ones born since.
 */
export function settlementAt(
  seed: string,
  cell: string,
  geo: SettlementGeography,
  throughDay: number,
): Settlement | null {
  if (geo.habitability < MIN_HABITABILITY) return null;

  const key = `${seed}/${cell}`;
  const rs = stream(`${key}/settlement`);

  // A habitable cell is not an inhabited one. Most ground has nobody on it, and that is the honest
  // shape of a planet: an empty valley is a fact about the world, not a gap in the generator.
  // SETTLEMENT_RATE is the second half of that sentence — how much of the liveable ground anyone
  // ever got round to. See its own note; it is a history dial, not a geography one.
  if (rs() > geo.habitability * SETTLEMENT_RATE) return null;

  const culture = CULTURES[Math.floor(rs() * CULTURES.length)];
  const capacity = clamp(
    Math.round(CAPACITY_MAX * geo.habitability * (0.45 + 0.55 * geo.arable) * (0.55 + 0.45 * geo.tradeAccess)),
    CAPACITY_MIN,
    CAPACITY_MAX,
  );
  const foundedDay = -Math.round(
    yearsToDays(FOUNDING.minYearsAgo + rs() * (FOUNDING.maxYearsAgo - FOUNDING.minYearsAgo)),
  );

  const ctx: Ctx = { key, culture, geo, capacity, people: [], households: [], truncated: false };

  const founderPairs = clamp(
    Math.round(capacity * FOUNDING.founderFraction),
    FOUNDING.minFounderPairs,
    FOUNDING.maxFounderPairs,
  );

  // TWO PASSES, AND THE ORDER MATTERS. Every founding household is raised before any of them has a
  // child, because `bearChildren` damps fertility by the population ON THE PAIRING DAY — and if the
  // pairs were built one at a time, the first founder would be having children in an empty valley
  // and the last in a full one, purely because of the order a loop happened to run in.
  const founded: { a: Person; b: Person; household: number; family: string }[] = [];
  for (let i = 0; i < founderPairs; i++) {
    const rf = stream(`${key}/founder/${i}`);
    const family = familyName(rf, culture);
    const ageA = 20 + rf() * 10;
    const ageB = Math.max(PAIRING.minAgeYears, ageA + (rf() - 0.5) * 8);
    const household = ctx.households.length;
    const a = addPerson(ctx, {
      key: `${key}/founder/${i}/a`,
      birthDay: foundedDay - Math.round(yearsToDays(ageA)),
      parents: null,
      family,
      sex: "f",
      founder: true,
      household,
      bornInto: -1,
    });
    const b = addPerson(ctx, {
      key: `${key}/founder/${i}/b`,
      birthDay: foundedDay - Math.round(yearsToDays(ageB)),
      parents: null,
      family,
      sex: "m",
      founder: true,
      household,
      bornInto: -1,
    });
    if (a === null || b === null) break;
    makeHousehold(ctx, [a.index, b.index] as const, family, foundedDay);
    a.partner = b.index;
    b.partner = a.index;
    a.partnerDay = foundedDay;
    b.partnerDay = foundedDay;
    // A founder's lifespan may have been drawn short enough to have ended before the founding day.
    // They founded the place, so they were alive on the day they did it.
    for (const p of [a, b]) {
      if (p.deathDay <= foundedDay) {
        const settled = foundedDay - p.birthDay;
        p.lifespanDays = Math.min(settled + Math.round(yearsToDays(1 + rf() * 40)), Math.round(yearsToDays(VITALS.maxYears)));
        p.deathDay = p.birthDay + p.lifespanDays;
      }
    }
    founded.push({ a, b, household, family });
  }
  for (const f of founded) bearChildren(ctx, f.a, f.b, f.household, f.family, foundedDay);

  pairEveryone(ctx, throughDay);
  closeHouseholds(ctx);

  const rn = stream(`${key}/name`);
  return {
    seed,
    cell,
    name: placeName(rn, culture),
    culture: culture.name,
    geography: geo,
    foundedDay,
    capacity,
    people: ctx.people,
    households: ctx.households,
    throughDay,
    truncated: ctx.truncated,
  };
}

// ── reading a settlement ────────────────────────────────────────────────────────

/** Is this person alive on this world day? The whole mortality model (C26). */
export function alive(p: Person, day: number): boolean {
  return isAlive(p, day);
}

/** Age in world years on a day. Negative before birth, and kept negative rather than clamped. */
export function ageYears(p: Person, day: number): number {
  return daysToYears(day - p.birthDay);
}

export interface Census {
  day: number;
  /** Everyone alive, in birth order. This is who a player can meet. */
  alive: Person[];
  population: number;
  /** Households with at least one living member. */
  households: Household[];
  /** Everyone already dead. The graves, and what SOC-6.H has to make visible in a first session. */
  dead: Person[];
  /** Deaths inside {@link LIVING_MEMORY_YEARS}. What people still bring up unprompted. */
  recentlyDead: Person[];
  medianAgeYears: number;
  eldest: Person | null;
  /** Living people with no living parent. */
  orphans: Person[];
  /** Living people whose partner is dead. */
  widowed: Person[];
}

/** Who is alive on a day, and the handful of facts a conversation would open with. */
export function census(s: Settlement, day: number): Census {
  const living: Person[] = [];
  const dead: Person[] = [];
  for (const p of s.people) {
    if (isAlive(p, day)) living.push(p);
    else if (p.deathDay <= day) dead.push(p);
  }

  const ages = living.map((p) => ageYears(p, day)).sort((a, b) => a - b);
  const median = ages.length === 0 ? 0 : ages.length % 2 === 1
    ? ages[(ages.length - 1) / 2]
    : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2;

  const memory = day - yearsToDays(LIVING_MEMORY_YEARS);
  const liveIndex = new Set(living.map((p) => p.index));

  return {
    day,
    alive: living,
    population: living.length,
    households: s.households.filter((h) => h.foundedDay <= day && h.dissolvedDay > day),
    dead,
    recentlyDead: dead.filter((p) => p.deathDay > memory),
    medianAgeYears: median,
    eldest: living.reduce<Person | null>((best, p) => (best === null || p.birthDay < best.birthDay ? p : best), null),
    orphans: living.filter((p) => p.parents !== null && !p.parents.some((i) => liveIndex.has(i))),
    widowed: living.filter((p) => p.partner !== null && !liveIndex.has(p.partner)),
  };
}

/** How two people in a settlement are related. What "everyone knows the others" is made of. */
export type Relation =
  | "self" | "partner" | "parent" | "child" | "sibling"
  | "grandparent" | "grandchild" | "aunt-uncle" | "niece-nephew" | "cousin"
  | "in-law" | "none";

/**
 * The relation of `a` to `b`, read from `a`'s side: `relation(x, y) === "parent"` means x is y's
 * parent. Blood first, then marriage, then nothing — and "nothing" is most pairs in a village,
 * which is the point of asking.
 *
 * THE IN-LAW CHECK DOES NOT RECURSE. It asks {@link bloodRelation}, never itself: "a is related to
 * b's partner" answered by re-entering this function walks straight back into a's own partner and
 * never returns. Marriage is one hop and exactly one hop.
 */
export function relation(s: Settlement, a: Person, b: Person): Relation {
  if (a.index === b.index) return "self";
  if (a.partner === b.index) return "partner";

  const blood = bloodRelation(s, a, b);
  if (blood !== "none") return blood;

  if (a.partner !== null && bloodRelation(s, s.people[a.partner], b) !== "none") return "in-law";
  if (b.partner !== null && bloodRelation(s, a, s.people[b.partner]) !== "none") return "in-law";
  if (a.partner !== null && b.partner !== null && bloodRelation(s, s.people[a.partner], s.people[b.partner]) !== "none") {
    return "in-law";
  }
  return "none";
}

/** Blood only: no partner, no in-law, no self. The half of {@link relation} that can be recursive. */
export function bloodRelation(s: Settlement, a: Person, b: Person): Relation {
  if (a.index === b.index) return "none";

  const parentsOf = (p: Person): number[] => (p.parents === null ? [] : [p.parents[0], p.parents[1]]);
  const aP = parentsOf(a);
  const bP = parentsOf(b);

  if (bP.includes(a.index)) return "parent";
  if (aP.includes(b.index)) return "child";
  if (aP.length > 0 && bP.length > 0 && aP.some((i) => bP.includes(i))) return "sibling";

  const grandOf = (p: Person): number[] => parentsOf(p).flatMap((i) => parentsOf(s.people[i]));
  if (grandOf(b).includes(a.index)) return "grandparent";
  if (grandOf(a).includes(b.index)) return "grandchild";

  const siblingIndices = (p: Person): number[] => {
    const pp = parentsOf(p);
    if (pp.length === 0) return [];
    const out: number[] = [];
    for (const q of s.people) {
      if (q.index === p.index || q.parents === null) continue;
      if (q.parents[0] === pp[0] || q.parents[1] === pp[1] || q.parents[0] === pp[1] || q.parents[1] === pp[0]) {
        out.push(q.index);
      }
    }
    return out;
  };

  if (siblingIndices(a).some((i) => bP.includes(i))) return "aunt-uncle";
  if (siblingIndices(b).some((i) => aP.includes(i))) return "niece-nephew";
  for (const i of aP) {
    if (siblingIndices(s.people[i]).some((j) => bP.includes(j))) return "cousin";
  }
  return "none";
}
