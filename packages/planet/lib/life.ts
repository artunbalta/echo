/**
 * Life events (DECISIONS C40, `docs/world-design/life-events.md`): the past a person lived through
 * before anyone arrived, as dated, shared, checkable facts. Read off `society.ts`, never written
 * back to it.
 *
 * WHY THIS EXISTS. `society.ts` already holds most of a life — the sibling who died at four, the
 * stranger you married, the day your partner died — but as FIELDS, not as things that happened to
 * someone, and nothing at all that happened to a village as a whole. The LLM at the point of contact
 * (step 2) narrates what is here and invents nothing: every name and every year it may use is in
 * this module's output, so a memory that cites something else can be rejected mechanically.
 *
 * INERT AGAINST THE SUBSTRATE (C40 decision 1). Nothing here changes a birth, a death or a pairing.
 * Events EXPLAIN demographic facts rather than causing them: a storm year is read off the fishers
 * who were lost at sea, never rolled first and then made to kill anyone. So C33's census stands,
 * and so does every person anybody has met.
 *
 * L2, EXTENDED. The events of a settlement generated to day N are exactly the events of the same
 * settlement generated to any later day, filtered to day N. Every event is computed from facts that
 * are settled ON OR BEFORE ITS OWN DAY, and only then filtered by the horizon. The horizon is never
 * an input to a computation here, which is the `bearChildren` lesson (`society.ts:564-571`) applied
 * to a second module before it had the chance to be learned twice.
 *
 * ALIVE IS NOT HERE. `alive()` says nothing about where someone was. An incomer is alive for twenty
 * years before they marry in; a founder before the village exists. {@link present} is the predicate
 * this module asks, and `census()` on a past day does not ask it (the known-gaps entry for that is
 * the one this module was built beside).
 *
 * STREAM KEYS ARE `Person.id`. Since C43 the id IS the semantic key — {@link uidOf} of the person's
 * lineage — so it is as stable as `seedKey` and sixteen characters long. (Before C43 the id was an
 * index and the key doubled per generation, and this note explained which of two bad choices was
 * less bad.)
 *
 * Pure, in `society.ts`'s idiom: no clock, no I/O, no cache. It reads a `Settlement`, never mutates
 * it, and returns fresh arrays. The caller memoises per `(settlement, horizon)`.
 */

import { DAYS_PER_YEAR, yearsToDays } from "./worldclock.js";
import {
  VITALS,
  ageYears,
  alive,
  hash01,
  stream,
  type Occupation,
  type Person,
  type Settlement,
} from "./society.js";

// ── the dials ───────────────────────────────────────────────────────────────────

/** When a child is taught a trade, and who counts as old enough to teach one. */
export const TRADE = {
  minAgeYears: 12,
  spanYears: 3,
  teacherMinAgeYears: 25,
  teacherMaxAgeYears: 60,
} as const;

/**
 * Close friends, made in two windows: as children (village-born, within three years, decided at the
 * younger's eighth year) and as adults (anyone here, within ten years, decided when the younger is
 * twenty or the later of them arrives — likelier between two people who work the same trade).
 *
 * WHY TWO, AND WHY NORMALISED BY HEADCOUNT: measured, twice. The first draft had childhood only, at
 * a fixed chance, and 82–95% of living adults came out with no friend at all: a child in a settlement
 * of capacity 30–59 has 1.39 eligible peers on average. The second normalised by CAPACITY, and the
 * coast came out at median 0 anyway, because villages sit far below capacity — a coastal capacity of
 * 38 holds 11.2 people today. So the chance is divided by the village's HEADCOUNT at the start of the
 * year the friendship forms, which is how many people a child could actually have met, and each
 * window yields about `expected` friends whatever the size of the place.
 *
 * That headcount is L2-safe for the same reason `bearChildren`'s damping is: everyone present on a
 * day was settled by that day. A person's own PEER count is not — it depends on children not yet
 * born at an earlier horizon — so a friendship decided against it would flip as the horizon advanced.
 *
 * The TARGET is that the median village-born adult over thirty has one or two close friends. It is
 * pinned by a test, per geography. Incomers have fewer, having no childhood here; that is the
 * stranger's life, and it is left in.
 *
 * `peersPerHead` and `expected` are a CALIBRATION, not measured rates, and `peersPerHead` is named
 * for what it divides by. The values first derived from the capacity measurements (0.09 and 0.4)
 * produced about half the target, so they were halved. Then allowing a couple who married LATER to
 * have been friends first (see `wedBy`) pushed the largest valley's median to 3, so `expected` came
 * down from 0.7/1.3 to 0.5/0.9. Measured 2026-10-17 over five grounds, 40 villages each: the median
 * village-born adult over thirty has 1–2 close friends on every one, and 15–35% have none. Bigger
 * villages give somewhat more (mean 1.87 against 1.14), which is left in. Re-measure after touching
 * any of the four.
 */
