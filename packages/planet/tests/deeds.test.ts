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
import { chatter, friendCircles, socialGraph, spread } from "../lib/social.js";
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

test("C45/C49: a small thing — the witness at once, the household the next morning, their family the day after, nobody else", () => {
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
  // A small thing (weight 1) goes no further than family; C49 lets weightier ones travel further.
  const d = deed({ verb: "peer-in", kind: "house", reading: "trespass", weight: 1, day: 10, witnesses: [witness.id], owners: [owner.id] });
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

// ── word travels (C49) ──────────────────────────────────────────────────────────

test("C49: a thing nobody forgets goes round the whole village in days; a thing that matters reaches friends", () => {
  const { s, plan } = village(COAST, SHORE, SHORE_SITE, "travel");
  const here = s.people.filter((p) => present(s, p, 0) && ageYears(p, 0) >= 16);
  const owner = here[0];
  const forced = deed({ verb: "force-door", kind: "house", reading: "trespass", weight: 3, day: 10, witnesses: [], owners: [owner.id] });
  const after = spread(s, forced, 18, plan);
  const reached = here.filter((p) => after.has(p.id)).length;
  assert.ok(reached / here.length > 0.8, `a forced door reached ${reached} of ${here.length} grown people in eight days`);
  // Each day further out, never all at once.
  const early = spread(s, forced, 11, plan);
  assert.ok(early.size < after.size, "the whole village knew the next morning");
  // A thing that matters (2) reaches a friend of the household, and not everybody.
  const graph = socialGraph(s, 12, plan);
  const friend = (graph.get(owner.id) ?? []).find((t) => t.kind === "friend");
  const helped = deed({ verb: "tend", reading: "help", weight: 2, day: 10, witnesses: [], owners: [owner.id] });
  const k = spread(s, helped, 30, plan);
  if (friend) assert.ok(k.has(friend.other), "a friend of the household never heard of the help");
  assert.ok(k.size < here.length, "a small kindness went round the whole village");
});

test("C49: friends stand together on the green in the evening", () => {
  let pairs = 0;
  let close = 0;
  for (let i = 0; i < 40 && pairs < 30; i++) {
    const s = settlementAt(SEED, `circle-${i}`, COAST, 0);
    const plan = s && villagePlan(s, SHORE, SHORE_SITE);
    if (!s || !plan) continue;
    const { plans, boats, moorings } = dayPlans(s, plan, 0);
    const at = new Map(plans.map((d) => [d.person, whereabouts(d, 0.72, boats, moorings)]));
    // Grown people under the bench age are the ones who gather on the green; children play and the old sit.
    const grown = new Set(s.people.filter((p) => ageYears(p, 0) >= 13 && ageYears(p, 0) < 68).map((p) => p.id));
    for (const [id, ties] of socialGraph(s, 0)) {
      if (!grown.has(id)) continue;
      for (const t of ties) {
        if (t.kind !== "friend" || id > t.other || !grown.has(t.other)) continue;
        const a = at.get(id);
        const b = at.get(t.other);
        if (!a?.visible || !b?.visible) continue;
        pairs++;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 3.5) close++;
      }
    }
  }
  assert.ok(pairs >= 10, `only ${pairs} friend pairs out on the green`);
  assert.ok(close / pairs > 0.6, `${close} of ${pairs} friends out in the evening are standing together`);
  void friendCircles;
});

test("C49: what two villagers say is the same for every passer-by, and the stranger's doings are in it once word has reached them", () => {
  const { s, plan } = village(COAST, SHORE, SHORE_SITE, "talkers");
  const here = s.people.filter((p) => present(s, p, 0) && ageYears(p, 0) >= 20);
  const [a, b] = here;
  const line = chatter(s, a, b, 5, 0.7, { weather: null });
  assert.equal(chatter(s, a, b, 5, 0.7, { weather: null }), line);
  const forced = deed({ verb: "force-door", kind: "house", thingName: "the Kost house", reading: "trespass", weight: 3, day: 5, witnesses: [a.id], owners: [] });
  let mentions = 0;
  for (let h = 0; h < 48; h++) if ((chatter(s, a, b, 6, h / 48, { weather: null, deeds: [forced], plan }) ?? "").includes("stranger")) mentions++;
  assert.ok(mentions > 5, `the day after seeing a door forced, ${a.given} spoke of the stranger ${mentions} times in 48 half-hours`);
  let unknowing = 0;
  const notYet = deed({ ...forced, witnesses: [], owners: [] });
  for (let h = 0; h < 48; h++) if ((chatter(s, a, b, 6, h / 48, { weather: null, deeds: [notYet], plan }) ?? "").includes("stranger")) unknowing++;
  assert.equal(unknowing, 0, "villagers spoke of a deed that had reached nobody");
});
