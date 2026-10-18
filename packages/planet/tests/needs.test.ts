/**
 * What a villager would ask a stranger for (`lib/needs.ts`, DECISIONS C50), and what meeting it does.
 *
 * Run:  node --import tsx --test packages/planet/tests/needs.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { verbOf } from "../lib/affordances.js";
import type { LifeChange } from "../lib/changes.js";
import { checkChange, eveningOf, goalsOf, helpDays } from "../lib/goals.js";
import { ITEMS } from "../lib/items.js";
import { present } from "../lib/life.js";
import { NEEDS, meets, metChange, needOf, needsOn, type Need } from "../lib/needs.js";
import { ageYears, occupationOn, settlementAt, type Person, type Settlement, type SettlementGeography } from "../lib/society.js";
import { villageThings, type WorldEffect } from "../lib/things.js";
import { villagePlan, type VillageGround, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const COAST: SettlementGeography = { habitability: 0.9, arable: 0.6, coastal: 0.95, wooded: 0.2, mountain: 0.05, tradeAccess: 0.7 };
const SHORE: VillageGround = {
  heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37),
  standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900,
};
const SHORE_SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const DAY = 4940;

function villages(n: number, prefix: string, day = DAY): Settlement[] {
  const out: Settlement[] = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const s = settlementAt(SEED, `${prefix}-${i}`, COAST, day);
    if (s && s.people.filter((p) => present(s, p, day)).length >= 25) out.push(s);
  }
  assert.equal(out.length, n);
  return out;
}

let seq = 0;
const change = (c: Omit<LifeChange, "id">): LifeChange => ({ id: `n${String(++seq).padStart(6, "0")}`, ...c });
const here = (s: Settlement, day: number) => s.people.filter((p) => present(s, p, day));

test("C50: about one person in four asks for something in a week, the same thing all week, and the same for everyone", () => {
  let asked = 0;
  let eligible = 0;
  let changedWeek = 0;
  for (const s of villages(8, "need")) {
    const plan = villagePlan(s, SHORE, SHORE_SITE);
    const week0 = Math.floor(DAY / NEEDS.weekDays) * NEEDS.weekDays;
    for (const p of here(s, week0)) {
      if (ageYears(p, week0) < NEEDS.minAgeYears) {
        assert.equal(needOf(s, plan, p, week0), null, "a small child asked a stranger for something");
        continue;
      }
      eligible++;
      const n = needOf(s, plan, p, week0);
      assert.deepEqual(needOf(s, plan, p, week0), n, "the same person asks for different things asked twice");
      if (!n) continue;
      asked++;
      for (let d = week0 + 1; d < week0 + NEEDS.weekDays; d++) {
        if (present(s, p, d)) assert.equal(needOf(s, plan, p, d)?.id, n.id, `${p.given} changed their mind on day ${d}`);
      }
      const next = needOf(s, plan, p, week0 + NEEDS.weekDays);
      if (next?.id !== n.id) changedWeek++;
      assert.ok(n.since <= week0 && n.until > week0);
    }
  }
  const share = asked / eligible;
  assert.ok(share > 0.17 && share < 0.4, `${asked} of ${eligible} ask for something (${share.toFixed(2)})`);
  assert.equal(changedWeek, asked, "a need carried over into the next week");
});

test("C50: every need is something the world has — an item that exists, or a verb the thing affords", () => {
  const kinds = new Set<string>();
  for (const s of villages(8, "need")) {
    const plan = villagePlan(s, SHORE, SHORE_SITE)!;
    for (let day = DAY; day < DAY + 70; day += 7) {
      const things = new Map(villageThings(s, plan, day).map((t) => [t.ref, t]));
      for (const n of needsOn(s, plan, day).values()) {
        assert.ok(!n.text.includes("{") && !n.text.includes("undefined"), n.text);
        if (n.item) {
          assert.ok(ITEMS[n.item], `asked for ${n.item}, which is not a thing`);
          kinds.add(`item:${n.item}`);
        } else {
          const t = things.get(n.thing!);
          assert.ok(t, `asked for help with ${n.thing}, which is not there`);
          assert.ok(verbOf(t.kind, n.verb!), `${n.verb} is not something a ${t.kind} affords`);
          kinds.add(`verb:${n.verb}`);
        }
      }
    }
  }
  for (const k of ["item:shell", "item:berries", "verb:tidy"]) assert.ok(kinds.has(k), `nobody ever needs ${k}: ${[...kinds].join(", ")}`);
});

test("C50: children ask for children's things", () => {
  let n = 0;
  for (const s of villages(8, "need")) {
    for (let day = DAY; day < DAY + 70; day += 7) {
      for (const [id, need] of needsOn(s, null, day)) {
        const p = s.people.find((q) => q.id === id)!;
        if (ageYears(p, day) >= 13) continue;
        assert.ok(["shell", "stone", "berries"].includes(need.item ?? ""), `a child of ${ageYears(p, day).toFixed(0)} asked for ${need.item ?? need.verb}`);
        n++;
      }
    }
  }
  assert.ok(n > 10, `only ${n} children's wants`);
});

test("C50: a need met is met for everyone, from that day and not before, and for nobody else", () => {
  const s = villages(1, "need")[0];
  const plan = villagePlan(s, SHORE, SHORE_SITE);
  const all = needsOn(s, plan, DAY);
  const [first, n] = [...all.entries()][0];
  const met = change(metChange(n, DAY));
  assert.equal(needOf(s, plan, s.people.find((p) => p.id === first)!, DAY, [met]), null, "the need was still there after it was met");
  assert.equal(needOf(s, plan, s.people.find((p) => p.id === first)!, DAY - 1, [met])?.id, n.id, "meeting it today met it yesterday");
  const after = needsOn(s, plan, DAY, [met]);
  assert.equal(after.size, all.size - 1);
  for (const [id, other] of after) assert.deepEqual(other, all.get(id), "meeting one villager's need changed another's");
});

test("C50: a met need is not a decision — the village and its people are the seed's, and the day's decision is still to make", () => {
  const s = villages(1, "need")[0];
  // Somebody of an age to decide on a house of their own, so the day's decision can be tried.
  const n = [...needsOn(s, null, DAY).values()].find((x) => {
    const a = ageYears(s.people.find((q) => q.id === x.person)!, DAY);
    return a >= 18 && a < 55 && !goalsOf(s, s.people.find((q) => q.id === x.person)!, DAY, []).active.some((g) => g.kind === "own-house");
  })!;
  assert.ok(n, "nobody of an age to want a house has a need");
  const met = change(metChange(n, DAY));
  const again = settlementAt(SEED, s.cell, COAST, DAY + 30, [met])!;
  const seedOnly = settlementAt(SEED, s.cell, COAST, DAY + 30)!;
  assert.deepEqual(
    again.people.map((p) => [p.id, p.leftDay, p.deathDay]),
    seedOnly.people.map((p) => [p.id, p.leftDay, p.deathDay]),
    "a met need moved someone's life",
  );
  const p = s.people.find((q) => q.id === n.person)!;
  const v = checkChange(s, p, DAY, { kind: "goal", goal: "own-house" }, [met]);
  assert.ok(v.ok, `being helped used up the day's decision (${v.ok ? "" : v.reason})`);
});

test("C50: an act meets a need when it is the thing needed, done to them or theirs", () => {
  const item: Need = { id: "a/1/shell", person: "a", item: "shell", text: "", since: 7, until: 14 };
  assert.ok(meets(item, { verb: "give", thing: "villager:a", item: "shell", toPerson: "a", owners: ["a", "b"] }));
  assert.ok(meets(item, { verb: "give", thing: "house:3", item: "shell", owners: ["a", "b"] }), "a shell left at her door did not count");
  assert.ok(!meets(item, { verb: "give", thing: "villager:b", item: "shell", toPerson: "b", owners: ["b", "a"] }), "a shell given to her brother counted as given to her");
  assert.ok(!meets(item, { verb: "give", thing: "villager:a", item: "stone", toPerson: "a", owners: ["a"] }), "a stone counted as a shell");
  assert.ok(!meets(item, { verb: "tend", thing: "field:0", owners: ["a"] }));
  const field: Need = { id: "a/e1/field", person: "a", verb: "tend", thing: "field:2", text: "", since: 7, until: 10 };
  assert.ok(meets(field, { verb: "tend", thing: "field:2", owners: ["a"] }));
  assert.ok(!meets(field, { verb: "tend", thing: "field:1", owners: ["a"] }), "weeding the wrong field put this one right");
  assert.ok(!meets(field, { verb: "trample", thing: "field:2", owners: ["a"] }), "trampling it again put it right");
});

test("C50: a trampled field is its household's need until it is weeded", () => {
  let checked = 0;
  for (const s of villages(8, "need")) {
    const plan = villagePlan(s, SHORE, SHORE_SITE)!;
    const field = villageThings(s, plan, DAY).find((t) => t.kind === "field" && t.owners.some((o) => ageYears(s.people.find((p) => p.id === o)!, DAY) >= 16));
    if (!field) continue;
    const trampled: WorldEffect = { id: "e1", thing: field.ref, kind: "trampled", day: DAY, untilDay: DAY + 3 };
    const owner = s.people.find((p) => p.id === field.owners.find((o) => ageYears(s.people.find((q) => q.id === o)!, DAY) >= 16))!;
    const n = needOf(s, plan, owner, DAY, [], [trampled]);
    assert.equal(n?.verb, "tend", `${owner.given}'s trampled field is not on their mind`);
    assert.equal(n?.thing, field.ref);
    // Met by somebody while the mark still stands (the weeding recorded, its mark not yet): put right.
    assert.equal(needOf(s, plan, owner, DAY, [change(metChange(n!, DAY))], [trampled])?.thing, undefined, "the field was put right and they still need it");
    const tended: WorldEffect = { id: "e2", thing: field.ref, kind: "tended", day: DAY, untilDay: DAY + 2 };
    assert.notEqual(needOf(s, plan, owner, DAY, [], [trampled, tended])?.verb, "tend", "the field was weeded and they still need it put right");
    assert.notEqual(needOf(s, plan, owner, DAY + 3, [], [trampled])?.thing, field.ref, "the field healed and they still need it put right");
    if (++checked >= 3) break;
  }
  assert.ok(checked >= 2, `only ${checked} fields`);
});

/** A fisher of working age who is building a boat (decided on `day`), with their changes. */
function boatBuilder(): { s: Settlement; p: Person; changes: LifeChange[] } {
  for (const s of villages(8, "need")) {
    for (const p of here(s, DAY)) {
      const a = ageYears(p, DAY);
      if (a < 20 || a > 50 || occupationOn(p, DAY) !== "fisher") continue;
      const v = checkChange(s, p, DAY, { kind: "goal", goal: "own-boat" }, []);
      if (v.ok) return { s, p, changes: [change(v.change)] };
    }
  }
  throw new Error("no boat builder");
}