export const FRIENDSHIP = {
  child: { maxGapYears: 3, formAgeYears: 8, expected: 0.5, peersPerHead: 0.045 },
  adult: { maxGapYears: 10, formAgeYears: 20, expected: 0.9, peersPerHead: 0.2 },
  /** Two people who work the same trade are this many times likelier to be close. */
  sameTradeWeight: 2.5,
  /** 12.5% of adult peers share a trade (measured), so this is the mean weight over all peers. */
  meanTradeWeight: 0.875 + 0.125 * 2.5,
  maxChance: 0.9,
} as const;

/**
 * The estate. When the last founding partner of a household dies with two or more grown children,
 * the two eldest may fall out over what is left; some make peace years later, and some never do.
 * This is the situation catalogue row F13 (inheritance) needs, and nothing more.
 */
export const ESTATE = {
  adultYears: 19,
  riftChance: 0.15,
  reconcileChance: 0.55,
  reconcileMinYears: 2,
  reconcileSpanYears: 18,
} as const;

/** Under this age at death a trade's hazard can be the cause. Over 70 it is old age. */
const HAZARD_BEFORE_YEARS = 50;
const OLD_AGE_YEARS = 70;

/**
 * What can kill someone, and never a ranking of anything.
 *
 * NO "childbirth", and that was measured out rather than left out: the rule (a mother dying within
 * 30 days of a birth) fired 0 times in 9,374 deaths. Under C40 decision 1 death days are drawn at
 * birth, independently of anyone's children, so the coincidence it needs essentially never happens.
 * A cause that can never be the answer is dead code that a narrator would still be told about. It
 * comes back when events are allowed to feed back into demography, and not before.
 */
export type DeathCause =
  | "childhood-illness" | "illness" | "old-age"
  | "sea" | "collapse" | "quarry" | "falling-tree" | "road";

/**
 * The trades that can kill the people who work them, and how often an early adult death in that
 * trade was the trade. Everyone else who dies young dies of illness. The death DAY was drawn at birth
 * by `society.ts`; this only says what it was.
 */
export const HAZARDS: Partial<Record<Occupation, readonly [DeathCause, number]>> = {
  fisher: ["sea", 0.6],
  miner: ["collapse", 0.5],
  stonecutter: ["quarry", 0.3],
  forester: ["falling-tree", 0.3],
  carter: ["road", 0.3],
};

/**
 * The village chronicle. Two kinds are INFERRED from deaths, so they agree with the graves by
 * construction; two are DRAWN and carry no deaths at all in v1 (C40 decision 1).
 */
