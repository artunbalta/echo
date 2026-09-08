/**
 * The society substrate (SOCIETY-PLAN SOC-6.A), and the one property the shared world rests on.
 *
 * THE TEST THAT MATTERS IS "the lineage to a later day is a prefix of itself". L2 says everything
 * demographic is a function of `(seed, time)` and never of `(seed, visit history)`, and the failure
 * it exists to prevent is silent: if any roll happened "when a player first arrived", two players
 * arriving in a different order would see different villages, the shared world would fork, and
 * nobody would find out for a month because every gate would stay green. So it is pinned as an
 * equality over every immutable field of every person, not as a population count.
 *
 * The rest is the arithmetic C26 makes a rule of: `alive` is `birth + lifespan > day` and nothing
 * else, no player can move it, and the whole village is computable without having been simulated.
 *
 * Run:  node --import tsx --test packages/planet/tests/society.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CAPACITY_MAX,
  FOUNDING,
  MAX_PEOPLE,
  MIN_HABITABILITY,
  OCCUPATIONS,
  PAIRING,
  SETTLEMENT_RATE,
  VITALS,
  alive,
  ageYears,
  bloodRelation,
  census,
  occupationWeights,
  relation,
  settlementAt,
  type Person,
  type SettlementGeography,
} from "../lib/society.js";
import { yearsToDays } from "../lib/worldclock.js";

const SEED = "echo-planet-0001";

/** A good valley: habitable, farmable, on a road. The settlement most likely to exist. */
const VALLEY: SettlementGeography = {
  habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6,
};
const COAST: SettlementGeography = {
  habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7,
};
const UPLAND: SettlementGeography = {
  habitability: 0.75, arable: 0.1, coastal: 0.0, wooded: 0.3, mountain: 0.95, tradeAccess: 0.2,
};

/** A settlement that definitely exists, for the tests that need one rather than a sample. */
function anySettlement(geo: SettlementGeography, day: number) {
  for (let i = 0; i < 200; i++) {
    const s = settlementAt(SEED, `cell-${i}`, geo, day);
    if (s !== null && s.people.length > 20) return s;
  }
  throw new Error("no settlement was generated in 200 cells — the gate is too tight to test");
}

/**
 * Every field of a person that is settled AT BIRTH. If one of these moves, a person changed.
 *
 * Pairing is deliberately not in here, and the distinction is the whole point: `partner` is a fact
 * that gets ADDED as the horizon reaches the day it happens, and it is checked separately below as
 * monotone — never set, then unset, and never set to somebody else.
 */
function born(p: Person) {
  return {
    id: p.id, index: p.index, given: p.given, family: p.family, sex: p.sex,
    birthDay: p.birthDay, lifespanDays: p.lifespanDays, deathDay: p.deathDay,
    parents: p.parents === null ? null : [...p.parents],
    occupation: p.occupation, incomer: p.incomer, founder: p.founder,
    bornInto: p.bornInto, pairAgeDays: p.pairAgeDays,
  };
}

// ── L2 ──────────────────────────────────────────────────────────────────────────