test("C50: wood brought for a boat brings the boat nearer, and the boat is everyone's sooner", () => {
  const { s, p, changes } = boatBuilder();
  const done = (cs: LifeChange[]) => goalsOf(s, p, DAY + 1, cs).active.find((g) => g.kind === "own-boat")!.doneDay!;
  const before = done(changes);
  // A builder is short of wood most weeks: find the week they say so.
  let need: Need | null = null;
  let day = DAY;
  for (; day < DAY + 35 && !need; day++) {
    const n = needOf(s, null, p, day, changes);
    if (n?.goal?.kind === "own-boat") need = n;
  }
  assert.ok(need, "a boat builder never needed anything for the boat in five weeks");
  assert.equal(need!.item, "driftwood");
  const helped = [...changes, change(metChange(need!, day))];
  assert.equal(done(helped), before - helpDays("own-boat"), "the wood did not bring the boat any nearer");
  assert.equal(goalsOf(s, p, day + 1, helped).active.find((g) => g.kind === "own-boat")!.helped, 1);
  assert.ok(goalsOf(s, p, before - 1, helped).done.some((g) => g.kind === "own-boat"), "a day before it would have been built, it is not built");
});

test("C50: help with a wish begins it — the boat is under way, and the evenings go to the dock", () => {
  let checked = 0;
  for (const s of villages(8, "need")) {
    for (const p of here(s, DAY)) {
      const wish = goalsOf(s, p, DAY, []).active.find((g) => g.kind === "own-boat" && g.source === "seed");
      if (!wish) continue;
      const need: Need = { id: `${p.id}/x/goal:driftwood`, person: p.id, item: "driftwood", text: "", goal: { kind: "own-boat", target: null, occupation: null }, since: DAY, until: DAY + 7 };
      const helped = [change(metChange(need, DAY))];
      const g = goalsOf(s, p, DAY + 1, helped).active.find((x) => x.kind === "own-boat")!;
      assert.equal(g.source, "help", "help with a wish left it a wish");
      assert.equal(g.doneDay, DAY + 40 - helpDays("own-boat"));
      assert.deepEqual(eveningOf(s, p, DAY + 1, helped), { place: "dock", target: null }, "the boat is under way and nobody goes to the dock");
      assert.equal(eveningOf(s, p, DAY - 1, helped), null, "the help reached back before it was given");
      if (++checked >= 3) break;
    }
    if (checked >= 3) break;
  }
  assert.ok(checked >= 1, "nobody in eight villages wishes for a boat");
});

test("C50: one need a week — whoever was helped this week asks for nothing else until the next", () => {
  let checked = 0;
  for (const s of villages(8, "need")) {
    const plan = villagePlan(s, SHORE, SHORE_SITE);
    for (const [id, n] of needsOn(s, plan, DAY)) {
      const p = s.people.find((q) => q.id === id)!;
      const met = [change(metChange(n, DAY))];
      for (let d = DAY; d < n.until; d++) if (present(s, p, d)) assert.equal(needOf(s, plan, p, d, met), null, `${p.given} asked again on day ${d}, the week their need was met`);
      checked++;
    }
  }
  assert.ok(checked > 30, `only ${checked} needs`);
});
