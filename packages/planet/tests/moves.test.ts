/**
 * Between villages (`lib/moves.ts`, the generator's arrivals and promised weddings, DECISIONS C53).
 *
 * THE TWO TESTS THAT MATTER: a village someone came to is, before the day they came, exactly the
 * village it was (L2, "the past does not move"); and nobody is two people — no id in two villages'
 * living at once, no child of a family that moved born twice.
 *
 * Run:  node --import tsx --test packages/planet/tests/moves.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { latLngToCell } from "h3-js";

import type { LifeChange } from "../lib/changes.js";
import { comingOn } from "../lib/events.js";
import { lives, present, temperamentOf } from "../lib/life.js";
import { MOVES, cellDistanceKm, couldMarry, homeChanges, mayCourt, metOn, moveChanges, nearCells, partyOf, visitChanges, weddingDays } from "../lib/moves.js";
import { dayPlans, whereabouts } from "../lib/schedule.js";
import { ageYears, census, settlementAt, type Person, type Settlement, type SettlementGeography } from "../lib/society.js";
import { residentsOn, villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.4, wooded: 0.3, mountain: 0.1, tradeAccess: 0.6 };
const GROUND: VillageGround = { heightAt: (x, y) => 12 + Math.sin(x / 40) + Math.cos(y / 50), standable: (x, y) => Math.hypot(x, y) < 900 };
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: null };
const DAY = 4960;

let seq = 0;
const ids = (cs: Omit<LifeChange, "id">[]): LifeChange[] => cs.map((c) => ({ id: `m${String(++seq).padStart(6, "0")}`, ...c }));

/** Two villages with people in them. */
function two(prefix: string): [Settlement, Settlement] {
  const out: Settlement[] = [];
  for (let i = 0; i < 200 && out.length < 2; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, GEO, DAY);
    if (s && s.people.filter((p) => present(s, p, DAY)).length >= 20) out.push(s);
  }
  assert.equal(out.length, 2);
  return [out[0], out[1]];
}
const here = (s: Settlement, day: number) => s.people.filter((p) => present(s, p, day));

/** Every fact about a person fixed at or before `day`. */
const fixedBy = (p: Person, day: number) => ({
  id: p.id,
  given: p.given,
  birthDay: p.birthDay,
  deathDay: p.deathDay,
  occupation: p.occupation,
  partnerDay: p.partnerDay !== null && p.partnerDay < day ? p.partnerDay : null,
});

test("C53: someone who goes arrives — the same person, with the life their own village gave them", () => {
  const [a, b] = two("mv1");
  const p = here(a, DAY).find((q) => q.partner === null && ageYears(q, DAY) > 20 && ageYears(q, DAY) < 40)!;
  assert.ok(p);
  const D = DAY + 3;
  const move = moveChanges(a, p, D, DAY, b.cell);
  const after = settlementAt(SEED, b.cell, GEO, D + 30, ids(move.there))!;
  const q = after.people.find((x) => x.id === p.id)!;
  assert.ok(q, "they never arrived");
  assert.deepEqual([q.given, q.family, q.sex, q.birthDay, q.deathDay], [p.given, p.family, p.sex, p.birthDay, p.deathDay]);
  assert.deepEqual([...temperamentOf(after, q)], [...temperamentOf(a, p)], "their temperament changed on the road");
  assert.equal(q.fromCell, a.cell);
  assert.ok(!present(after, q, D - 1) && present(after, q, D), "here before they came, or not when they came");
  assert.ok(lives(after).get(q.id)!.some((e) => e.kind === "arrived" && e.detail === `from:${a.cell}`));
  // And the village they left has them gone, to there.
  const left = settlementAt(SEED, a.cell, GEO, D + 30, ids(move.here))!;
  const gone = left.people.find((x) => x.id === p.id)!;
  assert.equal(gone.leftDay, D);
  assert.equal(gone.toCell, b.cell);
  // Nobody is two people: on any day they are present in exactly one of the two.
  for (const d of [D - 1, D, D + 10]) assert.equal(Number(present(left, gone, d)) + Number(present(after, q, d)), 1, `day ${d}: in ${present(left, gone, d) ? "both" : "neither"}`);
});