test("L2: a lineage generated to a later day is the same lineage, plus what happened since", () => {
  // Twenty years apart, which is a whole generation of births and pairings.
  const early = 0;
  const late = Math.round(yearsToDays(20));

  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const cell = `cell-${i}`;
    const a = settlementAt(SEED, cell, VALLEY, early);
    const b = settlementAt(SEED, cell, VALLEY, late);

    if (a === null) {
      assert.equal(b, null, `${cell}: a settlement appeared out of nowhere when the horizon moved`);
      continue;
    }
    assert.notEqual(b, null, `${cell}: a settlement vanished when the horizon moved`);
    if (b === null) continue;

    assert.equal(a.name, b.name);
    assert.equal(a.foundedDay, b.foundedDay);
    assert.equal(a.capacity, b.capacity);
    assert.equal(a.culture, b.culture);
    assert.ok(b.people.length >= a.people.length, `${cell}: people were lost`);

    for (let k = 0; k < a.people.length; k++) {
      const [before, after] = [a.people[k], b.people[k]];
      assert.deepEqual(
        born(before),
        born(after),
        `${cell}: person ${k} changed when the horizon moved — the shared world has forked`,
      );
      // Pairing is monotone. It may APPEAR as the horizon reaches the day; it may never move.
      if (before.partner !== null) {
        assert.equal(after.partner, before.partner, `${cell}: ${before.id} married somebody else`);
        assert.equal(after.partnerDay, before.partnerDay);
      }
      // A child, once born, is still that pair's child at the same place in the list.
      assert.deepEqual(
        after.children.slice(0, before.children.length),
        before.children,
        `${cell}: ${before.id}'s children were reordered`,
      );
      checked++;
    }
    // Households already founded keep their founding day and their partners.
    for (let k = 0; k < a.households.length; k++) {
      assert.equal(a.households[k].foundedDay, b.households[k].foundedDay);
      assert.deepEqual([...a.households[k].partners], [...b.households[k].partners]);
    }
  }
  assert.ok(checked > 500, `only ${checked} people were compared; the sample is too thin to mean anything`);
});

test("L2: the same call twice is the same village, field for field", () => {
  const day = Math.round(yearsToDays(3));
  const a = anySettlement(VALLEY, day);
  const b = settlementAt(SEED, a.cell, VALLEY, day);
  assert.deepEqual(a, b);
});

test("a different seed, or a different cell, is a different village", () => {
  const day = 0;
  const here = anySettlement(VALLEY, day);
  const otherSeed = settlementAt("echo-planet-0002", here.cell, VALLEY, day);
  const otherCell = settlementAt(SEED, `${here.cell}-x`, VALLEY, day);

  const shape = (s: ReturnType<typeof settlementAt>) =>
    s === null ? null : `${s.name}/${s.foundedDay}/${s.people.length}`;
  assert.notEqual(shape(otherSeed), shape(here));
  assert.notEqual(shape(otherCell), shape(here));
});

// ── C26 ─────────────────────────────────────────────────────────────────────────

test("C26: alive() is birth + lifespan > day and nothing else", () => {
  const s = anySettlement(VALLEY, 0);
  for (const p of s.people) {
    assert.equal(p.deathDay, p.birthDay + p.lifespanDays, `${p.id}: deathDay is not derived`);
    assert.ok(p.lifespanDays > 0, `${p.id}: a life of zero days`);
    assert.equal(alive(p, p.birthDay - 1), false, `${p.id}: alive before being born`);
    assert.equal(alive(p, p.birthDay), true);
    assert.equal(alive(p, p.deathDay - 1), true);
    assert.equal(alive(p, p.deathDay), false, `${p.id}: alive on the day they died`);
  }
});

test("C26: nobody outlives the ceiling, and child deaths land inside childhood", () => {
  const s = anySettlement(VALLEY, 0);
  let children = 0;
  for (const p of s.people) {
    const years = p.lifespanDays / 365;
    assert.ok(years <= VITALS.maxYears + 1, `${p.id} lived ${years.toFixed(1)} years`);
    if (years < VITALS.minAdultYears) {
      children++;
      assert.ok(years <= VITALS.childCeilingYears + 0.01, `${p.id} died at ${years.toFixed(1)}, between the two draws`);
    }
  }
  assert.ok(children > 0, "a three-hundred-year village with no child deaths has nothing to grieve");
});

test("C26: the graves are already there, which is what SOC-6.H has to make visible", () => {
  const s = anySettlement(VALLEY, 0);
  const c = census(s, 0);
  assert.ok(c.dead.length > c.alive.length, "a bounded history should leave more dead than living");
  assert.ok(c.recentlyDead.length > 0, "nobody has died within living memory — there is nothing to talk about");
  assert.equal(c.alive.length + c.dead.length, s.people.filter((p) => p.birthDay <= 0).length);
});

