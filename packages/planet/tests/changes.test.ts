/**
 * Changes to a life (`lib/changes.ts`, `lib/goals.ts`, DECISIONS C44): the world generated FROM a
 * conversation's decisions, and the rules a decision is held to.
 *
 * THE TEST THAT MATTERS IS "the past does not move". A change on day L may rewrite everything after L
 * — who is born, who pairs with whom — and must not touch one fact before it, or a villager somebody
 * met last week becomes someone else because of what a stranger said today.
 *
 * Run:  node --import tsx --test packages/planet/tests/changes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolveChanges, type LifeChange } from "../lib/changes.js";
import { CHANGE_LIMITS, GOALS, checkChange, eveningOf, goalsOf, type Proposal } from "../lib/goals.js";
import { present } from "../lib/life.js";
import { dayPlans, doorOf } from "../lib/schedule.js";
import { LEAVE_WITH_FAMILY_YEARS, ageYears, occupationOn, settlementAt, type Person, type Settlement, type SettlementGeography } from "../lib/society.js";
import { residentsOn, villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";
import { yearsToDays } from "../lib/worldclock.js";

const SEED = "echo-planet-0001";
const VALLEY: SettlementGeography = { habitability: 0.95, arable: 0.8, coastal: 0.05, wooded: 0.4, mountain: 0.1, tradeAccess: 0.6 };
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };

/** Settled villages with people in them on `day`. */
function villages(geo: SettlementGeography, n: number, prefix: string, day = 0): Settlement[] {
  const out: Settlement[] = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, geo, day);
    if (s && s.people.filter((p) => present(s, p, day)).length >= 15) out.push(s);
  }
  assert.equal(out.length, n);
  return out;
}

let seq = 0;
const change = (c: Omit<LifeChange, "id">): LifeChange => ({ id: `t${String(++seq).padStart(6, "0")}`, ...c });

/** A married adult with young children, here today: the case where leaving cascades furthest. */
function parentOfYoung(s: Settlement, day: number): Person | null {
  return (
    s.people.find(
      (p) =>
        present(s, p, day) &&
        ageYears(p, day) >= 25 &&
        ageYears(p, day) < 45 &&
        p.partner !== null &&
        present(s, s.people[p.partner], day) &&
        p.children.some((i) => present(s, s.people[i], day) && ageYears(s.people[i], day) < 10),
    ) ?? null
  );
}

/** Every fact about a person settled at birth or before `day`. */
function settledBy(p: Person, day: number) {
  return {
    id: p.id,
    given: p.given,
    family: p.family,
    sex: p.sex,
    birthDay: p.birthDay,
    lifespanDays: p.lifespanDays,
    occupation: p.occupation,
    pairAgeDays: p.pairAgeDays,
    partnerDay: p.partnerDay !== null && p.partnerDay < day ? p.partnerDay : null,
  };
}

// ── no change, no difference ────────────────────────────────────────────────────

test("C44: a village with no changes is the seed's village, field for field", () => {
  for (const s of villages(VALLEY, 4, "same")) {
    assert.deepEqual(settlementAt(SEED, s.cell, VALLEY, 0, []), s);
  }
});

// ── the past does not move ──────────────────────────────────────────────────────

test("C44: a leaving rewrites the future and not one fact before its day", () => {
  let checked = 0;
  for (const s of villages(VALLEY, 12, "past", 0)) {
    const leaver = parentOfYoung(s, 0);
    if (leaver === null) continue;
    const L = 10;
    const after = settlementAt(SEED, s.cell, VALLEY, 0, [change({ person: leaver.id, kind: "leave", madeDay: 0, day: L })])!;
    const before = s.people.filter((p) => p.birthDay < L);
    const byId = new Map(after.people.map((p) => [p.id, p]));
    for (const p of before) {
      const q = byId.get(p.id);
      assert.ok(q, `${s.cell}: ${p.given} (born before the day) is gone from the changed village`);
      assert.deepEqual(settledBy(q, L), settledBy(p, L), `${s.cell}: ${p.given} changed before the day`);
      assert.ok(q.leftDay >= L, `${s.cell}: ${q.given} was gone on day ${q.leftDay}, before the change's day ${L}`);
    }
    for (const h of s.households.filter((h) => h.foundedDay < L)) {
      assert.deepEqual({ ...after.households[h.index], dissolvedDay: 0 }, { ...h, dissolvedDay: 0 }, `${s.cell}: an early household moved`);
    }
    checked++;
  }
  assert.ok(checked >= 4, `only ${checked} villages had a parent of young children to test with`);
});