export const CHRONICLE = {
  /**
   * Child deaths in one world year that make it the fever year. Measured at 3 first: 11 such years
   * in 376 sample villages, so the kind effectively never happened. At 2 it is 216, about one fever
   * year in every second village's history, which is what a fever year should be: remembered.
   */
  feverChildDeaths: 2,
  /** Deaths at sea in one world year that make it a storm year. */
  stormSeaDeaths: 1,
  /** Below this, a death at sea is a drowning in a river, not a storm. */
  stormMinCoastal: 0.3,
  /** Old enough to remember it. */
  witnessMinAgeYears: 5,
  hungryBase: 0.03,
  /** Poor ground is hungry more often. */
  hungryPoorLand: 0.03,
  fireBase: 0.01,
  fireWooded: 0.02,
} as const;

// ── what this module returns ────────────────────────────────────────────────────

export type LifeEventKind =
  | "born" | "arrived" | "learned-trade" | "taught" | "befriended" | "married"
  | "child-born" | "sibling-born" | "grandchild-born" | "left-home"
  | "parent-died" | "sibling-died" | "child-died" | "friend-died" | "widowed"
  | "rift" | "reconciled" | "died";

/** Same-day events sort in the order they happen in a life: you are born before anything else. */
const KIND_ORDER: readonly LifeEventKind[] = [
  "born", "arrived", "learned-trade", "taught", "befriended", "left-home", "married",
  "child-born", "sibling-born", "grandchild-born", "rift", "reconciled",
  "parent-died", "sibling-died", "child-died", "friend-died", "widowed", "died",
];

export interface LifeEvent {
  /** `${subject id}/${kind}` or `${subject id}/${kind}/${other id}`. Unique, stable, never an index. */
  key: string;
  day: number;
  kind: LifeEventKind;
  /** `Person.id` of the person whose life this is. */
  subject: string;
  /** `Person.id`s of everyone else in it. */
  with: readonly string[];
  /** A trade, a {@link DeathCause}, or where someone came from. Null when the kind says it all. */
  detail: string | null;
}

export type VillageEventKind = "fever" | "storm" | "hungry-year" | "fire";

export interface VillageEvent {
  /** `${seed}/${cell}/year/${year}/${kind}`. */
  key: string;
  /** World year: `floor(day / DAYS_PER_YEAR)`. */
  year: number;
  kind: VillageEventKind;
  /** Present, alive and at least {@link CHRONICLE}.witnessMinAgeYears old at mid-year. */
  witnesses: readonly string[];
  /** For the inferred kinds, the deaths the event is. Empty for the drawn ones. */
  dead: readonly string[];
}

// ── presence ────────────────────────────────────────────────────────────────────

/**
 * Was this person IN THE VILLAGE on this day — alive, and arrived?
 *
 * Nobody in the substrate leaves, so arriving is the whole of it: an incomer arrives on the day they
 * pair (`society.ts:662-673`), a founder on the founding day, and everyone else is here from birth.
 */
export function present(s: Settlement, p: Person, day: number): boolean {
  if (!alive(p, day)) return false;
  if (p.founder) return s.foundedDay <= day;
  if (p.incomer) return p.partnerDay !== null && p.partnerDay <= day;
  return true;
}

const yearOf = (day: number): number => Math.floor(day / DAYS_PER_YEAR);
const yearStart = (year: number): number => year * DAYS_PER_YEAR;
const midYear = (year: number): number => yearStart(year) + Math.floor(DAYS_PER_YEAR / 2);
/** The last world year whose final day is on or before the horizon. */
const lastCompleteYear = (s: Settlement): number => yearOf(s.throughDay + 1) - 1;

const byBirth = (a: Person, b: Person): number => a.birthDay - b.birthDay || a.index - b.index;

// ── death ───────────────────────────────────────────────────────────────────────

/**
 * What someone died of. A function of their own life only — their age and their trade — and NOT of
 * the chronicle.
 *
 * That direction is load-bearing. The first draft of this design had causes read the chronicle (a
 * fisher who died in a storm year died in the storm). But a chronicle year is only settled when it
 * ends, and a death earlier in the same year is already a fact, so its cause would have changed the
 * day the year closed: an L2 violation in a field nobody would think to diff. The chronicle reads the
 * causes instead, and a storm year is simply a year somebody was lost at sea.
 */
