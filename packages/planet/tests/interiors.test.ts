/**
 * Inside a house (`lib/interiors.ts`, `homeState` in `lib/schedule.ts`, DECISIONS C54).
 *
 * Run:  node --import tsx --test packages/planet/tests/interiors.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ROOM, roomOf, roomToLocal, roomHeading, type Room } from "../lib/interiors.js";
import { present } from "../lib/life.js";
import { dayPlans, doorOf, homeState } from "../lib/schedule.js";
import { ageYears, occupationOn, settlementAt, type Settlement, type SettlementGeography } from "../lib/society.js";
import { plotState, residentsOn, villagePlan, type Plot, type VillageGround, type VillagePlan, type VillageSite } from "../lib/village.js";

const SEED = "echo-planet-0001";
const GEO: SettlementGeography = { habitability: 0.92, arable: 0.7, coastal: 0.5, wooded: 0.3, mountain: 0.1, tradeAccess: 0.6 };
const GROUND: VillageGround = { heightAt: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37), standable: (x, y) => 14 - 0.03 * x + 1.5 * Math.sin(y / 37) > 0 && Math.hypot(x, y) < 900 };
const SITE: VillageSite = { origin: { x: 0, y: 0 }, shore: { x: 467, y: 0 } };
const DAY = 4960;

const villages: { s: Settlement; plan: VillagePlan }[] = [];
for (let i = 0; i < 40 && villages.length < 6; i++) {
  const s = settlementAt(SEED, `in-${i}`, GEO, DAY);
  const plan = s && villagePlan(s, GROUND, SITE);
  if (s && plan && s.people.filter((p) => present(s, p, DAY)).length > 20) villages.push({ s, plan });
}

/** Every lived-in house of the fixture, with a door and a hearth placed as a drawing might. */
const rooms: { s: Settlement; plan: VillagePlan; plot: Plot; room: Room }[] = [];
for (const { s, plan } of villages) {
  for (const plot of plan.plots) {
    if (plotState(s, plot, DAY) !== "lived") continue;
    const where = { door: ((plot.index * 37) % 7) / 7 - 0.5, hearth: plot.index % 2 === 0 ? plot.widthM / 2 - 0.8 : -(plot.widthM / 2 - 0.8) };
    rooms.push({ s, plan, plot, room: roomOf(s, plan, plot, DAY, where) });
  }
}

test("C54: everyone who sleeps in a house has a place in it — a bed, a seat; a couple share a bed; the smallest a cradle", () => {
  assert.ok(rooms.length > 20, `${rooms.length} houses`);
  let couples = 0;
  let cradles = 0;
  for (const { s, plan, plot, room } of rooms) {
    const living = residentsOn(s, plan, DAY).filter((r) => r.plot.index === plot.index && present(s, r.person, DAY)).map((r) => r.person);
    for (const p of living) {
      assert.ok(room.beds.has(p.id), `${p.given} has no bed in their own house`);
      assert.ok(room.seats.has(p.id), `${p.given} has no seat at their own table`);
      if (p.partner !== null && living.some((q) => q.index === p.partner) && p.sex === "f") {
        const a = room.beds.get(p.id)!;
        const b = room.beds.get(s.people[p.partner].id)!;
        assert.ok(Math.hypot(a.u - b.u, a.v - b.v) < 0.8, `${p.given} and ${s.people[p.partner].given} sleep apart`);
        couples++;
      }
    }
    if (living.some((p) => ageYears(p, DAY) < 4)) {
      assert.ok(room.items.some((i) => i.kind === "cradle"), "an infant with no cradle");
      cradles++;
    }
  }
  assert.ok(couples > 10 && cradles > 0, `${couples} couples, ${cradles} cradles`);
});

test("C54: the furniture stands inside the walls, nothing solid in anything else, and the doorway is clear", () => {
  for (const { plot, room } of rooms) {
    const solid = room.items.filter((i) => i.solid && i.turn === undefined);
    for (const i of room.items) {
      assert.ok(Math.abs(i.u) + i.du / 2 <= plot.depthM / 2 + 1e-6 && Math.abs(i.v) + i.dv / 2 <= plot.widthM / 2 + 1e-6, `${i.kind} pokes through the wall of house ${plot.index}`);
    }
    for (let a = 0; a < solid.length; a++) {
      for (let b = a + 1; b < solid.length; b++) {
        const x = solid[a];
        const y = solid[b];
        const ou = Math.min(x.u + x.du / 2, y.u + y.du / 2) - Math.max(x.u - x.du / 2, y.u - y.du / 2);
        const ov = Math.min(x.v + x.dv / 2, y.v + y.dv / 2) - Math.max(x.v - x.dv / 2, y.v - y.dv / 2);
        assert.ok(ou < 0.05 || ov < 0.05, `house ${plot.index}: the ${x.kind} and the ${y.kind} stand in each other`);
      }
    }
    // A metre inside the doorway is clear of anything solid.
    for (const i of solid) {
      const near = Math.abs(i.v - room.door.v) < i.dv / 2 + 0.5 && i.u + i.du / 2 > plot.depthM / 2 - ROOM.wallM - 1.0;
      assert.ok(!near, `house ${plot.index}: the ${i.kind} blocks the doorway`);
    }
  }
});