// ── bounded history ─────────────────────────────────────────────────────────────

test("history is bounded: a settlement has a founding date, not an infinite past", () => {
  for (let i = 0; i < 120; i++) {
    const s = settlementAt(SEED, `cell-${i}`, VALLEY, 0);
    if (s === null) continue;
    const yearsAgo = -s.foundedDay / 365;
    assert.ok(
      yearsAgo >= FOUNDING.minYearsAgo - 1 && yearsAgo <= FOUNDING.maxYearsAgo + 1,
      `${s.cell} was founded ${yearsAgo.toFixed(0)} years ago, outside the bounded window`,
    );
    assert.ok(s.foundedDay < 0, "a settlement founded in the future");
  }
});

test("the population is bounded by the ground, and the cap is never silent", () => {
  for (let i = 0; i < 80; i++) {
    const s = settlementAt(SEED, `cell-${i}`, VALLEY, Math.round(yearsToDays(10)));
    if (s === null) continue;
    assert.ok(s.people.length <= MAX_PEOPLE, "MAX_PEOPLE was exceeded");
    if (s.people.length >= MAX_PEOPLE) assert.equal(s.truncated, true, "the cap fired without saying so");
    const living = census(s, 0).population;
    assert.ok(
      living <= s.capacity * 2.2,
      `${s.cell}: ${living} alive against a capacity of ${s.capacity} — the damping is not holding`,
    );
    assert.ok(s.capacity <= CAPACITY_MAX);
  }
});

// ── who lives where ─────────────────────────────────────────────────────────────

test("uninhabitable ground has nobody on it, and habitable ground is mostly still empty", () => {
  const dead: SettlementGeography = { ...VALLEY, habitability: MIN_HABITABILITY - 0.01 };
  for (let i = 0; i < 50; i++) {
    assert.equal(settlementAt(SEED, `cell-${i}`, dead, 0), null);
  }

  // An empty valley is a fact about a planet, not a gap in a generator — and the RATE at which
  // liveable ground was actually settled is a separate dial from whether it is liveable at all.
  // The bound is DERIVED from both constants rather than written down: it was `> 60 && < 260`, which
  // was the old SETTLEMENT_RATE of 1.0 with the arithmetic left implicit, and it went red the first
  // time C33 moved the dial. A bound that has to be re-typed when a constant moves is a bound that
  // will one day be re-typed to whatever the code now does.
  const habitability = 0.35;
  const cells = 400;
  const sparse: SettlementGeography = { ...VALLEY, habitability };
  let settled = 0;
  for (let i = 0; i < cells; i++) if (settlementAt(SEED, `cell-${i}`, sparse, 0) !== null) settled++;

  const expected = cells * habitability * SETTLEMENT_RATE;
  assert.ok(
    settled > expected * 0.5 && settled < expected * 1.5,
    `${settled}/${cells} cells settled at habitability ${habitability} and rate ${SETTLEMENT_RATE}; ` +
      `the acceptance draw predicts about ${expected.toFixed(0)}`,
  );
  // And the point of the test, which the arithmetic above must never be allowed to obscure: most
  // liveable ground has nobody on it.
  assert.ok(settled < cells / 2, `${settled}/${cells} is not "mostly still empty"`);
});

test("the ground decides the trades: fishers on a coast, miners in the hills", () => {
  const share = (geo: SettlementGeography, want: string) => {
    let n = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const s = settlementAt(SEED, `cell-${i}`, geo, 0);
      if (s === null) continue;
      for (const p of census(s, 0).alive) {
        total++;
        if (p.occupation === want) n++;
      }
    }
    return total === 0 ? 0 : n / total;
  };

  assert.ok(share(COAST, "fisher") > share(VALLEY, "fisher") * 3, "a coast is not fishing");
  assert.ok(share(UPLAND, "miner") > share(VALLEY, "miner") * 3, "the hills are not mining");
  assert.ok(share(VALLEY, "farmer") > share(UPLAND, "farmer") * 2, "the good ground is not farmed");
});