test("C53: the village someone came to is, before the day they came, exactly the village it was", () => {
  const [a, b] = two("mv2");
  const p = here(a, DAY).find((q) => q.partner === null && ageYears(q, DAY) > 20)!;
  const D = DAY + 5;
  const there = ids(moveChanges(a, p, D, DAY, b.cell).there);
  const seed = settlementAt(SEED, b.cell, GEO, D + 400)!;
  const changed = settlementAt(SEED, b.cell, GEO, D + 400, there)!;
  const byId = new Map(changed.people.map((x) => [x.id, x]));
  for (const x of seed.people.filter((x) => x.birthDay < D)) {
    const y = byId.get(x.id);
    assert.ok(y, `${x.given} (born before the day) is gone`);
    assert.deepEqual(fixedBy(y, D), fixedBy(x, D), `${x.given} changed before the day`);
  }
  // Generated to the day before, it is the seed's village field for field.
  assert.deepEqual(settlementAt(SEED, b.cell, GEO, D - 1, there), settlementAt(SEED, b.cell, GEO, D - 1));
  // And the prefix property holds with them in it: the village to a later day is the earlier one, extended.
  const short = settlementAt(SEED, b.cell, GEO, D + 100, there)!;
  for (const x of short.people.filter((x) => x.birthDay <= D + 100)) {
    const y = changed.people.find((z) => z.id === x.id);
    assert.ok(y && y.birthDay === x.birthDay && y.deathDay === x.deathDay, `${x.given}: a later horizon changed them`);
  }
});

test("C53: a family comes together, stays a family, and has its children still to come here — never twice", () => {
  const [a, b] = two("mv3");
  const p = here(a, DAY).find((q) => q.partner !== null && present(a, a.people[q.partner], DAY) && q.sex === "f" && ageYears(q, DAY) < 32 && q.children.some((i) => present(a, a.people[i], DAY) && ageYears(a.people[i], DAY) < 10))!;
  assert.ok(p, "no young mother with a small child");
  const D = DAY + 2;
  const party = partyOf(a, p, D);
  assert.ok(party.length >= 3);
  const there = ids(moveChanges(a, p, D, DAY, b.cell).there);
  const after = settlementAt(SEED, b.cell, GEO, D + 365 * 8, there)!;
  const mother = after.people.find((x) => x.id === p.id)!;
  const father = after.people[mother.partner!];
  assert.equal(father.id, a.people[p.partner!].id, "the couple did not come as a couple");
  assert.ok(mother.household >= 0 && mother.household === father.household);
  const kids = mother.children.map((i) => after.people[i]);
  for (const kid of party.filter((x) => x.parents !== null && x.id !== p.id && x.id !== father.id)) {
    assert.ok(kids.some((k) => k.id === kid.id), `${kid.given} did not come with their mother`);
  }
  // Children born here after they came: new people, none of them anyone in the village they left.
  const home = settlementAt(SEED, a.cell, GEO, D + 365 * 8, ids(moveChanges(a, p, D, DAY, b.cell).here))!;
  const homeIds = new Set(home.people.map((x) => x.id));
  const bornHere = kids.filter((k) => k.birthDay > D);
  for (const k of bornHere) assert.ok(!homeIds.has(k.id), `${k.given} was born in both villages`);
  const allIds = after.people.map((x) => x.id);
  assert.equal(new Set(allIds).size, allIds.length, "two people with one id");
  // The house they live in is drawn: they are residents with a plot.
  const plan = villagePlan(after, GROUND, SITE)!;
  assert.ok(residentsOn(after, plan, D + 1).some((r) => r.person.id === p.id), "the family that came has no house");
});