export function causeOfDeath(p: Person): DeathCause {
  const age = ageYears(p, p.deathDay);
  if (age < VITALS.childCeilingYears) return "childhood-illness";
  if (age < HAZARD_BEFORE_YEARS) {
    const hazard = HAZARDS[p.occupation];
    if (hazard !== undefined && stream(`${p.id}/death`)() < hazard[1]) return hazard[0];
    return "illness";
  }
  return age < OLD_AGE_YEARS ? "illness" : "old-age";
}

// ── the chronicle ───────────────────────────────────────────────────────────────

/**
 * What happened to the village as a whole, one completed world year at a time, from its founding to
 * the horizon. A year still in progress is not here yet: its fever is not a fever until the year is
 * over and the count is known.
 */
export function chronicle(s: Settlement): VillageEvent[] {
  const first = yearOf(s.foundedDay);
  const last = lastCompleteYear(s);

  const childDeaths = new Map<number, Person[]>();
  const seaDeaths = new Map<number, Person[]>();
  const push = (m: Map<number, Person[]>, year: number, p: Person) => {
    const list = m.get(year);
    if (list === undefined) m.set(year, [p]);
    else list.push(p);
  };
  for (const p of s.people) {
    const year = yearOf(p.deathDay);
    if (year < first || year > last) continue;
    // Died HERE: present the day before. Everyone who dies in the village was.
    if (!present(s, p, p.deathDay - 1)) continue;
    const cause = causeOfDeath(p);
    if (cause === "childhood-illness") push(childDeaths, year, p);
    else if (cause === "sea") push(seaDeaths, year, p);
  }

  const out: VillageEvent[] = [];
  const record = (year: number, kind: VillageEventKind, dead: readonly Person[]) => {
    const mid = midYear(year);
    const gone = new Set(dead.map((p) => p.index));
    const witnesses: string[] = [];
    for (const p of s.people) {
      if (gone.has(p.index)) continue;
      if (present(s, p, mid) && ageYears(p, mid) >= CHRONICLE.witnessMinAgeYears) witnesses.push(p.id);
    }
    out.push({
      key: `${s.seed}/${s.cell}/year/${year}/${kind}`,
      year,
      kind,
      witnesses,
      dead: [...dead].sort(byBirth).map((p) => p.id),
    });
  };

  const g = s.geography;
  const pHungry = CHRONICLE.hungryBase + CHRONICLE.hungryPoorLand * (1 - g.arable);
  const pFire = CHRONICLE.fireBase + CHRONICLE.fireWooded * g.wooded;

  for (let year = first; year <= last; year++) {
    const kids = childDeaths.get(year) ?? [];
    if (kids.length >= CHRONICLE.feverChildDeaths) record(year, "fever", kids);

    const lost = seaDeaths.get(year) ?? [];
    if (g.coastal > CHRONICLE.stormMinCoastal && lost.length >= CHRONICLE.stormSeaDeaths) record(year, "storm", lost);

    // Keyed on the year, never on who was alive in it, so no person can re-roll a village's weather.
    const u = stream(`${s.seed}/${s.cell}/year/${year}`)();
    if (u < pHungry) record(year, "hungry-year", []);
    else if (u < pHungry + pFire) record(year, "fire", []);
  }
  return out;
}

// ── lives ───────────────────────────────────────────────────────────────────────

/**
 * Every life in the settlement, to its horizon, keyed by `Person.id`.
 *
 * WHOLE-SETTLEMENT ON PURPOSE. A teacher's life holds the apprentices who chose them, and a friendship
 * is one decision with two sides, so a life cannot be computed alone without recomputing everyone
 * else's choices. One pass here is O(n log n) plus the windows below; one pass per person would be
 * O(n^2) for the same answer. Use {@link lifeOf} for one person and pay that price knowingly.
 *
 * Only people born on or before the horizon have an entry, and an incomer only exists in the
 * substrate once they have arrived.
 */
