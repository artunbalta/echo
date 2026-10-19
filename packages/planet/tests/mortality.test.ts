/**
 * How people die from now on, and what a stranger can do about it (DECISIONS C66).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MORTALITY, fateOf, isAiling, isSeaDay, mendChance } from "../lib/mortality.js";
import { fateTurn, healerFor } from "../lib/fates.js";
import { settlementAt, type Person, type Settlement, type SettlementGeography } from "../lib/society.js";
import { present } from "../lib/life.js";
import { dayPlans, homeState, SCHEDULE } from "../lib/schedule.js";
import { comingOn } from "../lib/events.js";
import { residentsOn, villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";
import type { LifeChange } from "../lib/changes.js";

const SEED = "echo-planet-0001";
const FROM = MORTALITY.fromDay;
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.25, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const HORIZON = FROM + 365 * 6;

const farmer = () => "farmer";
const fisher = () => "fisher";

test("C66: the risk model lives as long as the drawn one did — one child in ten, adults about 67, nobody past 96, one fisher in nine lost at sea", () => {
  let child = 0;
  let sea = 0;
  const adult: number[] = [];
  const N = 12000;
  for (let i = 0; i < N; i++) {
    const birth = FROM + 1;
    const f = fateOf(`t/${i}`, birth, i % 2 ? fisher : farmer, Infinity);
    const years = (f.deathDay - birth) / 365;
    assert.ok(years > 0 && years <= MORTALITY.maxYears + 1e-9, `${years}`);
    if (years < 6) child++;
    else adult.push(years);
    if (i % 2 && f.cause === "sea") sea++;
    assert.ok(i % 2 || f.cause !== "sea", "a farmer lost at sea");
  }
  const mean = adult.reduce((a, b) => a + b, 0) / adult.length;
  assert.ok(child / N > 0.08 && child / N < 0.12, `child ${child / N}`);
  assert.ok(mean > 64 && mean < 70, `mean ${mean}`);
  assert.ok(sea / (N / 2) > 0.07 && sea / (N / 2) < 0.15, `sea ${sea / (N / 2)}`);
});

test("C66: the past does not move — a death drawn on or before the switch stands; every later one is decided after it, the same way every time", () => {
  assert.deepEqual(fateOf("p", 0, farmer, FROM), { deathDay: FROM, cause: null, ailingFrom: null, seaDay: null });
  assert.deepEqual(fateOf("p", 0, farmer, FROM - 400), { deathDay: FROM - 400, cause: null, ailingFrom: null, seaDay: null });
  for (let i = 0; i < 500; i++) {
    const birth = FROM - 365 * (i % 80);
    const f = fateOf(`q/${i}`, birth, farmer, FROM + 1);
    assert.ok(f.deathDay > FROM && f.cause !== null, JSON.stringify(f));
    assert.deepEqual(fateOf(`q/${i}`, birth, farmer, FROM + 99999), f, "decided by the drawn day, not by who they are");
    if (f.cause === "illness") assert.ok(f.ailingFrom! < f.deathDay && f.deathDay - f.ailingFrom! <= MORTALITY.ailingDays[1]);
  }
});

/** Someone whose death comes of a cause, from many, deterministically. */
function findFate(cause: "illness" | "sea", occ: () => string, ageAt = 40): { key: string; birth: number } {
  for (let i = 0; i < 20000; i++) {
    const birth = FROM - 365 * ageAt;
    if (fateOf(`f/${cause}/${i}`, birth, occ, Infinity).cause === cause) return { key: `f/${cause}/${i}`, birth };
  }
  throw new Error(`nobody dies of ${cause}`);
}

test("C66: kept ashore on the day, a fisher is not lost that year; any other day does nothing", () => {
  const { key, birth } = findFate("sea", fisher);
  const f = fateOf(key, birth, fisher, Infinity);
  assert.equal(f.seaDay, f.deathDay - 1);
  assert.deepEqual(fateOf(key, birth, fisher, Infinity, [{ kind: "ashore", day: f.seaDay! - 1 }]), f, "kept ashore the wrong day saved them");
  assert.deepEqual(fateOf(key, birth, fisher, Infinity, [{ kind: "tend", day: f.seaDay!, by: "healer" }]), f, "a healer saved them from the sea");
  const kept = fateOf(key, birth, fisher, Infinity, [{ kind: "ashore", day: f.seaDay! }]);
  assert.ok(kept.deathDay > f.deathDay + 300, "kept ashore, and lost anyway that year");
});

