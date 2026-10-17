/**
 * Life events and temperament (`lib/life.ts`, DECISIONS C40).
 *
 * THE TEST THAT MATTERS IS THE FIRST ONE, for the same reason it is in `society.test.ts`: a life read
 * to day N must be the same life read to any later day, up to N. Everything here is a function of
 * facts settled on or before an event's own day; the day that stops being true, two players see two
 * different pasts for the same baker, and nothing else in the suite will notice.
 *
 * Run:  node --import tsx --test packages/planet/tests/life.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ageYears,
  alive,
  settlementAt,
  type Person,
  type Settlement,
  type SettlementGeography,
} from "../lib/society.js";
import {
  CHRONICLE,
  HAZARDS,
  TEMPERAMENT_AXES,
  TRADE,
  causeOfDeath,
  chronicle,
  lifeOf,
  lives,
  present,
  temperamentOf,
  temperaments,
  type LifeEvent,
} from "../lib/life.js";
import { DAYS_PER_YEAR, yearsToDays } from "../lib/worldclock.js";

const SEED = "echo-planet-0001";

// The same three grounds `society.test.ts` uses, so the two suites describe one planet.
const VALLEY: SettlementGeography = {
  habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6,
};
const COAST: SettlementGeography = {
  habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7,
};
const UPLAND: SettlementGeography = {
  habitability: 0.75, arable: 0.1, coastal: 0.0, wooded: 0.3, mountain: 0.95, tradeAccess: 0.2,
};
const GROUNDS = { VALLEY, COAST, UPLAND } as const;

function sample(geo: SettlementGeography, day: number, n: number, prefix = "cell"): Settlement[] {
  const out: Settlement[] = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, geo, day);
    if (s !== null) out.push(s);
  }
  if (out.length < n) throw new Error(`only ${out.length} settlements in 400 cells — the sample is too thin to test`);
  return out;
}

const byId = (s: Settlement) => new Map(s.people.map((p) => [p.id, p]));

// ── L2 ──────────────────────────────────────────────────────────────────────────

test("L2: a life read to a later day is the same life, plus what happened since", () => {
  const early = -Math.round(yearsToDays(40));
  const late = Math.round(yearsToDays(30));
  let checked = 0;
  for (const geo of Object.values(GROUNDS)) {
    for (let i = 0; i < 20; i++) {
      const a = settlementAt(SEED, `l2-${i}`, geo, early);
      const b = settlementAt(SEED, `l2-${i}`, geo, late);
      if (a === null || b === null) continue;
      const before = lives(a);
      const after = lives(b);
      const later = byId(b);

      // Everything known at the early horizon is still there, field for field.
      for (const [id, events] of before) {
        const kept = (after.get(id) ?? []).filter((e) => e.day <= early);
        assert.deepEqual(kept, events, `${id}: the life read to day ${early} changed when read to day ${late}`);
        checked += events.length;
      }

      // And everything new is either AFTER the early horizon, or the backstory of someone who had
      // not arrived yet: an incomer's birth elsewhere, dated before they married in. Nothing else.
      for (const [id, events] of after) {
        const known = new Set((before.get(id) ?? []).map((e) => e.key));
        for (const e of events) {
          if (e.day > early || known.has(e.key)) continue;
          const p = later.get(id)!;
          assert.ok(
            p.incomer && p.partnerDay! > early && e.kind === "born",
            `${e.key}: appeared in the past (day ${e.day}) when the horizon moved, and is not an incomer's birth elsewhere`,
          );
        }
      }

      const ca = chronicle(a);
      const cb = chronicle(b).filter((v) => v.year <= Math.floor((early + 1) / DAYS_PER_YEAR) - 1);
      assert.deepEqual(cb, ca, `${a.cell}: the village's past changed when the horizon moved`);
    }
  }
  assert.ok(checked > 10_000, `only ${checked} events compared — the sample is too thin to be evidence`);
});

test("L2: the same call twice is the same past, and one life alone is the life in the whole", () => {
  const s = sample(VALLEY, 0, 1)[0];
  assert.deepEqual(lives(s), lives(s));
  assert.deepEqual(chronicle(s), chronicle(s));
  const all = lives(s);
  for (const p of s.people.slice(0, 40)) assert.deepEqual(lifeOf(s, p), all.get(p.id) ?? []);
});

test("inert: reading lives never changes the settlement they were read from (C40 decision 1)", () => {
  for (const s of sample(COAST, 0, 5)) {
    const before = JSON.stringify(s, (_k, v) => (v === Infinity ? "Inf" : v));
    lives(s);
    chronicle(s);
    temperaments(s);
    assert.equal(JSON.stringify(s, (_k, v) => (v === Infinity ? "Inf" : v)), before, `${s.cell} was mutated`);
  }
});

// ── consistency ─────────────────────────────────────────────────────────────────

const SYMMETRIC = new Set(["married", "befriended", "rift", "reconciled"]);

test("a shared event is one event with two sides: both lives carry it, on the same day", () => {
  let pairs = 0;
  for (const geo of Object.values(GROUNDS)) {
    for (const s of sample(geo, 0, 8, "sym")) {
      const all = lives(s);
      for (const [id, events] of all) {
        for (const e of events) {
          if (SYMMETRIC.has(e.kind)) {
            const other = all.get(e.with[0]) ?? [];
            const twin = other.find((o) => o.kind === e.kind && o.with[0] === id && o.day === e.day);
            assert.ok(twin, `${e.key}: ${e.with[0]} has no matching ${e.kind} on day ${e.day}`);
            if (e.kind === "befriended") assert.equal(twin.detail, e.detail, `${e.key}: the two sides disagree how they met`);
            pairs++;
          }
          if (e.kind === "learned-trade" && e.with.length > 0) {
            const taught = (all.get(e.with[0]) ?? []).find((o) => o.kind === "taught" && o.with[0] === id);
            assert.ok(taught && taught.day === e.day, `${e.key}: the teacher's life does not remember teaching them`);
          }
        }
      }
    }
  }
  assert.ok(pairs > 500, `only ${pairs} shared events — too few to be evidence`);
});

test("every event is inside the life it belongs to, and names only people who exist", () => {
  for (const geo of Object.values(GROUNDS)) {
    for (const s of sample(geo, 0, 8, "inside")) {
      const people = byId(s);
      for (const [id, events] of lives(s)) {
        const p = people.get(id)!;
        for (const e of events) {
          assert.ok(e.day >= p.birthDay, `${e.key}: before they were born`);
          assert.ok(e.day <= s.throughDay, `${e.key}: past the horizon`);
          if (e.kind === "died") assert.equal(e.day, p.deathDay, `${e.key}: not their death day`);
          else assert.ok(e.day < p.deathDay, `${e.key}: after they died`);
          for (const w of e.with) assert.ok(people.has(w), `${e.key}: names ${w}, who does not exist`);
          if (e.kind === "arrived") assert.ok(p.founder || p.incomer, `${e.key}: born here, and still "arrived"`);
          if (e.kind === "learned-trade") assert.ok(!p.founder && !p.incomer, `${e.key}: brought their trade, and still learned it here`);
          if (e.kind !== "born" && e.kind !== "died") {
            assert.ok(present(s, p, e.day), `${e.key}: lived through it while not in the village`);
          }
        }
        // Sorted, so a narrator reads a life in the order it was lived.
        for (let i = 1; i < events.length; i++) assert.ok(events[i - 1].day <= events[i].day, `${id}: out of order`);
      }
    }
  }
});

test("a teacher was here, old enough, and in the trade — or was the child's own parent", () => {
  let taught = 0;
  for (const s of sample(VALLEY, 0, 10, "teach")) {
    const people = byId(s);
    for (const [id, events] of lives(s)) {
      for (const e of events) {
        if (e.kind !== "learned-trade" || e.with.length === 0) continue;
        const p = people.get(id)!;
        const t = people.get(e.with[0])!;
        assert.equal(t.occupation, p.occupation, `${e.key}: taught by a ${t.occupation}`);
        assert.ok(present(s, t, e.day), `${e.key}: the teacher was not here that day`);
        const parent = p.parents !== null && (p.parents[0] === t.index || p.parents[1] === t.index);
        const age = ageYears(t, e.day);
        assert.ok(
          parent || (age >= TRADE.teacherMinAgeYears && age <= TRADE.teacherMaxAgeYears),
          `${e.key}: a teacher of ${age.toFixed(1)}`,
        );
        taught++;
      }
    }
  }
  assert.ok(taught > 200);
});

test("the median village-born adult over thirty has one or two close friends, on every ground", () => {
  for (const [name, geo] of Object.entries(GROUNDS)) {
    const counts: number[] = [];
    for (const s of sample(geo, 0, 40, "friends")) {
      const all = lives(s);
      for (const p of s.people) {
        if (p.founder || p.incomer || !alive(p, 0) || ageYears(p, 0) < 30) continue;
        counts.push((all.get(p.id) ?? []).filter((e) => e.kind === "befriended").length);
      }
    }
    counts.sort((a, b) => a - b);
    const median = counts[counts.length >> 1];
    assert.ok(counts.length > 100, `${name}: only ${counts.length} adults sampled`);
    assert.ok(median >= 1 && median <= 2, `${name}: the median adult has ${median} close friends`);
  }
});

// ── death and the chronicle ─────────────────────────────────────────────────────

test("what someone died of follows from who they were, and never moves their death day", () => {
  const seen = new Set<string>();
  for (const geo of Object.values(GROUNDS)) {
    for (const s of sample(geo, 0, 10, "cause")) {
      for (const p of s.people) {
        if (p.deathDay > 0) continue;
        const cause = causeOfDeath(p);
        const age = ageYears(p, p.deathDay);
        seen.add(cause);
        if (cause === "childhood-illness") assert.ok(age < 6, `${p.id}: a childhood illness at ${age.toFixed(1)}`);
        else if (cause === "old-age") assert.ok(age >= 70, `${p.id}: old age at ${age.toFixed(1)}`);
        else if (cause !== "illness") {
          assert.equal(HAZARDS[p.occupation]?.[0], cause, `${p.id}: a ${p.occupation} died of ${cause}`);
          assert.ok(age < 50, `${p.id}: their trade killed them at ${age.toFixed(1)}`);
        }
      }
    }
  }
  for (const c of ["childhood-illness", "illness", "old-age", "sea"]) assert.ok(seen.has(c), `nobody died of ${c}`);
});

test("everyone the chronicle names was there, and every death it explains is a grave", () => {
  const kinds = new Set<string>();
  for (const geo of Object.values(GROUNDS)) {
    for (const s of sample(geo, 0, 20, "chron")) {
      const people = byId(s);
      for (const v of chronicle(s)) {
        kinds.add(v.kind);
        const mid = v.year * DAYS_PER_YEAR + Math.floor(DAYS_PER_YEAR / 2);
        for (const w of v.witnesses) {
          const p = people.get(w)!;
          assert.ok(present(s, p, mid), `${v.key}: ${w} was not here`);
          assert.ok(ageYears(p, mid) >= CHRONICLE.witnessMinAgeYears, `${v.key}: ${w} was too young to remember`);
        }
        for (const d of v.dead) {
          const p = people.get(d)!;
          assert.equal(Math.floor(p.deathDay / DAYS_PER_YEAR), v.year, `${v.key}: ${d} died another year`);
          if (v.kind === "fever") assert.equal(causeOfDeath(p), "childhood-illness", `${v.key}: ${d}`);
          if (v.kind === "storm") assert.equal(causeOfDeath(p), "sea", `${v.key}: ${d}`);
        }
        if (v.kind === "storm") assert.ok(s.geography.coastal > CHRONICLE.stormMinCoastal, `${v.key}: a storm inland`);
        if (v.kind === "fever") assert.ok(v.dead.length >= CHRONICLE.feverChildDeaths, `${v.key}: a fever of ${v.dead.length}`);
        if (v.kind === "hungry-year" || v.kind === "fire") assert.equal(v.dead.length, 0, `${v.key}: v1 events kill nobody`);
      }
    }
  }
  // A kind that never occurs in sixty villages is dead code a narrator would still be told about.
  for (const k of ["fever", "storm", "hungry-year", "fire"]) assert.ok(kinds.has(k), `no ${k} in sixty villages`);
});

// ── temperament ─────────────────────────────────────────────────────────────────

test("temperament: eight numbers in [-1, 1], the same whichever way it is asked for", () => {
  const s = sample(VALLEY, 0, 1)[0];
  const all = temperaments(s);
  for (const p of s.people) {
    const t = all.get(p.id)!;
    assert.equal(t.length, TEMPERAMENT_AXES);
    for (const v of t) assert.ok(v >= -1 && v <= 1, `${p.id}: ${v}`);
  }
  // Asked for alone, out of order, it is the same person.
  for (const p of [...s.people].reverse().slice(0, 30)) assert.deepEqual(temperamentOf(s, p), all.get(p.id));
});

test("temperament: the spread survives ten generations, rather than everyone becoming the same", () => {
  const sd = (xs: number[]) => {
    const m = xs.reduce((a, x) => a + x, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
  };
  const founders: number[] = [];
  const recent: number[] = [];
  for (const s of sample(VALLEY, 0, 30, "spread")) {
    const all = temperaments(s);
    for (const p of s.people) {
      const t = all.get(p.id)!;
      if (p.founder || p.incomer) founders.push(...t);
      else if (p.birthDay > -yearsToDays(40) && p.birthDay <= 0) recent.push(...t);
    }
  }
  const ratio = sd(recent) / sd(founders);
  assert.ok(ratio > 0.8 && ratio < 1.25, `the latest generation has ${ratio.toFixed(2)}x the founders' spread`);
});

test("temperament: a child resembles their parents more than a stranger does", () => {
  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
  let kin = 0;
  let strangers = 0;
  let n = 0;
  for (const s of sample(VALLEY, 0, 10, "kin")) {
    const all = temperaments(s);
    const pool = s.people.filter((p: Person) => p.parents !== null);
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const mid = all.get(s.people[p.parents![0]].id)!.map((v, k) => (v + all.get(s.people[p.parents![1]].id)![k]) / 2);
      const other = pool[(i * 7919 + 13) % pool.length];
      if (other.index === p.index) continue;
      kin += dist(all.get(p.id)!, mid);
      strangers += dist(all.get(p.id)!, all.get(other.id)!);
      n++;
    }
  }
  assert.ok(n > 500);
  assert.ok(kin / n < strangers / n, `kin ${(kin / n).toFixed(3)} is no closer than strangers ${(strangers / n).toFixed(3)}`);
});

// ── Design Law 1 ────────────────────────────────────────────────────────────────

test("Design Law 1: a life has no score, no level, no points and no wealth", () => {
  const banned = /score|level|xp|points?$|rank|wealth|gold|coin|reputation/i;
  const s = sample(VALLEY, 0, 1)[0];
  const events: LifeEvent[] = [...lives(s).values()].flat();
  for (const key of Object.keys(events[0])) assert.equal(banned.test(key), false, `LifeEvent.${key}`);
  for (const e of events) {
    assert.equal(banned.test(e.kind), false, e.kind);
    if (e.detail !== null) assert.equal(banned.test(e.detail), false, e.detail);
  }
  for (const v of chronicle(s)) {
    for (const key of Object.keys(v)) assert.equal(banned.test(key), false, `VillageEvent.${key}`);
    assert.equal(banned.test(v.kind), false, v.kind);
  }
});