test("C53: someone on their own lodges — with the family of whoever they came to marry, or the quietest house", () => {
  const [a, b] = two("mv4");
  const p = here(a, DAY).find((q) => q.partner === null && ageYears(q, DAY) > 18 && ageYears(q, DAY) < 50)!;
  assert.ok(p, "nobody unmarried and grown");
  const D = DAY + 1;
  const after = settlementAt(SEED, b.cell, GEO, D + 1, ids(moveChanges(a, p, D, DAY, b.cell).there))!;
  const q = after.people.find((x) => x.id === p.id)!;
  assert.ok(q.bornInto >= 0, "lodging nowhere");
  const host = here(b, D).find((x) => x.partner !== null)!;
  const toMarry = settlementAt(SEED, b.cell, GEO, D + 1, ids(moveChanges(a, p, D, DAY, b.cell, host.id).there))!;
  const r = toMarry.people.find((x) => x.id === p.id)!;
  const hostHome = host.partnerDay !== null && host.partnerDay <= D ? host.household : host.bornInto;
  assert.equal(r.bornInto, hostHome, "they did not lodge with the family they came to");
});

test("C53: coming home — the same person, here again, in the house they grew up in", () => {
  const [a, b] = two("mv5");
  const p = here(a, DAY).find((q) => q.partner === null && ageYears(q, DAY) > 18 && ageYears(q, DAY) < 30 && q.bornInto >= 0)!;
  const D = DAY + 2;
  const go = moveChanges(a, p, D, DAY, b.cell);
  const inB = settlementAt(SEED, b.cell, GEO, D + 40, ids(go.there))!;
  const there = inB.people.find((x) => x.id === p.id)!;
  const R = D + 30;
  const back = homeChanges(inB, there, R, R)!;
  assert.ok(back, "nobody can go home who never came from anywhere");
  const homeAgain = settlementAt(SEED, a.cell, GEO, R + 10, ids([...go.here, ...back.there]))!;
  const me = homeAgain.people.find((x) => x.id === p.id)!;
  assert.ok(!present(homeAgain, me, R - 1) && present(homeAgain, me, R), "not home on the day they came home");
  assert.equal(me.backDay, R);
  assert.ok(lives(homeAgain).get(me.id)!.some((e) => e.kind === "came-home"));
  assert.ok(!census(homeAgain, R + 1).left.some((x) => x.id === me.id), "home, and still counted as gone");
  const plan = villagePlan(homeAgain, GROUND, SITE)!;
  const res = residentsOn(homeAgain, plan, R + 1).find((x) => x.person.id === me.id);
  assert.ok(res, "home, and no house to sleep in");
  // And gone from where they were.
  const goneFromB = settlementAt(SEED, b.cell, GEO, R + 10, ids([...go.there, ...back.here]))!;
  assert.ok(!present(goneFromB, goneFromB.people.find((x) => x.id === p.id)!, R));
});

test("C53: a marriage a stranger brought about — on its day, and nobody else meanwhile", () => {
  const [a, b] = two("mv6");
  // Two unmarried people, one in each village, who could marry.
  let pair: [Person, Person] | null = null;
  for (const x of here(a, DAY)) {
    if (!mayCourt(a, x, DAY)) continue;
    const y = here(b, DAY).find((z) => mayCourt(b, z, DAY) && couldMarry(x, z));
    if (y) {
      pair = [x, y];
      break;
    }
  }
  assert.ok(pair, "nobody in either village could marry anybody in the other");
  const [x, y] = pair;
  const { arrive, wedding } = weddingDays(DAY);
  assert.equal(wedding - DAY, MOVES.weddingNoticeDays);
  const move = moveChanges(a, x, arrive, DAY, b.cell, y.id);
  const changes = ids([...move.there, { person: x.id, kind: "pair", madeDay: DAY, day: wedding, target: y.id }]);
  const bAfter = settlementAt(SEED, b.cell, GEO, wedding + 365 * 3, changes)!;
  const X = bAfter.people.find((p) => p.id === x.id)!;
  const Y = bAfter.people.find((p) => p.id === y.id)!;
  assert.equal(X.partner, Y.index, "the wedding did not happen");
  assert.equal(X.partnerDay, wedding);
  assert.ok(!present(bAfter, X, arrive - 1) && present(bAfter, X, arrive));
  // Promised: between the word and the wedding, neither paired with anyone else (the seed may have had them).
  const before = settlementAt(SEED, b.cell, GEO, wedding - 1, changes)!;
  assert.equal(before.people.find((p) => p.id === y.id)!.partner, null, `${y.given} married someone else while promised`);
  // The village knows it is coming, a week ahead, built to the day (as a live village is).
  const today = settlementAt(SEED, b.cell, GEO, DAY + 1, changes)!;
  const news = comingOn(today, villagePlan(today, GROUND, SITE)!, DAY + 1, changes);
  assert.ok(news.some((c) => c.kind === "wedding" && c.about.includes(y.id)), `nobody in ${b.name} knows of the wedding: ${news.map((c) => c.words).join(" / ")}`);
  // Their children are born here, after the wedding.
  for (const i of X.children) assert.ok(bAfter.people[i].birthDay > wedding);
});