test("no trade is impossible anywhere, which is a fact about the weights and not about a sample", () => {
  // The share of fishers on a mountain is about one in five thousand, so asking a village to prove
  // it exists is asking a coin to come up heads on demand. The claim is structural: every trade has
  // a floor above zero on every possible ground, including ground with nothing on it at all.
  const nothing: SettlementGeography = {
    habitability: 0, arable: 0, coastal: 0, wooded: 0, mountain: 0, tradeAccess: 0,
  };
  for (const geo of [nothing, VALLEY, COAST, UPLAND]) {
    const table = occupationWeights(geo);
    assert.equal(table.length, OCCUPATIONS.length, "an occupation has no weight at all");
    for (const [occupation, weight] of table) {
      assert.ok(weight > 0, `${occupation} is impossible on this ground, and nothing should be`);
      assert.ok(OCCUPATIONS.includes(occupation));
    }
  }
});

test("every occupation is one of the declared ones", () => {
  const s = anySettlement(VALLEY, 0);
  for (const p of s.people) assert.ok(OCCUPATIONS.includes(p.occupation), `${p.occupation} is not an occupation`);
});

// ── kinship ─────────────────────────────────────────────────────────────────────

test("nobody pairs with a parent, a child or a sibling", () => {
  for (let i = 0; i < 60; i++) {
    const s = settlementAt(SEED, `cell-${i}`, VALLEY, 0);
    if (s === null) continue;
    for (const p of s.people) {
      if (p.partner === null) continue;
      const q = s.people[p.partner];
      assert.equal(q.partner, p.index, `${p.id}: a pairing that is not mutual`);
      assert.equal(p.partnerDay, q.partnerDay);
      assert.notEqual(p.sex, q.sex);
      const rel = bloodRelation(s, p, q);
      assert.ok(
        rel !== "parent" && rel !== "child" && rel !== "sibling",
        `${p.id} paired with their ${rel}`,
      );
      assert.ok(
        Math.abs(ageYears(p, 0) - ageYears(q, 0)) <= PAIRING.maxAgeGapYears + 0.01,
        `${p.id} paired across ${Math.abs(ageYears(p, 0) - ageYears(q, 0)).toFixed(1)} years`,
      );
    }
  }
});

test("relation() terminates on a married couple, which is the bug it was written around", () => {
  const s = anySettlement(VALLEY, 0);
  const paired = s.people.find((p) => p.partner !== null && p.children.length > 0);
  assert.ok(paired !== undefined);
  const spouse = s.people[paired.partner as number];

  // Two people married to each other, asked about each other. The naive in-law check recurses here
  // forever: a -> a.partner -> its partner -> a, and the stack ends the process.
  assert.equal(relation(s, paired, spouse), "partner");
  assert.equal(relation(s, spouse, paired), "partner");

  const child = s.people[paired.children[0]];
  assert.equal(relation(s, paired, child), "parent");
  assert.equal(relation(s, child, paired), "child");
  assert.equal(relation(s, child, child), "self");
  if (paired.children.length > 1) {
    assert.equal(relation(s, child, s.people[paired.children[1]]), "sibling");
  }
});

test("parents really are older than their children, and children are in both parents' lists", () => {
  const s = anySettlement(VALLEY, 0);
  for (const p of s.people) {
    if (p.parents === null) continue;
    const [mother, father] = [s.people[p.parents[0]], s.people[p.parents[1]]];
    assert.equal(mother.sex, "f");
    assert.equal(father.sex, "m");
    assert.ok(mother.children.includes(p.index), `${p.id} is missing from its mother's children`);
    assert.ok(father.children.includes(p.index), `${p.id} is missing from its father's children`);
    assert.ok(p.birthDay > mother.birthDay, `${p.id} is older than its mother`);
    assert.ok(alive(mother, p.birthDay), `${p.id} was born after its mother died`);
    assert.ok(alive(father, p.birthDay), `${p.id} was born after its father died`);
    assert.ok(
      ageYears(mother, p.birthDay) <= 43,
      `${p.id}'s mother was ${ageYears(mother, p.birthDay).toFixed(0)}`,
    );
  }
});