test("C44: a family leaves together — the partner and the young children, not the grown ones — and is not buried here", () => {
  let checked = 0;
  for (const s of villages(COAST, 12, "family", 0)) {
    const leaver = parentOfYoung(s, 0);
    if (leaver === null) continue;
    const L = 5;
    const after = settlementAt(SEED, s.cell, COAST, 0, [change({ person: leaver.id, kind: "leave", madeDay: 0, day: L })])!;
    const me = after.people.find((p) => p.id === leaver.id)!;
    const partner = after.people[me.partner!];
    assert.equal(me.leftDay, L);
    if (partner.deathDay > L) assert.equal(partner.leftDay, L, `${s.cell}: the partner stayed behind`);
    for (const i of me.children) {
      const c = after.people[i];
      assert.ok(c.birthDay < L, `${s.cell}: a child was born to them after they left`);
      const young = L - c.birthDay < yearsToDays(LEAVE_WITH_FAMILY_YEARS);
      if (c.deathDay > L) assert.equal(c.leftDay === L, young, `${s.cell}: ${c.given}, ${ageYears(c, L).toFixed(0)}, ${young ? "stayed" : "went"}`);
    }
    for (const p of [me, partner]) {
      assert.equal(present(after, p, L), false);
      assert.equal(present(after, p, L - 1), p.deathDay > L - 1);
    }
    checked++;
  }
  assert.ok(checked >= 4, `only ${checked} villages`);
});

test("C44: a stay decided before the day unmakes the leaving; one decided after it changes nothing", () => {
  for (const s of villages(VALLEY, 4, "stay", 0)) {
    const p = s.people.find((q) => present(s, q, 0) && ageYears(q, 0) >= 20 && ageYears(q, 0) < 60)!;
    const leave = change({ person: p.id, kind: "leave", madeDay: 0, day: 8 });
    const stayed = settlementAt(SEED, s.cell, VALLEY, 0, [leave, change({ person: p.id, kind: "stay", madeDay: 3, day: 3 })])!;
    assert.deepEqual(stayed, s, "a cancelled leaving left a mark");
    const late = settlementAt(SEED, s.cell, VALLEY, 0, [leave, change({ person: p.id, kind: "stay", madeDay: 9, day: 9 })])!;
    assert.equal(late.people.find((q) => q.id === p.id)!.leftDay, 8, "a stay after they had gone brought them back");
  }
});

test("C44: a change is never read before the day it was made, whatever day it claims", () => {
  const resolved = resolveChanges([change({ person: "x", kind: "leave", madeDay: 10, day: 4 })]);
  assert.equal(resolved.get("x"), undefined);
});

test("L2, with a delta: the same changes read to a later day are a prefix of themselves", () => {
  for (const s of villages(VALLEY, 6, "prefix", 0)) {
    const leaver = parentOfYoung(s, 0) ?? s.people.find((p) => present(s, p, 0) && ageYears(p, 0) > 20)!;
    const changes = [change({ person: leaver.id, kind: "leave", madeDay: 0, day: 12 })];
    const a = settlementAt(SEED, s.cell, VALLEY, 40, changes)!;
    const b = settlementAt(SEED, s.cell, VALLEY, 4000, changes)!;
    const later = new Map(b.people.map((p) => [p.id, p]));
    for (const p of a.people.filter((q) => q.birthDay <= 40)) {
      const q = later.get(p.id);
      assert.ok(q, `${s.cell}: ${p.given} vanished at a later horizon`);
      assert.deepEqual(settledBy(q, 40), settledBy(p, 40));
      assert.equal(q.leftDay, p.leftDay);
    }
  }
});

// ── trades ──────────────────────────────────────────────────────────────────────

test("C44: a trade is taken up on its day, and children born after it can be raised to it", () => {
  let raised = 0;
  let children = 0;
  for (const s of villages(VALLEY, 30, "trade", -yearsToDays(80))) {
    // A founding father takes up pottery the day the village is founded.
    const father = s.people.find((p) => p.founder && p.sex === "m")!;
    const day = s.foundedDay;
    const after = settlementAt(SEED, s.cell, VALLEY, -yearsToDays(80), [change({ person: father.id, kind: "trade", madeDay: day, day, occupation: "potter" })])!;
    const f = after.people.find((p) => p.id === father.id)!;
    assert.equal(occupationOn(f, day - 1), father.occupation);
    assert.equal(occupationOn(f, day), "potter");
    for (const i of f.children) {
      children++;
      if (after.people[i].occupation === "potter") raised++;
    }
  }
  // Inheritance is 0.42 and from either parent, so about a fifth of the children, plus the potters
  // the weights make anyway (0.12 of ~5.3): well above the ~2% a valley raises without the change.
  assert.ok(children > 60, `only ${children} children`);
  assert.ok(raised / children > 0.12, `${raised} of ${children} children of a potter were raised to pottery`);
});