test("C66: tended while ill, a life may be turned — more often young, with a healer than herbs — and the years after are weighed the same", () => {
  let healed = 0;
  let herbed = 0;
  let tried = 0;
  for (let i = 0; i < 4000 && tried < 300; i++) {
    const birth = FROM - 365 * 30;
    const key = `m/${i}`;
    const f = fateOf(key, birth, farmer, Infinity);
    if (f.cause !== "illness" || (f.deathDay - birth) / 365 > 55) continue;
    tried++;
    const tend = (by: "healer" | "herbs", day = f.ailingFrom!) => fateOf(key, birth, farmer, Infinity, [{ kind: "tend", day, by }]);
    // Outside the illness, nothing.
    assert.deepEqual(tend("healer", f.ailingFrom! - 1), f);
    assert.deepEqual(tend("healer", f.deathDay), f);
    const h = tend("healer");
    if (h.deathDay !== f.deathDay) {
      healed++;
      assert.ok(h.deathDay > f.deathDay, "tended, and died sooner");
      // Saved, the years after are their own: tended any day of that illness, or with more besides
      // that touches nothing, the life runs the same.
      assert.deepEqual(fateOf(key, birth, farmer, Infinity, [{ kind: "tend", day: f.deathDay - 1, by: "healer" }]), h);
      assert.deepEqual(fateOf(key, birth, farmer, Infinity, [{ kind: "ashore", day: f.ailingFrom! }, { kind: "tend", day: f.ailingFrom!, by: "healer" }, { kind: "tend", day: 1, by: "herbs" }]), h);
    }
    if (tend("herbs").deathDay !== f.deathDay) herbed++;
  }
  assert.ok(tried >= 100, `${tried}`);
  const age = 45;
  assert.ok(Math.abs(healed / tried - mendChance(age, "healer")) < 0.2, `healed ${healed}/${tried}`);
  assert.ok(herbed < healed, `herbs ${herbed} did as well as a healer ${healed}`);
  assert.ok(mendChance(25, "healer") > mendChance(70, "healer") && mendChance(70, "healer") > mendChance(90, "healer"));
});

// ── in a village ────────────────────────────────────────────────────────────────

function coast(): { s: Settlement; plan: NonNullable<ReturnType<typeof villagePlan>> } {
  for (let i = 0; i < 200; i++) {
    const s = settlementAt(SEED, `fates-${i}`, COAST, HORIZON);
    if (!s) continue;
    const plan = villagePlan(s, SHORE, SITE);
    if (plan?.dock && s.people.some((p) => p.deathCause === "sea" && present(s, p, p.seaDay!)) && s.people.some((p) => p.deathCause === "illness" && p.ailingFrom! > FROM && present(s, p, p.ailingFrom!))) return { s, plan };
  }
  throw new Error("no coast village with both kinds of death ahead");
}

test("C66: in a village, every death after the switch is the model's, and the ill keep to their beds", () => {
  const { s, plan } = coast();
  for (const p of s.people) {
    if (p.deathDay <= FROM) assert.ok(p.deathCause == null, `${p.id}: a past death given a cause`);
    else if (p.birthDay <= FROM || p.deathDay > FROM) assert.ok(p.deathCause !== undefined);
  }
  const ill = s.people.find((p) => p.deathCause === "illness" && p.ailingFrom! > FROM && present(s, p, p.ailingFrom!))!;
  const day = ill.ailingFrom!;
  assert.equal(isAiling(ill, day), true);
  assert.equal(dayPlans(s, plan, day).plans.find((d) => d.person === ill.id), undefined, "the ill out of doors");
  assert.equal(homeState(undefined, 0.5, { x: 0, y: 0 }, true), "asleep");
  assert.ok(comingOn(s, plan, day).some((c) => c.kind === "ailing" && c.about[0] === ill.id && /is ill, and keeps to bed/.test(c.words)));
});

