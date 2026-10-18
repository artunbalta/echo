/**
 * A village's animals (`lib/animals.ts`, DECISIONS C55).
 *
 * Run:  node --import tsx --test packages/planet/tests/animals.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ANIMALS, animalAt, animalsOf, bondWith, type Animal } from "../lib/animals.js";
import type { Deed } from "../lib/deeds.js";
import { present } from "../lib/life.js";
import { dayPlans, whereabouts } from "../lib/schedule.js";
import { ageYears, occupationOn, settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { residentsOn, villagePlan, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.6, wooded: 0.3, mountain: 0.3, tradeAccess: 0.6 };
const GROUND: VillageGround = { heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37), standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900 };
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const DAY = 4960;

const villages: { s: Settlement; plan: VillagePlan; animals: Animal[] }[] = [];
for (let i = 0; i < 60 && villages.length < 10; i++) {
  const s = settlementAt(SEED, `an-${i}`, GEO, DAY);
  const plan = s && villagePlan(s, GROUND, SITE);
  if (s && plan && s.people.filter((p) => present(s, p, DAY)).length > 20) villages.push({ s, plan, animals: animalsOf(s, plan, DAY) });
}

test("C55: a herder's house keeps goats, some keep hens, some a dog; a village has its strays, its birds, and its fish off the dock", () => {
  let goats = 0;
  let herders = 0;
  for (const { s, plan, animals } of villages) {
    const homes = new Map<number, number[]>();
    for (const { person } of residentsOn(s, plan, DAY)) {
      const h = person.partnerDay !== null && person.partnerDay <= DAY ? person.household : person.bornInto;
      if (occupationOn(person, DAY) === "herder" && ageYears(person, DAY) >= 16) homes.set(h, [...(homes.get(h) ?? []), person.index]);
    }
    for (const h of homes.keys()) {
      herders++;
      assert.ok(animals.some((a) => a.kind === "goat" && a.household === h), `a herder's house ${h} with no goats`);
    }
    goats += animals.filter((a) => a.kind === "goat").length;
    for (const a of animals.filter((a) => a.kind === "goat")) assert.ok(homes.has(a.household!), "goats at a house with no herder");
    assert.ok(animals.filter((a) => a.id.startsWith("stray:")).length <= 2);
    assert.ok(animals.some((a) => a.kind === "bird"), "a village with no birds");
    assert.equal(animals.some((a) => a.kind === "fish"), plan.dock !== null, "fish where there is no dock, or none where there is");
    assert.deepEqual(animalsOf(s, plan, DAY).map((a) => a.id), animals.map((a) => a.id), "the animals are not the same twice");
  }
  assert.ok(herders > 0 && goats > herders * 3, `${goats} goats for ${herders} herders`);
  const dogs = villages.flatMap((v) => v.animals.filter((a) => a.kind === "dog" && a.household !== null));
  const houses = villages.reduce((n, v) => n + new Set(residentsOn(v.s, v.plan, DAY).map((r) => r.plot.index)).size, 0);
  assert.ok(dogs.length / houses > 0.15 && dogs.length / houses < 0.45, `${dogs.length} dogs in ${houses} houses`);
  assert.ok(dogs.every((d) => d.name && d.follows), "a dog with no name or nobody to follow");
  for (const { animals } of villages) {
    const names = animals.filter((a) => a.kind === "dog").map((a) => a.name);
    assert.equal(new Set(names).size, names.length, `two dogs of one village share a name: ${names.join(", ")}`);
  }
});

test("C55: the herd is on the pasture by day and in its pen at night; hens are shut in after dark", () => {
  for (const { animals } of villages) {
    for (const a of animals.filter((x) => x.kind === "goat")) {
      const noon = animalAt(a, 0.5);
      assert.ok(Math.hypot(noon.x - a.range.x, noon.y - a.range.y) <= a.radiusM + 1e-6, `${a.id} wandered off the pasture`);
      const night = animalAt(a, 0.1);
      assert.equal(night.activity, "lie");
      assert.ok(Math.hypot(night.x - a.home.x, night.y - a.home.y) < 1e-6, `${a.id} is not in its pen at night`);
    }
    for (const a of animals.filter((x) => x.kind === "hen")) {
      assert.equal(animalAt(a, 0.05).activity, "hidden", `${a.id} is out at night`);
      const day = animalAt(a, 0.5);
      assert.ok(Math.hypot(day.x - a.home.x, day.y - a.home.y) <= a.radiusM + 1e-6);
    }
    for (const a of animals.filter((x) => x.kind === "bird")) assert.ok(animalAt(a, 0.5).z > 5, `${a.id} flies along the ground`);
  }
});

test("C55: a dog goes a step behind its person while they are out, and lies on the step while they are in", () => {
  let out = 0;
  let home = 0;
  for (const { s, plan, animals } of villages.slice(0, 5)) {
    const { plans, boats, moorings } = dayPlans(s, plan, DAY);
    for (const dog of animals.filter((a) => a.kind === "dog" && a.follows)) {
      const d = plans.find((x) => x.person === dog.follows);
      for (const t of [0.1, 0.45, 0.7]) {
        const w = d ? whereabouts(d, t, boats, moorings) : null;
        const at = animalAt(dog, t, () => w);
        if (w && w.visible && w.boat === null) {
          assert.ok(Math.hypot(at.x - w.x, at.y - w.y) < 1.5, `${dog.name} is ${Math.hypot(at.x - w.x, at.y - w.y).toFixed(1)} m from its person`);
          out++;
        } else {
          assert.equal(at.activity, "lie");
          home++;
        }
      }
    }
  }
  assert.ok(out > 3 && home > 3, `out ${out}, home ${home}`);
});

test("C55: where an animal is, is the hour's: the same for anyone who asks", () => {
  const a = villages[0].animals[0];
  for (const t of [0.2, 0.31, 0.5, 0.77]) assert.deepEqual(animalAt(a, t), animalAt(a, t));
});

test("C55: a bond is what a stranger has done for a dog, over days — and shooing it takes some back", () => {
  const deed = (verb: string, day: number): Deed => ({ id: `d${verb}${day}`, verb, kind: "dog", thing: "animal:stray:0", thingName: "Moss", reading: "kindness", weight: 1, day, hour: 0.5, witnesses: [], owners: [] });
  assert.equal(bondWith([], "stray:0", 100), 0);
  const one = bondWith([deed("stroke", 100)], "stray:0", 100);
  const sameDay = bondWith([deed("stroke", 100), deed("feed", 100), deed("play", 100)], "stray:0", 100);
  const days = bondWith([deed("stroke", 98), deed("feed", 99), deed("play", 100)], "stray:0", 100);
  assert.ok(one > 0 && sameDay > one && days > sameDay, `${one} ${sameDay} ${days}`);
  assert.ok(days >= ANIMALS.follows, "three kind days and the dog still does not follow");
  assert.ok(sameDay < ANIMALS.follows, "one afternoon is enough to make a dog yours");
  assert.ok(bondWith([deed("stroke", 98), deed("feed", 99), deed("play", 100), deed("shoo", 100)], "stray:0", 100) < days);
  assert.equal(bondWith([deed("stroke", 1)], "stray:0", 1 + ANIMALS.bondDays + 1), 0, "a bond never forgotten");
  assert.equal(bondWith([deed("stroke", 100)], "dog:4", 100), 0, "a bond with the wrong dog");
});