// ── households ──────────────────────────────────────────────────────────────────

test("a house stands until the last person in it is gone", () => {
  const s = anySettlement(VALLEY, 0);
  assert.ok(s.households.length > 0);
  for (const h of s.households) {
    assert.ok(h.dissolvedDay >= h.foundedDay, `household ${h.index} dissolved before it was founded`);
    const [a, b] = [s.people[h.partners[0]], s.people[h.partners[1]]];
    assert.equal(a.partner, b.index);
    assert.equal(b.partner, a.index);
    assert.equal(a.household, h.index);
    assert.equal(b.household, h.index);
    // Nobody in the house is still alive after it dissolved.
    assert.ok(a.deathDay <= h.dissolvedDay && b.deathDay <= h.dissolvedDay);
    for (const p of s.people) {
      if (p.bornInto !== h.index) continue;
      assert.ok(
        (p.partnerDay ?? p.deathDay) <= h.dissolvedDay,
        `${p.id} was still in household ${h.index} after it dissolved`,
      );
    }
  }
});

test("the census partitions the settlement, and says who is left over", () => {
  const s = anySettlement(VALLEY, 0);
  const c = census(s, 0);

  const liveIds = new Set(c.alive.map((p) => p.index));
  for (const p of c.alive) assert.ok(alive(p, 0));
  for (const p of c.dead) assert.equal(alive(p, 0), false);
  assert.equal(liveIds.size, c.population);

  for (const p of c.widowed) {
    assert.notEqual(p.partner, null);
    assert.equal(liveIds.has(p.partner as number), false, `${p.id} is widowed by a living partner`);
  }
  for (const p of c.orphans) {
    assert.notEqual(p.parents, null);
    for (const i of p.parents as readonly [number, number]) {
      assert.equal(liveIds.has(i), false, `${p.id} is an orphan with a living parent`);
    }
  }
  if (c.eldest !== null) {
    for (const p of c.alive) assert.ok(p.birthDay >= c.eldest.birthDay);
  }
  for (const h of c.households) {
    assert.ok(h.foundedDay <= 0 && h.dissolvedDay > 0);
  }
});

// ── Design Law 1 ────────────────────────────────────────────────────────────────

test("Design Law 1: a person has no score, no level, no points and no wealth", () => {
  const s = anySettlement(VALLEY, 0);
  const banned = /score|level|xp|points?$|rank|wealth|gold|coin|reputation/i;
  for (const key of Object.keys(s.people[0])) {
    assert.equal(banned.test(key), false, `Person.${key} is a ladder, and Law 1 forbids one`);
  }
  for (const key of Object.keys(s)) {
    assert.equal(banned.test(key), false, `Settlement.${key} is a ladder, and Law 1 forbids one`);
  }
});

// ── cost ────────────────────────────────────────────────────────────────────────

test("a village is cheap enough that a caller can afford to memoise rather than persist", () => {
  const started = process.hrtime.bigint();
  let people = 0;
  let settlements = 0;
  for (let i = 0; i < 40; i++) {
    const s = settlementAt(SEED, `cost-${i}`, VALLEY, 0);
    if (s === null) continue;
    settlements++;
    people += s.people.length;
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(settlements > 5, `only ${settlements} settlements in 40 cells`);
  // Generous by design: this is a regression bar on the O(n^2) pairing scan, not a benchmark.
  assert.ok(ms < 4000, `${settlements} settlements and ${people} people took ${ms.toFixed(0)} ms`);
});