test("C54: a house with a trade keeps its tools by the door; a fire burns in every lived-in hearth", () => {
  let nets = 0;
  for (const { s, plan, plot, room } of rooms) {
    assert.ok(room.items.some((i) => i.kind === "fire"), `house ${plot.index}: a cold hearth with people in it`);
    const fishers = residentsOn(s, plan, DAY).filter((r) => r.plot.index === plot.index && occupationOn(r.person, DAY) === "fisher" && ageYears(r.person, DAY) >= 16);
    if (fishers.length) {
      assert.ok(room.items.some((i) => ["nets", "loom", "anvil", "wheel", "sacks", "tools"].includes(i.kind)), "a fisher's house with no nets or any trade's tools");
      nets++;
    }
  }
  assert.ok(nets > 0);
});

test("C54: an empty house is empty, and a forced door leaves its mark inside", () => {
  const { s, plan } = villages[0];
  const plot = plan.plots.find((p) => plotState(s, p, DAY) === "lived")!;
  const where = { door: 0.2, hearth: plot.widthM / 2 - 0.8 };
  const forced = roomOf(s, plan, plot, DAY, where, true);
  assert.ok(forced.items.some((i) => i.kind === "door-down"), "the door is not down inside a forced house");
  assert.ok(forced.items.some((i) => i.kind === "stool" && i.turn !== undefined), "nothing knocked over");
  for (const id of forced.beds.keys()) assert.ok(forced.wall.has(id), "someone of the house has nowhere to stand when the door is forced");
  const empty = villages.flatMap((v) => v.plan.plots.map((p) => ({ ...v, p }))).find((x) => plotState(x.s, x.p, DAY) === "empty");
  if (empty) {
    const room = roomOf(empty.s, empty.plan, empty.p, DAY, where);
    assert.ok(room.empty && room.beds.size === 0 && !room.items.some((i) => i.kind === "fire"));
  }
  assert.deepEqual(roomOf(s, plan, plot, DAY, where).items, roomOf(s, plan, plot, DAY, where).items, "a room is not the same twice");
});

test("C54: home, asleep, out or away, from the day plan", () => {
  let asleep = 0;
  let away = 0;
  let awayHome = 0;
  for (const { s, plan } of villages.slice(0, 3)) {
    const { plans } = dayPlans(s, plan, DAY);
    for (const { person, plot } of residentsOn(s, plan, DAY)) {
      const d = plans.find((x) => x.person === person.id);
      const door = doorOf(plot);
      // Before dawn and after the last of them goes in, everyone of the house is asleep at home.
      assert.equal(homeState(d, 0.08, door), "asleep", `${person.given} is not asleep at night`);
      if (homeState(d, 0.97, door) === "asleep") asleep++;
      // Out at mid-morning: out of doors, or away beyond the village — never asleep at home.
      const mid = homeState(d, 0.45, door);
      if (d) assert.notEqual(mid, "asleep", `${person.given} is asleep at mid-morning`);
      if (mid === "away") away++;
      if (mid === "away" && homeState(d, 0.08, door) === "asleep") awayHome++;
    }
  }
  assert.ok(asleep > 40, `only ${asleep} asleep before midnight`);
  assert.ok(away > 0 && awayHome === away, "nobody away by day, or away and not home by night");
});

test("C54: the room's frame is the drawing's: +u is the door, and a heading turns with the house", () => {
  const plot: Plot = { index: 0, x: 10, y: 20, facing: Math.PI / 2, widthM: 6, depthM: 5, storeys: 1, households: [] };
  const door = roomToLocal(plot, 2.5, 0);
  assert.ok(Math.abs(door.x - 10) < 1e-9 && Math.abs(door.y - 22.5) < 1e-9, "the door is not in front");
  const side = roomToLocal(plot, 0, 1);
  // The drawing's +z is the facing turned a quarter clockwise: facing north, that is east.
  assert.ok(Math.abs(side.x - 11) < 1e-9 && Math.abs(side.y - 20) < 1e-9, `+v is (${side.x}, ${side.y})`);
  assert.ok(Math.abs(roomHeading(plot, 0) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(roomHeading(plot, Math.PI / 2) - 0) < 1e-9, "a heading toward +v is not east");
});