test("C66: a fisher's last day — out under a wrong sky, storm or none, and the boat does not turn for home; kept ashore, it stays in", () => {
  const { s, plan } = coast();
  const houseOf = (p: Person, day: number) => (p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto);
  // One with a boat of their own (a boatless fisher is lost off the rocks, and said to be).
  const lost = s.people.find((p) => p.deathCause === "sea" && present(s, p, p.seaDay!) && dayPlans(s, plan, p.seaDay!).moorings.some((m) => !m.ashore && m.household === houseOf(p, p.seaDay!)))!;
  assert.ok(lost, "no fisher with a boat lost at sea in six years");
  const day = lost.seaDay!;
  assert.equal(isSeaDay(lost, day), true);
  const house = houseOf(lost, day);
  const { boats, moorings } = dayPlans(s, plan, day);
  const i = moorings.findIndex((m) => !m.ashore && m.household === house);
  assert.ok(i >= 0 && boats[i] !== null, "the lost fisher's household has no boat out");
  assert.ok(boats[i]!.t[3] > 1, "the lost boat came home");
  const news = comingOn(s, plan, day - 1).find((c) => c.kind === "omen" && c.about[0] === lost.id);
  assert.ok(news && /tomorrow/.test(news.words), "nobody spoke of tomorrow's sky the evening before");
  assert.ok(comingOn(s, plan, day).some((c) => c.kind === "omen" && c.about[0] === lost.id));
  const ashore: LifeChange = { id: "c1", person: lost.id, kind: "ashore", madeDay: day - 1, day };
  // Kept ashore, they live past that day, and the boat stays in, in the village as rebuilt with it.
  const saved = settlementAt(SEED, s.cell, s.geography, HORIZON, [ashore])!;
  assert.equal(dayPlans(saved, plan, day, [ashore]).boats[i], null, "kept ashore, and out anyway");
  assert.equal(dayPlans(s, plan, day, [ashore]).boats[i], null, "out anyway, before the village was rebuilt");
  const again = saved.people.find((p) => p.id === lost.id)!;
  assert.ok(again.deathDay > lost.deathDay, "kept ashore and still lost");
  // And nobody else's life moved before that day.
  for (const p of s.people) {
    const q = saved.people.find((x) => x.id === p.id);
    if (p.birthDay < day && p.id !== lost.id && p.deathDay < day) assert.equal(q?.deathDay, p.deathDay);
  }
});

test("C66: when a stranger can meet it — the healer to a house where someone lies ill, herbs without one, a fisher kept ashore that morning or the evening before", () => {
  const { s, plan } = coast();
  const ill = s.people.find((p) => p.deathCause === "illness" && p.ailingFrom! > FROM && present(s, p, p.ailingFrom!))!;
  const day = ill.ailingFrom!;
  const plot = residentsOn(s, plan, day).find((r) => r.person.id === ill.id)?.plot;
  assert.ok(plot, "the ill have no house");
  {
    const herbs = fateTurn("leave-herbs", `house:${plot.index}`, s, plan, day, 0.5);
    assert.deepEqual([herbs?.person.id, herbs?.kind, herbs?.by, herbs?.day], [ill.id, "tend", "herbs", day]);
    const healer = fateTurn("fetch-healer", `house:${plot.index}`, s, plan, day, 0.5);
    assert.equal(healer === null, healerFor(s, day, ill.id) === null, "a healer fetched from nowhere");
    assert.equal(fateTurn("leave-herbs", `house:${plot.index}`, s, plan, ill.ailingFrom! - 1, 0.5), null, "herbs for someone not yet ill");
  }
  const lost = s.people.find((p) => p.deathCause === "sea" && present(s, p, p.seaDay!))!;
  const sea = lost.seaDay!;
  assert.equal(fateTurn("ask-ashore", `villager:${lost.id}`, s, plan, sea, SCHEDULE.wake)?.day, sea);
  assert.equal(fateTurn("ask-ashore", `villager:${lost.id}`, s, plan, sea - 1, 0.7)?.day, sea, "the evening before");
  assert.equal(fateTurn("ask-ashore", `villager:${lost.id}`, s, plan, sea, 0.5), null, "asked once the boat had gone");
  assert.equal(fateTurn("ask-ashore", `villager:${lost.id}`, s, plan, sea - 1, 0.3), null, "asked before anyone spoke of the sky");
  const other = s.people.find((p: Person) => p.id !== lost.id && present(s, p, sea) && p.occupation === "fisher");
  assert.ok(other, "one fisher in the village");
  assert.equal(fateTurn("ask-ashore", `villager:${other!.id}`, s, plan, sea, SCHEDULE.wake), null, "anyone kept ashore");
});