export function lives(s: Settlement): Map<string, LifeEvent[]> {
  const horizon = s.throughDay;
  const out = new Map<string, LifeEvent[]>();
  for (const p of s.people) if (p.birthDay <= horizon) out.set(p.id, []);

  const emit = (
    subject: Person,
    kind: LifeEventKind,
    day: number,
    others: readonly Person[],
    detail: string | null,
    discriminator?: Person,
  ) => {
    if (day > horizon) return;
    const list = out.get(subject.id);
    if (list === undefined) return;
    list.push({
      key: discriminator === undefined ? `${subject.id}/${kind}` : `${subject.id}/${kind}/${discriminator.id}`,
      day,
      kind,
      subject: subject.id,
      with: others.map((q) => q.id),
      detail,
    });
  };
  /** Strictly inside a life: born on or before the day, and not yet dead on it. */
  const livingOn = (p: Person, day: number) => p.birthDay <= day && p.deathDay > day;

  const people = s.people;

  // ── A. kinship: read straight off the substrate, no draws ──
  for (const p of people) {
    if (p.birthDay > horizon) continue;
    const partner = p.partner === null ? null : people[p.partner];
    const parents = p.parents === null ? [] : [people[p.parents[0]], people[p.parents[1]]];

    emit(p, "born", p.birthDay, parents, p.founder || p.incomer ? "elsewhere" : null);

    if (p.founder && partner !== null) emit(p, "arrived", s.foundedDay, [partner], "founded");
    if (p.incomer && partner !== null && p.partnerDay !== null) emit(p, "arrived", p.partnerDay, [partner], "married-in");

    if (partner !== null && p.partnerDay !== null) {
      emit(p, "married", p.partnerDay, [partner], null);
      if (p.bornInto >= 0) emit(p, "left-home", p.partnerDay, [], null);
      if (partner.deathDay < p.deathDay) emit(p, "widowed", partner.deathDay, [partner], null);
    }

    for (const parent of parents) {
      if (livingOn(p, parent.deathDay)) emit(p, "parent-died", parent.deathDay, [parent], null, parent);
    }

    if (parents.length > 0) {
      for (const si of parents[0].children) {
        if (si === p.index) continue;
        const sib = people[si];
        if (sib.birthDay > p.birthDay && livingOn(p, sib.birthDay)) emit(p, "sibling-born", sib.birthDay, [sib], null, sib);
        // `livingOn` also drops a sibling who died before you were born: family history, not a
        // thing you lived through.
        if (livingOn(p, sib.deathDay)) emit(p, "sibling-died", sib.deathDay, [sib], null, sib);
      }
    }

    for (const ci of p.children) {
      const child = people[ci];
      if (livingOn(p, child.birthDay)) emit(p, "child-born", child.birthDay, [child], null, child);
      if (livingOn(p, child.deathDay)) emit(p, "child-died", child.deathDay, [child], null, child);
      for (const gi of child.children) {
        const grandchild = people[gi];
        if (livingOn(p, grandchild.birthDay)) emit(p, "grandchild-born", grandchild.birthDay, [grandchild], null, grandchild);
      }
    }

    if (p.deathDay <= horizon) emit(p, "died", p.deathDay, [], causeOfDeath(p));
  }

  // ── B1. the trade, and who taught it ──
  // Candidates per trade, sorted by birth, so a teacher search is a window rather than a scan.
  const byTrade = new Map<Occupation, Person[]>();
  for (const p of people) {
    const list = byTrade.get(p.occupation);
    if (list === undefined) byTrade.set(p.occupation, [p]);
    else list.push(p);
  }
  for (const list of byTrade.values()) list.sort(byBirth);

  for (const p of people) {
    if (p.founder || p.incomer || p.birthDay > horizon) continue; // they brought their trade with them
    const r = stream(`${p.id}/trade`);
    const day = p.birthDay + Math.round(yearsToDays(TRADE.minAgeYears + r() * TRADE.spanYears));
    // Past the horizon the candidate set is not settled yet. Stop before reading it, not after.
    if (day > horizon || !present(s, p, day)) continue;

    let teacher: Person | null = null;
    if (p.parents !== null) {
      for (const pi of p.parents) {
        const parent = people[pi];
        if (parent.occupation === p.occupation && present(s, parent, day)) {
          teacher = parent;
          break;
        }
      }
    }
    if (teacher === null) {
      const oldest = day - yearsToDays(TRADE.teacherMaxAgeYears);
      const youngest = day - yearsToDays(TRADE.teacherMinAgeYears);
      const candidates: Person[] = [];
      for (const q of byTrade.get(p.occupation) ?? []) {
        if (q.birthDay < oldest) continue;
        if (q.birthDay > youngest) break;
        if (q.index !== p.index && present(s, q, day)) candidates.push(q);
      }
      if (candidates.length > 0) teacher = candidates[Math.floor(r() * candidates.length)];
    }

    if (teacher === null) {
      emit(p, "learned-trade", day, [], p.occupation);
      continue;
    }
    emit(p, "learned-trade", day, [teacher], p.occupation);
    emit(teacher, "taught", day, [p], p.occupation, p);
  }

  // ── B2. close friends: one symmetric decision per pair, per window ──
  const arrivedOn = (p: Person): number => (p.founder ? s.foundedDay : p.incomer ? p.partnerDay! : p.birthDay);

  // Headcount at the start of every year from the founding to the horizon. A sweep, so it costs one
  // pass over lifespans rather than one pass over the village per friendship.
  const firstYear = yearOf(s.foundedDay);
  const heads = new Int32Array(Math.max(0, yearOf(horizon) - firstYear + 1));
  for (const p of people) {
    const from = Math.max(firstYear, Math.ceil(arrivedOn(p) / DAYS_PER_YEAR));
    const to = Math.min(yearOf(horizon), Math.ceil(p.deathDay / DAYS_PER_YEAR) - 1);
    for (let y = from; y <= to; y++) heads[y - firstYear]++;
  }
  const headsOn = (day: number): number => Math.max(1, heads[yearOf(day) - firstYear] ?? 1);
  const childChance = (day: number) =>
    Math.min(FRIENDSHIP.maxChance, FRIENDSHIP.child.expected / (FRIENDSHIP.child.peersPerHead * headsOn(day)));
  const adultChance = (day: number) =>
    Math.min(
      FRIENDSHIP.maxChance,
      FRIENDSHIP.adult.expected / (FRIENDSHIP.adult.peersPerHead * headsOn(day) * FRIENDSHIP.meanTradeWeight),
    );

  const childGap = yearsToDays(FRIENDSHIP.child.maxGapYears);
  const adultGap = yearsToDays(FRIENDSHIP.adult.maxGapYears);
  const villageBorn = (p: Person) => !p.founder && !p.incomer;

  const here = people.filter((p) => p.birthDay <= horizon).sort(byBirth);
  for (let i = 0; i < here.length; i++) {
    const a = here[i];
    for (let j = i + 1; j < here.length; j++) {
      const b = here[j]; // never older than `a`
      const gap = b.birthDay - a.birthDay;
      if (gap > adultGap) break;
      if (sameParents(a, b)) continue;
      // Already married to each other ON THE DAY is not a friendship; marrying LATER does not undo one.
      // The first version skipped every pair who ever married, which read a pairing from after the
      // friendship's own day: the L2 test caught a childhood friendship that existed at one horizon
      // and vanished at a later one, the day the two of them wed. Settled-by-the-day, as everywhere.
      const wedBy = (d: number) => a.partner === b.index && a.partnerDay !== null && a.partnerDay <= d;
      const [lo, hi] = a.index < b.index ? [a, b] : [b, a];
      const pair = `${lo.id}|${hi.id}`;

      // Separate keys, so that two children who did not become friends can still become friends as
      // adults: a shared draw would make the adult window unreachable for every childhood non-pair.
      let day = -Infinity;
      let detail = "";
      if (villageBorn(a) && villageBorn(b) && gap <= childGap) {
        const d = b.birthDay + Math.round(yearsToDays(FRIENDSHIP.child.formAgeYears));
        if (d <= horizon && !wedBy(d) && present(s, a, d) && present(s, b, d) && hash01(`${pair}/friend/child`) < childChance(d)) {
          day = d;
          detail = "childhood";
        }
      }
      if (detail === "") {
        const d = Math.max(b.birthDay + Math.round(yearsToDays(FRIENDSHIP.adult.formAgeYears)), arrivedOn(a), arrivedOn(b));
        const sameTrade = a.occupation === b.occupation;
        // Past the horizon the headcount is not settled, so the chance is not either: stop first.
        if (d <= horizon && !wedBy(d) && present(s, a, d) && present(s, b, d)) {
          const chance = Math.min(FRIENDSHIP.maxChance, adultChance(d) * (sameTrade ? FRIENDSHIP.sameTradeWeight : 1));
          if (hash01(`${pair}/friend/adult`) < chance) {
            day = d;
            detail = sameTrade ? "work" : "adulthood";
          }
        }
      }
      if (detail === "" || day > horizon) continue;

      emit(a, "befriended", day, [b], detail, b);
      emit(b, "befriended", day, [a], detail, a);
      if (livingOn(b, a.deathDay)) emit(b, "friend-died", a.deathDay, [a], null, a);
      if (livingOn(a, b.deathDay)) emit(a, "friend-died", b.deathDay, [b], null, b);
    }
  }

  // ── B3. the estate ──
  const raisedIn = new Map<number, Person[]>();
  for (const p of people) {
    if (p.bornInto < 0) continue;
    const list = raisedIn.get(p.bornInto);
    if (list === undefined) raisedIn.set(p.bornInto, [p]);
    else list.push(p);
  }
  for (const h of s.households) {
    const [a, b] = [people[h.partners[0]], people[h.partners[1]]];
    const lastOut = a.deathDay >= b.deathDay ? a : b;
    const day = lastOut.deathDay;
    if (day > horizon) continue;
    const heirs = (raisedIn.get(h.index) ?? [])
      .filter((p) => present(s, p, day) && ageYears(p, day) >= ESTATE.adultYears)
      .sort(byBirth);
    if (heirs.length < 2) continue;
    const r = stream(`${lastOut.id}/estate`);
    if (r() >= ESTATE.riftChance) continue;
    const [first, second] = heirs;
    emit(first, "rift", day, [second], null, second);
    emit(second, "rift", day, [first], null, first);
    if (r() >= ESTATE.reconcileChance) continue; // and they never did
    const peace = day + Math.round(yearsToDays(ESTATE.reconcileMinYears + r() * ESTATE.reconcileSpanYears));
    if (!livingOn(first, peace) || !livingOn(second, peace)) continue;
    emit(first, "reconciled", peace, [second], null, second);
    emit(second, "reconciled", peace, [first], null, first);
  }

  for (const list of out.values()) list.sort(byEvent);
  return out;
}

