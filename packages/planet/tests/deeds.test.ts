/**
 * The village's things and what a stranger did to them (`lib/things.ts`, `lib/deeds.ts`, DECISIONS
 * C45): every thing listed once with whoever it belongs to, and who comes to know what was done.
 *
 * Run:  node --import tsx --test packages/planet/tests/deeds.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { verbsOf } from "../lib/affordances.js";
import { DEEDS, grievance, knownDeeds, witnessesOf, type Deed } from "../lib/deeds.js";
import { present } from "../lib/life.js";
import { dayPlans, whereabouts } from "../lib/schedule.js";
import { ageYears, settlementAt, type Person, type Settlement, type SettlementGeography } from "../lib/society.js";
import { villageThings } from "../lib/things.js";
import { residentsOn, villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const HILLS: SettlementGeography = { habitability: 0.7, arable: 0.35, coastal: 0.05, wooded: 0.3, mountain: 0.85, tradeAccess: 0.4 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const INLAND: VillageGround = { heightAt: (x, y) => 20 + 2 * Math.sin(x / 50) * Math.cos(y / 60), standable: (x, y) => Math.hypot(x, y) < 900 };
const INLAND_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: null };

function village(geo: SettlementGeography, ground: VillageGround, site: VillageSite, prefix: string, need: (s: Settlement) => boolean = () => true) {
  for (let i = 0; i < 300; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, geo, 0);
    const plan = s && villagePlan(s, ground, site);
    if (s && plan && s.people.filter((p) => present(s, p, 0)).length >= 20 && need(s)) return { s, plan };
  }
  throw new Error("no village");
}

let seq = 0;
const deed = (d: Partial<Deed> & Pick<Deed, "reading" | "weight" | "day" | "witnesses" | "owners">): Deed => ({
  id: `d${++seq}`,
  verb: "trample",
  kind: "field",
  thing: "field:0",
  thingName: "a field",
  hour: 0.4,
  ...d,
});

test("C45: every village thing is listed once, with a verb, a place and whoever it belongs to", () => {
  const { s, plan } = village(COAST, SHORE, SHORE_SITE, "things");
  const things = villageThings(s, plan, 0);
  assert.equal(new Set(things.map((t) => t.ref)).size, things.length, "two things share a reference");
  const kinds = new Set(things.map((t) => t.kind));
  for (const k of ["house", "field", "bench", "well", "grave"]) assert.ok(kinds.has(k), `no ${k} in a coastal village`);
  if (plan.dock) assert.ok(kinds.has("dock") && kinds.has("boat"), "a dock and no boats");
  for (const t of things) {
    assert.ok(verbsOf(t.kind).length > 0, `${t.ref}: nothing can be done to it`);
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
    for (const id of t.owners) assert.ok(present(s, s.people.find((p) => p.id === id)!, 0), `${t.ref}: belongs to someone not here`);
  }
  const lived = things.filter((t) => t.kind === "house");
  assert.ok(lived.every((t) => t.owners.length > 0), "a lived-in house that belongs to nobody");
});

test("C45: a village on metal-bearing ground has a mine, its miners work there, and it is the miners'", () => {
  const { s, plan } = village(HILLS, INLAND, INLAND_SITE, "mine", (v) => v.people.some((p) => present(v, p, 0) && p.occupation === "miner" && ageYears(p, 0) >= 20 && ageYears(p, 0) < 60));
  assert.ok(plan.mine, "hill country with miners and no mine");
  const mine = villageThings(s, plan, 0).find((t) => t.kind === "mine")!;
  assert.ok(mine.owners.length > 0);
  const { plans, boats, moorings } = dayPlans(s, plan, 0);
  const miner = s.people.find((p) => present(s, p, 0) && p.occupation === "miner" && ageYears(p, 0) >= 20 && ageYears(p, 0) < 60)!;
  const w = whereabouts(plans.find((d) => d.person === miner.id)!, 0.45, boats, moorings);
  const m = plan.mine!;
  assert.ok(Math.hypot(w.x - m.x, w.y - m.y) < 6, `a miner at mid-morning is ${Math.hypot(w.x - m.x, w.y - m.y).toFixed(0)} m from the mine`);
  // In FRONT of the mouth, the village's side: behind it is the rock, and a miner there is inside it.
  const front = (w.x - m.x) * Math.cos(m.heading) + (w.y - m.y) * Math.sin(m.heading);
  assert.ok(front > 1, `a miner stands ${front.toFixed(1)} m in front of the mouth — inside the hill`);
});

test("C45: a witness knows at once, the household the next morning, their family the day after — nobody else", () => {
  const { s } = village(COAST, SHORE, SHORE_SITE, "know");
  const here = s.people.filter((p) => present(s, p, 0) && ageYears(p, 0) >= 20);
  const owner = here.find((p) => p.partner !== null && present(s, s.people[p.partner], 0))!;
  const spouse = s.people[owner.partner!];
  const witness = here.find((p) => p.id !== owner.id && p.id !== spouse.id && p.partner !== owner.index)!;
  // Family as knownDeeds counts it: partner, parents, siblings, children.
  const family = (a: Person, b: Person) =>
    a.partner === b.index ||
    (a.parents ?? []).includes(b.index) ||
    (b.parents ?? []).includes(a.index) ||
    (a.parents !== null && b.parents !== null && a.parents[0] === b.parents[0]);
  const stranger = here.find((p) => ![owner.id, spouse.id, witness.id].includes(p.id) && !family(p, owner) && !family(p, witness))!;
  const d = deed({ reading: "harm", weight: 3, day: 10, witnesses: [witness.id], owners: [owner.id] });
  const how = (p: Person, day: number) => knownDeeds(s, p, [d], day)[0]?.how ?? null;
  assert.equal(how(witness, 10), "saw");
  assert.equal(how(owner, 10), null, "the household knew before they could have found it");
  assert.equal(how(owner, 11), "theirs");
  assert.equal(how(spouse, 11), null);
  assert.equal(how(spouse, 12), "heard");
  assert.equal(how(stranger, 40), null, "word went beyond family");
});

test("C45: a wrong done to your household is held against the stranger, until they make it good or a month passes", () => {
  const { s } = village(COAST, SHORE, SHORE_SITE, "grudge");
  const owner = s.people.find((p) => present(s, p, 0) && ageYears(p, 0) >= 20)!;
  const harm = deed({ reading: "harm", weight: 3, day: 10, witnesses: [], owners: [owner.id] });
  assert.equal(grievance(s, owner, [harm], 10), null, "a grievance before they knew");
  assert.equal(grievance(s, owner, [harm], 11)?.id, harm.id);
  const help = deed({ verb: "tend", reading: "help", weight: 2, day: 12, witnesses: [owner.id], owners: [owner.id] });
  assert.equal(grievance(s, owner, [harm, help], 13), null, "help did not make good");
  const small = deed({ verb: "peer-in", kind: "house", reading: "trespass", weight: 1, day: 10, witnesses: [owner.id], owners: [owner.id] });
  assert.equal(grievance(s, owner, [small], 11), null, "a glance in at a window is not a grievance");
  assert.equal(grievance(s, owner, [harm], 11 + DEEDS.grievanceDays), null, "a month on, still held");
});

test("C45: who saw it is who was out of doors and near, and forcing a door at night wakes the house", () => {
  const { s, plan } = village(COAST, SHORE, SHORE_SITE, "sight");
  const { plans, boats, moorings } = dayPlans(s, plan, 0);
  // Mid-morning, beside somebody who is out.
  const out = plans.map((d) => ({ d, w: whereabouts(d, 0.45, boats, moorings) })).find(({ w }) => w.visible && w.boat === null)!;
  const seen = witnessesOf(s, plan, 0, 0.45, { x: out.w.x + 3, y: out.w.y });
  const who = s.people.find((p) => p.id === out.d.person)!;
  if ((0 - who.birthDay) / 365 >= 8) assert.ok(seen.includes(who.id), "the person standing beside it did not see it");
  const far = witnessesOf(s, plan, 0, 0.45, { x: plan.centre.x + 5000, y: plan.centre.y });
  assert.deepEqual(far, [], "somebody saw an act five kilometres away");
  // Midnight, at a lived-in house: everyone is in bed, and the household hears the door.
  const { person, plot } = residentsOn(s, plan, 0).find((r) => ageYears(r.person, 0) >= 20)!;
  const night = witnessesOf(s, plan, 0, 0.02, { x: plot.x, y: plot.y }, [], `house:${plot.index}`);
  assert.ok(night.includes(person.id), "the household slept through their door being forced");
  assert.equal(witnessesOf(s, plan, 0, 0.02, { x: plot.x, y: plot.y }).length, 0, "somebody out of doors at midnight saw it");
});