test("C53: who may court, and who could marry, are the generator's own rules", () => {
  const [a] = two("mv7");
  const married = here(a, DAY).find((p) => p.partner !== null && ageYears(p, DAY) < 45)!;
  const child = here(a, DAY).find((p) => ageYears(p, DAY) < 15)!;
  assert.equal(mayCourt(a, married, DAY), false, "a married person courted");
  assert.equal(mayCourt(a, child, DAY), false, "a child courted");
  const single = here(a, DAY).find((p) => p.partner === null && ageYears(p, DAY) > 20 && ageYears(p, DAY) < 40)!;
  assert.equal(mayCourt(a, single, DAY), true);
  assert.equal(mayCourt(a, single, DAY, ids([{ person: single.id, kind: "court", madeDay: DAY - 3, day: DAY - 3, target: "x", toCell: "y" }])), false, "courted two at once");
  assert.equal(couldMarry({ id: "a", sex: "f", birthDay: 0 }, { id: "b", sex: "f", birthDay: 0 }), false);
  assert.equal(couldMarry({ id: "a", sex: "f", birthDay: 0 }, { id: "b", sex: "m", birthDay: 365 * 13 }), false, "a thirteen-year gap");
  assert.equal(couldMarry({ id: "a", sex: "f", birthDay: 0 }, { id: "b", sex: "m", birthDay: 365 * 5 }), true);
});

test("C53: the villages round a village, nearest first, and how far", () => {
  const cell = latLngToCell(40, 10, 4);
  const near = nearCells(cell);
  assert.ok(near.length > 20);
  assert.ok(near.every((c, i) => i === 0 || c.ring >= near[i - 1].ring), "not nearest first");
  assert.ok(!near.some((c) => c.cell === cell));
  const d1 = cellDistanceKm(cell, near[0].cell, 6371);
  const d3 = cellDistanceKm(cell, near.at(-1)!.cell, 6371);
  assert.ok(d1 > 10 && d3 > d1, `${d1.toFixed(0)} km, ${d3.toFixed(0)} km`);
});