// ── goals ───────────────────────────────────────────────────────────────────────

test("goals: the seed gives grown people something to want, and children nothing", () => {
  let adults = 0;
  let withGoal = 0;
  for (const s of villages(VALLEY, 6, "goals", 0)) {
    for (const p of s.people.filter((q) => present(s, q, 0))) {
      const g = goalsOf(s, p, 0, []);
      if (ageYears(p, 0) < CHANGE_LIMITS.minAgeYears) {
        assert.equal(g.active.length, 0);
        continue;
      }
      adults++;
      if (g.active.length > 0) withGoal++;
      for (const x of g.active) {
        assert.equal(x.source, "seed");
        assert.ok(GOALS[x.kind], `an unknown goal ${x.kind}`);
        assert.ok(!x.text.includes("{"), `an unfilled goal: ${x.text}`);
      }
      assert.deepEqual(goalsOf(s, p, 0, []), g, "the same person wants different things asked twice");
    }
  }
  assert.ok(withGoal / adults > 0.85, `${withGoal} of ${adults} grown people want nothing at all`);
});

test("goals: a conversation adds one, giving it up removes it, and a boat is built in forty days", () => {
  const s = villages(COAST, 6, "boat", 0).find((v) => v.people.some((p) => present(v, p, 0) && ageYears(p, 0) > 20 && ageYears(p, 0) < 50 && occupationOn(p, 0) === "fisher"))!;
  const p = s.people.find((q) => present(s, q, 0) && ageYears(q, 0) > 20 && ageYears(q, 0) < 50 && occupationOn(q, 0) === "fisher")!;
  const v = checkChange(s, p, 0, { kind: "goal", goal: "own-boat" }, []);
  assert.ok(v.ok, v.ok ? "" : v.reason);
  const adopt = change(v.change);
  const g = goalsOf(s, p, 1, [adopt]);
  assert.ok(g.active.some((x) => x.kind === "own-boat" && x.source === "talk"));
  assert.ok(goalsOf(s, p, 40, [adopt]).done.some((x) => x.kind === "own-boat"), "forty days on, still no boat");
  const drop = change({ person: p.id, kind: "drop", madeDay: 2, day: 2, goalId: "own-boat" });
  assert.ok(!goalsOf(s, p, 3, [adopt, drop]).active.some((x) => x.kind === "own-boat"), "a goal given up is still wanted");
});

// ── the rules a change is held to ───────────────────────────────────────────────

test("checkChange: every rule refuses by name", () => {
  const s = villages(VALLEY, 1, "rules", 0)[0];
  const here = s.people.filter((p) => present(s, p, 0));
  const adult = here.find((p) => ageYears(p, 0) >= 25 && ageYears(p, 0) < 55)!;
  const child = here.find((p) => ageYears(p, 0) < 10);
  const no = (p: Person, proposal: Proposal, changes: LifeChange[], reason: string) => {
    const v = checkChange(settlementAt(SEED, s.cell, VALLEY, 0, changes)!, p, 0, proposal, changes);
    assert.deepEqual(v, { ok: false, reason }, `${JSON.stringify(proposal)} should be refused for ${reason}`);
  };
  if (child) no(child, { kind: "leave", inDays: 5 }, [], "too-young");
  no(adult, { kind: "leave", inDays: 1 }, [], "notice");
  no(adult, { kind: "leave", inDays: 31 }, [], "notice");
  no(adult, { kind: "stay" }, [], "not-leaving");
  no(adult, { kind: "trade", occupation: occupationOn(adult, 0) }, [], "same-trade");
  no(adult, { kind: "drop", goalId: "nothing-of-the-sort" }, [], "not-wanted");
  const leaving = [change({ person: adult.id, kind: "leave", madeDay: 0, day: 5 })];
  no(adult, { kind: "goal", goal: "see-beyond" }, leaving, "decided-today");
  const other = here.find((p) => p.id !== adult.id && p.partner !== adult.index && ageYears(p, 0) >= 20 && ageYears(p, 0) < 70)!;
  no(other, { kind: "leave", inDays: 5 }, leaving, "village-leave-cap");
  const yesterday = [change({ person: adult.id, kind: "leave", madeDay: -1, day: 5 })];
  const s2 = settlementAt(SEED, s.cell, VALLEY, 0, yesterday)!;
  const again = checkChange(s2, s2.people.find((p) => p.id === adult.id)!, 0, { kind: "leave", inDays: 5 }, yesterday);
  assert.deepEqual(again, { ok: false, reason: "already-leaving" });
  const stay = checkChange(s2, s2.people.find((p) => p.id === adult.id)!, 0, { kind: "stay" }, yesterday);
  assert.ok(stay.ok, "the one who decided to go cannot change their mind");
});