/** One person's life. Computes the whole settlement's; call {@link lives} once if you need more. */
export function lifeOf(s: Settlement, p: Person): LifeEvent[] {
  return lives(s).get(p.id) ?? [];
}

const sameParents = (a: Person, b: Person): boolean =>
  a.parents !== null && b.parents !== null && a.parents[0] === b.parents[0] && a.parents[1] === b.parents[1];

const KIND_RANK = new Map(KIND_ORDER.map((k, i) => [k, i]));

function byEvent(a: LifeEvent, b: LifeEvent): number {
  return a.day - b.day || KIND_RANK.get(a.kind)! - KIND_RANK.get(b.kind)! || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

// ── temperament ─────────────────────────────────────────────────────────────────

/**
 * How many numbers a temperament is. It is the player's persona space, in `PERSONA_AXIS_KEYS` order
 * (`packages/shared/src/persona.ts`), so that BALD can choose among the people standing nearby
 * (SOC-6.F). `@echo/planet` does not depend on `@echo/shared`, so the length is pinned here and the
 * equality is pinned by a test in `apps/web`, where both are visible.
 */
export const TEMPERAMENT_AXES = 8;

/**
 * THE ONE PLACE THE SUBSTRATE WRITES A PERSONALITY, and why (C40 decision 3). `society.ts:43-48`
 * says nothing there does, and that stands. But if the substrate supplies none, the model at the
 * point of contact supplies its own default — which is exactly the thousand hats SOCIETY-PLAN §5
 * warns about.
 *
 * Founders and incomers draw from a prior centred on zero. A child is a blend of the parents' mean
 * and fresh noise, with the noise weight chosen to KEEP THE POPULATION'S SPREAD: two independent
 * parents' mean has half their variance, so `child = h·mean + sqrt(1 − h²/2)·noise` has the variance
 * a founder had. The naive `h·mean + (1 − h)·noise` loses spread every generation, and after the ten
 * or so generations a 300-year village holds, everybody would have the same temperament. A test pins
 * the founders' spread against the latest generation's.
 *
 * Constant over a life in v1 (C40 decision 2). Values in `[-1, 1]`, like the player axes.
 */
export const TEMPERAMENT = {
  heritability: 0.5,
  /** Prior standard deviation per axis, before clamping. */
  spread: 0.4,
} as const;

/** Approximately normal, mean 0, sd 1. Three uniforms, as `society.ts` draws its bell. */
const unitBell = (r: () => number): number => (r() + r() + r() - 1.5) * 2;

export function temperaments(s: Settlement): Map<string, readonly number[]> {
  const out = new Map<string, readonly number[]>();
  // Index order is generation order: a parent is always added before their children.
  for (const p of s.people) out.set(p.id, temperamentFrom(s, p, out));
  return out;
}

export function temperamentOf(s: Settlement, p: Person): readonly number[] {
  const memo = new Map<string, readonly number[]>();
  const walk = (q: Person): readonly number[] => {
    if (q.parents !== null) {
      for (const pi of q.parents) {
        const parent = s.people[pi];
        if (!memo.has(parent.id)) memo.set(parent.id, walk(parent));
      }
    }
    return temperamentFrom(s, q, memo);
  };
  return walk(p);
}

function temperamentFrom(s: Settlement, p: Person, known: Map<string, readonly number[]>): readonly number[] {
  const r = stream(`${p.id}/temperament`);
  const h = TEMPERAMENT.heritability;
  const noiseWeight = Math.sqrt(1 - (h * h) / 2);
  let parents: readonly [readonly number[], readonly number[]] | null = null;
  if (p.parents !== null) {
    const mother = known.get(s.people[p.parents[0]].id);
    const father = known.get(s.people[p.parents[1]].id);
    // Never fall back to the prior here: a child drawn as a founder would look plausible and be wrong.
    if (mother === undefined || father === undefined) throw new Error(`${p.id}: a parent's temperament was not computed first`);
    parents = [mother, father];
  }
  const axes: number[] = [];
  for (let i = 0; i < TEMPERAMENT_AXES; i++) {
    const noise = unitBell(r) * TEMPERAMENT.spread;
    const v = parents === null ? noise : h * (parents[0][i] + parents[1][i]) / 2 + noiseWeight * noise;
    axes.push(v < -1 ? -1 : v > 1 ? 1 : v);
  }
  return axes;
}