test("C53: someone promised is nobody else's — even someone the seed would have married to another that week", () => {
  let checked = 0;
  for (let i = 0; i < 40 && checked < 3; i++) {
    const b = settlementAt(SEED, `mv8-${i}`, GEO, DAY + 600);
    const a = settlementAt(SEED, `mv8-a-${i}`, GEO, DAY);
    if (!b || !a) continue;
    // Somebody here the seed pairs with a local in the coming year — chosen BY that local, who comes of
    // age that day (so they are the one the seed is asking about, and the promised one is the answer).
    const y = b.people.find(
      (p) =>
        p.partnerDay !== null &&
        p.partnerDay > DAY + 30 &&
        p.partnerDay < DAY + 500 &&
        !p.incomer &&
        p.birthDay + p.pairAgeDays < p.partnerDay - 10 &&
        present(b, p, p.partnerDay - 5) &&
        present(b, b.people[p.partner!], p.partnerDay - 5),
    );
    if (!y) continue;
    const P = y.partnerDay!;
    const x = here(a, P - 6).find((q) => q.partner === null && couldMarry(q, y) && ageYears(q, P) < 50);
    if (!x) continue;
    const word = P - 3;
    const { arrive, wedding } = weddingDays(word);
    const changes = ids([...moveChanges(a, x, arrive, word, b.cell, y.id).there, { person: x.id, kind: "pair", madeDay: word, day: wedding, target: y.id }]);
    const after = settlementAt(SEED, b.cell, GEO, DAY + 600, changes)!;
    const Y = after.people.find((p) => p.id === y.id)!;
    assert.equal(after.people[Y.partner!]?.id, x.id, `${y.given}, promised to ${x.given}, married ${after.people[Y.partner!]?.given} on day ${Y.partnerDay} instead`);
    checked++;
  }
  assert.ok(checked >= 1, "no village where someone pairs in the coming year with someone to court them");
});

test("C53: a visit to meet someone — there for the day, beside them on the green, home the next morning", () => {
  let checked = 0;
  for (let i = 0; i < 30 && checked < 2; i++) {
    const a = settlementAt(SEED, `mv9-a-${i}`, GEO, DAY);
    const b = settlementAt(SEED, `mv9-b-${i}`, GEO, DAY);
    if (!a || !b) continue;
    const x = here(a, DAY).find((q) => mayCourt(a, q, DAY));
    const y = x && here(b, DAY).find((q) => mayCourt(b, q, DAY) && couldMarry(x, q) && ageYears(q, DAY) < 68);
    if (!x || !y) continue;
    const V = DAY + 2;
    const visit = visitChanges(a, x, V, DAY, b.cell, y.id);
    const there = ids(visit.there);
    const inB = settlementAt(SEED, b.cell, GEO, V + 400, there)!;
    const X = inB.people.find((p) => p.id === x.id)!;
    assert.ok(!present(inB, X, V - 1) && present(inB, X, V) && !present(inB, X, V + 1), "a visit is not one day");
    assert.equal(X.partner, null, `${x.given} came to visit and married someone else`);
    const Y = inB.people.find((p) => p.id === y.id)!;
    const hostHome = Y.partnerDay !== null && Y.partnerDay <= V ? Y.household : Y.bornInto;
    assert.equal(X.bornInto, hostHome, "the visitor did not lodge with the family they came to see");
    // On the evening green, beside them.
    const plan = villagePlan(inB, GROUND, SITE)!;
    const { plans, boats, moorings } = dayPlans(inB, plan, V, there);
    const wx = whereabouts(plans.find((d) => d.person === x.id)!, 0.74, boats, moorings);
    const wy = whereabouts(plans.find((d) => d.person === y.id)!, 0.74, boats, moorings);
    assert.ok(wx.visible && wy.visible, "the visitor, or the one they came to meet, is not out on the evening of the visit");
    assert.ok(Math.hypot(wx.x - wy.x, wx.y - wy.y) < 2.5, `the visitor is ${Math.hypot(wx.x - wy.x, wx.y - wy.y).toFixed(1)} m from the one they came to meet`);
    // At home: away that day, back the next.
    const inA = settlementAt(SEED, a.cell, GEO, V + 10, ids(visit.here))!;
    const home = inA.people.find((p) => p.id === x.id)!;
    assert.ok(present(inA, home, V - 1) && !present(inA, home, V) && present(inA, home, V + 1), "not away on the day of the visit, or not home after");
    // And they have met, from the day after.
    assert.equal(metOn(there, x.id, y.id, V), null);
    assert.equal(metOn(there, x.id, y.id, V + 1), V);
    assert.equal(metOn(there, y.id, x.id, V + 1), V, "meeting is not both ways");
    checked++;
  }
  assert.ok(checked >= 1, "no two villages with two who could meet");
});