// ── the evening ─────────────────────────────────────────────────────────────────

test("C44: someone who has decided to go spends the evenings before it at the edge, looking out", () => {
  const s = villages(COAST, 3, "edge", 0)[0];
  const plan = villagePlan(s, SHORE, SHORE_SITE)!;
  const p = s.people.find((q) => present(s, q, 0) && ageYears(q, 0) >= 20 && ageYears(q, 0) < 60)!;
  const changes = [change({ person: p.id, kind: "leave", madeDay: 0, day: 6 })];
  const after = settlementAt(SEED, s.cell, COAST, 0, changes)!;
  assert.deepEqual(eveningOf(after, after.people.find((q) => q.id === p.id)!, 2, changes), { place: "edge", target: null });
  const plans = dayPlans(after, plan, 2, changes).plans;
  const mine = plans.find((d) => d.person === p.id)!;
  const evening = mine.stays.find((st) => st.t0 > 0.55 && st.t1 > 0.75)!;
  const fromCentre = Math.hypot(evening.at.x - plan.centre.x, evening.at.y - plan.centre.y);
  const arrival = Math.hypot(plan.arrival.x - plan.centre.x, plan.arrival.y - plan.centre.y);
  assert.ok(fromCentre > arrival - 1, `the evening is ${fromCentre.toFixed(0)} m from the green, inside the arrival point's ${arrival.toFixed(0)} m`);
  assert.equal(dayPlans(after, plan, 7, changes).plans.some((d) => d.person === p.id), false, "gone, and still walking about");
});

test("C44: looking after someone is at THEIR door in the evening", () => {
  let checked = 0;
  for (const s of villages(COAST, 10, "evening", 0)) {
    const plan = villagePlan(s, SHORE, SHORE_SITE);
    if (!plan) continue;
    for (const p of s.people.filter((q) => present(s, q, 0) && ageYears(q, 0) >= 20 && ageYears(q, 0) < 60)) {
      const elder = s.people.find((q) => q.id !== p.id && present(s, q, 0) && ageYears(q, 0) >= 65 && (p.parents?.includes(q.index) ?? false));
      if (!elder) continue;
      const v = checkChange(s, p, 0, { kind: "goal", goal: "look-after", target: elder.id }, []);
      if (!v.ok) continue;
      const changes = [change(v.change)];
      const { plans } = dayPlans(s, plan, 1, changes);
      const evening = plans.find((d) => d.person === p.id)!.stays.find((st) => st.t0 > 0.55 && st.t1 > 0.75)!;
      const theirs = residentsDoor(s, plan, elder.id, 1);
      const mine = residentsDoor(s, plan, p.id, 1);
      assert.ok(theirs, "the elder has no house");
      if (mine && Math.hypot(mine.x - theirs.x, mine.y - theirs.y) < 3) continue; // they live together
      assert.ok(Math.hypot(evening.at.x - theirs.x, evening.at.y - theirs.y) < 2, `${s.cell}: ${p.given} spends the evening ${Math.hypot(evening.at.x - theirs.x, evening.at.y - theirs.y).toFixed(1)} m from ${elder.given}'s door`);
      checked++;
      break;
    }
  }
  assert.ok(checked >= 2, `only ${checked} people looking after a parent who lives elsewhere`);
});

function residentsDoor(s: Settlement, plan: NonNullable<ReturnType<typeof villagePlan>>, id: string, day: number) {
  const r = residentsOn(s, plan, day).find((x) => x.person.id === id);
  return r ? doorOf(r.plot) : null;
}
